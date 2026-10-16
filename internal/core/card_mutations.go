package core

import (
	"context"
	"errors"
	"strings"

	"sparkkeep/internal/port"
	"sparkkeep/internal/webhook"
)

// UpdateCard applies a CardPatch to the card with the given ID, enforces domain
// validation, updates storage, wakes queue workers if status or horizon changed,
// and dispatches a card.updated webhook event.
func (s *Service) UpdateCard(ctx context.Context, id int64, patch port.CardPatch) (port.Card, error) {
	if s.Store == nil {
		return port.Card{}, errors.New("core: store not initialized")
	}
	card, err := s.Store.UpdateCard(ctx, id, patch)
	if err != nil {
		return port.Card{}, err
	}
	if patch.Status != nil || patch.Horizon != nil || patch.ResearchState != nil {
		s.WakeQueueWorker()
	}
	if s.Webhook != nil {
		s.Webhook.Dispatch(ctx, webhook.EventCardUpdated, card)
	}
	return card, nil
}

// SetCardTags cleans, deduplicates, and sets tags on a card, then dispatches
// a card.updated webhook event.
func (s *Service) SetCardTags(ctx context.Context, id int64, tags []string) error {
	if s.Store == nil {
		return errors.New("core: store not initialized")
	}
	var cleaned []string
	seen := make(map[string]bool)
	for _, t := range tags {
		norm := strings.ToLower(strings.TrimSpace(t))
		if norm != "" && !seen[norm] {
			seen[norm] = true
			cleaned = append(cleaned, norm)
		}
	}
	if err := s.Store.SetCardTags(ctx, id, cleaned); err != nil {
		return err
	}
	if s.Webhook != nil {
		if card, err := s.Store.GetCard(ctx, id); err == nil {
			s.Webhook.Dispatch(ctx, webhook.EventCardUpdated, card)
		}
	}
	return nil
}

// AddCardComment validates and adds a comment to a card.
func (s *Service) AddCardComment(ctx context.Context, cardID int64, content string) (port.CardComment, error) {
	if s.Store == nil {
		return port.CardComment{}, errors.New("core: store not initialized")
	}
	content = strings.TrimSpace(content)
	if content == "" {
		return port.CardComment{}, errors.New("comment content cannot be empty")
	}
	return s.Store.AddCardComment(ctx, cardID, content)
}

// ShelveStaleCards moves stale inbox and doing cards untouched for more than days
// into shelved status and returns the count.
func (s *Service) ShelveStaleCards(ctx context.Context, days int) (int, error) {
	if s.Store == nil {
		return 0, errors.New("core: store not initialized")
	}
	if days <= 0 {
		days = 30
	}
	n, err := s.Store.ShelveStale(ctx, days)
	return int(n), err
}

// LinkChannelMessage records an association between an external chat transport message ID
// and a card ID for multi-channel reply tracking.
func (s *Service) LinkChannelMessage(ctx context.Context, channel, msgID string, cardID int64) error {
	if s.Store == nil {
		return errors.New("core: store not initialized")
	}
	return s.Store.RecordChannelMessage(ctx, channel, msgID, cardID)
}

// GetCardIDByChannelMessage retrieves the card ID associated with an external chat transport message ID.
func (s *Service) GetCardIDByChannelMessage(ctx context.Context, channel, msgID string) (int64, error) {
	if s.Store == nil {
		return 0, errors.New("core: store not initialized")
	}
	return s.Store.GetCardIDByChannelMessage(ctx, channel, msgID)
}

// GetCard retrieves a card by ID.
func (s *Service) GetCard(ctx context.Context, id int64) (port.Card, error) {
	if s.Store == nil {
		return port.Card{}, errors.New("core: store not initialized")
	}
	return s.Store.GetCard(ctx, id)
}

// DeleteCard deletes a card by ID.
func (s *Service) DeleteCard(ctx context.Context, id int64) error {
	if s.Store == nil {
		return errors.New("core: store not initialized")
	}
	return s.Store.DeleteCard(ctx, id)
}

// HasActiveResearch checks if a card has a queued or running research execution.
func (s *Service) HasActiveResearch(ctx context.Context, cardID int64) (bool, error) {
	if s.Store == nil {
		return false, errors.New("core: store not initialized")
	}
	return s.Store.HasActiveResearch(ctx, cardID)
}

// ListPlaybooks returns all registered Research Playbooks.
func (s *Service) ListPlaybooks(ctx context.Context) ([]port.Playbook, error) {
	if s.Store == nil {
		return nil, errors.New("core: store not initialized")
	}
	return s.Store.ListPlaybooks(ctx)
}

// GetPlaybook returns a specific Research Playbook by ID.
func (s *Service) GetPlaybook(ctx context.Context, id int64) (port.Playbook, error) {
	if s.Store == nil {
		return port.Playbook{}, errors.New("core: store not initialized")
	}
	return s.Store.GetPlaybook(ctx, id)
}

// ResolvePlaybook returns the resolved Research Playbook for a card.
func (s *Service) ResolvePlaybook(ctx context.Context, cardID int64, explicitPlaybookID ...*int64) (port.Playbook, error) {
	if s.Store == nil {
		return port.Playbook{}, errors.New("core: store not initialized")
	}
	return s.Store.ResolvePlaybook(ctx, cardID, explicitPlaybookID...)
}
