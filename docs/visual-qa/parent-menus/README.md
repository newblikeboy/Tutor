# Parent menu visual review — 2026-10-07

Local Chromium presentation review with fictional browser fixtures. API requests were intercepted and mutations were rejected; no real parent, learner, payment or message data appears here. These captures do not establish backend integration or production deployment.

Desktop (1440px) and mobile (390px) captures cover Home, Learners, Trial lessons, Regular classes, Payments, Updates, Help and Account. Additional captures show Activity, Password, Sign-ins, the revised regular-class calendar and the 768px teacher-card layout. The existing mobile composition is retained; calendar semantics, placeholder spacing and regular-class copy have targeted corrections.

Reviewed desktop examples:

- [Home](home-1440.png), [Learners](learners-1440.png), [Trial lessons](trials-1440.png)
- [Regular classes](regular-1440.png), [booking calendar](calendar-1440.png), [tablet booking card](regular-tablet-768.png)
- [Payments](payments-1440.png), [Updates](updates-1440.png), [Activity](activity-1440.png)
- [Help](help-1440.png), [Account](account-1440.png), [Password](password-1440.png), [Sign-ins](signins-1440.png)

Checks also covered 360, 768, 1024, 1100 and 1920px; empty pages, longer authored text and multiple records; keyboard tab activation and retained account input; selected learner URL state; mobile drawer dismissal/focus/history; both date pickers and regular-class consent-dependent submit enablement. No submit action was executed. The 104-state responsive pass and 12 final targeted scans reported no horizontal overflow or axe violations. Detailed temporary captures and runner output are under `.local/parent-menus/`.

Production build (including TypeScript), lint and the six existing component tests passed. No screenshot baseline was replaced.
