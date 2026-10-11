# Parent and tutor learning spaces — 2026-10-11

The operator identified parents and tutors as GoCoaching's main customers and asked for an attractive, memorable and simple experience. Context identifies these as the workspaces after sign-in. Opened the existing parent desktop/mobile Home and tutor desktop/mobile Home before changes. Implementation is direct in this project, with GoCoaching's paper/ink/sage identity.

Both spaces use a lightweight decorative book-and-leaf SVG authored in `learning-motif.tsx`, cream navigation, sage selection, rounded Home focus surfaces and an actual-account welcome. Parent Home keeps the learner selector and tutor finder, with progress/classes/trial shortcuts and the actual next trial/feedback. Tutor Home puts its actual next lesson before separate real-count cards and daily tasks. No invented academic results, activity, revenue or bookings. The existing logo remains the brand mark; the SVG is decorative and hidden from assistive technology.

Mobile has reachable Home, Learners, Classes and Updates destinations. Existing route parameters supply learner context; the existing drawer still opens other destinations and restores focus on Escape. Safe-area/footer spacing and focus scroll clearance protect actions near the fixed navigation. Unapproved tutors retain the application redirect, no teaching navigation and server 403. English copy, actual sample labels, ownership/assignment checks, guardian/payment/approval gates, immutable prices and session/CSRF protections remain. No backend or dependency changes.

Twenty-two new captures were individually reviewed:

| Parent state                                 | Desktop                                    | Mobile                                    |
| -------------------------------------------- | ------------------------------------------ | ----------------------------------------- |
| First-use account                            | `parent/first-use-desktop.png`             | `parent/first-use-mobile.png`             |
| Long learner name                            | `parent/long-learner-home-desktop.png`     | `parent/long-learner-home-mobile.png`     |
| Selected learner Home                        | `parent/selected-learner-home-desktop.png` | `parent/selected-learner-home-mobile.png` |
| Actual confirmed trial on Home               | `parent/home-with-trial-desktop.png`       | `parent/home-with-trial-mobile.png`       |
| Learner-aware finder                         | `parent/finder-desktop.png`                | `parent/finder-mobile.png`                |
| Actual child report without invented results | `parent/learner-report-desktop.png`        | `parent/learner-report-mobile.png`        |
| Modal navigation                             | —                                          | `parent/drawer-mobile.png`                |
| Normal phone viewport                        | —                                          | `parent/home-viewport-mobile.png`         |

| Tutor state                          | Desktop                        | Mobile                           |
| ------------------------------------ | ------------------------------ | -------------------------------- |
| Honest Home without upcoming lessons | `tutor/home-desktop.png`       | `tutor/home-mobile.png`          |
| Persisted empty teaching date        | `tutor/empty-date-desktop.png` | `tutor/empty-date-mobile.png`    |
| Read failure with real retry         | `tutor/api-error-desktop.png`  | `tutor/api-error-mobile.png`     |
| Modal navigation                     | —                              | `tutor/mobile-menu.png`          |
| Normal phone viewport                | —                              | `tutor/home-viewport-mobile.png` |

Full-page screenshots place the fixed navigation at the original viewport boundary. The two normal phone-viewport captures show its actual position on screen. Report screenshots wait for the child's heading; the earlier desktop loading-skeleton capture was replaced after visual inspection. Exercised captured states pass axe and horizontal-overflow checks. Customer Homes also pass 360/768/1024px and CSS 200% reflow. The design flows track primary-page errors and verify mobile navigation selection, destinations and focus behavior.

Typecheck, lint, sixteen frontend unit tests, final production build, formatting and scoped whitespace checks pass. Eight distinct real isolated browser flows pass across sequential runs:

- New parent customer design: verified signup, first-use action, existing guardian relationship step, two owned learners, long name, URL/reload context, finder, actual empty report, fixed mobile destinations, drawer focus and Home reflow.
- Parent booking regression: approved subject/class matching, real trial request/acceptance, direct tutor feedback, saved regular checkout and hold expiry. It captures the actual confirmed trial on Home.
- Existing parent private navigation, keyboard/focus and responsive views.
- Extended tutor design flow: actual teaching date persistence, controlled read-only 503 followed by real retry, drawer and mobile destinations, Home reflow and phone preview.
- Unapproved tutor application/403 regression, including absence of the new teaching navigation.
- Full tutor workflow: retained real lesson/trial history, saved feedback corrections and subject planning, durable closed-loop Zoom, completed archives and old-tutor access revocation. The isolated recorded-history fixture is not a claim of a provider payment.
- Both mentor overview/design regressions, preserving the earlier staff layout and server restrictions.

The initial eight-test run passed five checks and failed three: a new first-use assertion skipped the guardian relationship step; a local Vite module fetch prevented a checkout page from rendering; and the tutor fixture inherited the Class 1–5 range changed by the parent-booking fixture. The corrected parent run passes both tests in 1.4 minutes. The tutor fixture now explicitly sets its intended Class 6–10 range instead of depending on a prior test.

A subsequent tutor archive accessibility scan exceeded the four-minute timeout on the 127-row history. Accessibility now checks the repeated history component once, retaining the full 127-record assertion, viewport capture and all correction/planning/Zoom/revocation assertions. Windows later reported about 314 MiB free committed memory and interrupted browser startup. The final ignored local runner uses `--disable-gpu` and `--renderer-process-limit=1`, with the separate development preview paused to free memory. A single-process experiment was unsuccessful and reverted. The final four parent/tutor checks pass together in 1.6 minutes. Default CI/browser launch settings and production code were not changed for these resource constraints.

One Vite module-fetch error was logged on the secondary browser used for tutor permission API checks in the final passing run. Those real API denials pass, but that secondary page's rendered workspace is not accepted. Primary-page error assertions pass. No full browser-suite, default-launch-configuration, live-provider, manual screen-reader or measured memorability acceptance is claimed.

Tests use isolated ports 5174/8081, closed-loop Zoom/SMTP and fresh retained local replica-set databases. Main Vite is restored at 5173 with a bounded Node heap; Go remains at 8080. Workspace and proxied readiness return 200; port 5000 remains free. No public deployment, production changes, live delivery/charges or retained-database deletion.
