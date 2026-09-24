# Password-only staff login review

User explicitly selected password-only staff login. The locally built production Go API and frontend ran behind a loopback HTTPS test proxy against an isolated local MongoDB replica set. The real `tutor-staff` CLI provisioned fictional admin, mentor, support and finance accounts using test-only stdin passwords; no Atlas or live identity was changed.

Final complete browser run passed public parent/tutor signup, login, logout and reload, plus all four staff login/reload/role-boundary/logout journeys. Support/finance reach their cases/billing workspaces and remain denied academic application APIs. Staff has no public create-account link. All six account views passed axe and horizontal-overflow checks, with no page errors.

`staff-1440.png` and `staff-390.png` were individually opened and inspected: existing approved account design, visible email/password fields, readable labels/buttons and no MFA/unavailable message. No baseline was replaced. The four public login/signup screenshots were byte-identical to the previously reviewed `production-auth` captures; duplicates are retained in `.local/staff-password-public-captures`.

Local harness: `.local/staff-password-browser.mjs`; successful data retained in `tutor_test_staff_browser_1790280819791`. Initial harness issues (replacement-string escaping and waiting for transient `/workspace` instead of the unapproved tutor's `/apply`) were corrected before the complete successful rerun. Local self-signed TLS was accepted only in that browser fixture. Actual droplet login, interactive password entry, native assistive technology and other browsers remain unverified.
