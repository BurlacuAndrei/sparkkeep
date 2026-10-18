package capture

import (
	"context"
	"fmt"
	"html"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// subtitlesTimeout is generous: a yt-dlp extractor run plus a timedtext fetch
// routinely exceeds the 5s fetchTimeout.
var subtitlesTimeout = 30 * time.Second

// KindForMime maps a mime type to a Share kind. Unknown types are files, so
// an unexpected upload still gets captured and read rather than dropped.
func KindForMime(mime string) string {
	m := strings.ToLower(strings.TrimSpace(mime))
	if i := strings.IndexByte(m, ';'); i >= 0 {
		m = strings.TrimSpace(m[:i])
	}
	switch {
	case strings.HasPrefix(m, "image/"):
		return KindImage
	case strings.HasPrefix(m, "audio/"):
		return KindAudio
	case strings.HasPrefix(m, "video/"):
		return KindVideo
	default:
		return KindFile
	}
}

// wallMarkers are the bot-wall and login-page tells we already treat as
// "not real content" when deciding whether to retry with a headless browser.
// Matched case-insensitively.
var wallMarkers = []string{
	"enable javascript",
	"javascript is required",
	"please turn javascript on",
	"just a moment...",
	"security check",
	"verify you are human",
	"cloudflare",
	"access denied",
	"bot detection",
	"log in to instagram",
	"log in to facebook",
	"log in to twitter",
	"login to continue",
	"sign in to continue",
}

// IsLoginWall reports whether text is a bot wall or login prompt rather than
// content we extracted. Callers must not treat it as Text: it belongs in
// Fetched.Notes so the analyzer qualifies the card instead of inventing
// content out of a login form.
func IsLoginWall(text string) bool {
	t := strings.ToLower(text)
	for _, m := range wallMarkers {
		if strings.Contains(t, m) {
			return true
		}
	}
	return false
}

// ParseVTT strips a WebVTT subtitle track down to its cue text: the WEBVTT
// header, numeric cue ids, and "hh:mm:ss.mmm --> hh:mm:ss.mmm" timestamps are
// dropped, one cue per line is kept.
func ParseVTT(vtt string) string {
	var cues []string
	for _, raw := range strings.Split(vtt, "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || line == "WEBVTT" || strings.Contains(line, "-->") || isDigits(line) {
			continue
		}
		cues = append(cues, line)
	}
	return strings.Join(cues, "\n")
}

func isDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

var (
	igRe        = regexp.MustCompile(`(?i)^(?:https?://)?(?:www\.|m\.)?instagram\.com/(p|reel|reels|tv)/([A-Za-z0-9_-]+)`)
	igCaptionRe = regexp.MustCompile(`(?is)<div[^>]*class="[^"]*Caption\b[^"]*"[^>]*>(.*?)</div>`)
	igOGDescRe  = regexp.MustCompile(`(?is)<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']`)
	igOGDescRe2 = regexp.MustCompile(`(?is)<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:description["']`)
)

// InstagramEmbedURL returns the captioned-embed URL for an Instagram post,
// or "" when rawURL is not an Instagram post/reel/tv link.
//
// ponytail: only the four public path shapes are handled. Shortcode formats
// (vanity URLs) fall through to the empty-string case and surface as a Note
// rather than a fetch attempt.
func InstagramEmbedURL(rawURL string) string {
	m := igRe.FindStringSubmatch(strings.TrimSpace(rawURL))
	if m == nil {
		return ""
	}
	kind := strings.ToLower(m[1])
	if kind == "reels" {
		kind = "reel"
	}
	return "https://www.instagram.com/" + kind + "/" + m[2] + "/embed/captioned/"
}

