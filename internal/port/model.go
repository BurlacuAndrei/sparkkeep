package port

import "time"

const (
	HorizonShortTerm = "short-term"
	HorizonLifetime  = "lifetime"

	StatusInbox     = "inbox"
	StatusDoing     = "doing"
	StatusDone      = "done"
	StatusShelved   = "shelved"
	StatusDismissed = "dismissed"
)

func ValidHorizon(h string) bool {
	return h == HorizonShortTerm || h == HorizonLifetime
}

func ValidStatus(s string) bool {
	return s == StatusInbox || s == StatusDoing || s == StatusDone || s == StatusShelved || s == StatusDismissed
}

type Card struct {
	ID               int64     `json:"id"`
	Title            string    `json:"title"`
	Summary          string    `json:"summary"`
	Horizon          string    `json:"horizon"`
	Status           string    `json:"status"`
	SourceURL        string    `json:"source_url"`
	SourceNote       string    `json:"source_note"`
	Tags             []string  `json:"tags"`
	ExecutiveSummary string    `json:"executive_summary"`
	ValueProposition string    `json:"value_proposition"`
	ProposedActions  []string  `json:"proposed_actions"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
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
}

type CardPatch struct {
	Status           *string
	Horizon          *string
	Note             *string
	ExecutiveSummary *string
	ValueProposition *string
	ProposedActions  *[]string
}

type TagPair struct {
	A      string `json:"a"`
	B      string `json:"b"`
	Weight int    `json:"weight"`
}
