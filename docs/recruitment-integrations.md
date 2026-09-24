# Tutor applications: Cloudinary and Zoom

> Current media override (2026-09-25): use direct browser-to-Cloudinary uploads and authenticated Cloudinary viewing. No local ClamAV requirement applies to Cloudinary. The API verifies references and marks them `ready`, not scanned. See [private-files.md](private-files.md) for the current implementation. The scanner/proxy descriptions and recorded-demo controls below document the earlier implementation; Teaching approach no longer includes demo-choice/video/worksheet controls. Zoom configuration and scheduling remain current.


New tutors land on `/apply` with four stages: Complete application → Staff review → Zoom interview → Approval. They retain account, support and updates access. The seven application sections save through Go to MongoDB. Teaching navigation and APIs unlock only for an approved, unexpired scope; suspension, termination and expiry close that access again. Registration never grants approval.

## Private backend configuration

Set these in the ignored root `.env`, then restart the Go API. Never put secrets in `VITE_` variables or chat. Development Go entrypoints load this file; production uses explicit service environment configuration.

```dotenv
MEDIA_PROVIDER=cloudinary
VIDEO_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

MEETING_PROVIDER=zoom
ZOOM_ACCOUNT_ID=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_HOST_USER_ID=

# An actual running scanner is required for downloads and playback:
# CLAMAV_ADDRESS=127.0.0.1:3310
```

`ZOOM_HOST_USER_ID` is the Zoom user ID or email that hosts all interviews. An enabled provider with missing credentials fails startup. Keep a provider disabled until its settings are complete. Set both media providers to Cloudinary for all documents and videos; no separate document bucket is needed.

## Résumé and education documents

Education and experience now offers a résumé upload and up to six degree, marksheet or certificate files. Documents accept PDF/JPG/PNG up to 3 MiB each. Worksheets use the same private Cloudinary document adapter. Go stores exact originals as authenticated raw assets and saves their provider and selected IDs in MongoDB. Uploads save their application link immediately; refreshing the page retains it. Staff use the existing private application Documents tab. Downloads remain unavailable until a successful configured scan.

Synthetic PDF, JPG and PNG files passed live Cloudinary authenticated uploads and exact-byte retrieval on 2026-09-24; unsigned asset requests each returned HTTP 401. The three private smoke-test assets are retained. No personal documents were used. The main database had no older uploads to migrate, and its document/video providers now both select Cloudinary. `CLAMAV_ADDRESS` remains absent, so live downloads/playback are still quarantined.

## Video introduction

In Teaching approach, the applicant chooses a recorded demonstration and uploads an MP4, at most 25 MiB. Go validates its container, signs the upload and sends it to Cloudinary as an authenticated video under an opaque ID. Upload receipts support retrying the same interrupted file. The application retains the selected video ID across saves/reloads.

Cloudinary credentials, object keys and signed download URLs stay on the backend. Playback uses a session-protected Go endpoint with byte ranges; current ownership or assessor assignment is checked before and after storage access. Originals must pass the configured scanner and digest checks first. With no scanner, uploads remain quarantined and playback is locked. Configure and test ClamAV, fresh signatures and a stream limit of at least 25 MiB; Cloudinary upload success alone does not mark a file safe. See [private files](private-files.md).

New application file metadata is embedded in the existing application document (maximum 20 attachments); video bytes remain in Cloudinary. Legacy standalone metadata stays readable. `go run ./cmd/migrate -application-only` updates the existing application validator/index without adding a collection. This supports the current Atlas application despite its collection-capacity limit; it does not install the separate tuition/billing extensions.

The adapter follows Cloudinary's [authenticated asset access](https://cloudinary.com/documentation/control_access_to_media), [signature rules](https://cloudinary.com/documentation/authentication_signatures) and [Upload API](https://cloudinary.com/documentation/image_upload_api_reference).

## Staff interviews

Activate a Zoom Server-to-Server OAuth app for the host account. Give it the meeting permissions used by these operations:

| Operation | Granular admin scope |
|---|---|
| Create | `meeting:write:meeting:admin` |
| Read | `meeting:read:meeting:admin` |
| List for recovery | `meeting:read:list_meetings:admin` |
| Reschedule | `meeting:update:meeting:admin` |
| Cancel | `meeting:delete:meeting:admin` |

Zoom documents [Server-to-Server OAuth activation](https://developers.zoom.us/docs/internal-apps/s2s-oauth/) and the [meeting endpoints/scopes](https://developers.zoom.us/docs/api/meetings/). Host account policies and licenses still govern meeting capabilities.

An admin or assigned reviewer opens an application, confirms their conflict check and chooses an interview date and duration. The backend transaction reserves the applicant, reviewer and configured Zoom host, then queues the provider operation. The join link appears only after Zoom confirms creation. Rescheduling updates that meeting; cancellation queues its deletion. Applicants see the confirmed appointment and can download a calendar event. Staff must sign in to Zoom as the configured host to run the interview; the host's privileged start URL is never distributed. Email invitations, meeting recording and automatic attendance/approval are not implemented.

Provider calls run in the leased background worker outside MongoDB transactions. Failures have bounded retries and a staff retry action. Before creating a meeting, the job saves a durable attempt marker. A lost response triggers lookup by an opaque operation topic instead of another create request. If Zoom cannot confirm the meeting, the application remains blocked for operator investigation; do not clear that marker or create a second meeting blindly. A crash between saving the marker and sending the request can also require operator reconciliation. External edits in Zoom do not currently sync back through webhooks; make appointment changes in this app.

The interview must begin, provider confirmation must be ready, and staff must record assessment evidence before approving a supported scope. Background confirmation preserves unfinished staff scorecard inputs. Ordinary staff decisions, reasons and provider confirmations remain in application history.

## Verification boundary — 2026-09-24

Full Go race suite and vet passed against an explicit local MongoDB replica set. Provider wire tests cover private Cloudinary signatures and Zoom OAuth/create/read/update/delete/recovery; database tests cover ownership, quarantine, range playback, application access gates, scheduling conflicts, pending/failed operations and human approval. Three selected Chromium flows passed: private recorded upload, new-applicant gating, and staff interview/approval/suspension/termination. The browser Zoom server and scanner verdicts are explicitly test-only; runtime uses the real providers.

Cloudinary credentials passed a read-only authenticated API check. After the operator added the missing meeting-list scope, Zoom OAuth authentication and the configured host's read-only meeting-list request both returned 200. All five required meeting permissions are now granted, resolving the earlier 4711 error. The main API was restarted and loads both providers from `.env`. No real applicant video was uploaded and no live Zoom meeting was created during verification. `CLAMAV_ADDRESS` is still absent, so scanned playback remains pending scanner configuration. No public deployment, database cleanup or external invitation occurred.
