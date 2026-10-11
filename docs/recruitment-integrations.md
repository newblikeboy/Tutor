# Tutor application integrations

Meetings now use Google Calendar and Google Meet for assigned-mentor interviews and approved-tutor online lessons. Zoom credentials, adapter, worker dispatch and active controls are removed. Historical records are retained. See [Google setup and interview verification](google-interviews.md) and [Google teaching lessons](google-lessons.md).

Set `MEDIA_PROVIDER=cloudinary` and `VIDEO_PROVIDER=cloudinary` with the private Cloudinary credentials in `.env.example`. Browser uploads go directly to authenticated Cloudinary storage; Go verifies provider metadata before saving ready references. Authorize each viewing link against the current assignment. Cloudinary has no local scanner prerequisite. See [private files](private-files.md).

Set `INTERVIEW_PROVIDER=google` and `MEETING_PROVIDER=google` with the existing `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, registered `GOOGLE_OAUTH_REDIRECT_URI` and persistent `GOOGLE_TOKEN_KEY`. Keep all credentials in the private environment. Missing credentials fail enabled-provider startup. Production and live provider verification remain separate operator-controlled steps.

The application saves through Go/MongoDB and automatically routes submitted applications to an active mentor. Registration does not approve a tutor. Only the assigned mentor conducts the interview, submits the four-rating assessment and finalizes fees and scope; admins route applications and manage account access. The approved sign-in and current Cloudinary upload flows remain.

Earlier provider verification is recorded in historical progress/acceptance entries; it does not assert current Google live consent or deployment acceptance.
