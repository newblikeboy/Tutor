# CODEX MASTER BUILD PROMPT
## Trusted tutor platform for Purnea | Go + React + MongoDB Atlas

You are the product designer and senior full-stack engineer responsible for building this application in the current repository. Implement working software, not just a proposal, static mockup, or folder scaffold.

UI/UX is a first-class acceptance requirement. A functional application with generic, inconsistent, cramped, inaccessible, or unfinished screens is not complete. Equally, a beautiful interface backed by fake functionality is not complete.

## 1. BUSINESS CONTEXT AND PRODUCT PRINCIPLES

The founder is a reputed tutor in Purnea, Bihar. The founder reports that the families being served can pay for quality tuition but struggle to find good tutors. Repeatedly trying different tutors disrupts children's learning.

Build a curated, academically supervised tutor network, not an open directory or a lowest-price bidding marketplace.

The product promise is:
“Assessed tutors. A suitable match for your child. A clear learning plan. Continued academic support.”

Core journeys:
- Parent: requirement → academic discussion → suitable shortlist → trial → tuition agreement → classes → progress review → renewal or supported tutor change.
- Tutor: application → subject/teaching assessment → approval for a defined scope → suitable requests → teaching → ongoing academic review.
- Academic team: assess → match → supervise → resolve concerns → preserve learning continuity.

Non-negotiable business rules:
- Registration does not equal approval. Unapproved, suspended, or revoked tutors cannot receive new bookings or appear as available in public discovery.
- Approval applies to specific subjects, class ranges, and assessed teaching modes; it is not an unrestricted “best tutor” badge.
- Payment cannot purchase academic approval or merit-based recommendations.
- Parents choose; the platform assists with suitability. Do not claim guaranteed marks, guaranteed safety, or a perfect match.
- A child's learning record belongs with the family's account and survives a tutor change.
- Under-18 learners have guardian-controlled private profiles; adult learners can manage their own account. Do not build independent child messaging or public child profiles in version one.
- No invented testimonials, qualifications, founder biography, statistics, endorsements, government recognition, or service guarantees.
- Use APP_NAME="Tutor Platform" as an explicitly provisional, configurable wordmark. Do not invent a final business name or logo. Founder details, contact details, actual coverage, prices, and policies remain editable configuration/content.

## 2. REQUIRED STACK AND ARCHITECTURE

Use:
- Backend: Go, net/http with chi routing, REST JSON API, a modular monolith.
- Frontend: React, TypeScript strict mode, Vite, React Router.
- UI: Tailwind CSS, selectively used Radix/shadcn accessible primitives, custom styling, Lucide icons.
- Server state: TanStack Query. Forms: React Hook Form + Zod. Localization: react-i18next.
- Database: MongoDB Atlas using the official MongoDB Go driver v2.
- Testing: Go tests, Vitest, React Testing Library, Playwright, axe accessibility checks.

Verify current stable, compatible dependency versions from official documentation before installing; record and lock the versions actually used. Do not invent APIs or mix incompatible tutorial versions.

Go is the only application backend. Node.js is permitted for frontend development/build/test tooling, not as a second API backend. Do not substitute Next.js API routes, Express, Firebase, Supabase, PostgreSQL, SQLite, Prisma, or Mongoose.

Use a same-origin deployment with /api/v1 behind a reverse proxy and a Vite development proxy. Pre-render safe public marketing pages at build time where supported; keep private dashboards client-rendered. Document dynamic tutor-page SEO limitations rather than claiming a client-only page is server-rendered. Never pre-render private learner data.

MongoDB Atlas is the production database. Provide a Docker-based local MongoDB replica set for development and integration tests when Atlas credentials are unavailable. Use the same repositories, indexes, and transaction logic in both environments. Never silently fall back to an in-memory production database.

## 3. VISUAL DIRECTION: PREMIUM, WARM, ACADEMIC, TRUSTWORTHY

Design a distinctive educational service, not a generic SaaS template or a noisy coaching advertisement.

Starting design tokens, adjustable after contrast testing:
- Primary navy: #13213C.
- Teal accent: #087F8C.
- Warm page background: #F8F7F4.
- Surface: #FFFFFF.
- Main text: #152238.
- Secondary text: #546172.
- Subtle border: #E2E6EB.
- Muted amber for limited supportive accents, never low-contrast body text.

