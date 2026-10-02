package capture

import (
	"context"
	"io"
	"net/http"
	"os/exec"
	"regexp"
	"strings"
)

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
	igRe        = regexp.MustCompile(`(?i)^(?:https?://)?(?:www\.)?instagram\.com/(p|reel|reels|tv)/([A-Za-z0-9_-]+)`)
	igCaptionRe = regexp.MustCompile(`(?is)<div[^>]*class="[^"]*Caption\b[^"]*"[^>]*>(.*?)</div>`)
	igOGDescRe  = regexp.MustCompile(`(?is)<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']`)
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
	return "https://www.instagram.com/" + m[1] + "/" + m[2] + "/embed/captioned/"
}

// ExtractInstagramCaption pulls the caption out of a rendered embed page.
// The Caption div is preferred; og:description is the guaranteed fallback
// because it survives in the server-rendered shell.
func ExtractInstagramCaption(html string) string {
	if m := igCaptionRe.FindStringSubmatch(html); m != nil {
		if t := strings.TrimSpace(stripTagsAndCondense(m[1])); t != "" {
			return t
		}
	}
	if m := igOGDescRe.FindStringSubmatch(html); m != nil {
		return strings.TrimSpace(m[1])
	}
	return ""
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
	args := []string{
		"--skip-download", "--no-warnings",
		"--write-auto-subs", "--write-subs",
		"--sub-langs", langs, "--sub-format", "vtt",
		"--output", "-",
	}
	if c.CookiesFile != "" {
		args = append(args, "--cookies", c.CookiesFile)
	}
	args = append(args, share.URL)
	ctx, cancel := context.WithTimeout(context.Background(), fetchTimeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, bin, args...).Output()
	if err != nil {
		return ""
	}
	return ParseVTT(string(out))
}

// embedCaption best-effort-fetches an Instagram captioned-embed page and
// returns its caption. Returns "" on any failure; the caller emits a Note.
func (c Capture) embedCaption(embedURL string) string {
	ctx, cancel := context.WithTimeout(context.Background(), fetchTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, embedURL, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36")
	resp, err := httpClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return ""
	}
	return ExtractInstagramCaption(string(body))
}
