# CLAUDE.md — Internship Tracker & Auto-Apply Assistant

Deep orientation and hard-won context for anyone (human or AI) taking over this project.
This file is written to carry **full context across a machine/account handoff** — read it top to
bottom before touching anything.

**Companion docs:** `docs/CODEBASE.md` (exhaustive file-by-file, ~1300 lines) · `docs/COSTS.md`
(billing model) · `DEPLOYMENT.md` (production runbook) · `docs/PROJECT_DOCUMENTATION.pdf` (narrative
tour). Cross-session memory also lives at
`~/.claude/projects/-Users-joshu-internship-tracker-application/memory/` (project-decisions.md,
build-progress.md) — **note that path is machine-specific and will NOT transfer to a new account;
this file is the durable replacement for it.**

---

## 1. What this is & who it's for

A **single-user, personal** web app for one person (Joshua, joshuamichael365@gmail.com). It:
- **Discovers** new SWE/ML/CS internship postings near-real-time (polls sources every 60 seconds,
  including non-standard-README repos via a per-source column-map override) plus a manual
  **Screenshot Intake** route (`/intake`) for postings that only ever surface as a social-media
  screenshot.
- **Notifies** via web push (instant, quiet-hours aware) and a **twice-daily HTML email digest**
  (default 8am/5pm), with an instant per-company **watchlist** that bypasses both the digest and
  quiet hours (SMS built but off by default).
- **Tracks** applications through a 7-stage Kanban pipeline with per-application reminders/OA
  deadlines and generated **interview & skill-prep guidance** (focus areas, practice problems linked
  to LeetCode/NeetCode, project ideas, behavioral prompts).
- **Assists applications** at three explicit, user-chosen automation levels — Manual / Agentic Assist
  / Full Auto-Apply (see §6) — gated by both a per-application opt-in AND a global master kill switch
  (`settings.auto_apply_enabled`, default off). A companion Chrome extension fills real portal forms
  in the user's own browser.
- **Resume Studio:** an in-app LaTeX resume editor with live Tectonic compile + an AI chat assistant,
  including a preview-before-apply step for chat-proposed changes.
- **Analytics:** a read-only dashboard (pipeline funnel, automation mode split, recommendation
  accuracy, notification activity, source health) built entirely from existing data.

It is deliberately **single-tenant**: no multi-user/sharing features; auth is a hard email allowlist
of exactly one address. Everything is architected so an iOS app *could* be added later against the
same backend, but none exists.

**Live production:** https://web-production-64a44.up.railway.app
**Repo:** github.com/joshuamichael365/internship-tracker (private)
**Original spec intent:** an "Apple Reminders meets LinkedIn meets Notion" tool — calm, fast,
Apple-HIG design, checked often under time pressure (internships are first-come-first-served, so
speed from notification → detail → apply is the whole point).

---

## 2. Tech stack & key dependencies (with real versions)

**Monorepo:** pnpm workspaces (`pnpm-workspace.yaml`: `apps/*`, `packages/*`). Node ≥ 22, pnpm 10.

**`apps/web`** — Next.js **16.2.10** (App Router), React **19.2.4**, TypeScript 5, Tailwind CSS **v4**.
- `next-auth` **5.0.0-beta.31** (Auth.js v5), Google provider, JWT sessions.
- `@anthropic-ai/sdk` ^0.109.1 — drafting, resume parsing, semantic option-matching, Resume Studio chat.
- `pdf-lib` ^1.17.1 — generates cover-letter / short-answer PDFs.
- `web-push` (used via worker) for VAPID push; `motion` ^12 for animation; `lucide-react` for icons.
- CodeMirror 6 (`codemirror`, `@codemirror/{state,view,commands,language,legacy-modes}`) — LaTeX editor.

**`apps/worker`** — long-running Node service. `graphile-worker` ^0.16.6 (Postgres-backed cron +
queue, **no Redis**), `fast-xml-parser` (RSS), `web-push`. **Run via `tsx` — never compiled to JS,
even in production** (`build` is `tsc --noEmit`, a typecheck only; `start` is `tsx src/index.ts`).

**`apps/extension`** — Chrome **Manifest V3**, vanilla JS, **no build step**. Current version **0.3.0**.
Permissions: `activeTab`, `scripting`, `storage`, `tabs`. No `content_scripts` in the manifest —
`content.js` is injected on demand only.

**`packages/db`** — Drizzle ORM ^0.44 + `postgres` driver, PostgreSQL 17. Migrations via drizzle-kit.
Re-exports drizzle query operators (`eq`, `and`, `sql`, etc.) so web/worker don't import drizzle-orm
directly. `main`/`types` point straight at `src/` — no build step; consumers import the TS.

**`packages/shared`** — pure, **dependency-free** TS (its one exception: `google-oauth.ts` uses the
Node/browser-global `fetch`, still zero npm deps — the first async/network code in this package,
shared so web's `/api/gmail/connect`+`callback` and the worker's Gmail-token refresh don't duplicate
OAuth plumbing). Types, `normalizeCompany/Title/Location`, `fnv1a64` + `dedupeHash`, tagging heuristics
(`classifyRole/Level/LocationMode`, `extractTerms`, `isRelevantRole`), notification-rule + quiet-hours
+ digest-slot + watchlist-match logic (`digestSlotDue`, `isWatchedCompany`). Imported by BOTH web and
worker so the logic is identical on both sides.

