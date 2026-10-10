# Design System Specification

This specification consolidates the existing GoCoaching direction. It does not authorise a visual rewrite of approved login/signup screens or replace existing component behaviour. Extend the current primitives before introducing new ones; remove obsolete styles/components when an implementation actually supersedes them.

## Foundations

Current `styles/index.css` defines paper `#F8F7F4`, navy `#13213C` and teal `#076B76`; Home and workspace override these with paper `#F5F3ED`, ink `#15353B` and sage `#DFE8BC`. Auth already uses the same paper/ink/sage family. Token consolidation should preserve the approved appearance while reducing unrelated global overrides.

| Proposed semantic token | Starting value / rule | Use |
| --- | --- | --- |
| `color.canvas` | `#F5F3ED` | App/page background |
| `color.surface` | `#FFFFFF` | Forms, cards, dialogs |
| `color.ink` | `#15353B` | Primary text, main action and sidebar |
| `color.accent` | Current teal, reviewed against its actual background | Links and interactive emphasis |
| `color.selected` | `#DFE8BC` with ink text | Selected navigation/tab, restrained highlights |
| `color.text.secondary` | Existing muted colour after measured contrast | Supporting text; never use low-opacity body text |
| `color.border` | Existing warm neutral border | Grouping, fields and separators |
| `color.status.*` | Existing success/warning/error/info hues with text/icon | Semantic status; never colour alone |
| `shadow.surface` | Subtle existing workspace elevation | Cards; avoid stacking large shadows |
| `radius.control` / `radius.card` | 10–12 / 16 pixels, within existing pattern | Consistent forms and panels |

These starting colours are not an accessibility certification. Validate each actual text/background/state pairing and focus indicator. Do not globally swap tokens before reviewing current auth/home/workspace screenshots.

**Typography:** Retain Manrope for app controls/body. Preserve the existing editorial hero accent on the public homepage; do not spread decorative type into data/forms. Use a small type scale: body 16px with 1.5–1.65 line height; supporting text 14px; labels 14–16px; section heading 20–24px; page heading 28–36px with responsive wrapping. Reserve very small text for nonessential metadata; do not make dates, statuses or fees difficult to read. Numeric summaries use tabular figures and explicit units/denominators.

**Spacing:** Use 4, 8, 12, 16, 24, 32 and 48px increments. Fields have 8px label/control and 4–8px hint/error gaps; related fields 16–24px apart; sections 24–32px apart. Prefer alignment and headings over another nested card. Mobile page gutters start at 16px; desktop content uses 24–32px. Avoid large empty hero blocks inside task pages.

**Layout:** Keep the current desktop sidebar and independent private shell. Forms use a readable 640–760px main column where appropriate; operational queues may use the remaining width. Reports may use a two-column content grid on wide screens and one column on mobile. Large tables either transform into labelled cards or use a deliberate labelled scroll region; never hide fields without another route to their values.

## Responsive behaviour

| Width / condition | Rule |
| --- | --- |
| 360–430px | One task column; readable labels/prices; no document-level horizontal scroll; compact header; drawer for navigation |
| 768px | Test tablet portrait, wrapped filters and intermediate cards; avoid desktop columns that squeeze forms |
| 1024px | Check sidebar/content transition and queue/table layouts |
| 1440px | Comfortable maximum width, aligned actions and usable multi-column reports |
| 200% text/zoom and 320px reflow equivalent | Content and controls remain readable/operable; no lost action, clipped error or fixed footer covering content |

Breakpoints should follow where content stops fitting; the widths above are verification cases, not five new arbitrary CSS breakpoints. Prefer existing breakpoints initially. Sticky actions must respect safe-area insets, keyboard opening and focused fields. No sticky payment button may hide the quote/agreement context.

## Component contracts

