package port

// Knowledge sink identifiers.
const (
	SinkObsidian = "obsidian"
	SinkNotion   = "notion"
	SinkJoplin   = "joplin"
)

// CardExport represents a card bundled with its latest completed research dossier.
type CardExport struct {
	Card     Card      `json:"card"`
	Research *Research `json:"research,omitempty"`
}

// SinkTestResult captures the status of testing an outbound sink connection.
type SinkTestResult struct {
	Success bool           `json:"success"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}
