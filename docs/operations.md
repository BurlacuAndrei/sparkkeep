# Operations: Backup, Upgrade, Export

Everything you need to keep a self-hosted Sparkkeep instance running, moving,
and recoverable.

## Backup & restore

`sparkkeep backup [output-file]` writes a consistent single-file snapshot of the
SQLite database using `VACUUM INTO`, safe to run while the daemon is live (WAL
mode). Without an argument it writes
`<dbdir>/backups/sparkkeep-<UTC YYYYMMDD-HHMMSS>.db`.

```bash
# Docker
docker compose exec sparkkeep sparkkeep backup /data/backup.db

# Standalone binary
./sparkkeep backup ./backup.db
```

Restore with the CLI instead of copying files by hand:

1. Stop the daemon.
2. Run `sparkkeep restore <backup-file>`.
3. Start the daemon again.

The restore command verifies the backup integrity first, writes a timestamped
`.pre-restore-*.bak` safety copy of the current database, replaces the database
atomically, and runs a post-restore integrity check.

Both commands snapshot the SQLite database only. Uploaded media lives in
`SPARKKEEP_UPLOAD_DIR` (default `<dbdir>/uploads`), a separate directory to copy
alongside the backup.

## Upgrade & rollback

Sparkkeep uses forward-only SQLite migrations.

1. **Back up first.** Take a snapshot before upgrading a container image or
   binary:

   ```bash
   docker compose exec sparkkeep sparkkeep backup /data/backup-pre-upgrade.db
   ```
2. **Upgrade.** Pull the latest container
   (`docker compose pull && docker compose up -d`) or replace the executable.
   Schema migrations apply automatically on boot.
3. **Rollback.** Schema downgrade protection stops older binaries from running
   against newer schemas. Roll back by stopping the daemon and running
   `sparkkeep restore <backup-file>` against your pre-upgrade snapshot.

## Library export & migration

Your library is portable. Export it from **Settings → Integrations → Data
Sovereignty & Full Library Export**:

1. Click **Download Full Library (.JSON)** or **Download Markdown Archive (.ZIP)**.
2. Keep the file: both downloads are generated on demand from your current library.

| Format | Endpoint | What it contains |
|---|---|---|
| **JSON** | `GET /api/v1/export/library` | `version`, `generator`, `exported_at`, `metrics` (`card_count`, `tag_count`, `playbook_count`), plus the full `cards`, `tags`, and `playbooks` records. Complete for cards, tags and playbooks; research dossiers and uploaded media are not in this export. |
| **Markdown ZIP** | `GET /api/v1/export/archive.zip` | One YAML-frontmatter Markdown note per card, with the latest completed research dossier appended, nested as `cards/Inbox/`, `cards/To-Do/`, `cards/Doing/`, `cards/Review/`, `cards/Done/`. Shelved cards are excluded. Entries keep their card title as the filename, without a `.md` extension; add one when importing into Obsidian or Joplin. This is the format for knowledge sinks (Obsidian, Joplin, plain-text archives), not a round-trip backup. |

Both routes require the auth token when one is configured; an instance started
without a token serves `/api/` unauthenticated, so set one before exposing it.
Scripting the export looks like this:

```bash
curl -H "Authorization: Bearer <token>" -o sparkkeep-library.json \
  http://localhost:8080/api/v1/export/library
curl -H "Authorization: Bearer <token>" -o sparkkeep-archive.zip \
  http://localhost:8080/api/v1/export/archive.zip
```

**On restore:** there is no import endpoint. Sparkkeep exports one way, and the
JSON above is a record of your cards, tags and playbooks rather than a file
another instance can ingest automatically. To move a self-hosted instance with
full fidelity, use the database snapshot path instead: `sparkkeep backup
[output-file]` on the old host, then `sparkkeep restore [output-file]` on the
new one. Research dossiers live in the database, so the snapshot carries them;
copy `SPARKKEEP_UPLOAD_DIR` alongside it to keep uploaded media.

Need help with a migration or an export bug? Open an issue with a **redacted
sample only** — a few anonymized field names or a short trimmed snippet. Never
post your full export, research dossiers, uploads, database dump, or API keys:
the issue tracker is public.

## Browser extension (Chrome & Firefox)

Capture web pages, articles, and research sources with one click:

1. In Chrome/Brave/Edge, navigate to `chrome://extensions/` and enable
   **Developer mode**.
2. Click **Load unpacked** and select the [`extension/`](../extension/)
   directory from this repository.
3. Click the Sparkkeep extension icon in your toolbar, enter your instance URL
   (e.g. `http://localhost:8080`) and your Master Passphrase / Token to connect.
