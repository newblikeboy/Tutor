# Current Product UX Audit

## Assessment

GoCoaching already supports a substantial education service: guardian-controlled learners, tutor discovery, trials, verified-payment tuition, recorded progress, tutor preparation, staff approval, support, finance and queued email. A wholesale visual rewrite would obscure the stronger parts of the product and introduce avoidable risk.

The highest-value improvements connect the existing tasks: find a tutor with truthful filters, preserve the selected learner/tutor through booking, bring the next regular class onto parent Home, and make operational actions safer. The paper/ink/sage identity and approved login design should remain.

No P0 blocker is established by this audit. That does not constitute a security or production-release certification.

The current findings comprise nine P1 items, eight P2 items and one P3 experiment. The recommended starting scope is public matching/copy/accessibility and deliberate staff status actions, followed by parent Home and booking continuity.

## Method and limits

Source inspection covers frontend routes/components, navigation, API discovery and current product/acceptance documentation. Browser inspection uses the current React frontend and actual Go API with a fresh local MongoDB replica-set database, fictional learners, assigned tutors, completed lessons, recorded feedback, active tuition, a resumable checkout and a support case. Roles include signed-out visitor, parent, approved tutor, applicant, administrator, mentor, support and finance. Screens are captured at 1440 and 390 CSS pixels with axe, API response/error recording and overflow checks. An explicitly intercepted 503 tests the report's failure presentation.

Evidence is in [the capture manifest](../visual-qa/product-audit-2026-10-10/evidence.json). Treat its actual captured routes as the browser coverage boundary. Source inspection is identified separately below. Small-control geometry is a review aid: an 18-pixel checkbox inside a large clickable label is not automatically an accessibility failure. Axe passing does not establish full WCAG compliance.

Fictional presentation records were inserted only into the exact isolated database. This audit does not claim that their payment state came from Razorpay, that Zoom hosting is licensed/configured, that SMTP messages reached an inbox, or that full historical handover/financial scenarios were re-exercised. Prior regression evidence remains in [the acceptance matrix](../acceptance-matrix.md), not a new result from this audit. Production traffic, support frequency, task completion times, conversion, low-end devices and assistive-technology testing are unavailable.

## Current capability inventory

| Role / area | Implemented | Partial experience or operational dependency | Proposed, not present |
| --- | --- | --- | --- |
| Visitor | Homepage, tutor listing/profile, search, parent/tutor signup, password and public-role email-code login, information pages | Preferred-time finder input is not an API filter; help/privacy content is minimal | Search context carried through profile/auth; useful support landing |
| Parent | Add/edit learner; learner/mode/multiple-subject/radius finder; request/manage trials; immediate tutor feedback; regular booking and resumable checkout; payments; one-way Updates; Help; Account | Home does not surface regular next-class activity; context is lost in several booking links; real gateway configuration still determines payment availability | Home activity summary and contextual booking handoff |
| Parent report | Overview, Subjects, Class history, Feedback; learner/date/subject/tutor filters; recorded attendance, homework, topics, optional tests, package balance and history | Dense mobile report; no invented results should fill missing records | Progressive filters and shorter overview with links to detail |
| Approved tutor | Combined trial/regular teaching Home; current learners and teaching brief; structured attendance/progress; subject planning; correction window; availability; trial/package archives; earnings; Updates; application | Meeting preparation requires real Zoom configuration and eligible tutor accounts; earnings breakdown is dense | More focused lesson work surface and payout summary |
| Applicant | Saved application, staged form, documents and approval status; teaching access gated | Long form and upload/provider states need broader populated scenario review | Save/resume clarity and contextual requirement guidance |
| Administrator | Applications/interviews, review/scope/staff prices, tutor follow-ups, mentor account provisioning, families, reports, history, billing/business taxes, inbox, email delivery review | Many destinations; Team currently focuses on mentors; account status actions lack an explicit reason/confirmation interaction | Grouped operations navigation; deliberate status action dialog |
| Mentor | Assigned assessment/follow-up/academic tools and tuition/support access as authorised | Historical review concepts need clear separation from new direct tutor feedback | Task queues distinguished by actual interview, follow-up or dispute purpose |
| Support / finance | Dedicated role routing, cases and billing respectively | Case and financial outcome coverage is limited by fictional records | Purpose-built first actions and clearer queue context |
| Email | Durable MongoDB outbox, separate authentication and update/reminder workers, branded utility messages, verification/recovery/code sign-in, 24-hour/1-hour reminders, metadata and guarded retry | SMTP acceptance differs from inbox delivery; per-instance concurrency does not remove provider-wide quota limits | Better operational placement of delivery monitoring |

