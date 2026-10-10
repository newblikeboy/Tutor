# GoCoaching utility email

The operator requested SMTP delivery from the Google Workspace login `support@gocoaching.in`, email verification, password recovery, parent/tutor email-code login and reminders 24 hours and 1 hour before each confirmed class. This overrides the older blanket no-OTP instruction. Password login remains available; provisioned staff sign in with passwords only.

## Account flow

- Public signup requires email verification: enter adult parent/tutor details, select Send email code, then enter the six-digit code and select Verify email and create account. Sending a code creates only an expiring challenge and encrypted outbox job; no user, credential or session exists yet. The Go signup endpoint checks the same normalized email, signup purpose, current challenge, expiry and attempt limits, then consumes the code and creates the verified account, password credential and session in one MongoDB transaction. Wrong/expired/reused/replaced codes cannot complete signup. Details can be edited before completion; they remain only in browser memory, never localStorage. Signup is unavailable when SMTP is disabled; existing password login remains available.
- Account → Profile → Email and reminders → Verify email address sends a six-digit verification code to the signed-in account's existing email. Confirmation requires the account's session and CSRF token. Email cannot be changed through this flow.
- Parent/tutor sign-in → Use email code requests a code for an eligible registered account. Confirmation creates the same opaque, HttpOnly session with a fresh CSRF token and preserves the requested destination. Staff cannot sign in with a code.
- Forgot password sends a recovery code. Enter the code and a new 8–128-character password. Success revokes every old session, requires a fresh sign-in and queues a password-change security email. Signed-in password changes also send this notice.
- Codes expire after ten minutes, are single-use and stop accepting guesses after five attempts. Resending after the 60-second cooldown invalidates the previous code. Per-IP, per-address and hourly limits protect requests; unknown/inactive accounts receive the same generic response without delivery. Password changes invalidate outstanding challenges through the credential fingerprint.

Successful verification, code login or recovery records email ownership. It does not verify a guardian, approve a tutor, activate a booking or bypass existing release gates. Old legacy OTP session methods remain invalid; production and development sessions remain separate.

## Booking messages

Trial request, tutor acceptance, decline/cancellation and tutor feedback create transactionally persisted messages for the parent and tutor. Feedback links directly to the private account without mentor approval. Regular-booking confirmation is queued only when provider-verified payment activates the booking; an unpaid checkout sends no confirmation. Pausing/resuming/cancelling an arrangement and proposing/accepting/cancelling a class time also create updates.

Messages include recorded learner/tutor names, approved booked subjects, teaching mode, IST date/time, duration and private account links. Package confirmations include saved class count, booking reference and the parent's immutable booking total. No private address, academic note, raw Zoom join link or host credential is sent by email. The recipient opens their authorised account for these details.

## Reminders and dispatch

Email remains in the persistent MongoDB outbox. Delivery runs in two dedicated Go workers, separate from payment/Zoom/file jobs and hold/reminder scheduling. One worker handles sign-in, verification and password-recovery codes exclusively; the code request wakes it only after its transaction commits. A one-second poll also discovers jobs from other API instances and recovers work after restart. The other worker gives booking/security updates precedence over reminders, with a reminder turn after four updates when both are due. Both lanes process oldest due work first; future jobs and retry backoff remain respected. Existing jobs are classified by their event without rewriting their payloads.

Each worker processes bounded batches of 25 with a fresh twelve-second context per job. There are at most two simultaneous SMTP submissions per API instance; an update already being sent may finish concurrently with an OTP, but cannot take the code worker's capacity. Atomic database leases still coordinate multiple API instances. The additive email migration installs due-delivery and expired-lease indexes. Reserved capacity improves application dispatch latency; Google acceptance and inbox arrival remain outside an application timing guarantee.

The existing durable Go worker scans confirmed trials and scheduled classes within the next 24 hours. Regular classes must belong to an active arrangement with the current tutor. It schedules separate 24-hour and 1-hour jobs for each participant, keyed by lesson, start time, tutor, lead and recipient. Existing bookings are included after enabling SMTP. A lesson booked too late for a reminder does not receive that already-missed reminder. A five-minute scheduler grace and fifteen-minute dispatch grace permit brief worker delays; it never sends after the class begins.

