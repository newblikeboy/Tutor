# Visual review evidence

## 2026-09-24: compact tutor application

See [field audit and captures](application-compact/README.md). Six tabs and a step-position bar replace the internal rail; the wider form has compact groups, clearer English/Hindi labels and visible optional-file/character-limit guidance. Final inspected views include Education EN desktop/mobile and HI mobile; Subjects EN desktop; Time/location EN desktop; new applicant EN desktop/HI mobile; photo HI mobile; and saved education documents EN desktop/HI mobile. Earlier inspection also covered Teaching approach and final Review on desktop. Mobile number-circle width and time-row spacing were corrected after inspection. No pixel baseline was changed.

The final seven-case run passed 6/7; the upload case stopped at its old exact Hindi label. Its corrected rerun passed 1/1 (59.9s), giving seven passing selected cases. Application flow, draft conflicts, 422 recovery, upload quarantine, staff review, route gates, keyboard tabs, sampled axe, five-width bilingual reflow and 200% CSS text reflow were exercised against real Go/local Mongo. Wider browser/Go suites, native screen readers and other browsers were not rerun.

## Staff-confirmed fees — 2026-09-24

Individually inspected eight final captures under `staff-fees/`: staff fee fields (English desktop/Hindi mobile), a parent viewing the saved Online hourly price (English desktop/Hindi mobile), tutor Teaching hours with a read-only fee (English desktop/Hindi mobile), and the six-step application with its existing photo upload (English desktop/Hindi mobile). Staff fields distinguish hourly, weekly and monthly prices; Home plan class count/duration fit on mobile. Parent pricing is separate from the existing free development trial. The application captures use the bottom scroll position to keep sticky actions from obscuring fields in full-page images.

The selected Chromium run passed 10/10 in 9.3m against actual Go and isolated local MongoDB: full application, stale draft, corrected final submission, recorded demo, photo/resume/education uploads, staff Zoom/approval/lifecycle and stale decisions, payment boundary/conversations, tuition/continuity and empty/error states. Sampled axe and overflow assertions pass. The later changed-price reconfirmation case is recorded separately in progress.md. No pixel baseline was promoted; unrelated regenerated captures are restored from the pre-task backup. Home booking, live payments/providers, native screen readers and other browsers are outside this verification.

## Application photo and document uploads — 2026-09-24

Before changes, `application-documents/education-en-desktop.png` and `education-hi-mobile.png` were inspected. New evidence is under `application-uploads/`: About you with a saved passport-size photo, Education with saved resume/degree/marksheet files, submitted private files, and the staff Documents tab. Individually inspected About you English desktop/Hindi mobile, Education English desktop/Hindi mobile and staff desktop. Final About you images were reopened after capturing at the bottom of the form, keeping the existing sticky actions clear of the upload evidence in full-page captures. Filenames wrap and the photo's JPG/PNG limit is concise and bilingual; the existing paper/ink/sage layout is unchanged.

The final 3-case Chromium run passed the full seven-step flow, recorded demo and all upload provisions against actual Go/local MongoDB. Checks include persistence after refresh/submission, invalid photo rejection, current private-access/scan gates, staff review, five viewport widths and sampled Hindi axe. Build/strict TypeScript/lint/3 component tests and focused Go race/vet checks pass. Captures are review evidence, not promoted pixel baselines; unrelated regenerated application captures were restored. No actual Cloudinary upload or configured scanner was exercised in this browser run. Cross-browser/native-screen-reader checks remain unverified.

## Landing editorial design — 2026-09-24

Before editing, `.local/landing-design-before/home-en-desktop.png` and `home-en-mobile.png` were opened and inspected. Final review captures are under `landing-editorial/`. Individually inspected views include the English desktop/mobile and Hindi desktop/mobile first view, the English full mobile page, `home-process.png`, `home-tutors.png`, `home-story.png`, `home-faq.png`, `home-closing.png` and `high-contrast.png`. The taller hero keeps both people visible; responsive image hints were corrected to load sufficient pixels for the cover crop. The photographic asset itself is unchanged and retains its AI label. Headlines, ornamental glass forms, step illustrations, layered record and compact FAQ were reviewed for alignment, whitespace and mobile wrapping.