Use Manrope for Latin text and Noto Sans Devanagari for Hindi, or a comparably polished, properly licensed pairing if unavailable. Keep font loading efficient. Body copy should generally be 16–18px; dense administrative secondary information may be smaller while remaining readable.

Create a consistent token system for typography, color, spacing, radii, elevation, motion, and control states. Prefer restrained 12–18px card radii, subtle borders, deliberate whitespace, and an 8px-based spacing system with documented smaller steps. Marketing content should have a comfortable maximum width around 1200–1280px; operational tables may use wider space.

Do not use:
- Generic purple gradients, giant decorative blobs, excessive glass effects, or random color schemes.
- Repetitive bento cards for every section, giant empty hero areas, or stock template dashboards.
- Emoji as navigation icons, unrelated stock photography, fake trust counters, or fabricated avatars presented as real tutors.
- Tiny grey text, decorative charts without useful data, or animation that delays interaction.

Use licensed, appropriate assets with attribution recorded. When real tutor portraits are unavailable, use polished initials in clearly labeled sample profiles rather than pretending stock people are actual tutors. Missing founder photography must not block implementation or result in an invented portrait.

### Homepage composition

Build an editorial desktop hero with approximately a 55/45 split:
- Left: clear headline, short explanation, primary guided-matching CTA, secondary browse CTA.
- Right: a beautifully composed tutor/learning-plan preview that explains the service, marked illustrative when using sample data.
- Follow with the selection process, how academic support works, genuine tutor previews where available, learning-continuity explanation, founder/academic approach, FAQs, and a final CTA.

Avoid one endless wall of identical feature cards. Alternate composition, controlled background treatments, and concise text. The main CTA is “Find the right tutor for my child.” The alternative is “Browse approved tutors.”

### Screen-specific composition

- Search: desktop filter rail and readable tutor cards; mobile filter drawer, active-filter chips, clear result count, and preserved search state.
- Tutor details: substantive profile and evidence on the left; sticky request/trial summary on the right. On mobile, use an unobtrusive bottom action area that does not obscure content or the keyboard.
- Parent home: child switcher, next class, current learning focus, updates requiring action. Do not lead with generic sales analytics.
- Tutor home: today's schedule, pending requests, lesson-note tasks, and earnings status.
- Mentor/admin: work queues, filters, contextual detail panels, audit history, and clear decision actions. These screens require the same visual care as the homepage.

## 4. INTERACTION, RESPONSIVENESS, AND ACCESSIBILITY

Make the app excellent at 360px, 390px, 768px, 1024px, and 1440px widths. Test narrow-screen reflow, 200% zoom, long names, large Hindi labels, and text expansion.

Requirements:
- Semantic HTML; WCAG 2.2 AA as the accessibility target.
- Keyboard operation, visible focus, skip links, accessible names, correct labels, sensible reading order, error summaries, dialog focus trapping/restoration, and screen-reader announcements for important changes.
- Normal-text contrast at least 4.5:1, large-text contrast at least 3:1; also verify relevant non-text contrast.
- Aim for 44×44px primary touch targets as the product standard; do not mislabel this as the WCAG AA minimum.
- Accessible date/time selection, OTP input with paste/autofill, upload controls, tooltips, tables, and menus.
- No hover-only functionality. Respect prefers-reduced-motion. Use subtle 150–220ms transitions rather than continuous decorative motion.
- Do not disable zoom or use color alone to convey status.
- Every data-driven screen needs loading, empty, error, retry, permission-denied, and populated states where applicable.
- Preserve entered data after validation errors; explain why an action is unavailable. Show success only after the backend confirms it.
- Multi-step forms should disclose progress, save authenticated drafts, allow back navigation, and explain sensitive information requests.
- Avoid forced signup before browsing. Preserve a selected tutor and relevant non-sensitive intent through login.
- Do not store child data or credentials in localStorage. Preference-only persistence is acceptable.

Build a reusable component library and an internal component-showcase route covering buttons, inputs, OTP, selectors, dialogs, drawers, badges, tutor cards, learning timelines, alerts, tabs, pagination, date selectors, skeletons, and tables. Include all states and both languages.

## 5. PUBLIC WEBSITE AND DISCOVERY

