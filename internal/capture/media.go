package capture

import "strings"

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

// isLoginWall reports whether text is a bot wall or login prompt rather than
// content we extracted. Callers must not treat it as Text: it belongs in
// Fetched.Notes so the analyzer qualifies the card instead of inventing
// content out of a login form.
func isLoginWall(text string) bool {
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
