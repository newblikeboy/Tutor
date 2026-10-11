# Google Calendar and Meet tutor interviews and lessons

The requested Google interview integration extends the Go/chi API, React/TypeScript workspace and official MongoDB driver v2. It uses the existing password sessions, assigned-mentor authorization, versioned tutor applications, interval reservations, audit collection, notification inbox, SMTP outbox and leased provider worker. There is no second backend or authentication system.

Only the assigned active mentor schedules, reschedules, assesses, approves or rejects their applicants. Admins retain visibility and pending-application routing; academic decisions remain mentor-only. Parents, support, finance and unrelated mentors cannot access interview details or links. Tutors do not connect Google to join. Zoom integration is removed. Historical interviews remain readable and can be closed locally before a new Google interview. Approved tutors connect their own Google account to host teaching lessons; see [Google teaching lessons](google-lessons.md).

## Configuration and deployment

| Variable | Purpose |
| --- | --- |
| `INTERVIEW_PROVIDER` | Explicitly select `google` or `disabled`. If absent, preserve the existing `MEETING_PROVIDER` selection. |
| `MEETING_PROVIDER` | Select `google` for online teaching lessons or `disabled`. |
| `GOOGLE_OAUTH_CLIENT_ID` | Existing private Web Application OAuth client ID. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Existing private client secret. |
| `GOOGLE_OAUTH_REDIRECT_URI` | Registered callback, exactly `https://gocoaching.in/api/integrations/google/callback` in production. |
| `GOOGLE_TOKEN_KEY` | Independent persistent base64-encoded 32-byte encryption key. Keep in the private environment or secret manager; back it up securely. |
| `TEST_GOOGLE_ENDPOINT` | Loopback-only Google wire fixture, accepted only in `APP_ENV=test`; never deploy it. |

Existing credentials are read under their actual `GOOGLE_OAUTH_*` names. Neither `.env` nor credential values belong in Git, browser bundles, screenshots, logs or documentation. `GOOGLE_CALENDAR_SCOPES` cannot broaden the adapter's consent: it always requests `https://www.googleapis.com/auth/calendar.events` and `https://www.googleapis.com/auth/userinfo.email`. Email permission is needed to identify the verified connected account. Calendar availability is read from events using the already-consented events scope; no Calendar-wide or additional free/busy permission is requested.

`scripts/configure-google.ps1 -EnableInterviews` adds only missing `GOOGLE_TOKEN_KEY` and `INTERVIEW_PROVIDER=google` settings to an existing private development `.env`; it never prints values or replaces existing OAuth credentials/callbacks. It refuses to overwrite an existing different interview provider. On Linux, generate the key directly into a private environment/secret manager, not into chat or command history. Do not regenerate the key while encrypted authorizations or revocation jobs exist. Key rotation requires decrypting/re-encrypting retained tokens in a reviewed migration; changing the key alone requires mentor reconnection and can prevent queued revocation.

Run `go run ./cmd/migrate --google-only` from `apps/api` with the intended private environment configured, before enabling the feature. The additive `010-google-interviews` migration creates `google_connections` and `google_oauth_states`, adds OAuth intent TTL, organizer interview/lesson indexes and organizer outbox indexes, and records its application. It is repeatable and does not rewrite applications, historical Zoom meetings, audits or fees. Full migration and `scripts/deploy-existing.sh` include this scope. Production deployment remains operator-run and was not performed for this request. Nginx already proxies `/api/` and disables API access logging, including the callback; preserve that rule so authorization codes never enter access logs. Production startup requires the Google callback to share `WEB_ORIGIN`, HTTPS and the exact registered path.

The configured production callback cannot finish a local browser's OAuth flow: its password session belongs to the local origin. For live local verification, add `http://127.0.0.1:5173/api/integrations/google/callback` to the same Google Cloud Web client's authorized redirect URIs, and pass that URI as an explicit local process environment override. The development `.env` loader respects existing process variables. Keep the saved production callback unchanged. A development Connect request rejects a callback belonging to another origin with a clear setup error.

## Mentor and tutor workflow