// ExtractInstagramCaption pulls the caption out of a rendered embed page.
// The Caption div is preferred; og:description is the guaranteed fallback
// because it survives in the server-rendered shell. og:description is tried
// in both attribute orders (Instagram emits either).
//
// ponytail: the Caption-div regex stops at the first </div>, so a caption
// with nested markup is truncated — the og:description fallback carries the
// full text. Swap in an HTML parser only if that proves insufficient.
func ExtractInstagramCaption(page string) string {
	if m := igCaptionRe.FindStringSubmatch(page); m != nil {
		if t := strings.TrimSpace(stripTagsAndCondense(m[1])); t != "" {
			return t
		}
	}
	for _, re := range []*regexp.Regexp{igOGDescRe, igOGDescRe2} {
		if m := re.FindStringSubmatch(page); m != nil {
			return strings.TrimSpace(html.UnescapeString(m[1]))
		}
	}
	return ""
}

// ExtractInstagramImageURLs extracts slide image URLs from an Instagram embed HTML page.
// It checks <img> elements with EmbeddedMediaImage (selecting the highest resolution
// candidate from srcset when available) and display_url fields in embedded JSON.
func ExtractInstagramImageURLs(page string) []string {
	var candidates []string
	seen := make(map[string]bool)

	addURL := func(raw string) {
		u := strings.TrimSpace(html.UnescapeString(strings.ReplaceAll(raw, `\/`, "/")))
		if u == "" || seen[u] {
			return
		}
		if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
			return
		}
		seen[u] = true
		candidates = append(candidates, u)
	}

	imgRe := regexp.MustCompile(`(?is)<img\b[^>]*>`)
	classRe := regexp.MustCompile(`(?is)\bclass=["']([^"']+)["']`)
	srcRe := regexp.MustCompile(`(?is)\bsrc=["']([^"']+)["']`)
	srcsetRe := regexp.MustCompile(`(?is)\bsrcset=["']([^"']+)["']`)

	for _, imgTag := range imgRe.FindAllString(page, -1) {
		classMatch := classRe.FindStringSubmatch(imgTag)
		isMediaImage := false
		if classMatch != nil && strings.Contains(classMatch[1], "EmbeddedMediaImage") {
			isMediaImage = true
		}
		if !isMediaImage && !strings.Contains(imgTag, "EmbeddedMediaImage") {
			continue
		}

		if sm := srcsetRe.FindStringSubmatch(imgTag); sm != nil && strings.TrimSpace(sm[1]) != "" {
			bestURL := pickHighestFromSrcset(sm[1])
			if bestURL != "" {
				addURL(bestURL)
				continue
			}
		}

		if sm := srcRe.FindStringSubmatch(imgTag); sm != nil && strings.TrimSpace(sm[1]) != "" {
			addURL(sm[1])
		}
	}

	displayURLRe := regexp.MustCompile(`"display_url"\s*:\s*"([^"]+)"`)
	for _, m := range displayURLRe.FindAllStringSubmatch(page, -1) {
		addURL(m[1])
	}

	if len(candidates) == 0 {
		for _, imgTag := range imgRe.FindAllString(page, -1) {
			if strings.Contains(imgTag, "cdninstagram.com") || strings.Contains(imgTag, "fbcdn.net") {
				if sm := srcRe.FindStringSubmatch(imgTag); sm != nil {
					addURL(sm[1])
				}
			}
		}
	}

	if len(candidates) > 10 {
		candidates = candidates[:10]
	}
	return candidates
}

func pickHighestFromSrcset(srcset string) string {
	parts := strings.Split(srcset, ",")
	var bestURL string
	maxDim := -1
	dimRe := regexp.MustCompile(`(\d+)[wx]`)
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		fields := strings.Fields(part)
		if len(fields) == 0 {
			continue
		}
		u := fields[0]
		dim := 0
		if len(fields) > 1 {
			if m := dimRe.FindStringSubmatch(fields[1]); m != nil {
				dim, _ = strconv.Atoi(m[1])
			}
		}
		if dim > maxDim || bestURL == "" {
			maxDim = dim
			bestURL = u
		}
	}
	return bestURL
}

// applyHeadless folds headless-extraction output into f. A detected login or
// bot wall becomes a Note and leaves Text empty — promoting wall text into
// Text is the exact bug this replaces.
func applyHeadless(f Fetched, title, desc, text string) Fetched {
	if title != "" {
		f.Title = strings.TrimSpace(title)
	}
	if IsLoginWall(text) {
		f.Text = ""
		f.Notes = append(f.Notes, "instagram login wall — caption unavailable")
		return f
	}
	if desc != "" {
		f.Description = desc
	}
	if text != "" {
		f.Text = text
	}
	return f
}

