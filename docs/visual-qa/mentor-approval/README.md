# Mentor approval simplification — 2026-10-11

The approval workspace contains three sections: Zoom interview, Fees, and Subjects & teaching modes. Only the assigned mentor can use these controls. Admins see the details read-only, route pending applications to active mentors and retain separate account access operations. Removed assessment/conflict/eligibility/note/reason/extra-mentor controls no longer appear in the approval form. Historical audit data remains readable.

Latest clarification: the scope section pairs **Approve tutor** with **Reject application**. Rejection opens a reason dialog, saves the existing declined state and shows the feedback to the tutor. The dialog does not submit the surrounding approval form. `rejection-desktop.png` and `rejection-mobile.png` cover this dialog; updated validation captures show both decision buttons. A new real API/MongoDB browser check rejects a submitted application without Zoom or fees, verifies persistence after reload, hidden decision controls once closed, absence from discovery and applicant-visible feedback. Backend coverage also checks admin/other-mentor denial, short reasons, stale writes, repeated/approved-tutor rejection, provider deletion and reuse of released interview slots.

The browser checks use the real Go API and an isolated retained local MongoDB replica-set database. The Zoom gateway is an explicit local test server; no live Zoom appointment or external invitation was created. Signup uses the current transactional verification endpoint with an isolated fictional email challenge. Legacy All Subjects regressions temporarily modify and restore one labelled seed record, including its retained old scores and eligibility review. The actionable 422 test forwards an invalid scope once to the actual Go endpoint; success is never mocked.

Captures:

- `validation-desktop.png` / `validation-mobile.png`: three sections, Class 5 overlap of the legacy All Subjects request, specific Go validation error and retained selections.
- `admin-readonly-desktop.png`: no Zoom creation, fee save or approval controls; explicit mentor routing.
- `lifecycle/interview-en-desktop.png`: future confirmed Zoom, visible fees, disabled approval and clear prerequisites.
- `lifecycle/applicant-interview-en-desktop.png`: actual confirmed join link and downloadable calendar appointment; the shared card stylesheet now loads directly for applicants.
- `fees/fees-en-desktop.png` / `fees/fees-en-mobile.png`: saved hourly/weekly/monthly prices and fixed 6/24 class counts.
- `lifecycle/approved-en-desktop.png`: mentor approval, completed interview and saved Classes 8–9 with both modes.
- `lifecycle/terminated-en-desktop.png` / `lifecycle/followup-en-desktop.png`: retained administrative access controls and actual follow-up resolution.

The original ten captures and the two added rejection captures are individually reviewed. Exercised approval/lifecycle pages pass axe and horizontal overflow checks. Tests also verify initial automatic assignment, denied admin API writes, no removed assessment form, precise 422 with retained fields, primary-class bounds, saved scope/fee reload, public fee projection, session revocation and stale-write recovery. These checks do not certify accessibility or represent full browser-suite/live-provider acceptance. Earlier historical captures are retained separately.

Clarification verification: all four approval/rejection browser checks passed before a later staff screenshot stalled in a combined run, alongside a Windows paging failure during concurrent extra static checks. The combined run was stopped; both staff checks then passed separately with trace recording disabled. Static checks passed sequentially with reduced memory. No provider success was mocked, and no live Zoom or delivery operation occurred.

The old lifecycle test used superseded application intake controls; its fixture now submits a complete application through the current Go API. One repeated full-page navigation stalled waiting for the browser load event after the completed approval/access checks; the lifecycle test now uses the actual sidebar and Follow-ups tab for that navigation. Fee assertions now wait for the actual fees action response and the updated provider-confirmed appointment, rather than mistaking the preceding reschedule response for a fee save. These changes keep the real version/provider checks exercised.
