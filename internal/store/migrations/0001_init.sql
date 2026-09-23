CREATE TABLE cards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    summary     TEXT NOT NULL DEFAULT '',
    horizon     TEXT NOT NULL DEFAULT 'short-term',
    status      TEXT NOT NULL DEFAULT 'inbox',
    source_url  TEXT NOT NULL DEFAULT '',
    source_note TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX idx_cards_horizon ON cards (horizon);
CREATE INDEX idx_cards_status  ON cards (status);

CREATE TABLE tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);
CREATE TABLE cards_tags (
    card_id INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
    PRIMARY KEY (card_id, tag_id)
);

CREATE TABLE research (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id    INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
    status     TEXT NOT NULL DEFAULT 'queued',
    query      TEXT NOT NULL DEFAULT '',
    findings   TEXT NOT NULL DEFAULT '',
    error      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);