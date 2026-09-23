# 080 — docker: container image + compose + public surface

## Goal
Ship it. Multi-stage `Dockerfile` (build with pinned Go → `scratch`-based
runtime with `yt-dlp`), `docker-compose.yml` service for the NAS, `.env.example`,
`README.md` (self-host usage), and `Makefile` polish. The binary is the
product — one container, one volume.

## Context
- Read `docs/design.md` §8. Final task; everything from 000–070 must already
  `go build`/test clean.
- The repo is `sparkkeep` (GitHub-ready). Public URL defaulting: serve on
  `:8080` inside container; publish `${SPARKKEEP_HTTP_PORT:-8080}:8080`.

## Files
- Create `Dockerfile`
- Create `.dockerignore`
- Create `docker-compose.yml`
- Create `.env.example`
- Create `README.md`
- Modify `.gitignore` if needed (add `.env`).

## Dockerfile
```dockerfile
# syntax=docker/dockerfile:1
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/sparkkeep ./cmd/sparkkeep

FROM alpine:3.20
RUN apk add --no-cache ca-certificates yt-dlp
COPY --from=build /out/sparkkeep /usr/local/bin/sparkkeep
VOLUME /data
ENV SPARKKEEP_DB=/data/sparkkeep.db \
    SPARKKEEP_HTTP_ADDR=:8080 \
    SPARKKEEP_LLM_BASE=http://host.docker.internal:11434/v1
EXPOSE 8080
ENTRYPOINT ["sparkkeep"]
```
- `go 1.24-alpine` or whatever `go.mod` requires; adjust if module pins an
  older version. `scratch` would need yt-dlp on host — `alpine` runtime is
  the pragmatic call (`ponytail: don't fight static binaries for yt-dlp;
  alpine + 2 pkgs is the ceiling`).
- `yt-dlp` invocations must resolve to `/usr/bin/yt-dlp` (already in PATH in
  the image).

## docker-compose.yml
```yaml
services:
  sparkkeep:
    build: .
    container_name: sparkkeep
    restart: unless-stopped
    env_file: .env
    ports:
      - "${SPARKKEEP_HTTP_PORT:-8080}:8080"
    volumes:
      - ./data:/data
    extra_hosts:
      - "host.docker.internal:host-gateway"   # reach host Ollama
```
No network mode magic; keep default bridge. `SPARKKEEP_SEARCH_URL` should be
set to your SearXNG (same-compose or host) as the operator chooses.

## .env.example
```ini
# sparkkeep — self-hosted capture & organize. Copy to .env.
SPARKKEEP_DB=/data/sparkkeep.db
SPARKKEEP_HTTP_ADDR=:8080
# OpenAI-compatible endpoint. Ollama default; set to any provider w/ key.
SPARKKEEP_LLM_BASE=http://host.docker.internal:11434/v1
SPARKKEEP_LLM_KEY=
SPARKKEEP_LLM_MODEL=
SPARKKEEP_MAX_ANALYZE_TOKENS=2048
# Telegram (optional)
SPARKKEEP_TG_TOKEN=
SPARKKEEP_TG_CHAT_ID=
SPARKKEEP_OFFSET_FILE=/data/bot_offset.json
# Public URL used in research report links
SPARKKEEP_PUBLIC_URL=http://localhost:8080
# Search backend (SearXNG JSON). Empty = research disabled.
SPARKKEEP_SEARCH_URL=
```

## README.md (concise)
- One-paragraph pitch. Badge-free until real user base.
- Quick start: `cp .env.example .env`, set `SPARKKEEP_LLM_MODEL` (and for
  Telegram `TG_TOKEN`/`TG_CHAT_ID` via `capture_chat_id` equivalence —
  actually document: DM the bot, or set manually), `docker compose up -d
  --build`, open `:8080`.
- Config table (mirror §8). Research=empty note. Repository layout one-liner.
- "Design docs: see `docs/design.md`".
- `ponytail: docs stay short on purpose; grow them only when real users ask
  questions a section would have answered.`

## Makefile (final polish — ensure targets from 000 still work)
`build` `test` `vet` `fmt` `docker` (`docker compose up -d --build`).

## Definition of done
- `docker compose up -d --build` builds and starts without error.
- `curl :8080/api/v1/health` returns `{"ok":true}` from the container.
- With `SPARKKEEP_SEARCH_URL` set to a live SearXNG, `POST /api/v1/research`
  with a real card id completes → row `done` with findings (manual smoke).
- `git add -A && git commit -m "feat: docker, compose, docs — sparkkeep v0.1"`.