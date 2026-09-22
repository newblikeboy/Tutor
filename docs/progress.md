# Progress

## 2026-09-23: email/password and account experience redesign

The user's latest instruction supersedes OTP authentication. `/signup` now creates actual parent/adult-learner or tutor accounts; `/login` uses email/password. Both are connected through Go to the supplied Atlas cluster. Public signup cannot create staff accounts or academically approve tutors. Staff sign-in accepts provisioned fixture email/password credentials. The old OTP endpoints and public identity/code selector were removed; legacy OTP sessions are rejected. Existing learning/application records were preserved.

Design: dedicated paper/ink/sage account shell, custom native notebook illustration, more readable fields, deliberate English/Hindi typography, parent/tutor role controls, password reveal, validation, pending states, preserved signup intent, and an explicit recovery-help dialog. Mobile prioritizes the form. Inspected desktop login/signup in English, desktop login in Hindi, mobile login/signup in both languages and staff Hindi mobile. Corrected a clipped illustration caption, excess signup whitespace and small field text. Four account baseline candidates were individually opened before promotion; no credentials were entered in those screenshots.

Backend: salted Argon2id (19 MiB/2 iterations/1 lane), normalized unique email credentials, transactional user/credential/session creation, bounded password work, persisted IP/email limits, generic login failures, opaque hashed sessions and unchanged role/CSRF controls. Migration and optional fixture credential seeding passed against `tutor_dev`. Root `.env` now uses `AUTH_PROVIDER=password`; a private random `SEED_PASSWORD` was added for existing fictional staff accounts. No secret values were displayed or committed. Old unused OTP secret configuration, if present, is not read. No real SMS, email or payment action occurs.

Verification: Go formatting/vet and `go test -race ./...` passed; `./scripts/integration.ps1 -Race` passed **22 Atlas subcases plus 5 unit tests** (including concurrent same-email signup across two API instances, session/privacy/approval boundaries and the original complete teaching journey). Full `npm run e2e` passed **22/22 in 3.0m**, including all 10 reviewed exact-pixel baselines. After refining account-load errors, supporting trailing-slash routes and correcting a screenshot wait, the affected account suites passed **12/12 in 1.2m**. Typecheck, lint (no warnings), 3 component tests, contract generation and production build passed. Browser checks cover English/Hindi parent signup, tutor signup, login/reload, error/retry, keyboard/reflow and negative Origin/CSRF; axe reported zero violations on examined account screens. A separate real-browser config failure/retry check passed and its loading/error images were opened. Live Atlas readiness returned ready. Source/untracked-file scans found no private URI, seed password or old OTP secret; `.env` remains ignored.

The initial migration of a Hindi test hit a shell-encoding issue in its locator strings; corrected the test text and reran successfully. One role screenshot initially caught the transient route loader; fixed the test to wait for the actual form before screenshot/axe review. No known unresolved blocker in the checked login/signup paths. The original master prompt and full spec copy remain unchanged; the user override is recorded separately.

Known remaining limitations: email ownership is not verified; password recovery/change, breached-password screening, staff MFA/provisioning and operator release review are pending. The help dialog does not pretend to send a recovery email. Production account access remains gated. The broader milestone C/D scope remains as listed below. This checkpoint redesigns account entry/onboarding; it does not claim every remaining platform screen has been redesigned or completed. Deployment target remains GitHub/DigitalOcean, without Docker; no public deployment occurred.

## 2026-09-23 follow-up: local login address failure

Reproduced the user's failing "Get development code" step: at `http://localhost:5173`, Go returned HTTP 403 `origin`; at the configured `http://127.0.0.1:5173`, challenge creation, code verification and dashboard access succeeded. API/Atlas health alone did not establish that the user's browser origin could sign in. The earlier all-green journey tests used only the canonical address and missed this case.

Vite now redirects local HTML navigation from `localhost` to its bound `127.0.0.1` address on the same port, preserving paths and query parameters. This runs only on the loopback HTTP development server. API requests are not redirected or given rewritten Origin headers; Go's origin and CSRF rules are unchanged. Existing pages must be reloaded. README now includes the command from `apps/api` and explains that the development code is shown on screen, not sent by SMS.

Added parent English desktop and mentor Hindi mobile browser regressions for the alias, query preservation, login and session persistence after reload, plus negative Origin/CSRF checks. The first targeted run caught a development-banner landmark issue; added a named region. Inspected `login-en-desktop.png` and `login-hi-mobile.png` before code generation, so tracked images contain no OTP.

Verification: `npm run typecheck`, `npm run lint`, `npm run build` passed; `npm run test` passed all 3 component tests; the final `npm run e2e` passed **13/13** in 2.4 minutes against an isolated Atlas database, including the 3 new login/security regressions and all 6 unchanged visual baselines. Login axe scans passed with no violations; successful login runs reported no browser errors. Also exercised the actual running app on port 5173 from `localhost`: redirect, challenge HTTP 201, login, refresh, and authenticated dashboard HTTP 200. Go code was unchanged; the separate Go race/integration suite was not rerun for this frontend tooling fix. No known unresolved defect in these checked login paths. Remaining feature scope and live-launch blockers are unchanged; no deployment or provider integration occurred.

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
