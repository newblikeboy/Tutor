# Repository audit: dead code and feature-preserving optimization

Date: 2026-10-08. Source baseline: `2a6c78683a6e937bdf169847ae3c81f95d6191d0`.

Implementation follow-up (2026-10-09): see [repository improvements](repository-improvements-2026-10-09.md) for the changes, before/after measurements and remaining operational limits. This document retains the original audit findings and baseline.

This is an audit, not a cleanup implementation. Application code, data, dependencies and deployment configuration were not changed. Findings distinguish confirmed unused code, maintenance candidates, measured loading costs and source-derived scaling risks. No feature removal is recommended.

## Priority findings

| Priority | Finding | Recommended action |
| --- | --- | --- |
| High | Older mentor dashboard includes unrelated submitted applications | Apply the same assignment boundary as the staff application endpoints; add an authorization regression |
| High | Shared 100-record cap can silently omit tutors and report records | Introduce explicit pagination and aggregate totals; apply eligibility/location filtering before result limits |
| Medium | Public entry loads 511,151 bytes of JavaScript before compression | Split public routes, feature dictionaries and role-specific workspace components |
| Medium | Staff reports make database calls per tutor and assignment | Batch authorized report queries and aggregate counts in MongoDB |
| Medium | Worker handles only one job per five-second tick and ignores returned errors | Drain a bounded batch, preserving leases/idempotency; surface sanitized failures |
| Low | Unused component, obsolete CSS/copy and stale capture scripts remain | Remove confirmed dead declarations and repair capture tooling with visual verification |
| Low | Deployment accumulates old hashed assets | Establish a reviewed retention policy preserving rollback and existing tabs |

## Confirmed unused code and maintenance candidates

### Unused component

