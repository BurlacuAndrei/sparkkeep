.PHONY: build build-frontend build-go test fmt vet check docker

build: build-frontend build-go

build-frontend:
	cd frontend && npm install && npm run build

build-go:
	go build ./...

test:
	go test ./...
	cd frontend && npm run test

fmt:
	gofmt -w .

vet:
	go vet ./...

check: fmt vet
	cd frontend && npm run lint && npm test && npm run build
	@git diff --quiet -- internal/web/dist || (echo "❌ internal/web/dist is out of sync with frontend. Run 'npm run build' and commit the distribution bundle." && exit 1)
	go test -race ./...

docker:
	docker compose up -d --build
