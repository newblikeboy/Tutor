# Multiple education subjects — 2026-10-07

Reviewed `subjects-1440.png` and `subjects-390.png` from the isolated local Go/MongoDB application test. All records are fictional. Physics is a deliberately retained legacy specialisation; new choices use the same five subjects as Quick Tutor Finder.

`tests/e2e/application-subjects.spec.ts` verifies:

- Selecting/deselecting through the subject text and checkbox, including the original summary-to-label focus sequence.
- Desktop double-clicks and mobile touch taps without browser errors or renderer crashes.
- Escape/focus restoration, forward/reverse Tab and outside-click dismissal.
- Saved selections restored after reload, with legacy entries preserved unless removed.
- Selecting all five standard subjects, blocking continuation with no selection and continuing after valid selection.
- Desktop/mobile axe and horizontal-overflow checks: no findings.

The Quick Tutor Finder E2E also passed after sharing configurable labels, hints and errors. Go tests verify the bounded multi-subject string, preservation of existing authored text, incomplete drafts and empty/oversized submission validation. The local API was rebuilt/restarted and readiness checked; no production deployment.
