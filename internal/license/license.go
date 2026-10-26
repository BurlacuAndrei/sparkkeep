// Package license reports Sparkkeep's license status. Sparkkeep is AGPL-3.0
// licensed with every feature included: there are no tiers, keys or gates.
package license

// TierCommunity is Sparkkeep's single license tier: AGPL-3.0, everything included.
const TierCommunity = "community"

// LicenseStatus is the response shape of GET /api/v1/license/status.
type LicenseStatus struct {
	Tier     string   `json:"tier"`
	Features []string `json:"features"`
	IsValid  bool     `json:"is_valid"`
}

// features names every Sparkkeep capability. All of them are always on.
var features = []string{
	"core_capture",
	"triage",
	"llm_analysis",
	"search",
	"obsidian_sync",
	"webhooks",
	"deep_research_v2",
}

// Status reports the community/AGPL-3.0 status: every feature included, always
// valid.
func Status() LicenseStatus {
	return LicenseStatus{
		Tier:     TierCommunity,
		Features: features,
		IsValid:  true,
	}
}
