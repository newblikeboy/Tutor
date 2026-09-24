# Tutor application

The tutor signup route opens `/apply`. Email/password authentication is retained. The form uses the signed-in account name and read-only account email; the collected mobile number is contact information, not an assertion of OTP verification. Existing approved tutor records remain valid without the new profile.

## Seven steps

1. **About you:** full name, optional display name, mobile, city and communication languages. Locality and PIN become required in the service step when Home Tuition is requested. No exact residential address or profile photograph is collected.
2. **Education and experience:** completed qualification, specialisation, institution/year; conditional current-study details; optional additional qualifications, résumé and up to six education documents (degree, marksheets or certificates); experience or an explicit new-tutor choice; occupation and outside-teaching restrictions. PDF/JPG/PNG uploads are limited to 3 MiB each, save privately to Cloudinary, and immediately persist their selected IDs in the application. Files remain optional for existing applicants; uploads never imply approval.
3. **What you can teach:** up to eight independent subject/class-range/board/language/mode cards, prior experience and the first area to assess. Each card stores `modes: ["home"]`, `["online"]` or both. Supported application choices are Mathematics, Science, English, Hindi and Social Science, classes 1–12, CBSE/BSEB/ICSE. These are private requests, never permissions.
4. **Availability and service:** weekly windows in Asia/Kolkata, start date, weekly capacity, additional-student capacity, session lengths, continuity and interruptions. Home requests include service localities, travel radius, charge treatment and travel buffer at the student's home. Online requests include device, camera, microphone, internet, private space, screen sharing and digital writing, including readiness-help answers.
5. **Teaching approach:** introduction, response to a learner who does not understand, checking understanding, live or recorded demonstration, optional worksheet and assessment availability. Recorded demonstrations require a selected requested area, topic and saved private MP4. Live demonstration remains available when uploads are disabled.
6. **Fee expectations:** staff guidance or a separate expected payout for every requested area/mode, stored as integer paise per 60 minutes. This does not create public prices, agreements, payment methods or bank details.
7. **Review and submit:** all six sections can be revisited. Accuracy/assessment, conduct and application data use have separate required acknowledgements; optional marketing is unchecked initially. The versioned draft notice is displayed, with retention/deletion terms explicitly awaiting release review. The server records receipt time and notice version.

## Persistence and access

`GET /api/v1/application` returns only the authenticated tutor's own application and current notice version. `PUT /api/v1/application` accepts `{version, step, submit, profile}`. Save draft, Back, step navigation and Save & continue persist through Go transactions to the existing MongoDB `applications` collection. Incomplete bounded drafts are allowed; submission validates the entire profile. Draft progress and form revision persist separately from staff/file revisions. Stale tabs receive a conflict and retain their unsaved answers. Application answers are never stored in localStorage.

The application profile is private. Account ownership, role checks, exact Origin, session cookies and CSRF still apply. Staff can read the full submitted profile and filter by requested mode. Unassigned mentors retain the existing staff access restrictions. Public tutor DTOs exclude contact details, requested modes, fees, documents, availability and declarations. Approved scope remains a separate server-controlled field.

Employed teachers and applicants reporting permission requirements, restrictions or uncertainty receive a pending eligibility review. An administrator records `cleared` or `blocked`, with evidence/reason and timestamp. This is an operational review record, not automatic employment or legal clearance. Approval rejects unresolved/blocked eligibility and any scope outside the first requested assessment area. The existing activation service remains Online Mathematics, classes 6–10; Home Tuition and other subject requests are recorded for staff review without enabling unsupported bookings.

## Files and operational limits

Optional documents use the existing private, configured storage flow: PDF/JPEG/PNG up to 3 MiB. Application-only MP4 containers allow up to 25 MiB; their container framing/signature/extension is checked, not playback, duration, teaching quality or the absence of children. The interface recommends 3–5 minutes and excludes children. Files remain quarantined until a real configured scanner succeeds. Authenticated attachment downloads recheck access. Submission verifies each selected file belongs to this application and has the correct type and an allowed state. No public demo URLs are collected.

Use `go run ./cmd/migrate -application-only` for the additive core-collection validator/index changes, including a requested-mode index. This creates no collection and deletes no records. Full development/test migrations also apply it. Existing extension limitations on the capacity-limited Atlas environment remain; storage/scanning is not silently enabled.

Design reference: [W3C multi-page forms](https://www.w3.org/WAI/tutorials/forms/multi-page/). File controls retain the principles in the [OWASP upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html). No design skill was used.
