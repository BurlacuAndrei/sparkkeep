package web

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"sparkkeep/internal/obsidian"
	"sparkkeep/internal/port"
)

type LibraryExportPayload struct {
	Version    string          `json:"version"`
	Generator  string          `json:"generator"`
	ExportedAt string          `json:"exported_at"`
	Metrics    map[string]int  `json:"metrics"`
	Cards      []port.Card     `json:"cards"`
	Tags       []port.Tag      `json:"tags"`
	Playbooks  []port.Playbook `json:"playbooks"`
}

func (a *api) exportLibraryJSON(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cards, err := a.store.ListCards(ctx, port.CardFilter{Limit: 100000})
	if err != nil {
		a.fail(w, err)
		return
	}
	tags, _ := a.store.ListTags(ctx)
	playbooks, _ := a.store.ListPlaybooks(ctx)

	payload := LibraryExportPayload{
		Version:    "1.0",
		Generator:  "Sparkkeep 0.9.0",
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		Metrics: map[string]int{
			"card_count":     len(cards),
			"tag_count":      len(tags),
			"playbook_count": len(playbooks),
		},
		Cards:     cards,
		Tags:      tags,
		Playbooks: playbooks,
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"sparkkeep-library-%s.json\"", time.Now().UTC().Format("20060102-150405")))
	_ = json.NewEncoder(w).Encode(payload)
}

func (a *api) exportLibraryZip(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var exports []port.CardExport
	if a.svc != nil {
		var err error
		exports, err = a.svc.BuildLibraryExports(ctx)
		if err != nil {
			a.fail(w, err)
			return
		}
	} else {
		cards, err := a.store.ListCards(ctx, port.CardFilter{Limit: 100000})
		if err != nil {
			a.fail(w, err)
			return
		}
		for _, c := range cards {
			if c.Status == port.StatusShelved {
				continue
			}
			var latestDone *port.Research
			history, _ := a.store.ListResearchByCard(ctx, c.ID)
			for i := len(history) - 1; i >= 0; i-- {
				if history[i].Status == port.ResearchStateDone || history[i].Status == "done" {
					latestDone = &history[i]
					break
				}
			}
			exports = append(exports, port.CardExport{
				Card:     c,
				Research: latestDone,
			})
		}
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"sparkkeep-archive-%s.zip\"", time.Now().UTC().Format("20060102-150405")))

	zw := zip.NewWriter(w)
	defer zw.Close()

	for _, exp := range exports {
		c := exp.Card
		folder := "Inbox"
		switch c.Status {
		case port.StatusInProgress:
			folder = "Doing"
		case port.StatusReview:
			folder = "Review"
		case port.StatusDone:
			folder = "Done"
		case port.StatusShelved:
			folder = "Shelved"
		}
		filename := fmt.Sprintf("cards/%s/%d_%s", folder, c.ID, obsidian.SanitizeFilename(c.ID, c.Title))
		f, err := zw.Create(filename)
		if err != nil {
			continue
		}
		md := obsidian.CardExportToMarkdown(exp)
		_, _ = f.Write([]byte(md))
	}
}
