# Server state transitions

Google interviews (2026-10-11): scheduling transactionally moves a submitted/under-review/assessed application to `assessment_scheduled` with interview `scheduled` and sync `pending`. A provider-confirmed conference makes sync `ready`; provider failure makes sync `failed`, disables joining and permits assigned-mentor retry/reconciliation. Only a manually confirmed conducted assessment changes the interview to `completed` and application to `assessed`; time/link opening never does. A recommendation does not approve or reject. Explicit Google approval requires an approval recommendation, saved fees and permitted requested scope; cancellation/rejection releases reservations, disables the link and queues provider deletion. Reinterview uses a new unique event. Historical Zoom records remain; their bookings can close locally, and retired provider jobs never execute. See [Google interviews](google-interviews.md).

| Domain | From → to | Actor and prerequisites | Atomic effects |
|---|---|---|---|
| Public signup | missing account → pending email challenge → verified account | Adult parent/tutor; configured SMTP; same normalized email and valid current signup code; password and rate/attempt checks | Request creates only challenge + encrypted outbox job; confirmation consumes code + creates user/credential/session + audit in one transaction |
| Application | missing/draft/legacy improvement_required → draft/submitted | Owning tutor, valid bounded application fields | Save application, automatically assign active mentor on submission + audit; never approval |
| Routing | pending → submitted | Admin, active mentor destination, expected version and reason | Assign mentor, cancel prior appointment and release guards + durable Google deletion + audit |
| Google Meet interview | submitted/legacy under_review/assessed → assessment_scheduled | Assigned mentor; valid 15–120 minute appointment; configured provider; expected version | Reserve applicant/mentor/host guards + queue Google create + audit; provider confirms private join URL |
| Google Meet interview | scheduled → rescheduled / cancelled / no_show | Assigned mentor; version + reason; no-show only after start | Transfer/release reservations + queue Google update/delete; cancel/no-show returns application to under_review |
| Fees | submitted/review/scheduled/assessed/approved/suspended → same status | Assigned mentor; expected version and complete valid plans for requested modes | Persist new fee version + audit; saved booking agreements remain immutable |
| Approval | assessment_scheduled/legacy assessed → approved | Assigned mentor; confirmed started Google Meet interview; requested subjects/classes/modes; complete fees; expected version; All Subjects max Class 5 | Complete appointment, release interview guards, set approval date/mentor/six-month scope + audit; four-rating interview assessment; no legacy scorecard/eligibility/approval-reason step |
| Scope update | approved → approved | Assigned mentor, current unexpired approval, expected version, valid requested scope and saved fees | Save scope + audit; expired approvals require a new interview through reopening |
| Rejection | submitted/under_review/assessment_scheduled/assessed → declined | Assigned mentor, expected version and applicant-visible reason; any existing Google operation resolved | Save feedback + audit, release interview guards and queue deletion of a scheduled Google meeting; no fees or approval prerequisites required |
| Suspension | approved → suspended | Admin, expected version + written reason | Revoke sessions and teaching access + audit + durable follow-up; retain bookings/learning/payment records |
| Reinstatement | suspended → approved | Admin, expected version + reason, existing scope unexpired | Restore eligibility; revoke old sessions + audit |
| Termination | approved/suspended → terminated | Admin, expected version + written reason | Revoke sessions/teaching access; reopen durable follow-up; final relationship state, no reinstatement |
| Reopening | declined or expired approved/suspended → submitted | Admin, version + reason | Assign active mentor and clear current fees/obsolete assessment fields; preserve earlier immutable audit evidence |
| Follow-up | pending_operator → resolved_operator | Admin, expected version, confirmed review + recorded outcome | Persist operator outcome + audit; no automatic cancellation, transfer or refund |
| Trial | none → requested | Parent owns learner (historical requirement links retained); currently approved scope; future time, consented terms, idempotency key | Zero-paise terms snapshot, trial, idempotency receipt, audit |
| Trial | requested → confirmed | Assigned tutor, scope remains approved/unexpired, future time, both resources conflict-free | Application version lock + day guards + confirmed trial + audit |
| Trial | requested/confirmed → cancelled | Owning family or assigned tutor | Release guards where applicable + audit |
| Trial | requested → declined | Assigned tutor | Decline + audit |
| Trial completion | confirmed -> completed | Assigned tutor submits notes, practice steps and feedback; production checks class has ended | Evidence and feedback immediately visible to owning parent; no mentor review |

