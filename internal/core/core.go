// Package core is the single orchestration entry point: incoming share →
// recognize → fetch → analyze → store cards → notify channel. It consumes
// the pinned port.Store / port.Channel interfaces, capture.Fetcher and the
// analyze/research clients; no HTTP, no Telegram, no persistence decisions.
package core

import (
	"context"
	"errors"
	"log"
	"strings"
	"sync"

	"sparkkeep/internal/analyze"
	"sparkkeep/internal/capture"
	"sparkkeep/internal/config"
	"sparkkeep/internal/port"
	"sparkkeep/internal/research"
)

// Service wires the pipeline together. Channel is left nil until the
// channel adapter attaches it (web/main wiring); a nil Channel is a no-op
// in Notify.
type Service struct {
	Store   port.Store
	Channel port.Channel
	Fetcher capture.Fetcher // recognize+fetch (field named Fetcher: Capture collided with the method)
	Analyze *analyze.Client
	Runner  *research.Runner // field named Runner: Research collided with the method
	Logf    func(format string, args ...any)
	WG      sync.WaitGroup
	Ctx     context.Context
}

// GoResearch runs Research in a background goroutine tracked by s.WG.
func (s *Service) GoResearch(ctx context.Context, cardID int64) {
	bgCtx := ctx
	if bgCtx == nil {
		bgCtx = s.Ctx
	}
	if bgCtx == nil {
		bgCtx = context.Background()
	}
	s.WG.Add(1)
	go func() {
		defer s.WG.Done()
		if err := s.Research(bgCtx, cardID); err != nil && !errors.Is(err, port.ErrResearchActive) {
			s.Logf("core: background research %d: %v", cardID, err)
		}
	}()
}

// New constructs a Service with the default capture adapter, an analyze
// client and research runner for cfg, and logf (default log.Printf).
func New(st port.Store, cfg config.Config, logf func(format string, args ...any)) *Service {
	llm := analyze.New(cfg, nil)
	s := &Service{
		Store: st,
		Fetcher: capture.Capture{
			HeadlessEnabled: cfg.HeadlessEnabled,
			ChromeBin:       cfg.ChromeBin,
			YtDlpBin:        cfg.YtDlpBin,
		},
		Analyze: llm,
		Runner:  research.New(cfg, llm),
		Logf:    logf,
	}
	if s.Logf == nil {
		s.Logf = log.Printf
	}
	return s
}

// Capture runs the full pipeline for an incoming share and returns the ids
// of the created cards. It never breaks on an LLM failure: the failure
// degrades into a stored "Analysis failed" card so the source + retry
// button survive. All cards are stored even if a later notify fails.
func (s *Service) Capture(ctx context.Context, raw string) ([]int64, error) {
	share := s.Fetcher.Recognize(raw)
	if share.Kind == capture.KindLink && strings.TrimSpace(share.URL) != "" {
		if existing, err := s.Store.GetCardBySourceURL(ctx, share.URL); err == nil {
			if nerr := s.notify(ctx, port.Notification{Kind: "duplicate", Card: existing, Text: "Already captured: " + existing.Title}); nerr != nil {
				s.Logf("core: notify duplicate: %v", nerr)
			}
			return []int64{}, nil
		} else if !errors.Is(err, port.ErrNotFound) {
			return nil, err
		}
	}

	fetched := s.fetchContent(share)

	res, err := s.Analyze.Analyze(ctx, fetched)
	if err != nil {
		return s.failCard(ctx, fetched, raw)
	}
	if len(res.Cards) == 0 {
		return []int64{}, nil
	}

	var ids []int64
	for _, idea := range res.Cards {
		execSummary := idea.ExecutiveSummary
		if execSummary == "" {
			execSummary = res.ExecutiveSummary
		}
		valProp := idea.ValueProposition
		if valProp == "" {
			valProp = res.ValueProposition
		}
		actions := idea.ProposedActions
		if len(actions) == 0 {
			actions = res.ProposedActions
		}

		card := port.Card{
			Title:            idea.Title,
			Summary:          idea.Summary,
			Horizon:          idea.Horizon,
			Tags:             idea.Tags,
			SourceURL:        firstURL(fetched, idea.Links),
			SourceNote:       fetched.Caption,
			Status:           port.StatusInbox,
			ExecutiveSummary: execSummary,
			ValueProposition: valProp,
			ProposedActions:  actions,
		}
		created, err := s.Store.CreateCard(ctx, card)
		if err != nil {
			return ids, err
		}
		ids = append(ids, created.ID)
		if err := s.notify(ctx, port.Notification{Kind: "created", Card: created}); err != nil {
			s.Logf("core: notify created card %d: %v", created.ID, err)
		}
	}
	return ids, nil
}

// Research stores a 'queued' research row, runs the bounded research
// pipeline, persists the outcome and notifies. Any run failure marks the
// row 'failed' and notifies research_failed; it never panics.
func (s *Service) Research(ctx context.Context, cardID int64) error {
	card, err := s.Store.GetCard(ctx, cardID)
	if err != nil {
		return err
	}
	if active, err := s.Store.HasActiveResearch(ctx, cardID); err != nil {
		return err
	} else if active {
		return port.ErrResearchActive
	}
	row, err := s.Store.CreateResearch(ctx, cardID, "")
	if err != nil {
		return err
	}
	findings, err := s.Runner.Run(ctx, card)
	if err != nil {
		row, rerr := s.Store.SetResearch(ctx, row.ID, "failed", "", err.Error())
		if rerr != nil {
			return rerr
		}
		if nerr := s.notify(ctx, port.Notification{Kind: "research_failed", Res: &row, Text: err.Error()}); nerr != nil {
			s.Logf("core: notify research_failed: %v", nerr)
		}
		return err
	}
	row, err = s.Store.SetResearch(ctx, row.ID, "done", findings, "")
	if err != nil {
		return err
	}
	if nerr := s.notify(ctx, port.Notification{Kind: "research_done", Res: &row, Text: "Research complete"}); nerr != nil {
		s.Logf("core: notify research_done: %v", nerr)
	}
	return nil
}

