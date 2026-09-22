# Project instructions

Read `docs/product-spec.md` in full before extending product scope. Read `docs/progress.md` and `docs/acceptance-matrix.md` before resuming.

- Go + chi REST API only; React/TypeScript strict + Vite frontend; MongoDB Atlas with the official Go driver v2. Node is build/test tooling only.
- User override (2026-09-23): **no Docker**. GitHub source and CI, DigitalOcean droplet, systemd + Nginx, Atlas. Local replica-set binaries are optional development/test tooling.
- User override (2026-09-23): **email/password login and signup; no OTP**. Argon2id credentials, opaque sessions, public parent/tutor roles only. Staff remain provisioned; no public selector or automatic tutor approval. Production access stays gated until release review.
- Tutor registration never implies academic approval. Scope, availability and suspension checks belong on the server. Staff are provisioned, never public-role selectable in production.
- Guardian-controlled learner data, ownership/assignment checks, HttpOnly sessions, CSRF protection. Never put credentials or learner data in localStorage/logs/public fixtures.
- Persist actual actions through Go and MongoDB. No mock success, fake payment or production in-memory fallback. Clearly label development adapters and sample records.
- Design tokens and bilingual accessible components first. Inspect browser screenshots at desktop/mobile before replicating patterns; report unavailable checks honestly.
- Preserve unrelated changes. Update progress and acceptance evidence at checkpoints. No public deployment, paid provisioning, real delivery/charges or destructive changes without operator authorization.
- Commands: `npm ci`, `npm run dev`, `npm run build`, `npm run test`, `npm run typecheck`, `npm run lint`, `npm run e2e`; API commands from `apps/api`: `go run ./cmd/api`, `go run ./cmd/migrate`, `go run ./cmd/seed`, `go test ./...`, `go vet ./...`.
- Windows loads private `.env` with `./scripts/api.ps1 api|migrate|seed`. Run Atlas integration with `./scripts/integration.ps1 -Race`. E2E starts isolated ports/databases; never point fixtures at production. Ten screenshot baselines are Windows-specific and were visually reviewed; do not auto-update them.
- Local browser pages canonicalize `localhost` to `127.0.0.1` in Vite; keep Go's exact Origin/CSRF checks. Cover login from both addresses when changing startup/auth tooling.
- See `docs/architecture.md`, `docs/design-system.md`, `docs/state-machines.md`, `docs/release-checklist.md`, and `docs/deployment.md`.
