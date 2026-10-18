# GoCoaching

A tutor marketplace built with Go/chi, React/TypeScript/Vite and MongoDB Atlas.
Go serves the REST API; Nginx serves the built frontend on the existing DigitalOcean
deployment. The interface uses English and the paper/ink/sage design system.

## Source map

- `apps/api/cmd`: API, additive migrations, development seeds and staff provisioning.
- `apps/api/internal/app`: authenticated workflows and background jobs.
- `apps/api/internal/domain`: saved records and business validation.
- `apps/api/internal/storage`: MongoDB access, indexes and schema migrations.
- `apps/web/src/routes`: public pages and role-specific workspace screens.
- `apps/web/src/components`: shared UI, forms and workflow controls.
- `apps/web/src/lib`: API/session clients and shared frontend behavior.
- `contracts/openapi.yaml`: generated API contract; its authoring scripts live in `scripts`.
- `tests`: browser coverage and [test/fixture guidance](tests/README.md).
- `infra` and `scripts`: systemd/Nginx configuration and build/deployment tooling.

`AGENTS.md` records current product decisions. Local `docs` contains the product
specification, progress and design evidence; that directory is intentionally
Git-ignored. Older requirements are superseded by the dated decisions in AGENTS.

## Run locally

Install the Go version in `apps/api/go.mod` and a compatible Node.js release
(Node 22.12+ on the Node 22 line). Dependencies are locked in npm and Go lockfiles.

```powershell
npm ci
# Create only if missing; configure backend secrets privately before startup.
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
./scripts/api.ps1 api
```

In another terminal at repository root:

```powershell
npm run dev
```

Open http://127.0.0.1:5173. Vite redirects local document navigation from localhost
to this canonical origin, preserving the destination. The API binds to loopback
on port 8080 and keeps exact Origin/CSRF checks.

Go entrypoints load the nearest development `.env` up to two parent directories;
explicit process variables win. Production uses the explicit systemd environment
and never auto-loads `.env`. Keep all secrets out of `VITE_*` variables.

For Linux/macOS, run the Go entrypoint from `apps/api`:

```bash
go run ./cmd/api
```

Configure Atlas privately, or explicitly run `npm run db:local` for a local
on-disk replica set. There is no automatic database fallback and no Docker.
Apply required additive migrations with `./scripts/api.ps1 migrate` or
`go run ./cmd/migrate` from `apps/api`; running the API never seeds accounts.

## Accounts and integrations

Public parent/tutor signup requires an email OTP before creating the account.
Parents and tutors can use password or email-code sign-in; provisioned staff use
passwords only. Staff accounts are created by `apps/api/cmd/staff`, with a hidden
password prompt, never by public signup. Passwords require 8–128 characters.

Parents declare their relationship and accept privacy consent before saving a
minor's learning profile. This is a declaration, not identity verification or
admin approval. Owned student references and each student's subscription/expiry
remain independent checks. Tutors require assigned-mentor academic approval.

Google Calendar/Meet uses the hosting mentor's or tutor's own authorization.
Cloudinary uploads go directly from the browser; Go verifies metadata and
controls short-lived private access. SMTP, Google, Cloudinary and Razorpay use
explicit backend configuration; see `.env.example`. Missing configuration never
silently activates a test adapter.

`PAYMENT_PROVIDER=simulation` is an explicit supported test mode. Its captures and
bookings are labelled and never counted as real revenue or tutor earnings. Keep
these labels and provider checks when changing payment code.

Development seeds are optional and fictional. Set a private `SEED_PASSWORD` and
run `./scripts/api.ps1 seed` only for a development/test database. Seeding refuses
production and does not replace existing passwords. Never publish sample records
as real tutors or delete retained test databases during source cleanup.

## Verify changes

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

From `apps/api`:

```bash
go vet ./...
go test ./...
```

Integration tests need an explicit `TEST_MONGODB_URI` for an isolated replica set.
Without it they skip; that does not validate persistence. Browser tests use
`npm run e2e`, start separate API/Vite servers on 8081/5174 and retain generated
`tutor_e2e_*` databases for review. See [tests/README.md](tests/README.md) for fixture
boundaries and screenshot guidance. The `/components` showcase is local-only and
is excluded from production builds.

Regenerate API types after contract changes:

```bash
node scripts/contract.mjs
npm run contract
```

## Deploy the existing droplet

From the droplet's existing Tutor Git checkout, after the intended commit is pushed:

```bash
git pull --ff-only origin main && sudo bash scripts/deploy-existing.sh
```

The script builds a release, runs the existing additive migration scopes using
the API service identity, switches the release symlink and checks readiness.
It retains the previous release and private `/etc/tutor/api.env`; it never seeds
or resets production data. A GitHub push alone does not deploy the website.
