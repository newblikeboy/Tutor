#!/usr/bin/env bash
set -euo pipefail
# Build tooling only. Run on Linux for the intended droplet architecture.
cd "$(dirname "$0")/.."
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
mkdir -p .local/release/web
(cd apps/api && go vet ./... && go test ./... && CGO_ENABLED=0 go build -trimpath -o ../../.local/release/tutor-api ./cmd/api && CGO_ENABLED=0 go build -trimpath -o ../../.local/release/tutor-migrate ./cmd/migrate && CGO_ENABLED=0 go build -trimpath -o ../../.local/release/tutor-staff ./cmd/staff)
cp -R apps/web/dist/. .local/release/web/
printf '%s\n' 'Release files built in .local/release. Deployment and live readiness require operator review.'
