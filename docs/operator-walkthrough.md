# Operator review of implemented workflows

This is a review worksheet, not a completed sign-off. Use a private development/staging environment and fictional records. The current Atlas collection-limit blocker must be resolved before installing the extension over the existing app. The automated local replica-set checks do not replace this review, provider acceptance or deployment checks.

Record the reviewed commit/build, environment/database, operator, date, browser/device, language, observed result and unresolved defects. Never record credentials, actual child details or private provider payloads here. Use separate browser profiles for each role; public signup grants only parent/tutor accounts. Provision staff using the [staff command](staff-provisioning.md), or use the explicitly fictional development fixtures.

## Family and academic team

1. Sign up as a tutor and complete `/apply`. Confirm the application is private and absent from `/tutors`. A submitted document or a configured fee must not approve or publish the tutor.
2. Sign in as a mentor or admin at `/login?staff=1`. Open Applications/Assessments, confirm no conflict and start review (or assign a reviewer as admin). Schedule an actual Zoom invitation link and India-time interview. Verify the applicant can see/download the appointment, and overlapping reviewer interviews fail. After it starts, record six scores and evidence, then approve only the supported scope with a reason and ongoing mentor. Confirm publication contains the precise approved subject/classes/mode and no private documents.
3. Sign up as a parent/adult learner. On `/match`, check the guardian gate before any fictional minor details, or use the adult-self path. Add a learner, save/refresh the requirement, and request a trial with the approved tutor. Confirm the other household cannot open that learner.
4. Tutor accepts the trial. Try an overlapping request in a second browser: at most one reservation may confirm. Record explicitly developmental lesson evidence; the assigned mentor reviews it, and the family sees persisted progress after reload.
5. Tutor saves weekly windows, leave, buffer, capacity and a test fee in `/availability`. Start with a zero-fee offering to review the academic workflow without provider credentials. Confirm an unapproved tutor's availability does not make them bookable.
6. Family opens `/tuition`, selects the reviewed trial, reviews the server-priced recurring agreement and sends it. Tutor accepts. Verify all class dates, local timezone, agreed count and remaining count. A conflicting series must not partly reserve classes.
7. Propose a class-time change. It must wait for the other party's acceptance. Review cancellation/makeup behavior against the visibly provisional development terms; this is not approval of a live refund policy.
8. Tutor records a lesson. Mentor reviews evidence and publishes a plan with starting point, goals, topic evidence, practice and review date. Check both languages and the family's retained plan history.
9. Family requests a tutor change and consents to sharing. Mentor prepares next teaching steps; replacement tutor reviews and accepts the invitation. Family retains the lesson/plan history. The former tutor must receive denial when reopening the tuition, files and messages.

## Communication, files and account

1. Use the family conversation in the tuition page from the parent and assigned tutor/mentor profiles. Reload both sides; messages should persist. An unrelated tutor/household must not read or send. Check the recipient's `/notifications` and its persisted read state.
2. With explicitly configured private storage, upload a small fictional JPEG/PNG/PDF in an application or tuition. An invalid extension/signature or oversize file must fail. A saved file remains quarantined with no download until the actual scanner accepts it. Verify old-tutor download denial after handover.
3. Without configured storage or scanner, inspect the actual unavailable/quarantine state; do not record this as a successful scanner test. Real bucket policy, malware-signature updates, retention and restore remain separate gates in [private-files.md](private-files.md).
4. In `/account`, save name/language and reopen in another browser session. Change the password after verifying the current one; the other session and old password must fail. Sign in with the new password and separately exercise targeted session revocation.

## Service and finance operations

Staff lifecycle review: on a fictional approved tutor, suspend with a reason and confirm old sessions fail, teaching routes are denied after signing in again, and existing records remain. Reinstate while approval is valid; expired scopes require reassessment. Terminate only the fictional test relationship, confirm no reinstatement action exists, then record an outcome in Follow-ups. Check decision reasons, assignment changes, internal notes and retained assessment evidence in Decision history. This manual review does not imply a real email, Zoom meeting creation, booking cancellation or refund.

1. Family creates a request in `/cases`. Support signs in to its request area; unclaimed details are redacted. An eligible independent operator claims, responds and resolves; the requester can reopen with a reason. Check replies/read permissions after reload.
2. Submit a fictional safeguarding request. Ordinary support must not see its evidence. An authorised admin must claim before reading/handling it. This inbox does not implement the complete protective-action/external-escalation procedure and cannot be signed off as an emergency service.
3. Finance signs in to `/billing`, while direct academic-dashboard/learner/file access remains denied. Empty records must remain empty; no sample transaction is presented as money received.
4. Configure private Razorpay **test** credentials and a separate webhook secret only under the staging setup in [payments.md](payments.md). Create a fresh payable agreement/hold; verify exact provider amount/INR/order ownership and a real test checkout. A browser redirect alone must not activate tuition. Missing configuration must show the blocked checkout state.
5. Exercise signed webhook retries/out-of-order delivery and an expired hold. Verify one capture journal, no duplicate activation and explicit review for a late/unusable capture. Review the saved provider references, not a success toast.
6. Request a partial refund. A different finance/admin account reviews it. Confirm request/approval/submission/processing are distinct, provider idempotency prevents duplicate effects, and journal totals agree with the actual sandbox provider. This live-provider portion has not been executed in the current checkpoint.

## Review outcome

Check desktop and mobile at 360/390/768/1024/1440, both languages, keyboard-only navigation, dialogs/drawers, native 200% zoom, long names, load/error/retry/empty states and persisted state after process restart. Automated Windows Chromium/axe results are recorded separately; native screen-reader and other browser/device review is still required.

List each accepted flow and every defect individually. Leave unimplemented scope open: expanded matching/shortlists/reviews, automatic Zoom creation/invitation delivery and specialist scopes, renewals, recovery/staff MFA, commissions/earnings/invoices/disputes/payouts, CMS/reports, retention execution, public pre-rendering/performance and deployment/restore verification. The [acceptance matrix](acceptance-matrix.md) and [release checklist](release-checklist.md) remain authoritative. No production approval follows automatically from completing this worksheet.
