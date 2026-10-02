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
	"net"
	"net/http"
	"net/url"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"github.com/chromedp/chromedp"
)

// Kind classifies what the user handed us. Recognize sets text/link; the
// channel and web adapters set the media kinds directly.
const (
	KindText  = "text"
	KindLink  = "link"
	KindImage = "image"
	KindAudio = "audio"
	KindVideo = "video"
	KindFile  = "file"
)

// File is one media payload handed to the pipeline. Data is in memory: both
// callers (Telegram getFile, multipart upload) already hold the bytes, and
// uploads are size-capped, so there is no temp file to manage.
type File struct {
	Name string
	Mime string
	Data []byte
}

type Share struct {
	Kind    string
	URL     string
	Caption string
	Files   []File
}

type Fetched struct {
	Kind        string
	URL         string
	Title       string
	Description string
	Text        string
	Caption     string
	Transcript  string
	ImageDigest string
	// Notes are extraction warnings, never content. Anything we could not
	// read lands here so the analyzer can qualify the card instead of
	// inventing content from a login wall or an error page.
	Notes []string
	Err   error
}

var (
	urlRe           = regexp.MustCompile(`https?://[^\s]+`)
	tagRe           = regexp.MustCompile(`<[^>]*>`)
	blankRe         = regexp.MustCompile(`\n{3,}`)
	titleRe         = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	descRe          = regexp.MustCompile(`(?is)<meta[^>]*name=["'](?:description|summary)["'][^>]*content=["']([^"']*)["'][^>]*>`)
	descRe2         = regexp.MustCompile(`(?is)<meta[^>]*content=["']([^"']*)["'][^>]*name=["'](?:description|summary)["'][^>]*>`)
	mediaRe         = regexp.MustCompile(`(?i)(youtube|youtu\.be|instagram|facebook)`)
	gatedRe         = regexp.MustCompile(`(?i)(instagram\.com|facebook\.com|twitter\.com|x\.com|threads\.net)`)
	ytdlpBin        = "yt-dlp"
	headlessTimeout = 12 * time.Second
)

// condenseMax caps extracted text for the analyzer's context budget.
const condenseMax = 4000

// defaultTimeout bounds standard best-effort HTTP and yt-dlp fetches.
const defaultTimeout = 5 * time.Second

// fetchTimeout is used for standard HTTP GETs and the yt-dlp subprocess.
var fetchTimeout = defaultTimeout

// httpClient is a dedicated client for capture HTTP fetches with explicit
// transport timeouts, replacing http.DefaultClient which has no timeout.
var httpClient = &http.Client{
	Timeout: 10 * time.Second,
	Transport: &http.Transport{
		DialContext:         (&net.Dialer{Timeout: 5 * time.Second}).DialContext,
		TLSHandshakeTimeout: 5 * time.Second,
		MaxIdleConns:        10,
		IdleConnTimeout:     30 * time.Second,
	},
}

// Recognize classifies raw as a link (single http(s) URL) or as text.
// A single URL is extracted into Share.URL; any trailing caption is kept
// verbatim in Share.Caption. A bare non-URL string yields Kind==KindText.
func Recognize(raw string) Share {
	urls := urlRe.FindAllString(raw, -1)
	if len(urls) != 1 {
		return Share{Kind: KindText, Caption: raw}
	}
	caption := strings.TrimSpace(strings.Replace(raw, urls[0], "", 1))
	return Share{Kind: KindLink, URL: urls[0], Caption: caption}
}

// Fetch returns a Fetched for the given share. It NEVER returns a hard
// error: failures surface as Fetched.Err with empty Text. Text shares
// DefaultCapture is the default Capture instance used by package-level Fetch and MediaMeta.
var DefaultCapture = Capture{HeadlessEnabled: true}

// Fetch returns a Fetched for the given share using DefaultCapture.
func Fetch(share Share) Fetched {
	return DefaultCapture.Fetch(share)
}

// MediaMeta enriches a media link using DefaultCapture.
func MediaMeta(share Share) Fetched {
	return DefaultCapture.MediaMeta(share)
}

// Fetch returns a Fetched for the given share. It NEVER returns a hard
// error: failures surface as Fetched.Err with empty Text. Text shares
// short-circuit to their caption. Gated or bot-blocked sites fall back
// to headless browser extraction when enabled.
func (c Capture) Fetch(share Share) Fetched {
	f := Fetched{Kind: share.Kind, URL: share.URL, Caption: share.Caption}
	if share.Kind == KindText {
		f.Text = share.Caption
		return f
	}

	// For known gated platforms (Instagram, Twitter/X, etc.), try headless browser first
	if isGatedDomain(share.URL) && c.HeadlessEnabled {
		ctx, cancel := context.WithTimeout(context.Background(), headlessTimeout)
		defer cancel()
		title, desc, text, err := HeadlessExtract(ctx, share.URL, c.ChromeBin)
		if err == nil && (title != "" || text != "") {
			return applyHeadless(f, title, desc, text)
		}
	}

	// Attempt standard HTTP fetch
	f = httpFetch(share, f)

	// If standard fetch was blocked or insufficient, fall back to headless browser
	if c.HeadlessEnabled && needsHeadlessFallback(share, f) {
		ctx, cancel := context.WithTimeout(context.Background(), headlessTimeout)
		defer cancel()
		title, desc, text, err := HeadlessExtract(ctx, share.URL, c.ChromeBin)
		if err == nil && (title != "" || text != "") {
			f = applyHeadless(f, title, desc, text)
			f.Err = nil
		}
	}

	// With headless disabled, wall text from httpFetch would otherwise land in
	// Text. When headless is on, needsHeadlessFallback + applyHeadless already
	// handled the wall, and a second guard here would wrongly wipe real content
	// that merely mentions a wall marker (e.g. an article about Cloudflare).
	if !c.HeadlessEnabled && IsLoginWall(f.Text) {
		f.Text = ""
		f.Notes = append(f.Notes, "login wall — content unavailable")
	}

	return f
}

