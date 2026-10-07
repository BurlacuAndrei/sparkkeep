package analyze

import (
	"net/url"
	"sort"
	"strings"

	"sparkkeep/internal/capture"
	"sparkkeep/internal/port"
)

// trackingParamPrefixes and exact tracking param names to strip during URL canonicalization.
var trackingParamNames = map[string]bool{
	"fbclid":  true,
	"gclid":   true,
	"gclsrc":  true,
	"msclkid": true,
	"dclid":   true,
	"twclid":  true,
	"igshid":  true,
	"mc_cid":  true,
	"mc_eid":  true,
	"_hsenc":  true,
	"_hsmi":   true,
	"yclid":   true,
}

func isTrackingParam(k string) bool {
	lk := strings.ToLower(k)
	if strings.HasPrefix(lk, "utm_") {
		return true
	}
	return trackingParamNames[lk]
}

// cleanPunctuation removes sentence punctuation that was captured or wraps a URL.
func cleanPunctuation(raw string) string {
	raw = strings.TrimSpace(raw)
	for len(raw) > 0 {
		first := raw[0]
		if first == '(' || first == '[' || first == '<' || first == '"' || first == '\'' {
			raw = raw[1:]
		} else {
			break
		}
	}
	for len(raw) > 0 {
		last := raw[len(raw)-1]
		if last == '.' || last == ',' || last == ';' || last == '!' || last == '?' ||
			last == '\'' || last == '"' || last == '>' || last == '<' {
			raw = raw[:len(raw)-1]
		} else if last == ')' && !strings.Contains(raw, "(") {
			raw = raw[:len(raw)-1]
		} else if last == ']' && !strings.Contains(raw, "[") {
			raw = raw[:len(raw)-1]
		} else {
			break
		}
	}
	return raw
}

// CanonicalURL parses raw URL, lowercases scheme/host, removes tracking parameters,
// normalizes trailing slashes, and deterministically formats the URL.
// Returns empty string if the URL is invalid or scheme is neither http nor https.
func CanonicalURL(raw string) string {
	cleaned := cleanPunctuation(raw)
	if cleaned == "" {
		return ""
	}

	u, err := url.Parse(cleaned)
	if err != nil {
		return ""
	}

	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return ""
	}
	u.Scheme = scheme

	host := strings.ToLower(u.Host)
	if host == "" {
		return ""
	}

	// Remove default ports
	if (scheme == "http" && strings.HasSuffix(host, ":80")) ||
		(scheme == "https" && strings.HasSuffix(host, ":443")) {
		host = host[:strings.LastIndex(host, ":")]
	}
	u.Host = host

	// Normalize path
	if u.Path == "/" {
		u.Path = ""
	} else if len(u.Path) > 1 && strings.HasSuffix(u.Path, "/") {
		u.Path = strings.TrimSuffix(u.Path, "/")
	}

	// Strip tracking parameters from query
	q := u.Query()
	hasChanges := false
	for k := range q {
		if isTrackingParam(k) {
			q.Del(k)
			hasChanges = true
		}
	}

	if hasChanges || len(q) > 0 {
		if len(q) == 0 {
			u.RawQuery = ""
		} else {
			u.RawQuery = q.Encode()
		}
	}

	// Strip tracking fragments (e.g. #utm_source=...)
	if strings.HasPrefix(strings.ToLower(u.Fragment), "utm_") {
		u.Fragment = ""
	}

	return u.String()
}

// IsGitHubURL returns true if the URL points to github.com.
func IsGitHubURL(rawOrCanon string) bool {
	u, err := url.Parse(rawOrCanon)
	if err != nil {
		return false
	}
	host := strings.ToLower(u.Host)
	return host == "github.com" || host == "www.github.com"
}

