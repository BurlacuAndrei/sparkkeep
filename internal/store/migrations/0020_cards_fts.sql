CREATE VIRTUAL TABLE cards_fts USING fts5(
    title,
    summary,
    executive_summary,
    tldr,
    why_care,
    proposed_actions,
    content='cards',
    content_rowid='id'
);

CREATE TRIGGER cards_ai AFTER INSERT ON cards BEGIN
    INSERT INTO cards_fts(rowid, title, summary, executive_summary, tldr, why_care, proposed_actions)
    VALUES (new.id, new.title, new.summary, new.executive_summary, new.tldr, new.why_care, new.proposed_actions);
END;

CREATE TRIGGER cards_ad AFTER DELETE ON cards BEGIN
    INSERT INTO cards_fts(cards_fts, rowid, title, summary, executive_summary, tldr, why_care, proposed_actions)
    VALUES ('delete', old.id, old.title, old.summary, old.executive_summary, old.tldr, old.why_care, old.proposed_actions);
END;

CREATE TRIGGER cards_au AFTER UPDATE ON cards BEGIN
    INSERT INTO cards_fts(cards_fts, rowid, title, summary, executive_summary, tldr, why_care, proposed_actions)
    VALUES ('delete', old.id, old.title, old.summary, old.executive_summary, old.tldr, old.why_care, old.proposed_actions);
    INSERT INTO cards_fts(rowid, title, summary, executive_summary, tldr, why_care, proposed_actions)
    VALUES (new.id, new.title, new.summary, new.executive_summary, new.tldr, new.why_care, new.proposed_actions);
END;

INSERT INTO cards_fts(cards_fts) VALUES ('rebuild');
