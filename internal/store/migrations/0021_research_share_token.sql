-- Migration 0021: per-report share token for the public research report view.
-- Existing rows default to '' and are never shareable.
ALTER TABLE research ADD COLUMN share_token TEXT NOT NULL DEFAULT '';
