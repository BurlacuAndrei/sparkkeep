CREATE UNIQUE INDEX idx_cards_source ON cards(source_url) WHERE source_url <> '';
