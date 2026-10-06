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
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

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
	Store            port.Store
	Channel          port.Channel
	Fetcher          capture.Fetcher // recognize+fetch (field named Fetcher: Capture collided with the method)
	Analyze          *analyze.Client
	Vision           Describer           // nil disables image digests
	ASR              Transcriber         // nil disables transcription
	Runner           *research.Runner    // field named Runner: Research collided with the method
	UploadDir        string              // "" disables upload retention
	UploadMaxAgeDays int                 // 0 disables age-based cleanup
	UploadMaxSizeMB  int                 // 0 disables size-based cleanup
	FFmpegBin        string              // "" disables video audio extraction
	License          *license.Manager    // offline Tier/capability manager
	Webhook          *webhook.Dispatcher // outbound webhook dispatcher
	Logf             func(format string, args ...any)
	WG               sync.WaitGroup
	ctx              context.Context
}

// GoResearch runs Research in a background goroutine tracked by s.WG.
func (s *Service) GoResearch(ctx context.Context, cardID int64) {
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
		if err := s.Research(bgCtx, cardID); err != nil && !errors.Is(err, port.ErrResearchActive) {
			s.Logf("core: background research %d: %v", cardID, err)
		}
	}()
}

// New constructs a Service with the default capture adapter, an analyze
// client and research runner for cfg, and logf (default log.Printf).
func New(ctx context.Context, st port.Store, cfg config.Config, logf func(format string, args ...any)) *Service {
	llm := analyze.New(cfg, nil)
	licMgr := license.NewManager(st)
	s := &Service{
		Store: st,
		Fetcher: capture.Capture{
			HeadlessEnabled: cfg.HeadlessEnabled,
			ChromeBin:       cfg.ChromeBin,
			YtDlpBin:        cfg.YtDlpBin,
			CookiesFile:     cfg.CookiesFile,
			TranscriptLangs: cfg.TranscriptLangs,
		},
		Analyze:          llm,
		Vision:           llm,
		ASR:              asr.New(cfg),
		Runner:           research.New(cfg, llm),
		UploadDir:        cfg.UploadDir,
		UploadMaxAgeDays: cfg.UploadMaxAgeDays,
		UploadMaxSizeMB:  cfg.UploadMaxSizeMB,
		FFmpegBin:        ffmpegBin(cfg),
		License:          licMgr,
		Webhook:          webhook.NewDispatcher(st, licMgr, logf),
		Logf:             logf,
		ctx:              ctx,
	}
	if s.Logf == nil {
		s.Logf = log.Printf
	}
	if st != nil {
		if k, err := st.GetSetting(ctx, "llm_key"); err == nil && k != "" {
			llm.APIKey = k
		}
		if b, err := st.GetSetting(ctx, "llm_base"); err == nil && b != "" {
			llm.BaseURL = b
		}
		if m, err := st.GetSetting(ctx, "llm_model"); err == nil && m != "" {
			llm.Model = m
			llm.VisionModel = m
		}
	}
	return s
}

// UpdateLLMConfig updates active LLM client parameters dynamically.
func (s *Service) UpdateLLMConfig(base, key, model string) {
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
	fetched := s.resolve(ctx, share)

	res, err := s.Analyze.Analyze(ctx, fetched)
	if err != nil {
		return s.failCard(ctx, fetched, share.URL)
	}
	if len(res.Cards) == 0 {
		return []int64{}, nil
	}

	var ids []int64
	for _, idea := range res.Cards {
		url := firstURL(fetched, idea.Links)
		card := cardFromIdea(idea, res, url, fetched.Caption)
		created, err := s.Store.CreateCard(ctx, card)
		if err != nil {
			if errors.Is(err, port.ErrConflict) || isUniqueConstraint(err) {
				if derr := s.handleDuplicateCard(ctx, card); derr == nil {
					continue
				}
			}
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

func (s *Service) handleDuplicateCard(ctx context.Context, card port.Card) error {
	existing, err := s.Store.GetCardBySourceURL(ctx, card.SourceURL)
	if err != nil {
		return err
	}
	text := "Already captured: " + existing.Title
	if caption := strings.TrimSpace(card.SourceNote); caption != "" {
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
		strings.Contains(msg, "idx_cards_source")
}

func cardFromIdea(idea analyze.Idea, res analyze.AnalysisResult, url, note string) port.Card {
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
	return port.Card{
		Title:            idea.Title,
		Summary:          idea.Summary,
		Horizon:          idea.Horizon,
		Tags:             idea.Tags,
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
	if s.Webhook != nil {
		s.Webhook.Dispatch(ctx, webhook.EventResearchCompleted, row)
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
	dismissed := port.StatusDismissed
	emptyURL := ""
	dismissPatch := port.CardPatch{Status: &dismissed}
	if card.SourceURL != "" {
		dismissPatch.SourceURL = &emptyURL
	}
	if _, err := s.Store.UpdateCard(ctx, cardID, dismissPatch); err != nil {
		s.Logf("core: dismiss original failed card %d: %v", cardID, err)
	}

	created, err := s.Store.CreateCard(ctx, cardFromIdea(idea, res, card.SourceURL, card.SourceNote))
	if err != nil {
		if card.SourceURL != "" {
			_, _ = s.Store.UpdateCard(ctx, cardID, port.CardPatch{Status: &card.Status, SourceURL: &card.SourceURL})
		}
		return port.Card{}, err
	}
	if nerr := s.notify(ctx, port.Notification{Kind: "done", Card: created}); nerr != nil {
		s.Logf("core: notify retry done: %v", nerr)
	}
	return created, nil
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
		if s.Vision == nil {
			f.Notes = append(f.Notes, "image unreadable")
			return f
		}
		digest, err := s.Vision.Describe(ctx, file, "")
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
	if len(s) > 4000 {
		s = string([]rune(s)[:4000])
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
