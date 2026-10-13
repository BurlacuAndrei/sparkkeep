package web

import (
	"net/http"

	"sparkkeep/internal/license"
	"sparkkeep/internal/port"
	"sparkkeep/internal/research"
)

func (a *api) listPlaybooks(w http.ResponseWriter, r *http.Request) {
	list, err := a.store.ListPlaybooks(r.Context())
	if err != nil {
		a.fail(w, err)
		return
	}
	if list == nil {
		list = []port.Playbook{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "playbooks": list})
}

func (a *api) getPlaybook(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusBadRequest, "bad playbook id")
		return
	}
	pb, err := a.store.GetPlaybook(r.Context(), id)
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "playbook": pb})
}

func (a *api) createPlaybook(w http.ResponseWriter, r *http.Request) {
	if !a.svc.HasCapability(r.Context(), license.FeatureDeepResearchV2) {
		writeJSON(w, http.StatusForbidden, map[string]any{
			"ok":      false,
			"error":   "Custom playbooks require an active Pro license",
			"feature": license.FeatureDeepResearchV2,
		})
		return
	}
	var pb port.Playbook
	if err := decodeJSON(w, r, &pb); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	created, err := a.store.CreatePlaybook(r.Context(), pb)
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"ok": true, "playbook": created})
}

func (a *api) updatePlaybook(w http.ResponseWriter, r *http.Request) {
	if !a.svc.HasCapability(r.Context(), license.FeatureDeepResearchV2) {
		writeJSON(w, http.StatusForbidden, map[string]any{
			"ok":      false,
			"error":   "Custom playbooks require an active Pro license",
			"feature": license.FeatureDeepResearchV2,
		})
		return
	}
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusBadRequest, "bad playbook id")
		return
	}
	var pb port.Playbook
	if err := decodeJSON(w, r, &pb); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	pb.ID = id
	updated, err := a.store.UpdatePlaybook(r.Context(), pb)
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "playbook": updated})
}

func (a *api) deletePlaybook(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusBadRequest, "bad playbook id")
		return
	}
	if err := a.store.DeletePlaybook(r.Context(), id); err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *api) duplicatePlaybook(w http.ResponseWriter, r *http.Request) {
	if !a.svc.HasCapability(r.Context(), license.FeatureDeepResearchV2) {
		writeJSON(w, http.StatusForbidden, map[string]any{
			"ok":      false,
			"error":   "Custom playbooks require an active Pro license",
			"feature": license.FeatureDeepResearchV2,
		})
		return
	}
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusBadRequest, "bad playbook id")
		return
	}
	dup, err := a.store.DuplicatePlaybook(r.Context(), id)
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"ok": true, "playbook": dup})
}

func (a *api) getPlaybookStepLibrary(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":        true,
		"templates": research.BuiltinStepTemplates(),
	})
}
