# Updates inbox

The operator removed end-to-end encryption on 2026-09-26. Updates now opens immediately after normal sign-in. There is no inbox activation, passphrase, device linking, key vault, signature exchange or encryption badge. A parent or tutor can receive a message before ever visiting Updates.

| Actor | Can send | Can read |
|---|---|---|
| Administrator | To parents and tutors, including applicants | Own sent updates and their read status |
| Approved, unexpired tutor | To parents in current active, paused, pending-agreement or awaiting-payment assignments | Administrative updates and own sent family updates while access remains current |
| Parent | No | Updates addressed to their account |
| Applicant, suspended or expired tutor | No family updates | Administrative updates addressed to their account |
| Mentor, support, finance | No inbox sending | Existing role-scoped Activity alerts |

Each update has one recipient. There are no recipient replies, broadcasts, attachments or external email/SMS delivery. Existing tuition conversations and Activity alerts remain separate.

## Sending and reading

Subjects contain 1–120 characters and messages 1–3,000 characters after trimming. The API validates all fields and authorizes every send. Tutor approval and enrollment checks run in the sending transaction and contend with suspension/reassignment changes. A former tutor loses list/detail access to family updates; the parent keeps their own messages. Paginated directories expose recipient names/roles, not contact details. Administrative production directories exclude sample accounts.

Sending requires an authenticated session, matching Origin/CSRF, a persisted rate limit and an idempotency key. A unique sender/nonce index and transactional idempotency receipts prevent duplicate sends after interrupted responses. Retry keeps the same draft and request identifiers until the user edits it. Content is rendered as text.

Listing updates or fetching their detail does not mark them read. The recipient's client acknowledges after rendering the opened message in a visible browser tab. The server accepts acknowledgements only from that recipient and preserves the first server timestamp. A sender cannot mark their own message read, choose the timestamp or acknowledge for another account. Read status means the recipient's client opened the update, not proof of human comprehension. Failed detail fetches leave it unread; a failed acknowledgement has an explicit retry action.

## Data handling

Messages are **not end-to-end encrypted**. The Go service stores subject/body and participant metadata in MongoDB and can read them. Production HTTPS, Secure/HttpOnly sessions, CSRF protection, role/assignment boundaries and no-store HTTP responses remain in place. Audit records contain actor/action/message ID, not message content. Application error logs do not record request bodies. Frontend query data lives in memory and is cleared on sign-out; drafts are not saved to localStorage or a shared mutation cache.

The former key-registration, recipient-key and device-link endpoints are removed. Client cryptography modules, passphrase controls and activation restrictions are removed from the application and contract.

## Migration and existing records

`tutor-migrate --inbox-only` creates the ordinary `inbox_messages` collection, required-field validator, sender/recipient pagination indexes and unique sender/nonce index. It records migration `007-simple-inbox`; the normal migration also runs it. Re-running it is safe.

Previous `inbox_keys`, `inbox_updates` and any experimental device-link records are **retained untouched**. The new inbox does not list ciphertext as an empty/readable message or include it in unread counts. Old messages cannot be automatically converted because the server does not have their decryption secret. No deletion or misleading conversion is performed. Recovery would require a separate operator-approved process using the original keys; this release does not provide it. Historical protocol documentation remains in [encrypted-inbox.md](encrypted-inbox.md).

The existing droplet deployment script builds the release and runs the additive migration via systemd under the `tutor` service account before switching `/srv/tutor/current`. It preserves the private environment, certificates, prior release and rollback path. Rollback retains both legacy and ordinary records; an older encrypted release cannot display messages from the new collection. Live deployment is performed by the operator.

See [progress](progress.md), [acceptance](acceptance-matrix.md) and [visual checks](visual-qa/updates/README.md) for executed validation.