// MediaMeta enriches a media link (YouTube/Instagram/Facebook) with
// yt-dlp metadata (title + description only). Non-media links fall back
// to the plain HTTP fetch. If yt-dlp fails on gated media (e.g. Instagram login wall),
// it falls back to headless extraction.
func (c Capture) MediaMeta(share Share) Fetched {
	f := Fetched{Kind: share.Kind, URL: share.URL, Caption: share.Caption}
	u, err := url.Parse(share.URL)
	if err != nil {
		f.Err = err
		return f
	}
	if !mediaRe.MatchString(u.Host) {
		return c.Fetch(share)
	}

	bin := c.YtDlpBin
	if bin == "" {
		bin = ytdlpBin
	}
	ctx, cancel := context.WithTimeout(context.Background(), fetchTimeout)
	defer cancel()
	args := []string{"--skip-download", "--dump-json", "--no-warnings"}
	if c.CookiesFile != "" {
		args = append(args, "--cookies", c.CookiesFile)
	}
	args = append(args, share.URL)
	out, err := exec.CommandContext(ctx, bin, args...).Output()
	if err != nil {
		f.Notes = append(f.Notes, "metadata unavailable")
		if embed := InstagramEmbedURL(share.URL); embed != "" && f.Caption == "" {
			if caption := c.embedCaption(embed); caption != "" {
				f.Caption = caption
			} else {
				f.Notes = append(f.Notes, "instagram caption unavailable")
			}
		}
		// Fallback to headless browser if yt-dlp failed and headless is enabled
		if c.HeadlessEnabled {
			hctx, hcancel := context.WithTimeout(context.Background(), headlessTimeout)
			defer hcancel()
			title, desc, text, herr := HeadlessExtract(hctx, share.URL, c.ChromeBin)
			if herr == nil && (title != "" || text != "") {
				return applyHeadless(f, title, desc, text)
			}
		}
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
	return f
}

// HeadlessExtract loads targetURL in a headless browser via chromedp and
// extracts the rendered title, meta description, and innerText.
func HeadlessExtract(ctx context.Context, targetURL string, chromeBin ...string) (title string, desc string, text string, err error) {
	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.NoSandbox,
		chromedp.Headless,
		chromedp.DisableGPU,
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("disable-extensions", true),
		chromedp.UserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
	)
	var bin string
	if len(chromeBin) > 0 {
		bin = chromeBin[0]
	}
	if bin != "" {
		opts = append(opts, chromedp.ExecPath(bin))
	}

	allocCtx, cancelAlloc := chromedp.NewExecAllocator(ctx, opts...)
	defer cancelAlloc()

	taskCtx, cancelTask := chromedp.NewContext(allocCtx)
	defer cancelTask()

	var renderedTitle string
	var renderedText string
	var metaDesc string

	tasks := chromedp.Tasks{
		chromedp.Navigate(targetURL),
		chromedp.Sleep(1 * time.Second),
		chromedp.Title(&renderedTitle),
		chromedp.Evaluate(`document.querySelector('meta[name="description"]')?.getAttribute('content') || document.querySelector('meta[property="og:description"]')?.getAttribute('content') || ''`, &metaDesc),
		chromedp.Evaluate(`document.body ? document.body.innerText : ''`, &renderedText),
	}

	if err := chromedp.Run(taskCtx, tasks); err != nil {
		return "", "", "", fmt.Errorf("capture: headless %s: %w", targetURL, err)
	}

	renderedText = strings.TrimSpace(stripTagsAndCondense(renderedText))
	return strings.TrimSpace(renderedTitle), strings.TrimSpace(metaDesc), renderedText, nil
}

func isGatedDomain(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	return gatedRe.MatchString(u.Host)
}

func needsHeadlessFallback(share Share, f Fetched) bool {
	if isGatedDomain(share.URL) {
		return true
	}
	if f.Err != nil {
		errStr := strings.ToLower(f.Err.Error())
		if strings.Contains(errStr, "status 403") || strings.Contains(errStr, "status 429") || strings.Contains(errStr, "status 401") {
			return true
		}
		return false
	}
	if len(strings.TrimSpace(f.Text)) < 80 {
		return true
	}
	return IsLoginWall(f.Text)
}

func httpFetch(share Share, f Fetched) Fetched {
	ctx, cancel := context.WithTimeout(context.Background(), fetchTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, share.URL, nil)
	if err != nil {
		f.Err = err
		return f
	}
	resp, err := httpClient.Do(req)
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
		// Truncate at rune boundary to avoid splitting multi-byte UTF-8.
		s = string([]rune(s)[:condenseMax])
	}
	if s == "" {
		return ""
	}
	return s + "\n"
}
