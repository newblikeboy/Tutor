# Project instructions

- Brand name (2026-09-24): **TheGyanSetu**. Preserve this exact spelling/casing throughout visible branding, metadata and configuration defaults.
- Signed-out private routes (2026-09-24): go directly to sign-in with the requested destination preserved; do not restore the intermediate privacy/sign-in invitation page.
- User preference (2026-09-23): never use the `update-design` skill. Make requested interface changes directly in this project.
- User language override (2026-09-24): use English-only interface copy. No language switcher, account language selector or Hindi UI translations. Ignore legacy Hindi display preferences; preserve authored records and teaching-language/subject choices.
- User UI direction (2026-09-23): no development-preview banner in parent/tutor account or workspace screens, no website-return link in sign-in/private navigation, and concise task-focused copy. Preserve server release gates and labels on actual sample records and development actions.
- Landing-page direction (2026-09-23): remove its development-preview banner and use the same paper/ink/sage palette with crystal-like highlights, bright surfaces and restrained glass effects. Keep the AI image label and real database-backed tutor discovery.

Read `docs/product-spec.md` in full before extending product scope. Read `docs/progress.md` and `docs/acceptance-matrix.md` before resuming.

- Go + chi REST API only; React/TypeScript strict + Vite frontend; MongoDB Atlas with the official Go driver v2. Node is build/test tooling only.
- User override (2026-09-23): **no Docker**. GitHub source and CI, DigitalOcean droplet, systemd + Nginx, Atlas. Local replica-set binaries are optional development/test tooling.
- User override (2026-09-23): **email/password login and signup; no OTP**. Argon2id credentials, opaque sessions, public parent/tutor roles only. Staff remain provisioned; no public selector or automatic tutor approval. Production access stays gated until release review.
- User fee override (2026-09-24): tutors never set fees. Staff finalize Online hourly and Home Tuition weekly/monthly plans during the interview, including Home class count/duration; parents see staff-confirmed prices for approved scope. Existing agreements keep their saved prices.
- Tutor registration never implies academic approval. Scope, availability and suspension checks belong on the server. Staff are provisioned, never public-role selectable in production.
- Guardian-controlled learner data, ownership/assignment checks, HttpOnly sessions, CSRF protection. Never put credentials or learner data in localStorage/logs/public fixtures.
- Persist actual actions through Go and MongoDB. No mock success, fake payment or production in-memory fallback. Clearly label development adapters and sample records.
- Design tokens and bilingual accessible components first. Inspect browser screenshots at desktop/mobile before replicating patterns; report unavailable checks honestly.
- User design direction (2026-09-23): preserve the approved login/signup design. Homepage uses its paper/ink/sage palette and a labelled AI-generated hero scene; keep tutor discovery database-backed. Photo provenance/prompt: `docs/assets.md` and `docs/hero-image-prompt.md`.
- Post-login uses a separate app shell on `/workspace`, `/match`, `/apply`: role-specific sidebar/drawer and task views in the same paper/ink/sage palette. Keep counts derived from authorised API records, learner selection and queue filters in URL state, and all academic decisions server-controlled.
- Preserve unrelated changes. Update progress and acceptance evidence at checkpoints. No public deployment, paid provisioning, real delivery/charges or destructive changes without operator authorization.
- Commands: `npm ci`, `npm run dev`, `npm run build`, `npm run test`, `npm run typecheck`, `npm run lint`, `npm run e2e`; API commands from `apps/api`: `go run ./cmd/api`, `go run ./cmd/migrate`, `go run ./cmd/seed`, `go test ./...`, `go vet ./...`.
- Go CLI entrypoints load the nearest development `.env` up to two parents; explicit process variables win and production does not auto-load files. `./scripts/api.ps1 api|migrate|seed` also works. Run Atlas integration with `./scripts/integration.ps1 -Race`. E2E starts isolated ports/databases; never point fixtures at production. Windows screenshot baselines require individual visual review before replacement.
- Local browser pages canonicalize `localhost` to `127.0.0.1` in Vite; keep Go's exact Origin/CSRF checks. Cover login from both addresses when changing startup/auth tooling.
- See `docs/architecture.md`, `docs/design-system.md`, `docs/state-machines.md`, `docs/release-checklist.md`, and `docs/deployment.md`.
- Pending completion batches are in `docs/completion-plan.md`; tuition routes share the private shell. Shared tutor/learner guards cover trials and recurring classes; retain immutable agreements/plans and revoke old-tutor access after consented handover. Atlas reached 500 collections during tests; read-only `scripts/db-diagnostics.mjs` writes a cleanup review manifest. Never delete retained test databases without explicit approval.
- Payments require real test configuration; no client callback alone activates tuition. Files remain quarantined without an actual successful configured scan; recheck assignment for every download. See `docs/payments.md` and `docs/private-files.md`. Staff bootstrap reads a hidden terminal/secret-manager input, never a command-line password or default credential.