// GitHubRepoLabel extracts "owner/repo" from a GitHub URL if available.
func GitHubRepoLabel(rawOrCanon string) string {
	u, err := url.Parse(rawOrCanon)
	if err != nil {
		return rawOrCanon
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(parts) >= 2 && parts[0] != "" && parts[1] != "" {
		return parts[0] + "/" + parts[1]
	}
	return rawOrCanon
}

// ExtractDeterministicReferences scans text/caption/description in payload using capture.URLRe,
// canonicalizes all URLs, tags GitHub URLs as "repo", and deduplicates them.
func ExtractDeterministicReferences(payload capture.Fetched) []port.Reference {
	var texts []string
	if payload.URL != "" {
		texts = append(texts, payload.URL)
	}
	if payload.Title != "" {
		texts = append(texts, payload.Title)
	}
	if payload.Description != "" {
		texts = append(texts, payload.Description)
	}
	if payload.Text != "" {
		texts = append(texts, payload.Text)
	}
	if payload.Caption != "" {
		texts = append(texts, payload.Caption)
	}

	seenURLs := make(map[string]bool)
	var refs []port.Reference

	for _, txt := range texts {
		matches := capture.URLRe.FindAllString(txt, -1)
		for _, m := range matches {
			canon := CanonicalURL(m)
			if canon == "" || seenURLs[canon] {
				continue
			}
			seenURLs[canon] = true

			kind := port.RefKindURL
			label := canon
			if IsGitHubURL(canon) {
				kind = port.RefKindRepo
				label = GitHubRepoLabel(canon)
			}

			refs = append(refs, port.Reference{
				Kind:  kind,
				Label: label,
				URL:   canon,
			})
		}
	}

	// Sort references deterministically by URL
	sort.Slice(refs, func(i, j int) bool {
		return refs[i].URL < refs[j].URL
	})

	return refs
}

// normalizeReference cleans up kind, URL, and label for an individual reference.
func normalizeReference(ref port.Reference) port.Reference {
	ref.Kind = strings.ToLower(strings.TrimSpace(ref.Kind))
	ref.Label = strings.TrimSpace(ref.Label)
	ref.URL = strings.TrimSpace(ref.URL)

	if ref.URL != "" {
		canon := CanonicalURL(ref.URL)
		if canon != "" {
			ref.URL = canon
		}
		if IsGitHubURL(ref.URL) {
			ref.Kind = port.RefKindRepo
		}
	}

	if !port.ValidReferenceKind(ref.Kind) {
		if ref.URL != "" {
			if IsGitHubURL(ref.URL) {
				ref.Kind = port.RefKindRepo
			} else {
				ref.Kind = port.RefKindURL
			}
		} else {
			ref.Kind = port.RefKindOther
		}
	}

	if ref.Label == "" {
		if ref.Kind == port.RefKindRepo && ref.URL != "" {
			ref.Label = GitHubRepoLabel(ref.URL)
		} else if ref.URL != "" {
			ref.Label = ref.URL
		} else {
			ref.Label = ref.Kind
		}
	}

	return ref
}

// MergeReferences merges two lists of references, deduplicating by canonical URL or
// case-insensitive label (for entities without URLs). When duplicates match, more descriptive
// labels and specific kinds are preserved.
func MergeReferences(primary, secondary []port.Reference) []port.Reference {
	var merged []port.Reference

	addRef := func(incoming port.Reference) {
		incoming = normalizeReference(incoming)
		incomingCanon := CanonicalURL(incoming.URL)
		incomingLabel := strings.TrimSpace(incoming.Label)

		matchedIdx := -1
		for i, existing := range merged {
			existingCanon := CanonicalURL(existing.URL)
			existingLabel := strings.TrimSpace(existing.Label)

			if incomingCanon != "" && existingCanon != "" {
				if incomingCanon == existingCanon {
					matchedIdx = i
					break
				}
			} else if incomingCanon == "" && existingCanon == "" {
				if incomingLabel != "" && strings.EqualFold(incomingLabel, existingLabel) {
					matchedIdx = i
					break
				}
			} else {
				// One has URL, one does not. If labels match case-insensitively, merge them.
				if incomingLabel != "" && existingLabel != "" && strings.EqualFold(incomingLabel, existingLabel) {
					matchedIdx = i
					break
				}
			}
		}

		if matchedIdx >= 0 {
			target := &merged[matchedIdx]

			// Upgrade kind if target is generic
			if target.Kind == port.RefKindURL || target.Kind == port.RefKindOther || target.Kind == "" {
				if incoming.Kind != "" && incoming.Kind != port.RefKindURL && incoming.Kind != port.RefKindOther {
					target.Kind = incoming.Kind
				}
			}
			if IsGitHubURL(target.URL) || IsGitHubURL(incoming.URL) {
				target.Kind = port.RefKindRepo
			}

			// Attach URL if target lacked one
			if target.URL == "" && incoming.URL != "" {
				target.URL = incoming.URL
			}

			// Preserve richer label: if target's label is just the URL or repo path, and incoming is descriptive
			if (target.Label == "" || target.Label == target.URL || target.Label == GitHubRepoLabel(target.URL)) &&
				incoming.Label != "" && incoming.Label != incoming.URL {
				target.Label = incoming.Label
			}
		} else {
			merged = append(merged, incoming)
		}
	}

	for _, r := range primary {
		addRef(r)
	}
	for _, r := range secondary {
		addRef(r)
	}

	if merged == nil {
		merged = []port.Reference{}
	}
	return merged
}