Implement:
- Home, tutor search, tutor profile, guided matching, how it works, tutor selection standards, academic approach/about, tutor application, contact/support, FAQs, and policy pages.
- Public adult login options: Parent / Learner and Tutor. Separate staff login.
- Search by class, subject, board, language, online/home mode, locality, availability, and budget.
- Shortlist and compare up to three tutors.
- Clearly explain approval scope, relevant experience, assessment dates, teaching approach, available service areas, and package/session pricing.
- No public identity documents, private addresses, child information, or unnecessary contact details.
- Match explanation grounded in actual fields, such as subject approval, preferred language, timing, and service area. Do not fabricate a scientific matching percentage.
- A no-match state that offers a real requirement submission/waitlist, not unsuitable profiles.

Use configurable locality aliases so Purnea and Purnia resolve consistently. Scope locality names such as Madhubani to the correct city/district context. Allow landmark entry without mandatory GPS. Prefer locality-based matching initially; show distance only when valid consented coordinates exist. Never invent distances, travel times, or active service coverage.

## 6. PARENT / LEARNER AREA

Implement these as working, connected workflows:
- Adult account and contact preferences; family account with multiple private learner profiles.
- Adult learner self-profile; guardian-controlled profiles for minors.
- Minimal learner details: class, board, subjects, language, availability, goals, and relevant difficulties. School name and photo are not mandatory.
- Guardian relationship/consent workflow before collecting a minor's learning information; phone OTP alone is not guardian verification.
- Optional relevant work/report uploads with access controls.
- Guided requirement, callback request, shortlist, recommendation explanations, and trial request.
- Trial scheduling, confirmation, cancellation/rescheduling, and parent/tutor feedback.
- Versioned tuition agreement: subject, mode, session count, duration, dates/validity, recurring schedule, fee breakdown, cancellation rules, makeup rules, and included support.
- Class calendar, next class, completed/missed/makeup sessions, and remaining package balance.
- Learning plan, lesson summaries, homework, work samples, progress reviews, and academic-support requests.
- Parent-visible conversations with the assigned tutor and authorised support team.
- Invoices, payment status, renewal approval, refund requests, notification preferences, and privacy requests.
- Exact home address collected only when needed and disclosed only for an authorised home-tuition arrangement.

## 7. TUTOR AREA

Implement:
- Application with education, experience, intended subjects/classes, languages, mode, service areas, availability, eligibility declarations, and relevant documents.
- Introduction/sample explanation upload with no requirement to film real children.
- Assessment scheduling, stage tracking, evaluator feedback, improvement tasks, and reassessment request.
- Approved scope management; material profile/scope changes require review before becoming public.
- Precise approval badges generated from real records, never self-awarded.
- Recurring availability, exceptions/leave, home-tuition travel buffers, capacity limits, and pauses in accepting students.
- Relevant matched requests with minimum necessary learner information.
- Accept/decline with a reason, expected payout disclosure, trial management, and assigned learner access.
- Lesson plans, attendance, notes, homework, work uploads, rescheduling, and mentor feedback.
- Earnings ledger: expected, pending, payable, paid, refunded/adjusted, with a clear difference between an internal ledger entry and actual settlement.
- Service and safety reporting, support tickets, and profile/review response tools.

Tutors cannot browse all children, export parent leads, self-approve, view unrelated learners, or access a learner indefinitely after an assignment ends.

## 8. ACADEMIC MENTOR AND ADMIN AREAS

Implement least-privilege roles for academic assessors/mentors, support, finance, and administrators; do not make every employee a superadmin.

Academic workflows:
- Assign appropriately scoped assessors and record conflicts; nobody assesses or approves themselves.
- Structured scorecards for subject knowledge, explanation, identifying misconceptions, patience, planning, and reliability.
- Assessment decisions, reasons, evidence references, approved scope, review dates, and reassessment.
- Initial learner assessment and versioned learning plans.
- Mentor assignment, progress review, improvement actions, and overdue-review queues.
- Human review of concerns; no automatic tutor-quality conclusions from one score or complaint.
- Tutor handover with the family's permission and explicit next teaching steps.

Administrative workflows:
- Tutor applications and status changes; parent requirements and matching.
- Available teaching capacity by class/subject/locality/time, not just tutor counts.
- Booking exceptions, attendance disputes, schedule changes, waitlists, payments/refunds/payout reconciliation.
- Separate academic, service, payment, and safeguarding case queues with ownership, priority, escalation, and restricted evidence.
- CMS for real founder details, public copy, FAQs, service areas, policies, and genuine testimonials.
- Staff invites/permissions, audit logs, privacy requests, and operational reports.

