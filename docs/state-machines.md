# Server state transitions

| Domain | From → to | Actor and prerequisites | Atomic effects |
|---|---|---|---|
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
| Trial | none → requested | Parent owns requirement/learner; currently approved scope; future time, consented terms, idempotency key | Zero-paise terms snapshot, trial, idempotency receipt, audit |
| Trial | requested → confirmed | Assigned tutor, scope remains approved/unexpired, future time, both resources conflict-free | Application version lock + day guards + confirmed trial + audit |
| Trial | requested/confirmed → cancelled | Owning family or assigned tutor | Release guards where applicable + audit |
| Trial | requested → declined | Assigned tutor | Decline + audit |
| Lesson | confirmed → completed | Assigned tutor, lesson evidence and next steps; scope status remains approved | Save evidence + audit; family cannot read evidence yet |
| Review | completed → reviewed | Assigned mentor, review evidence | Parent-visible reviewed evidence + timestamp + audit; tutor’s learner access is reduced |

Development permits recording a lesson before its scheduled end solely to exercise the full timeline; the UI explicitly says it does not assert real attendance. Production authenticated workflows are disabled. This shortcut must not become a live attendance path.

No illegal transitions are silently coerced. Repeated accepted/cancelled actions are safe; create retries require matching idempotency fingerprints.

| Domain | From → to | Actor / invariant | Effects |
|---|---|---|---|
| Tuition | reviewed trial → pending_agreement | Family owns learner/trial, scoped tutor, current offering, accepted versioned terms | Immutable agreement + planned classes + receipt |
| Acceptance | pending_agreement → active / awaiting_payment | Current tutor accepts; approval, capacity, availability and both resource guards rechecked | All recurring reservations atomically committed; paid holds expire explicitly after 15 minutes |
| Expiry | awaiting_payment → expired | Worker checks actual timestamp, independent of TTL | Held reservations released; old tutor access ends |
| Pause/cancel | active ↔ paused; open → cancelled | Family/tutor; expected version and reason | Guard release/reservation effects + audit; cancellation is not a provider refund |
| Reschedule | reserved/makeup → proposed → reserved | One party proposes; other accepts; current approval and conflicts checked again | Old/new guards transfer atomically; rejected conflicts preserve original time |
| Lesson | reserved → recorded → reviewed | Tutor writes bounded evidence; assigned mentor confirms/resolves attendance | Reviewed family evidence + derived package balance; development early recording is labelled |
| Plan | version N → N+1 | Assigned mentor, expected version, bounded topics/evidence/review date | Append immutable version, update current pointer |
| Handover | requested → prepared → accepted | Family consent, assigned mentor, scoped replacement acceptance | Existing learning record retained; new agreement version; reservations transferred; old tutor access revoked |
| Payment | creating → created / reconciliation_required → captured | Server INR quote; provider order receipt; HMAC + fetched captured payment | Idempotent balanced journal; activate only unexpired valid holds; late capture goes to refund_review |
| Refund | requested → approved/rejected → submitted → processed/failed | Amount reserved atomically; separate eligible reviewer; stable provider idempotency key | Processed refund journal once; failed refund releases reservation; no bank settlement claim |
| Jobs | pending → processing → done / pending / failed | Atomic lease, explicit expiry, bounded backoff/attempts | Provider/scan work outside retryable transactions; operator retries visible |
| Case | open → assigned → waiting_family/resolved → open | Requester or assigned eligible operator; version and response evidence | Separate private replies; generic notifications. Safeguarding excluded from support role |
| File | uploading → quarantined → clean/rejected | Actual private storage + scanner result; current relationship checks | No scan means no download; family retains evidence through handover |
| Password | existing hash → new hash | Reauthenticated current password and bounded Argon2 work | Atomic credential update, auth-version increment, all sessions revoked, current opaque session rotated |

Privacy deletion, disputes, payout settlement and automated renewal states remain open implementation scope. Case closure records an operator response, not automatic legal fulfillment.
