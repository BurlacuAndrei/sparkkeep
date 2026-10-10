package analyze

import (
	"net"
	"net/http"
	"sync"
	"time"
)

// Pipeline LLM role identifiers.
const (
	RoleTriage            = "triage"
	RoleVision            = "vision"
	RoleResearchPlan      = "research_plan"
	RoleResearchSynthesis = "research_synthesis"
)

// AllRoles lists the standard pipeline roles supported by SparkKeep.
var AllRoles = []string{
	RoleTriage,
	RoleVision,
	RoleResearchPlan,
	RoleResearchSynthesis,
}

// DefaultTokenCaps defines default per-call token limits for each role.
// Triage: 4096, Vision: 1024, Plan: 4096, Synthesis: 8192.
// These caps provide adequate headroom for reasoning models whose thinking tokens
// count towards total max_tokens before producing JSON output.
var DefaultTokenCaps = map[string]int{
	RoleTriage:            4096,
	RoleVision:            1024,
	RoleResearchPlan:      4096,
	RoleResearchSynthesis: 8192,
}

// Profile represents a configured LLM endpoint and model.
type Profile struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	BaseURL   string `json:"base_url"`
	Model     string `json:"model"`
	APIKey    string `json:"api_key"`
	IsDefault bool   `json:"is_default"`
}

// RouterConfig contains initial or updated configuration for the router.
type RouterConfig struct {
	Profiles   []Profile
	Roles      map[string]string // role -> profile_id
	TokenCaps  map[string]int    // role -> max_tokens override
	HTTPClient *http.Client
}

// Router routes pipeline roles to specific LLM profiles with automatic fallback to default.
type Router struct {
	mu          sync.RWMutex
	profiles    map[string]Profile
	profileList []Profile
	roles       map[string]string
	tokenCaps   map[string]int
	defaultID   string
	httpClient  *http.Client
	clients     map[string]*Client
}

// LLMRouter is an alias for Router.
type LLMRouter = Router

// NewRouter creates and initializes a new Router with the provided configuration.
func NewRouter(cfg RouterConfig) *Router {
	r := &Router{
		httpClient: cfg.HTTPClient,
	}
	r.rebuild(cfg)
	return r
}

func (r *Router) rebuild(cfg RouterConfig) {
	r.profiles = make(map[string]Profile, len(cfg.Profiles))
	r.profileList = make([]Profile, len(cfg.Profiles))
	copy(r.profileList, cfg.Profiles)

	r.defaultID = ""
	for _, p := range r.profileList {
		r.profiles[p.ID] = p
		if p.IsDefault {
			r.defaultID = p.ID
		}
	}
	if r.defaultID == "" && len(r.profileList) > 0 {
		r.defaultID = r.profileList[0].ID
	}

	r.roles = make(map[string]string, len(cfg.Roles))
	for k, v := range cfg.Roles {
		r.roles[k] = v
	}

	r.tokenCaps = make(map[string]int)
	for k, v := range DefaultTokenCaps {
		r.tokenCaps[k] = v
	}
	for k, v := range cfg.TokenCaps {
		if v > 0 {
			r.tokenCaps[k] = v
		}
	}

	if cfg.HTTPClient != nil {
		r.httpClient = cfg.HTTPClient
	}

	r.clients = make(map[string]*Client)
	for _, role := range AllRoles {
		r.clients[role] = r.buildClientLocked(role)
	}
}

func (r *Router) buildClientLocked(role string) *Client {
	if len(r.profileList) == 0 {
		return nil
	}

	profID := r.roles[role]
	prof, ok := r.profiles[profID]
	if !ok || profID == "" {
		prof, ok = r.profiles[r.defaultID]
		if !ok && len(r.profileList) > 0 {
			prof = r.profileList[0]
		}
	}

	capVal, ok := r.tokenCaps[role]
	if !ok || capVal <= 0 {
		capVal = DefaultTokenCaps[role]
		if capVal <= 0 {
			capVal = 2048
		}
	}

	httpCl := r.httpClient
	if httpCl == nil {
		httpCl = &http.Client{Transport: &http.Transport{
			DialContext: (&net.Dialer{Timeout: 30 * time.Second}).DialContext,
		}}
	}

	return &Client{
		BaseURL:     prof.BaseURL,
		APIKey:      prof.APIKey,
		Model:       prof.Model,
		VisionModel: prof.Model,
		MaxTokens:   capVal,
		HTTP:        httpCl,
	}
}

// For returns a configured *Client for the requested role, falling back to the default profile.
func (r *Router) For(role string) *Client {
	if r == nil {
		return nil
	}
	r.mu.RLock()
	defer r.mu.RUnlock()

	if c, ok := r.clients[role]; ok && c != nil {
		return c
	}
	return r.buildClientLocked(role)
}

// Update rebuilds the router with the given configuration.
func (r *Router) Update(cfg RouterConfig) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.rebuild(cfg)
}

// UpdateDefaultProfile modifies the default profile's endpoint parameters and refreshes cached clients.
func (r *Router) UpdateDefaultProfile(base, key, model string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.defaultID == "" && len(r.profileList) == 0 {
		initProf := Profile{
			ID:        "default",
			Name:      "Default",
			BaseURL:   base,
			APIKey:    key,
			Model:     model,
			IsDefault: true,
		}
		r.rebuild(RouterConfig{
			Profiles:   []Profile{initProf},
			Roles:      r.roles,
			TokenCaps:  r.tokenCaps,
			HTTPClient: r.httpClient,
		})
		return
	}

	for i := range r.profileList {
		if r.profileList[i].ID == r.defaultID || (r.defaultID == "" && i == 0) {
			if base != "" {
				r.profileList[i].BaseURL = base
			}
			r.profileList[i].APIKey = key
			if model != "" {
				r.profileList[i].Model = model
			}
			r.profiles[r.profileList[i].ID] = r.profileList[i]
			break
		}
	}

	r.clients = make(map[string]*Client)
	for _, role := range AllRoles {
		r.clients[role] = r.buildClientLocked(role)
	}
}

// Profiles returns a copy of the currently configured profiles.
func (r *Router) Profiles() []Profile {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]Profile, len(r.profileList))
	copy(out, r.profileList)
	return out
}

// Roles returns a copy of current role mappings.
func (r *Router) Roles() map[string]string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make(map[string]string, len(r.roles))
	for k, v := range r.roles {
		out[k] = v
	}
	return out
}

// TokenCaps returns a copy of current token caps.
func (r *Router) TokenCaps() map[string]int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make(map[string]int, len(r.tokenCaps))
	for k, v := range r.tokenCaps {
		out[k] = v
	}
	return out
}

// DefaultProfile returns the active default profile, if any.
func (r *Router) DefaultProfile() (Profile, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, ok := r.profiles[r.defaultID]
	return p, ok
}

// HTTPClient returns the HTTP client configured on the router.
func (r *Router) HTTPClient() *http.Client {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.httpClient
}
