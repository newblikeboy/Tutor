# Decisions and assumptions

2026-09-23 pending-project extension: the reported approved Razorpay merchant account authorises implementing its adapter, not sending live charges or assuming Route/payout approval. Runtime development accepts test keys only. Current private `.env` was preserved; Atlas collection capacity prevents installing the extension there until the exact cleanup manifest is approved or more capacity is provided. All current local test data is fictional and isolated.

Ongoing tuition uses the existing exercised online Mathematics scope, the tutor's recorded test offering and immutable development terms. The 12-hour cancellation window, makeup rules and included academic support are visibly provisional behavior, not approved consumer policy. No commission, tax rate, home coverage or guardian-verification method was invented. S3-compatible private storage uses the official Go SDK; disk is development-only; absent ClamAV leaves files quarantined. Staff bootstrap is implemented, while MFA/invitation/recovery remains a separate release requirement.

2026-09-23 user override: replace OTP with email/password and redesign login/signup. This supersedes the passwordless requirement in the preserved original brief. Public signup allows adult parent/learner and tutor accounts only; a tutor account remains unapproved. Emails are trimmed/lowercased and not treated as verified contact ownership. Passwords use Argon2id and 15–128-character passphrases. Local/test accounts work against Atlas; recovery delivery, staff MFA/provisioning, guardian verification and security/operator review still gate a live release. Existing records are preserved; legacy OTP sessions are invalidated by requiring password-session method. Optional privately configured seed passwords add missing fixture credentials without resetting existing ones. No Docker or deployment-target change.

2026-09-23: Repository contained only the 36,017-byte master prompt. No ancestor or local AGENTS.md, application, or git metadata existed. Original preserved unchanged and copied to product-spec.md.

User override: no Docker. Source/CI on GitHub; DigitalOcean droplet uses systemd and Nginx; production database remains Atlas. No repository remote, deployment credentials or domain supplied. Do not provision/deploy publicly yet.

First milestone B journey: explicitly labelled free development trial, online, Mathematics classes 6–10, followed by tutor lesson evidence and mentor-reviewed family progress. No provider/payment success is simulated. Live pricing and paid tuition agreements remain blocked until operator configuration. Additional subjects/modes are rejected until supported.

Sample users have fictional aliases, no real phone delivery. Guardian declaration is a development-only workflow and never described as guardian verification. Production collection of minor data is disabled until the operator approves a verification procedure.

Local verification may run an actual downloaded MongoDB Community replica-set process with on-disk persistence; this is optional tooling, not a second backend or an application memory fallback. Atlas and local MongoDB use identical Go repositories/migrations/transactions.

Public dynamic tutor profiles are client rendered in this checkpoint. No SSR/SEO claim. Pre-rendering marketing content is a remaining milestone D task.
