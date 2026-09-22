# Server state transitions

| Domain | From → to | Actor and prerequisites | Atomic effects |
|---|---|---|---|
| Application | missing/draft/improvement_required → draft/submitted | Owning tutor, valid bounded application fields | Save application + audit; never approval |
| Assessment | submitted → under_review | Mentor, cannot assess self | Assign assessor + audit |
| Assessment | under_review → assessment_scheduled | Assigned mentor | Record development assessment instant + audit. Real appointment calendar pending. |
| Assessment | assessment_scheduled → assessed | Assigned mentor, six 1–5 scores, evidence | Save evidence + audit |
| Decision | assessed → approved/improvement_required/declined | Assigned mentor, written reason; approved range within 6–10 | Scope/review expiry + audit; no score auto-approval |
| Suspension | approved → suspended | Admin, written reason | Immediately fails new eligibility + audit + operations follow-up task; no deletion of existing trials |
| Trial | none → requested | Parent owns requirement/learner; currently approved scope; future time, consented terms, idempotency key | Zero-paise terms snapshot, trial, idempotency receipt, audit |
| Trial | requested → confirmed | Assigned tutor, scope remains approved/unexpired, future time, both resources conflict-free | Application version lock + day guards + confirmed trial + audit |
| Trial | requested/confirmed → cancelled | Owning family or assigned tutor | Release guards where applicable + audit |
| Trial | requested → declined | Assigned tutor | Decline + audit |
| Lesson | confirmed → completed | Assigned tutor, lesson evidence and next steps; scope status remains approved | Save evidence + audit; family cannot read evidence yet |
| Review | completed → reviewed | Assigned mentor, review evidence | Parent-visible reviewed evidence + timestamp + audit; tutor’s learner access is reduced |

Development permits recording a lesson before its scheduled end solely to exercise the full timeline; the UI explicitly says it does not assert real attendance. Production authenticated workflows are disabled. This shortcut must not become a live attendance path.

No illegal transitions are silently coerced. Repeated accepted/cancelled actions are safe; create retries require matching idempotency fingerprints. Further state machines (holds, expiry jobs, disputes, agreements, enrollment, payments, refunds, handover, account deletion) are pending and must precede their routes/UI.
