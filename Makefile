.PHONY: build test fmt vet docker

build:
	go build ./...

test:
	go test ./...

fmt:
	gofmt -w .

vet:
	go vet ./...

docker:
	docker compose up -d --build