Three final captures (`home-en-desktop.png`, `home-en-mobile.png`, `home-hi-mobile.png`) were individually reopened, then manually copied to the corresponding existing Windows baselines. The pixel suite passed all 6 public views, including the 3 unchanged profile/empty views. All 4 existing account pixel baselines passed unchanged. Three homepage functional cases pass five-width English/Hindi reflow, axe, keyboard/FAQ/menu/skip, 200% zoom, discovery and matching links, loading/error recovery, section navigation, reduced motion and high contrast. Total: 13 selected cases. No baseline update-all command, fabricated public data or new screenshot fixtures were used. These checks do not constitute a cross-browser or native screen-reader audit.

## Tutor application documents — 2026-09-24

The previous `product-ux/application/step-2-en-desktop.png` was inspected before changes. `application-documents/education-en-desktop.png`, `education-hi-mobile.png` and `staff-documents-en-desktop.png` show the résumé and multiple education uploads in the existing form and staff Documents tab. Desktop and 390px Hindi layouts were individually reviewed; filenames wrap, controls remain inside the cards, and the existing paper/ink/sage palette is retained. The file browser flow checks saved IDs after refresh, no horizontal overflow and no axe violations, then verifies staff can see all three files. These are review captures, not automatically replaced screenshot baselines. Provider verification is separate: the browser uses isolated disk storage, while synthetic files exercised the actual private Cloudinary adapter.

## Parent and tutor task simplicity — 2026-09-24

`product-ux/` contains this checkpoint's account, application, teaching-hours, class-calendar, message, file and tutor-change captures. The private shell keeps its paper/ink/sage palette and reflective edges. Desktop/mobile application, account and availability views were inspected before changes in `.local/product-ux-before/`. After changes, individually inspected captures include:

- `product-ux/screens/tutor-meera-account-1440.png`: readable form width and a single account task.
- `product-ux/screens/tutor-meera-availability-390.png` and `product-ux/tuition-availability-hi-mobile.png`: native date picker, compact headings and stacked mobile controls.
- `product-ux/application/step-1-en-mobile.png` and `step-4-en-desktop.png`: one section navigator per viewport, short labels and reachable save controls.
- `product-ux/tuition-calendar-en-desktop.png` and `tuition-calendar-hi-mobile.png`: one class section at a time, readable schedule and keyboard-accessible tabs.
- `product-ux/conversation-en-desktop.png`: messages retain the family/team context without repeated introductory paragraphs.
- `product-ux/screens/parent-b-workspace-390.png`: one parent next action and a compact page heading.
- `product-ux/account-final-hi-mobile.png`, `product-ux/screens/tutor-meera-workspace-390.png` and `product-ux/conversation-hi-mobile.png`: final compact account heading, removed duplicate teaching-hours action, and message spacing. Five final home/message/account captures passed reflow and axe checks after the last CSS adjustment.

Automated checks cover English/Hindi axe, 360/390/768/1024/1440 reflow, keyboard tabs and URL reloads, persisted dates off, retained unfinished account fields/messages, and actual Go/Mongo workflows. Exact results and limitations are in the latest progress checkpoint. No pixel baselines were automatically replaced, and no real family/learner records are used in these captures.

## Parent flow, 2026-09-24

Inspected the existing parent desktop/mobile screens before editing, then reviewed the new English desktop/Hindi mobile welcome, English desktop/mobile next trial, English cancelled-trial tab, English mobile request review, Hindi mobile learning-needs form and long-learner-name mobile capture. Final published-feedback and multiple-learner desktop captures were also inspected; the cancelled-trial and mobile-review captures were reopened after the last polish. Fictional-account captures are under `parent-ux/`; selected earlier journeys write under its `journey/` and `regression/` folders. The change reduces repeated copy and simultaneous panels, with the existing crystal paper/ink/sage finish.

Checks include real Go/Mongo draft/request/trial persistence, multiple-learner selection, consent, Hindi adult-self setup, URL reload/Back, cancellation, review visibility, private navigation and access failures. English/Hindi axe, drawer keyboard handling, five-width reflow and CSS 200% checks are included. Readiness waits were added after an initial capture caught a loading frame. Final test results are in progress.md. Existing Windows baselines are left for separate individual promotion; cross-browser and native screen-reader/zoom checks are not claimed.

