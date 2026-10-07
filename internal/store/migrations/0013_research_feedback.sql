-- Migration 0013: Research report feedback
ALTER TABLE research ADD COLUMN feedback_rating TEXT;
ALTER TABLE research ADD COLUMN feedback_comment TEXT;
ALTER TABLE research ADD COLUMN feedback_at DATETIME;