// Retry re-runs Analyze on a card's saved source and stores the first idea
// as the retried card. port.CardPatch cannot rewrite Title/Summary, so the
// re-analyzed idea is persisted as a fresh card row (retry supersedes the
// failed card); on analysis failure the original card is kept and the error
// returned.
func (s *Service) Retry(ctx context.Context, cardID int64) (port.Card, error) {
	card, err := s.Store.GetCard(ctx, cardID)
	if err != nil {
		return port.Card{}, err
	}
	fetched := capture.Fetched{
		URL:     card.SourceURL,
		Title:   card.Title,
		Caption: card.SourceNote,
	}
	res, err := s.Analyze.Analyze(ctx, fetched)
	if err != nil {
		return card, err
	}
	if len(res.Cards) == 0 {
		return card, nil
	}
	idea := res.Cards[0]
	execSummary := idea.ExecutiveSummary
	if execSummary == "" {
		execSummary = res.ExecutiveSummary
	}
	valProp := idea.ValueProposition
	if valProp == "" {
		valProp = res.ValueProposition
	}
	actions := idea.ProposedActions
	if len(actions) == 0 {
		actions = res.ProposedActions
	}

	created, err := s.Store.CreateCard(ctx, port.Card{
		Title:            idea.Title,
		Summary:          idea.Summary,
		Horizon:          idea.Horizon,
		Tags:             idea.Tags,
		SourceURL:        card.SourceURL,
		SourceNote:       card.SourceNote,
		Status:           port.StatusInbox,
		ExecutiveSummary: execSummary,
		ValueProposition: valProp,
		ProposedActions:  actions,
	})
	if err != nil {
		return port.Card{}, err
	}
	dismissed := port.StatusDismissed
	if _, err := s.Store.UpdateCard(ctx, cardID, port.CardPatch{Status: &dismissed}); err != nil {
		s.Logf("core: dismiss original failed card %d: %v", cardID, err)
	}
	if nerr := s.notify(ctx, port.Notification{Kind: "done", Card: created}); nerr != nil {
		s.Logf("core: notify retry done: %v", nerr)
	}
	return created, nil
}

// failCard stores the "analysis failed, see source / retry" card. It is the
// LLM-failure degradation path and never returns a hard error to Capture.
func (s *Service) failCard(ctx context.Context, fetched capture.Fetched, raw string) ([]int64, error) {
	card := port.Card{
		Title:      "Analysis failed",
		Summary:    "Analysis failed, see source.",
		Status:     port.StatusInbox,
		SourceURL:  fetched.URL,
		SourceNote: raw,
	}
	created, err := s.Store.CreateCard(ctx, card)
	if err != nil {
		return nil, err
	}
	if nerr := s.notify(ctx, port.Notification{Kind: "analysis_failed", Card: created}); nerr != nil {
		s.Logf("core: notify analysis_failed: %v", nerr)
	}
	return []int64{created.ID}, nil
}

// fetchContent implements the capture branch: links get media metadata and
// fall back to a plain fetch when the metadata came back empty; text shares
// go straight through Fetch (which returns just the caption).
func (s *Service) fetchContent(share capture.Share) capture.Fetched {
	var f capture.Fetched
	switch share.Kind {
	case capture.KindLink:
		f = s.Fetcher.MediaMeta(share)
		if strings.TrimSpace(f.Description) == "" && strings.TrimSpace(f.Text) == "" {
			if fetched := s.Fetcher.Fetch(share); fetched.Err == nil {
				f = mergeFetched(f, fetched)
			}
		}
	case capture.KindText:
		f = s.Fetcher.Fetch(share)
	}
	if f.Caption == "" {
		f.Caption = share.Caption
	}
	return f
}

// mergeFetched copies non-empty fields of b into a (URL, title, description,
// text, caption). Used to layer a plain fetch over empty media metadata.
func mergeFetched(a, b capture.Fetched) capture.Fetched {
	if b.URL != "" {
		a.URL = b.URL
	}
	if b.Title != "" {
		a.Title = b.Title
	}
	if b.Description != "" {
		a.Description = b.Description
	}
	if b.Text != "" {
		a.Text = b.Text
	}
	if b.Caption != "" {
		a.Caption = b.Caption
	}
	return a
}

// firstURL is the card's SourceURL: the fetched URL, else the first idea
// link the model reported.
func firstURL(fetched capture.Fetched, links []string) string {
	if fetched.URL != "" {
		return fetched.URL
	}
	for _, l := range links {
		if strings.TrimSpace(l) != "" {
			return l
		}
	}
	return ""
}

// notify is a nil-safe Notify so a Service without an attached channel is a
// no-op instead of a panic.
func (s *Service) notify(ctx context.Context, n port.Notification) error {
	if s.Channel == nil {
		return nil
	}
	return s.Channel.Notify(ctx, n)
}