## Staff navigation and tabs, 2026-09-24

Before editing, the existing staff overview English desktop and tutor-network Hindi mobile captures were inspected. New task captures are under `staff-tabs/`, with the staff lifecycle under `staff-tabs/lifecycle/`. Individually inspected: overview English desktop, application English desktop, review English desktop, follow-ups Hindi mobile, documents Hindi mobile, payment follow-ups English desktop/Hindi mobile, and lifecycle interview English desktop, assessment Hindi mobile and approval English desktop. These use fictional accounts on the isolated local Mongo replica set and the test-only Zoom HTTP fixture.

Checks cover deferred data requests, URL selection/reload/Back, keyboard selection, preserved unfinished input, staff lifecycle and role boundaries. Sampled axe/overflow and 360/390/768/1024/1440-width/CSS 200% reflow checks are included. A missing heading level in an empty queue was corrected. Existing Windows pixel baselines were not replaced; no cross-browser, native-zoom, screen-reader or measured latency improvement is claimed. Final counts are in progress.md.

## Recruitment integrations, 2026-09-24

New isolated-record captures are under `recruitment/`. Individually inspected: applicant English desktop, applicant Hindi mobile, submitted English mobile, staff interview English desktop, staff assessment Hindi mobile and approved English desktop. These show the reduced applicant navigation, four stages, seven-section form and confirmed Zoom/assessment states. The selected browser flows passed 3/3 with sampled axe and overflow checks. The initial staff test found and led to a fix for unfinished scorecards resetting on asynchronous provider confirmation. Final bilingual Zoom-history labels were checked separately after the successful lifecycle run; `staff/zoom-history-en.png` and `staff/zoom-history-hi.png` were individually inspected. No existing Windows pixel baseline was replaced; live provider delivery, native screen readers and other browsers are not claimed.

The `application/` directory contains the original application captures, all seven new English desktop steps, English mobile About/Areas/Availability/Review, Hindi mobile Availability/Review, and the staff view of the saved application. Captures use explicitly fictional isolated database records. Application answers and contact fields do not appear on public tutor profiles.

## Staff operations, 2026-09-23

New captures are under `staff/`. Individually opened: `overview-en-1440.png`, `overview-hi-390.png`, `network-en-1440.png`, `network-hi-390.png`, `interview-en-desktop.png`, `applicant-interview-en-desktop.png`, `assessment-hi-mobile.png`, `approved-en-desktop.png`, `terminated-en-desktop.png`, `followup-en-desktop.png`. Interview, approved/terminated and resolved follow-up views were reopened after the final successful browser run. Application-list images were captured and scanned but are not additionally claimed as visual review. The shared queue heading order was corrected; raw applicant audit identifiers were replaced with readable text; history wrapping, the mobile applicant header and action/history order were refined. Completed interviews now have their own accurate label.

Captures used actual Go endpoints and a real isolated MongoDB replica set with fictional records. Axe/overflow checks passed on final workflow states. The selected role-workspace regression also covers EN/HI at 360/390/768/1024/1440, keyboard navigation, mobile drawer focus and CSS 200% reflow. Initial failures and the final two successful complete-journey reruns are documented in progress.md. Root-level screenshots were restored from pre-task copies; no Windows pixel baseline was replaced or newly claimed passed. Native screen readers, additional browsers/hardware and lab performance remain unverified.

## Sign-in account identity, 2026-09-23

Current captures are in `login-roles/`. Before changing the layout, the previous English desktop and Hindi mobile login images in `polish/` were opened. Afterward, `parent-en-1440.png`, `tutor-en-1440.png`, `staff-en-1440.png`, `parent-hi-390.png`, `tutor-hi-390.png` and `staff-hi-390.png` were each opened. All six passed sampled axe, page-error and 360/390/768/1024/1440 width checks. The switcher is prominent, its selected state includes a border and accessible current-page indication, and the form heading names the account type. Staff no longer depends on a small bottom link for discovery.

