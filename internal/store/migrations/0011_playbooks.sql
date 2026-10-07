-- 0011_playbooks.sql
-- Playbook data model, built-in Default playbook seed, and research snapshot fields

CREATE TABLE IF NOT EXISTS playbooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_builtin BOOLEAN NOT NULL DEFAULT 0,
    card_types TEXT NOT NULL DEFAULT '[]',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playbook_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playbook_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT 1,
    config TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (playbook_id) REFERENCES playbooks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_playbook_steps_playbook ON playbook_steps(playbook_id, position);

ALTER TABLE research ADD COLUMN playbook_id INTEGER DEFAULT NULL;
ALTER TABLE research ADD COLUMN playbook_snapshot TEXT NOT NULL DEFAULT '{}';

-- Seed built-in Default playbook
INSERT INTO playbooks (id, name, description, is_builtin, card_types, version, created_at, updated_at)
VALUES (1, 'Default', 'Standard deep research pipeline (grounding, plan, search, read, claims, landscape, verdict)', 1, '[]', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT INTO playbook_steps (playbook_id, position, kind, name, enabled, config) VALUES
(1, 1, 'ground', 'Grounding', 1, '{}'),
(1, 2, 'resolve_refs', 'Resolve References', 1, '{}'),
(1, 3, 'plan', 'Question Planning', 1, '{}'),
(1, 4, 'search', 'Multi-query Search', 1, '{}'),
(1, 5, 'read', 'Round-robin Reading', 1, '{}'),
(1, 6, 'verify_claims', 'Claim Verification', 1, '{}'),
(1, 7, 'landscape', 'Competitive Landscape', 1, '{}'),
(1, 8, 'verdict', 'Synthesis & Verdict', 1, '{}'),
(1, 9, 'report', 'Report Generation', 1, '{}');
