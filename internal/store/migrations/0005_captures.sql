CREATE TABLE captures (
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
    created_at   TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_captures_source ON captures(source_url) WHERE source_url <> '';

ALTER TABLE cards ADD COLUMN capture_id INTEGER REFERENCES captures(id) ON DELETE SET NULL;
CREATE INDEX idx_cards_capture ON cards(capture_id);

DROP INDEX IF EXISTS idx_cards_source;
CREATE INDEX idx_cards_source ON cards(source_url);

-- Backfill: create one capture per existing card with non-empty source_url and link it.
INSERT OR IGNORE INTO captures (kind, source_url, title, caption, created_at)
SELECT 'link', source_url, title, source_note, created_at
FROM cards
WHERE source_url <> ''
ORDER BY id ASC;

UPDATE cards
SET capture_id = (
    SELECT id FROM captures WHERE captures.source_url = cards.source_url LIMIT 1
)
WHERE source_url <> '';