// Subtitles returns a transcript for share's URL using yt-dlp's subtitle
// writers, or "" when none are available. Never returns an error: absence of
// subtitles is normal and the caller turns it into a Note.
func (c Capture) Subtitles(share Share) string {
	bin := c.YtDlpBin
	if bin == "" {
		bin = ytdlpBin
	}
	langs := c.TranscriptLangs
	if langs == "" {
		langs = "en.*,en"
	}
	// yt-dlp's subtitle writers cannot stream to stdout (`--output -` writes a
	// file literally named "-.en.vtt"), so write into a temp dir and read back.
	dir, err := os.MkdirTemp("", "sparkkeep-subs")
	if err != nil {
		return ""
	}
	defer os.RemoveAll(dir)
	args := []string{
		"--skip-download", "--no-warnings",
		"--write-auto-subs", "--write-subs",
		"--sub-langs", langs, "--sub-format", "vtt",
		"--paths", dir, "--output", "sub.%(ext)s",
	}
	if c.CookiesFile != "" {
		args = append(args, "--cookies", c.CookiesFile)
	}
	args = append(args, share.URL)
	ctx, cancel := context.WithTimeout(context.Background(), subtitlesTimeout)
	defer cancel()
	if _, err := exec.CommandContext(ctx, bin, args...).Output(); err != nil {
		return ""
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return ""
	}
	var b strings.Builder
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".vtt") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			continue
		}
		b.Write(data)
		b.WriteByte('\n')
	}
	// `--sub-langs en.*,en` can yield both a manual and an auto track, so the
	// concatenation duplicates every cue. Drop exact-repeat lines.
	// ponytail: dedup is lossy if a cue genuinely repeats verbatim; acceptable
	// for best-effort transcript text.
	seen := map[string]bool{}
	var cues []string
	for _, ln := range strings.Split(ParseVTT(b.String()), "\n") {
		if ln == "" || seen[ln] {
			continue
		}
		seen[ln] = true
		cues = append(cues, ln)
	}
	return strings.Join(cues, "\n")
}

// fetchInstagramEmbed best-effort-fetches an Instagram captioned-embed page,
// extracts its caption, and downloads up to 10 slide image files.
func (c Capture) fetchInstagramEmbed(embedURL string) (string, []File) {
	ctx, cancel := context.WithTimeout(context.Background(), fetchTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, embedURL, nil)
	if err != nil {
		return "", nil
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36")
	resp, err := httpClient.Do(req)
	if err != nil {
		return "", nil
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return "", nil
	}
	htmlStr := string(body)
	caption := ExtractInstagramCaption(htmlStr)
	imageURLs := ExtractInstagramImageURLs(htmlStr)

	var files []File
	for i, imgURL := range imageURLs {
		if len(files) >= 10 {
			break
		}
		imgReq, err := http.NewRequestWithContext(ctx, http.MethodGet, imgURL, nil)
		if err != nil {
			continue
		}
		imgResp, err := httpClient.Do(imgReq)
		if err != nil {
			continue
		}
		if imgResp.StatusCode != http.StatusOK {
			imgResp.Body.Close()
			continue
		}
		data, err := io.ReadAll(io.LimitReader(imgResp.Body, 10<<20))
		imgResp.Body.Close()
		if err != nil || len(data) == 0 {
			continue
		}
		mime := imgResp.Header.Get("Content-Type")
		if mime == "" || !strings.HasPrefix(mime, "image/") {
			mime = "image/jpeg"
		}
		files = append(files, File{
			Name: fmt.Sprintf("slide-%d.jpg", i+1),
			Mime: mime,
			Data: data,
		})
	}
	return caption, files
}

// embedCaption best-effort-fetches an Instagram captioned-embed page and
// returns its caption. Returns "" on any failure; the caller emits a Note.
func (c Capture) embedCaption(embedURL string) string {
	caption, _ := c.fetchInstagramEmbed(embedURL)
	return caption
}