[`ServiceLocalityPicker`](../apps/web/src/components/location-search.tsx#L251) has no callers in the frontend import/reference scan or repository text references outside its declaration. Its source module is still needed by active location controls. Remove the component and only the imports, styles and copy exclusively owned by it; keep the shared location/geolocation functionality.

The production frontend import graph contains 55 reachable source modules and no orphan source modules. This does **not** mean every declaration within them is used. Default exports reached through `React.lazy` are used and must not be deleted on the basis of a simplistic reference scan.

### Obsolete CSS and copy

Confirmed examples with no current matching frontend markup include `.auth-layout` and `.code-reveal` in [`index.css`](../apps/web/src/styles/index.css#L1635), and `.desk-public-link` in [`workspace.css`](../apps/web/src/styles/workspace.css#L159). There are additional candidate sections for older hero, profile and workspace layouts.

The root `heroA`, `heroB`, `heroC`, `heroBody`, `continuousTitle`, `continuousBody`, `availableTitle` and `availableBody` entries in [`locales/index.ts`](../apps/web/src/locales/index.ts#L19) have no current references. The old root `finalTitle`/`finalBody` entries are separate from the active `landing.finalTitle`/`landing.finalBody` keys.

Do not automatically delete every unmatched CSS class or translation key. Dynamic classes such as `desk-view-${view}`, dynamic translation keys, responsive states, errors and print layouts require explicit checks. Initial-page coverage is evidence for splitting CSS, not proof that uncovered rules are dead.

### Test-only helper

[`FeePlan.LessonFee`](../apps/api/internal/domain/fees.go#L42) has no production callers; its only two calls occur in the same assertion in [`fees_test.go`](../apps/api/internal/app/fees_test.go#L78). Review whether it remains an intended domain contract before removing both the obsolete helper and its implementation-only test. Do not remove active fee calculation, saved agreements or pricing validation.

### Stale capture scripts

[`capture-baselines.mjs`](../scripts/capture-baselines.mjs#L28) waits for `.profile-header`; [`capture-workspace-baselines.mjs`](../scripts/capture-workspace-baselines.mjs#L42) waits for `.desk-start-card`. These selectors have no current markup. Both scripts and [`capture-auth.mjs`](../scripts/capture-auth.mjs#L7) still include Hindi variants/localStorage language setup although the interface is English-only. Update selectors and scenario labels, preserving desktop/mobile coverage and historical screenshots. These are maintenance defects, not website features to remove.

## Measured frontend baseline

A fresh production build was served locally and visited in fresh Chromium contexts at 1440 x 1000. Measurements describe loaded asset bytes, not real-user latency or Core Web Vitals.

| Page | JavaScript, decoded bytes | CSS loaded, decoded bytes | Shared CSS exercised in initial state |
| --- | ---: | ---: | ---: |
| `/` | 511,151 | 83,178 | 23,419 / 83,178 (28%) |
| `/tutors?searched=1` | 511,151 | 83,178 | 15,551 / 83,178 (19%) |
| `/login` | 637,996 | 95,801 | 6,858 / 83,178 (8%) |
| `/signup` | 637,996 | 95,801 | 7,062 / 83,178 (8%) |

The public entry's three JavaScript files total approximately **161 KB with local gzip compression**, versus **511 KB decoded**. These are different measurements; 511 KB is not the compressed network transfer. All four pages had zero browser page errors and no horizontal overflow in this audit. These checks were not a full accessibility or visual regression run.

Concrete opportunities:

1. [`main.tsx`](../apps/web/src/main.tsx#L18) eagerly imports Home, Info, Search, TutorDetail and Showcase from one public module. Split these into route-loaded modules while retaining every route, including the component showcase.
2. [`locales/index.ts`](../apps/web/src/locales/index.ts) eagerly includes feature dictionaries. The application locale modules contribute 78,158 bytes of rendered module content before final chunk minification. Load feature dictionaries with their routes, keeping shared labels ready. That number is **not** a predicted compressed saving.
3. [`workspace.tsx`](../apps/web/src/routes/workspace.tsx#L16) statically imports both Parent and StaffWorkspace. Parent users therefore download staff-screen implementation as part of the workspace dependency graph. Load the applicable role component lazily, preserving server authorization and loading/error behavior.
4. `main.tsx` imports global/home CSS for all routes. Move page-owned styles beside their route modules after removing proven obsolete rules. Keep shared tokens, components, focus states and responsive behavior global where appropriate.
5. [`infra/nginx.conf`](../infra/nginx.conf#L36) already gives hashed `/assets/` long caching. `/images/` and `/brand/` fall through to `expires -1`. Fingerprint those public images before giving them long-lived caching, or use a deliberate shorter cache policy for mutable names. Do not assume production compression is disabled: global Nginx settings were not inspected.

Actual savings require an after-change build and equivalent browser checks. No latency improvement percentage is claimed.

## Backend correctness and scaling

### Mentor dashboard assignment boundary

[`dashboard`](../apps/api/internal/app/workflows.go#L249) selects mentor applications using `status == submitted OR assessorId == current user`. This returns unrelated submitted applications, including their serialized application fields. The newer [`staffApplicationFilter`](../apps/api/internal/app/staff.go#L34) restricts mentors to their own assessor ID. The old dashboard is still routed at `/api/v1/dashboard` and used by the mentor reviews workspace, so it is **live code**, not safe to delete as dead code.

Align the dashboard with the approved assignment policy. Add an isolated regression with assigned, unassigned and other-mentor submitted applications, verifying both API response and reviews behavior. This finding is established from source; no production accounts or records were accessed, and no live exploit test was performed.

### Hidden 100-record ceiling

[`storage.Many`](../apps/api/internal/storage/mongo.go#L42) applies `limit(100)` and `_id` ascending sorting to all callers. In [`tutors`](../apps/api/internal/app/http.go#L306), paused-tutor removal, radius filtering and final distance/name sorting happen after that limit. An eligible nearby tutor beyond the first 100 matching IDs can be omitted even when the response has fewer than 100 tutors.

Report callers also use this helper for assignments, classes and learning plans, so totals and review-date summaries can omit later records. Preserve bounded queries, but replace implicit truncation with endpoint-specific pagination and complete aggregate counts. Move eligibility and location matching before the public result limit. Do not simply remove the cap globally and create unlimited memory consumption. Verify with fixtures exceeding 100 records and representative query plans.

### Report queries grow with the number of records

[`mentorTutorReports`](../apps/api/internal/app/admin.go#L275) executes three counts per tutor and loops over assignments for every tutor. [`mentorAssignmentReports`](../apps/api/internal/app/admin.go#L302) fetches classes and plans separately per assignment. Together this adds `3*T + 2*A` database operations for T tutors and A assignments, beyond the initial reads.

Use scoped aggregations for counts/status groups and batched plan summaries, retaining exact statuses, review-date semantics and authorization. Build an in-memory assignment-count map instead of repeatedly scanning all assignments. Select indexes from actual query plans rather than adding speculative indexes.

[`revenue`](../apps/api/internal/app/admin.go#L403) and [`monthlyRevenue`](../apps/api/internal/app/admin.go#L422) separately load all matching projected payment records into Go memory before summing. Aggregate exact integer paise totals and monthly groups in MongoDB, preserving UTC month grouping, unknown dates, refunds and the distinction between payment collections and platform revenue.

### Background jobs and error visibility

[`RunJobs`](../apps/api/internal/app/jobs.go#L104) wakes every five seconds and calls `runOneJob` once. A single worker therefore has a theoretical ceiling of about 12 quick jobs per minute; provider latency and hold-expiry work can lower it. Both returned errors are discarded.

Process a bounded batch per wake-up, with cancellation, leases, retries and idempotency preserved. Report sanitized errors and backlog/age metrics; never log message content or credentials. Validate concurrent leasing and retry behavior before increasing concurrency. This is source-derived capacity, not a production throughput measurement.

## Deployment and items to retain

[`deploy-existing.sh`](../scripts/deploy-existing.sh#L67) copies all previous hashed assets into each new release so already-open tabs keep working. Repeated releases accumulate historical bundles, and no release pruning appears in this script. Review a retention policy for the current release, rollback releases and an explicit grace period for old assets. Inspect server disk use first; produce a dry-run manifest before any authorized deletion. Nothing was deleted during this audit.

Do **not** classify these as dead code merely because they are less visible:

- Legacy disk/S3 file access and scanning: expressly retained for existing records.
- Historical encrypted Updates records: preserve untouched and separate from new messages.
- Tuition conversations: a separate active feature from the one-way Updates inbox.
- Migrations, staff provisioning, seed/test entrypoints and operational scripts: separate entrypoints from the running web app.
- Teaching-language values: authored academic data, despite the English-only interface.
- Screenshot evidence and documentation: repository size is not browser payload size.
- Dynamic role views, lazy route exports and print styles.

## Verification and next implementation batches

Completed in this audit:

- Repository source/reference inventory across frontend, API, scripts, infrastructure, tests and documentation.
- TypeScript reference/import graph and unused-local/parameter checks.
- Fresh `npm run build`, including TypeScript and production bundling.
- Official Go deadcode tool, pinned to `v0.51.0`, with `./...` and `-test ./...`; both completed without reported unreachable functions. This conservative result is not proof that all helpers are needed. See the [Go team's explanation of the tool](https://go.dev/blog/deadcode).
- Production-build module contribution/compressed-size analysis and four local desktop browser loading/CSS-coverage checks.

Ignored reproducibility artifacts: `.local/repository-audit/` contains `static.mjs`, `graph.mjs`, `build.mjs`, `bundles.mjs`, `browser.mjs`, their JSON outputs and build/deadcode logs. No dependency manifest or lockfile changed. Full integration/E2E suites, production MongoDB query plans, mobile coverage, production headers and real-user performance were not rerun/measured for this audit.

Recommended implementation order:

1. Correct mentor assignment filtering, with an isolated authorization regression.
2. Remove confirmed dead declarations/CSS/copy and repair capture scripts; build/lint and visually review affected desktop/mobile states.
3. Split routes, role components, dictionaries and CSS; compare identical loading measurements and exercise direct navigation/retry paths.
4. Replace implicit truncation and repeated report queries; test >100-record cases, exact financial totals and assignment boundaries against isolated MongoDB.
5. Improve worker batching/error reporting; verify idempotency, then review deployment/image-cache policies separately.

At the end of the audit, all findings were open and no application behavior, feature, production service or retained record had changed. The subsequent implementation is documented in the follow-up linked above.
