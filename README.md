# Tutor Platform

A bilingual, academically supervised tutor platform for Purnea. **Development checkpoint, not a live service.** Go/chi is the only API, React/TypeScript is the frontend, and MongoDB Atlas stores real application state. No Docker.

The original brief is preserved in `Codex_Trusted_Tutor_Platform_Master_Prompt.md` and copied in full to [docs/product-spec.md](docs/product-spec.md). Read [progress](docs/progress.md), the [acceptance matrix](docs/acceptance-matrix.md), and [launch blockers](docs/release-checklist.md) before extending or deploying.

## Run on Windows PowerShell

Go 1.26.5 and Node 22.17.1 were used for this checkpoint. Vite/Vitest require Node >=22.12 on the Node 22 line. Exact npm/Go dependencies are locked.

```powershell
npm ci
# Only create this file if it does not already exist; never overwrite your credentials.
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Privately configure MONGODB_URI and AUTH_PROVIDER=password in .env.
./scripts/api.ps1 migrate
./scripts/api.ps1 seed
./scripts/api.ps1 api
```

In another terminal:

```powershell
npm run dev
```

Open **http://127.0.0.1:5173**. Local Vite page navigation from `http://localhost:5173` now redirects to this address, preserving the path and query, so login uses the origin trusted by Go. API requests retain exact Origin and CSRF checks. The supplied Atlas URI has already been verified in this workspace. `.env` is Git-ignored. The helper scripts load it without printing secrets. The API listens only on loopback, port 8080.

If your terminal is already in `apps/api`, start with `..\..\scripts\api.ps1 api`. Bare `go run ./cmd/api` reads process environment variables, not the root `.env` file. Stop an existing API instance before starting another on port 8080.

Open **/signup** to create a parent/adult-learner or tutor account with your name, email and password. Then use **/login** with the same email/password. Passwords require 15–128 characters; a memorable passphrase works well. No OTP or SMS is used. The account, salted Argon2id credential and session persist in Atlas. Creating a tutor account does not approve or publish the tutor. Real child data and live bookings remain disabled pending review.

For fictional staff accounts, set a private `SEED_PASSWORD` before running the development seed. Emails are `mentor-a@example.test` and `admin-a@example.test`; sign in at `/login?staff=1`. Existing fixture passwords are never changed by rerunning the seed. This workspace has a generated `SEED_PASSWORD` stored privately in `.env`; do not share it or commit it. Test scripts use different, explicitly test-only credentials in isolated databases. Public signup cannot create staff accounts. Password recovery/email verification are not configured yet; the sign-in help dialog states this limitation.

## Run on Linux/macOS

```bash
npm ci
# Configure .env privately first. Only source a file you trust.
set -a
source .env
set +a
cd apps/api
go run ./cmd/migrate
go run ./cmd/seed
go run ./cmd/api
# In another terminal at repository root: npm run dev
```

Atlas needs a database user with access to the development/test databases and an IP access entry for this machine. Prefer a narrowly scoped temporary development IP entry. Never use unrestricted production network access or disable TLS. Optional offline development setup: `npm run db:local` starts an actual on-disk MongoDB replica set; it is not used when an Atlas URI is configured.

## Exercise the complete first journey

1. `/signup?role=tutor`: create a tutor account with email/password. `/apply`: submit a fictional teaching application for preview testing.
2. Use a separate browser profile/private window for `/login?staff=1`, sign in as the provisioned `mentor-a@example.test` using the private fixture password. In `/workspace`, take the assessment, record the session, six scores and evidence, then approve a defined class range with a reason.
3. In another browser profile, create a **Parent / adult learner** account at `/signup` and open `/match`. Complete the guardian declaration (fictional learner only) or choose adult self-management. Add learning needs, review and submit; then choose the approved tutor and a future trial time. Drafts survive refresh after Continue/Back saves.
4. The tutor accepts the request in `/workspace`. MongoDB transaction guards prevent tutor or learner overlaps. The server confirms a ₹0 **development trial** with a terms snapshot; there is no payment simulation.
5. The tutor records development lesson evidence and next steps. The UI explicitly allows time compression for testing and does not assert real attendance. The assigned mentor reviews it. The family sees the reviewed progress, persisted through Go and Atlas.
6. **Administrator** can suspend an approved tutor with a reason. Discovery/acceptance immediately reject that scope and an operations follow-up task is saved; existing trials are not deleted.

Accounts have deliberately separate permissions. Staff accounts are preseeded development identities with privately configured passwords, never a production registration mechanism. Sample seeds are idempotent and production seeding is prohibited. Previously issued OTP sessions are invalidated; sign in with email/password again.

## Verify

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
./scripts/integration.ps1 -Race
npx playwright install chromium
npm run e2e
```

On Linux, export `TEST_MONGODB_URI="$MONGODB_URI"`, then from `apps/api` run `go vet ./...` and `go test -race -count=1 -v ./...`. Without `TEST_MONGODB_URI`, the integration test explicitly skips; a skip is not evidence of database correctness. E2E automatically loads the root `.env`, creates a fresh `tutor_e2e_*` database, starts a Go API on 8081 and a Vite test server on 5174, and stops those test processes afterward. Real provider calls never occur. Test databases are retained for review; cleanup requires an explicit operator action.

`node scripts/contract.mjs` authors the implemented OpenAPI contract; `npm run contract` regenerates frontend API types. `/components` is the internal bilingual component showcase. Screenshot artifacts are in `docs/visual-qa`; only images explicitly marked reviewed in its README count as visual evidence.

## Deployment target

GitHub → DigitalOcean droplet with Nginx and systemd → MongoDB Atlas. See [deployment instructions](docs/deployment.md), [Nginx](infra/nginx.conf) and [systemd](infra/tutor-api.service). No GitHub remote was supplied, no push occurred, and nothing was deployed publicly. Production authenticated workflows intentionally remain disabled until the listed launch gates are implemented and reviewed.
