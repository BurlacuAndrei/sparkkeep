// Package capture recognizes what a user shared (link vs text) and fetches
// best-effort content into a normalized payload for the analyzer. Fetching
// never fails hard: on any error the Fetched.Err is set and the caller can
// fall back to the raw text.
package capture

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
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
	urlRe   = regexp.MustCompile(`https?://[^\s]+`)
	tagRe   = regexp.MustCompile(`<[^>]*>`)
	blankRe = regexp.MustCompile(`\n{3,}`)
	titleRe = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	descRe  = regexp.MustCompile(`(?is)<meta[^>]*name=["'](?:description|summary)["'][^>]*content=["']([^"']*)["'][^>]*>`)
	descRe2 = regexp.MustCompile(`(?is)<meta[^>]*content=["']([^"']*)["'][^>]*name=["'](?:description|summary)["'][^>]*>`)
	// Card metadata. og:* uses property=, twitter:* uses name=, and either may
	// come before or after content= in the tag, so every key needs two
	// orderings.
	ogTitleRe       = regexp.MustCompile(`(?is)<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']`)
	ogTitleRe2      = regexp.MustCompile(`(?is)<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:title["']`)
	twTitleRe       = regexp.MustCompile(`(?is)<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']*)["']`)
	twTitleRe2      = regexp.MustCompile(`(?is)<meta[^>]*content=["']([^"']*)["'][^>]*name=["']twitter:title["']`)
	ogDescRe        = regexp.MustCompile(`(?is)<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']`)
	ogDescRe2       = regexp.MustCompile(`(?is)<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:description["']`)
	twDescRe        = regexp.MustCompile(`(?is)<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']*)["']`)
	twDescRe2       = regexp.MustCompile(`(?is)<meta[^>]*content=["']([^"']*)["'][^>]*name=["']twitter:description["']`)
	mediaRe         = regexp.MustCompile(`(?i)(youtube|youtu\.be|instagram|facebook)`)
	gatedRe         = regexp.MustCompile(`(?i)(instagram\.com|facebook\.com|twitter\.com|x\.com|threads\.net)`)
	ytdlpBin        = "yt-dlp"
	headlessTimeout = 12 * time.Second
)

// genericTitles are bare site-name <title> values that social and gated pages
// ship while the real headline only exists in og:title or twitter:title.
var genericTitles = map[string]bool{
	"twitter": true, "x": true, "x.com": true,
	"instagram": true, "facebook": true, "threads": true,
	"home": true, "index": true, "untitled": true,
}

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

// headless renders targetURL in Chrome and returns title, desc, text. It is
// the ONLY caller of HeadlessExtract: with HeadlessEnabled false it returns
// zeros without touching chromedp, so a lightweight deploy (no chromium in
// the image) can never exec Chrome. An empty title and text means "nothing
// usable" to callers.
func (c Capture) headless(ctx context.Context, targetURL string) (title, desc, text string) {
	if !c.HeadlessEnabled {
		return "", "", ""
	}
	ctx, cancel := context.WithTimeout(ctx, headlessTimeout)
	defer cancel()
	title, desc, text, err := HeadlessExtract(ctx, targetURL, c.ChromeBin)
	if err != nil {
		return "", "", ""
	}
	return title, desc, text
}

// Fetch returns a Fetched for the given share. It NEVER returns a hard
// error: failures surface as Fetched.Err with empty Text. Text shares
// short-circuit to their caption. Gated or bot-blocked sites fall back
// to headless browser extraction when enabled.
func (c Capture) Fetch(share Share) Fetched {
	return c.fetch(context.Background(), share)
}

// FetchWithContext is like Fetch but uses the provided context for cancellation
// instead of creating background contexts. This allows the caller's deadline
// to interrupt slow fetches.
func (c Capture) FetchWithContext(ctx context.Context, share Share) Fetched {
	return c.fetch(ctx, share)
}

// fetch is the shared body of Fetch and FetchWithContext. Headless is only
// reached through c.headless, which no-ops when HeadlessEnabled is false.
func (c Capture) fetch(ctx context.Context, share Share) Fetched {
	f := Fetched{Kind: share.Kind, URL: share.URL, Caption: share.Caption}
	if share.Kind == KindText {
		f.Text = share.Caption
		return f
	}

	// For known gated platforms (Instagram, Twitter/X, etc.), try headless browser first
	if isGatedDomain(share.URL) {
		if title, desc, text := c.headless(ctx, share.URL); title != "" || text != "" {
			return applyHeadless(f, title, desc, text)
		}
	}

	// Attempt standard HTTP fetch
	f = httpFetchWithContext(ctx, share, f)

	// If standard fetch was blocked or insufficient, fall back to headless browser
	if needsHeadlessFallback(share, f) {
		if title, desc, text := c.headless(ctx, share.URL); title != "" || text != "" {
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

// httpFetchWithContext performs the plain HTTP GET behind fetch: status and
// content-type are checked before the body is trusted as text.
func httpFetchWithContext(ctx context.Context, share Share, f Fetched) Fetched {
	childCtx, cancel := context.WithTimeout(ctx, fetchTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(childCtx, http.MethodGet, share.URL, nil)
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
		// Fallback to headless browser if yt-dlp failed (no-op when disabled)
		if title, desc, text := c.headless(context.Background(), share.URL); title != "" || text != "" {
			return applyHeadless(f, title, desc, text)
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

// extractTitle prefers the OpenGraph card over <title>: gated and social
// pages put a bare site name in <title> and the real headline in og:title.
func extractTitle(doc string) string {
	if v := metaContent(doc, ogTitleRe, ogTitleRe2); v != "" {
		return v
	}
	var title string
	if m := titleRe.FindStringSubmatch(doc); m != nil {
		title = cleanMeta(m[1])
	}
	if title != "" && !genericTitles[strings.ToLower(title)] {
		return title
	}
	if v := metaContent(doc, twTitleRe, twTitleRe2); v != "" {
		return v
	}
	return title
}

// extractDescription checks the card tags in precedence order: OpenGraph,
// then the standard description/summary, then the Twitter card.
func extractDescription(doc string) string {
	return metaContent(doc, ogDescRe, ogDescRe2, descRe, descRe2, twDescRe, twDescRe2)
}

// metaContent returns the first non-empty content= value from the given
// patterns, each of which must capture the value as group 1.
func metaContent(doc string, res ...*regexp.Regexp) string {
	for _, re := range res {
		if m := re.FindStringSubmatch(doc); m != nil {
			if v := cleanMeta(m[1]); v != "" {
				return v
			}
		}
	}
	return ""
}

// cleanMeta trims surrounding whitespace and unescapes entities: card values
// arrive as "Tom &amp; Jerry&#10;watch now" and are useless untrimmed.
func cleanMeta(s string) string {
	return strings.TrimSpace(html.UnescapeString(s))
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