Only `account-login-en-desktop.png` and `account-login-hi-mobile.png` were promoted after this individual review. All four account pixel comparisons passed, including the two unchanged signup baselines. The additional English tutor mobile capture `tutor-en-390.png` was opened after real sign-in testing. Empty forms were captured through the actual Go API and an explicitly selected local MongoDB replica set on isolated ports; no credential values or actual learner data appear. Thirteen of fourteen initial browser checks passed; a keyboard test readiness race was corrected and its targeted rerun passed, including skip focus and 200% CSS reflow. Exact commands and boundaries are recorded in progress.md. Native screen readers and other browsers/hardware remain unverified.

## Landing-page crystal finish, 2026-09-23

Current images are in `landing-crystal/`. Opened before editing: the prior English desktop/mobile homepage and both corresponding viewport baselines. Opened after editing: `home-en-desktop.png`, `home-hi-desktop.png`, `home-en-mobile.png`, `home-hi-mobile.png`, `home-en-desktop-full.png`; the desktop `home-process.png`, `home-tutors.png`, `home-story.png`, `home-faq.png`, `home-closing.png`; mobile process/story/closing and `footer-signed-in-mobile.png`. Other full-page images were captured without claiming an additional individual review.

The three homepage viewport candidates were each opened before replacing their Windows baselines. Final selected Chromium regression passed **12/12 in 2.4m**, including those three and all seven unchanged account/profile/no-match baselines. English/Hindi, five widths, equal desktop columns, image decoding, keyboard/FAQ/menu, 200% CSS reflow, sampled axe, actual navigation and failed-tutor-request recovery passed. A separate browser check verified the forced-colour heading fallback, signed-in footer contrast and actual logout. All captures use the actual Go API and an isolated real local MongoDB replica set; no private credentials or actual learner records are shown.

The page retains the original AI-labelled image and paper/ink/sage colours, with a brighter faceted hero, glazed navigation and photo caption, highlighted surfaces and shorter closing layout. The public homepage preview strip is removed. Source-only reasoning is not visual evidence; unreviewed browsers/hardware/screen readers and lab performance remain outside this checkpoint. Root-level screenshots regenerated by tests were restored to their pre-task copies.

## Account and teacher workspace refinement, 2026-09-23

Current evidence is in `polish/`. Before editing, the previous teacher desktop/mobile and account desktop captures were opened. The new empty teacher overview was individually inspected in English/Hindi at 1440/390; the populated confirmed-trial overview was inspected at 1440/390; the dedicated Sessions form was inspected in English desktop and Hindi mobile. The four account candidates (login/signup English desktop, Hindi mobile) and two empty-parent candidates (English desktop, Hindi mobile) were each opened before replacing exactly their six Windows baselines. Public-page baselines were not replaced.

The new composition removes parent/tutor preview strips and website-return/sidebar marketing navigation. Teacher work is arranged around the next upcoming confirmed trial, compact counts and requests, with a smaller application panel. Bright paper surfaces, a highlighted sage panel and an ink sidebar retain the existing palette. Actual dates/statuses/counts come from the Go API. The review caught a capitalised subject value bypassing the Hindi translation; the subject lookup was corrected. No credentials or real learner information were captured.

Browser verification uses actual Chromium, Go and an isolated local MongoDB replica set. This is separate from the running Atlas app and does not resolve its collection limit. Detailed final command results are recorded in progress.md. Automated axe/reflow/keyboard checks are sampled evidence, not a screen-reader or cross-browser certification.

Final selected regression: **25/25 passed in 10.5m**, including all six changed pixel baselines. All fourteen images in `polish/` were individually opened; the final Hindi teacher captures were reopened after the subject correction. Unrelated root-level images regenerated by these tests were restored from their pre-task copies, preserving earlier review evidence.

## Tuition, service, account and private-file extension, 2026-09-23

Rendered in actual Windows Chromium through React → Go → an isolated real MongoDB WiredTiger replica set. Atlas's collection limit blocked the final Atlas rerun; no visual result is inferred from source code. Captures contain fictional test identities and teaching evidence only.

Individually opened: all ten `tuition-*.png` images (availability English desktop/Hindi mobile, agreement desktop, calendar desktop/Hindi mobile, plan editor desktop, handover desktop, plan Hindi mobile, empty and error desktop); all six `billing-disabled-*`, `conversation-*` and `finance-records-*` English desktop/Hindi mobile images; `support-request-en-desktop.png`, `support-operator-en-desktop.png`, `support-response-hi-mobile.png`; both `account-settings-*` and both `private-files-*` images. Final key calendar/availability/plan/handover, finance, conversation, support, account and file recaptures were reopened after the sidebar/file-tab additions. Also reopened the populated original family, tutor, mentor and admin captures. Native file-picker labels follow the browser/OS locale; surrounding upload guidance/actions are translated.