## Findings

Priorities: **P0** blocks safe core operation; **P1** damages a core journey, truthfulness or consequential action; **P2** creates friction or reduces clarity; **P3** is an optional refinement requiring validation. Benefits below are hypotheses to measure, not demonstrated conversion gains.

### UX-01 — Parent Home misses the next regular class — P1

- **Problem:** With active tuition, Home still leads with discovery and the next trial; no next regular lesson or checkout continuation appears.
- **Impact:** A returning parent must open Regular classes and find the right package before preparing for today's lesson or resuming payment.
- **Cause:** Parent overview renders learner selection, discovery, trial activity and feedback, while regular tuition is a separate route.
- **Solution:** Retain Home's Find a tutor button. Add a learner-scoped next activity card using authorised trial/regular records, a separate checkout-resume notice when valid, and the latest recorded practice guidance. Hide irrelevant sections for first use.
- **Expected benefit:** Less navigation to the next lesson or unfinished checkout.
- **Evidence:** `routes/parent.tsx`; screenshots `parent-home` and `parent-package`. Tutor Home already combines trial and regular activity.

### UX-02 — Public quick-finder criteria misrepresent matching — P1

- **Problem:** Public quick discovery includes a preferred time in its link and result summary, but the tutor API query does not filter by it. Class-group buttons submit their upper boundary as an exact class (6–8 submits 8), and the subject control is not fixed to All Subjects for the primary group.
- **Impact:** Parents can reasonably interpret results as available at the requested time. A class 6 learner can miss a tutor approved only through class 7 because the search asks for class 8 instead.
- **Cause:** `QuickTutorFinder` serialises `time` and class presets 5/8/10/12; public search does not include time in the API query; the API tutor filter treats class as exact and checks approved scope, subjects, mode and geography.
- **Solution:** Ask for the exact class and apply the existing class-appropriate subject rule. Remove the unused time question from discovery, then select actual dates/times in the existing availability-backed booking step. Add date/time discovery only with an explicit server contract and overlap/leave checks.
- **Expected benefit:** Honest matching criteria and one fewer premature question.
- **Evidence:** `routes/public-search.tsx`; `internal/app/http.go` tutor handler; `public-finder` / `public-results` captures. Public goal text is automatically generated from mode/time and passed in the finder link without becoming a matching constraint; it is not a separate visible goal input. Do not reintroduce a separate learning-needs stage. The class-boundary exclusion is source-confirmed, not a new populated class-6 browser scenario.

### UX-03 — Search and booking handoffs discard context — P1

- **Problem:** Tutor cards link to a profile without the search; the profile's Back link resets to `/tutors?searched=1`; its CTA carries only tutor ID. Completed-trial Book tutor links to the general `/tuition` page.
- **Impact:** Users reselect information or choose from a general booking list after deciding on one tutor for one child.
- **Cause:** Hardcoded destination links rather than an explicit journey context.
- **Solution:** Preserve safe public search filters and return path. After sign-in, carry authorised learner ID, trial ID, tutor ID and eligible mode/subjects into the next step. The server still validates every reference. Clear stale scope explicitly rather than silently choosing another learner.
- **Expected benefit:** A continuous discovery → trial → regular-booking journey.
- **Evidence:** `components/tutor-card.tsx`, `routes/public-tutor.tsx`, `components/trial-card.tsx`, `routes/tuition.tsx`.

### UX-04 — “Available teacher” exceeds what the result verifies — P1

- **Problem:** A tutor card's availability wording is not based on a chosen date/time and conflict-free slots.
- **Impact:** Approval can be mistaken for immediate availability.
- **Cause:** The visible badge reflects listing eligibility, while scheduling is checked later.
- **Solution:** Use an accurate approval label and show actual availability only after a successful availability read for the selected criteria. Keep missing staff prices explicit.
- **Expected benefit:** Better expectation setting before requesting a trial.
- **Evidence:** `components/tutor-card.tsx`; public tutor filtering in `http.go`.

### UX-05 — Staff account actions are immediate and use a canned reason — P1

- **Problem:** Mentor suspension/deactivation buttons call the mutation directly; the submitted reason is “Founder changed mentor account status from the admin workspace.”
- **Impact:** A consequential click has weak intent checking and an uninformative audit reason.
- **Cause:** `MentorAccounts` binds buttons directly to its action mutation.
- **Solution:** Require a short dialog naming the account, action and consequences, with an operator-authored reason. Preserve role checks, mutation locking, version/conflict handling and server audit trails. Do not test this against live staff during the audit.
- **Expected benefit:** Fewer accidental status changes and more useful operational history.
- **Evidence:** `routes/staff.tsx` (`MentorAccounts`), source-confirmed; no suspension/deactivation was executed.

