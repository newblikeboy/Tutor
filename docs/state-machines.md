# Server state transitions

| Domain | From → to | Actor and prerequisites | Atomic effects |
|---|---|---|---|
| Public signup | missing account → pending email challenge → verified account | Adult parent/tutor; configured SMTP; same normalized email and valid current signup code; password and rate/attempt checks | Request creates only challenge + encrypted outbox job; confirmation consumes code + creates user/credential/session + audit in one transaction |
| Application | missing/draft/improvement_required → draft/submitted | Owning tutor, valid bounded application fields | Save application + audit; never approval |
| Assessment | submitted → under_review | Provisioned mentor/admin; cannot assess self; reviewer confirms no conflict | Assign assessor + audit; admin reassignment resets conflict declaration and cancels any prior interview |
| Interview | under_review → assessment_scheduled | Assigned reviewer; conflict declaration; valid 15–120 minute Zoom interview | Reserve applicant/reviewer day guards + persist UTC instants, timezone and private join URL + audit |
| Interview | scheduled → rescheduled / cancelled / no_show | Assigned reviewer or admin for cancellation; version + reason; no-show only after start | Transactionally transfer/release reservations; cancel/no-show returns application to under_review |
| Assessment | assessment_scheduled → assessed | Assigned reviewer; interview has started; six 1–5 scores and evidence | Complete interview, release interview guards, retain assessment snapshot + audit |
| Decision | assessed → approved; reviewed → improvement_required/declined | Assigned reviewer, conflict declaration, written reason; approved range 6–10 and provisioned ongoing mentor | Six-month scope expiry + immutable evidence audit; no automatic score approval |
| Suspension | approved → suspended | Admin, expected version + written reason | Revoke sessions and teaching access + audit + durable follow-up; retain bookings/learning/payment records |
| Reinstatement | suspended → approved | Admin, expected version + reason, existing scope unexpired | Restore eligibility; revoke old sessions + audit |
| Termination | approved/suspended → terminated | Admin, expected version + written reason | Revoke sessions/teaching access; reopen durable follow-up; final relationship state, no reinstatement |
| Reassessment | declined or expired approved/suspended → submitted | Admin, version + reason | Reset assignment/conflict/assessment; preserve earlier immutable audit evidence |
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

Future scheduled class subject planning is versioned and limited to booked/approved scope. Present recording requires structured progress; tests are optional. Progress-only correction is allowed for the assigned approved tutor on completed/reviewed lessons within seven days of recording, including a completed enrollment, without changing attendance, package status or finance. Cancelled archives do not grant correction access. Trial feedback correction retains completed/reviewed status and uses the same seven-day, expected-version gate. See `tutor-workspace.md` for assignment-scoped archives, Home address limits and durable Zoom lesson transitions.
