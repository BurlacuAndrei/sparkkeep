package web

import (
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"

	"sparkkeep/internal/capture"
	"sparkkeep/internal/core"
)

// capture accepts a paste/paste-or-upload in one multipart request: an
// optional `file` part and an optional `text` or `url` field. At least one
// is required. Everything runs through the same core pipeline as Telegram.
func (a *api) capture(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.Header.Get("Content-Type"), "application/x-www-form-urlencoded") {
		a.captureShare(w, r)
		return
	}
	if strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		var req struct {
			URL     string `json:"url"`
			Text    string `json:"text"`
			Caption string `json:"caption"`
		}
		if err := decodeJSON(w, r, &req); err != nil {
			writeErr(w, http.StatusBadRequest, "bad json: "+err.Error())
			return
		}
		url := strings.TrimSpace(req.URL)
		text := strings.TrimSpace(req.Text)
		caption := strings.TrimSpace(req.Caption)
		raw := url
		if raw == "" {
			raw = text
		}
		if raw == "" {
			writeErr(w, http.StatusBadRequest, "provide a url or text")
			return
		}
		share := capture.Recognize(raw)
		if caption != "" {
			share.Caption = caption
		} else if text != "" && text != raw {
			share.Caption = text
		}
		ids, err := a.svc.CaptureShare(r.Context(), share)
		if err != nil {
			if errors.Is(err, core.ErrNoiseGateDiscarded) {
				writeJSON(w, http.StatusOK, map[string]any{
					"ok":        true,
					"card_ids":  []int64{},
					"discarded": true,
					"reason":    "engagement bait or promotional hype with zero technical substance",
				})
				return
			}
			a.fail(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "card_ids": ids})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, a.maxUpload+(1<<20))
	if err := r.ParseMultipartForm(4 << 20); err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			writeErr(w, http.StatusRequestEntityTooLarge, "upload too large")
			return
		}
		writeErr(w, http.StatusBadRequest, "bad multipart: "+err.Error())
		return
	}
	defer r.MultipartForm.RemoveAll()

	url := strings.TrimSpace(r.FormValue("url"))
	text := strings.TrimSpace(r.FormValue("text"))
	caption := strings.TrimSpace(r.FormValue("caption"))
	raw := url
	if raw == "" {
		raw = text
	}

	files, ferr := a.readFiles(r.MultipartForm)
	var tl *tooLargeError
	switch {
	case errors.As(ferr, &tl):
		writeErr(w, http.StatusRequestEntityTooLarge, tl.Error())
		return
	case ferr != nil:
		writeErr(w, http.StatusBadRequest, ferr.Error())
		return
	}

	var share capture.Share
	switch {
	case raw != "":
		share = capture.Recognize(raw)
		if caption != "" {
			share.Caption = caption
		} else if text != "" && text != raw {
			// Both url and text were supplied; keep the text as the caption
			// instead of silently dropping it.
			share.Caption = text
		}
		if len(files) > 0 {
			// A link with an attached image: keep the link, add the file so
			// its visual content is read too.
			share.Files = files
		}
	case len(files) > 0:
		kind := capture.KindFile
		if len(files) == 1 {
			kind = capture.KindForMime(files[0].Mime)
		}
		share = capture.Share{Kind: kind, Files: files}
	default:
		writeErr(w, http.StatusBadRequest, "provide a file, url, or text")
		return
	}

	ids, err := a.svc.CaptureShare(r.Context(), share)
	if err != nil {
		if errors.Is(err, core.ErrNoiseGateDiscarded) {
			writeJSON(w, http.StatusOK, map[string]any{
				"ok":        true,
				"card_ids":  []int64{},
				"discarded": true,
				"reason":    "engagement bait or promotional hype with zero technical substance",
			})
			return
		}
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "card_ids": ids})
}

// captureShare handles the PWA Web Share Target post: a form-encoded
// title/text/url from the OS share sheet. There is no page to render the
// response in, so it redirects back to the dashboard with ?captured=true and
// the SPA confirms + reloads. A client that asked for JSON still gets it.
func (a *api) captureShare(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writeErr(w, http.StatusBadRequest, "bad form: "+err.Error())
		return
	}
	targetURL := strings.TrimSpace(r.FormValue("url"))
	title := strings.TrimSpace(r.FormValue("title"))
	text := strings.TrimSpace(r.FormValue("text"))

	var share capture.Share
	if targetURL != "" {
		caption := text
		// The share sheet duplicates the URL as the title often enough that
		// repeating it in the caption would be noise.
		if title != "" && title != targetURL {
			if caption == "" {
				caption = title
			} else {
				caption = title + " — " + caption
			}
		}
		share = capture.Share{Kind: capture.KindLink, URL: targetURL, Caption: caption}
	} else {
		share = a.svc.Fetcher.Recognize(text)
	}

	ids, err := a.svc.CaptureShare(r.Context(), share)
	if err != nil {
		if errors.Is(err, core.ErrNoiseGateDiscarded) {
			if strings.Contains(r.Header.Get("Accept"), "application/json") {
				writeJSON(w, http.StatusOK, map[string]any{
					"ok":        true,
					"card_ids":  []int64{},
					"cards":     []int64{},
					"discarded": true,
					"reason":    "engagement bait or promotional hype with zero technical substance",
				})
				return
			}
			http.Redirect(w, r, "/?captured=true&discarded=true", http.StatusSeeOther)
			return
		}
		a.fail(w, err)
		return
	}
	if strings.Contains(r.Header.Get("Accept"), "application/json") {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "cards": ids})
		return
	}
	http.Redirect(w, r, "/?captured=true", http.StatusSeeOther)
}

// readFiles extracts every uploaded file part, rejecting anything over the
// configured cap. The cap is enforced again per file because MaxBytesReader
// covers the whole request, not each part.
func (a *api) readFiles(f *multipart.Form) ([]capture.File, error) {
	if f == nil || len(f.File) == 0 {
		return nil, nil
	}
	var out []capture.File
	for _, h := range f.File["file"] {
		fh, err := h.Open()
		if err != nil {
			return nil, err
		}
		data, rerr := io.ReadAll(io.LimitReader(fh, a.maxUpload+1))
		fh.Close()
		if rerr != nil {
			return nil, rerr
		}
		if int64(len(data)) > a.maxUpload {
			return nil, &tooLargeError{name: h.Filename}
		}
		if len(data) == 0 {
			continue // an empty part is not a capture
		}
		out = append(out, capture.File{
			Name: filepath.Base(h.Filename),
			Mime: h.Header.Get("Content-Type"),
			Data: data,
		})
	}
	return out, nil
}

type tooLargeError struct{ name string }

func (e *tooLargeError) Error() string {
	return "file too large: " + e.name
}

func (a *api) getCapture(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusBadRequest, "bad id")
		return
	}
	cap, err := a.store.GetCapture(r.Context(), id)
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "data": cap})
}
