# Progress

## 2026-09-23 checkpoint: first persisted journey implemented

Full specification read and preserved. Repository initially contained only the master prompt; no ancestor/local AGENTS or application existed. User override recorded: **no Docker**; GitHub → DigitalOcean/systemd/Nginx + Atlas. User supplied Atlas credentials in a file named `,env`; corrected the filename to `.env` and verified it is ignored by Git. No URI/secrets are in source or docs. The Atlas connection, indexes and idempotent sample seeding succeeded in `tutor_dev`.

### Actual working features

- Bilingual design tokens/components and responsive editorial homepage, scoped tutor search with mobile drawer and real no-match state, tutor details, login, standards/approach/draft policy/support pages, and internal component showcase.
- Distinct parent, tutor, mentor and admin workspaces. Public browsing does not require signup.
- Real Go/Atlas journey: tutor submits private application → assigned mentor records six-dimensional assessment/evidence → approves a class/subject/mode scope → guardian-gated or adult-self learner and saved requirement → parent requests trial with versioned zero-fee development terms → tutor acceptance reserves both schedules transactionally → lesson evidence → assigned mentor review → family sees reviewed progress.
- Draft/back/refresh persistence, multiple learners, cross-household denial, staff role boundaries, suspension/removal from discovery and saved operations follow-up, explicit scope/session/OTP expiry, replay protection, logout/privilege revocation, CSRF/Origin controls and anonymous session status without spurious 401 requests.
- Actual Atlas repositories and transaction guards shared by all API instances; no in-memory application fallback or localStorage CRUD. Only language preference uses localStorage.

### Verification executed

| Command/check | Actual result |
|---|---|
| `./scripts/api.ps1 migrate` / `seed` | Passed against supplied Atlas, idempotent migration/seed |
| `go fmt ./...`, `go vet ./...` | Passed |
| `go test ./...` | Unit tests passed; integration explicitly skips without TEST_MONGODB_URI |
| `go test -race ./...` | Passed for non-integration suite |
| `./scripts/integration.ps1 -Race` | Passed: 18 Atlas integration subcases plus 3 unit tests, including concurrent overlapping HTTP accepts from separate API instances and actual API stop/new client restart persistence. Latest integration duration 21.35s; no races reported. |
| `npm run typecheck`, `npm run lint` | Passed |
| `npm run test` | Passed: 3 Vitest/RTL component tests |
| `npm run build` | Passed: strict TypeScript + Vite production build; split account routes and bundled local font files |
| OpenAPI generation/type alignment | `node scripts/contract.mjs` and `npm run contract` passed; generated types used by frontend |
| npm install/audit | Locked exact versions; install reported zero vulnerabilities |
| Final running-app check | `/api/v1/ready` returned ready against Atlas. Chromium visited home, tutor search, tutor profile and login: zero browser console/page errors. Staged files passed a check for the private URI and OTP secret; `.env` is excluded. |
| `npm run e2e` | **10/10 passed** in the final complete rerun (1.7m): full four-role journey, bilingual/responsive public routes, loading/error/retry/keyboard/200% reflow, Hindi adult requirement, and 6 visually reviewed exact-pixel baselines. Axe scans on exercised screens reported no violations. |

Initial failed checks were fixed rather than suppressed: missing Vitest imports, form accessible label/hint mix-up, insufficient label contrast, 200% header overflow and mobile intrinsic grid width. The Hindi added test now waits for the backend-confirmed next step before refreshing, as the English persisted-draft test already did.

### Screenshots inspected

Actual screenshots were opened for homepage desktop/mobile in both languages, profile, no-match/filter drawer, parent reviewed progress, tutor class evidence, mentor scorecards and admin queues (including Hindi mobile), Hindi requirement form and 200% reflow. Six reviewed public-page baseline images are retained. Exact inspected files, fixes and limitations: [visual QA index](visual-qa/README.md). Homepage overflow assertions cover 360/390/768/1024/1440px. Keyboard skip/dialog focus and axe checks ran; this is not WCAG certification. Additional captured widths are not claimed individually reviewed.

### Remaining defects / scope

No known blocking defect in the tested first development journey. The expanded Hindi flow passed after correcting the test's save-confirmation wait. This is **not the complete platform**. Milestone A has the foundation and core exemplars, with additional catalog components pending. Milestone B has the bounded development journey; no payment provider is configured, so no payment success is simulated. Milestones C/D remain substantial: tuition agreements/enrollment, live phone onboarding/staff MFA, availability/recurrence/travel/holds, messaging/private uploads, versioned learning plans/handover, support/safeguarding/CMS/privacy operations, payments/ledger/refunds/outbox, broad regression coverage, pre-render/SEO, Lighthouse and operator release review. See the acceptance matrix for each boundary.

Production private endpoints deliberately return 503 and startup rejects demo authentication. Guardian declaration is development-only; it is never described as verification. Assessment scheduling currently records a development session instant, not a live appointment calendar. Queries cap at 100; cursor pagination and richer migration/schema validation remain open. Drafts save at successful step transitions, not on every keystroke. Private authored text stays in its original language.

### Setup and launch blockers

Run API with `./scripts/api.ps1 api`, frontend with `npm run dev`, then open `http://127.0.0.1:5173`. `.env` already contains the user-supplied Atlas configuration. Exact Windows/Linux commands are in README.md. Integration/E2E create isolated `tutor_test_*`/`tutor_e2e_*` databases and retain them for operator review; no existing database is dropped. The optional local MongoDB process was stopped once Atlas became available.

GitHub remote, droplet/domain/TLS and deployment authorization have not been supplied. Nginx/systemd/build/CI templates are present but not executed on GitHub or DigitalOcean. No public deployment, real SMS, charge, payout, account provisioning or paid resource creation occurred. Live OTP/provider approval, guardian verification, staff MFA, merchant arrangement, prices/policies/legal review, safeguarding staffing, production data review, private file security, backups/restore rehearsal and operator sign-off remain blockers; see release-checklist.md. No Lighthouse score, field performance, native-zoom or screen-reader certification is claimed.
