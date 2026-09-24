# Password policy visual review

The requested minimum is now eight characters. Signup and account password-change captures at 1440px and 390px were individually inspected: the 8-128-character hints fit without clipping, and the established layout is preserved. Password fields were empty in every capture. Each view passed axe and horizontal reflow checks.

The two signup captures were explicitly reviewed and copied to the corresponding Windows Chromium baselines; login baselines were unchanged. The browser flow also verifies seven-character rejection, eight-character signup and password change, reload persistence, and old-password rejection after rotation. All fixtures use retained local MongoDB databases.

All four reviewed login/signup visual comparisons passed (53.6s).
