package capture

// Fetcher is the subset of capture that core consumes: recognize the share,
// fetch best-effort content, enrich media metadata. It is fulfilled by the
// package functions below and is easy to stub in tests.
type Fetcher interface {
	Recognize(raw string) Share
	Fetch(share Share) Fetched
	MediaMeta(share Share) Fetched
}

// Capture is the default Fetcher, a thin adapter over the package functions.
type Capture struct{}

func (Capture) Recognize(raw string) Share    { return Recognize(raw) }
func (Capture) Fetch(share Share) Fetched     { return Fetch(share) }
func (Capture) MediaMeta(share Share) Fetched { return MediaMeta(share) }
