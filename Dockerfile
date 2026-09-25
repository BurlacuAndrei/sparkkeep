# syntax=docker/dockerfile:1
FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /src/internal/web/dist ./internal/web/dist
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/sparkkeep ./cmd/sparkkeep

FROM alpine:3.20
RUN apk add --no-cache ca-certificates yt-dlp chromium font-noto-cjk
COPY --from=build /out/sparkkeep /usr/local/bin/sparkkeep
VOLUME /data
ENV SPARKKEEP_DB=/data/sparkkeep.db \
    SPARKKEEP_HTTP_ADDR=:8080 \
    SPARKKEEP_LLM_BASE=http://host.docker.internal:11434/v1 \
    SPARKKEEP_HEADLESS_ENABLED=true \
    SPARKKEEP_CHROME_BIN=/usr/bin/chromium-browser
EXPOSE 8080
ENTRYPOINT ["sparkkeep"]