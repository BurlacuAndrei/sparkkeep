package capture

import (
	"context"
)

// Fetcher is the subset of capture that core consumes: recognize the share,
// fetch best-effort content, enrich media metadata. It is fulfilled by the
// package functions below and is easy to stub in tests.
type Fetcher interface {
	Recognize(raw string) Share
	Fetch(share Share) Fetched
	FetchWithContext(ctx context.Context, share Share) Fetched
	MediaMeta(share Share) Fetched
	Subtitles(share Share) string
}

// Capture is the default Fetcher with configurable headless/binary paths.
type Capture struct {
	HeadlessEnabled bool
	ChromeBin       string
	YtDlpBin        string
	// CookiesFile is an optional Netscape cookie jar used for gated media.
	CookiesFile string
	// TranscriptLangs is a whisper language hint (e.g. "en", "auto").
	TranscriptLangs string
}

func (Capture) Recognize(raw string) Share { return Recognize(raw) }
