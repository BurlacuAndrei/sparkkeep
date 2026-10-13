package store

import (
	"context"
	"database/sql"
	"errors"

	"sparkkeep/internal/port"
)

func (s *Store) RecordChannelMessage(ctx context.Context, channel, messageID string, cardID int64) error {
	ts := now()
	_, err := s.db.ExecContext(ctx, `INSERT INTO channel_messages (channel, message_id, card_id, created_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(channel, message_id) DO UPDATE SET card_id = excluded.card_id`,
		channel, messageID, cardID, ts)
	return err
}

func (s *Store) GetCardIDByChannelMessage(ctx context.Context, channel, messageID string) (int64, error) {
	var cardID int64
	err := s.db.QueryRowContext(ctx, `SELECT card_id FROM channel_messages WHERE channel = ? AND message_id = ?`, channel, messageID).Scan(&cardID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, port.ErrNotFound
	}
	return cardID, err
}
