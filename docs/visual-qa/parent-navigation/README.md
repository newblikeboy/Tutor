# Parent finder navigation (2026-10-10)

`menu-1440.png` and `menu-390.png` show the desktop sidebar and mobile drawer without a Find a tutor entry. The Home page retains the Find a tutor action for the selected learner. Both captures were individually inspected.

The existing `parent-learning-needs.spec.ts` browser flow uses authenticated fictional parent/learner records persisted by the real Go API in an isolated local MongoDB database. It checks the menu removal on both widths, clicks the Home action, confirms the finder URL and selected learner, and retains URL/history/reload behavior. Home accessibility, overflow and page-error checks pass. No live data, payment or deployment is involved.
