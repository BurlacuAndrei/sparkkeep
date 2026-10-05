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
# chromium + font-noto-cjk exist only for the headless browser (~400MB of the
# image). Skip them when running lightweight: build with --build-arg WITH_CHROME=false
# AND set SPARKKEEP_HEADLESS_ENABLED=false at runtime — with headless off, capture
# never execs Chrome (see Capture.headless) and only does plain HTTP fetches.
# font-noto-cjk is what renders CJK text in screenshots/headless extraction.
ARG WITH_CHROME=true
RUN apk add --no-cache ca-certificates yt-dlp wget su-exec \
    $([ "$WITH_CHROME" = "true" ] && echo "chromium font-noto-cjk") \
    && adduser -D -u 1000 appuser
COPY --from=build /out/sparkkeep /usr/local/bin/sparkkeep
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
VOLUME /data
EXPOSE 8080
HEALTHCHECK CMD wget -qO- localhost:8080/api/v1/health || exit 1
ENTRYPOINT ["/entrypoint.sh"]