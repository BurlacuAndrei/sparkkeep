package port

import "time"

const (
	HorizonShortTerm  = "short-term"
	HorizonMediumTerm = "medium-term"
	HorizonLongTerm   = "long-term"
	HorizonLifetime   = "lifetime"

	StatusInbox     = "inbox"
	StatusDoing     = "doing"
	StatusDone      = "done"
	StatusShelved   = "shelved"
	StatusDismissed = "dismissed"

	RefKindURL     = "url"
	RefKindRepo    = "repo"
	RefKindTool    = "tool"
	RefKindProduct = "product"
	RefKindPerson  = "person"
	RefKindOrg     = "org"
	RefKindPaper   = "paper"
	RefKindOther   = "other"
	CardTypeTool     = "tool"
	CardTypeRepo     = "repo"
	CardTypeArticle  = "article"
	CardTypeIdea     = "idea"
	CardTypeClaim    = "claim"
	CardTypeTutorial = "tutorial"
	CardTypeProduct  = "product"
	CardTypeOther    = "other"
)

func ValidHorizon(h string) bool {
	return h == HorizonShortTerm || h == HorizonMediumTerm || h == HorizonLongTerm || h == HorizonLifetime
}

func ValidStatus(s string) bool {
	return s == StatusInbox || s == StatusDoing || s == StatusDone || s == StatusShelved || s == StatusDismissed
}

func ValidReferenceKind(k string) bool {
	switch k {
	case RefKindURL, RefKindRepo, RefKindTool, RefKindProduct, RefKindPerson, RefKindOrg, RefKindPaper, RefKindOther:
		return true
	default:
		return false
	}
}

type Reference struct {
	Kind  string `json:"kind"`
	Label string `json:"label"`
	URL   string `json:"url,omitempty"`
}

type Signals struct {
	Extraction    string `json:"extraction"`
	Promo         bool   `json:"promo"`
	SourceQuality string `json:"source_quality"`
	PublishedAt   string `json:"published_at,omitempty"`
}

type Worthiness struct {
	Level  string `json:"level"`
	Reason string `json:"reason"`
}

type Card struct {
	ID               int64       `json:"id"`
	CaptureID        *int64      `json:"capture_id,omitempty"`
	Title            string      `json:"title"`
	Summary          string      `json:"summary"`
	Horizon          string      `json:"horizon"`
	Status           string      `json:"status"`
	SourceURL        string      `json:"source_url"`
	SourceNote       string      `json:"source_note"`
	Tags             []string    `json:"tags"`
	References       []Reference `json:"references"`
	Type             string      `json:"type"`
	TLDR             string      `json:"tldr"`
	WhyCare          string      `json:"why_care"`
	Claims           []string    `json:"claims"`
	OpenQuestions    []string    `json:"open_questions"`
	Signals          Signals     `json:"signals"`
	Worthiness       Worthiness  `json:"worthiness"`
	ExecutiveSummary string      `json:"executive_summary"`
	ValueProposition string      `json:"value_proposition"`
	ProposedActions  []string    `json:"proposed_actions"`
	CreatedAt        time.Time   `json:"created_at"`
	UpdatedAt        time.Time   `json:"updated_at"`
}

type Capture struct {
	ID          int64     `json:"id"`
	Kind        string    `json:"kind"`
	SourceURL   string    `json:"source_url"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Text        string    `json:"text"`
	Caption     string    `json:"caption"`
	Transcript  string    `json:"transcript"`
	ImageDigest string    `json:"image_digest"`
	Notes       []string  `json:"notes"`
	CreatedAt   time.Time `json:"created_at"`
}

type ResearchStep struct {
	ID         string    `json:"id"`
	Status     string    `json:"status"` // "running", "done", "failed", "skipped"
	StartedAt  time.Time `json:"started_at"`
	FinishedAt time.Time `json:"finished_at"`
	Note       string    `json:"note,omitempty"`
}

type Source struct {
	ID          string    `json:"id"`
	URL         string    `json:"url"`
	Title       string    `json:"title"`
	FetchedAt   time.Time `json:"fetched_at"`
	Origin      string    `json:"origin"` // "capture" | "reference" | "search"
	ClippedText string    `json:"clipped_text"`
	Questions   []string  `json:"questions,omitempty"` // question IDs served by this source (e.g. ["Q1"])
}

type ResearchQuestion struct {
	ID            string   `json:"id"`
	Question      string   `json:"question"`
	Query         string   `json:"query"`
	PreferDomains []string `json:"prefer_domains,omitempty"`
}

type ResearchPlan struct {
	Questions []ResearchQuestion `json:"questions"`
}

type Research struct {
	ID        int64          `json:"id"`
	CardID    int64          `json:"card_id"`
	Status    string         `json:"status"`
	Query     string         `json:"query"`
	Findings  string         `json:"findings"`
	Error     string         `json:"error,omitempty"`
	Steps     []ResearchStep `json:"steps"`
	Sources   []Source       `json:"sources"`
	Plan      *ResearchPlan  `json:"plan,omitempty"`
	Tokens    int            `json:"tokens"`
	CreatedAt time.Time      `json:"created_at"`
}

type Tag struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type CardFilter struct {
	Horizon string
	Status  string
	Tag     string
	Query   string
	Since   time.Time
	Limit   int
	Offset  int
	// StaleDays > 0 keeps only cards untouched for at least that many days.
	StaleDays int
}

type CardPatch struct {
	Status           *string
	Horizon          *string
	Note             *string
	ExecutiveSummary *string
	ValueProposition *string
	ProposedActions  *[]string
	SourceURL        *string
	CaptureID        *int64
	References       *[]Reference
	Type             *string
	TLDR             *string
	WhyCare          *string
	Claims           *[]string
	OpenQuestions    *[]string
	Signals          *Signals
	Worthiness       *Worthiness
}

type TagPair struct {
	A      string `json:"a"`
	B      string `json:"b"`
	Weight int    `json:"weight"`
}