### UX-06 — Public/profile and history accessibility defects — P1

- **Problem:** Tutor profile has nested/duplicate main landmarks; mobile public results and the empty staff Decision history skip a heading level.
- **Impact:** Assistive-technology users receive a less reliable page structure.
- **Cause:** The public shell already wraps content in main; profile adds another main. Responsive results expose an inconsistent heading outline.
- **Solution:** Keep one main per page, use section/article for inner content, and correct heading hierarchy without changing appearance. Recheck desktop/mobile and keyboard navigation.
- **Expected benefit:** More predictable landmarks and headings.
- **Evidence:** Axe reports `landmark-main-is-top-level`, `landmark-no-duplicate-main`, `landmark-unique` on `public-profile`; `heading-order` on the 390-pixel `public-results` capture and both `admin-history` viewports. Exact nodes are in the manifest.

### UX-07 — Public support and privacy destinations are too thin — P1

- **Problem:** Public Support visibly renders the untranslated key `supportTitle`; Privacy renders `privacyTitle` and `privacyBody`. Support ends with Find a tutor rather than a direct help path. Privacy does not present a usable operational policy.
- **Impact:** Visitors cannot readily resolve access/booking questions or understand the platform's handling of learner information.
- **Cause:** `Info` requests missing top-level translation keys and uses one general CTA for every non-404 page. Similarly named nested workspace keys do not satisfy these requests.
- **Solution:** Fix the missing English copy, give Support a concise signed-in case route, support email and guidance for account access. Have the operator supply/review actual privacy, payment and cancellation information; link existing saved agreement terms where appropriate. Do not invent guarantees, legal language or refund policy.
- **Expected benefit:** Usable help and accurate trust information.
- **Evidence:** `routes/public-info.tsx`, `public-support`, `public-privacy`.

### UX-08 — Online discovery exposes location work — P2

- **Problem:** Private finder shows location controls for online searches and a disabled distance field. Its saved-location controls mainly use browser detection. Header location-save failures are announced only through hidden text, and the displayed label can still use the attempted save value.
- **Impact:** A task that does not need geography includes extra visual decisions; permission denial leaves a less obvious Home Tuition recovery path. A sighted parent can mistake an attempted location for the saved search location after a failed save.
- **Cause:** Location controls are rendered independently of mode; existing typed locality controls elsewhere are not an equivalent saved, geocoded search location.
- **Solution:** Show address/radius together only for Home Tuition. Provide a deliberate manual search/address path if a supported geocoder can resolve valid coordinates; never fabricate coordinates from a typed label. Show detection/save errors visibly.
- **Expected benefit:** A shorter online finder and recoverable location setup.
- **Evidence:** `routes/match.tsx`, `components/parent-location-control.tsx`, `components/location-search.tsx`, `components/workspace-shell.tsx` (`save.variables` label and `sr-only` error), `routes/account.tsx`, `parent-finder` / `parent-results`. Save-failure behaviour is source-confirmed, not an exercised live mutation.

### UX-09 — Family context is inconsistent between sections — P2

- **Problem:** Workspace learner selection can survive some sidebar transitions but Regular classes and Payments use general links. The class overview has no equivalent learner-aware entry context.
- **Impact:** Parents with multiple children must identify whose package is relevant again.
- **Cause:** Mixed URL-state conventions across workspace and tuition routes.
- **Solution:** Use a learner filter in class views with an explicit All learners option; preserve a specific learner from a report/booking link. Keep family-wide payment totals clearly labelled rather than silently narrowing financial history.
- **Expected benefit:** Fewer context mistakes in multi-child accounts.
- **Evidence:** `components/workspace-shell.tsx`, `routes/tuition.tsx`, `lib/workspace.ts`.

### UX-10 — Upcoming lessons compete with completed history — P2

- **Problem:** Package classes render in ascending chronological order; old completed lessons precede the next scheduled class. Parent report Overview repeats substantial detail across feedback, focus and journey sections.
- **Impact:** The immediate task is harder to scan as history grows, especially on mobile.
- **Cause:** One continuous class list and an expansive overview rather than task-based grouping.
- **Solution:** Lead package detail with the next class and separate Upcoming / Class history. Keep all history accessible and preserve `?class=` deep links. Make report Overview concise; keep Subjects, Class history and Feedback authoritative for detail.
- **Expected benefit:** Faster lesson preparation and clearer report reading.
- **Evidence:** `routes/tuition.tsx`, `components/learner-progress.tsx`; `parent-package`, `parent-report` captures. Length alone is not an accessibility failure.