1. In the mentor workspace, open Overview, Tutor applications or the existing interview queue and choose **Connect Google Account**. Consent uses offline access, explicit account selection, a cryptographically random single-use ten-minute state tied to the initiating password session, and PKCE S256.
2. The callback consumes the matching intent atomically, exchanges the code server-side, verifies granted scopes, refresh-token presence, verified Google email and Calendar access, and stores encrypted authorization. Failed/denied callbacks redirect to a fixed outcome code; no provider errors, authorization codes or tokens appear in the destination URL. A different Google account cannot replace the organizer while interviews still require synchronization.
3. In an assigned tutor's **Review & decision** tab, choose the future IST date/time, 15–120 minute duration and optional shared interview details. The application/version transaction reserves applicant, mentor and connected-calendar intervals and queues a provider job. The UI shows **Confirming with Google Calendar**, with no join action until provider confirmation. Duplicate/stale submissions cannot create another event.
4. The worker inserts an event in the connected mentor's primary Calendar, includes the tutor's valid email, uses `conferenceDataVersion=1`, a unique conference request ID, and `sendUpdates=all`. Pending conference creation is polled for up to fifteen minutes; the Meet URL and code always come from Google's response. The tutor sees the schedule, platform, mentor and current link in the existing application dashboard; approved tutors also retain their Home interview card.
5. **Join Meeting** opens a same-origin authorized endpoint that rechecks the current Google event's date/time, conference and ownership before redirecting to its real Meet link. A harmless RSVP/metadata-only ETag change does not block joining; update/cancellation still require ETag reconciliation. Google authentication, host admission and access rules still apply. No attendance, recordings or host controls are inferred from Calendar creation or link opening.
6. After actually conducting the interview, the mentor records four 1–5 ratings (subject knowledge, teaching ability, communication, professionalism), tutor-visible feedback, an approve/reject/reinterview recommendation, and explicit conducted confirmation. Submission marks the interview completed and records an immutable audit snapshot; passing the end time does not do so. The recommendation never automatically approves/rejects the tutor. Google-based initial approval requires an approval recommendation, complete mentor-set fees and a permitted requested teaching scope. **Approve tutor** and **Reject application** retain the existing separate decision controls. A reinterview gets a new unique event; historical assessment and scheduling snapshots remain in audit.

The existing three sections remain Interview, Fees and Subjects & teaching modes. The requested manual assessment is inside Interview. Google assessments are additive and do not rewrite legacy six-rating evidence ; historical non-Google interviews cannot satisfy a new approval. Admin details show stored Google connection health and last check; that stored check is not a live Google certification. Queue records already support URL-backed status/search/mode filters, chronological cursor pagination, meeting synchronization badges and assessment/application status.

## Synchronization and recovery

- Calendar creation uses a persisted deterministic event ID. Retries GET that same ID before inserting, so a lost response or failed MongoDB finish transaction cannot create a second interview. Provider calls occur outside retryable database transactions.
- Rescheduling updates the same event and preserves its Meet linkage. It checks the original ETag with `If-Match`, and records the operation ID in private event metadata so retries can recognize an already-applied update. Conference creation and event start/end must match before synchronization becomes ready.
- Cancellation/rejection clears the join link immediately, releases application reservations, and queues durable Calendar deletion. A deleted/missing event is an idempotent cancellation result. Historical interview, assessment and price records remain.
- Changes in Google Calendar are detected during update/cancellation and immediately before joining. They do not silently overwrite the event. The assigned mentor uses **Review Calendar changes**, sees the current Calendar time/status and intended GoCoaching action, and explicitly confirms the reviewed ETag before retrying. Changes made after review are rejected again. If the event was manually deleted, cancel the GoCoaching interview and schedule a new one. If its GoCoaching private ownership metadata was removed, reconcile/delete it in Calendar before cancelling; the app refuses to adopt an unrelated event.
- Expired access tokens refresh server-side with revision/generation checks. Revoked grants, missing permissions and authorization failures become reconnection requirements. Calendar/API outages show unavailable health, never a healthy connection. Token errors are redacted. Provider jobs retain bounded backoff, leases, failed states and assigned-mentor retry; admins can see failures without gaining academic write permissions.
- Disconnect requires scheduled interviews and failed/pending synchronization to be resolved first. It atomically removes active token fields, invalidates OAuth intents and queues encrypted token revocation. The encrypted revocation payload is removed when Google confirms revocation or reports an already-invalid token. Pending revocation blocks reconnection; a failed revocation has a mentor-owned retry control. Historical records stay intact.
- Application/calendar guards prevent concurrent GoCoaching overlaps, including two mentors authorizing the same Google calendar. Google event availability is also checked, but Calendar does not offer an atomic reservation against unrelated external calendar writers; an event created outside GoCoaching after the availability check can still overlap. Do not claim universal external-calendar locking.

