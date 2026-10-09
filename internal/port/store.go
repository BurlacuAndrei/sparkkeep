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

// Store provides CRUD for cards, research, and tags.
type Store interface {
	CreateCard(ctx context.Context, c Card) (Card, error)
	GetCard(ctx context.Context, id int64) (Card, error)
	GetCardBySourceURL(ctx context.Context, url string) (Card, error)
	ListCards(ctx context.Context, f CardFilter) ([]Card, error)
	UpdateCard(ctx context.Context, id int64, p CardPatch) (Card, error)
	// ShelveStale moves every inbox/doing card untouched for more than days
	// into shelved and returns how many rows it changed.
	ShelveStale(ctx context.Context, days int) (int64, error)
	SetCardTags(ctx context.Context, id int64, tags []string) error
	SetCardReferences(ctx context.Context, id int64, refs []Reference) error
	ListTags(ctx context.Context) ([]Tag, error)
	AddCardComment(ctx context.Context, cardID int64, content string) (CardComment, error)
	ListCardComments(ctx context.Context, cardID int64) ([]CardComment, error)
	CreateResearch(ctx context.Context, cardID int64, query string, playbookID ...*int64) (Research, error)
	HasActiveResearch(ctx context.Context, cardID int64) (bool, error)
	SetResearch(ctx context.Context, id int64, status, findings, errMsg string) (Research, error)
	UpdateResearchProgress(ctx context.Context, id int64, status, query string, steps []ResearchStep, sources []Source, plan *ResearchPlan, result *ResearchResult, tokens int) error
	GetResearch(ctx context.Context, id int64) (Research, error)
	ListResearch(ctx context.Context) ([]Research, error)
	ListResearchByCard(ctx context.Context, cardID int64) ([]Research, error)
	Close() error
	// GetResearchFindings returns only the findings column for a research row.
	// Used by the single-row endpoint; ListResearch omits findings.
	GetResearchFindings(ctx context.Context, id int64) (string, error)
	// Key-value settings persistence for runtime BYOK and admin configuration.
	GetSetting(ctx context.Context, key string) (string, error)
	SetSetting(ctx context.Context, key, value string) error
	ListSettings(ctx context.Context) (map[string]string, error)
	// Capture persistence and lookup.
	CreateCapture(ctx context.Context, c Capture) (Capture, error)
	GetCapture(ctx context.Context, id int64) (Capture, error)
	GetCaptureBySourceURL(ctx context.Context, url string) (Capture, error)
	UpdateCapture(ctx context.Context, c Capture) (Capture, error)
	// Playbooks
	CreatePlaybook(ctx context.Context, pb Playbook) (Playbook, error)
	GetPlaybook(ctx context.Context, id int64) (Playbook, error)
	ListPlaybooks(ctx context.Context) ([]Playbook, error)
	UpdatePlaybook(ctx context.Context, pb Playbook) (Playbook, error)
	DeletePlaybook(ctx context.Context, id int64) error
	DuplicatePlaybook(ctx context.Context, id int64) (Playbook, error)
	GetDefaultPlaybook(ctx context.Context) (Playbook, error)
	ResolvePlaybook(ctx context.Context, cardID int64, explicitPlaybookID ...*int64) (Playbook, error)
	// Feedback and metrics
	SetResearchFeedback(ctx context.Context, researchID int64, rating, comment string) error
	GetPipelineMetrics(ctx context.Context) (PipelineMetrics, error)
	// Scheduled, queued and batch research
	RecoverInterruptedResearch(ctx context.Context) (int, error)
	GetNextQueuedResearch(ctx context.Context, asOf time.Time) (*Research, error)
	CountQueuedAhead(ctx context.Context, researchID int64) (int, error)
	BatchQueueResearch(ctx context.Context, cardIDs []int64, playbookID *int64, scheduledFor *time.Time, batchID string) ([]Research, error)
	FindCardsForRule(ctx context.Context, filter ResearchRuleFilter, maxCards int, asOf time.Time) ([]Card, error)
	ListCompletedResearchSince(ctx context.Context, since time.Time) ([]Research, error)
}
