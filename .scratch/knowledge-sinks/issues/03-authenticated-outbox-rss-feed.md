# 03: Authenticated Outbox RSS / Atom Feed End-to-End

**What to build:**
An authenticated, filterable syndication feed (`GET /api/v1/feed.xml?token=...`) that allows external feed readers (FreshRSS, Miniflux, Readwise Reader) and automation tools (n8n, Zapier) to subscribe to curated cards and completed Research Dossiers. Users can copy the feed URL, preview filter variations, and rotate their feed security token from Settings.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Feed endpoint `GET /api/v1/feed.xml?token=<feed_token>` generates standard RSS 2.0 XML with `xmlns:content="http://purl.org/rss/1.0/modules/content/"`.
- [ ] Feed authentication verifies `token` against `outbox_feed_token` stored in `settings` using constant-time comparison, bypassing session cookie requirements.
- [ ] Default feed query delivers curated high-signal cards (`status IN ('doing', 'done')` or completed research, excluding `shelved`).
- [ ] Optional query filters supported: `?status=doing,done`, `?type=article,tool`, `?research_only=1`, `?limit=50`.
- [ ] Feed items include Title, source link, categories for CardType and tags, and full HTML-rendered synthesis, action items, and completed Research Dossier inside `<content:encoded>`.
- [ ] `IntegrationsTab` includes an "Outbox RSS Feed" section displaying the ready-to-copy URL, query filter toggles, and a "Regenerate Token" button.
- [ ] Unit and endpoint tests verify RSS XML validity, token authentication rejection, filtering parameters, and HTML content encoding.
