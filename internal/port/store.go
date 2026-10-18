package port

import (
	"context"
	"errors"
	"time"
)

// ErrNotFound is returned by Store methods when the requested row does not
// exist. Store and HTTP layers both map it to 404/absent.
var ErrNotFound = errors.New("not found")

// ErrResearchActive is returned when a research pass is requested for a card
// that already has one queued/running.
var ErrResearchActive = errors.New("research already running")

// ErrConflict is returned when an operation violates a uniqueness constraint
// (such as duplicate source URL).
var ErrConflict = errors.New("conflict: entity already exists")

// ErrBuiltinReadOnly is returned when modifying or deleting a built-in playbook.
var ErrBuiltinReadOnly = errors.New("builtin playbook is read-only")

// ErrInvalidPlaybook is returned when a playbook violates validation rules.
var ErrInvalidPlaybook = errors.New("invalid playbook")

// ErrNoiseGateDiscarded is returned when the triage noise gate filters out engagement bait or hype.
var ErrNoiseGateDiscarded = errors.New("filtered by noise gate: engagement bait or promotional hype with zero technical substance")

// CardStore provides CRUD and relationship operations for cards, tags, and comments.
type CardStore interface {
	CreateCard(ctx context.Context, c Card) (Card, error)
	GetCard(ctx context.Context, id int64) (Card, error)
	GetCardBySourceURL(ctx context.Context, url string) (Card, error)
	ListCards(ctx context.Context, f CardFilter) ([]Card, error)
	UpdateCard(ctx context.Context, id int64, p CardPatch) (Card, error)
	DeleteCard(ctx context.Context, id int64) error
	// ShelveStale moves every inbox/doing card untouched for more than days
	// into shelved and returns how many rows it changed.
	ShelveStale(ctx context.Context, days int) (int64, error)
	SetCardTags(ctx context.Context, id int64, tags []string) error
	SetCardReferences(ctx context.Context, id int64, refs []Reference) error
	ListTags(ctx context.Context) ([]Tag, error)
	AddCardComment(ctx context.Context, cardID int64, content string) (CardComment, error)
	ListCardComments(ctx context.Context, cardID int64) ([]CardComment, error)
}

// CaptureStore provides persistence and lookup for raw captures.
type CaptureStore interface {
	CreateCapture(ctx context.Context, c Capture) (Capture, error)
	GetCapture(ctx context.Context, id int64) (Capture, error)
	GetCaptureBySourceURL(ctx context.Context, url string) (Capture, error)
	UpdateCapture(ctx context.Context, c Capture) (Capture, error)
}

// ResearchStore provides research execution, queueing, history, and feedback operations.
type ResearchStore interface {
	CreateResearch(ctx context.Context, cardID int64, query string, playbookID ...*int64) (Research, error)
	HasActiveResearch(ctx context.Context, cardID int64) (bool, error)
	SetResearch(ctx context.Context, id int64, status, findings, errMsg string) (Research, error)
	UpdateResearchProgress(ctx context.Context, id int64, status, query string, steps []ResearchStep, sources []Source, plan *ResearchPlan, result *ResearchResult, tokens int) error
	GetResearch(ctx context.Context, id int64) (Research, error)
	ListResearch(ctx context.Context) ([]Research, error)
	ListResearchByCard(ctx context.Context, cardID int64) ([]Research, error)
	// GetResearchFindings returns only the findings column for a research row.
	// Used by the single-row endpoint; ListResearch omits findings.
	GetResearchFindings(ctx context.Context, id int64) (string, error)
	RecoverInterruptedResearch(ctx context.Context) (int, error)
	GetNextQueuedResearch(ctx context.Context, asOf time.Time) (*Research, error)
	CountQueuedAhead(ctx context.Context, researchID int64) (int, error)
	BatchQueueResearch(ctx context.Context, cardIDs []int64, playbookID *int64, scheduledFor *time.Time, batchID string) ([]Research, error)
	FindCardsForRule(ctx context.Context, filter ResearchRuleFilter, maxCards int, asOf time.Time) ([]Card, error)
	ListCompletedResearchSince(ctx context.Context, since time.Time) ([]Research, error)
	SetResearchFeedback(ctx context.Context, researchID int64, rating, comment string) error
}

// PlaybookStore provides CRUD, duplication, and resolution for playbooks.
type PlaybookStore interface {
	CreatePlaybook(ctx context.Context, pb Playbook) (Playbook, error)
	GetPlaybook(ctx context.Context, id int64) (Playbook, error)
	ListPlaybooks(ctx context.Context) ([]Playbook, error)
	UpdatePlaybook(ctx context.Context, pb Playbook) (Playbook, error)
	DeletePlaybook(ctx context.Context, id int64) error
	DuplicatePlaybook(ctx context.Context, id int64) (Playbook, error)
	GetDefaultPlaybook(ctx context.Context) (Playbook, error)
	ResolvePlaybook(ctx context.Context, cardID int64, explicitPlaybookID ...*int64) (Playbook, error)
}

// SettingsStore provides key-value settings persistence for runtime BYOK and admin configuration.
type SettingsStore interface {
	GetSetting(ctx context.Context, key string) (string, error)
	SetSetting(ctx context.Context, key, value string) error
	ListSettings(ctx context.Context) (map[string]string, error)
	GetCardTypes(ctx context.Context) ([]string, error)
	SetCardTypes(ctx context.Context, types []string) error
}

// MetricsStore provides pipeline metric aggregation and inspection.
type MetricsStore interface {
	GetPipelineMetrics(ctx context.Context) (PipelineMetrics, error)
}

// ChannelMessageStore provides channel message-to-card mapping persistence.
type ChannelMessageStore interface {
	RecordChannelMessage(ctx context.Context, channel, messageID string, cardID int64) error
	GetCardIDByChannelMessage(ctx context.Context, channel, messageID string) (int64, error)
}

// Store provides the unified composite interface comprising all segregated stores.
type Store interface {
	CardStore
	CaptureStore
	ResearchStore
	PlaybookStore
	SettingsStore
	MetricsStore
	ChannelMessageStore
	Ping(ctx context.Context) error
	Close() error
}
