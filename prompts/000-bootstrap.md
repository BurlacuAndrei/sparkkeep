# 000 — bootstrap: repo, config, ports, main

## Goal
Stand up the `sparkkeep` repo: Go module, package skeleton, env–based
`Config`, the `port` package (shared types + `Store`/`Channel` interfaces),
and a minimal `main.go` that loads config and runs a stub HTTP server with
graceful shutdown. Everything builds and the config path is tested.

## Context
- Read `docs/design.md` first (sections 2 and 8).
- This is the first task; packages named in later prompts do not exist yet.
  Create only what is described here.

## Deliverables
- Go toolchain installed (1.22+). If `go version` fails: `sudo apt-get
  install -y golang-go`, then verify `go version`. (Ubuntu package is fine
  for dev; the Docker build pins a version in task 090.)
- `go mod init sparkkeep`
- `git init`

## Files (create)
- `cmd/sparkkeep/main.go`
- `internal/port/model.go`
- `internal/port/store.go`
- `internal/port/channel.go`
- `internal/config/config.go`
- `Makefile` — targets `build`, `test`, `fmt`, `vet`
- `.gitignore` — `sparkkeep.db`, `*.db-wal`, `*.db-shm`, `sparkkeep`, `*.log`

## Contract — port package (exact signatures, later tasks depend on these)

`internal/port/model.go`:
```go
package port

import "time"

const (
    HorizonShortTerm = "short-term"
    HorizonLifetime  = "lifetime"

    StatusInbox   = "inbox"
    StatusDoing   = "doing"
    StatusDone    = "done"
    StatusShelved = "shelved"
)

type Card struct {
    ID         int64     `json:"id"`
    Title      string    `json:"title"`
    Summary    string    `json:"summary"`
    Horizon    string    `json:"horizon"`
    Status     string    `json:"status"`
    SourceURL  string    `json:"source_url"`
    SourceNote string    `json:"source_note"`
    Tags       []string  `json:"tags"`
    CreatedAt  time.Time `json:"created_at"`
    UpdatedAt  time.Time `json:"updated_at"`
}

type Research struct {
    ID        int64     `json:"id"`
    CardID    int64     `json:"card_id"`
    Status    string    `json:"status"`
    Query     string    `json:"query"`
    Findings  string    `json:"findings"`
    Error     string    `json:"error,omitempty"`
    CreatedAt time.Time `json:"created_at"`
}

type Tag struct {
    Name  string `json:"name"`
    Count int    `json:"count"`
}

type CardFilter struct {
    Horizon string
    Status  string
    Tag     string
    Query   string
    Limit   int
}

type CardPatch struct {
    Status  *string
    Horizon *string
    Note    *string
}
```

`internal/port/store.go`:
```go
package port

import (
    "context"
    "errors"
)

// ErrNotFound is returned by Store methods when the requested row does not
// exist. Store and HTTP layers both map it to 404/absent.
var ErrNotFound = errors.New("not found")

type Store interface {
    CreateCard(ctx context.Context, c Card) (Card, error)
    GetCard(ctx context.Context, id int64) (Card, error)
    ListCards(ctx context.Context, f CardFilter) ([]Card, error)
    UpdateCard(ctx context.Context, id int64, p CardPatch) (Card, error)
    SetCardTags(ctx context.Context, id int64, tags []string) error
    ListTags(ctx context.Context) ([]Tag, error)
    CreateResearch(ctx context.Context, cardID int64, query string) (Research, error)
    SetResearch(ctx context.Context, id int64, status, findings, errMsg string) (Research, error)
    GetResearch(ctx context.Context, id int64) (Research, error)
    ListResearch(ctx context.Context) ([]Research, error)
    Close() error
}
```

`internal/port/channel.go`:
```go
package port

import "context"

type Notification struct {
    Kind  string // "created"|"done"|"research_done"|"research_failed"|"analysis_failed"|"hello"
    Card  Card
    Res   *Research // set when Kind is research_*
    Text  string
}

type Channel interface {
    Notify(ctx context.Context, n Notification) error
}
```

## Contract — config package

`internal/config/config.go`:
```go
package config

type Config struct {
    DB               string
    HTTPAddr         string
    PublicURL        string
    LLMBase          string
    LLMKey           string
    LLMModel         string
    MaxAnalyzeTokens int
    TGToken          string
    TGChatID         int64
    OffsetFile       string
    SearchURL        string
}

func Load() (Config, error)
```
Env keys and defaults (from design §8): `SPARKKEEP_DB`=`./sparkkeep.db`,
`SPARKKEEP_HTTP_ADDR`=`:8080`, `SPARKKEEP_PUBLIC_URL`=`http://localhost:8080`,
`SPARKKEEP_LLM_BASE`=`http://localhost:11434/v1`,
`SPARKKEEP_LLM_KEY`=`` empty, `SPARKKEEP_LLM_MODEL`=`` (required — Load
returns error if empty), `SPARKKEEP_MAX_ANALYZE_TOKENS`=`2048`,
`SPARKKEEP_TG_TOKEN`=``, `SPARKKEEP_TG_CHAT_ID`=`0`,
`SPARKKEEP_OFFSET_FILE`=`` (default: next to DB, `bot_offset.json`),
`SPARKKEEP_SEARCH_URL`=``.

## main.go behavior
- `config.Load()`; fatal on error.
- Start `http.Server` on `Config.HTTPAddr` with a stub `/healthz` handler.
- `signal.NotifyContext(SIGINT, SIGTERM)`, graceful `server.Shutdown` on
  cancel. Store/Telegram wiring added by later tasks — do not add it now.

## Tests (stdlib `testing`, table-driven)
- `internal/config/config_test.go`:
  - `TestLoadDefaults` — only required vars set → defaults for everything
    except `LLMModel`, incl. `PublicURL`, `OffsetFile`.
  - `TestLoadErrorMissingModel` — `SPARKKEEP_LLM_MODEL` unset → error.
  - `TestLoadFull` — all keys set → values parsed correctly (incl. `TGChatID`
    as int64, `MaxAnalyzeTokens` as int, `PublicURL`).

## Definition of done
- `go build ./...` passes.
- `go vet ./...` passes.
- `make test` passes.
- `git commit -m "bootstrap: module, config, port interfaces"` (only after
  `gofmt -l .` is clean).