Metrics should be calculated from real data: enquiry-to-shortlist time, trial conversion, delivered sessions, renewals, unresolved cases, tutor capacity, and actual revenue/settlement status. Do not invent charts or infer learning impact from attendance alone.

## 9. LEARNING CONTINUITY, SAFETY, AND TRUST

Learning plans record starting point, goals, topic sequence, practice, and review dates. Topic statuses may include Introduced, Practising, Independent, and Needs Review, supported by evidence rather than fabricated mastery percentages.

A tutor change must preserve plan versions, completed work, unresolved gaps, and next steps. Revoke the old tutor's ongoing access while retaining only justified records. Do not promise immediate backup when none exists.

Support guardian-visible communications, responsible-adult/common-study-space confirmation for home lessons, easy reporting, and appropriately limited disclosures. An attendance OTP is not proof of teaching quality or safety.

Safeguarding cases require a separate restricted workflow, immediate protective-action controls, and documented external-escalation procedures reviewed by the operator. Do not claim the app contacts authorities unless an authorised action genuinely does so. Do not present the platform as a 24/7 emergency service.

Reviews require a real tuition relationship. Keep review count/date/context accurate. Provide moderation, reporting, and tutor response; do not suppress genuine negative reviews merely for being negative. Keep reviews separate from academic approval.

Provide versioned consent/privacy records and operator-review checklists for child data, teacher eligibility, safeguarding, consumer/refund terms, tax/invoicing, and retention. Generated legal text must remain clearly marked as a draft requiring qualified review; do not claim legal compliance is certified by the software.

## 10. DOMAIN STATES AND BUSINESS INVARIANTS

Model state transitions explicitly on the server. Document allowed actors, prerequisites, side effects, and audit events.

Tutor application example:
draft → submitted → under_review → assessment_scheduled → assessed → approved / improvement_required / declined.
Published tutor status and individual approval scopes must separately support pause, expiry, suspension, and revocation.

Trial/booking:
requested → accepted → payment_pending where applicable → confirmed → completed, with explicit declined, expired, cancelled, and disputed paths.

Enrollment:
pending_agreement → awaiting_payment → active → paused / completed / cancelled, using configured rules rather than implicit UI assumptions.

Track payments and refunds independently from booking status. A frontend redirect does not establish payment success. A refund request is not a completed refund.

Enforce:
- Approved and available teaching scope at search, acceptance, and confirmation—not only when creating a profile.
- Server-side price calculation and agreement snapshots. Fee changes must not rewrite existing agreements.
- Tutor and learner scheduling conflicts, capacity, travel buffers, cancellation rules, and package-session balances.
- Idempotent repeated requests and exactly-once business effects despite retried jobs/webhooks.
- Immediate removal of revoked tutors from new-booking eligibility and an operations task for existing arrangements; do not silently delete paid sessions.
- Parent cannot access another household by guessing IDs. Staff access is scoped to their task and assignment.

## 11. BACKEND AND DATA DESIGN

Suggested repository layout:
- apps/web/src: app, components, features, routes, lib, locales, styles, tests.
- apps/api/cmd: api, worker, seed, migrate, bootstrap-admin.
- apps/api/internal: config, auth, policy, users, tutors, learners, matching, scheduling, bookings, learning, billing, messaging, support, media, audit, storage.
- contracts/openapi.yaml.
- docs: product-spec, design-system, architecture, permissions, data-model, state-machines, acceptance-matrix, decisions, security, release-checklist, progress.
- infra and scripts for development, testing, and deployment.

Keep handlers, application services, validation, policies, and repositories separate without creating unnecessary abstraction layers. Use request-scoped timeouts, structured redacted logs, graceful shutdown, health/readiness checks, request IDs, and consistent errors.

Design bounded MongoDB documents with separate collections for unbounded history/messages. Suggested entities include users, auth sessions, OTP challenges, households, learners, consents, tutor applications/profiles, scope approvals, assessments, mentor assignments, requirements, availability, schedule guards/reservations, trials, enrollments, class sessions, learning plans/reviews/handovers, files, conversations/messages, invoices, payments, refunds, ledger entries, webhook receipts, notifications/outbox, support cases, audit events, and site content.