Inspection corrected overlapping Hindi calendar tabs, misleading window labels, a calendar capture taken during loading, and navigation lost when a handover invitation unmounted. The account page uses a two-column desktop layout and a single mobile stack. Private files show the real saved/quarantined state and no download action before scanning. Support views show a redacted queue before assignment. Finance empty states contain no invented transactions or metrics. Final admin review exposed raw event codes and an overlong overview timeline: new event labels are now translated, and overview keeps five recent decisions with a link to the dedicated history view.

Both new `candidates/workspace-parent-*.png` images were individually opened. Only the English desktop candidate was promoted to its existing baseline, reflecting new functional sidebar sections. The Hindi mobile candidate is byte-identical to its existing baseline and was not replaced. The ten public/account baselines remain unchanged. Exact-pixel checks for all twelve passed in the complete **39/39** Chromium regression, with zero unexpected/flaky/skipped results. Unrelated regenerated public/component captures were restored.

Automated axe, overflow and relevant keyboard/empty/error checks are recorded in the new Playwright files. These are sampled checks, not an accessibility certification or a native-screen-reader review.

After limiting the admin overview to five decisions, the original academic journey and admin responsive/navigation tests passed again: **2/2 in 3.5m**. Reopened the final `workspace-admin-en-1440.png` and `workspace-admin-hi-390.png`; removed a duplicate decorative arrow supplied by both the page and shared link component. A final actual-browser capture against the retained local E2E database verified EN/HI at 1440/390, five decisions, one link arrow, no horizontal overflow and no page errors. Both final images were opened again. The separate history view remains available; it honestly labels its existing 25-record limit when applicable.

## Private dashboard redesign, 2026-09-23

The private application now uses a distinct ink sidebar and paper workspace, retaining the approved account colours. English/Hindi desktop and mobile layouts were rendered in actual Chromium against Go/Atlas. Role screenshots contain explicitly fictional development fixtures; no actual child records or credentials were captured.

Individually opened at this checkpoint: both `candidates/workspace-parent-*.png` images; populated `parent-reviewed-en-desktop.png` and `parent-reviewed-hi-mobile.png`; `tutor-confirmed-en-desktop.png` and `tutor-confirmed-hi-mobile.png`; `mentor-scorecard-en-desktop.png` and `mentor-scorecard-hi-mobile.png`; `admin-hi-mobile.png`; `workspace-admin-en-1440.png`; `workspace-tutor-hi-1440.png`; `workspace-parent-mobile-menu.png`; `workspace-parent-200-percent.png`; `workspace-loading.png`, `workspace-error.png` and `workspace-queue-empty.png`. The long learner-name capture was also opened and exposed a view-selection race, subsequently fixed. Initial four-role English desktop and parent Hindi mobile captures were inspected under the ignored `.local/workspace-review/` directory. Other captured widths are not automatically claimed as individually inspected.

Review fixed step-number contrast, complementary landmark names, the search field's accessible label, contextual empty-state copy and the full-page sidebar background. The drawer close target is 44px; its final mobile rendering was reopened. Also inspected `workspace-parent-hi-1440.png`, `application-submitted-en-desktop.png` and `adult-requirement-hi-mobile.png`. Two first-use parent candidates were opened after the contrast refinement, then copied to the new Windows-only `workspace-parent-en-desktop.png` and `workspace-parent-hi-mobile.png` baselines. All twelve baselines passed exact-pixel comparison in the final regression; the existing ten public/account baselines were not rewritten. `scripts/capture-workspace-baselines.mjs` captures only the verified fictional empty parent fixture and does not promote images automatically. It reads the private fixture password locally and never captures it.