## API additions

| Route | Access / result |
| --- | --- |
| `POST /api/v1/integrations/google/connect` | Mentor + existing Origin/CSRF; returns consent URL. |
| `GET /api/integrations/google/callback` | Existing mentor session + matching one-time state; fixed 303 redirect. |
| `GET /api/v1/integrations/google` | Own mentor's token-free status, email, checked time and pending revocation state. |
| `POST /api/v1/integrations/google/disconnect` | Own mentor; removes credentials and queues revocation. |
| `POST /api/v1/integrations/google/revoke/retry` | Own mentor's failed revocation only. |
| `GET /api/v1/staff/applications/{id}/meeting/calendar` | Assigned mentor's failed operation review. |
| `GET /api/v1/applications/{id}/interview/join` | Owning tutor or assigned mentor; revalidated provider redirect. |
| Existing `POST /api/v1/applications/{id}/decision` | Reuses schedule/reschedule/cancel/no-show/fees/approve/decline; adds `interview_assessment`. |
| Existing meeting retry | Adds optional explicitly reviewed `calendarETag`. |

Existing tutor application, staff detail/overview/queues/audit and admin jobs endpoints expose authorized interview/assessment/synchronization data. The generated OpenAPI contract includes the new schemas and callback's absolute `/api` server path. Refresh/access tokens, organizer IDs, provider event IDs, ETags and job payloads remain backend-only except the explicitly reviewed ETag returned to the assigned mentor for reconciliation.

## Implementation files

- `apps/api/internal/googlecalendar/client.go` and its tests: server-only OAuth, encrypted authorization, Calendar REST calls and provider error handling.
- `apps/api/internal/app/google.go`, `google_interviews.go`, `google_test.go`: mentor authorization and interview synchronization, with the existing staff, meetings, jobs, email and HTTP modules extended in place.
- `apps/api/internal/config/config.go`, `google_test.go`, `internal/storage/google.go`, `cmd/migrate/main.go`: actual environment names, explicit provider configuration and additive migration.
- `apps/api/internal/domain/application.go` and `staff.go`: additive interview/assessment and immutable audit fields.
- `apps/web/src/components/google-connection.tsx`, `interview.tsx`, `routes/staff.tsx`, `apply.tsx`, `conversations.tsx`, related locale files and `styles/google-interviews.css`: mentor connectivity/review, tutor details/feedback, admin visibility and notification navigation.
- `scripts/google-contract.mjs`, `recruitment-contract.mjs`, `contracts/openapi.yaml`, generated `schema.d.ts`: reproducible API contract.
- `scripts/google-test-server.mjs`, `e2e-server.mjs`, `tests/e2e/google-interviews.spec.ts`: isolated provider/browser verification; the existing staff-tabs selector follows the renamed generic Interview section.
- `scripts/configure-google.ps1`, `.env.example`, `scripts/deploy-existing.sh`: private additive local configuration and operator-run migration support. No new dependency is required.

## Verification

Automated provider requests use local mocks. Go integration uses a fresh retained replica-set database; browser verification uses the real Go API, a separate retained database and explicitly enabled loopback Google/SMTP fixtures. Never set test endpoints in production or use production mentor accounts in these tests.

```powershell
# From apps/api, against the optional local replica set:
$env:TEST_MONGODB_URI = 'mongodb://127.0.0.1:27017/?replicaSet=rs0'
go test -race -count=1 -run 'TestMongoGoogle|TestTokenEncryption|TestGoogleURL|TestConferenceLifecycle|TestRefreshAnd|TestIdempotentCalendar' ./internal/app ./internal/googlecalendar

# From the repository root:
$env:MONGODB_URI = 'mongodb://127.0.0.1:27017/?replicaSet=rs0'
$env:E2E_GOOGLE_INTERVIEWS = '1'
npx playwright test tests/e2e/google-interviews.spec.ts
npm run typecheck
npm run lint
npm run test
npm run build
```

