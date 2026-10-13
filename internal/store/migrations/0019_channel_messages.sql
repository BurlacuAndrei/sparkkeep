-- Telegram and outbound channel message ID to card ID mapping for reactions and replies.
CREATE TABLE IF NOT EXISTS channel_messages (
    channel    TEXT NOT NULL,
    message_id TEXT NOT NULL,
    card_id    INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (channel, message_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_messages_card ON channel_messages (card_id);
