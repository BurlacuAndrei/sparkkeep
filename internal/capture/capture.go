// Package capture recognizes what a user shared (link vs text) and fetches
// best-effort content into a normalized payload for the analyzer. Fetching
// never fails hard: on any error the Fetched.Err is set and the caller can
// fall back to the raw text.
package capture

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

type Share struct {
	Name    string // "link" | "text"
	URL     string
	Caption string // full raw text (pasted-caption path)
}

type Fetched struct {
	Name        string // matches Share.Name
	URL         string
	Title       string
	Description string
	Text        string
	Caption     string // pasted caption (text shares / link-with-caption)
	Err         error  // nil unless fetch failed
}

var (
	urlRe    = regexp.MustCompile(`https?://[^\s]+`)
	tagRe    = regexp.MustCompile(`<[^>]*>`)
	blankRe  = regexp.MustCompile(`\n{3,}`)
	titleRe  = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	descRe   = regexp.MustCompile(`(?is)<meta[^>]*name=["'](?:description|summary)["'][^>]*content=["']([^"']*)["'][^>]*>`)
	descRe2  = regexp.MustCompile(`(?is)<meta[^>]*content=["']([^"']*)["'][^>]*name=["'](?:description|summary)["'][^>]*>`)
	mediaRe  = regexp.MustCompile(`(?i)(youtube|youtu\.be|instagram|facebook)`)
	ytdlpBin = "yt-dlp"
)

// condenseMax caps extracted text for the analyzer's context budget.
// ponytail: fixed cap; make it env-configurable if analyses ever need more.
const condenseMax = 4000

// defaultTimeout bounds every best-effort fetch (HTTP and yt-dlp).
// ponytail: package var so the timeout test can inject a short deadline.
const defaultTimeout = 5 * time.Second

// fetchTimeout is used for both HTTP GETs and the yt-dlp subprocess.
var fetchTimeout = defaultTimeout

// Recognize classifies raw as a link (single http(s) URL) or as text.
// A single URL is extracted into Share.URL; any trailing caption is kept
// verbatim in Share.Caption. A bare non-URL string yields Name=="text".
func Recognize(raw string) Share {
	urls := urlRe.FindAllString(raw, -1)
	if len(urls) != 1 {
		return Share{Name: "text", Caption: raw}
	}
	caption := strings.TrimSpace(strings.Replace(raw, urls[0], "", 1))
	return Share{Name: "link", URL: urls[0], Caption: caption}
}

// Fetch returns a Fetched for the given share. It NEVER returns a hard
// error: failures surface as Fetched.Err with empty Text. Text shares
// short-circuit to their caption.
func Fetch(share Share) Fetched {
	f := Fetched{Name: share.Name, URL: share.URL, Caption: share.Caption}
	if share.Name == "text" {
		f.Text = share.Caption
		return f
	}
	return httpFetch(share, f)
}

// MediaMeta enriches a media link (YouTube/Instagram/Facebook) with
// yt-dlp metadata (title + description only). Non-media links fall back
// to the plain HTTP fetch.
func MediaMeta(share Share) Fetched {
	f := Fetched{Name: share.Name, URL: share.URL}
	u, err := url.Parse(share.URL)
	if err != nil {
		f.Err = err
		return f
	}
	if !mediaRe.MatchString(u.Host) {
		return Fetch(share)
	}

	bin := os.Getenv("SPARKKEEP_YTDLP")
	if bin == "" {
		bin = ytdlpBin
	}
	ctx, cancel := context.WithTimeout(context.Background(), fetchTimeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, bin,
		"--skip-download", "--dump-json", "--no-warnings", share.URL).Output()
	if err != nil {
		f.Err = fmt.Errorf("capture: yt-dlp: %w", err)
		return f
	}
	var meta struct {
		Title       string `json:"title"`
		Description string `json:"description"`
	}
	if err := json.Unmarshal(out, &meta); err != nil {
		f.Err = fmt.Errorf("capture: yt-dlp JSON: %w", err)
		return f
	}
	f.Title, f.Description = meta.Title, meta.Description
	// ponytail: only title+description extracted; transcripts/thumbnails
	// are a v2 need, add when you actually want them.
	return f
}

func httpFetch(share Share, f Fetched) Fetched {
	ctx, cancel := context.WithTimeout(context.Background(), fetchTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, share.URL, nil)
	if err != nil {
		f.Err = err
		return f
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		f.Err = fmt.Errorf("capture: GET %s: %w", share.URL, err)
		return f
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		f.Err = fmt.Errorf("capture: GET %s: read body: %w", share.URL, err)
		return f
	}
	if resp.StatusCode != http.StatusOK {
		f.Err = fmt.Errorf("capture: GET %s: status %d", share.URL, resp.StatusCode)
		return f
	}
	if !isTextBody(resp.Header.Get("Content-Type")) {
		f.Err = fmt.Errorf("capture: GET %s: non-text content-type %q", share.URL, resp.Header.Get("Content-Type"))
		return f
	}
	html := string(body)
	f.Title = extractTitle(html)
	f.Description = extractDescription(html)
	f.Text = strings.TrimSpace(stripTagsAndCondense(html))
	return f
}

// isTextBody is liberal: absent or text/* types are acceptable HTML-ish
// payloads; declared binary types are not.
func isTextBody(contentType string) bool {
	mt, _, err := mime.ParseMediaType(contentType)
	if err != nil || mt == "" {
		return true
	}
	mt = strings.ToLower(mt)
	return mt == "text/html" || strings.HasPrefix(mt, "text/") || strings.Contains(mt, "html")
}

func extractTitle(html string) string {
	if m := titleRe.FindStringSubmatch(html); m != nil {
		return strings.TrimSpace(m[1])
	}
	return ""
}

func extractDescription(html string) string {
	for _, re := range []*regexp.Regexp{descRe, descRe2} {
		if m := re.FindStringSubmatch(html); m != nil {
			return strings.TrimSpace(m[1])
		}
	}
	return ""
}

// stripTagsAndCondense removes HTML tags, collapses 3+ newlines, trims, caps
// at condenseMax chars and returns a clean single trailing-newline text.
func stripTagsAndCondense(s string) string {
	s = tagRe.ReplaceAllString(s, "")
	s = blankRe.ReplaceAllString(s, "\n")
	s = strings.TrimSpace(s)
	if len(s) > condenseMax {
		s = s[:condenseMax]
	}
	if s == "" {
		return ""
	}
	return s + "\n"
}
