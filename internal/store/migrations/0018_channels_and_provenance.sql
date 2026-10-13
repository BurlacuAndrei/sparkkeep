-- Multi-channel provenance tracking for cards and captures.
CREATE TABLE IF NOT EXISTS captures (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    kind         TEXT NOT NULL DEFAULT '',
    source_url   TEXT NOT NULL DEFAULT '',
    title        TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',
    text         TEXT NOT NULL DEFAULT '',
    caption      TEXT NOT NULL DEFAULT '',
    transcript   TEXT NOT NULL DEFAULT '',
    image_digest TEXT NOT NULL DEFAULT '',
    notes        TEXT NOT NULL DEFAULT '[]',
    created_at   TEXT NOT NULL DEFAULT ''
);

ALTER TABLE cards ADD COLUMN source_channel TEXT NOT NULL DEFAULT 'web';
ALTER TABLE cards ADD COLUMN source_channel_chat_id TEXT NOT NULL DEFAULT '';
ALTER TABLE cards ADD COLUMN source_channel_msg_id TEXT NOT NULL DEFAULT '';

ALTER TABLE captures ADD COLUMN source_channel TEXT NOT NULL DEFAULT 'web';
