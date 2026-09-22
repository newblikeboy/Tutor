# Requirement → implementation → acceptance evidence

Scope: first development journey. **Verified** means the named assertion was executed, not that the entire specification section is complete. The production launch gate remains closed.

User override 2026-09-23: OTP was replaced by email/password. `accounts.spec.ts` covers real parent/tutor signup, password login, logout/reload, validation, recovery help, network retry and responsive keyboard flows. `accounts-visual.spec.ts` uses four individually reviewed Windows Chromium baselines. Original OTP acceptance rows below are superseded by password/session evidence.

Evidence keys: **Go-I** = `apps/api/internal/app/integration_test.go` (actual Atlas, separate API instances/clients); **Go-D** = domain/config unit tests; **UI** = Vitest/RTL `ui.test.tsx`; **E1** = complete Playwright journey; **E2** = bilingual/responsive public routes; **E3** = failures/components/zoom; **E4** = Hindi adult requirement; **V** = visually reviewed screenshots/baselines, indexed in `visual-qa/README.md`. Consult progress.md for latest executed counts and any unverified checks.

| Spec / requirement | Screen and API / persistence | Test / review evidence | Status and remaining boundary |
|---|---|---|---|
| §1 Curated network; registration ≠ approval | `/apply`, `/workspace`; applications + separate assessor transitions | Go-I registration/approval, E1 | Verified for development scope; no open public directory |
| §1 Scope-specific, unpaid academic decision | Public profile, scoped approval fields; assigned mentor only | Go-D eligibility, Go-I decision/roles, E1 | Verified Mathematics classes 6–10 online; additional scopes pending |
| §1 Learner record owned by family | Learners and trials use adult owner ID | Go-I household boundary / reviewed evidence | Verified persistence; versioned learning-plan/handover domain pending |
| §1 Provisional honest brand/content | Config APP_NAME, explicit sample/development banners | E2, V | Implemented; real founder/coverage/prices/policies blocked |
| §2 Required architecture | React → `/api/v1` Go/chi → official MongoDB Go v2/Atlas | Go-I + E1 real persistence, build | Verified. User override: no Docker, GitHub/DigitalOcean |
| §2 Same-origin | Vite proxy; canonical local page redirect; Nginx template | E1 real cookie/CSRF flow; `login.spec.ts` covers localhost navigation, parent/staff sessions after reload, rejected foreign Origin and missing CSRF | Verified: 3 added regressions passed in the 13-test browser suite; droplet/TLS template unexecuted |
| §2 Public pre-render / SEO | Client-rendered public routes | No SSR claim | Pending D |
| §3 Tokens/font/layout foundation | `styles/index.css`, shared UI; self-hosted fonts | UI, E2 widths, V | Implemented first core patterns; broader screen system ongoing |
| §3 Editorial home, standards, continuity/FAQ | `/`, `/standards`, `/approach`, `/how-it-works` | E2 + V | Implemented and labelled development content |
| §3 Search rail/drawer, tutor profile | `/tutors`, `/tutors/:id` | E2 + V | Verified subject/language filters + online scope; remaining filters pending |
| §3 Parent/tutor/mentor/admin attention | `/workspace`, role-specific layouts | E1, V | Working role exemplars; broader operational dashboards pending |
| §4 Responsive widths 360/390/768/1024/1440 | Homepage grid + core mobile layouts | E2 no overflow/hero container bounds; V | Verified listed viewport cases; not every future route/state |
| §4 200% / keyboard / dialog focus | `/components`, skip link, filter and decision dialogs | UI focus restore; E2/E3 | Verified CSS 200% reflow stress and keyboard scenarios; native browser zoom + assistive-tech operator audit pending |
| §4 WCAG AA target / contrast | Semantic labels, hints, status, focus and errors | axe in E1–E4, contrast fixes inspected | Automated subset only; no accessibility certification |
| §4 Loading/error/empty/retry | Search, shared query components, public scopes | E2 real zero-match, E3 interrupted request and retry | Verified exercised states; wider role permission states API tested |
| §4 Forms preserve state/drafts/back | `/match`; `/draft`, learners/requirements | E1 refresh/back; Go-I independent instance | Verified authenticated requirement draft at step transitions; per-keystroke autosave not implemented |
| §4 Component showcase | `/components` | UI + E3 + V | Buttons/fields/password/select/dialog/drawer/status/alerts/tabs/skeletons/learning preview. Upload/tooltip/table/pagination primitives pending |
| §5 Discovery without signup | `/tutors`, public DTO, nullable session status | E2, Go-I DTO privacy | Verified. Comparison/shortlist, budget/time/locality/board filters pending |
| §5 No match captures actual requirement | Search empty CTA → `/match` → MongoDB | E2 and E1 | Requirement persists; operator matching/waitlist management pending |
| §5 Locality aliases / valid distance | Free locality text, no GPS/address/distance claims | E1 Purnea and Go-I Purnia accepted | Structured city-scoped aliases/geospatial not yet implemented |
| §6 Minor guardian gate | Step 1 consent before learner inputs; `/consents` | Go-I guardian enforcement; E1 | Development declaration only; live verification is blocked |
| §6 Adult self / multiple learners | `adult_self`, owner-controlled collection and switcher | Go-I multiple; E4 Hindi adult | Verified first-slice persistence; account/preferences/privacy workflows pending |
| §6 Requirement → tutor trial | `/match`; `/requirements`, `/trials` | E1 end-to-end | Verified request and actual tutor-confirmed time |
| §6 Versioned tuition agreement/enrollment | Only trial terms snapshot implemented | Go-I zero-price immutable snapshot | Full tuition agreement, paid enrollment, renewals pending C |
| §6 Classes/notes/progress | Tutor evidence → assigned mentor → family | Go-I visibility/closure, E1 | Verified one trial class record/review; recurring calendar/homework/work uploads pending |
| §6 Parent conversations/invoices/privacy | No pretending routes exist | None | Pending C |
| §7 Application assessment stages | `/apply`, mentor queue; `/application`, decision API | Go-I + E1 | Working bounded application/scorecard/scope. Documents, real appointment scheduling and reassessment UI pending |
| §7 Tutor availability/earnings/support | Only assigned free trials/evidence | Go-I access/scheduling | Recurrence/leave/capacity/travel/payout ledger pending C |
| §7 No all-child browsing/self-approval | Role and assignment checks; ended-trial redaction | Go-I negative tests | Verified implemented endpoints; file/message domains not exposed |
| §8 Least-privilege staff | Mentor assigned review; admin suspension; support/finance denied academics | Go-I roles, E1 admin/mentor | Verified slice. Staff invites, conflicts, specialist assignment pending |
| §8 Queues/audit/status | Mentor decisions and admin audit/suspension | Go-I audit effects, E1, V | Working small queues; filters, capacity/financial/CMS/operations reports pending |
| §9 Versioned learning continuity/handover | Family-owned trial evidence persists | Go-I restart, E1 reviewed evidence | General versioned plans, family-authorised handover/revocation pending |
| §9 Safeguarding/genuine reviews/policy ops | Explicit draft policies and support limitations | V policy copy | Restricted cases/reviews/escalation/retention pending; operator/legal gate |
| §10 Explicit transitions | `state-machines.md`; server workflows | Go-I illegal transition/approval tests | Verified current application/trial subset; holds/disputes/enrollment not implemented |
| §10 Recheck scope/new-booking suspension | Discovery filters; version lock on acceptance | Go-I suspension/eligibility | Verified; creates operations task without deleting existing lessons |
| §10 Price snapshots/idempotency | Server zero-paise terms; actor/key/fingerprint transaction | Go-I request replay/tampering | Verified free trial; all future money/booking commands need idempotency |
| §11 Storage/indexes/validation | Explicit migrate command, bounded collections/history separation | Atlas migrate executed; Go-I fixtures | Required-field validators/indexes present; richer schemas/versioned migration ledger pending |
| §12 Concurrency, including cancellation | Both tutor/day and learner/day guards, ordered sequential transactions | Go-I simultaneous overlap across 2 API instances, cancel/rebook, UTC-key boundary | Verified tested cases. Recurring/travel/hold/reschedule paths pending; no in-process mutex substitute |
| §12 Explicit expiry | Password-session expiry filters plus TTL; old OTP sessions rejected | Go-I expiration before cleanup and legacy session rejection | Verified; paid hold expiry absent |
| §12 Outbox worker | Persisted suspension follow-up only | Go-I task exists | Worker leases/backoff/failed-job delivery visibility pending C |
| §13 Authentication/session/CSRF, user override | Email/password, Argon2id credentials, atomic signup, hashed sessions, exact Origin, CSRF | Go-I signup/normalization/duplicate concurrency/no staff escalation/hash privacy/generic failures/rate limits/revocation; account and login E2E | Working Atlas-backed parent/tutor signup and password login. Recovery, email ownership policy, breached-password screening and staff MFA/provisioning remain live gates |
| §13 Production demo rejection | Config gate, sample discovery exclusion, private routes closed | Go-D + Go-I prod replay/seed checks | Verified; production auth intentionally disabled |
| §13 Private uploads / storage | Not exposed | None | Pending C/D, not claimed scanned or secure |
| §14 Contract/generated TS | Implemented OpenAPI and generated schema.d.ts | Generation + TS build | Verified implemented subset; remaining modules intentionally absent |
| §15 Payments/provider adapters | Disabled; no charge/success UI | Config tests, Go-I zero price | Not implemented. Provider/payment-domain sandbox work pending C, live approval blocked |
| §16 English/Hindi and language preference | i18next, self-hosted Devanagari; locale-only localStorage | UI + E2/E4 + V | Verified sampled core flows; authored record text remains in its original language |
| §16 Splitting/performance | Lazy private routes; bounded queries/font subsets | Production build executed | Mobile Lighthouse/field vitals/pre-render not yet measured |
| §17 Browser QA / meaningful tests | Actual Chromium + Atlas flows, axe, screenshots | E1–E4 + Go-I + V | Working first-slice evidence; full spec acceptance remains open |
| §18 Deterministic development fixtures | Idempotent fictional identities and approved tutor samples | Seed rerun/Go-I | Current cases only; disputes/payment fixtures pending with their domains |
| §18 CI/operations/backups | GitHub workflow, Nginx/systemd, release script, backup guidance | Local build/tests; template review | GitHub CI run, droplet validation and restore rehearsal unexecuted |
| §19 Continuity docs | AGENTS/progress/matrix/spec/decisions | Repository artifacts | Maintained at this checkpoint |

No row upgrades the whole platform to production readiness. Do not replace a pending acceptance test with a static fixture, localStorage record or success toast.
