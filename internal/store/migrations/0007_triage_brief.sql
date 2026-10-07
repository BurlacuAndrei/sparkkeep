-- 0007_triage_brief.sql
-- Add triage brief fields to cards table

ALTER TABLE cards ADD COLUMN type TEXT NOT NULL DEFAULT 'idea';
ALTER TABLE cards ADD COLUMN tldr TEXT NOT NULL DEFAULT '';
ALTER TABLE cards ADD COLUMN why_care TEXT NOT NULL DEFAULT '';
ALTER TABLE cards ADD COLUMN claims TEXT NOT NULL DEFAULT '[]';
ALTER TABLE cards ADD COLUMN open_questions TEXT NOT NULL DEFAULT '[]';
ALTER TABLE cards ADD COLUMN signals TEXT NOT NULL DEFAULT '{}';
ALTER TABLE cards ADD COLUMN worthiness TEXT NOT NULL DEFAULT '{}';

-- Backfill legacy fields into new triage brief fields
UPDATE cards SET tldr = executive_summary WHERE tldr = '' AND executive_summary != '';
UPDATE cards SET why_care = value_proposition WHERE why_care = '' AND value_proposition != '';
