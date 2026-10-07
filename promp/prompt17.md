# Prompt 17 — Batch / scheduled overnight research (Pro)

**Type:** Feature · **Size:** M · **Depends on:** 16

## Context
Research on local models can take many minutes per card, and `HasActiveResearch`
allows only one run per card while runs are spawned ad hoc (`core.GoResearch`).
Power users want to triage on the phone during the day and wake up to finished
reports. This is the "Scheduled Deep Research" Pro item from the launch strategy.

## Goal
Users can queue research for many cards (manually or by rule) and have it processed
in a bounded background queue, optionally only within a time window.

## Scope
- **Persistent queue**: research rows get `queued` status with `scheduled_for`;
  a single worker (configurable concurrency, default 1) processes them in order;
  survives restarts (resume `queued`, mark stale `running` as `failed: interrupted`).
- **Manual batch**: multi-select in Kanban/Triage → "Queue research" (playbook auto-selected per card, Prompt 14).
- **Rules** (Settings): e.g. "Every night at 02:00, research inbox cards with worthiness = high created in the last 24h, max 10". Fields: schedule (cron-like, reuse digest scheduling approach), filter (worthiness, type, tags, status), max cards, playbook override (optional).
- **Quiet window**: optional "only run between HH:MM–HH:MM".
- **Digest**: morning Telegram summary — N reports ready, each with verdict line + link; failures listed.
- Gated by `deep_research_v2`; manual single-card research unaffected.

## Out of scope
Distributed workers / multiple instances.

## Acceptance criteria
- Queueing 5 cards processes them sequentially with concurrency 1; UI shows queue position.
- Restart mid-queue resumes remaining items; the interrupted one is marked failed with a retry option.
- A rule fires at the scheduled time (tested with an injectable clock), respects filters and max cards, and never queues a card that already has an active/queued run.
- Morning digest lists exactly the runs completed since the last digest.
- Community license: batch/rules endpoints return 403.

## Testing
Worker tests with fake clock and stub runner (ordering, concurrency, restart recovery);
rule-evaluation table tests; Telegram digest formatter test; license gating tests.