Use schema validation and explicit migrations/index creation. Include appropriate unique, compound, partial, and TTL indexes. Index normalized phone identity, public tutor slug, scoped approval/search fields, ownership/assignment lookups, upcoming sessions, idempotency keys, provider event IDs, and worker claim fields. Add geospatial indexing only when that feature is implemented.

Use UTC for stored instants plus IANA time zones for recurring schedules; default the service to Asia/Kolkata. Show explicit local date/time. Store INR amounts as integer paise, never floating-point currency arithmetic.

## 12. CONCURRENCY AND RELIABILITY: DO NOT HAND-WAVE

A “check availability, then insert” implementation is not sufficient.

Use a documented concurrency-safe approach, such as transactionally updated per-tutor/day and per-learner/day schedule-guard documents with version checks and interval reservations. Every create, hold, reschedule, cancellation, and recurring-booking path must obey the same protection, including travel buffers and day-boundary cases. Another proven design is acceptable if documented and tested.

Use replica-set-backed transactions where multiple documents must change atomically. Transactions alone do not prevent overlapping intervals unless writers contend on authoritative scheduling records or another valid constraint. A unique start-time index is not sufficient.

Check expiresAt explicitly for OTPs, sessions, and booking holds; cleanup timing must not determine validity. Handle stale holds, safe retries, duplicate requests, failed recurring reservations, and payment arriving after a hold expires.

Use a persisted outbox/worker with leases, idempotent processing, retry/backoff, and failed-job visibility for notifications and external effects. Do not send messages or call payment providers inside a transaction callback that can retry. Keep operations within a MongoDB Go transaction sequential.

## 13. AUTHENTICATION, AUTHORISATION, AND FILE SECURITY

Implement passwordless adult phone login through a provider abstraction, with short-lived one-time challenges, resend limits, per-account/IP abuse controls, attempt limits, and non-enumerating responses. Store a secure keyed hash of OTPs, not plaintext. OTP establishes phone control, not guardian status.

Use cryptographically random opaque session tokens in HttpOnly, Secure production cookies with appropriate SameSite settings; store only hashed tokens server-side. Enforce expiry, rotation, logout revocation, and privilege-change revocation. Protect state-changing requests against CSRF and validate Origin where appropriate.

Staff accounts are invite/provisioning-only and require MFA in production. Provide a secure bootstrap command without default production credentials. No public role selector can grant staff permissions.

Enforce deny-by-default role plus ownership/assignment checks on every API and private file request. Hiding a button is not access control. Use explicit public DTOs rather than returning database documents with omitted fields by convention.

Keep Atlas credentials, OTP secrets, encryption keys, and payment secrets in backend environment configuration, never VITE_* variables or source code. Use TLS and restricted database credentials/network access. Do not disable certificate verification or instruct unrestricted production network access as the default.

Use private object storage for media, with MongoDB metadata; this is not a replacement application database. Provide a local private-disk development adapter. Validate type/signature/size, quarantine unsafe uploads, sanitize filenames, prevent path traversal, and gate downloads. Avoid public buckets, public identity documents, long-lived unrestricted file URLs, and unsupported claims that files were malware-scanned.

Redact secrets and sensitive learner/address information from logs, traces, analytics, screenshots, and error reports. Clear private query caches on logout/account changes. Never cache private pages in a public service worker or CDN.

## 14. API CONTRACT AND FRONTEND INTEGRATION

Maintain an OpenAPI contract for /api/v1 covering auth, current user, public tutors, requirements, families/learners, applications/assessments, availability, trials/enrollments/sessions, learning, messages, support, uploads, billing, and administration.

Generate or validate frontend API types against the contract. Use DTO validation, bounded pagination, permitted sort/filter fields, and consistent errors with code, message, fieldErrors, and requestId. Return meaningful authentication, permission, conflict, validation, and rate-limit responses without leaking internals.

The React app must call the Go API, which persists to MongoDB. Do not leave production routes connected to static arrays, localStorage CRUD, or mock success handlers. Handle request cancellation and stale responses in search/forms. Do not optimistically confirm money movement, approval, or bookings.

## 15. PROVIDERS, PAYMENTS, AND DEMO MODE

Provide explicit interfaces for OTP delivery, optional email/WhatsApp notifications, payment collection/refund, approved tutor settlement, private storage, and optional meeting links. Do not add a custom video platform or AI matching service.

