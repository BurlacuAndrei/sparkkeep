-- 0012_playbook_claim_check.sql
-- Seed built-in "Claim check only" playbook

INSERT OR IGNORE INTO playbooks (id, name, description, is_builtin, card_types, version, created_at, updated_at)
VALUES (2, 'Claim check only', 'Fast claim verification pipeline without landscape or synthesis verdict', 1, '[]', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO playbook_steps (playbook_id, position, kind, name, enabled, config) VALUES
(2, 1, 'ground', 'Grounding', 1, '{}'),
(2, 2, 'resolve_refs', 'Resolve References', 1, '{}'),
(2, 3, 'plan', 'Question Planning', 1, '{}'),
(2, 4, 'search', 'Multi-query Search', 1, '{}'),
(2, 5, 'read', 'Round-robin Reading', 1, '{}'),
(2, 6, 'verify_claims', 'Claim Verification', 1, '{}'),
(2, 7, 'report', 'Report Generation', 1, '{}');
