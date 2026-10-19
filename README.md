# AI for Humans — workshop questionnaire

A small bilingual questionnaire: participant details → twelve questions, one at a time → thank you. English and Persian, including right-to-left layout. No participant accounts, AI API, ORM, or separate backend.

## Stack and structure

- Next.js App Router and React, with plain JavaScript and CSS.
- Supabase PostgreSQL through server-side REST requests; one `submissions` table.
- `react-markdown` renders the existing questionnaire text without executing raw HTML.
- [Participant UI](./app/survey.jsx), [submission endpoint](./app/api/submission/route.js), [private admin](./app/admin/route.js).
- [Question loader](./lib/questions.mjs), [validation and export](./lib/validation.mjs), [server/database helpers](./lib/server.mjs).

## Local setup

1. Install Node.js 22 or newer and run `npm install`.
2. Create a Supabase project and run [schema.sql](./supabase/schema.sql) once in its SQL editor.
3. Copy [.env.example](./.env.example) to `.env.local` and fill in all four values:
   - `SUPABASE_URL`: your project's URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: server-only service-role key. Never prefix it with `NEXT_PUBLIC_` or share it with participants.
   - `ADMIN_PASSWORD`: a long, random password, at least 16 characters. Replace the example value.
   - `PRIVACY_CONTACT`: your real contact email, displayed beside the privacy notice.
4. Run `npm run dev` and open `http://localhost:3000`.

Without database credentials, the welcome page is viewable, but starting a questionnaire deliberately fails rather than pretending to save data. The form collects first name, last name, integer age (1–120), email, language (`en`/`fa`), and agreement to the storage notice. Email syntax is checked; email ownership is not verified.

## Your dataset

Open `/admin`. Your browser prompts for username **admin** and the `ADMIN_PASSWORD`. This uses HTTP Basic authentication to avoid an additional account system. Always use HTTPS outside local development. Use a private browser window on shared computers and close it to end the admin session.

You can browse participants, view individual responses, filter completed/in-progress submissions, and download all matching rows as UTF-8 CSV, not just the visible page. A second export omits names and emails; it is **not guaranteed anonymous**, since age and free text can still identify someone.

Each database row contains:

| Fields | Meaning |
| --- | --- |
| `id`, `first_name`, `last_name`, `age`, `email`, `language` | Participant information and a random submission reference |
| `questionnaire_version` | Fingerprint of participant-facing content |
| `answers` | JSON object keyed by stable `q01`–`q12` IDs |
| `current_question`, `revision` | Resume position and concurrent-save protection |
| `started_at`, `completed_at` | UTC timestamps; a null completion means in progress |
| `privacy_notice_version`, `consented_at` | Accepted notice version and acceptance timestamp |
| `session_hash` | Hash of a random browser-session token; never included in exports |

Answers contain `choices` (1-based option IDs stored as strings), `text`, `followup`, `attraction`, and `concern`. Option IDs align between languages. CSV has one row per submission, with a column for each question/answer field; multiple selections are separated by `|`. Unused cells remain blank. Text cells are escaped to reduce spreadsheet-formula injection risks.

Repeat email addresses are allowed: an email is contact information, not an account. An existing session resumes its own submission. Another browser or an expired session can create a new one.

## Saving behavior

- **Save & continue** persists an answer before advancing. Failed saves retain the current input and show a retry message. Closing the page before continuing can lose the unsaved draft; the browser warns when possible.
- Refresh resumes saved progress in the same browser for seven days. Names and emails are not stored in local storage or returned by the resume endpoint.
- Previous navigation keeps local drafts. Follow-up explanations are optional; the rain question requires text. Authorship accepts up to two choices or an own consideration; selecting “something else” requires that text. The final question requires exactly two claims; closing written reflections are optional.
- Final submission validates all twelve answers and marks the row complete atomically. Completed rows cannot be edited through the participant API. Retrying final submission is safe.
- An opaque, HTTP-only, SameSite cookie identifies the participant. Only its hash is stored in the database. Writes require same-origin JSON requests. Stale concurrent writes are rejected rather than silently overwriting another tab.

## Editing questions

The existing [English](./language-models-workshop-questionnaire.md) and [Persian](./language-models-workshop-questionnaire.fa.md) files remain the source of truth. Only participant sections are loaded; facilitator guides and answer keys are not sent to browsers. Keep the existing twelve-question structure, option order, and aligned translations. Layout and validation rules for unusual questions live in the loader and validation helper.

Keep a copy of the questionnaire files with each collected dataset. Changing participant content changes the stored version fingerprint. An unfinished older-version session is blocked from continuing to prevent mixing versions; completed older responses remain exportable. The admin avoids mapping older option IDs to potentially changed current labels. If you need to run multiple live questionnaire versions later, add explicit content snapshots then—not a questionnaire-builder system now.

## Deploy

1. Import this repository into Vercel as a Next.js project, or use another Node.js host.
2. Add the four environment variables above to the deployment. Use a suitable database region for your participants.
3. Run `npm run build` (Vercel does this automatically). For a Node host, run `npm start` behind HTTPS.
4. Complete a pilot submission, verify it in `/admin`, and download a CSV before sharing the link.

Database row-level security is enabled, with no public/participant policies. Only the server's service role accesses the table. Keep production secrets out of source control. Use host-level rate limits for `/admin` and `/api/submission`; this deliberately small app does not include CAPTCHA or a distributed rate limiter. A broadly public campaign should add appropriate abuse protection before launch.

Decide and communicate your data-retention period before collecting real responses. No automatic deletion is configured. You can delete a participant's entire row using Supabase's table editor, including their answers. Retention, access/deletion requests, and backups are the organizer's responsibility. For children, decide an appropriate consent/eligibility process before using this form; the age field alone does not provide one.

## Checks

```sh
npm test
npm run build
npm run test:integration
```

Unit tests cover bilingual content parsing, profile/answer validation, completion, and CSV safety. Integration tests run the production app against an isolated in-memory REST fixture, not your real database. They cover sessions, saving, privacy boundaries, concurrency, admin authorization, and export. A real Supabase smoke test is still required before collecting participant data.
