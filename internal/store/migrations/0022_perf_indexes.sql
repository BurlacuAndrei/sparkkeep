-- Migration 0022: High-traffic performance indexes
CREATE INDEX IF NOT EXISTS idx_cards_status_updated_at ON cards(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cards_updated_at ON cards(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cards_created_at ON cards(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cards_tags_tag_id ON cards_tags(tag_id, card_id);
CREATE INDEX IF NOT EXISTS idx_research_queue ON research(status, scheduled_for, created_at);
CREATE INDEX IF NOT EXISTS idx_research_card_status ON research(card_id, status);
