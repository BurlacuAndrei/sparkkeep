// Package core is the single orchestration entry point: incoming share →
// recognize → fetch → analyze → store cards → notify channel. It consumes
// the pinned port.Store / port.Channel interfaces, capture.Fetcher and the
// analyze/research clients; no HTTP, no Telegram, no persistence decisions.
package core

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"sparkkeep/internal/analyze"
	"sparkkeep/internal/asr"
	"sparkkeep/internal/capture"
	"sparkkeep/internal/config"
	"sparkkeep/internal/license"
	"sparkkeep/internal/port"
	"sparkkeep/internal/research"
	"sparkkeep/internal/webhook"
)

// Describer reads an image and returns a text digest. Satisfied by
// *analyze.Client.
type Describer interface {
	Describe(ctx context.Context, img capture.File, hint string) (string, error)
}

// Transcriber turns audio into text. Satisfied by *asr.Client.
type Transcriber interface {
	Transcribe(ctx context.Context, f capture.File) (string, error)
}

var (
	tagStripRe    = regexp.MustCompile(`<[^>]*>`)
	scriptStyleRe = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>|<style[^>]*>.*?</style>`)
)

// Service wires the pipeline together. Channel is left nil until the
// channel adapter attaches it (web/main wiring); a nil Channel is a no-op
// in Notify.
type Service struct {
	Store             port.Store
	Channel           port.Channel
	Fetcher           capture.Fetcher // recognize+fetch (field named Fetcher: Capture collided with the method)
	Analyze           *analyze.Client
	Vision            Describer           // nil disables image digests
	ASR               Transcriber         // nil disables transcription
	Runner            *research.Runner    // field named Runner: Research collided with the method
	Router            *analyze.Router     // per-role LLM routing
	UploadDir         string              // "" disables upload retention
	UploadMaxAgeDays  int                 // 0 disables age-based cleanup
	UploadMaxSizeMB   int                 // 0 disables size-based cleanup
	FFmpegBin         string              // "" disables video audio extraction
	License           *license.Manager    // offline Tier/capability manager
	Webhook           *webhook.Dispatcher // outbound webhook dispatcher
	Logf              func(format string, args ...any)
	WG                sync.WaitGroup
	QueueConcurrency  int
	QueuePollInterval time.Duration
	Clock             func() time.Time
	queueWakeup       chan struct{}
	queueWorkerStop   context.CancelFunc
	workerMu          sync.Mutex
	ctx               context.Context
	mu                sync.RWMutex
}

func (s *Service) now() time.Time {
	if s.Clock != nil {
		return s.Clock()
	}
	return time.Now().UTC()
}

func (s *Service) clientFor(role string) *analyze.Client {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ctx := s.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	if !s.HasCapability(ctx, license.FeatureDeepResearchV2) {
		role = ""
	}
	if s.Router != nil {
		if c := s.Router.For(role); c != nil {
			return c
		}
	}
	return s.Analyze
}

func (s *Service) describerForVision() Describer {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.Router != nil {
		if c := s.Router.For(analyze.RoleVision); c != nil {
			return c
		}
	}
	if s.Vision != nil {
		return s.Vision
	}
	return s.Analyze
}

// GoResearch runs Research in a background goroutine tracked by s.WG.
func (s *Service) GoResearch(ctx context.Context, cardID int64, playbookID ...*int64) {
	bgCtx := ctx
	if bgCtx == nil {
		bgCtx = s.ctx
	}
	if bgCtx == nil {
		bgCtx = context.Background()
	}
	s.WG.Add(1)
	go func() {
		defer s.WG.Done()
		if err := s.Research(bgCtx, cardID, playbookID...); err != nil && !errors.Is(err, port.ErrResearchActive) {
			s.Logf("core: background research %d: %v", cardID, err)
		}
	}()
}

// New constructs a Service with the default capture adapter, an analyze
// client and research runner for cfg, and logf (default log.Printf).
func New(ctx context.Context, st port.Store, cfg config.Config, logf func(format string, args ...any)) *Service {
	licMgr := license.NewManager(st)

	base := cfg.LLMBase
	key := cfg.LLMKey
	model := cfg.LLMModel
	if st != nil {
		if k, err := st.GetSetting(ctx, "llm_key"); err == nil && k != "" {
			key = k
		}
		if b, err := st.GetSetting(ctx, "llm_base"); err == nil && b != "" {
			base = b
		}
		if m, err := st.GetSetting(ctx, "llm_model"); err == nil && m != "" {
			model = m
		}
	}

	var profiles []analyze.Profile
	var roles map[string]string
	var tokenCaps map[string]int
	if st != nil {
		if val, err := st.GetSetting(ctx, "llm_profiles"); err == nil && strings.TrimSpace(val) != "" {
			_ = json.Unmarshal([]byte(val), &profiles)
		}
		if val, err := st.GetSetting(ctx, "llm_roles"); err == nil && strings.TrimSpace(val) != "" {
			_ = json.Unmarshal([]byte(val), &roles)
		}
		if val, err := st.GetSetting(ctx, "llm_token_caps"); err == nil && strings.TrimSpace(val) != "" {
			_ = json.Unmarshal([]byte(val), &tokenCaps)
		}
	}

	if len(profiles) == 0 {
		profiles = []analyze.Profile{{
			ID:        "default",
			Name:      "Default",
			BaseURL:   base,
			APIKey:    key,
			Model:     model,
			IsDefault: true,
		}}
	}

	router := analyze.NewRouter(analyze.RouterConfig{
		Profiles:  profiles,
		Roles:     roles,
		TokenCaps: tokenCaps,
	})

	triageClient := router.For(analyze.RoleTriage)
	visionClient := router.For(analyze.RoleVision)
	planClient := router.For(analyze.RoleResearchPlan)
	synthClient := router.For(analyze.RoleResearchSynthesis)

	s := &Service{
		Store: st,
		Fetcher: capture.Capture{
			HeadlessEnabled: cfg.HeadlessEnabled,
			ChromeBin:       cfg.ChromeBin,
			YtDlpBin:        cfg.YtDlpBin,
			CookiesFile:     cfg.CookiesFile,
			TranscriptLangs: cfg.TranscriptLangs,
		},
		Analyze:           triageClient,
		Vision:            visionClient,
		ASR:               asr.New(cfg),
		Runner:            research.NewWithClients(cfg, planClient, synthClient),
		Router:            router,
		UploadDir:         cfg.UploadDir,
		UploadMaxAgeDays:  cfg.UploadMaxAgeDays,
		UploadMaxSizeMB:   cfg.UploadMaxSizeMB,
		FFmpegBin:         ffmpegBin(cfg),
		License:           licMgr,
		Webhook:           webhook.NewDispatcher(st, licMgr, logf),
		Logf:              logf,
		QueueConcurrency:  1,
		QueuePollInterval: 1 * time.Second,
		Clock:             func() time.Time { return time.Now().UTC() },
		queueWakeup:       make(chan struct{}, 1),
		ctx:               ctx,
	}
	if s.Logf == nil {
		s.Logf = log.Printf
	}
	return s
}

// UpdateLLMConfig updates active LLM client parameters dynamically.
func (s *Service) UpdateLLMConfig(base, key, model string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.Analyze != nil {
		if base != "" {
			s.Analyze.BaseURL = base
		}
		s.Analyze.APIKey = key
		if model != "" {
			s.Analyze.Model = model
			s.Analyze.VisionModel = model
		}
	}
	if s.Router != nil {
		s.Router.UpdateDefaultProfile(base, key, model)
		s.Analyze = s.Router.For(analyze.RoleTriage)
		s.Vision = s.Router.For(analyze.RoleVision)
		if s.Runner != nil {
			s.Runner.PlanLLM = s.Router.For(analyze.RoleResearchPlan)
			s.Runner.SynthesisLLM = s.Router.For(analyze.RoleResearchSynthesis)
		}
	}
}

// RebuildRouter re-reads profile, role and cap settings from store and refreshes the router and clients.
func (s *Service) RebuildRouter(ctx context.Context) error {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	var profiles []analyze.Profile
	var roles map[string]string
	var tokenCaps map[string]int

	if s.Store != nil {
		if val, err := s.Store.GetSetting(ctx, "llm_profiles"); err == nil && strings.TrimSpace(val) != "" {
			_ = json.Unmarshal([]byte(val), &profiles)
		}
		if val, err := s.Store.GetSetting(ctx, "llm_roles"); err == nil && strings.TrimSpace(val) != "" {
			_ = json.Unmarshal([]byte(val), &roles)
		}
		if val, err := s.Store.GetSetting(ctx, "llm_token_caps"); err == nil && strings.TrimSpace(val) != "" {
			_ = json.Unmarshal([]byte(val), &tokenCaps)
		}
	}

	if len(profiles) == 0 {
		base := ""
		model := ""
		key := ""
		if s.Store != nil {
			base, _ = s.Store.GetSetting(ctx, "llm_base")
			model, _ = s.Store.GetSetting(ctx, "llm_model")
			key, _ = s.Store.GetSetting(ctx, "llm_key")
		}
		if base == "" && model == "" && s.Analyze != nil {
			base = s.Analyze.BaseURL
			model = s.Analyze.Model
			key = s.Analyze.APIKey
		}
		if base != "" || model != "" {
			profiles = []analyze.Profile{{
				ID:        "default",
				Name:      "Default",
				BaseURL:   base,
				APIKey:    key,
				Model:     model,
				IsDefault: true,
			}}
		}
	}

	var httpCl *http.Client
	if s.Router != nil {
		httpCl = s.Router.HTTPClient()
	} else if s.Analyze != nil {
		httpCl = s.Analyze.HTTP
	}

	// Pro gating: if not Pro (FeatureDeepResearchV2 capability missing), ignore role mappings
	// and route all roles to the default profile.
	if !s.HasCapability(ctx, license.FeatureDeepResearchV2) {
		roles = nil
	}

	newRouter := analyze.NewRouter(analyze.RouterConfig{
		Profiles:   profiles,
		Roles:      roles,
		TokenCaps:  tokenCaps,
		HTTPClient: httpCl,
	})

	s.Router = newRouter
	s.Analyze = newRouter.For(analyze.RoleTriage)
	s.Vision = newRouter.For(analyze.RoleVision)
	if s.Runner != nil {
		s.Runner.PlanLLM = newRouter.For(analyze.RoleResearchPlan)
		s.Runner.SynthesisLLM = newRouter.For(analyze.RoleResearchSynthesis)
	}
	return nil
}

// SetRouter replaces the active LLMRouter on the service and refreshes dependent clients.
func (s *Service) SetRouter(router *analyze.Router) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.Router = router
	if router != nil {
		s.Analyze = router.For(analyze.RoleTriage)
		s.Vision = router.For(analyze.RoleVision)
		if s.Runner != nil {
			s.Runner.PlanLLM = router.For(analyze.RoleResearchPlan)
			s.Runner.SynthesisLLM = router.For(analyze.RoleResearchSynthesis)
		}
	}
}

// HasCapability checks whether a feature is permitted under the active license.
func (s *Service) HasCapability(ctx context.Context, feature string) bool {
	if s.License == nil {
		return false
	}
	return s.License.HasCapability(ctx, feature)
}

// LicenseStatus returns the current active tier, expiry, and features.
func (s *Service) LicenseStatus(ctx context.Context) license.LicenseStatus {
	if s.License == nil {
		return license.LicenseStatus{Tier: license.TierCommunity, IsValid: true}
	}
	return s.License.Status(ctx)
}

// ActivateLicense attempts to verify and activate a Pro license key.
func (s *Service) ActivateLicense(ctx context.Context, key string) (*license.LicenseStatus, error) {
	if s.License == nil {
		return nil, errors.New("license manager not initialized")
	}
	return s.License.Activate(ctx, key)
}

// ffmpegBin returns a usable ffmpeg path or "" when it is not installed.
// Video input without ffmpeg degrades to a Note rather than a failure.
func ffmpegBin(cfg config.Config) string {
	if v := os.Getenv("SPARKKEEP_FFMPEG_BIN"); v != "" {
		return v
	}
	for _, candidate := range []string{cfg.FFmpegBin, "ffmpeg"} {
		if candidate == "" {
			continue
		}
		if p, err := exec.LookPath(candidate); err == nil {
			return p
		}
	}
	return ""
}

// Capture recognizes raw and runs the full pipeline. It is a convenience
// wrapper kept for the text/link path so existing callers and tests are
// unaffected by the switch to CaptureShare.
func (s *Service) Capture(ctx context.Context, raw string) ([]int64, error) {
	return s.CaptureShare(ctx, s.Fetcher.Recognize(raw))
}

// CaptureShare runs the full pipeline for an incoming share and returns the ids
// of the created cards. It never breaks on an LLM failure: the failure
// degrades into a stored "Analysis failed" card so the source + retry
// button survive. All cards are stored even if a later notify fails.
func (s *Service) CaptureShare(ctx context.Context, share capture.Share) ([]int64, error) {
	sourceURL := strings.TrimSpace(share.URL)
	if sourceURL != "" && s.Store != nil {
		if existingCap, err := s.Store.GetCaptureBySourceURL(ctx, sourceURL); err == nil {
			if derr := s.handleDuplicate(ctx, existingCap, share.Caption); derr != nil {
				s.Logf("core: duplicate handle: %v", derr)
			}
			return []int64{}, nil
		} else if existingCard, err := s.Store.GetCardBySourceURL(ctx, sourceURL); err == nil {
			cap := port.Capture{
				SourceURL: existingCard.SourceURL,
				Title:     existingCard.Title,
			}
			if derr := s.handleDuplicate(ctx, cap, share.Caption); derr != nil {
				s.Logf("core: duplicate handle legacy: %v", derr)
			}
			return []int64{}, nil
		}
	}

	fetched := s.resolve(ctx, share)

	capRow, cerr := s.persistCapture(ctx, share, fetched)
	if cerr != nil {
		if errors.Is(cerr, port.ErrConflict) || isUniqueConstraint(cerr) {
			if existingCap, gerr := s.Store.GetCaptureBySourceURL(ctx, sourceURL); gerr == nil {
				if derr := s.handleDuplicate(ctx, existingCap, share.Caption); derr != nil {
					s.Logf("core: duplicate handle on conflict: %v", derr)
				}
				return []int64{}, nil
			}
		}
		s.Logf("core: persist capture %s: %v", share.URL, cerr)
	}

	llmClient := s.clientFor(analyze.RoleTriage)
	if llmClient == nil {
		return nil, errors.New("core: no LLM client configured for triage")
	}
	var prof *port.UserProfile
	if s.Store != nil {
		if val, err := s.Store.GetSetting(ctx, "user_profile"); err == nil && strings.TrimSpace(val) != "" {
			var p port.UserProfile
			if json.Unmarshal([]byte(val), &p) == nil && !p.IsEmpty() {
				prof = &p
			}
		}
	}
	res, err := llmClient.Analyze(ctx, fetched, prof)
	if err != nil {
		s.Logf("core: analyze failed for %s: %v", share.URL, err)
		return s.failCard(ctx, fetched, share.URL, capRow.ID)
	}
	if len(res.Cards) == 0 {
		return []int64{}, nil
	}

	var ids []int64
	for _, idea := range res.Cards {
		url := firstURL(fetched, idea.Links, idea.References)
		card := cardFromIdea(idea, res, url, fetched.Caption)
		if capRow.ID > 0 {
			card.CaptureID = &capRow.ID
		}
		created, err := s.Store.CreateCard(ctx, card)
		if err != nil {
			return ids, err
		}
		ids = append(ids, created.ID)
		if s.Webhook != nil {
			s.Webhook.Dispatch(ctx, webhook.EventCardCreated, created)
		}
		if err := s.notify(ctx, port.Notification{Kind: "created", Card: created}); err != nil {
			s.Logf("core: notify created card %d: %v", created.ID, err)
		}
	}
	return ids, nil
}

func (s *Service) persistCapture(ctx context.Context, share capture.Share, fetched capture.Fetched) (port.Capture, error) {
	if s.Store == nil {
		return port.Capture{}, nil
	}
	kind := share.Kind
	if kind == "" {
		kind = fetched.Kind
	}
	if kind == "" {
		kind = capture.KindText
	}
	sourceURL := strings.TrimSpace(share.URL)
	capRecord := port.Capture{
		Kind:        kind,
		SourceURL:   sourceURL,
		Title:       clipRunes(fetched.Title, 1000),
		Description: clipRunes(fetched.Description, 5000),
		Text:        clipRunes(fetched.Text, 20000),
		Caption:     clipRunes(fetched.Caption, 5000),
		Transcript:  clipRunes(fetched.Transcript, 50000),
		ImageDigest: clipRunes(fetched.ImageDigest, 5000),
		Notes:       fetched.Notes,
	}
	return s.Store.CreateCapture(ctx, capRecord)
}

func (s *Service) handleDuplicate(ctx context.Context, existingCap port.Capture, caption string) error {
	caption = strings.TrimSpace(caption)
	existing, err := s.Store.GetCardBySourceURL(ctx, existingCap.SourceURL)
	if err != nil {
		title := existingCap.Title
		if title == "" {
			title = existingCap.SourceURL
		}
		text := "Already captured: " + title
		return s.notify(ctx, port.Notification{
			Kind: "duplicate",
			Card: port.Card{Title: title, SourceURL: existingCap.SourceURL},
			Text: text,
		})
	}
	text := "Already captured: " + existing.Title
	if caption != "" {
		note := caption
		if existing.SourceNote != "" {
			note = existing.SourceNote + "\n\n" + caption
		}
		status := existing.Status
		if status == port.StatusShelved || status == port.StatusDismissed {
			status = port.StatusInbox
		}
		updated, uerr := s.Store.UpdateCard(ctx, existing.ID, port.CardPatch{Note: &note, Status: &status})
		if uerr != nil {
			s.Logf("core: append note to duplicate %d: %v", existing.ID, uerr)
		} else {
			existing = updated
			text = "Already captured, note added: " + existing.Title
		}
	}
	if nerr := s.notify(ctx, port.Notification{Kind: "duplicate", Card: existing, Text: text}); nerr != nil {
		s.Logf("core: notify duplicate: %v", nerr)
	}
	return nil
}

func (s *Service) handleDuplicateCard(ctx context.Context, card port.Card) error {
	cap := port.Capture{SourceURL: card.SourceURL, Title: card.Title}
	return s.handleDuplicate(ctx, cap, card.SourceNote)
}

func isUniqueConstraint(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, port.ErrConflict) {
		return true
	}
	msg := err.Error()
	return strings.Contains(msg, "UNIQUE constraint failed") ||
		strings.Contains(msg, "unique constraint") ||
		strings.Contains(msg, "idx_cards_source") ||
		strings.Contains(msg, "idx_captures_source")
}

func cardFromIdea(idea analyze.Idea, res analyze.AnalysisResult, url, note string) port.Card {
	tldr := idea.TLDR
	whyCare := idea.WhyCare

	execSummary := idea.ExecutiveSummary
	valProp := idea.ValueProposition

	if tldr != "" || whyCare != "" {
		// New triage brief schema: strictly per-card, no post-level fallback
		if execSummary == "" {
			execSummary = tldr
		}
		if valProp == "" {
			valProp = whyCare
		}
	} else {
		// Legacy payload without tldr/why_care:
		if execSummary == "" {
			execSummary = res.ExecutiveSummary
		}
		if valProp == "" {
			valProp = res.ValueProposition
		}
		if tldr == "" {
			if execSummary != "" {
				tldr = execSummary
			} else {
				tldr = idea.Summary
			}
		}
		if whyCare == "" {
			whyCare = valProp
		}
	}

	actions := idea.ProposedActions
	if len(actions) == 0 {
		actions = res.ProposedActions
	}
	if actions == nil {
		actions = []string{}
	}
	refs := idea.References
	if refs == nil {
		refs = []port.Reference{}
	}
	claims := idea.Claims
	if claims == nil {
		claims = []string{}
	}
	openQuestions := idea.OpenQuestions
	if openQuestions == nil {
		openQuestions = []string{}
	}
	signals := port.Signals{
		Extraction:    "full",
		SourceQuality: "unknown",
	}
	if idea.Signals != nil {
		signals = *idea.Signals
	}
	if signals.Extraction == "" {
		signals.Extraction = "full"
	}
	if signals.SourceQuality == "" {
		signals.SourceQuality = "unknown"
	}
	worthiness := port.Worthiness{
		Level: "medium",
	}
	if idea.Worthiness != nil {
		worthiness = *idea.Worthiness
	}
	if worthiness.Level == "" {
		worthiness.Level = "medium"
	}
	cardType := idea.Type
	if cardType == "" {
		cardType = port.CardTypeIdea
	}
	summary := idea.Summary
	if summary == "" {
		summary = tldr
	}

	return port.Card{
		Title:            idea.Title,
		Summary:          summary,
		Horizon:          idea.Horizon,
		Tags:             idea.Tags,
		References:       refs,
		Type:             cardType,
		TLDR:             tldr,
		WhyCare:          whyCare,
		Claims:           claims,
		OpenQuestions:    openQuestions,
		Signals:          signals,
		Worthiness:       worthiness,
		SourceURL:        url,
		SourceNote:       note,
		Status:           port.StatusInbox,
		ExecutiveSummary: execSummary,
		ValueProposition: valProp,
		ProposedActions:  actions,
	}
}

// Research stores a 'queued' research row, runs the bounded research
// pipeline, persists the outcome and notifies. Any run failure marks the
// row 'failed' and notifies research_failed; it never panics.
func (s *Service) Research(ctx context.Context, cardID int64, playbookID ...*int64) error {
	card, err := s.Store.GetCard(ctx, cardID)
	if err != nil {
		return err
	}
	if active, err := s.Store.HasActiveResearch(ctx, cardID); err != nil {
		return err
	} else if active {
		return port.ErrResearchActive
	}
	if !s.HasCapability(ctx, license.FeatureDeepResearchV2) {
		var reqPB *port.Playbook
		if len(playbookID) > 0 && playbookID[0] != nil {
			if pb, err := s.Store.GetPlaybook(ctx, *playbookID[0]); err == nil {
				reqPB = &pb
			}
		}
		if reqPB != nil {
			if !reqPB.IsBuiltin {
				return errors.New("custom playbooks require Pro license")
			}
			if reqPB.ID != 1 && reqPB.ID != 2 && !strings.EqualFold(reqPB.Name, "Default") && !strings.EqualFold(reqPB.Name, "Claim check only") {
				return errors.New("this playbook requires Pro license")
			}
		}
	}
	row, err := s.Store.CreateResearch(ctx, cardID, "", playbookID...)
	if err != nil {
		return err
	}
	rsStatus := "researching"
	if _, cerr := s.Store.UpdateCard(ctx, cardID, port.CardPatch{Status: &rsStatus}); cerr != nil {
		s.Logf("core: failed to set card %d to researching: %v", cardID, cerr)
	}
	return s.executeResearch(ctx, row, card)
}

func (s *Service) executeResearch(ctx context.Context, row port.Research, card port.Card) error {
	if s.Runner == nil {
		return errors.New("core: research runner not initialized")
	}
	runner := *s.Runner
	runner.Store = s.Store
	if s.Router != nil {
		if !s.HasCapability(ctx, license.FeatureDeepResearchV2) {
			runner.PlanLLM = s.Analyze
			runner.SynthesisLLM = s.Analyze
		} else {
			runner.PlanLLM = s.Router.For(analyze.RoleResearchPlan)
			runner.SynthesisLLM = s.Router.For(analyze.RoleResearchSynthesis)
		}
	}
	var findings string
	var err error
	if !s.HasCapability(ctx, license.FeatureDeepResearchV2) {
		runPB := research.DefaultLitePlaybook()
		if row.PlaybookSnapshot != nil && (row.PlaybookSnapshot.ID == 2 || strings.EqualFold(row.PlaybookSnapshot.Name, "Claim check only")) {
			runPB = *row.PlaybookSnapshot
		}
		findings, err = runner.RunWithPlaybook(ctx, card, row.ID, runPB)
	} else {
		findings, err = runner.RunWithID(ctx, card, row.ID)
	}
	if err != nil {
		row, rerr := s.Store.SetResearch(ctx, row.ID, "failed", "", err.Error())
		if rerr != nil {
			return rerr
		}
		inboxStatus := "inbox"
		if _, cerr := s.Store.UpdateCard(ctx, card.ID, port.CardPatch{Status: &inboxStatus}); cerr != nil {
			s.Logf("core: failed to set card %d back to inbox: %v", card.ID, cerr)
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
	reviewStatus := "review"
	if _, cerr := s.Store.UpdateCard(ctx, card.ID, port.CardPatch{Status: &reviewStatus}); cerr != nil {
		s.Logf("core: failed to set card %d to review: %v", card.ID, cerr)
	}
	if nerr := s.notify(ctx, port.Notification{Kind: "research_done", Res: &row, Text: "Research complete"}); nerr != nil {
		s.Logf("core: notify research_done: %v", nerr)
	}
	if s.Webhook != nil {
		s.Webhook.Dispatch(ctx, webhook.EventResearchCompleted, row)
	}
	return nil
}

// ErrNothingToReanalyze is returned when Retry has neither usable capture content nor a URL to fetch.
var ErrNothingToReanalyze = errors.New("nothing to re-analyze")

func hasUsableContent(c port.Capture) bool {
	return strings.TrimSpace(c.Text) != "" ||
		strings.TrimSpace(c.Transcript) != "" ||
		strings.TrimSpace(c.ImageDigest) != "" ||
		strings.TrimSpace(c.Description) != ""
}

func fetchedFromCapture(c port.Capture, card port.Card) capture.Fetched {
	caption := c.Caption
	if caption == "" && card.SourceNote != "" && card.SourceNote != card.SourceURL {
		caption = card.SourceNote
	}
	url := c.SourceURL
	if url == "" {
		url = card.SourceURL
	}
	return capture.Fetched{
		Kind:        c.Kind,
		URL:         url,
		Title:       c.Title,
		Description: c.Description,
		Text:        c.Text,
		Caption:     caption,
		Transcript:  c.Transcript,
		ImageDigest: c.ImageDigest,
		Notes:       c.Notes,
	}
}

// Retry loads the card's capture (or falls back to re-fetching its source URL),
// re-analyzes it, marks the failed card dismissed, and creates all cards from
// the analysis result linked to the same capture.
func (s *Service) Retry(ctx context.Context, cardID int64) ([]port.Card, error) {
	card, err := s.Store.GetCard(ctx, cardID)
	if err != nil {
		return nil, err
	}

	var cap port.Capture
	var hasCap bool
	if card.CaptureID != nil && *card.CaptureID > 0 && s.Store != nil {
		if c, err := s.Store.GetCapture(ctx, *card.CaptureID); err == nil {
			cap = c
			hasCap = true
		}
	}
	if !hasCap && card.SourceURL != "" && s.Store != nil {
		if c, err := s.Store.GetCaptureBySourceURL(ctx, card.SourceURL); err == nil {
			cap = c
			hasCap = true
		}
	}

	var fetched capture.Fetched
	if hasCap && hasUsableContent(cap) {
		fetched = fetchedFromCapture(cap, card)
	} else {
		targetURL := strings.TrimSpace(card.SourceURL)
		if targetURL == "" && hasCap {
			targetURL = strings.TrimSpace(cap.SourceURL)
		}
		if targetURL != "" {
			var share capture.Share
			if s.Fetcher != nil {
				share = s.Fetcher.Recognize(targetURL)
			} else {
				share = capture.Recognize(targetURL)
			}
			if share.Kind == "" && hasCap && cap.Kind != "" {
				share.Kind = cap.Kind
			}
			if share.Caption == "" {
				if hasCap && cap.Caption != "" {
					share.Caption = cap.Caption
				} else if card.SourceNote != "" && card.SourceNote != targetURL {
					share.Caption = card.SourceNote
				}
			}
			fetched = s.resolve(ctx, share)

			if hasCap && cap.ID > 0 && s.Store != nil {
				cap.Title = clipRunes(fetched.Title, 1000)
				cap.Description = clipRunes(fetched.Description, 5000)
				cap.Text = clipRunes(fetched.Text, 20000)
				cap.Caption = clipRunes(fetched.Caption, 5000)
				cap.Transcript = clipRunes(fetched.Transcript, 50000)
				cap.ImageDigest = clipRunes(fetched.ImageDigest, 5000)
				cap.Notes = fetched.Notes
				if fetched.Kind != "" {
					cap.Kind = fetched.Kind
				}
				if cap.SourceURL == "" {
					cap.SourceURL = targetURL
				}
				if updated, uerr := s.Store.UpdateCapture(ctx, cap); uerr == nil {
					cap = updated
				} else {
					s.Logf("core: update capture %d on retry: %v", cap.ID, uerr)
				}
			} else if s.Store != nil {
				capRecord, perr := s.persistCapture(ctx, share, fetched)
				if perr == nil {
					cap = capRecord
					hasCap = true
				} else if existingCap, gerr := s.Store.GetCaptureBySourceURL(ctx, targetURL); gerr == nil {
					cap = existingCap
					hasCap = true
					cap.Title = clipRunes(fetched.Title, 1000)
					cap.Description = clipRunes(fetched.Description, 5000)
					cap.Text = clipRunes(fetched.Text, 20000)
					cap.Caption = clipRunes(fetched.Caption, 5000)
					cap.Transcript = clipRunes(fetched.Transcript, 50000)
					cap.ImageDigest = clipRunes(fetched.ImageDigest, 5000)
					cap.Notes = fetched.Notes
					if updated, uerr := s.Store.UpdateCapture(ctx, cap); uerr == nil {
						cap = updated
					}
				}
			}
		} else {
			return nil, ErrNothingToReanalyze
		}
	}

	llmClient := s.clientFor(analyze.RoleTriage)
	if llmClient == nil {
		return nil, errors.New("core: no LLM client configured for triage")
	}
	res, err := llmClient.Analyze(ctx, fetched)
	if err != nil {
		s.Logf("core: retry analyze card %d: %v", cardID, err)
		return nil, err
	}
	if len(res.Cards) == 0 {
		return []port.Card{}, nil
	}

	dismissed := port.StatusDismissed
	emptyURL := ""
	dismissPatch := port.CardPatch{Status: &dismissed}
	if card.SourceURL != "" {
		dismissPatch.SourceURL = &emptyURL
	}
	if cap.ID > 0 {
		dismissPatch.CaptureID = &cap.ID
	}
	if _, err := s.Store.UpdateCard(ctx, cardID, dismissPatch); err != nil {
		s.Logf("core: dismiss original failed card %d: %v", cardID, err)
	}

	var capID *int64
	if cap.ID > 0 {
		cID := cap.ID
		capID = &cID
	} else if card.CaptureID != nil {
		capID = card.CaptureID
	}

	var createdCards []port.Card
	for _, idea := range res.Cards {
		url := firstURL(fetched, idea.Links, idea.References)
		if url == "" {
			url = card.SourceURL
		}
		note := fetched.Caption
		if note == "" {
			note = card.SourceNote
		}
		newCard := cardFromIdea(idea, res, url, note)
		newCard.CaptureID = capID
		created, err := s.Store.CreateCard(ctx, newCard)
		if err != nil {
			if len(createdCards) == 0 && card.SourceURL != "" {
				_, _ = s.Store.UpdateCard(ctx, cardID, port.CardPatch{Status: &card.Status, SourceURL: &card.SourceURL})
			}
			return createdCards, err
		}
		createdCards = append(createdCards, created)
		if s.Webhook != nil {
			s.Webhook.Dispatch(ctx, webhook.EventCardCreated, created)
		}
		if nerr := s.notify(ctx, port.Notification{Kind: "done", Card: created}); nerr != nil {
			s.Logf("core: notify retry done: %v", nerr)
		}
	}
	return createdCards, nil
}

// resolve turns a share into a Fetched. Link and text shares go through the
// fetcher; media shares are read locally. Nothing here fails hard — every
// unreadable input becomes a Note so a card is still produced.
func (s *Service) resolve(ctx context.Context, share capture.Share) capture.Fetched {
	switch share.Kind {
	case capture.KindText, capture.KindLink:
		f := s.fetchContent(share)
		f.Kind = share.Kind
		if share.Kind == capture.KindLink {
			if f.Transcript == "" {
				if tr := s.Fetcher.Subtitles(share); tr != "" {
					f.Transcript = tr
				} else if isVideoHost(f.URL) {
					f.Notes = append(f.Notes, "no transcript available")
				}
			}
		}
		return f
	default:
		return s.resolveMedia(ctx, share)
	}
}

// resolveMedia reads image, audio, video, and file payloads.
func (s *Service) resolveMedia(ctx context.Context, share capture.Share) capture.Fetched {
	f := capture.Fetched{
		Kind:    share.Kind,
		URL:     share.URL,
		Caption: share.Caption,
	}
	if len(share.Files) == 0 {
		f.Notes = append(f.Notes, "no file content received")
		return f
	}
	file := share.Files[0]
	f.Title = file.Name

	if f.URL == "" {
		if name := s.persistUpload(file); name != "" {
			f.URL = "/api/v1/media/" + name
		}
	}

	if share.Kind == capture.KindImage {
		describer := s.describerForVision()
		if describer == nil {
			f.Notes = append(f.Notes, "image unreadable")
			return f
		}
		digest, err := describer.Describe(ctx, file, "")
		if err != nil {
			s.Logf("core: vision %s: %v", file.Name, err)
			f.Notes = append(f.Notes, "image unreadable")
			return f
		}
		f.ImageDigest = digest
		return f
	}

	if share.Kind == capture.KindVideo {
		audio, err := s.extractAudio(ctx, file)
		if err != nil {
			s.Logf("core: extract audio %s: %v", file.Name, err)
			f.Notes = append(f.Notes, "video: audio extraction unavailable")
			return f
		}
		if tr, terr := s.transcribe(ctx, audio); terr == nil && tr != "" {
			f.Transcript = tr
			return f
		} else if terr != nil {
			s.Logf("core: transcribe %s: %v", file.Name, terr)
		}
		f.Notes = append(f.Notes, "audio not transcribed")
		return f
	}

	if share.Kind == capture.KindAudio {
		tr, err := s.transcribe(ctx, file)
		if err != nil {
			s.Logf("core: transcribe %s: %v", file.Name, err)
			f.Notes = append(f.Notes, "audio not transcribed")
			return f
		}
		if tr == "" {
			f.Notes = append(f.Notes, "audio not transcribed")
			return f
		}
		f.Transcript = tr
		return f
	}

	// KindFile: read text-like content, otherwise record the filename only.
	if txt, ok := readTextFile(file); ok {
		f.Text = txt
		return f
	}
	if file.Mime == "application/pdf" {
		f.Notes = append(f.Notes, "pdf: text not extracted")
	} else {
		f.Notes = append(f.Notes, "file: content not extractable")
	}
	return f
}

// isVideoHost reports whether a URL points at a platform that has subtitles
// worth asking for.
func isVideoHost(raw string) bool {
	low := strings.ToLower(raw)
	return strings.Contains(low, "youtube.com") || strings.Contains(low, "youtu.be")
}

func (s *Service) transcribe(ctx context.Context, f capture.File) (string, error) {
	if s.ASR == nil {
		return "", nil
	}
	return s.ASR.Transcribe(ctx, f)
}

// extractAudio converts a video file to 16kHz mono wav via ffmpeg. Returns
// an error when ffmpeg is unavailable, which the caller turns into a Note.
func (s *Service) extractAudio(ctx context.Context, in capture.File) (capture.File, error) {
	if s.FFmpegBin == "" {
		return capture.File{}, fmt.Errorf("core: ffmpeg not installed")
	}
	tmp, err := os.CreateTemp("", "sparkkeep-audio-*.wav")
	if err != nil {
		return capture.File{}, err
	}
	defer os.Remove(tmp.Name())
	tmp.Close()
	cmd := exec.CommandContext(ctx, s.FFmpegBin,
		"-i", "pipe:0", "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", tmp.Name())
	cmd.Stdin = bytes.NewReader(in.Data)
	if out, err := cmd.CombinedOutput(); err != nil {
		return capture.File{}, fmt.Errorf("core: ffmpeg: %w: %s", err, clipText(string(out), 200))
	}
	wav, err := os.ReadFile(tmp.Name())
	if err != nil {
		return capture.File{}, err
	}
	return capture.File{Name: "audio.wav", Mime: "audio/wav", Data: wav}, nil
}

func clipRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

func clipText(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// readTextFile returns file contents when the mime is text-like. HTML is
// stripped so a saved web page reads as prose.
func readTextFile(f capture.File) (string, bool) {
	m := strings.ToLower(f.Mime)
	if !strings.HasPrefix(m, "text/") && m != "application/json" && m != "application/xml" {
		return "", false
	}
	s := strings.TrimSpace(string(f.Data))
	if strings.Contains(m, "html") {
		s = strings.TrimSpace(stripHTML(s))
	}
	runes := []rune(s)
	if len(runes) > 4000 {
		s = string(runes[:4000])
	}
	return s, s != ""
}

func stripHTML(s string) string {
	s = scriptStyleRe.ReplaceAllString(s, " ")
	return tagStripRe.ReplaceAllString(s, "")
}

// persistUpload stores f under UploadDir named by its content hash and
// returns the filename, or "" when storage is unavailable. Storage is
// best-effort: capture must not fail because a directory is missing.
func (s *Service) persistUpload(f capture.File) string {
	if s.UploadDir == "" || len(f.Data) == 0 {
		return ""
	}
	if err := os.MkdirAll(s.UploadDir, 0o755); err != nil {
		s.Logf("core: mkdir uploads: %v", err)
		return ""
	}
	sum := sha256.Sum256(f.Data)
	ext := strings.ToLower(filepath.Ext(f.Name))
	if ext == "" || len(ext) > 8 {
		ext = ""
	}
	name := hex.EncodeToString(sum[:])[:16] + ext
	if err := os.WriteFile(filepath.Join(s.UploadDir, name), f.Data, 0o644); err != nil {
		s.Logf("core: write upload: %v", err)
		return ""
	}
	// TODO: cleanup old uploads based on UploadMaxAgeDays / UploadMaxSizeMB
	// Run on startup or via daily cron goroutine.
	return name
}

// failCard stores the "analysis failed, see source / retry" card. It is the
// LLM-failure degradation path and never returns a hard error to Capture.
func (s *Service) failCard(ctx context.Context, fetched capture.Fetched, raw string, captureID int64) ([]int64, error) {
	var capID *int64
	if captureID > 0 {
		capID = &captureID
	} else if s.Store != nil {
		sourceURL := ""
		if fetched.Kind == capture.KindLink || strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") {
			sourceURL = strings.TrimSpace(raw)
		}
		capRecord := port.Capture{
			Kind:        fetched.Kind,
			SourceURL:   sourceURL,
			Title:       clipRunes(fetched.Title, 1000),
			Description: clipRunes(fetched.Description, 5000),
			Text:        clipRunes(fetched.Text, 20000),
			Caption:     clipRunes(fetched.Caption, 5000),
			Transcript:  clipRunes(fetched.Transcript, 50000),
			ImageDigest: clipRunes(fetched.ImageDigest, 5000),
			Notes:       fetched.Notes,
		}
		if c, err := s.Store.CreateCapture(ctx, capRecord); err == nil {
			capID = &c.ID
		}
	}
	card := port.Card{
		CaptureID:  capID,
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
// text, caption, Transcript, ImageDigest, Kind) and appends b.Notes to a.Notes
// (unioning warnings from both sources). Used to layer a plain fetch over
// empty media metadata.
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
	if b.Transcript != "" {
		a.Transcript = b.Transcript
	}
	if b.ImageDigest != "" {
		a.ImageDigest = b.ImageDigest
	}
	if b.Kind != "" {
		a.Kind = b.Kind
	}
	if len(b.Notes) > 0 {
		a.Notes = append(a.Notes, b.Notes...)
	}
	return a
}

// firstURL is the card's SourceURL: the fetched URL, else the first idea
// link or reference URL reported.
func firstURL(fetched capture.Fetched, links []string, refs []port.Reference) string {
	if fetched.URL != "" {
		return fetched.URL
	}
	for _, l := range links {
		if strings.TrimSpace(l) != "" {
			return l
		}
	}
	for _, r := range refs {
		if strings.TrimSpace(r.URL) != "" {
			return r.URL
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
