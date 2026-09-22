# Implemented access boundary

| Actor | Permitted in development/test | Denied |
|---|---|---|
| Anonymous | Read approved public tutor DTOs; email/password signup as an adult parent/tutor; sign in | Staff registration, academic approval, private learner/application/lesson records |
| Parent / adult learner | Own learners, consent, requirements, drafts and trial requests; cancel own trial; see reviewed learning evidence | Other household IDs; self-granted staff roles; unreviewed notes |
| Tutor | Own application; assigned requests; confirm scoped trial; record lesson evidence before assignment closes | Approval decisions; all-learner browsing; unrelated trials; editing completed assignments |
| Mentor | Claim a submitted assessment; decide only assigned assessments; review lessons assigned by the approving assessor | Self-assessment, another assessor's records, finance/safeguarding data |
| Admin | Application status and audit metadata; suspend approved tutor with a reason | Academic score/approval actions without mentor role; unrelated family learning data |
| Support / finance | No academic dashboard in this slice | Learners, academic decisions, safeguarding or unrelated records |

All production authenticated operations currently return 503 until recovery/security/MFA/guardian gates are reviewed. Staff login accepts provisioned email/password credentials; there is no staff role selector or public staff signup. A role/version update invalidates earlier sessions. Login rotation/logout revoke prior sessions and clear private TanStack Query state. Expiry is checked independently of TTL cleanup. Legacy OTP sessions cannot authenticate after the password migration.

Known limits: staff assignment scopes are presently one online Mathematics scope (classes 6–10). Further specialist scopes, documented conflicts, granular invites, privacy requests and safeguarding permissions remain milestone C/D. Tutor metadata for ended trials is retained but learner name/notes/review are redacted; operator retention review is required.
