# Tutor workspace visual acceptance

The final real Go/local MongoDB browser workflow captures each teaching view at 1440px desktop and 390px mobile. Each capture was individually inspected for readable copy, wrapping, hierarchy, forms and task controls. Automated checks found no axe violations, horizontal overflow or page errors.

| Capture prefix | Checked behavior |
| --- | --- |
| `home` | Regular/trial teaching schedule, next lesson, counts, confirmed-booking alerts and recording tasks |
| `trial-feedback` | Completed trial evidence/practice/feedback remains visible without mentor approval |
| `learner-overview` | Current teaching brief, actual scoped progress, package balance and earlier history |
| `learner-history` | All 127 actual fixture class rows retained; viewport capture avoids an unreadable full-history image |
| `subject-plan` | Future booked-subject selection and class focus, without changing saved fees or count |
| `staff-fees` | All staff-confirmed Online, six-class weekly and twenty-four-class monthly Home offerings |
| `onboarding` | Existing unapproved-tutor application routing, retained signup name, hidden teaching navigation and server-denied teaching access |

`tests/e2e/tutor-workspace.spec.ts` also persists trial corrections, planned subjects and completed-package progress corrections through the Go API; prepares a meeting using a loopback Zoom provider and checks the server-issued join link; exercises outage recovery and former-tutor access revocation. The related `tests/e2e/learner-progress.spec.ts` regression passed in the same final run. Its two updated tutor-record captures were inspected in `../learner-progress/`.

Recorded-history fixtures are fictional and restricted to the exact isolated test database. They do not demonstrate a real paid booking. API billing tests use provider doubles to validate verified capture and alert deduplication. Live Razorpay checkout, real Zoom hosting/licensing and production deployment were not performed. Retained test databases were not deleted. See `../../tutor-workspace.md` and the latest progress checkpoint.

The separate `tests/e2e/tutor-onboarding.spec.ts` real-signup regression passed. All fourteen tutor captures and the two updated parent-suite tutor-record captures were inspected individually. The complete browser suite was not rerun.
