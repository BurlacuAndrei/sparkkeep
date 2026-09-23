package port

import (
	"context"
	"errors"
)

// ErrNotFound is returned by Store methods when the requested row does not
// exist. Store and HTTP layers both map it to 404/absent.
var ErrNotFound = errors.New("not found")

type Store interface {
	CreateCard(ctx context.Context, c Card) (Card, error)
	GetCard(ctx context.Context, id int64) (Card, error)
	ListCards(ctx context.Context, f CardFilter) ([]Card, error)
	UpdateCard(ctx context.Context, id int64, p CardPatch) (Card, error)
	SetCardTags(ctx context.Context, id int64, tags []string) error
	ListTags(ctx context.Context) ([]Tag, error)
	CreateResearch(ctx context.Context, cardID int64, query string) (Research, error)
	SetResearch(ctx context.Context, id int64, status, findings, errMsg string) (Research, error)
	GetResearch(ctx context.Context, id int64) (Research, error)
	ListResearch(ctx context.Context) ([]Research, error)
	Close() error
}
