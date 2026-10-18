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
	@GO_VER=$$(grep -oE 'Version = "[0-9]+\.[0-9]+\.[0-9]+"' version.go | cut -d'"' -f2); \
	PKG_VER=$$(node -p "require('./frontend/package.json').version"); \
	if [ "$$GO_VER" != "$$PKG_VER" ]; then \
		echo "❌ Version drift: version.go ($$GO_VER) != frontend/package.json ($$PKG_VER)"; exit 1; \
	fi
	cd frontend && npm install && npm run lint && npm test && npm run build
	@git diff --quiet -- internal/web/dist || (echo "❌ internal/web/dist is out of sync with frontend. Run 'npm run build' and commit the distribution bundle." && exit 1)
	go test -race ./...

docker:
	docker compose up -d --build
