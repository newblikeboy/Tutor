# Admin workspace reference redesign — 2026-10-11

The operator selected the **admin workspace/dashboard** as the target and asked to use InterCon's design method without its colours. Inspected `C:\Users\Mobi\OneDrive\Desktop\InterCon\src\views\admin-portal.html`, its active `Public/style/admin-data.css`, `Public/js/admin-portal.js` and admin documentation. The older `admin-portal.css` does not style this dashboard. Rendered reference desktop/mobile/records screens using local files and intercepted, explicitly fictional API responses in `.local/intercon-reference/`; no reference backend, private configuration, customer API or reference-project modification. Opened GoCoaching's existing admin desktop/mobile captures before implementing the layout.

GoCoaching keeps its existing paper, ink and sage palette and its own brand assets. The admin-only styles provide a white grouped sidebar, separate actual count cards, a queue alongside network operations, compact tutor/scope/status columns, filters above records, readable loaded counts and mobile report cards. Mobile retains the existing modal drawer, Escape dismissal and focus restoration. All counts come from authorised Go/MongoDB responses; shortcuts use existing routes. Default tabs, deferred reads, URL filters, sample/setup labels, profile settings and server approval/payment/assignment/session/CSRF gates remain. No backend or dependency change, new chart or invented operational metric.

`tests/e2e/admin-workspace-design.spec.ts` exercises the actual seeded local admin account: compares every overview count with the authorised API, follows a count card into its filtered queue, opens mentor/family/report routes, persists and clears tutor filters, checks Account, follows Business & taxes from the mobile drawer, restores focus after Escape and recovers from an intercepted read-only 503. It checks page errors, axe, horizontal overflow, additional 360/768/1024px widths and CSS 200% reflow. Success responses and state changes use the real isolated Go/MongoDB application; only the error response is intercepted.

Seventeen new screenshots are individually inspected:

| State                                            | Desktop                    | Mobile                    |
| ------------------------------------------------ | -------------------------- | ------------------------- |
| Overview and honest empty interviews             | `overview-1440.png`        | `overview-390.png`        |
| Submitted-application filter and empty queue     | `applications-1440.png`    | `applications-390.png`    |
| Mentor provisioning and existing access controls | `mentors-1440.png`         | `mentors-390.png`         |
| Families and search                              | `families-1440.png`        | `families-390.png`        |
| Actual founder report                            | `report-1440.png`          | `report-390.png`          |
| Filtered tutor rows and retained sample labels   | `tutors-filtered-1440.png` | `tutors-filtered-390.png` |
| Account regression with grouped navigation       | `account-1440.png`         | `account-390.png`         |
| Overview read failure and retry                  | `overview-error-1440.png`  | `overview-error-390.png`  |
| Modal navigation                                 | —                          | `drawer-390.png`          |

Review tightened mobile panel-heading alignment, report-card reflow, status spacing and clear-filter placement. Teaching-mode filtering now says “All teaching modes”; the reviewer option says “All applications” to fit its control.

Typecheck, lint, sixteen frontend unit tests, production build and formatting checks pass. Six combined isolated browser checks pass (1.1 minutes): this admin design flow, admin business persistence and finance/tutor/parent boundaries, grouped/deferred overview queues, applicant history/files and admin read-only review, finance navigation, and mentor interview aliases. Existing regression captures are refreshed under `docs/visual-qa/english-only/staff-tabs/` and `docs/visual-qa/finance/`; representative admin review/documents and business/revenue captures were also opened.

The initial combined run passed five checks but an older applicant-tab test timed out waiting for the internal-note form removed by the earlier mentor-only approval instruction. Updated that obsolete expectation to verify all three read-only approval sections, absent approval/rejection/internal-note controls, retained admin account operations and deferred history/files reads. The corrected six-check run passes. No academic form or permission was reintroduced to satisfy the old test.

The final two-check admin/applicant run also passes (42.2 seconds), after the teaching-mode/reviewer copy refinement and final production build. Final queue captures show the corrected options and actual saved subject/class/mode labels.

Checks use fresh retained local replica-set databases and closed-loop test adapters at isolated ports 5174/8081. Main API/Vite stay on 8080/5173; dashboard and proxied readiness return 200, and port 5000 remains free. This task makes no public deployment, live-provider, full browser-suite or screen-reader acceptance claim.
