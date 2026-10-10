# Signup email verification — 2026-10-10

Five individually reviewed Chromium captures use fictional adults and the actual local Go API/MongoDB replica set. The details screens explain mandatory verification. Code screens show a read-only email, focused six-digit input, resend cooldown and edit-details control. The mobile error capture shows server rejection without account creation. Captured code inputs are empty; no password, real recipient or operator secret is displayed.

| Capture | State |
| --- | --- |
| details-1440.png | Desktop adult signup details |
| details-390.png | Mobile adult signup details |
| code-1440.png | Desktop pending verification |
| code-390.png | Mobile pending verification |
| invalid-code-390.png | Mobile wrong-code feedback |

All six final focused browser checks passed:

```powershell
$env:MONGODB_URI = 'mongodb://127.0.0.1:27017/?replicaSet=rs0'
npx playwright test tests/e2e/accounts.spec.ts tests/e2e/login.spec.ts tests/e2e/signup-verification.spec.ts --grep 'parent with legacy|login errors|matching opens|signup remains|signup reports'
```

The initial broader run additionally passed nine separate tutor-signup, auth reflow/keyboard, email recovery/login/settings, localhost parent/tutor/staff sessions, Origin/CSRF, role-navigation and password-policy checks. Its six failing assertions were corrected before the focused rerun; see `docs/progress.md` for exact limits. Signup/error axe and overflow checks passed, and the dedicated pending/error/edit/completion flow had no page errors. No complete browser-suite, assistive-technology or actual Google inbox-delivery acceptance is claimed.

Test mail uses fictional credentials and a closed loopback SMTP endpoint; tests inspect encrypted queued codes in the exact isolated database. Production never exposes codes through the API. Sending a signup code creates no account or session; verification creates the email-verified account transactionally. All test databases are retained. No production deployment or real-recipient delivery test occurred.
