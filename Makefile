.PHONY: build check e2e dev-web dev-server smoke

build:
	npm --prefix web ci
	npm --prefix web run build
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/planning-poker ./cmd/server

check:
	npm --prefix web run lint
	npm --prefix web run format:check
	npm --prefix web run build
	npm --prefix web test
	go vet ./...
	go test -race ./...
	npm --prefix web run e2e

e2e:
	npm --prefix web run e2e

dev-web:
	npm --prefix web run dev

dev-server:
	go run ./cmd/server

smoke:
	docker build -t planning-poker:smoke .
	sh scripts/container-smoke.sh
