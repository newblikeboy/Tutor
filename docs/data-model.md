# Current data model

The seven-step tutor application adds a private `applications.profile` document containing About, Education, TeachingAreas, Availability (Home/Online), Approach, Fees and Declarations. `formVersion` and `formStep` support resumable drafts independently of staff/file updates. `submission` records the notice version, server receipt time and marketing choice; `eligibility` records an administrator's employment review. Requested modes and classes never replace approved `scope`. See [application-form.md](application-form.md) for the fields, validation and additive migration. Existing approved legacy profiles remain readable; legacy draft education/experience/approach are carried into the new form.

All instants are UTC BSON dates. User-visible class times explicitly show Asia/Kolkata. INR is integer paise. IDs are opaque strings; ownership, not unguessability, authorises access. Learner records are independently owned by the adult account and do not belong to a tutor application.

| Collection | Contents / indexes |
|---|---|
| users | Registered adult identity/email, role, sample marker, authVersion; unique `_id` |
| credentials | Normalized email as unique `_id`, unique userId, salted Argon2id passwordHash; never a public DTO |
| sessions | SHA-256 opaque token ID, user/version, password method, CSRF, explicit expiry; user lookup and expiry TTL |
| rate_limits | SHA-256 identity/IP + time-bucket ID, count; TTL |
| applications | Private application, reviewer/conflict declaration, optional UTC/timezone/Zoom interview, ongoing mentor and bounded approval scope; status/subject/expiry and reviewer/interview indexes; version shared by staff decisions and booking writers |
| consents | Adult owner, relationship, draft policy version, time, development-declaration verification label; owner index |
| learners | Adult owner, nickname/class/board/language, minor/adult-self and consent link; owner index |
| drafts | One requirement draft per adult account; learner ID, goal, locality, step |
| requirements | Owner and learner, goal/locality, subject, submitted status; owner/status index |
| trials | Parties, assigned mentor, scope, UTC interval, zero-paise fee and immutable trial terms, lesson evidence/review; owner/start, tutor/status/start, mentor/status indexes |
| guards | Authoritative resource/day interval locks and contended versions, including held expiry; interview applicant/reviewer days and private upload quota use distinct namespaces; unique `_id` |
| requests | Actor + operation/idempotency key, payload fingerprint, original result ID; unique `_id` |
| audit | Actor/action/target/time; staff decisions additionally retain actor name, reason, state transition, interview/scope/scores/evidence snapshots behind staff authorization; chronological time/id and target/time/id indexes; no credentials or learner evidence |
| outbox | Payment/refund/webhook/scan jobs and explicit operator follow-ups; status/attempts/availableAt, lease owner/expiry, bounded retry; status/time index |
| availability | Tutor-keyed IANA timezone, weekly windows, leave, buffer, local-day capacity, fee and pause/version |
| enrollments | Family/learner/current tutor/mentor, status/version, immutable current agreement snapshot, payment intent and expiring hold; party/cursor and status/hold indexes |
| agreements | Separate immutable agreement versions, scheduled starts, integer fees, development terms; unique enrollment/version |
| classes | UTC start/end, status/version, agreed changes, lesson evidence/review; enrollment/status/start and tutor/start indexes |
| learning_plans | Immutable versions with starting point/goals/topics/evidence/practice/review date; unique enrollment/version |
| handovers | Family consent, old/new tutor, mentor preparation, acceptance and next teaching steps; enrollment/status and new-tutor/status indexes |
| messages | Current-assignment conversation records, author identity/role/body/time; enrollment/cursor index |
| notifications | Owner, generic kind/target reference, read flag/time; owner/cursor index |
| payment_intents | Owner/enrollment/server-priced INR, provider order/payment references, capture/refund totals; owner/cursor plus partial unique nonempty provider IDs |
| refunds | Reserved amount, independent requester/reviewer, evidence, provider/status; intent/status index |
| ledger | Immutable balanced debit/credit pair, amount, intent and provider reference; unique capture/refund `_id`, intent/time index; not bank settlement |
| webhook_events | Unique hashed provider event ID, exact raw-body fingerprint, kind/time; raw payload is not retained |
| cases | Owner/kind, independently assigned operator, bounded initial evidence, status/version; owner/cursor and assignment/kind/cursor indexes |
| case_messages | Separate bounded replies and decisions; case/cursor index |
| preferences | One adult-keyed name-independent language preference/version; CAS updates |
| files | Target/owner, sanitized name/type/size, private opaque object key and checksum, quarantine/scan status; target/cursor and unique object-key indexes |
| migrations | Applied tuition-extension migration marker; richer versioned migration history remains open |

Staff operations use existing core collections only. `go run ./cmd/migrate -staff-only` applies optional interview validation and staff indexes without installing the wider extension or creating collections. Suspension/termination upserts one `tutor_followup:<id>` record in outbox, with version, reason and pending/resolved operator outcome. Existing-arrangement counts are read from current authorized records. The separate staff history API paginates by timestamp and ID; ordinary event DTOs do not expose private staff evidence.

`go run ./cmd/migrate` applies required-field validators and indexes idempotently, then records the tuition extension marker. Rich BSON type/enumeration validators and fuller per-release migration history remain open. New lists use 25-item cursor pages; existing dashboards and some histories still cap at 100. Application credentials use email, per the user's replacement of phone OTP. Files, messages and histories live in separate collections; object bytes never live in MongoDB documents or public frontend assets. The full extension migration was exercised on real local MongoDB because Atlas reached its collection limit; it remains uninstalled on the main Atlas app. The separate staff-only migration is installed there and verified without adding collections.

Sample seed uses `$setOnInsert`; running it again does not overwrite assessment/lesson work. Optional private `SEED_PASSWORD` adds missing credentials for fictional users at `<id>@example.test`; existing passwords are never reset by seeding. Production seeding is rejected. Signup creates the unique credential, adult user and session in one transaction. Legacy OTP sessions are rejected; old challenge records are left to their existing TTL. New integration/browser journeys create their own isolated actual agreements, plans, cases, messages and files. Payment edge cases use a test-only gateway boundary; no seed pretends that a real payment or settlement occurred. Disputes and payout fixtures remain unimplemented.