When credentials are missing:
- Keep core development runnable using clearly labeled development adapters.
- Show a visible development/sandbox banner and predictable test flows.
- Do not claim an SMS was delivered, a tutor was paid, a real payment succeeded, or a background check occurred.
- Production must reject insecure demo auth/seeding and prevent activation of unconfigured live integrations; unaffected discovery can still operate.

Implement payment-domain logic and test adapters now. A real provider adapter must follow current official documentation and the merchant's approved marketplace arrangement. Do not assume onboarding eligibility or build an informal escrow/wallet.

Calculate order totals server-side. Verify signatures, amounts, currency, order ownership, and provider IDs; deduplicate webhook events and handle retries/out-of-order events. Keep internal earnings entitlement distinct from actual bank settlement. Provide clear pending, failed, partially refunded, and reconciled states. Trial credits, platform share, taxes, travel fees, and policies must be configurable, not assumed final business decisions.

No real SMS/WhatsApp delivery, real charges, public production deployment, destructive data changes, or paid external provisioning without explicit operator authorisation. Never print secrets while diagnosing setup.

## 16. LOCALISATION, CONTENT, AND PERFORMANCE

Ship thoughtful English and Hindi interfaces for public and core account flows, with language preference persistence and correct document language. Use concise natural Hindi, proper Devanagari rendering, Indian currency formatting, and accessible date/time wording. Avoid hardcoded user-facing strings scattered through components.

Keep public copy focused on quality and continuity, not the founder's statement about parents' wealth. Publish only actual operational coverage and configured offerings. Draft policies and missing business details must be visibly unresolved before launch.

Use route splitting, efficient query loading, correctly sized AVIF/WebP where appropriate, font optimization, and stable reserved media space. Do not lazy-load the main above-the-fold asset. Avoid heavy charts/calendar bundles on public routes.

Performance targets: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 at the 75th percentile once field data exists. Before launch, run reproducible mobile lab checks and aim for Lighthouse performance ≥90 on core public routes. Lab scores do not prove field performance or accessibility compliance; report actual measurements and limitations.

## 17. TESTING AND VISUAL ACCEPTANCE

Write automated tests for:
1. Tutor application, assessment, scope approval, publication, and suspension.
2. Parent onboarding, guardian gate, private learner creation, requirement, shortlist, trial, agreement, booking, lesson note, and progress review.
3. Adult learner self-management and multiple children in one household.
4. Parent A denied access to Parent B's learners/files/messages; unassigned tutor denied; tutor cannot self-approve; finance/support cannot read unrelated academic or safeguarding data.
5. Concurrent overlapping bookings produce at most one valid reservation; test through separate requests/API instances against a replica set, not only an in-process mutex.
6. Recurring conflicts, travel buffers, hold expiry, cancellation, rescheduling, and package balance consistency.
7. Expired/reused OTPs, rate limiting, session revocation, CSRF, and staff MFA gates.
8. Duplicate/out-of-order webhooks, amount tampering, late payments, refund retries, and no double ledger credit.
9. Tutor-change handover and revoked previous-tutor access.
10. Hindi layouts, keyboard flows, accessibility checks, meaningful failures, and persisted state after refresh/restart.

Create a requirement-to-screen/API/test acceptance matrix. Do not declare a requirement complete because a route renders.

### Mandatory visual QA loop

- Build design tokens and component patterns first.
- Implement homepage, search, tutor detail, parent dashboard, and tutor/admin exemplar screens using deterministic fictional fixtures.
- Run the app, capture Playwright screenshots, and inspect the rendered pages—not just the source code.
- Fix typography, hierarchy, spacing, alignment, contrast, clipping, modal behavior, sticky elements, and mobile usability before replicating patterns.
- Repeat the browser review after connecting live development APIs.
- Save screenshots and visual regression baselines for core routes, important states, and English/Hindi at representative desktop/mobile sizes.
- Baselines must be visually reviewed; blindly accepting new screenshots is not proof of quality.
- Use a consistent test environment for screenshot comparisons. Freeze clocks/sample data, mask only genuinely sensitive/dynamic fields, and do not hide broken content to make tests pass.
- Run keyboard/manual checks as well as axe. Automated checks do not certify WCAG compliance.

No broken links, dead-end primary actions, fake success toasts, unexplained blank pages, browser console errors, uncontrolled horizontal page scrolling, unreadable mobile tables, or unfinished placeholder copy in launch screens.

