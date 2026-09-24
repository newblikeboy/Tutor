# Compact tutor application review ? 2026-09-24

The provided desktop screenshot and the existing Hindi mobile upload screenshot were reviewed before replacing the nested step sidebar. The new form uses the available workspace width, six horizontal tabs, one active panel and a native step-position bar. Numbered mobile tabs retain full accessible labels. Save draft preserves the current scroll position; changing steps moves focus to the new heading and respects reduced motion.

Field review covered all six application sections:

| Section | Review and changes |
| --- | --- |
| About you | Name/contact labels retained; account email has read-only styling and a sign-in hint; photo remains explicitly optional. |
| Education | Blank unset completion year, qualification example, clearer specialisation/employment questions, explicit expected completion month, grouped qualifications/experience/documents and optional education files. Both studying and experienced-tutor branches reviewed. |
| Subjects/classes | Blank unset class limits; compact board/language/mode columns; clearer prior-experience and first-assessment questions; separate academic approval remains explicit. |
| Time/location | Units and IST retained; clearer commitment/leave/interview preferences; Home travel preference explicitly leaves final fees to staff; Online equipment/help choices retained; duration errors shown beside the group. |
| Teaching approach | Character-limit hints; shorter fields; paired desktop teaching questions; consistent demo wording and private file constraints. |
| Review/submit | Editable saved-section summary retained; consent text correctly refers to the displayed notice; required declarations and optional updates remain separate. |

Initial application browser run: 5/5 passed. This covers the compact tabs/keyboard/reflow regression, complete submission/staff review, stale drafts/Hindi/mode changes, locality-error recovery and private recorded demo. The final expanded run passed 6/7; the upload test still expected the old Hindi document label. Its corrected rerun passed 1/1 in 59.9s, giving seven passing selected cases. Exact results are recorded in `../../progress.md`.

Final visual review includes `education-en-1440.png`, `education-en-390.png`, `education-hi-390.png`; additional final inspected captures are `step-3-en-desktop.png`, `step-4-en-desktop.png`, `recruitment/applicant-en-desktop.png`, `recruitment/applicant-hi-mobile.png`, `uploads/about-hi-mobile.png`, and both `uploads/education-*.png` views. Earlier review covered all desktop form sections and English mobile About you. Inspection prompted fixed-width mobile step circles, shorter textareas, aligned time-row actions and compact subject options. Screenshots use fictional isolated records. No pixel baseline was promoted.

Automated checks include axe and overflow assertions at captured states, five viewport widths for Education in both languages, 200% CSS text reflow, tab keyboard navigation and actual Go/Mongo saves. These checks do not certify accessibility. Other browsers and native screen readers were not tested.

## Teaching approach follow-up

`approach-simplified-en-desktop.png` and `approach-simplified-hi-mobile.png` were inspected after removing demo-choice/recording and worksheet controls. Both retain three written questions and preferred interview times. Focused real-Go/Mongo browser verification passed 1/1 (52.6s), including axe, reflow, review/reload/submission of an incomplete legacy recorded draft, and retained quarantined file evidence.
