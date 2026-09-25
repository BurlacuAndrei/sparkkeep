package capture

// Fetcher is the subset of capture that core consumes: recognize the share,
// fetch best-effort content, enrich media metadata. It is fulfilled by the
// package functions below and is easy to stub in tests.
type Fetcher interface {
	Recognize(raw string) Share
	Fetch(share Share) Fetched
	MediaMeta(share Share) Fetched
}

// Capture is the default Fetcher with configurable headless/binary paths.
type Capture struct {
	HeadlessEnabled bool
	ChromeBin       string
	YtDlpBin        string
}

func (Capture) Recognize(raw string) Share { return Recognize(raw) }