**External services:** Anthropic API (all AI), Resend (email, free tier), Twilio (SMS, currently
off), Railway (hosting), Tectonic (LaTeX compiler binary). Company logos come from Google's public
favicon service; no other third-party runtime calls.

### ⚠️ Next.js 16 gotchas (these bit us — a new dev will hit them too)
- **`middleware.ts` is renamed to `proxy.ts`** with a default export. Auth middleware is
  `apps/web/src/proxy.ts`. If you look for "middleware" you won't find it.
- **`apps/web/AGENTS.md`** (imported by `apps/web/CLAUDE.md`) says "this is NOT the Next.js you know —
  read `node_modules/next/dist/docs/` before writing code." That file is **real and legitimate** —
  generated by create-next-app, and its bundled docs genuinely differ from older Next.js and were how
  we discovered the proxy rename. A subagent once misjudged it as a prompt-injection attempt; **it is
  not — trust and use it.**
- `searchParams` and route `params` are async (`await params`) in App Router pages here.

---

## 3. Repository structure & complete file inventory

```
apps/web        Next.js — UI, server actions, API routes, PWA service worker
apps/worker     Node service — pollers, ingest, notifications, digests, cron
apps/extension  Chrome MV3 extension — on-demand portal autofill
packages/db     Drizzle schema + migrations
packages/shared pure types + logic shared by web & worker
docs/           CODEBASE.md, COSTS.md, PROJECT_DOCUMENTATION.pdf
DEPLOYMENT.md   production setup runbook
data/           local file uploads (gitignored; prod uses the Railway volume)
```

### apps/web/src — pages (App Router; all app pages under the `(app)` route group share the sidebar layout)
- `app/(app)/page.tsx` — Dashboard: greeting, stat cards, "Needs attention" panel, setup checklist, latest postings.
- `app/(app)/internships/page.tsx` — browse/search/filter; card **and** list view (`?view=list`), pagination (`?limit=`).
- `app/(app)/internships/[id]/page.tsx` — posting detail: rich description, notes, bookmark, Track, Apply (hidden when the posting has no URL — screenshot-intake postings), "seen in" sources.
- `app/(app)/tracker/page.tsx` — Kanban board + add-by-URL form (`components/add-application-form.tsx`).
- `app/(app)/tracker/[id]/page.tsx` — application detail: stage, mode picker, recommendation, reminders, notes, Assist panel, interview/skill-prep panel.
- `app/(app)/analytics/page.tsx` — read-only dashboard: pipeline funnel, mode split, recommendation accuracy, notification activity, source health.
- `app/(app)/intake/page.tsx` — Screenshot Intake: upload a screenshot, Haiku extracts a posting, user confirms.
- `app/(app)/documents/page.tsx` — generated documents list with download.
- `app/(app)/resume-studio/page.tsx` + `[id]/page.tsx` — LaTeX resume list & editor (with preview-before-apply for chat-proposed changes).
- `app/(app)/profile/page.tsx` — resumes, auto-fill profile fields, application-answers, writing samples.
- `app/(app)/settings/page.tsx` — sources manager, notification settings (digest hours + watchlist), Automation card (master Auto-Apply kill switch), Gmail status monitoring (P2-M2 connect/disconnect), storage destination.
- `app/(app)/archive/page.tsx` — expired/hidden postings.
- `app/(app)/loading.tsx` — skeleton shimmer for all (app) routes.
- `app/signin/page.tsx` — Google sign-in (public).
- `app/layout.tsx` — root (theme init, PWA manifest/metadata). `app/globals.css` — HIG design tokens.

### apps/web/src/app/actions — server actions (the mutation path, not REST)
`applications.ts` (stage/mode/reminders/manual-add + `approveAutoApply`), `assist.ts` (drafting +
document save + storage destination), `auth.ts` (`signOutAction`), `intake.ts` (Screenshot Intake:
`extractFromScreenshot` + `createPostingFromIntake`, dedupe/tag through the same pipeline as the
worker's ingest), `latex.ts` (Resume Studio CRUD + `chatLatex` + save-as-resume-version + preview-key
cleanup), `postings.ts` (bookmark/notes/track), `prep.ts` (`generatePrep` — interview/skill-prep
generation), `profile.ts` (resume upload/parse, profile save), `samples.ts` (writing samples),
`settings.ts` (now also `autoApplyEnabled`/`watchlistCompanies`/`digestHours`, plus `disconnectGmail()`
— revokes the Gmail grant with Google best-effort and clears the stored token), `sources.ts` (source
CRUD + presets + per-source README `columns` override).

### apps/web/src/app/api — route handlers (for external callers that can't use server actions)
- `api/auth/[...nextauth]` — NextAuth handler.
- `api/assist/{packet,document/[id],resume,report,match-option}` — the **extension's** endpoints.
  Bearer-token auth (`lib/extension-auth.ts`, constant-time compare + CORS). `packet` = data for the
  current tab (also the **master Auto-Apply kill-switch enforcement point** — downgrades `mode: "auto"`
  to `"assist"` in its response when `settings.auto_apply_enabled` is off, regardless of any
  per-application approval); `document`/`resume` = PDF bytes; `report` = auto-apply outcome
  (submitted/blocked/failed); `match-option` = Haiku semantic dropdown matching.
- `api/latex/{compile,pdf/[id]}` — session-gated Tectonic compile + PDF stream; `compile` accepts an
  optional `source` body field to compile a proposed (not-yet-applied) change as a throwaway preview;
  `pdf/[id]` accepts `?preview=1` to stream that throwaway PDF instead of the persisted one.