Before submission the worker rechecks ownership/current assignment, status, dates, scope, recipient access and reminder preferences. Cancelled/completed, paused, reassigned and rescheduled lessons invalidate stale reminders. Participants can switch reminders off in Account; booking/security messages are unaffected. Staff can see safe delivery metadata in Account → Emails (admins only), without message bodies, codes or delivery secrets.

Jobs use leases, stable IDs and bounded exponential retry. Explicit temporary SMTP rejection retries; permanent rejection fails. SMTP acceptance is recorded separately from final inbox arrival. An acknowledgement lost after submission becomes **uncertain** and stops automatic retries. Admins can review failed/uncertain booking messages and record a reason; uncertain retry additionally requires acknowledging duplicate risk. Authentication emails require a fresh code rather than manual retry. SMTP cannot promise exactly-once delivery; the recipient's provider controls spam filtering and inbox arrival.

Codes are stored as keyed hashes in TTL-backed `email_challenges`; pending code delivery uses AES-GCM with a persistent private key and challenge-specific authenticated data. No plaintext code is returned to the browser, stored in MongoDB, logged or put in localStorage. The encrypted delivery value is removed after acceptance. This protection is specific to authentication secrets and does not reintroduce Updates inbox encryption.

## Google Workspace configuration

Google documents `smtp.gmail.com` with authenticated TLS; use port **587 / STARTTLS**, login and sender **support@gocoaching.in**, and a Google app password. Google app passwords require 2-Step Verification and may be unavailable under Workspace administrator/security policy. An OAuth application ID is not needed for this app-password SMTP setup. Sources: [Google Workspace SMTP guidance](https://support.google.com/a/answer/176600?hl=en), [Google app passwords](https://support.google.com/accounts/answer/185833?hl=en).

No app password should be pasted into chat, Git, command arguments or a `VITE_*` setting. For the local private ignored `.env`, run:

```powershell
./scripts/configure-email.ps1
```

It asks for the app password with hidden input, preserves the existing private token key (or generates 32 random bytes), configures Google SMTP and sends no test message. Restart the Go API afterward. Turning on SMTP enables actual configured booking/security delivery and reminders; use the sender only when ready for delivery.

Production uses the private `/etc/tutor/api.env`, never auto-loads a development `.env` and must retain HTTPS, loopback API binding and Secure cookies. Add these server settings with a private editor/secret manager:

```dotenv
MAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURITY=starttls
SMTP_USER=support@gocoaching.in
SMTP_FROM=support@gocoaching.in
SMTP_PASSWORD=<private Google app password>
MAIL_TOKEN_KEY=<persistent base64-encoded 32-byte secret>
```

Never rotate the token key casually: pending codes need that key. An explicit rotation invalidates outstanding codes; issue fresh ones. Default `MAIL_PROVIDER=disabled` keeps password login available and reports code delivery as unconfigured. Enabled SMTP fails startup if its credentials/TLS/key configuration is incomplete; there is no mock delivery fallback.

Apply the additive migration before enabling the updated API:

```sh
./tutor-migrate --email-only
```

The existing operator deployment script also applies this scope. It adds one TTL-backed collection and a class scheduling index; it does not reset or seed production.

## Verification tools

Go tests use fictional recipients, isolated MongoDB and an in-process sender; separate SMTP tests perform real authenticated STARTTLS/implicit-TLS exchanges with a private loopback certificate, MIME decoding, temporary/permanent rejection and lost-ack handling. Browser signup requires an explicit local `MONGODB_URI`. All browser runs replace private SMTP settings with fictional credentials and a closed loopback endpoint; they inspect encrypted signup jobs or seed known challenges in the exact isolated test database and complete signup through the real Go endpoint. They do not contact Google or claim live delivery. The extended login/recovery/reminder browser test additionally requires `E2E_EMAIL=1`. The optional local MongoDB launcher caps its WiredTiger cache at 256 MiB and allows sixty seconds for disk recovery, keeping retained test data while reducing build/browser memory pressure.

`go run ./cmd/email-preview -out <directory>` (from `apps/api`) creates labelled fictional HTML/text examples using the production template and never connects to SMTP. Chromium desktop/mobile review covers layout, not actual Gmail/Outlook client compatibility, DNS authentication or deliverability. Those require the operator's private credentials and an authorised real-recipient test.
