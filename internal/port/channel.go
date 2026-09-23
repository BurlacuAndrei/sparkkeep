package port

import "context"

type Notification struct {
	Kind string // "created"|"done"|"research_done"|"research_failed"|"analysis_failed"|"hello"
	Card Card
	Res  *Research // set when Kind is research_*
	Text string
}

type Channel interface {
	Notify(ctx context.Context, n Notification) error
}
