# Goal: Provide Curated "Strong Default" Research Playbooks

## Context
Sparkkeep allows users to create custom Research Playbooks with bounded steps. However, expecting users to write prompt-engineered steps from scratch is a high-friction experience. We need to provide a set of "Strong Defaults" covering 80% of use cases.

## Requirements
1. **Create Database Migration:** Create a new migration file (e.g., `internal/store/migrations/0014_default_playbooks.sql`).
2. **Insert Playbooks:** The migration should insert 4 new playbooks into the `playbooks` and `playbook_steps` tables:
   - **Tech Stack Evaluator:** Evaluates architecture, repo health, license, and alternatives.
   - **Competitor Comparison:** Builds a feature matrix, pricing comparison, and pros/cons.
   - **Fact & Claim Checker:** Verifies specific claims against authoritative sources.
   - **Quick Executive Briefing:** Fast 2-minute synthesis (TL;DR, target audience, key takeaways).
3. **Playbook Configuration:** Each playbook must have proper steps defined (`plan`, `search`, `read`, `synthesis`/`verdict`), with detailed JSON configs for custom prompt instructions tailored to the playbook's goal.
4. **Built-in Flag:** Set `is_builtin = 1` for these new playbooks so they cannot be deleted by the user.

## Testability
- Run `make test` (or `go test ./internal/store/...`) to ensure the migration applies cleanly.
- Fetch `/api/v1/playbooks` and verify that the 4 new playbooks are returned in the JSON response, complete with their nested steps.
- Start the server and verify no SQL syntax errors occur during the boot-up migration runner.
