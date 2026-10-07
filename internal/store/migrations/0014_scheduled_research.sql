-- 0014_scheduled_research.sql
-- Add scheduling and batch tracking columns to research table
ALTER TABLE research ADD COLUMN scheduled_for DATETIME;
ALTER TABLE research ADD COLUMN batch_id TEXT;
