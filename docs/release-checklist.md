# Release blockers — not production ready

## Implemented development capabilities

- [x] Email/password accounts, Argon2id protection, opaque sessions, Origin/CSRF, ownership and scoped academic approval.
- [x] Availability, recurring agreements/classes, authoritative tutor/learner scheduling, holds/expiry, rescheduling/makeup and reviewed lesson evidence.
- [x] Versioned plans and consented handover with old-tutor access revocation.
- [x] Family-visible conversation, in-app updates and assigned support/privacy/restricted safeguarding cases.
- [x] Direct Cloudinary uploads with provider verification, reference-only persistence and authorised expiring delivery links. Legacy disk/S3 retains quarantine and scan jobs. Cloudinary files are not represented as malware-scanned.
- [x] Razorpay test adapter, verified raw webhooks, capture/refund reservations and journals, finance review/reconciliation and leased jobs. Actual provider sandbox acceptance remains a launch gate.
- [x] Account preferences, password change, session revocation and audited staff bootstrap CLI with hidden password entry. No staff MFA claim.
- [x] Go/database security and targeted browser verification described in progress.md. These checks apply to the exercised development scope only.

## Required operator inputs and external checks

- [x] Operator explicitly approved the reviewed 27 test databases; 398 collections removed, 102 preserved. User subsequently confirmed the droplet migration succeeded. No application databases were deleted.
- [ ] Real name/wordmark, founder biography, lawful contact details, actual service area and eligibility criteria; provisional content must be reviewed.
- [ ] Live guardian-verification procedure before real minor data collection. A development declaration is not verification.
- [ ] Reviewed email ownership/recovery and breached-password policy, trusted proxy/abuse controls and staff recovery process. Staff MFA is not required under the explicit password-only override.
- [ ] Qualified review of child-data/privacy/consent, retention/deletion/legal holds, teacher eligibility, consumer/refund and tax/invoice policies.
- [ ] Safeguarding staffing, protective actions and external escalation procedure; no 24/7/emergency authority-contact claims.
- [ ] Reviewed fees, cancellation/makeup/travel rules, platform share and merchant-approved collection/refund/settlement arrangement. User reports an approved Razorpay account; test keys and webhook secret are absent in the private environment, and Route/payout approval is separate.
- [ ] Real Razorpay sandbox checkout, webhook delivery/retries, refunds and reconciliation with an operator-controlled HTTPS endpoint. Review the restrictive Nginx CSP before enabling hosted checkout.
- [ ] Cloudinary account delivery/access policy, browser upload/playback from the actual HTTPS origin, account size restrictions, retention and restore rehearsal. ClamAV is required only for legacy disk/S3 deployments, not the selected Cloudinary flow.
- [ ] GitHub remote/CI run, DigitalOcean SSH/domain/TLS, restricted Atlas credentials/network, monitoring and isolated restore rehearsal.
- [ ] Operator audit of actual tutors/scopes/evidence and production records. Fictional samples must never be published as genuine.

## Remaining implementation and verification

- [ ] Expanded discovery filters, scoped locality aliases, shortlist/comparison, callback/waitlist and operator matching.
- [ ] Complete application declarations/multi-scope service offerings, real assessment appointments/reassessment, reviewed material profile changes and specialist conflict/assignment workflows.
- [ ] Renewal approvals and continuity across renewed packages, home-address/guardian-space workflow when home tuition is approved, broader attendance/dispute operations.
- [ ] Relationship-backed reviews, moderation/reporting/tutor response, CMS publication, staff permission operations and actual operational reports.
- [ ] Password recovery/email delivery and staff recovery; MFA is not implemented or required under the user override.
- [ ] Approved commissions, tutor expected/pending/payable/settled earnings, invoices, disputes/chargebacks and provider-approved payout reconciliation.
- [ ] Richer MongoDB schemas and migration history, remaining legacy pagination/history bounds, orphan/quota lifecycle and retention/deletion execution.
- [ ] Public pre-rendering/SEO, reproducible mobile Lighthouse/performance budgets and field-vitals plan.
- [x] Full implemented-scope Chromium regression: 39/39 passed, including all 12 reviewed pixel baselines, sampled axe, bilingual widths, keyboard, errors/retry and real multi-step persistence. See progress.md for the final affected-flow rerun after admin refinement.
- [ ] Expanded manual text/keyboard/reflow, native zoom, assistive technology and cross-browser/device review.
- [ ] Full release security/access matrix, restore exercise and [independent operator walkthrough](operator-walkthrough.md) on the intended deployment.

Production non-sample parent/tutor signup/login and provisioned staff password login can be explicitly enabled with `AUTH_PROVIDER=password`; see [production authentication](production-auth.md). Minor guardian verification and real payments remain closed. Staff password-only access follows the explicit operator override. Email ownership/recovery and the broader launch checks above are still outstanding. Local replica-set testing is not an actual provider trial or a full production-readiness certification.
