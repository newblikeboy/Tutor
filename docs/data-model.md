# Current data model

All instants are UTC BSON dates. User-visible class times explicitly show Asia/Kolkata. INR is integer paise. IDs are opaque strings; ownership, not unguessability, authorises access. Learner records are independently owned by the adult account and do not belong to a tutor application.

| Collection | Contents / indexes |
|---|---|
| users | Registered adult identity/email, role, sample marker, authVersion; unique `_id` |
| credentials | Normalized email as unique `_id`, unique userId, salted Argon2id passwordHash; never a public DTO |
| sessions | SHA-256 opaque token ID, user/version, password method, CSRF, explicit expiry; user lookup and expiry TTL |
| rate_limits | SHA-256 identity/IP + time-bucket ID, count; TTL |
| applications | Private application and one bounded approval scope; status/subject/expiry index; version used by approval and booking writers |
| consents | Adult owner, relationship, draft policy version, time, development-declaration verification label; owner index |
| learners | Adult owner, nickname/class/board/language, minor/adult-self and consent link; owner index |
| drafts | One requirement draft per adult account; learner ID, goal, locality, step |
| requirements | Owner and learner, goal/locality, subject, submitted status; owner/status index |
| trials | Parties, assigned mentor, scope, UTC interval, zero-paise fee and immutable trial terms, lesson evidence/review; owner/start, tutor/status/start, mentor/status indexes |
| guards | Resource/day identity, contended version, at most 48 intervals per day; unique `_id` |
| requests | Actor + request idempotency key, payload fingerprint, original trial ID; unique `_id` |
| audit | Actor/action/target/time without sensitive evidence; target/time index |
| outbox | Suspension follow-up task, status/attempts/availableAt; status/time index. Delivery worker not yet implemented. |

`go run ./cmd/migrate` applies collection required-field validators and indexes idempotently. Rich BSON type/enumeration validation, migration version ledger, pagination cursors (current queries cap at 100), normalized live phone indexes and unimplemented collections remain open. This checkpoint does not claim those schemas exist yet. Do not store unbounded messages, histories or uploads inside these documents.

Sample seed uses `$setOnInsert`; running it again does not overwrite assessment/lesson work. Optional private `SEED_PASSWORD` adds missing credentials for fictional users at `<id>@example.test`; existing passwords are never reset by seeding. Production seeding is rejected. Signup creates the unique credential, adult user and session in one transaction. Legacy OTP sessions are rejected; old challenge records are left to their existing TTL. Unimplemented fixture cases (payments, disputes, versioned plans) are not manufactured.