- `api/documents/[id]/download` — session-gated download.
- `api/push/subscribe` — web-push subscription registration.
- `api/gmail/{connect,callback}` — P2-M2's OAuth consent flow, deliberately separate from sign-in.
  `connect` sets a short-lived httpOnly CSRF-state cookie and redirects to Google requesting only
  `gmail.readonly`, `access_type=offline`, `prompt=consent` (forces a refresh_token every time).
  `callback` verifies the state cookie, exchanges the code, and persists ONLY the refresh token +
  connected email address to `settings` — never an access token, never anything from the inbox.
  Both are session-gated by the normal proxy wall (not in its exclusion list), same as every page.

### apps/web/src/lib — server-side libraries
`drafting.ts` (Sonnet cover-letter/short-answer generation, few-shot from writing samples;
offline-placeholder fallback when no API key), `recommendation.ts` (mode recommendation engine —
Manual/Assist only, conservative, learns from `mode_decisions`), `documents.ts` (PDF render + storage
routing), `storage.ts` (disk uploads under `UPLOAD_DIR`), `resolve-resume.ts` (pick resume for an
app: explicit → default → newest), `resume-parse.ts` (Haiku PDF→structured profile), `gdrive.ts`
(Drive upload, opt-in), `screenshot-extract.ts` (Haiku vision → posting fields for Screenshot Intake),
`interview-prep.ts` (Sonnet → `InterviewPrep`: focus areas/practice problems/project ideas/resources/
behavioral, P2-M3), `neetcode.ts` (LeetCode-search + NeetCode-150-link helpers, never a fabricated
slug), `latex-compile.ts` (**Tectonic execFile sandbox** — `compileLatexResume` persists,
`compileLatexPreview` writes a throwaway preview PDF without touching the saved resume — see §6/§9),
`latex-templates.ts` (built-in Jake's-Resume template), `extension-auth.ts`, `applied-side-effects.ts`
(`onApplied` — shared receipt + repost-hide logic), `format.ts` (timeAgo, greeting, labels).

### apps/web/src/components
`sidebar.tsx` (nav + account footer + sign-out; 10 links including Analytics and Screenshot Intake),
`posting-card.tsx` / `posting-list.tsx` / `view-toggle.tsx` (browse views — Apply link hidden when a
posting has no URL), `filter-bar.tsx`, `company-logo.tsx` (favicon + letter fallback),
`tracker-board.tsx` (Kanban, stage colors), `application-editor.tsx`, `assist-panel.tsx`,
`auto-apply-optin.tsx` (pre-submit preview + checkbox), `auto-apply-settings.tsx` (master Auto-Apply
kill switch), `gmail-settings.tsx` (P2-M2 — Connect/Disconnect + connected-email/last-synced display;
reads the `?gmail=connected|error` query param the callback route sets and surfaces it as a toast),
`prep-panel.tsx` (interview/skill-prep card, all modes), `screenshot-intake.tsx`
(upload → extract → confirm → create/track), `add-application-form.tsx` (Tracker's add-by-link
panel), `submit-button.tsx` (drop-in `useFormStatus` pending button), `profile-manager.tsx`,
`writing-samples.tsx`, `sources-manager.tsx` (+ README column-map field), `notification-settings.tsx`
(+ digest-hours pickers + watchlist input), `storage-settings.tsx`, `latex-studio.tsx` (+
preview-before-apply banner) / `latex-editor.tsx` / `latex-chat.tsx` (+ Preview button) /
`new-resume-button.tsx`, `rich-text.tsx` (safe paragraph/bullet/link rendering, no
`dangerouslySetInnerHTML`), `toast.tsx`, `motion.tsx` (FadeIn/StaggerGrid), `ui.tsx`
(Card/PageHeader/EmptyState/ModeBadge), `theme-toggle.tsx`.

### apps/worker/src
`index.ts` (graphile-worker boot + task registry + crontab), `ingest.ts` (the pipeline),
`notify.ts` (channel fan-out + `getSettings`/`deliver`/`onNewPosting`/`onSubmissionConfirmed` —
`onNewPosting` now splits watchlisted companies, instant on every channel, from everyone else, whose
email queues for the twice-daily digest while push/SMS stay instant), `email-template.ts`
(Simplify-style HTML: `renderDigestEmail`, `renderPostingEmail`), `gmail-client.ts` (P2-M2 — plain-fetch
Gmail REST client: `listRecentMessageIds`/`getMessageMeta` (metadata only, never `format=full`) +
`classifyStatusSignal` (Haiku, plain fetch — no SDK in the worker, matching `channels/*.ts`)).
`channels/{email,push,sms}.ts` (Resend/web-push/Twilio, each no-ops gracefully when unconfigured).
`sources/{http,github,ats,rss}.ts` (conditional-fetch helper + per-platform pollers; `github.ts` adds
`parseColumnMap`/`parseReadmeTable` for per-source non-standard README table layouts).
`tasks/{poll-sources,auto-archive,send-digest,send-reminders,send-confirmation,send-blocker-notice,
sync-gmail-status}.ts` (`send-digest.ts` now flushes at configurable clock-hour slots via
`digestSlotDue`, not "after quiet hours ends"; `sync-gmail-status.ts` is P2-M2 — see §9 for the full
flow, forward-only stage mapping, and what is/isn't ever persisted).

### apps/extension
`manifest.json` (v0.3.0), `popup.html`/`popup.js` (the only token holder; drives everything),
`content.js` (the DOM form-filler — `trackerFillCore`, `__trackerFill`, `__trackerAutoApply`,
`__trackerResolvePending`, `__trackerFinishAutoApply`), `options.html`/`options.js` (App URL + token
in `chrome.storage.sync`), `icon-128.png`.

---

## 4. Data model (Postgres via Drizzle — `packages/db/src/schema.ts`)

**Tables:** `sources`, `postings`, `resumes`, `applications`, `reminders`, `writing_samples`,
`documents`, `profile` (single-row), `settings` (single-row), `push_subscriptions`,
`notification_log`, `digest_queue`, `mode_decisions`, `latex_resumes`.

Key columns worth knowing:
- `postings`: `dedupe_hash` (UNIQUE — one card per company+role+location across all sources),
  `seen_in` jsonb (every source that reported it), `terms` jsonb (["Summer 2027"]), `status`
  (active/expired/hidden), `sponsorship`, `role_type`, `job_level`, `location_mode`, `bookmarked`.
- `applications`: `mode` (**nullable — NULL until the user explicitly picks; never defaulted**),
  `mode_recommendation` jsonb, `drafts` jsonb (reviewed cover letter + Q&A the extension fills),
  `auto_apply_approved_at` (set only via per-app opt-in, cleared on mode change; also gated by the
  master switch below), `prep` jsonb (cached `InterviewPrep` — focus areas/practice problems/project
  ideas/resources/behavioral, P2-M3), `blocker_retries` (notify at 3), `stage`, `resume_id`.
- `profile`/`settings`: single-row via `id boolean PK default true` + upsert. `settings` holds
  timezone (default America/New_York), quiet hours (23→7, now gates **push/SMS only**), channels
  `{push,email,sms:false}`, `notification_rules`, `storage_destination`, `include_new_grad`,
  `auto_apply_enabled` (**master Auto-Apply kill switch, default false** — enforced in
  `api/assist/packet/route.ts`), `watchlist_companies` jsonb `[]` (instant-alert bypass companies),
  `digest_hours` jsonb default `[8,17]` (twice-daily email digest send times), `last_digest_sent_at`,
  `gmail_enabled` (P2-M2, default false), `gmail_refresh_token` (**a real secret** — a long-lived
  gmail.readonly grant, obtained via the separate `/api/gmail/connect` consent flow, never sign-in),
  `gmail_connected_email`, `gmail_last_sync_at`.
- `latex_resumes`: `source` (.tex), `compiled_key`, `compile_log`, `chat_history` jsonb.

**Migrations** (drizzle-kit, in `packages/db/migrations/`): `0000` initial schema · `0001`
notification_rules default → `{}` · `0002` timezone → America/New_York + `applications.drafts` ·
`0003` `postings.terms` · `0004` `auto_apply_approved_at` + `blocker_retries` (Full Auto-Apply) ·
`0005` `latex_resumes` (Resume Studio) · `0006` `applications.prep` (interview/skill prep) · `0007`
`settings.auto_apply_enabled` (master kill switch) · `0008` `settings.watchlist_companies` +
`digest_hours` + `last_digest_sent_at` (notification overhaul) · `0009` `settings.gmail_enabled` +
`gmail_refresh_token` + `gmail_connected_email` + `gmail_last_sync_at` (P2-M2). Generate a new one
after any `schema.ts` change with `pnpm db:generate`, then `pnpm db:migrate`.

**Job queue (graphile-worker, in Postgres).** Crontab in `apps/worker/src/index.ts`:
```
* * * * *   poll_sources      # every minute
*/5 * * * * send_digest       # flush at configured digest-hour slots (default 8am/5pm), not quiet-hours-based anymore
*/5 * * * * send_reminders    # fire due OA/follow-up reminders
13 * * * *  auto_archive      # expire past-deadline postings (offset to avoid top-of-hour clash)
*/15 * * * * sync_gmail_status # P2-M2, opt-in — no-ops instantly if Gmail isn't connected
```
`send_confirmation` and `send_blocker_notice` are **not** cron'd — the web app enqueues them on demand
via `select graphile_worker.add_job(...)` (from `lib/applied-side-effects.ts` and
`api/assist/report`). This SQL-enqueue is the ONLY web↔worker channel — they never talk over HTTP.

---

## 5. End-to-end flows (how the pieces connect)

1. **Discovery → notification:** cron `poll_sources` → per-source poller (conditional HTTP, mostly
   304s; GitHub repos with non-standard README tables use the per-source `columns` map) → `ingest.ts`:
   normalize → `dedupeHash` → tag → suppress if company+role already applied → insert → `onNewPosting`
   → rule check → **watchlisted company** = instant on every channel (bypasses digest + quiet hours);
   everyone else = push/SMS instant (unless quiet hours) + email queued for the **twice-daily digest**
   (`send_digest`, flushed at `settings.digest_hours` slots, default 8am/5pm — no longer tied to quiet
   hours ending). First poll of a new source is silent (`skipNotify`) so adding a 15k-listing repo
   doesn't fire hundreds of alerts. **Screenshot Intake** (`/intake`) is a parallel, manual entry point:
   a vision model (Haiku) extracts posting fields from a user-uploaded screenshot, the user confirms
   every field, and confirmation runs through the same normalize/dedupe/tag pipeline as a polled posting.
2. **Track & assist:** open posting → Track (creates `applications` row, `mode` NULL) → on the app
   detail, `recommendation.ts` suggests Manual/Assist → user picks → Assist panel drafts cover letter
   + answers (`drafting.ts`, Sonnet, few-shot from writing samples) → user edits → Save → PDFs to
   chosen storage + `drafts` persisted for the extension.
3. **Extension fill:** popup calls `/api/assist/packet` (bearer token) → injects `content.js` with
   profile+drafts as args → fills fields (green=filled, orange=review); unmatched dropdowns go to
   `/api/assist/match-option` (Haiku maps stored answer → the portal's option wording) → user reviews
   → submits themselves (Assist) or extension submits after opt-in (Auto-Apply) → `/api/assist/report`
   → receipt + repost-hide via `onApplied`.
4. **Applied side-effects:** stage→Applied (manual or auto) stamps date, enqueues `send_confirmation`,
   hides matching active reposts.
5. **Resume Studio:** new resume from template → CodeMirror edit (autosave) → Compile
   (`/api/latex/compile` → Tectonic execFile in a temp dir) → PDF preview → Chat (`chatLatex`, Sonnet,
   emits `<latex>...</latex>` you can **Preview** as a throwaway compile before committing, or Apply
   with one-level undo) → Save as resume version (copies PDF into `resumes`, runs `resume-parse.ts`) →
   becomes selectable per application and attachable by the extension.
6. **Digest / reminders / prep:** `send_digest` flushes `digest_queue` as an email at each configured
   digest-hour slot (default 8am/5pm), independent of quiet hours; `send_reminders` fires due
   reminders — both fan out through `notify.deliver`. On the application detail page, `generatePrep`
   (any mode) turns the linked posting's description into cached interview/skill-prep guidance
   (`applications.prep`) with LeetCode/NeetCode-150 links, regenerable on demand.
7. **Auto-Apply master switch:** `/api/assist/packet` checks `settings.auto_apply_enabled` (Settings →
   Automation, default off) before ever reporting `mode: "auto"` to the extension — if the switch is
   off, an approved application is reported as `assist` instead, so the extension structurally cannot
   submit anything while the switch is off, regardless of any individual application's opt-in.

---

## 6. The three application modes (core product concept — NEVER violate)

Per posting the user explicitly chooses one; **the mode is NULL until they pick — never silently
defaulted.** These are hard product invariants, not UI preferences:
- **Manual** — app tracks only; user fills the portal.
- **Agentic Assist** — AI drafts cover letter + short answers in the user's voice (always editable),
  saves documents, extension fills the form, **never submits** — user reviews & clicks Submit.
- **Full Auto-Apply** — same, plus submit, but only after a **deliberate per-application opt-in** with
  a pre-submit preview + explicit checkbox (`auto-apply-optin.tsx`). Revocable anytime. **Never a
  global "always auto-submit" toggle** — the per-application opt-in is still mandatory even with the
  master switch on. There IS now a global **kill switch** (`settings.auto_apply_enabled`, default
  **off**, Settings → Automation) added on top of the per-app opt-in — but it only ever *downgrades*
  (forces every application back to Assist-like fill-only behavior when off); turning it on grants no
  application permission to submit by itself, it only re-enables the ability for apps that already
  have their own opt-in. The extension refuses to submit if any required field is unfilled or a
  CAPTCHA/blocker is detected; blocker retries are bounded (3, with backoff) then it stops and notifies
  the user to finish manually — never loops or hammers a portal.

Other invariants: all AI drafts editable before use; SMS is an opt-in Settings toggle (off by
default); email/portal monitoring will be opt-in + revocable; source methods must respect each
platform's ToS (compliance beats ban-risk — an unreliable/banned source defeats the always-on goal);
the selected mode is shown as a colored badge everywhere an application appears.

---

## 7. Build / run / test / lint

**Local prereqs:** Homebrew PostgreSQL 17, pnpm 10, Tectonic (`brew install tectonic`).
On this machine pnpm was at `~/Library/pnpm` (export `PATH="$HOME/Library/pnpm:$PATH"` if not found);
Postgres binaries at `/opt/homebrew/opt/postgresql@17/bin`. **On a new machine these paths will
differ — adjust accordingly.**

```sh
pnpm install
createdb internship_tracker                                      # once
pnpm db:generate                                                 # after schema changes
DATABASE_URL=postgres://localhost:5432/internship_tracker pnpm db:migrate
pnpm dev                                                         # web :3000 + worker together
pnpm --filter web dev        # web only
pnpm --filter worker dev     # worker only (needs root .env with DATABASE_URL etc.)
pnpm --filter web build      # PROD BUILD + the effective typecheck gate — must pass before any push
pnpm --filter worker build   # tsc --noEmit typecheck (worker isn't compiled)
pnpm --filter web lint       # eslint (two pre-existing warnings in theme-toggle/notification-settings)
```

**Env files (gitignored):** `apps/web/.env.local` (web) and root `.env` (worker). Copy from
`.env.example` — it documents every variable, including reserved-but-unread ones (`GITHUB_TOKEN`,
`R2_*`). **`AUTH_DISABLED=true`** in `.env.local` bypasses Google sign-in for local dev/preview ONLY
(code-gated to non-production). Needed for agents/preview tools to render pages without OAuth.

**Full env var list & purpose:** `DATABASE_URL`, `UPLOAD_DIR` (blank → `<repo>/data/uploads`;
prod = `/data/uploads` on the volume), `AUTH_SECRET`, `AUTH_GOOGLE_ID/SECRET`, `ALLOWED_EMAIL`,
`AUTH_DISABLED` (dev only), `AUTH_URL` (prod domain — required behind Railway's proxy), `APP_URL`
(absolute-link base for notifications), `ANTHROPIC_API_KEY`, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`,
`RESEND_API_KEY`/`NOTIFY_EMAIL_TO`, `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER`/`NOTIFY_SMS_TO`,
`EXTENSION_TOKEN` (bearer for `/api/assist/*`; deny-by-default when unset), `GDRIVE_CLIENT_ID/SECRET`
(+ `GDRIVE_REFRESH_TOKEN` for Drive), plus Railway-only `TECTONIC_PATH`/`TECTONIC_CACHE_DIR`/
`RAILPACK_BUILD_CMD`.

---

## 8. Deployment & operations (Railway)

Three services (web, worker, Postgres) + a persistent **volume on web mounted at `/data`** (uploads,
generated PDFs, Tectonic package cache). **Auto-deploys from GitHub `main`** — every push builds &
deploys both app services. Full first-time setup (Google OAuth, Anthropic, Resend, Twilio, VAPID,
extension) is in `DEPLOYMENT.md`.

Per-service build/start is controlled by Railpack env vars: `RAILPACK_BUILD_CMD`,
`RAILPACK_START_CMD`. The web build command also downloads Tectonic (see below).

### Branch workflow (adopted 2026-07-11, simplified 2026-07-12)
Two branches: **`sbx` → `main`**. (The earlier `sbx → dev → qa → main` chain was retired — dev/qa
were only ever fast-forwarded to the same commit as sbx, so they added ceremony without a real
gate; see the QA gate below for where the actual safety check now lives.)
- `sbx` — the working branch: all day-to-day work and agent output lands here first, verified
  locally (`pnpm --filter web build`, local Postgres).
- `main` — **production**: Railway auto-deploys every push. Kept as the prod branch (not a literal
  `prod` branch) so the existing Railway wiring stays untouched.

**Promotion to prod goes through a QA-gated GitHub PR, never a direct push:**
1. Open a PR `sbx → main` (`gh pr create`).
2. Run the **QA + security gate** on the PR diff (`main..sbx`): a review agent briefed on this
   project's hard invariants (mode never defaulted; Auto-Apply only via per-app opt-in AND the
   master switch; the extension submission gate; migration-before-deploy ordering) **plus**
   `/security-review` for anything touching auth / `/api/assist/*` / Auto-Apply. Only runs at
   prod-promotion time, not on every intermediate commit.
3. Address findings, then — **for any PR containing a new migration, run it against the prod DB
   FIRST** (see §8 prod-migration note; deploying code that references not-yet-migrated columns
   breaks prod), then merge. Merge = deploy.
Hotfixes: fix on `main`, then back-merge into `sbx` so the two never diverge.

### ⚠️ Railway lessons learned — these each cost real debugging time; heed them
- **`railway variables --set` with complex quoted values can FAIL SILENTLY** (saves nothing while an
  old bad value stays active). This caused **3 failed deploys**. **ALWAYS read the variable back**
  after setting. Remove a variable with `railway variable delete <NAME> --service <svc>`.
- **Never use `railway redeploy` to pick up config changes** — it re-runs the *previous* build config.
  **Trigger deploys with a git commit** (even `git commit --allow-empty`); a commit always reads the
  current config.
- **Auth.js behind Railway's proxy needs `AUTH_URL` set explicitly** to the prod domain, or OAuth
  callback URLs generate against the internal `localhost:8080` and sign-in breaks.
- **Tectonic isn't in the base image's apt repos** (`RAILPACK_DEPLOY_APT_PACKAGES=tectonic` fails the
  build). It's fetched during build instead: `RAILPACK_BUILD_CMD` runs
  `mkdir -p /app/bin && curl -fsSL <tectonic musl tarball> | tar -xz -C /app/bin && pnpm --filter web
  build`, and `TECTONIC_PATH=/app/bin/tectonic`; `TECTONIC_CACHE_DIR=/data/tectonic-cache` caches
  LaTeX packages on the volume (first compile ~10–20s, then ~1s).
- **A failed deploy does NOT take production down** — Railway keeps serving the last good build. Verify
  after deploy with `curl -s -o /dev/null -w "%{http_code}" <domain>/signin` (expect 200) and confirm
  app routes still redirect unauthenticated (`/tracker` → 307 to /signin).
- Run **production migrations** with the Postgres **public** URL:
  `DATABASE_URL=$(railway variables -s Postgres --json | jq/py DATABASE_PUBLIC_URL) pnpm db:migrate`.

**Costs:** ~$6–15/mo (Railway ~$5–10 + Anthropic API usage ~$1–5; Resend/push free; Twilio only if
SMS enabled). A fully AI-assisted application costs ~5–8¢ of API credit. See `docs/COSTS.md`.
**Critical distinction:** the Claude *subscription* pays for building (agents/dev); the **Anthropic
API key** pays for the app's runtime AI. Separate wallets — agent work never touches the API key.

---

## 9. Current state (as of 2026-07-12)

**Shipped & live in production (or merged to `sbx`, pending promotion — see §8 branch workflow):**
- **Phase 1 complete** — discovery engine (2 GitHub repos live in prod: SimplifyJobs + vanshb03 2027,
  both enabled; plus Greenhouse/Lever/SmartRecruiters/Workday/RSS pollers ready to add), full tracker,
  Agentic Assist (drafting + doc storage + extension autofill), profile/multi-resume, comprehensive
  filters. **~1060 active postings in prod right now.**
- **Phase 2 complete** — **Full Auto-Apply (P2-M1)** shipped, extension evolved 0.1.0 → **0.3.0**
  (tabs-permission fix → auto-apply → resume attach + choice-field filling + application-answers
  profile section → Haiku semantic option-matching), now additionally gated by a **master Auto-Apply
  kill switch** (`settings.auto_apply_enabled`, default off, Settings → Automation card;
  server-enforced in `api/assist/packet/route.ts` — downgrades `mode: "auto"` to `"assist"` in the
  extension's response whenever the switch is off, regardless of per-app approval). **P2-M3 Interview &
  skill prep** shipped: `lib/interview-prep.ts` (Sonnet, grounded in the posting description, never
  fabricates a problem link — references by name only) + `components/prep-panel.tsx` on every
  application detail page (all modes) with practice problems linked to a LeetCode search + the
  NeetCode 150 roadmap. **Phase 2 is now fully shipped** (P2-M2 below was the last item).
- **P2-M2 Gmail status monitoring shipped** — opt-in (off by default), read-only. A **separate OAuth
  consent flow from sign-in** (`/api/gmail/connect` → Google → `/api/gmail/callback`, CSRF-guarded via
  a short-lived state cookie), requesting only `gmail.readonly`; the sign-in scope is never widened.
  `apps/worker/src/tasks/sync-gmail-status.ts` polls every 15 minutes (no-ops instantly if not
  connected): lists recent message IDs since the last sync, fetches **metadata only** (From/Subject/
  Gmail's own short snippet — never `format=full`, so a full email body never enters the process),
  matches candidates against tracked applications by normalized company name, and classifies true
  matches with Haiku (`gmail-client.ts` `classifyStatusSignal` — plain fetch, no SDK, matching the
  worker's existing channels/*.ts convention) into interview_invite/oa_invite/offer/rejection/
  confirmation/none. Only a **high-confidence** classification acts. Stage moves **forward-only**
  except rejection, which is always allowed from any stage (an offer can still be rescinded); a
  short synthesized note (e.g. `[Gmail: interview invite detected, 7/12/2026]`) is prepended to the
  application's notes — **the email itself (from/subject/snippet) is discarded immediately after
  classification and never persisted.** A real stage change also fires the normal notification
  channels. Settings → Gmail status monitoring shows connected-as-email + last-synced, with a
  Disconnect button that revokes the grant with Google. `settings.gmail_refresh_token` is a real
  secret (migration 0009) — Google's own OAuth token store is the only place it's echoed. **This also
  unlocks the compliant LinkedIn-email-alert ingestion route** (LinkedIn's own saved-search alerts,
  read the same way) — not yet built, see Queued.
- **Resume Studio** — LaTeX editor + Tectonic compile + Sonnet chat (apply/undo) + save-as-resume-version,
  plus **preview-before-apply**: a chat-proposed `<latex>` change can now be compiled into a throwaway
  preview PDF and reviewed before it touches the editor or the persisted resume (`compileLatexPreview`,
  `previewKeyFor`, the Preview button in `latex-chat.tsx`, the proposal banner in `latex-studio.tsx`).
- **Source expansion, first pass shipped** — the per-source **README column-map parser**
  (`sources/github.ts` `parseColumnMap`/`parseReadmeTable`, configured via `sources.config.columns` and
  a matching Settings UI field) lets repos whose README table doesn't follow the SimplifyJobs standard
  layout (different column order, or the apply link embedded inside the role-title cell, e.g.
  jobright-ai-style repos) be onboarded without code changes. **Screenshot Intake** (`/intake`) shipped
  as the compliant, zero-ToS-risk answer to "surface postings that only exist as a social-media
  screenshot" (the original zero2sudo-Instagram-stories ask): a vision model (Haiku) extracts
  company/role/URL/locations/term/notes from a user-uploaded screenshot, the user reviews and edits
  every field, and confirmation runs the exact same normalize/dedupe/tag pipeline as a polled posting.
  The screenshot itself is never persisted. LinkedIn ingestion is still unaddressed — see Queued below.
- **Notification model overhaul shipped** — replaced the original "one digest after quiet hours ends"
  design with a **twice-daily HTML email digest** at configurable clock-hour slots (`settings.digest_hours`,
  default 8am/5pm; `digestSlotDue` in `@tracker/shared` guards at-most-once-per-slot), a **Simplify-style
  HTML template** (`apps/worker/src/email-template.ts`, shared by the digest and instant alerts), and a
  per-company **instant watchlist** (`settings.watchlist_companies`) that bypasses both the digest and
  quiet hours entirely — "apply early" for companies the user cares most about. Quiet hours now govern
  push/SMS only; email always runs on the fixed digest schedule.
- **Analytics dashboard shipped (Phase 3)** — `/analytics`, a read-only server component: pipeline
  funnel, automation-mode split, recommendation-vs-choice accuracy (overall + per-ATS, from
  `mode_decisions`), notification activity (from `notification_log`), and source health — all built
  from data the app already collects, no new tracking added.
- **3 UI rounds + a UI-cohesion pass** — company logos, collapsible filters, toasts, loading skeletons,
  pagination, setup checklist, PWA installability (Add-to-Home-Screen; matters for iOS push), list-view
  toggle, dashboard greeting, sidebar account footer + **sign-out**, rich descriptions, tinted tracker
  columns, sign-in polish, plus consistent pending/reset/empty states across several forms
  (`add-application-form.tsx`, `submit-button.tsx`, and small fixes to `assist-panel.tsx`/
  `application-editor.tsx`/`profile-manager.tsx`).
- **Docs** — CODEBASE.md, COSTS.md, PROJECT_DOCUMENTATION.pdf, DEPLOYMENT.md, this file (both kept
  current through the features above as of this revision).

**In progress / NOT finished — pick these up:**
- **Source expansion, second pass.** The column-map parser, Screenshot Intake, and Gmail monitoring
  (above) cover most of the original asks; **LinkedIn Jobs ingestion still has no code written.** No
  individual API access (partner-gated) — the compliant path is now unblocked: LinkedIn's own **email
  job-alerts**, read the same way the Gmail status-monitoring sync already reads the inbox (a
  saved-search alert is just another classifiable email — the plumbing exists, this is "add a
  LinkedIn-alert classification path," not "build Gmail access from scratch"). Secondary option is
  jobright-style GitHub mirrors (overlap with the column-map repos already supported). Gray-market
  scraper APIs exist but carry ToS risk — flag, don't silently adopt. Also still open: verifying +
  adding more active 2027-cycle repos (cvrve, Ouckah successors, others) through the column-map config.

**Queued (not started):**
- **Phase 3 remaining** — visa-sponsorship filter UI refinement (data + a basic filter already exist;
  richer surfacing planned), data export (CSV + docs zip), digest smart-ranking (the digest is now a
  genuine fixed-schedule batch, but still lists postings in queue order rather than ranked by fit).

---

## 10. Working model, conventions & known gotchas

**Design conventions:** use HIG tokens from `globals.css` (`bg-surface`, `bg-surface-secondary`,
`text-secondary`/`text-tertiary`, `shadow-card`/`shadow-raised`, `border-separator`, `accent`,
`accent-soft`, `rounded-2xl`) — never hardcode hex. Light+dark via the `.dark` class. Server
components fetch; `"use client"` components interact; server actions in `app/actions/*` are the
mutation path except where an external caller needs a route. Toasts (`useToast`) for client-action
feedback. Match each file's existing comment density; comments explain *why*.

**Commit style:** author `Joshua Michael <joshuamichael365@gmail.com>`; every AI-authored commit ends
with a `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer. Descriptive multi-line
messages. Work lands on `sbx` first and is promoted sbx → dev → qa → `main` (see §8 branch
workflow); pushing `main` deploys production, so it only happens when the user asks — and always
after a clean `pnpm --filter web build`.

**Agent delegation model (the user's explicit preference):** the manager model (Fable) plans,
reviews, and talks to the user; it delegates *implementation* to **Sonnet** subagents (Opus only for
high-stakes, hard-to-reverse work like Full Auto-Apply). Every agent diff is reviewed before push;
nothing ships without a clean web build. Practical rules learned:
- **Agents draw on the Claude subscription's usage allowance, not the API key.** A heavy day hits the
  plan's usage window (resets on a timer), which pauses work at no extra dollar cost. Several tasks
  here were interrupted mid-flight by this.
- **Bank intermediate findings to a scratchpad file** during long agent tasks so a limit-interruption
  doesn't lose work (learned when the docs agent was cut off mid-write; its research was recovered
  from a saved findings file). A resumed agent can also be re-messaged to continue from its transcript.
- **Parallel agents must have strictly separated file territories** and must not both run the web dev
  server / build. UI-polish agents run *after*, not alongside, feature agents touching the same
  components. Give each agent an explicit "do NOT touch X" list.

**Known minor issues / gotchas (from the CODEBASE.md audit — not bugs blocking use):**
- Failed notification sends leave no `notification_log` row (only successes are logged).
- `classifyRole` only checks the title for "quant" (not the description), so a quant role whose title
  omits the word may classify as swe/ml/other.
- Workday poller has no conditional-request support (always a full POST; `searchText` defaults to
  "intern", pre-filtering server-side unlike the other ATS pollers).
- The applied-suppression set includes ALL applications regardless of stage — so tracking a role hides
  its reposts immediately, not only after "Applied." Arguably intended; the code comment overstates it.
- Posting tagging is regex heuristics; a Haiku-based tagging upgrade path exists but is unused (kept
  free — tagging accuracy has been fine on the live feed).
- Extension: `content.js` uses `window.__tracker*` globals + `data-tracker-pending` attributes because
  each `executeScript` injection is a fresh context with no shared closure. Auto-submit clicks then
  waits a fixed 2500ms — it does NOT verify the ATS accepted the submission (optimistic).
- The extension token lives in `chrome.storage.sync` (syncs across the user's Chrome profile) —
  acceptable for single-user, worth knowing.
- After ANY extension code change the user must reload it (`chrome://extensions` → ↻) — there's no
  auto-update since it's loaded unpacked.

**When you (the next AI) start:** read this file, then `docs/CODEBASE.md` for file-level depth, then
check `git log --oneline` for the latest work. The task list / roadmap is §9. Source expansion is now
mostly done (column-map parser, Screenshot Intake, and Gmail status monitoring all shipped) — LinkedIn
ingestion is the one remaining open piece there, and the Gmail-sync plumbing it needs already exists.
