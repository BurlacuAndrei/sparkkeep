# syntax=docker/dockerfile:1
FROM golang:1.25-alpine AS build
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