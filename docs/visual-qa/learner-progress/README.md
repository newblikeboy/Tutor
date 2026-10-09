# Learner progress report review

Reviewed on 2026-10-10 using the real Go API and an isolated local MongoDB replica-set database. All identities, lessons, marks, plans and feedback in these captures are fictional test records. Recorded-history fixtures do not represent real payment activation or attendance; booking and payment verification have separate acceptance tests.

The final persisted browser flow passed at 1440px and 390px. It checks all four report tabs; learner, subject, tutor, month and custom-date filters; reload and URL state; keyboard tab navigation; invalid date ranges; Class 1-5 All Subjects with individual lesson details; empty states; retry after an explicit API failure; and tutor editing/recording with the real API. Invalid 21/20 marks return 422 and preserve the form; corrected 14/20 marks save and appear in the parent's report. A newly recorded lesson updates feedback and package counts. Axe, horizontal-overflow and page-error checks passed.

Each of the twelve final captures was individually visually inspected:

| Captures | Review |
| --- | --- |
| `overview-1440.png`, `overview-390.png` | Completed classes, marked attendance, checked homework, tests, latest feedback, next practice, package balance and expandable earlier history. Cards and filters stack on mobile. |
| `subjects-1440.png`, `subjects-390.png` | Topic observations, practice, actual test marks and score comparison; saved historical learning plan remains readable separately. No invented subject scores. |
| `history-1440.png`, `history-390.png` | Thirty scheduled, missed and completed lesson cards with expandable details; old tutor names preserved. Full-page captures are long because the complete fixture history is displayed. |
| `feedback-1440.png`, `feedback-390.png` | Completed lesson notes, topic evidence, homework, tests and trial feedback; readable single-column mobile layout. |
| `empty-1440.png`, `empty-390.png` | Explicit missing-progress state, with learner selection, Add learner and Edit profile available. |
| `tutor-progress-1440.png`, `tutor-progress-390.png` | Topic, observation, practice, homework, feedback, next steps and optional test inputs; readable labels and controls. Captured before submitting the deliberately invalid 21/20 test result used to verify validation. |

The first implementation review found excessive overview history and an unrelated missed-lesson note appearing as latest feedback. Earlier history is now expandable and latest feedback uses completed lessons/trials. An initial browser assertion matched the chart's hidden SVG title instead of the visible score; it was corrected to assert the visible result list, and the complete flow reran successfully. Existing learner/profile browser checks also passed after adapting them to the report entry.

Local Chromium evidence covers this workflow; no live provider checkout, production deployment or live household data was used.