### UX-11 — Search cards repeat every package and price — P2

- **Problem:** Search results present several fee plans even when a parent has chosen a teaching mode.
- **Impact:** Cards become tall and pricing comparisons require more reading.
- **Cause:** The general fee component is reused without discovery context.
- **Solution:** Lead with selected-mode pricing and selected-subject total; reveal other plans on the profile or a secondary disclosure. State Weekly: 6 classes / Monthly: 24 classes, with dates set by availability and no calendar deadline.
- **Expected benefit:** More comparable results with truthful price scope.
- **Evidence:** `components/tutor-card.tsx`, `components/tutor-fees.tsx`, `parent-results` / `public-results`.

### UX-12 — Tutor earnings expose too much accounting detail initially — P2

- **Problem:** Tutor financial cards show several gross/tax/platform/gateway components alongside payout values.
- **Impact:** The tutor's immediate questions—what is payable, paid and pending—compete with explanatory accounting detail.
- **Cause:** Shared financial presentation favours comprehensive breakdowns over role-specific hierarchy.
- **Solution:** Lead with actual net earnings/payout status and payment history. Put the saved calculation breakdown behind a labelled disclosure. Preserve financial policy, rounding, release gates and immutable records.
- **Expected benefit:** Easier payout understanding without changing money rules.
- **Evidence:** `routes/finance.tsx` (`AmountGrid`); source-confirmed, populated real payout comprehension not tested.

### UX-13 — Staff navigation mixes tasks, entities and settings — P2

- **Problem:** Application/network work, mentor accounts, families, reports, history, billing, taxes, Updates, Help and Account occupy a broad sidebar. Emails live inside Account.
- **Impact:** Operations users need to remember where cross-cutting work belongs; a crowded mobile drawer magnifies that cost.
- **Cause:** Features accumulated as peer destinations without a task hierarchy.
- **Solution:** Group existing routes into Operations, Finance and Administration. Retain the accurate visible Mentor logins label; the internal `team` view key is not a general staff-management capability. Expose email delivery monitoring as an operational shortcut while retaining admin-only permission. Do not grant roles new authority through navigation.
- **Expected benefit:** A more learnable workspace for daily staff tasks.
- **Evidence:** `lib/workspace.ts`, `components/workspace-shell.tsx`, `routes/staff.tsx`, `routes/account.tsx`.

### UX-14 — Staff code-sign-in expectations need a clearer boundary — P2

- **Problem:** Users may try the public email-code route for a staff account and interpret the intentionally generic result as broken delivery.
- **Impact:** Avoidable confusion and support requests.
- **Cause:** Public-role email codes coexist with password-only staff access.
- **Solution:** Add static, account-independent wording to code sign-in: “For parent and tutor accounts. Staff use password sign-in.” Keep generic server responses and anti-enumeration protections.
- **Expected benefit:** Correct expectations without disclosing account existence or enabling staff OTP.
- **Evidence:** Current auth/email architecture and login source; no real address entered during audit.

### UX-15 — Growth performance needs a measured baseline — P2

- **Problem:** Complete tutor matching/report histories and periodic refreshes can become expensive as records grow; production behaviour has not been measured.
- **Impact:** Mobile performance and API costs may degrade without a visible threshold.
- **Cause:** Complete collection reads/client filtering in some flows and full report payloads; lack of a task-level performance baseline.
- **Solution:** Measure route transfer, API latency, response bytes, request cadence and long-history interaction first. If warranted, add server-side complete multi-subject filtering and authorised cursor pagination/summary endpoints. Never truncate history silently or treat the first page as the complete result set.
- **Expected benefit:** Evidence-based scaling work while preserving correctness.
- **Evidence:** Private finder data fetching, report queries and workspace refresh intervals; source risk, not a confirmed production slowdown. Lazy route loading and inactive-panel query gating already help.

### UX-16 — Optional mobile navigation experiment — P3

- **Problem:** Frequent destinations rely on the mobile drawer.
- **Impact:** It may add navigation effort, but an always-visible bar would also consume lesson/form space.
- **Cause:** Shared drawer navigation is used across roles.
- **Solution:** Test a small parent/tutor destination bar only after the main journey fixes. Keep Find a tutor on Home; retain accessible Menu for secondary tasks. Do not prescribe a staff bottom bar.
- **Expected benefit:** A possible reduction in repeated navigation, subject to user testing.
- **Evidence:** Design hypothesis; current drawer and sidebar are functioning patterns, not established defects.

