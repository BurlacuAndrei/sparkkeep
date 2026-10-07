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

type Research struct {
	ID        int64     `json:"id"`
	CardID    int64     `json:"card_id"`
	Status    string    `json:"status"`
	Query     string    `json:"query"`
	Findings  string    `json:"findings"`
	Error     string    `json:"error,omitempty"`
	CreatedAt time.Time `json:"created_at"`
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
}

type TagPair struct {
	A      string `json:"a"`
	B      string `json:"b"`
	Weight int    `json:"weight"`
}
