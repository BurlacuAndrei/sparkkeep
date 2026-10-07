-- 0010_research_result.sql
-- Add research result to research table and write-back fields to cards table

ALTER TABLE research ADD COLUMN result TEXT NOT NULL DEFAULT '{}';
ALTER TABLE cards ADD COLUMN actions_source TEXT NOT NULL DEFAULT 'triage';
ALTER TABLE cards ADD COLUMN research_verdict TEXT NOT NULL DEFAULT '';
ALTER TABLE cards ADD COLUMN research_confidence TEXT NOT NULL DEFAULT '';
ALTER TABLE cards ADD COLUMN suggested_horizon TEXT NOT NULL DEFAULT '';
ALTER TABLE cards ADD COLUMN suggested_tags TEXT NOT NULL DEFAULT '[]';
