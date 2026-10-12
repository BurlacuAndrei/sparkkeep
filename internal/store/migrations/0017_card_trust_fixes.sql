-- P0 trust fixes (card experience spec v2).
-- completed_actions: texts of proposed_actions the user has checked off, so
-- checklist progress survives reopening the card.
ALTER TABLE cards ADD COLUMN completed_actions TEXT NOT NULL DEFAULT '[]';

-- analysis_failed: explicit flag replacing the `title = 'Analysis failed'`
-- string check, so renaming a failed card no longer hides its Retry action.
ALTER TABLE cards ADD COLUMN analysis_failed INTEGER NOT NULL DEFAULT 0;
UPDATE cards SET analysis_failed = 1 WHERE title = 'Analysis failed';

-- research_state: lifecycle research tracking ('none', 'queued', 'running', 'done', 'failed')
-- replacing the stored 'researching' status with a derived state.
ALTER TABLE cards ADD COLUMN research_state TEXT NOT NULL DEFAULT 'none';
UPDATE cards SET research_state = 'running' WHERE status = 'researching';
UPDATE cards SET status = 'inbox' WHERE status = 'researching';