`workspace.spec.ts` exercises role navigation/reload, English/Hindi at 360/390/768/1024/1440, keyboard skip, mobile drawer/Escape focus, default axe rules, CSS 200% reflow, actual persisted learner switching and queue filters, request/session errors/retry, sign-out and role denial. Full-journey tests still exercise the real multi-step forms. Final regression passed **33/33**, including all 7 workspace tests and all 12 reviewed pixel baselines; sampled axe scans reported no violations. Reopened the final `workspace-long-learner-name.png` after the URL-state fix: the correct My learners view persists, full name wraps, and content remains within 360px. Other role images include changing audit dates and remain review evidence rather than pixel baselines.

## Homepage photo redesign, 2026-09-23

The homepage now follows the account page's paper/ink/sage direction with a generated tutoring photograph and balanced grids. The source image was opened before use. Opened the desktop English and mobile English/Hindi candidates under `candidates/home-*.png` before promoting those three images to the existing Windows baselines. Image decoding is now awaited by both the candidate script and comparison test. The seven other account/profile/no-match baselines were preserved and passed.

Individually inspected: the three hero candidates; the full English and Hindi desktop/mobile homepage captures, including `home-en-1440.png`, `home-hi-1440.png` and `home-hi-390.png`; the 1024px composition; `landing-tutors-loading.png` and `landing-tutors-error.png`; and the English/Hindi process portions in `landing-*-200-percent.png`. Some full-page journey captures show the visible main focus outline after keyboard skip navigation. Additional widths were captured and automatically checked; their existence alone is not a claim of individual visual inspection.

Refinements from review: responsive image selection now allows for the cover crop, so desktop uses an adequately sized source; error copy describes the failed tutor query; loading surfaces use the landing palette; tutor-card footers align for different content lengths. The generated scene is explicitly labelled and is not used as a real tutor profile.

Full regression: **24/24 passed** in 2.8m, including the actual four-role Atlas journey and all 10 reviewed baselines. Final affected regression after the small refinements: **12/12 passed** in 1.1m. `home.spec.ts` checks both languages at 360/390/768/1024/1440, column alignment, image decode, keyboard FAQ/menu/skip, CSS 200% reflow, real entry-point navigation, and loading/error/retry; sampled axe checks passed. Existing journey coverage verifies real empty search. No Lighthouse, manual screen-reader, native-zoom, other-browser or production-readiness claim is made.

Date: 2026-09-23. Actual Chromium (Playwright 1.63.0), Windows, device scale 1, self-hosted Manrope/Noto fonts. The real React application called the Go API and Atlas. All records shown are fictional. No screenshots of real child records, live credentials or payment/provider claims are included.

## Email/password redesign review

The old OTP login design is superseded. Individually opened final account images: `account-login-en-desktop.png`, `account-signup-en-desktop.png`, `account-login-hi-mobile.png`, `account-signup-hi-mobile.png`, `account-login-en-mobile.png`, `account-signup-en-mobile.png`, staff `login-hi-mobile.png`, `login-error-desktop.png`, `account-login-loading.png`, and `account-login-load-error.png`. Hindi desktop login was also inspected in `.local/auth-login-hi-1440.png`. The password component at 200% was inspected in the updated `components-200-percent.png`.

Fixed clipped illustration text, overly tall signup composition, small field typography and generic account-load error copy. Mobile prioritizes the form. A screenshot initially captured a route-loading skeleton; the test now waits for the form before screenshot/axe review. The four `account-*` desktop/Hindi-mobile baseline images were opened before copying to `tests/e2e/baselines`; all four passed zero-difference comparisons. Empty forms were captured so no passwords appear. `node scripts/capture-auth.mjs` creates review candidates only.

Full regression: 22/22 passed, including the 6 older public baselines and these 4 new account baselines. Final affected-suite rerun: 12/12 passed after error-copy/trailing-slash/screenshot-wait refinements. Public baselines were not rewritten. English/Hindi signup/login, keyboard, 360/390/768/1024/1440 overflow, CSS 200% stress, error/retry and axe checks ran. Native browser zoom and manual assistive-tech review remain unverified.

## Inspected by opening the rendered images

