.PHONY: build build-frontend build-go test fmt vet docker

build: build-frontend build-go

build-frontend:
	cd frontend && npm install && npm run build

build-go:
	go build ./...

test:
	go test ./...

fmt:
	gofmt -w .

vet:
	go vet ./...

docker:
	docker compose up -d --build