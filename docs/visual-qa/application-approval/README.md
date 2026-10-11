# Tutor approval validation — 2026-10-11

`tests/e2e/application-approval.spec.ts` passes both tests against the real Go API and an isolated, retained local MongoDB replica-set database. The labelled fictional assessed applicant reproduces the legacy All Subjects request for Classes 5–10; no live application, provider or recipient is used.

The test proves the original 5–10 approval is rejected by Go, the form starts at the eligible Class 5 overlap, a manually invalid range disables approval, and a server-rejected whitespace reason shows the specific 422 message with selections retained. A valid staff approval persists Class 5 All Subjects with the chosen mentor, advances the application version exactly once, survives reload and retains the original requested Class 5–10 record. A wholly ineligible Class 6–10 request offers no approval form.

Individually inspected full-page captures:

- `validation-desktop.png` — 1440px; primary-class hint, Class 5 bounds and actionable reason error.
- `validation-mobile.png` — 390px; the same controls and error reflow without clipping. Also inspected at original resolution.

Both captured states pass axe and horizontal-overflow assertions; the successful approval test records no page errors. Existing baselines were not replaced. The first browser startup exceeded the default 120-second deadline during concurrent checks; a temporary ignored config with an explicit repository working directory and 300-second startup allowance passed both tests in 2.5 minutes. Production deployment and manual assistive-technology checks are outside this evidence.
