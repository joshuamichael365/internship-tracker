# Production Deployment Walkthrough

The production requirement: discovery + notifications run 24/7 in the cloud, independent of
your laptop. Target: **Railway** — one project with three services (web, worker, Postgres),
~$5–10/mo at this workload.

Steps marked **[you]** need your accounts/browser; everything else is config that's already in the repo.

## 1. Railway — hosting (~$5–10/mo)

1. **[you]** Sign up at https://railway.com (GitHub sign-in), add a payment method (Hobby plan).
2. **[you]** `brew install railway` (or `npm i -g @railway/cli`), then `railway login`.
3. From the repo root:
   ```sh
   railway init                       # create project "internship-tracker"
   railway add --database postgres    # managed Postgres
   ```
4. Create the two app services (dashboard → New Service → GitHub repo, once the repo is pushed):
   - **web** — root directory `apps/web`; build `pnpm install && pnpm --filter web build`; start `pnpm --filter web start`.
   - **worker** — root directory `apps/worker`; build `pnpm install`; start `pnpm --filter worker start`.
   (Railway auto-detects pnpm workspaces; set "Root Directory" to `/` and override the start command per service if it doesn't.)
5. Set env vars (both services get `DATABASE_URL` by referencing the Postgres service):
   - Both: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `APP_URL=https://<web-domain>`
   - Web: `AUTH_SECRET` (fresh `openssl rand -base64 32`), `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAIL=joshuamichael365@gmail.com`, `VAPID_PUBLIC_KEY`, `EXTENSION_TOKEN` (fresh `openssl rand -hex 24`), `ANTHROPIC_API_KEY`, `UPLOAD_DIR=/data/uploads`
   - Worker: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NOTIFY_EMAIL_TO`, `RESEND_API_KEY`, `TWILIO_*`, `ANTHROPIC_API_KEY`
   - **Generate fresh VAPID keys for prod** (`pnpm dlx web-push generate-vapid-keys`) — don't reuse the dev pair in git-ignored `.env`.
6. Attach a **volume** to the web service mounted at `/data` (uploads/documents persist across deploys).
7. Run migrations once: `railway run --service web pnpm db:migrate`.
8. Verify: open the web domain, sign in with Google, add the SimplifyJobs source, close your laptop, and confirm a notification arrives on your phone when the repo next updates.

## 2. Google OAuth — sign-in now, Drive/Gmail later

1. **[you]** https://console.cloud.google.com → create project `internship-tracker`.
2. APIs & Services → OAuth consent screen → External → add yourself as a test user (stays in "Testing" mode forever — it's a single-user app).
3. Credentials → Create OAuth Client ID → Web application:
   - Authorized redirect URI: `https://<web-domain>/api/auth/callback/google` (plus `http://localhost:3000/api/auth/callback/google` for dev).
4. Copy client id/secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`, remove `AUTH_DISABLED` from any env, redeploy.
5. For **Google Drive storage** (optional): enable the Drive API in the same project, add scope `https://www.googleapis.com/auth/drive.file` on the consent screen, mint a refresh token via OAuth playground (https://developers.google.com/oauthplayground with your own client creds), set `GDRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN` on the web service.

## 3. Anthropic API — drafting + tagging (~$3–5/mo at realistic usage)

1. **[you]** https://console.anthropic.com → sign up → API Keys → create key. Add $5–10 of credit.
2. Set `ANTHROPIC_API_KEY` on both services. Cover letters run on claude-sonnet-5 (~2–4¢ each); resume parsing and posting tagging use claude-haiku-4-5 (fractions of a cent).
3. Re-upload your resumes once after setting the key so parsing fills the structured profile.

## 4. Resend — email channel (free tier)

1. **[you]** https://resend.com → sign up → API key → `RESEND_API_KEY` on the worker.
2. Without a custom domain, mail sends from `onboarding@resend.dev` (fine for personal alerts, 100/day free). Optionally verify a domain later and set `RESEND_FROM`.

## 5. Twilio — SMS channel (~$5–10/mo, slowest setup: start early)

1. **[you]** https://www.twilio.com → sign up, upgrade off trial, buy a local US number (~$1.15/mo).
2. US carriers require **A2P 10DLC registration** even for personal use: Messaging → Regulatory Compliance → register as **Sole Proprietor** (~$4/mo + one-time fees), create a campaign ("personal notifications"), attach your number. Approval typically takes 1–5 days.
3. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `NOTIFY_SMS_TO=+1XXXXXXXXXX` on the worker, then flip the SMS toggle on in Settings → Notifications.

## 6. Chrome extension (2 minutes)

1. `chrome://extensions` → enable Developer mode → **Load unpacked** → select `apps/extension/`.
2. Extension options → App URL = your web domain (or `http://localhost:3000` in dev), token = the `EXTENSION_TOKEN` value.
3. Open a tracked application's portal page → click the extension → **Fill this page**.

## Cost summary

| Item | Monthly |
|---|---|
| Railway (web + worker + Postgres) | ~$5–10 |
| Twilio SMS + A2P fees | ~$5–10 |
| Anthropic API | ~$3–5 |
| Resend, web push, R2/volume | $0 |
| **Total** | **~$15–25** |

## Dev-only flags to never set in production

- `AUTH_DISABLED` — bypasses Google sign-in (blocked in production builds by code, but don't set it anyway).