Development permits recording a lesson before its scheduled end solely to exercise the full timeline; the UI explicitly says it does not assert real attendance. Production rejects this shortcut even when parent/tutor authentication is enabled. It must not become a live attendance path.

No illegal transitions are silently coerced. Repeated accepted/cancelled actions are safe; create retries require matching idempotency fingerprints.

| Domain | From → to | Actor / invariant | Effects |
|---|---|---|---|
| Tuition | completed trial -> awaiting_payment | Family owns learner/trial; approved selected subjects; tomorrow-or-later schedule; current staff fees/availability; accepted terms | Immutable subject/price agreement, held classes and 15-minute reservations + receipt; no tutor acceptance |
| Historical acceptance | pending_agreement -> active / awaiting_payment | Current tutor accepts a retained old request; scope, capacity, availability and both resource guards checked | Compatibility for saved requests only; new bookings never enter pending_agreement |
| Expiry | awaiting_payment → expired | Worker checks actual timestamp, independent of TTL | Held reservations released; old tutor access ends |
| Pause/cancel | active ↔ paused; open → cancelled | Family/tutor; expected version and reason | Guard release/reservation effects + audit; cancellation is not a provider refund |
| Reschedule | reserved/makeup → proposed → reserved | One party proposes; other accepts; current approval and conflicts checked again | Old/new guards transfer atomically; rejected conflicts preserve original time |
| Lesson | scheduled/makeup -> completed / missed / awaiting_review | Assigned tutor submits bounded notes/practice and present/absent/disputed attendance; production checks end time | Present attendance completes immediately; absent is missed; disputed awaits assigned mentor resolution. Historical reviewed records remain readable |
| Plan | version N → N+1 | Assigned mentor, expected version, bounded topics/evidence/review date | Append immutable version, update current pointer |
| Handover | requested → prepared → accepted | Family consent, assigned mentor, scoped replacement acceptance | Existing learning record retained; new agreement version; reservations transferred; old tutor access revoked |
| Payment | creating → created / reconciliation_required → captured | Server INR quote; provider order receipt; HMAC + fetched captured payment | Idempotent balanced journal; activate only unexpired valid holds without tutor acceptance; late capture goes to refund_review |
| Refund | requested → approved/rejected → submitted → processed/failed | Amount reserved atomically; separate eligible reviewer; stable provider idempotency key | Processed refund journal once; failed refund releases reservation; no bank settlement claim |
| Jobs | pending → processing → done / pending / failed | Atomic lease, explicit expiry, bounded backoff/attempts | Provider/scan work outside retryable transactions; operator retries visible |
| Case | open → assigned → waiting_family/resolved → open | Requester or assigned eligible operator; version and response evidence | Separate private replies; generic notifications. Safeguarding excluded from support role |
| File | uploading → quarantined → clean/rejected | Actual private storage + scanner result; current relationship checks | No scan means no download; family retains evidence through handover |
| Password | existing hash → new hash | Reauthenticated current password and bounded Argon2 work | Atomic credential update, auth-version increment, all sessions revoked, current opaque session rotated |

| One-way update | draft → sent | Admin to parent/tutor, or approved current tutor to assigned parent; session, CSRF, rate and transaction guards | Server-stored subject/body, participant metadata, audit ID and idempotency receipt; no replies |
| Read receipt | unread → read | Authenticated recipient opens a rendered message; explicit recipient-only POST | First server read timestamp retained; list/detail GET alone does not mark read |

See [Updates inbox](updates-inbox.md) for access revocation and legacy-record retention. Existing tuition chat and Activity notifications remain separate.

Privacy deletion, disputes, payout settlement and automated renewal states remain open implementation scope. Case closure records an operator response, not automatic legal fulfillment.

## Tutor lesson follow-up (2026-10-10)

Future scheduled class subject planning is versioned and limited to booked/approved scope. Present recording requires structured progress; tests are optional. Progress-only correction is allowed for the assigned approved tutor on completed/reviewed lessons within seven days of recording, including a completed enrollment, without changing attendance, package status or finance. Cancelled archives do not grant correction access. Trial feedback correction retains completed/reviewed status and uses the same seven-day, expected-version gate. See `tutor-workspace.md` for assignment-scoped archives, Home address limits and durable Google lesson transitions.
