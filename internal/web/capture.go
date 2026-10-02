package web

import (
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"sparkkeep/internal/capture"
)

// capture accepts a paste/paste-or-upload in one multipart request: an
// optional `file` part and an optional `text` or `url` field. At least one
// is required. Everything runs through the same core pipeline as Telegram.
func (a *api) capture(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, a.maxUpload+(1<<20))
	if err := r.ParseMultipartForm(4 << 20); err != nil {
		writeErr(w, http.StatusBadRequest, "bad multipart: "+err.Error())
		return
	}
	defer r.MultipartForm.RemoveAll()

	raw := strings.TrimSpace(r.FormValue("url"))
	if raw == "" {
		raw = strings.TrimSpace(r.FormValue("text"))
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
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "card_ids": ids})
}

// readFiles extracts every uploaded file part, rejecting anything over the
// configured cap. The cap is enforced again per file because MaxBytesReader
// covers the whole request, not each part.
func (a *api) readFiles(f *multipart.Form) ([]capture.File, error) {
	if f == nil || len(f.File) == 0 {
		return nil, nil
	}
	var out []capture.File
	for _, headers := range f.File {
		for _, h := range headers {
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
			out = append(out, capture.File{
				Name: filepath.Base(h.Filename),
				Mime: h.Header.Get("Content-Type"),
				Data: data,
			})
		}
	}
	return out, nil
}

type tooLargeError struct{ name string }

func (e *tooLargeError) Error() string {
	return "file too large: " + e.name
}

// media serves a retained upload. filepath.Base is the sanitisation that
// prevents traversal: a name containing separators can only ever resolve to a
// file directly inside uploadDir.
func (a *api) media(w http.ResponseWriter, r *http.Request) {
	name := filepath.Base(r.PathValue("name"))
	if name == "" || name == "." || name == "/" || a.uploadDir == "" {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	full := filepath.Join(a.uploadDir, name)
	if _, err := os.Stat(full); err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	f, err := os.Open(full)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	defer f.Close()
	if ct := ctByExt(name); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	http.ServeContent(w, r, name, time.Time{}, f)
}

func ctByExt(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	case ".mp4":
		return "video/mp4"
	case ".pdf":
		return "application/pdf"
	case ".ogg":
		return "audio/ogg"
	case ".wav":
		return "audio/wav"
	case ".webm":
		return "audio/webm"
	}
	return ""
}
