-- Migrate deprecated horizon
UPDATE cards SET horizon = 'long-term' WHERE horizon = 'lifetime';

-- Migrate deprecated status
UPDATE cards SET status = 'in-progress' WHERE status = 'doing';

-- Create card_comments table
CREATE TABLE IF NOT EXISTS card_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE CASCADE
);
