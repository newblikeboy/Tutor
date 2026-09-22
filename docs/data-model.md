# Current data model

All instants are UTC BSON dates. User-visible class times explicitly show Asia/Kolkata. INR is integer paise. IDs are opaque strings; ownership, not unguessability, authorises access. Learner records are independently owned by the adult account and do not belong to a tutor application.

| Collection | Contents / indexes |
|---|---|
| users | Fictional development identity, role, authVersion; unique `_id` |
| sessions | SHA-256 opaque token ID, user/version, CSRF, explicit expiry; user lookup and expiry TTL |
| challenges | Random ID, identity, HMAC code, attempts, used flag, explicit expiry; TTL |
| rate_limits | Keyed identity/IP digest + time bucket, count; TTL |
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

Sample seed uses `$setOnInsert`; running it again does not overwrite assessment/lesson work. Production seeding is rejected. Unimplemented fixture cases (payments, disputes, versioned plans) are not manufactured.
