# Tutor Platform

A bilingual, academically supervised tutor platform for Purnea. **Development checkpoint, not a live service.** Go/chi is the only API, React/TypeScript is the frontend, and MongoDB Atlas stores real application state. No Docker.

The original brief is preserved in `Codex_Trusted_Tutor_Platform_Master_Prompt.md` and copied in full to [docs/product-spec.md](docs/product-spec.md). Read [progress](docs/progress.md), the [acceptance matrix](docs/acceptance-matrix.md), and [launch blockers](docs/release-checklist.md) before extending or deploying.

## Run on Windows PowerShell

Go 1.26.5 and Node 22.17.1 were used for this checkpoint. Vite/Vitest require Node >=22.12 on the Node 22 line. Exact npm/Go dependencies are locked.

```powershell
npm ci
# Only create this file if it does not already exist; never overwrite your credentials.
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Privately configure MONGODB_URI and a random OTP_SECRET in .env.
./scripts/api.ps1 migrate
./scripts/api.ps1 seed
./scripts/api.ps1 api
```

In another terminal:

```powershell
npm run dev
```

Open **http://127.0.0.1:5173**. Use that origin consistently; `localhost` is a different origin for CSRF purposes. The supplied Atlas URI has already been verified in this workspace. `.env` is Git-ignored. The helper scripts load it without printing secrets. The API listens only on loopback, port 8080.

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

1. `/login`: choose **Tutor applicant**, get the development code shown on screen, and sign in. No SMS is sent. `/apply`: submit the fictional teaching application.
2. Use a separate browser profile/private window for `/login?staff=1`, choose **Academic mentor**. In `/workspace`, take the assessment, record the session, six scores and evidence, then approve a defined class range with a reason.
3. A separate **Family A** session opens `/match`. Complete the guardian declaration (fictional learner only) or choose adult self-management. Add learning needs, review and submit; then choose the approved tutor and a future trial time. Drafts survive refresh after Continue/Back saves.
4. The tutor accepts the request in `/workspace`. MongoDB transaction guards prevent tutor or learner overlaps. The server confirms a ₹0 **development trial** with a terms snapshot; there is no payment simulation.
5. The tutor records development lesson evidence and next steps. The UI explicitly allows time compression for testing and does not assert real attendance. The assigned mentor reviews it. The family sees the reviewed progress, persisted through Go and Atlas.
6. **Administrator** can suspend an approved tutor with a reason. Discovery/acceptance immediately reject that scope and an operations follow-up task is saved; existing trials are not deleted.

Accounts have deliberately separate permissions. Staff choices are preseeded development identities, never a production registration mechanism. Sample seeds are idempotent and production seeding is prohibited.

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