### UX-17 — Public multi-subject matching means any, not all — P1

- **Problem:** The public tutor handler uses MongoDB `$in` for requested subjects and the public results only recheck mode. A tutor matching one requested subject can appear despite lacking another.
- **Impact:** Parents can shortlist a tutor who cannot teach the complete selected set. This also differs from the private finder's complete-subject intent.
- **Cause:** OR semantics in the shared discovery query without a complete-subject eligibility check in public results.
- **Solution:** Define and enforce all-selected-subject matching on the server with class-appropriate All Subjects handling. Preserve pagination completeness and the private flow; do not claim a filtered first page proves no eligible tutor exists.
- **Expected benefit:** Search results align with the parent's teaching request.
- **Evidence:** `internal/app/http.go` tutor query; `routes/public-search.tsx` results filter. Follow-up `public-multiple-subjects` requests Mathematics plus English for class 8 and displays Meera, whose approved subjects are Mathematics/Science, as a match. This mismatch is confirmed in the actual local API/browser flow.

### UX-18 — Public copy describes the superseded review/needs journey — P1

- **Problem:** Home advertises ongoing academic reviews; public tutor/search copy asks parents to share learning needs/requirements for academic-team review before teaching. Mentor Lesson reviews also labels its ordinary direct-feedback list Reviewed learning progress.
- **Impact:** The public promise conflicts with the updated direct tutor-feedback and learner-first booking journey.
- **Cause:** Legacy marketing/localisation copy survived the parent/tutor workflow changes.
- **Solution:** Explain actual tutor observations, next practice and staff approval of tutor scope. Describe select learner → search → trial → direct feedback → verified paid booking. Remove suggestions of a separate needs step or routine mentor approval of submitted notes; label historical/dispute review separately from ordinary direct feedback.
- **Expected benefit:** The public explanation matches the service parents experience after login.
- **Evidence:** `locales/home.ts` hero/pillar copy; `locales/index.ts` `step3Body` and tutor/search guidance; public Home/results/profile and `mentor-review` screenshots.

## Source entry points

Frontend references above are relative to `apps/web/src`; backend references are relative to `apps/api`. Useful direct links:

- [Parent overview](../../apps/web/src/routes/parent.tsx), [tutor workspace](../../apps/web/src/routes/tutor.tsx), [private finder](../../apps/web/src/routes/match.tsx).
- [Public search](../../apps/web/src/routes/public-search.tsx), [tutor profile](../../apps/web/src/routes/public-tutor.tsx), [public information](../../apps/web/src/routes/public-info.tsx), [API discovery](../../apps/api/internal/app/http.go).
- [Tutor card](../../apps/web/src/components/tutor-card.tsx), [trial card](../../apps/web/src/components/trial-card.tsx), [staff-set fee display](../../apps/web/src/components/tutor-fees.tsx).
- [Tuition](../../apps/web/src/routes/tuition.tsx), [learner report](../../apps/web/src/components/learner-progress.tsx), [finance](../../apps/web/src/routes/finance.tsx).
- [Staff views/actions](../../apps/web/src/routes/staff.tsx), [workspace shell](../../apps/web/src/components/workspace-shell.tsx), [navigation](../../apps/web/src/lib/workspace.ts), [Account/email monitoring](../../apps/web/src/routes/account.tsx).
- [Home copy](../../apps/web/src/locales/home.ts), [shared English copy](../../apps/web/src/locales/index.ts).

## What to retain

Keep approved auth styling, the current brand, familiar account shell, first-use Add learner action, direct tutor feedback, report tabs and missing-data explanations, date/availability selection, honest payment gates, scoped tutor access, application review/history separation, role-specific routing, one-way Updates and queued utility email. Several previously audited tutor/report gaps are already resolved; do not treat their historical entries as current defects.

## Evidence to establish before implementation claims

Use realistic multi-child and long-history fixtures; test Home Tuition with saved coordinates/permission denial, class 4 All Subjects, class 8 multi-subject prices, 6/24-class schedules spanning calendar boundaries, expired holds, declined payment, provider-verification delay, no eligible tutor, leave/conflicts, tutor suspension, completed archives and handover. Test keyboard-only, screen-reader and zoom/reflow paths. Collect operator-reviewed content and genuine task research. No estimated improvement should be presented as measured customer evidence.
