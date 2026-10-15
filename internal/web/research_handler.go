package web

import (
	"context"
	"fmt"
	"html/template"
	"net/http"
	"strings"
	"time"

	"sparkkeep/internal/port"
)

// researchReport renders a single research row as a readable page for the
// link Telegram sends. Findings are model markdown, kept as escaped
// pre-wrapped text — no markdown renderer dependency.
const researchReportHTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>sparkkeep · research #{{.ID}}</title>
<style>
  :root {
    --bg: #0f172a;
    --surface: #1e293b;
    --border: #334155;
    --text: #f8fafc;
    --text-muted: #94a3b8;
    --primary: #38bdf8;
    --emerald: #34d399;
    --amber: #fbbf24;
    --rose: #f87171;
  }
  body { margin: 0 auto; max-width: 54rem; padding: 32px 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
  a { color: var(--primary); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .header { border-bottom: 1px solid var(--border); padding-bottom: 20px; margin-bottom: 24px; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .badge-pursue { background: rgba(52, 211, 153, 0.2); color: var(--emerald); border: 1px solid rgba(52, 211, 153, 0.4); }
  .badge-watch { background: rgba(251, 191, 36, 0.2); color: var(--amber); border: 1px solid rgba(251, 191, 36, 0.4); }
  .badge-skip { background: rgba(248, 113, 113, 0.2); color: var(--rose); border: 1px solid rgba(248, 113, 113, 0.4); }
  .card-box { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin-bottom: 20px; }
  .meta { color: var(--text-muted); font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 14px; }
  th { color: var(--text-muted); font-weight: 600; }
  pre { white-space: pre-wrap; word-wrap: break-word; color: #cbd5e1; font-family: inherit; line-height: 1.6; }
  .error { color: var(--rose); }
  ul { padding-left: 20px; }
  li { margin-bottom: 6px; }
</style>
</head>
<body>
  <p><a href="/">&larr; sparkkeep dashboard</a></p>
  <div class="header">
    <h2>Research #{{.ID}} <span class="meta">[{{.Status}}]</span></h2>
    {{if .Query}}<p class="meta"><strong>Query:</strong> {{.Query}}</p>{{end}}
    {{if .Tokens}}<p class="meta"><strong>Tokens:</strong> {{.Tokens}}</p>{{end}}
    {{if .Error}}<p class="error">{{.Error}}</p>{{end}}
  </div>

  {{if and .Result .Result.Verdict}}
  <div class="card-box">
    <h3>Executive Verdict</h3>
    <p>
      {{if eq .Result.Verdict.Recommendation "pursue"}}<span class="badge badge-pursue">PURSUE</span>{{end}}
      {{if eq .Result.Verdict.Recommendation "watch"}}<span class="badge badge-watch">WATCH</span>{{end}}
      {{if eq .Result.Verdict.Recommendation "skip"}}<span class="badge badge-skip">SKIP</span>{{end}}
      &nbsp; Confidence: <strong>{{.Result.Verdict.Confidence}}</strong>
      {{if .Result.Verdict.ForWhom}} &nbsp;·&nbsp; Target: <em>{{.Result.Verdict.ForWhom}}</em>{{end}}
    </p>
    {{if .Result.Verdict.NextActions}}
    <h4>Recommended Next Actions</h4>
    <ul>
      {{range .Result.Verdict.NextActions}}<li>{{.}}</li>{{end}}
    </ul>
    {{end}}
  </div>
  {{end}}

  {{if and .Result .Result.Claims}}
  <div class="card-box">
    <h3>Claim Verification</h3>
    <table>
      <thead><tr><th>Claim</th><th>Status</th><th>Rationale</th><th>Sources</th></tr></thead>
      <tbody>
        {{range .Result.Claims}}
        <tr>
          <td><strong>{{.Claim}}</strong></td>
          <td>{{.Status}}</td>
          <td>{{.Rationale}}</td>
          <td>{{range .Sources}}<code>[{{.}}]</code> {{end}}</td>
        </tr>
        {{end}}
      </tbody>
    </table>
  </div>
  {{end}}

  {{if and .Result .Result.Landscape}}
  <div class="card-box">
    <h3>Competitive Landscape</h3>
    <table>
      <thead><tr><th>Name</th><th>Summary</th><th>Difference</th><th>Sources</th></tr></thead>
      <tbody>
        {{range .Result.Landscape}}
        <tr>
          <td>{{if .URL}}<a href="{{.URL}}" target="_blank" rel="noopener">{{.Name}}</a>{{else}}{{.Name}}{{end}}</td>
          <td>{{.OneLiner}}</td>
          <td>{{.HowItDiffers}}</td>
          <td>{{range .Sources}}<code>[{{.}}]</code> {{end}}</td>
        </tr>
        {{end}}
      </tbody>
    </table>
  </div>
  {{end}}

  {{if .Findings}}
  <div class="card-box">
    <h3>Findings Report</h3>
    <pre>{{.Findings}}</pre>
  </div>
  {{end}}

  {{if .Sources}}
  <div class="card-box">
    <h3>Sources & Citations</h3>
    <ul>
      {{range .Sources}}
      <li id="{{.ID}}">
        <strong>[{{.ID}}]</strong> <a href="{{.URL}}" target="_blank" rel="noopener">{{.Title}}</a>
        <span class="meta">({{if .URL}}{{.URL}}{{else}}no url{{end}} [{{.Origin}}])</span>
      </li>
      {{end}}
    </ul>
  </div>
  {{end}}
</body>
</html>`

// researchTmpl is the parsed template for the research report page.
// Parsed once at init — never changes between requests.
var researchTmpl = template.Must(template.New("research").Parse(researchReportHTML))

func (a *api) listResearch(w http.ResponseWriter, r *http.Request) {
	list, err := a.store.ListResearch(r.Context())
	if err != nil {
		a.fail(w, err)
		return
	}
	if list == nil {
		list = []port.Research{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "research": list})
}

// triggerResearch ackboards the request immediately ({"accepted":true}) and
// runs the bounded research pass in the background — same goroutine pattern
// as the Telegram callback handler.
func (a *api) triggerResearch(w http.ResponseWriter, r *http.Request) {
	var b struct {
		CardID     int64  `json:"card_id"`
		PlaybookID *int64 `json:"playbook_id"`
	}
	if err := decodeJSON(w, r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	if b.CardID <= 0 {
		writeErr(w, http.StatusBadRequest, "bad card_id")
		return
	}
	if active, err := a.store.HasActiveResearch(r.Context(), b.CardID); err != nil {
		a.fail(w, err)
		return
	} else if active {
		writeErr(w, http.StatusConflict, "research already running")
		return
	}
	pb, err := a.store.ResolvePlaybook(r.Context(), b.CardID, b.PlaybookID)
	if err != nil {
		a.fail(w, err)
		return
	}
	a.svc.GoResearch(context.WithoutCancel(r.Context()), b.CardID, &pb.ID)
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"accepted": true,
		"playbook": pb,
	})
}

// getResearch serves the single-row report as HTML for the Telegram link.
// A JSON client (Accept: application/json or ?format=json) gets the raw row
// instead — the dashboard reads the findings to turn them into checklist items.
func (a *api) getResearch(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusBadRequest, "bad id")
		return
	}
	row, err := a.store.GetResearch(r.Context(), id)
	if err != nil {
		a.fail(w, err)
		return
	}
	if r.Header.Get("Accept") == "application/json" || r.URL.Query().Get("format") == "json" {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "data": row})
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := researchTmpl.Execute(w, row); err != nil {
		a.fail(w, err)
		return
	}
}

func (a *api) setResearchFeedback(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusBadRequest, "bad research id")
		return
	}
	var b struct {
		Rating  string `json:"rating"`
		Comment string `json:"comment"`
	}
	if err := decodeJSON(w, r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	b.Rating = strings.TrimSpace(b.Rating)
	if b.Rating != "thumbs_up" && b.Rating != "thumbs_down" {
		writeErr(w, http.StatusBadRequest, "invalid rating: must be 'thumbs_up' or 'thumbs_down'")
		return
	}
	if err := a.store.SetResearchFeedback(r.Context(), id, b.Rating, b.Comment); err != nil {
		a.fail(w, err)
		return
	}
	res, err := a.store.GetResearch(r.Context(), id)
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"research": res,
	})
}

func (a *api) getPipelineMetrics(w http.ResponseWriter, r *http.Request) {
	metrics, err := a.store.GetPipelineMetrics(r.Context())
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"metrics": metrics,
	})
}

type batchResearchReq struct {
	CardIDs      []int64    `json:"card_ids"`
	PlaybookID   *int64     `json:"playbook_id,omitempty"`
	ScheduledFor *time.Time `json:"scheduled_for,omitempty"`
}

func (a *api) batchQueueResearch(w http.ResponseWriter, r *http.Request) {
	var req batchResearchReq
	if err := decodeJSON(w, r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	if len(req.CardIDs) == 0 {
		writeErr(w, http.StatusBadRequest, "card_ids cannot be empty")
		return
	}
	batchID := fmt.Sprintf("batch_%d", time.Now().UnixNano())
	queued, err := a.store.BatchQueueResearch(r.Context(), req.CardIDs, req.PlaybookID, req.ScheduledFor, batchID)
	if err != nil {
		a.fail(w, err)
		return
	}
	a.svc.WakeQueueWorker()
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "queued": queued, "batch_id": batchID})
}

func (a *api) listResearchRules(w http.ResponseWriter, r *http.Request) {
	rules, err := a.svc.GetResearchRules(r.Context())
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "rules": rules})
}

func (a *api) createResearchRule(w http.ResponseWriter, r *http.Request) {
	var rule port.ResearchRule
	if err := decodeJSON(w, r, &rule); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	if strings.TrimSpace(rule.Name) == "" {
		writeErr(w, http.StatusBadRequest, "rule name is required")
		return
	}
	if rule.ID == "" {
		rule.ID = fmt.Sprintf("rule_%d", time.Now().UnixNano())
	}
	if rule.MaxCards <= 0 {
		rule.MaxCards = 10
	}
	if err := a.svc.SaveResearchRule(r.Context(), rule); err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"ok": true, "rule": rule})
}

func (a *api) updateResearchRule(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeErr(w, http.StatusBadRequest, "rule id is required")
		return
	}
	var rule port.ResearchRule
	if err := decodeJSON(w, r, &rule); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	rule.ID = id
	if err := a.svc.SaveResearchRule(r.Context(), rule); err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "rule": rule})
}

func (a *api) deleteResearchRule(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeErr(w, http.StatusBadRequest, "rule id is required")
		return
	}
	if err := a.svc.DeleteResearchRule(r.Context(), id); err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *api) runResearchRule(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	rules, err := a.svc.GetResearchRules(r.Context())
	if err != nil {
		a.fail(w, err)
		return
	}
	var target *port.ResearchRule
	for _, ru := range rules {
		if ru.ID == id {
			target = &ru
			break
		}
	}
	if target == nil {
		writeErr(w, http.StatusNotFound, "rule not found")
		return
	}
	queued, err := a.svc.ExecuteRule(r.Context(), *target, time.Now().UTC())
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "queued": queued})
}

func (a *api) getQuietWindow(w http.ResponseWriter, r *http.Request) {
	enabled, start, end, err := a.svc.GetQuietWindow(r.Context())
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"enabled": enabled,
		"start":   start,
		"end":     end,
	})
}

func (a *api) setQuietWindow(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Enabled bool   `json:"enabled"`
		Start   string `json:"start"`
		End     string `json:"end"`
	}
	if err := decodeJSON(w, r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	if err := a.svc.SetQuietWindow(r.Context(), b.Enabled, b.Start, b.End); err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
