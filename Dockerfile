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
RUN apk add --no-cache ca-certificates yt-dlp chromium font-noto-cjk wget su-exec \
    && adduser -D -u 1000 appuser
COPY --from=build /out/sparkkeep /usr/local/bin/sparkkeep
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
VOLUME /data
EXPOSE 8080
HEALTHCHECK CMD wget -qO- localhost:8080/api/v1/health || exit 1
ENTRYPOINT ["/entrypoint.sh"]