If browser execution or another verification tool is unavailable, report the limitation and leave the corresponding gate unverified. Never invent screenshots, passing tests, accessibility certification, or performance scores.

## 18. DEVELOPMENT FIXTURES AND OPERATIONS

Provide deterministic, idempotent development seeds containing fictional tutor applicants at different stages, approved profiles, two unrelated households, an adult learner, mentor/support/finance/admin accounts, requirements, trial states, learning plans, disputes, and payment edge cases.

Mark seeded material as sample data. Prevent sample identities, claims, and credentials from being published as real production records. Production seeding of demo accounts must be blocked. Do not use real contact details or trigger delivery to generated phone numbers.

Provide .env.example, health checks, safe Atlas setup guidance, local replica-set initialization, migration/index scripts, production build/container configuration, backup/restore guidance, and CI checks. Document commands for Windows PowerShell and Linux/macOS where they differ.

Keep launch integrations, policy publication, guardian-verification procedure, staff MFA, file security, operator safeguarding workflow, and production data review in a release-blocker checklist.

## 19. EXECUTION ORDER AND CONTINUITY

First inspect the repository and existing AGENTS.md instructions. Preserve unrelated work and existing compatible conventions. Do not overwrite user changes or create a second app blindly.

Save this brief as docs/product-spec.md. Create a concise root AGENTS.md with the stack constraints, security/UX invariants, run/test commands, and links to the detailed specifications. Do not replace existing instructions indiscriminately. Create docs/progress.md and an acceptance matrix so work can resume without rebuilding completed modules.

Execute in milestones:
A. Repository assessment, architectural decisions, permission/state models, design tokens, and high-fidelity core-screen patterns.
B. A real vertical slice: tutor applies → assessor approves scope → parent submits requirement → tutor accepts trial → sandbox payment where configured → class record → parent sees reviewed learning progress, persisted through Go and MongoDB.
C. Remaining parent/tutor/mentor/admin workflows, scheduling edge cases, communications, handover, support, and billing operations.
D. Security hardening, localisation, accessibility, performance, browser refinement, deployment documentation, and release-blocker review.

Implement and validate each milestone rather than attempting all screens as shallow stubs. Do not stop after writing a plan or only a landing page. Do not claim the whole platform is complete after the first vertical slice. If the session ends, leave a runnable, tested checkpoint and record precisely what remains; do not degrade quality or fabricate completion to satisfy scope.

Use reasonable documented assumptions for noncritical missing details. Do not interrupt implementation for logo, font, or provisional-name decisions. Missing credentials or legally important operating choices should become explicit setup/release blockers, not invented facts.

Do not broaden scope into native apps, microservices, AI tutor ranking, public student marketplaces, live tracking, gamification, or new business models.

## 20. FINAL HANDOVER

Deliver working source, committed dependency lockfiles, API contract, migrations/indexes, development fixtures, component system, tests, configuration examples, operational documentation, and visual QA artifacts.

Run available checks: Go formatting/vet/tests, relevant race/concurrency tests, frontend lint/typecheck/unit tests/build, integration/E2E tests, accessibility checks, and browser visual review.

Report:
- Implemented journeys and where to find them.
- Exact run/test/seed commands that actually work.
- Commands executed, results, and any unexecuted checks.
- Screenshots and design issues resolved or still open.
- Provider/setup requirements and security/legal/operational release blockers.
- Remaining features by milestone, with no unsupported “production-ready” claim.

Begin by inspecting the repository, establishing the product/design foundation, and implementing the first complete workflow. Build a platform that feels exceptional to parents, is efficient for tutors and academic staff, and backs every visible promise with real behaviour.

## PRIMARY TECHNICAL REFERENCES

Consult current official documentation for exact APIs and compatibility. These references do not replace the product requirements above.
- Codex repository instructions: https://developers.openai.com/codex/guides/agents-md/
- React with build tooling: https://react.dev/learn/build-a-react-app-from-scratch
- MongoDB Go driver: https://www.mongodb.com/docs/drivers/go/current/
- MongoDB Go transactions: https://www.mongodb.com/docs/drivers/go/current/crud/transactions/
- WCAG 2.2 reference: https://www.w3.org/WAI/WCAG22/quickref/
- Playwright visual comparisons: https://playwright.dev/docs/test-snapshots
- OWASP authorisation: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- Web Vitals: https://web.dev/articles/vitals