- Initial English homepage: `home-en-desktop-initial.png`, `home-en-mobile-initial.png` (before refinements).
- Final candidate homepage desktop English and mobile English/Hindi: `candidates/home-en-desktop.png`, `candidates/home-en-mobile.png`, `candidates/home-hi-mobile.png`.
- Full Hindi homepage desktop/mobile: `home-hi-1440.png`, `home-hi-390.png`.
- Tutor profile desktop English/mobile Hindi: `candidates/profile-en-desktop.png`, `candidates/profile-hi-mobile.png`.
- Real no-match mobile Hindi: `candidates/empty-hi-mobile.png`.
- Parent reviewed progress: `parent-reviewed-en-desktop.png`, `parent-reviewed-hi-mobile.png`.
- Tutor confirmed lesson form: `tutor-confirmed-en-desktop.png`, `tutor-confirmed-hi-mobile.png`.
- Mentor scorecard: `mentor-scorecard-en-desktop.png`, `mentor-scorecard-hi-mobile.png`.
- Admin queue: `admin-en-mobile.png`, `admin-hi-mobile.png`.
- Hindi adult requirement form: `adult-requirement-hi-mobile.png`.
- Login follow-up: `login-en-desktop.png` and `login-hi-mobile.png`, inspected during the localhost login fix. Captured before requesting an OTP; no login secrets are retained in these images.
- Search filter drawer: `search-filter-mobile.png`.
- Search populated desktop and network-failure state: `search-en-desktop.png`, `search-network-error.png`.
- 200% component stress case: `components-200-percent.png` and the earlier failed screenshot during diagnosis.

Other files are captured artifacts, not automatically individually reviewed images. The homepage additionally has automated overflow checks at 360, 390, 768, 1024 and 1440 CSS px. Tests include relevant English/Hindi axe scans and keyboard checks. Private record text entered in English is intentionally not auto-translated or rewritten when interface language changes.

## Defects found and refined

1. Approval note overlapped the learning-preview mentor text. Moved it below the paper with deliberate spacing.
2. Small supporting text and low-contrast preview/illustration labels. Increased text sizes and darkened foregrounds; re-ran axe.
3. Form hints were part of the accessible label. Added explicit input IDs, labels and `aria-describedby` for hints/errors. The OTP flow now has the correct accessible name.
4. Header overflow at 200% CSS zoom. Collapsed redundant sign-in navigation when the menu is present; verified reflow.
5. Two-column controls became too narrow at that zoom level. Changed form grid columns to fit the available width.
6. Mobile hero grid grew wider than its container even without page-level scroll. Removed intrinsic minimum width on hero children and added a container-boundary assertion.
7. Large “no upcoming trials” state distracted from available reviewed progress. Used a compact state when reviewed records exist.
8. Corrected tutor pipeline/role labels. Hid the unfocused skip link reliably during full-page capture; it remains keyboard accessible.

## Reviewed regression baselines

The six files under `candidates/` were actually opened and reviewed before being copied to `tests/e2e/baselines`. `visual.spec.ts` compares against those reviewed originals with zero allowed different pixels. Homepage comparisons intentionally use a fixed 1000px viewport so they do not depend on which newly approved fictional tutor appears below the fold; full-page homepage evidence is separately retained. Profile/no-match baselines use complete pages with deterministic seed data and fixed assessment dates. No broken content is masked. There is no displayed live clock on those baseline screens.

These baselines are **Windows Chromium only**. Linux CI explicitly skips their raster comparisons; it still executes the connected workflow, layout, keyboard and axe tests. Establish separate reviewed Linux/other-browser baselines before broadening claims. Private-role artifacts currently have changing audit/session dates and are review evidence, not automated pixel baselines.

Initial checkpoint: 10/10 Playwright tests passed, including all six exact-pixel comparisons and the Hindi adult requirement flow. The actual snapshots were reviewed before promotion; later tests compared without changing the accepted images. After the local login address fix, the full suite passed 13/13, including three added login/security regressions and the same six unchanged baselines. The login screenshots listed above were individually inspected.

`node scripts/capture-baselines.mjs` creates candidates against the running local application. It never promotes them automatically. Never run a blanket snapshot update and call that visual acceptance.

## Limits

CSS 200% scaling is a reflow stress check; native browser zoom, screen-reader/manual assistive-technology testing and an operator walkthrough remain unverified. Wider component catalog, unimplemented workflows, native mobile devices, WebKit/Firefox and Lighthouse/field performance are not accepted by these screenshots. Automated axe checks do not certify WCAG conformance.
