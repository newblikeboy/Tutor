# Mentor workspace reference layout — 2026-10-11

The operator asked to extend the approved admin workspace layout approach to mentors. InterCon supplies organisation only; its desktop/mobile business-admin layout was inspected during the preceding admin task through local assets and explicitly fictional intercepted reads. No reference backend, private configuration or customer data was accessed. Existing GoCoaching mentor desktop/mobile views were opened before changes. GoCoaching keeps its own paper/ink/sage colours and brand assets.

The mentor sidebar groups Tutor approval, Learner support and Account & support. Overview uses separate actual-count cards, a unified application/interview queue and distinct next-interview/approval-guide cards. Tutor applications uses visible record headings and filters above compact scope/status rows. Mobile stacks panels, retains two-column counts and uses the existing accessible drawer. Application grid selectors require teaching-scope rows so academic-review records retain their layout. Zoom and fees remain alongside one another on desktop, followed by scope and Approve/Reject; mobile stacks those controls.

`tests/e2e/mentor-workspace-design.spec.ts` uses the actual isolated Go API/MongoDB application and fictional provisioned mentor. Two tutors sign up through mandatory email verification and submit real assigned applications. The test schedules a Zoom interview through the closed-loop provider worker, compares overview counts with the authorised response, checks keyboard tab activation and default selection, persists search/mode filters after reload, verifies disabled approval before prerequisites, opens the confirmed meeting controls and rejects mentor administrative suspension with 403. It releases the test interview through the real versioned cancellation API after the checks. Drawer groups/selection, Escape focus restoration, navigation dismissal and the Lesson reviews route are verified. Only the read-only 503 outage is intercepted; recovery uses the real API, and an empty queue does not invent an interview.

Fifteen new captures were individually inspected:

| State                                              | Desktop                      | Mobile                      |
| -------------------------------------------------- | ---------------------------- | --------------------------- |
| Overview with real assigned applications/interview | `overview-desktop.png`       | `overview-mobile.png`       |
| Honest empty application queue                     | `overview-empty-desktop.png` | `overview-empty-mobile.png` |
| Read failure and retry                             | `overview-error-desktop.png` | `overview-error-mobile.png` |
| Application filters and scope/status records       | `applications-desktop.png`   | `applications-mobile.png`   |
| Three approval sections and explicit decisions     | `approval-desktop.png`       | `approval-mobile.png`       |
| Confirmed Zoom and retained scheduling controls    | `interview-desktop.png`      | `interview-mobile.png`      |
| Actual empty lesson-review state                   | `lesson-reviews-desktop.png` | `lesson-reviews-mobile.png` |
| Grouped modal navigation                           | —                            | `drawer-mobile.png`         |

Each captured state passes axe and horizontal-overflow checks. Approval also reflows at 360/768/1024px; Lesson reviews passes CSS 200% reflow. The populated design flow checks page errors. Sample/setup labels stay visible. The old captures in the parent directory are retained as historical evidence.

Typecheck, lint, sixteen frontend unit tests, production build, formatting and scoped whitespace checks pass. Seven distinct browser checks pass across sequential runs: these two mentor checks, rejection with persisted tutor-visible reason, full Zoom/fee/approval/admin lifecycle, grouped/deferred admin queues, mentor interview aliases and the tutor dashboard date/retry/navigation regression.

The initial seven-check run passed six tests (1.9 minutes total) but the new Lesson reviews assertion expected the historical "Academic tracking" heading. The actual route correctly showed "Lesson reviews". Corrected that test-only expectation; the final two mentor checks pass in 42.5 seconds. No UI or permission was changed to satisfy the obsolete assertion.

Reproduce with a local replica-set `MONGODB_URI`, reduced-memory Node/Go settings and the local isolated Playwright config:

```powershell
npx playwright test -c .local/application-approval.config.ts tests/e2e/mentor-workspace-design.spec.ts tests/e2e/application-approval.spec.ts tests/e2e/staff.spec.ts tests/e2e/staff-tabs.spec.ts tests/e2e/tutor-workspace-design.spec.ts --grep 'mentor overview recovers|mentor workspace keeps|mentor rejects a pending|staff reviews a real|staff groups related|mentor interview links|tutor dashboard preserves' --trace off
npx playwright test -c .local/application-approval.config.ts tests/e2e/mentor-workspace-design.spec.ts --trace off
```

Isolated ports 5174/8081 and fresh retained local databases are used with closed-loop Zoom/SMTP adapters. Main API/Vite stay on 8080/5173; workspace and proxied readiness return 200, and port 5000 is free. No backend/dependency change, public deployment, live-provider action, production record/configuration change or retained-database deletion. No full-suite or screen-reader acceptance is claimed.