| Pattern | Required structure and behaviour |
| --- | --- |
| Page header | One semantic page h1; short context and primary action. A visually hidden h1 is permitted when the visible title hierarchy is intentional |
| Learner selector | Label, authorised options, class context, explicit All learners when supported; URL state; no silent replacement on stale access |
| Filter group | Visible active summary; desktop controls and mobile disclosure; Apply/Reset clear; preserve selections through error/back/reload |
| Tutor card | Name/authored profile, approved class/subject/mode scope, selected-context staff price, accurate approval badge; one profile/trial action |
| Next lesson | Learner, tutor, subject/mode, IST date/time, actual status and exact class/trial link; join only when server allows |
| Package card | Learner/tutor, saved package/count/subjects, remaining count, actual next date and detail link; never label an unpaid hold active |
| Price summary | Currency, package unit, class count/duration, subject multiplier and total; immutable agreement version during booking |
| Progress summary | Recorded count/denominator, date scope and Not recorded state; observations attributed to tutor/date; no inferred academic score |
| Recorded lesson | Actual attendance, planned versus recorded subject, topic evidence, homework, optional test and next practice; correction/version state |
| Status badge | Plain-language text plus optional icon; approved/requested/confirmed/payment verification distinctions; no default availability promise |
| Field | Explicit associated label, hint/error described-by, aria-invalid on invalid state, stable ID; input value survives failed submission |
| Multi-select | Accessible trigger/list/check items, selected count/chips, keyboard interaction and clear action; class 1–5 fixed All Subjects |
| Tabs | Existing tablist/tab/tabpanel association and roving focus; arrows/Home/End move focus, Enter/Space activate; selected state in URL |
| Disclosure | Button or summary with accessible expanded state; critical current task never hidden by default; keyboard and touch activation |
| Empty state | Explain why empty and next valid action; distinguish first use, filtered empty and no authorised record; no empty charts |
| Loading/error | Section-level loading where possible; visible Retry for reads; mutation errors near their action; no fake success or automatic unsafe retry |
| Confirmation dialog | Named target, consequence, required reason where relevant, deliberate confirm/cancel; focus trap, Escape, restore trigger; no background mutation |
| Queue/table | Search/filter context, row status, authorised action and complete pagination; mobile field labels and linkable records |
| Toast/status | Supplementary short saved feedback only; persistent errors/decisions remain visible; status announcements do not steal focus unnecessarily |
| File/meeting state | Actual provider/configuration status, pending/failed/retry where authorised; no fabricated ready/download/join control |
| Email delivery row | Category, safe recipient metadata, attempts and queued/accepted/rejected/uncertain state; no code/token/secret payload |

Use the current `Button`, `Field`, `Loading`, `LoadError`, `MutationError`, `TabBar` and Radix dialog patterns as the starting point. Shared implementations reduce inconsistency; a shared error component still needs the right page/field context.

## Accessibility and interaction acceptance

Keep one main landmark. Use a coherent heading outline, labelled navigation and forms, keyboard-visible focus and a working skip link. Preserve link semantics for navigation and button semantics for actions. Avoid icon-only ambiguity: accessible names must identify the specific action.

Project touch-target goal is 44×44 CSS pixels for primary mobile controls, including usable clickable label area. Check neighbouring targets and spacing; small checkbox glyphs alone are not the final target size. Measure WCAG contrast requirements appropriate to the content, including disabled/current/hover/focus states. Honour reduced motion and use animation only to clarify state; no essential task depends on motion, hover or colour.

Review keyboard sequence for finder, trial slots, booking quote, report tabs, lesson recording and staff dialogs. Confirm drawer focus trap/Escape/restore, text zoom/reflow, error-summary focus and accessible asynchronous announcements. Axe is a regression aid; manual screen-reader and device checks remain necessary.

## Copy and trust rules

Use English-only interface copy. Teaching-language choices and authored records retain their original meaning. GoCoaching is the visible brand and gocoaching.in the domain; historical identifiers remain untouched.

| Prefer | Avoid |
| --- | --- |
| Weekly package · 6 classes | Must finish within this week |
| Monthly package · 24 classes | All classes must be in this calendar month |
| ₹X per selected subject; Y subjects; total ₹Z | A price with an unstated multiplier |
| Pay to confirm; payment being verified | Tutor acceptance required for regular paid booking |
| Tutor feedback; recorded next practice | Routine mentor approval of class notes |
| Approved tutor; check available dates | Available teacher without a scheduling check |
| Not recorded / no test recorded | Estimated academic progress or inferred marks |
| SMTP accepted | Email delivered/read without delivery evidence |
| Updates inbox | Chat/reply affordance in one-way Updates |

Remove visible translation keys and legacy learning-needs/review promises. Auth copy must not reveal whether a specific account exists. Destructive/status actions should name their target and consequence. Public policies require actual operator-approved content, not a speculative legal disclaimer.

## Maintenance and verification

Document a component only when it has a real implementation or a clearly marked proposal. Keep generated contracts aligned when an implementation changes an API. Preserve unrelated work. After a component replacement, remove its dead branches/styles instead of leaving two systems.

Review desktop/mobile screenshots against the approved appearance; never bulk-replace Windows visual baselines. Run targeted checks proportional to changed behaviour. A token-only adjustment needs meaningful contrast/visual verification, not a test that merely asserts its CSS string. Flow changes need their actual business outcomes and permissions checked.
