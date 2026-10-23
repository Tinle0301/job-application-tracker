# Email sync (Gmail)

Connect the Gmail account you apply from, and the tracker fills itself in:

- **New applications.** When a company confirms you applied ("Thanks for applying", "We received your application", LinkedIn's "Your application was sent to …"), the job is added as **Applied** on the day the email arrived. When the email links to the job posting, that link is saved. For any application with a posting link and no description (including a link you add with **Edit**), the next check fetches the posting and fills in the job description (at most 5 per check, each link once). Careers sites that turn away a plain fetch, or render the job with JavaScript, are opened in a real browser by [Jina Reader](https://jina.ai/reader/) instead (free, no key, no AI call). When the reader is busy, it tries again on the next check. Each skip is written to the `email-scan` logs. A job with a posting link but no description also has a **Get description** button that reads the link right away.
- **Status changes.** Applications move along when an assessment invite, an interview invite, an offer or a rejection arrives. Every change shows in the application's timeline as **from email**.
- **Email dates.** Timeline steps an email caused (Applied from a confirmation, Assessment, Interviewing, …) are dated when the email arrived, not when the inbox was checked. While a job stays at a stage past Applied that an email set, that step shows the date of the newest email about the job (e.g. the latest assessment reminder).
- **Email history.** Open an application's row to see every email received about that job, newest first, with its date, subject and sender. The subject opens the email in Gmail.

Anything the tracker adds or changes can be undone.

Off until enabled: the panel only appears when the build has `VITE_ENABLE_EMAIL_SYNC=true`.

## How it works

1. **Connect.** The app asks `email-connect` for Google's consent URL and sends the user there. Google asks for one permission: _read your email_ (`gmail.readonly`; the app can never send, delete or change mail). Google redirects back to `email-connect`, which exchanges the code for a refresh token, encrypts it (AES-GCM, key in the `EMAIL_TOKEN_KEY` secret) and stores it in `email_connections`. Users have no grants on that table; the browser only ever sees the address and the last check time (`my_email_connection()`).
2. **Check.** `email-scan` runs when the user clicks **Check inbox**, automatically when the app opens and the last check is more than 6 hours old, and (optionally) on a schedule for everyone. It first looks for new applications:
   - searches Gmail for confirmation phrases since the last check (first time: the last 30 days), at most 100 messages, and keeps those whose subject or preview reads like a confirmation;
   - fetches their bodies (at most 30 per check) and asks Gemini, 10 at a time, whether each confirms a submitted application, and for which company (never the job board or ATS that sent it), role and location;
   - decides what to do (`decideNewApplication` in `supabase/functions/_shared/email.ts`):
     - **Added now:** the model is at least 75% sure, the email names both company and role, and no tracked application at that company has a similar title. Another role at a company you already track is a new application.
     - **Duplicate:** a tracked application at the same company has a similar title (e.g. "Software Engineer" and "Software Engineer II, Backend"). Nothing is added; a Wishlist entry moves to Applied and gets the email's date as its applied date.
     - **Suggested:** the model is less sure, the role is missing, the title only partly matches a tracked one, or the matching application was already Rejected or Withdrawn before this email (a re-application). The user can fix the company and role, then tap **Add**, or **Dismiss**.
     - **Ignored:** not a confirmation. These emails still go through the status check below.

   Then it updates statuses:
   - searches Gmail for job-related mail since the last check (first time: the last 30 days), at most 100 messages;
   - reads only the sender, subject and snippet of each, and matches them to tracked applications by company (the sender's own domain, the sender name, the subject, then the snippet). Emails from applicant-tracking systems (Greenhouse, Lever, Workday, …) match by name. Emails that mention three or more tracked companies (job alerts, digests) are skipped;
   - fetches the body of matched emails only (at most 30 per check) and asks Gemini, 10 at a time, which stage each one shows: applied, assessment, interviewing, offer, rejected, or none;
   - decides what to do (`decideUpdate` in `supabase/functions/_shared/email.ts`).

   Every matched email is also listed under its application (`application_emails`), whatever the model says about it. The first check after connecting, and the first check after an application is added, look back 30 days for these, so emails that arrived before the job was tracked show up too (only the status check is limited to mail since the last check).

3. **Decide.**
   - **Applied now:** a forward move (Applied → Assessment → Interviewing → Offer) or a rejection, when the model is at least 75% sure and the email clearly belongs to one application.
   - **Suggested:** anything less certain, an email that fits two applications at the same company equally well, news about an application already marked Rejected or Withdrawn, or a rejection after an offer. The user taps **Apply** or **Dismiss**.
   - **Ignored:** no change, or a step backwards (a late "we received your application" after an interview invite).
4. **Undo.** For an added application, `undo_email_application()` deletes it, as long as it is still at Applied (once it has moved on, delete it by hand). For a status change, `undo_email_update()` puts the previous status back and deletes the email's row from the timeline, so a wrong guess doesn't count in the pipeline stats. If the status was changed by hand after the email, undo is refused and the user sets it by hand.

Each Gemini call counts toward the daily AI limit (`AI_DAILY_LIMIT`, shared with auto-fill and resume match). When a check hits a limit it stops early, keeps the last check time where it was, and the next check continues.

## What is stored

Only for emails that changed or could change a status: the Gmail message id, sender address, subject, date, detected stage, the model's confidence and a one-line reason (`email_status_updates`). For confirmation emails: the same, plus the company, role, location and a link to the email (`email_new_applications`); confirmation-looking emails that turned out not to be confirmations keep only their message id, so they aren't read twice. For every email matched to an application: its message id, sender, subject, date and a Gmail link (`application_emails`), to list them under the application. Email bodies are never stored. Other emails leave no trace.

**Disconnect** revokes the token at Google and deletes it. Status changes already made stay.

## Privacy and Google's rules (read this before sharing the app)

- **Gmail read access is a _restricted_ scope.** While the Google Cloud app is in **Testing**, it works for up to 100 test users you list by hand (you included), and Google shows an "unverified app" warning on the consent screen. Letting anyone else sign in requires Google's app verification **and** an annual third-party security assessment (CASA) for restricted scopes. Until then, keep the app in Testing and use it for your own account.
- **In Testing, Google expires the refresh token after 7 days.** The panel then says _Google access expired_ and shows **Reconnect Gmail**; reconnecting takes one click.
- **Matched emails are sent to Gemini.** On Gemini's free tier, Google may use prompts to improve its products. Use a paid Gemini key if that matters to you. Google's [user data policy](https://developers.google.com/terms/api-services-user-data-policy) also limits how Gmail data may be used with AI models; review it before applying for verification.

## Setup

You need: a Google account, the Supabase project from [SETUP.md](SETUP.md), the Supabase CLI, and AI already enabled (`GEMINI_API_KEY`, step 3 of SETUP.md).

### 1. Google Cloud OAuth client

1. Open [console.cloud.google.com](https://console.cloud.google.com) → project picker → **New project** (e.g. `job-tracker`) → **Create**, and select it.
2. **APIs & Services → Library** → search **Gmail API** → **Enable**.
3. **Google Auth Platform** (called **OAuth consent screen** in older consoles) → **Get started**:
   - App name `Job Application Tracker`, your email as support email → **Next**
   - Audience: **External** → **Next**
   - Contact email: yours → agree → **Create**.
4. **Audience → Test users → Add users** → add the Gmail address you apply from. Leave the publishing status on **Testing**.
5. **Data Access → Add or remove scopes** → paste `https://www.googleapis.com/auth/gmail.readonly` under _Manually add scopes_ → **Add to table → Update → Save**.
6. **Clients → Create client** → type **Web application**, name `job-tracker` → under **Authorized redirect URIs** add exactly:

   ```
   https://<project-ref>.supabase.co/functions/v1/email-connect
   ```

   → **Create**. Copy the **Client ID** and **Client secret** (download the JSON; newer consoles show the secret only once).

### 2. Supabase

1. In the SQL editor, run `backend/migrations/0007_email_sync.sql` and then `0008_email_new_applications.sql` (after 0001–0006). Then run `0009_application_emails.sql`, `0010_email_dates_and_postings.sql` and `0011_stage_dates_and_posting_links.sql`. If you already ran 0007, run whichever of 0008–0011 you haven't and redeploy `email-scan`; the next check looks back 30 days for confirmations and for emails to list under each application.
2. Set the secrets (never in `.env` or any `VITE_*` variable):

   ```bash
   supabase secrets set GOOGLE_CLIENT_ID=<client id>
   supabase secrets set GOOGLE_CLIENT_SECRET=<client secret>
   supabase secrets set EMAIL_TOKEN_KEY="$(openssl rand -base64 48)"
   supabase secrets set APP_URL=https://<your-app>.vercel.app
   ```

   `EMAIL_TOKEN_KEY` encrypts the stored Gmail tokens; changing it later disconnects everyone (they reconnect with one click). `APP_URL` is where Google's redirect sends the user back.

3. Deploy both functions. They check the caller themselves, so the gateway's JWT check is off (also set in `supabase/config.toml`):

   ```bash
   supabase functions deploy email-connect --no-verify-jwt
   supabase functions deploy email-scan --no-verify-jwt
   ```

### 3. Vercel

Add `VITE_ENABLE_EMAIL_SYNC=true` (Production) and **redeploy**. The applications page now shows **Connect Gmail**. Click it, pick your Gmail, continue past the unverified-app warning (**Advanced → Go to Job Application Tracker**), allow _Read your email_, and you land back in the app while it checks your inbox.

### 4. Schedule (optional)

The app already checks when it opens if the last check is over 6 hours old. To check even when the app is closed, set a scan secret and schedule a call with Supabase Cron:

```bash
supabase secrets set EMAIL_SCAN_SECRET="$(openssl rand -hex 32)"
```

Then enable the `pg_cron` and `pg_net` extensions (**Database → Extensions**) and run in the SQL editor:

```sql
select cron.schedule('email-scan', '0 */6 * * *', $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/email-scan',
    headers := jsonb_build_object('content-type', 'application/json', 'x-scan-secret', '<EMAIL_SCAN_SECRET>'),
    body := '{}'::jsonb
  );
$$);
```

The secret is stored in the cron job; anyone with SQL access to the project can already read far more, so this is fine for a personal project. Remove it with `select cron.unschedule('email-scan');`.

## Troubleshooting

| What you see                               | Why / fix                                                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Google says `redirect_uri_mismatch`        | The redirect URI in step 1.6 must match `https://<project-ref>.supabase.co/functions/v1/email-connect` exactly.   |
| Google says the app is blocked / no access | Your Gmail isn't in **Audience → Test users**.                                                                    |
| _Email sync is not configured_             | A secret from step 2.2 (or `GEMINI_API_KEY`) is missing; set it and redeploy both functions.                      |
| _Google access expired_                    | Normal in Testing mode every 7 days, or access was removed in your Google account. Click **Reconnect Gmail**.     |
| A status moved wrongly                     | Click **Undo** next to it in the email panel.                                                                     |
| A job was added that you didn't apply to   | Click **Undo** next to it in the email panel (under _New applications from email_).                               |
| A confirmation wasn't picked up            | Only emails from the last 30 days (first check) are read. Add it by hand, or check its subject is a confirmation. |
