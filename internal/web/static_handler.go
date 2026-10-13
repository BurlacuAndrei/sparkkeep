package web

import (
	"embed"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

//go:embed dist/*
var distFS embed.FS

// staticFiles roots the embed at the dist/assets subdirectory so /assets/app.js
// resolves to dist/assets/app.js.
func staticFiles() http.Handler {
	sub, err := fs.Sub(distFS, "dist/assets")
	if err != nil {
		panic(err)
	}
	return http.FileServer(http.FS(sub))
}

// cacheAssets marks built assets as cacheable; index.html (which can change
// between deploys) is deliberately excluded.
func cacheAssets(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=3600")
		h.ServeHTTP(w, r)
	})
}

func (a *api) index(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	b, err := distFS.ReadFile("dist/index.html")
	if err != nil {
		a.fail(w, err)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write(b)
}

// serveEmbedded returns a handler for one PWA file copied out of
// frontend/public/ by the Vite build. The content type is explicit because
// the browser rejects a manifest or a worker served as octet-stream.
func serveEmbedded(path, contentType string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		b, err := distFS.ReadFile(path)
		if err != nil {
			http.Error(w, "pwa asset not built", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", contentType)
		w.Write(b)
	}
}

// media serves a retained upload. filepath.Base is the sanitisation that
// prevents traversal: a name containing separators can only ever resolve to a
// file directly inside uploadDir.
func (a *api) media(w http.ResponseWriter, r *http.Request) {
	name := filepath.Base(r.PathValue("name"))
	if name == "" || name == "." || name == ".." || name == "/" || a.uploadDir == "" {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	full := filepath.Join(a.uploadDir, name)
	// Lstat, not Stat: reject directories and symlinks so a planted link cannot
	// escape uploadDir, and avoid the Stat/Open TOCTOU pair.
	fi, err := os.Lstat(full)
	if err != nil || fi.IsDir() || fi.Mode()&os.ModeSymlink != 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	f, err := os.Open(full)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	defer f.Close()
	// Never let ServeContent sniff an executable type (SVG/HTML inline =
	// stored XSS). Known media types are served inline; everything else is an
	// opaque download.
	ct := ctByExt(name)
	if ct == "" {
		ct = "application/octet-stream"
		w.Header().Set("Content-Disposition", "attachment")
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("X-Content-Type-Options", "nosniff")
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
