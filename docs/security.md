# Security checkpoint

Implemented: opaque random session tokens (hashes at rest), HttpOnly/SameSite cookies, explicit session/OTP expiry, HMAC OTP storage, one-time consume transactions, attempt/resend and persistent account/IP limits, privilege-version revocation, login rotation/logout revocation, exact Origin and session-bound CSRF checks, 16KB bounded JSON decoding, unknown-field rejection, scoped/owned queries, public DTOs, no-store responses and redacted error types/request IDs. Seeds and live development auth are blocked in production. Production private routes remain unavailable until live auth is reviewed.

Auth codes are intentionally shown only for fictional local development identities; no phone ownership, guardian identity, SMS delivery, real assessment or payment is asserted by those fixtures. All captured screenshots use fictional records. Do not enter real child information in the preview.

The root `.env` is ignored and was not copied into source, the contract, the browser build or docs. The user-created `,env` filename was corrected to `.env`. Never print the URI. Error logs now record only Go error types and request IDs, not MongoDB connection error strings. Review logs before sharing them.

Known limitations: production OTP/staff MFA and invite flows, secure bootstrap command, provider interfaces/adapters, file quarantine/access, object storage, safeguarding permissions/escalation, audit retention/privacy erasure, outbox worker, production network/rate-limit proxy policy and external security review remain launch blockers. Current JSON collection validation enforces required fields; richer type/range schemas are pending.

Test fixtures live in newly created `tutor_test_*` and `tutor_e2e_*` databases. Tests do not delete existing data. The operator may explicitly approve removing only those generated databases after review; never infer a cleanup target from arbitrary URI text.