The integration test covers state/session/replay/scope validation, encrypted persistence, CSRF/role denial, concurrent duplicate scheduling, shared-calendar conflicts, asynchronous conferences, a failed MongoDB finish after provider creation, retry without duplicates, tutor ownership/join, external modification/explicit reconciliation, assessment authorization/validation, explicit approval, rescheduling, cancellation, API failure, expiry/refresh, revoked authorization and durable disconnect. Provider unit tests validate PKCE construction, authenticated encryption binding, Meet URL boundaries, conference states, redacted errors, ETags and idempotent updates/deletes. Tests do not prove Google's live consent or account eligibility.

For manual live verification after separately authorized deployment/setup:

1. In the existing Google Cloud project, confirm Calendar API is enabled and the existing Web OAuth client has the exact callback for the running origin. Keep the production callback; add `http://127.0.0.1:5173/api/integrations/google/callback` for local use. Confirm consent includes the two scopes listed above and add the consenting mentor as a test user if the app is in Testing.
2. For local verification, stop the current development API and restart it from `apps/api` with the process override below. Keep Vite running on 5173. This does not edit the saved production callback or any credential.
3. Sign in as the assigned active mentor, open Tutor applications or Interviews and choose Connect Google Account. Consent with that mentor's Google account; confirm the displayed connected email matches.
4. Open one consenting tutor's application, choose a future IST time/duration and Schedule Google Meet. Wait for provider confirmation. Verify one actual event in the mentor's Calendar, its attendee and Meet conference. Sign in as that tutor and verify the same schedule/link, then use Join Meeting. Google admission rules still apply.
5. Reschedule that interview, optionally change shared details, and verify the same event updates and participant notices arrive. If Calendar changes independently, verify writes stop for review and only the mentor can confirm the reviewed change.
6. Conduct the interview, explicitly confirm it and submit the four ratings/feedback/recommendation. Reload to verify persistence, set fees and approve the requested scope through the existing separate decision. Verify tutor feedback and admin read-only history.
7. Use a separate operator-approved interview to test cancellation and link removal. After interviews and pending synchronization are resolved, test revoking consent/reconnection and Disconnect, confirming token revocation completion. Do not treat an invitation as proof of attendance.

```powershell
# From apps/api, after registering the local URI and stopping its current API:
$env:GOOGLE_OAUTH_REDIRECT_URI = 'http://127.0.0.1:5173/api/integrations/google/callback'
go run ./cmd/api
```

This manual procedure may send real Calendar invitations and SMTP updates, so it requires explicit operator authorization before execution.

Historical interview-only acceptance before Zoom removal: `go test ./...`, `go vet ./...`, API build, final targeted real-MongoDB race tests (app 27.798 seconds and Google client 2.872 seconds), frontend typecheck/lint/16 unit tests/build, exact contract reproduction, formatting/scoped whitespace, and configured-secret source/build scan (520 text files, 14 private configured values, zero findings) pass. The final Google browser journey and three existing Zoom/staff browser regressions pass; eighteen paired-state screenshots are reviewed in `visual-qa/google-interviews`. The additive development migration and local API restart/readiness succeed. Live Google and production deployment are not accepted by these fixture-based checks.

External OAuth applications in Google's Testing publishing state are restricted to configured test users and generally receive seven-day refresh tokens for these sensitive Calendar scopes. Public production use may require Google sensitive-scope verification; check the project's actual audience, publishing status and verification requirements. No paid Workspace feature, Meet attendance API, recording or host-control entitlement is assumed. Live Google OAuth, invitations, conference provisioning and production deployment remain separate release gates.

Primary references: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [OAuth refresh-token/testing limits](https://developers.google.com/identity/protocols/oauth2), [Calendar events.insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [Calendar event/conference fields](https://developers.google.com/workspace/calendar/api/v3/reference/events).
