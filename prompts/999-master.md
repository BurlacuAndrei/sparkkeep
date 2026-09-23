# 999 — master: run the build with subagents, no-context-bloat

> **YOU ARE THE ORCHESTRATOR.** You do not write code. You dispatch exactly
> one **independent subagent** per prompt file below, in strict order, using
> a **fresh, zero-context subagent each time**, and you keep the shared
> working context minimal. The prompts in this folder are **atomically
> self-contained** — a subagent that reads ONLY their single prompt file can
> complete their task.

## The goal

Produce `sparkkeep` v0.1: a single Go binary that captures shared posts from
Telegram (or manual API), splits them into idea cards via any
OpenAI-compatible LLM, stores in SQLite, exposes an embedded web dashboard,
and can run a bounded research loop. Shipped as one Docker container.

## Execution contract

1. **One subagent per task, never two.** Each `000`–`080` prompt is a
   complete task. Dispatch a fresh subagent (`task` tool, `general` type),
   hands it ONLY:
   - THE prompt file they implement (e.g. `prompts/010-store.md`), and
   - `docs/design.md` (they may read it — it is the shared spec).
   - **Nothing else.** No prior subagent output, no chat history, no
     `prompts/999`. Their file is the complete spec.
2. **Strict sequential order** `000 → 010 → 020 → 030 → 040 → 050 → 060 →
   070 → 080`. A task depends on the artifact (not the conversation) of the
   previous one: files, interfaces, tests, commits. Interfaces are pinned as
   exact Go signatures in each prompt, so the subagent never needs to ask
   "what did task N produce" — it reads the signatures from its own file.
3. **Verify before advancing.** Every prompt ends with an explicit
   *Definition of done* (build, vet, test, commit). You must see the commit
   exist BEFORE dispatching the next task. If DoD is unmet:
   - Dispatch a *second* fresh subagent pointed at the same prompt file with
     the failure output, do not fix it yourself.
   - If it still fails after two attempts, stop and surface to the user.
4. **No context bloat.** You never paste subagent output into your own
   context. Subagent result = only `{task done? / commit sha / tests pass /
   next-task ready}`. Read files (`git log`, `go test ./...`) directly if
   you need to verify — never from a subagent's narrated report.
5. **Bug mid-chain:** if code produced by task N fails task N+1's tests,
   the fault is N+1's to fix within its own DoD (it owns its files), unless
   N+1 requires modifying `internal/port` or a pinned signature — then
   report the mismatch back, we re-open the owning task, not the whole chain.

## What the orchestrator runs between tasks

```bash
cd sparkkeep            # repo root
go build ./... && go vet ./...   # after each subagent completes
git log --oneline -1             # confirm the commit exists
```

Dispatch next subagent only when these pass.

## Final steps after 080

- `git status` clean.
- Confirm `docker compose up -d --build` + `curl localhost:8080/api/v1/health`
  (real smoke is the orchestrator's job, not a subagent's).
- Run `docs/design.md` §3 API manual smoke once against the real binary:
  create a card via `POST /api/v1/cards`, list it, retry it.
- Report to the user: SHA of the final commit, short table of what each
  task produced, and the two next decisions from design §9:
  - SearXNG instance to point `SPARKKEEP_SEARCH_URL` at (per-repo compose,
    the NAS instance, or a public one),
  - whether the weekly digest ships now (design §9, default: dashboard view
    in v1, `/digest` bot command later).

## Guardrails for subagent prompt hygiene

- The subagent's only human is you. Give it no user id, no other context.
- Each prompt has an explicit "Definition of done"; instruct the subagent to
  literally run those commands and show output before finishing.
- Feature boundaries: a subagent must not "helpfully" extend scope. If it
  proposes changes beyond its prompt, that's a scope error — ask it to revert.

## This prompt is the whole story

Storage, capture, analysis, research, channels, dashboard, Docker —
themselves fully by the prompt files. Re-run any single step, or the entire
chain, by handing out the same files to fresh subagents. Nothing was lost
between conversations; the repository between commits carries it all.