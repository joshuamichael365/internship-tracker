# CODEBASE.md — Internship Tracker & Auto-Apply Assistant

> **What this file is.** An exhaustive, file-level reference for the entire repository, written to be fed to AI models (and humans) answering questions about this project with zero prior context. It complements the higher-level `docs/PROJECT_DOCUMENTATION.pdf`; this document goes deeper — every source file, every table, every flow, every environment variable. Everything described here was verified by reading the actual code as of commit `b987650` on branch `sbx` (2026-07-12) — updated from the original `cbf138c` (2026-07-03) pass to add Resume Studio, the per-source README column-map parser, Screenshot Intake, Interview & Skill Prep (P2-M3), the master Auto-Apply kill switch, the Analytics dashboard, Resume Studio's preview-before-apply, and the twice-daily digest + company-watchlist notification overhaul.
>
> **Owner:** Joshua Michael (joshuamichael365@gmail.com) — this is a **single-user** application.
> **Production:** https://web-production-64a44.up.railway.app on Railway (three services: web, worker, Postgres; deploys from GitHub `main`).
> **Repository:** github.com/joshuamichael365/internship-tracker (private).

---

## Table of contents

1. [Orientation](#1-orientation)
2. [Repo map](#2-repo-map)
3. [File-by-file reference](#3-file-by-file-reference)
   - [Root configs](#31-root-configs)
   - [packages/shared](#32-packagesshared)
   - [packages/db](#33-packagesdb)
   - [apps/web](#34-appsweb)
   - [apps/worker](#35-appsworker)
   - [apps/extension](#36-appsextension)
4. [Database schema & job flow](#4-database-schema--job-flow)
5. [End-to-end flows](#5-end-to-end-flows)
6. [External services & environment variables](#6-external-services--environment-variables)
7. [Design system](#7-design-system)
8. [Build, deploy, and operations](#8-build-deploy-and-operations)
9. [Known limitations & roadmap](#9-known-limitations--roadmap)

---

# 1. Orientation

## What the app does

A single-user web application that:

1. **Discovers** new SWE/ML/CS internship postings in near-real-time by polling community GitHub repos (SimplifyJobs, vanshb03, plus any repo with a non-standard README table via a configurable column map — see §3.5), ATS boards (Greenhouse, Lever, SmartRecruiters, **Ashby**, Workday), and RSS/Atom feeds — every minute, with conditional HTTP requests so unchanged sources cost almost nothing. A **Screenshot Intake** page (`/intake`) supplements polling with a manual, vision-assisted route for postings that only ever appear as a social-media screenshot (e.g. an Instagram story) — see §5(g). Postings with no source description get one auto-extracted from their own page on first view (`lib/posting-description.ts`).
2. **Deduplicates and tags** postings across sources (one card per company+role+location, keyword-classified into SWE/ML/Data/Quant, internship vs new-grad, remote/hybrid/onsite, season/year terms, visa sponsorship).
3. **Notifies** via web push (instant, quiet-hours aware) and a **twice-daily HTML email digest** (Simplify-style, default 8am/5pm) — with an **instant per-company watchlist** that bypasses the digest and quiet hours entirely for companies the user cares most about (+ SMS if explicitly enabled). See §5(a)/(f).
4. **Tracks applications** through a seven-stage Kanban pipeline (Saved → In Progress → Applied → Assessment/OA → Interviewing → Offer → Rejected) with per-application reminders/OA deadlines and generated **interview & skill-prep guidance** (focus areas, practice problems linked to LeetCode/NeetCode, project ideas, resources, behavioral prompts) — see §5(h).
5. **Assists applications** at three explicit, per-application automation levels (below), including LLM-drafted cover letters and short answers in the user's own voice (few-shot from their writing samples), PDF generation, organized document storage (in-app / local download / Google Drive), an in-app **Resume Studio** (LaTeX editor + Tectonic compile + Sonnet chat assistant, with preview-before-apply for chat-proposed changes), browser-side form auto-fill through a companion Chrome extension, and a **read-only Analytics dashboard** (pipeline funnel, mode split, recommendation accuracy, notification activity, source health).
6. **Answers questions** via an in-app **Assistant** chatbot (`/chat`) — claude-sonnet-5 with read-only tools over the live tracker data (postings/applications/reminders/analytics) plus general recruiting knowledge; see `lib/assistant.ts` (§3.4.2) and the Assistant flow in §5.

## The three application modes

Stored in `applications.mode` (Postgres enum `application_mode`: `manual` / `assist` / `auto`, **nullable**):

| Mode | What it does | Who submits |
|---|---|---|
| **Manual** | The app only tracks the application. | User |
| **Agentic Assist** | Claude drafts cover letter + short answers in the user's voice; user edits/saves them; the extension fills the portal form (fields, answers, file attachments) and highlights everything it touched. | **User** — the extension never touches submit buttons in this mode |
| **Full Auto-Apply** | After a per-application pre-submit review + explicit checkbox approval, the extension fills **and submits** the form itself, reporting the outcome back to the server. | Extension (only after opt-in) |

## Non-negotiable product rules (and where they're enforced in code)

These rules are architectural invariants, visible as code comments and enforced logic:

1. **Mode is never defaulted.** `applications.mode` is nullable with the schema comment *"null until the user explicitly picks a mode — never defaulted silently"* (`packages/db/src/schema.ts`). `trackPosting()` and `addManualApplication()` insert applications without a mode; the UI shows a dashed "Mode not chosen" badge (`ModeBadge` in `components/ui.tsx`) until the user picks.
2. **Auto-Apply is a per-application, revocable opt-in behind a pre-submit preview.** Mode `auto` can *only* be set via `approveAutoApply()` (`app/actions/applications.ts`), which is only reachable through the `AutoApplyOptin` component's full preview (every profile field, resume name, full cover letter, each Q&A) plus a mandatory checkbox ("I understand this application will be submitted without a final review click"). `setApplicationMode()` explicitly refuses to set `auto` and **clears `autoApplyApprovedAt` on any mode change away from auto** — approval is revocable at any time via the "Revoke" button.
3. **Drafts are always editable.** The `AssistPanel` renders drafts in plain `<textarea>`s; `saveAssistDocuments()` persists whatever the user last edited into `applications.drafts` — and that raw reviewed text is *exactly* what the extension fills ("Persist the reviewed raw text — this is exactly what the extension fills").
4. **The extension never submits with unfilled required fields or past blockers.** `content.js`'s `__trackerAutoApply` checks for CAPTCHAs/bot-checks **before touching the form** and returns `blocked`; if required fields remain unfilled it returns `incomplete` (downgrading to Assist behavior — orange highlights, user submits); `__trackerFinishAutoApply` re-checks blockers and refuses to submit while `window.__trackerUnresolvedRequired > 0`.
5. **Bounded blocker retries, then notify.** Client-side: the popup retries a blocked auto-apply at most 3 times with 0s/5s/15s backoff. Server-side: `/api/assist/report` increments `applications.blocker_retries` on each `blocked` event and enqueues the `send_blocker_notice` job when it reaches 3 ("Auto-apply blocked — needs you" across all channels, linking to the tracker page).
6. **SMS is off by default and explicit opt-in.** `settings.channels` defaults to `{push: true, email: true, sms: false}`; the settings UI labels SMS "Off by default — costs ~$5–10/mo and needs Twilio A2P registration."
7. **A master Auto-Apply kill switch gates every submission, on top of per-application opt-in.** `settings.auto_apply_enabled` (migration 0007) defaults to **false**. `api/assist/packet/route.ts` is the sole authoritative enforcement point: it reads this flag and, when off, **downgrades `mode: "auto"` to `"assist"` in the response it hands the extension** regardless of that application's own `autoApplyApprovedAt` — the extension only ever sees what the packet route tells it, so it structurally cannot submit while the switch is off. Turning the switch on doesn't auto-submit anything by itself; each application still needs its own opt-in via `approveAutoApply()`. Surfaced in Settings as an "Automation" card (`components/auto-apply-settings.tsx`).

---

# 2. Repo map

pnpm workspace monorepo (`pnpm-workspace.yaml`: `apps/*` + `packages/*`), Node ≥ 22, pnpm 10.18.3.

| Path | What it is |
|---|---|
| **`apps/web/`** | Next.js 16 (App Router, Turbopack, React 19, Tailwind v4) application: all UI pages, server actions, API routes (including the token-authed `/api/assist/*` routes the extension talks to), NextAuth v5 Google sign-in, the PWA push service worker, and all server-side libraries (drafting, PDF rendering, storage, recommendation engine, resume parsing). Runs as the Railway "web" service. |
| **`apps/worker/`** | Always-on Node service built on **graphile-worker** (Postgres-backed job queue + cron). Hosts the source pollers, the ingest pipeline (normalize → dedupe → tag → suppress → store → notify), the three notification channels (web push, Resend HTML email, Twilio SMS), the twice-daily email digest + company watchlist, reminders, auto-archive, and the on-demand confirmation/blocker jobs. Runs as the Railway "worker" service. Executed directly with `tsx` — never compiled. |
| **`apps/extension/`** | Chrome Manifest V3 extension ("Internship Tracker Assist", v0.3.0). Plain JS, no build step, loaded unpacked. Popup + options page + an on-demand-injected content script that fills forms. Implements Agentic Assist filling and Full Auto-Apply submission. No background service worker; no static `content_scripts` registration. |
| **`packages/db/`** | Drizzle ORM schema (`src/schema.ts`), the Postgres client singleton, drizzle-kit migrations in `migrations/`, and re-exported query operators. Consumed by both web and worker via workspace protocol (`@tracker/db`), imported directly as TypeScript source (`main: ./src/index.ts` — no build). |
| **`packages/shared/`** | Dependency-free shared TypeScript (`@tracker/shared`): type aliases mirroring DB enums, `NormalizedPosting`, normalization + FNV-1a dedupe hashing, keyword tagging/classification regexes, notification-rule evaluation, and quiet-hours math. Imported by web, worker (and its hash is portable to the extension by design). |
| **`packages/db/migrations/`** | Twelve generated SQL migrations, 0000–0011 (see §4). `migrations/meta/` is drizzle-kit bookkeeping (excluded from this doc). |
| **`docs/`** | `PROJECT_DOCUMENTATION.pdf` (high-level overview) and this file. |
| **`data/uploads/`** | **Git-ignored** local upload/document storage root in dev (`UPLOAD_DIR` env var overrides; `/data/uploads` on the Railway volume in prod). Contains `resumes/` keys and generated docs under `Internships/<year>/<Company>_<Role>/`. |
| **`.claude/launch.json`** | Claude Code preview-server launch config (starts `pnpm --filter web dev` on port 3000). |

---

# 3. File-by-file reference

## 3.1 Root configs

### `package.json` (root)
Workspace root. `engines.node >= 22`, `packageManager: pnpm@10.18.3`. Scripts fan out via pnpm filters:
- `dev` — runs web + worker in parallel (`pnpm --parallel --filter web --filter worker dev`)
- `dev:web` / `dev:worker` — individually
- `build` — `web build` then `worker build` (worker "build" is typecheck-only)
- `db:generate` / `db:migrate` / `db:studio` — proxied to `@tracker/db`'s drizzle-kit scripts.

### `pnpm-workspace.yaml` (root)
Two lines: packages are `apps/*` and `packages/*`.

**Gotcha:** there is a *second* `pnpm-workspace.yaml` inside `apps/web/` containing only `ignoredBuiltDependencies: [sharp, unrs-resolver]`. It is **not** a nested workspace definition — it's tool-generated dependency-build config left over from `create-next-app`/pnpm; the real workspace root is the repo root.

### `tsconfig.base.json`
Shared compiler baseline extended by worker and db (web has its own Next-generated tsconfig): ES2022 target, `module: ESNext`, `moduleResolution: bundler`, `strict: true`, `noUncheckedIndexedAccess: true` (which is why source files index arrays with `!` after known-safe checks).

### `.env.example`
Documented template of every intended env var (values live in `apps/web/.env.local` and root `.env` for dev — both git-ignored — and Railway service variables in prod). Full reference in §6. Notably it **omits** three vars the code actually reads: `EXTENSION_TOKEN`, `GDRIVE_REFRESH_TOKEN`, `RESEND_FROM`, plus deployment-set `APP_URL`, `UPLOAD_DIR`, and `AUTH_URL` (see §6 and §8).

### `.claude/launch.json`
One launch configuration named `web`: runs pnpm (absolute path `/Users/joshu/Library/pnpm/pnpm`) with `--filter web dev`, port 3000. Used by Claude Code's preview tooling to start the dev server.

### `DEPLOYMENT.md`
Step-by-step production walkthrough, marking `[you]` for steps requiring the owner's accounts: Railway project setup (web/worker/Postgres, `DATABASE_URL=${{Postgres.DATABASE_URL}}` references, `/data` volume for uploads, per-service env vars), Google OAuth client creation (redirect URIs for prod + localhost; consent screen stays in "Testing" forever since it's single-user), Anthropic Console key (drafting on claude-sonnet-5 ~2–4¢/letter; tagging/parsing on claude-haiku-4-5), Resend (free tier, `onboarding@resend.dev` sender until a domain is verified), Twilio (A2P 10DLC sole-proprietor registration — the slowest setup step, 1–5 days), extension load-unpacked instructions, monthly cost table (~$15–25 total), and the warning to never set `AUTH_DISABLED` in production.

### `README.md`
Project one-paragraph summary, the layout table (same as §2), and dev quickstart (`pnpm install`, `pnpm db:migrate` against a local `internship_tracker` Postgres DB, `pnpm dev`, copy `.env.example` → `apps/web/.env.local`, `AUTH_DISABLED=true` for local-only auth bypass).

### `apps/web/AGENTS.md` / `apps/web/CLAUDE.md`
AI-agent guardrail: "This is NOT the Next.js you know" — Next.js 16 has breaking changes vs training data; read `node_modules/next/dist/docs/` before writing code. (`CLAUDE.md` is just `@AGENTS.md`.) One concrete consequence already in the codebase: **`middleware.ts` was renamed to `proxy.ts`** as a Next.js 16 file convention — see `src/proxy.ts` below.

### `apps/web/next.config.ts`
Single setting: `turbopack.root` pointed at the monorepo root (`../..`) so Turbopack resolves workspace packages correctly.

### `apps/web/eslint.config.mjs`, `postcss.config.mjs`, `tsconfig.json`
Standard Next.js 16 flat ESLint config (core-web-vitals + TS), Tailwind v4 PostCSS plugin, Next-managed tsconfig with `@/*` → `./src/*` path alias.

### Other root files
`.gitignore` excludes `node_modules/`, `.next/`, all `.env*` except `.env.example`, `data/` (uploads never committed — though note the working tree currently contains sample generated PDFs under `data/uploads/`, invisible to git), and `apps/extension/dist/`. `apps/web/README.md` is the untouched create-next-app boilerplate (no project info).

---

## 3.2 packages/shared

### `packages/shared/package.json`
`@tracker/shared`, ESM, **zero dependencies**, `main`/`exports` point straight at `./src/index.ts` (TypeScript consumed directly — no build step anywhere in this repo except Next's own).

### `packages/shared/src/index.ts`
Re-exports `./tagging` and `./rules`, then defines:

- **Type aliases mirroring the DB enums**: `RoleType`, `JobLevel`, `LocationMode`, `PostingStatus`, `SourceKind`, `ApplicationMode`, `ApplicationStage`, `NotificationChannel`, `NotificationKind`.
- **`NormalizedPosting`** — the universal shape every source poller produces before ingest: `{company, title, url, locations, locationMode?, roleType?, jobLevel?, description?, deadline?, postedAt?, terms?, raw?}` (dates as ISO strings).
- **Normalizers**: `normalizeCompany` (lowercase, strip non-alphanumerics, strip trailing corporate noise `inc|llc|ltd|corp|corporation|co|technologies|labs`, collapse whitespace), `normalizeTitle` (additionally strips `"(Summer 2026)"`-style term parentheticals so reposts with/without a term parenthetical still match), `normalizeLocation`.
- **`fnv1a64(input)`** — a BigInt implementation of 64-bit FNV-1a returning 16 hex chars. Deliberately dependency-free and portable ("same result in web/worker/extension" per its comment) — no `node:crypto`.
- **`dedupeHash(posting)`** — the cross-source posting identity: `fnv1a64(normalizeCompany(company) + "|" + normalizeTitle(title) + "|" + normalizeLocation(locations[0] ?? ""))`. **Only the first location participates** — a posting listed with locations in a different order by two sources would produce different hashes (accepted trade-off; in practice sources list a stable primary location).

Called by: `apps/worker/src/ingest.ts` (dedupe + suppression keys) and `apps/web/src/lib/applied-side-effects.ts` (repost hiding).

### `packages/shared/src/rules.ts`
The user's notification filter and quiet-hours math.

- **`NotificationRules`** type: `{roleTypes?, locationModes?, excludeCompanies?, keywords?}` — stored in `settings.notification_rules` jsonb.
- **`passesNotificationRules(posting, rules, includeNewGrad)`** — AND semantics; a posting must pass *every configured* criterion (empty/omitted = unconstrained):
  1. `jobLevel === "new_grad" && !includeNewGrad` → reject (this gate applies even with `rules == null`).
  2. `roleTypes` list set and posting's roleType not in it → reject.
  3. `locationModes` likewise.
  4. `excludeCompanies` — compared through `normalizeCompany` on both sides, so "Acme Inc." excludes "acme".
  5. `keywords` — at least one keyword must appear (case-insensitive substring) in `title + description`.
- **`inQuietHours(now, timezone, startHour, endHour)`** — gets the current hour *in the user's timezone* via `Intl.DateTimeFormat(..., {hour: "numeric", hour12: false, timeZone})`. Handles both windows: non-wrapping (`start <= end` → `hour ∈ [start, end)`) and midnight-wrapping (`23 → 7` → `hour >= 23 || hour < 7`). As of the notification overhaul (below), this only gates **push/SMS** — email no longer uses it at all.
- **`isWatchedCompany(company, watchlist)`** — true if `company` normalized-matches (via `normalizeCompany` on both sides) any entry in `settings.watchlist_companies`. `false` for an empty/undefined watchlist. This is the instant-alert bypass: a watchlisted company's posting skips both the digest queue and quiet hours.
- **`digestSlotDue(now, timezone, digestHours, lastSentAt)`** — true exactly once per configured send-hour slot: the current hour (in `timezone`) must be one of `digestHours` (e.g. `[8, 17]`), and it must not already have been sent for this hour's slot. Internally compares `slotKey(now)` vs `slotKey(lastSentAt)`, where `slotKey` is a `YYYY-MM-DD-HH` string built from `Intl.DateTimeFormat("en-CA", {...})` (with a `"24"` → `"00"` midnight normalization some engines emit). Safe to call every few minutes — it only returns true on the first tick inside each slot, so `send-digest.ts`'s 5-minute cron can poll it directly without its own dedupe logic.

Called by: `apps/worker/src/notify.ts` (`inQuietHours`, `isWatchedCompany`) and `apps/worker/src/tasks/send-digest.ts` (`digestSlotDue`).

### `packages/shared/src/tagging.ts`
Pure keyword/regex heuristic classifiers — the comment notes they are "used standalone, or as the fallback when Claude tagging is unavailable," but **no Claude-based posting tagger exists yet**; these regexes are the only tagging in production (see §9).

Exact patterns:
```
ML_RE     = /\b(machine learning|ml engineer|deep learning|computer vision|nlp|llm|ai engineer|artificial intelligence|research scientist|research engineer)\b/i
DATA_RE   = /\b(data scien|data engineer|data analy|analytics|business intelligence)\b/i
QUANT_RE  = /\b(quant|quantitative|trading|trader)\b/i
SWE_RE    = /\b(software|swe|backend|back-end|frontend|front-end|full[- ]?stack|mobile|ios|android|devops|infrastructure|platform|security|site reliability|sre|embedded|firmware|systems|cloud|web develop)\b/i
INTERN_RE = /\b(intern|internship|co-?op)\b/i
NEW_GRAD_RE = /\b(new ?grad|university grad|early career|entry[- ]level|recent grad|campus hire|graduate program)\b/i
```

- **`classifyRole(title, description)`** — priority order: QUANT in *title* → ML in title → DATA in title → SWE in title; then ML → DATA → SWE against `title + description.slice(0, 2000)`; else `other`. **Asymmetry:** quant is only ever checked against the title, never the description body (a quant role whose title doesn't say "quant" won't be classified quant from its description).
- **`classifyLevel(title, description)`** — intern regex first (so "New Grad & Intern Program" classifies internship), title before description; returns `null` if neither matches — which the ATS pollers use as a relevance filter (`levelFilter` drops senior roles from full company boards).
- **`classifyLocationMode(locations, description)`** — remote if location text says remote; hybrid from location or description; onsite from description keywords; **any non-empty location text at all defaults to onsite**; else unknown.
- **`extractTerms(title, provided?)`** — normalizes source-provided term strings ("autumn" → "Fall", capitalization, optional year → `"Fall 2026"`), drops `n/a`/`tbd`, and only if the provided list yields nothing, scans the title with `TERM_RE = /\b(summer|fall|autumn|winter|spring)\s*(20\d\d)?\b/gi`.
- **`isRelevantRole(title)`** — the top-of-funnel gate that drops marketing/finance/etc. from broad boards: any of SWE/ML/DATA/QUANT regexes, or `/\b(engineer|developer|computer science|technology analyst)\b/i`.

---

## 3.3 packages/db

### `packages/db/package.json`
`@tracker/db`, ESM, exports `.` (index) and `./schema`. Dependencies: `drizzle-orm`, `postgres` (postgres.js driver). Dev: `drizzle-kit`. Scripts: `generate`, `migrate`, `studio`.

### `packages/db/drizzle.config.ts`
drizzle-kit config: schema at `./src/schema.ts`, migrations out to `./migrations`, dialect `postgresql`, DB URL from `DATABASE_URL` with local default `postgres://localhost:5432/internship_tracker`.

### `packages/db/src/client.ts`
Creates the Drizzle client over postgres.js with **max 5 connections**, and caches it on `globalThis.__trackerDb` outside production — the standard guard against Next.js dev-mode hot reloads leaking connections. Exports `db`.

### `packages/db/src/index.ts`
Re-exports client + full schema, plus a curated set of drizzle-orm operators (`and, asc, count, desc, eq, gt, gte, ilike, inArray, isNull, like, lt, lte, ne, not, or, sql` and the `SQL` type) "so consumers don't need their own drizzle-orm copy" — which is why web/worker files import operators from `@tracker/db`, never from `drizzle-orm` directly.

### `packages/db/src/schema.ts`
The complete schema — every table documented in §4. Notable in-code comments that encode product rules: `applications.mode` ("null until the user explicitly picks a mode — never defaulted silently"), `applications.autoApplyApprovedAt` ("Set only via the explicit per-application auto-apply opt-in; cleared on any mode change away from 'auto'"), `applications.blockerRetries` ("notifies at 3"), `profile.id`/`settings.id` boolean-primary-key-default-true single-row trick.

### `packages/db/migrations/*.sql`
| Migration | Contents |
|---|---|
| `0000_ancient_wrecker.sql` | Full initial schema: all 13 enums, all 13 tables, FKs, and 4 indexes. Two initial defaults later fixed: `settings.timezone` default was `America/Los_Angeles`, `settings.notification_rules` default was `'[]'::jsonb` (wrong shape — the code expects an object). |
| `0001_lovely_hiroim.sql` | Fixes `notification_rules` default → `'{}'::jsonb`. |
| `0002_tidy_mattie_franklin.sql` | Fixes `timezone` default → `America/New_York`; adds `applications.drafts jsonb` (the reviewed drafts the extension fills). |
| `0003_faithful_shiver_man.sql` | Adds `postings.terms jsonb DEFAULT '[]' NOT NULL` (season/year chips + filters). |
| `0004_handy_starfox.sql` | Adds `applications.auto_apply_approved_at timestamptz` and `applications.blocker_retries integer DEFAULT 0 NOT NULL` — the Full Auto-Apply (Mode 3) migration. |
| `0005_workable_sprite.sql` | Creates `latex_resumes` (Resume Studio: id, name, source, compiled_key, compile_log, last_compiled_at, chat_history jsonb default `[]`, created/updated_at). |
| `0006_moaning_paibok.sql` | Adds `applications.prep jsonb` — cached `InterviewPrep` guidance (P2-M3). |
| `0007_broad_leech.sql` | Adds `settings.auto_apply_enabled boolean DEFAULT false NOT NULL` — the master Auto-Apply kill switch. |
| `0008_little_absorbing_man.sql` | Adds `settings.watchlist_companies jsonb DEFAULT '[]'`, `settings.digest_hours jsonb DEFAULT '[8,17]'`, `settings.last_digest_sent_at timestamptz` — the twice-daily digest + company-watchlist notification overhaul. |
| `0009_absent_yellowjacket.sql` | Adds `settings.gmail_enabled boolean DEFAULT false NOT NULL`, `settings.gmail_refresh_token text`, `settings.gmail_connected_email text`, `settings.gmail_last_sync_at timestamptz` — P2-M2 Gmail status monitoring. |
| `0010_perfect_vivisector.sql` | `ALTER TYPE source_kind ADD VALUE 'ashby' BEFORE 'workday'` — the Ashby ATS poller's new source kind. |
| `0011_equal_lightspeed.sql` | Adds `settings.assistant_chat_history jsonb DEFAULT '[]' NOT NULL` — the Assistant chatbot's persisted conversation. |

Both 0010 and 0011 were run against the prod DB (2026-07-14) before the code that references them merged. Autofill v2 and semantic option matching (extension v0.2.1/0.3.0) needed no migration — those application-answer fields live inside the schemaless `profile.data` jsonb. The per-source README **column map** (`sources.config.columns`, §3.5) likewise needed no migration — `config` is already jsonb. Posting-description auto-extraction also needed no migration (`postings.description` already existed).

---

## 3.4 apps/web

Next.js 16.2.10, React 19.2.4, next-auth 5.0.0-beta.31, Tailwind v4, `motion` 12.x, `lucide-react` icons, `@anthropic-ai/sdk`, `pdf-lib`, CodeMirror 6 (`codemirror`, `@codemirror/{state,view,commands,language,legacy-modes}` — Resume Studio's LaTeX editor only). All pages set `export const dynamic = "force-dynamic"` (every render hits the DB — no caching for a single-user dashboard).

### 3.4.1 Auth & request guard

#### `src/auth.ts`
NextAuth v5 configuration. Exports `authDisabled`, `handlers`, `auth`, `signIn`, `signOut`.

- Single provider: Google. **JWT sessions** — no database adapter (nothing auth-related is stored in Postgres).
- `signIn` callback: hard allowlist — sign-in succeeds only if `user.email` case-insensitively equals `ALLOWED_EMAIL`. No allowlist configured → nobody can sign in.
- `authorized` callback (used by the proxy): `authDisabled || !!auth?.user`.
- `authDisabled` is `AUTH_DISABLED === "true" && NODE_ENV !== "production"` — the dev escape hatch is **structurally inert in production builds** regardless of env vars.
- Custom sign-in page: `/signin`.

#### `src/proxy.ts`
**This is the middleware.** Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts` (per `node_modules/next/dist/docs/...`: "The `middleware` file convention is deprecated and has been renamed to `proxy`"). It default-exports NextAuth's `auth` function, which doubles as a route guard: unauthenticated requests get redirected to `/signin` per the `authorized` callback.

Matcher: `"/((?!api/auth|api/assist|signin|_next/static|_next/image|favicon.ico|icons|sw.js).*)"` — protects everything **except**:
- `api/auth` (NextAuth's own endpoints),
- **`api/assist`** — the extension routes are deliberately excluded from cookie-session auth because the extension has no session; they enforce their own bearer-token auth (below). `api/push/subscribe` and `api/documents/*/download` are *not* excluded, so they sit behind the session (or dev bypass),
- the sign-in page and static assets (including `sw.js`, which must be publicly fetchable for service-worker registration).

#### `src/lib/extension-auth.ts`
The extension-facing auth + CORS helper. Exports `ASSIST_CORS`, `assistPreflight()`, `assistAuthorized(req)`.

```ts
export function assistAuthorized(req: Request): boolean {
  const token = process.env.EXTENSION_TOKEN;
  if (!token) return false; // deny by default when unconfigured
  const presented = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

- **Constant-time comparison** via `node:crypto.timingSafeEqual` (length checked first since `timingSafeEqual` throws on length mismatch — the length check itself leaks only token length, which is fine).
- **Deny-by-default**: no `EXTENSION_TOKEN` in the environment → every assist request is 401.
- `ASSIST_CORS`: `access-control-allow-origin: *` (extension pages have `chrome-extension://` origins, so a wildcard is the practical choice — security comes from the token, not the origin), methods GET/POST/OPTIONS, allowed header `authorization` (an Authorization header forces a CORS preflight, hence every assist route exports an `OPTIONS` handler returning 204 via `assistPreflight()`), `access-control-expose-headers: x-filename` (so the popup can read the resume filename), 24h preflight max-age.

Used by all five `/api/assist/*` routes.

### 3.4.2 `src/lib/` — server-side libraries

#### `src/lib/recommendation.ts`
The mode recommendation engine. Exports `ModeRecommendation` and `recommendMode(applicationId)`.

Phase 1 recommender: **Manual vs Agentic Assist only — Auto-Apply is never recommended** ("until Phase 2 exists and a reliability track record with a portal has been built — bias toward asking the user when uncertain").

Algorithm:
1. Classify the application URL's ATS: `KNOWN_ATS` (greenhouse.io, lever.co, ashbyhq.com, smartrecruiters.com → tier "known") vs `HARD_PORTALS` (myworkdayjobs.com, taleo.net, icims.com → tier "hard") vs unknown.
2. Base recommendation: known → `assist`; hard or unknown → `manual` (with human-readable reason strings that surface verbatim in the UI).
3. **Deadline urgency**: if the linked posting's deadline is < 72h away, add a reason and flip manual → assist — but never for "hard" portals.
4. **Override learning**: scans all `mode_decisions` rows; if the user has overridden the recommendation ≥ 2 times on the same ATS family (matched by `signals.ats`), follow the user's latest overriding choice instead, with a "following your pattern" reason. (Only manual/assist choices are followed — an auto choice is not echoed as a recommendation.)
5. Returns `{recommended, reasons[], signals: {ats, atsTier, deadline}}` — persisted into `applications.mode_recommendation` by the tracker detail page (computed once per application, then cached in the row).

#### `src/lib/drafting.ts`
The LLM drafting engine for Agentic Assist. Exports `DraftContext`, `draftCoverLetter(ctx)`, `draftShortAnswer(ctx, prompt)`.

- Model: **`claude-sonnet-5`** (`MODEL` const), max_tokens 1500.
- **Offline mode**: without `ANTHROPIC_API_KEY`, returns clearly-labeled placeholder text (`[PLACEHOLDER COVER LETTER — the Claude API key isn't configured yet...]`) so the entire draft→review→save→PDF flow is testable with no key.
- Few-shot voice transfer: pulls up to 3 most-recent writing samples of the relevant set (`cover_letter` or `short_answer` — the two sets are deliberately separate voices) and embeds them as `<sample_N title="...">` blocks in the system prompt. With no samples, instructs "natural, direct, first-person voice without clichés."
- System prompts pin the constraints: write in *their* voice, "Never invent experience not present in their profile", output only the letter/answer body.
- User message carries company, role, posting description (capped 6000 chars for letters / 4000 for answers; letters get "keep the letter role-generic but company-specific" when no description exists), and the whole `profile.data` as JSON.

Called by `app/actions/assist.ts`.

#### `src/lib/documents.ts`
PDF rendering + storage-destination-aware persistence. Exports `docFolder`, `renderPdf`, `SavedDoc`, `saveGeneratedDocument`.

- `docFolder(company, roleTitle)` → the spec folder scheme `["Internships", "<current year>", "<Company>_<Role>"]`, with filesystem-hostile characters sanitized and each segment capped at 60 chars. This is the same path used on disk and mirrored in Google Drive (and visible in `data/uploads/Internships/2026/Lambda_2026 Machine Learning Research Intern/`).
- `renderPdf(title, body)` — plain-text → clean PDF via **pdf-lib**: US Letter (612×792), 64pt margins, Helvetica 11pt with bold 14pt title, greedy word-wrapping measured with `font.widthOfTextAtSize`, automatic page breaks, blank lines as paragraph spacing. No markdown/rich text.
- `saveGeneratedDocument(opts)` — reads the settings row's `storageDestination`, then:
  1. **Always writes an in-app copy** to disk at `<UPLOAD_DIR>/<folder>/<filename>` ("the extension and download links need retrievable bytes") — `documents.location` is always this disk key regardless of destination.
  2. If destination is `gdrive`: mirrors to Drive via `uploadToDrive` when configured; on failure or when unconfigured, captures a human-readable `driveError` on the returned `SavedDoc` instead of failing the save.
  3. Inserts a `documents` row and returns `{documentId, destination, location, downloadUrl: /api/documents/{id}/download, driveError?}`.
  - Destination `local` has no special server-side behavior — the *client* (AssistPanel) surfaces an immediate download link; the copy is still on the server.

#### `src/lib/storage.ts`
Raw upload storage. `UPLOAD_DIR = process.env.UPLOAD_DIR ?? <repo>/data/uploads`. Exports:
- `saveUpload(file, prefix)` → key `"{prefix}/{timestamp}-{8 hex random}{ext}"` (extension inferred from filename, `.pdf` fallback), mkdir -p + write, returns the key (stored in `resumes.file_key`).
- `deleteUpload(key)` — unlink, swallowing already-gone errors.
- `uploadPath(key)` — absolute path join.

The docstring mentions a planned R2 backend behind the same interface ("so callers never care which one is active") — **not implemented**; production uses the Railway volume at `/data/uploads` instead. The `R2_*` env vars in `.env.example` are currently unused by any code.

#### `src/lib/gdrive.ts`
Minimal Google Drive client — refresh-token flow, plain `fetch`, no SDK. Exports `driveConfigured()` (all three of `GDRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN` present) and `uploadToDrive(folderPath, filename, bytes, mimeType)`:
1. Exchanges the refresh token for an access token at `oauth2.googleapis.com/token`.
2. Walks `folderPath`, `findOrCreateFolder` per segment (Drive `files` search by name + folder mimeType + parent, else create) — building `/Internships/2026/Company_Role/` on demand.
3. Multipart-related upload (hand-rolled boundary `tracker-upload-boundary`: JSON metadata part + bytes part) to `upload/drive/v3/files?uploadType=multipart`. Returns the Drive file id. Throws with status + body text on failure (captured as `driveError` upstream).

#### `src/lib/resolve-resume.ts`
Resume selection shared by the packet (metadata) and resume (bytes) assist routes "so they agree". `resolveResumeForApplication(resumeId)`: explicit application `resumeId` if it still exists → else the `isDefault` resume → else the most recently uploaded → else null. `resumeFilename(resume)`: sanitized display label + the stored file's original extension (e.g. `"ML-focused.pdf"`) — this is what lands in the `x-filename` header and ultimately in the portal's file input.

#### `src/lib/resume-parse.ts`
`parseResume(resumeId)`: parses an uploaded resume PDF into structured JSON for auto-fill enrichment using **`claude-haiku-4-5-20251001`** with a base64 PDF `document` content block. No-ops when: no API key, resume not found, already parsed, or file isn't a `.pdf`. Prompt requests strict JSON `{education[], experience[], skills[], projects[], links{}}`; response is stripped of markdown fences and `JSON.parse`d; unparseable output silently leaves the row pending ("a re-upload retries"). The result is stored in `resumes.parsed` — displayed as a "parsed" indicator in the Profile UI. **Note:** the parsed structure is stored but not currently consumed by the fill pipeline (the extension fills from `profile.data`, which the user maintains by hand; parse-to-profile enrichment is a stated intention, not wired up).

#### `src/lib/screenshot-extract.ts`
`extractPostingFromScreenshot(base64, mediaType)` — vision extraction for **Screenshot Intake** (§5g). Exports `ScreenshotMediaType` (`"image/png"|"image/jpeg"|"image/webp"`), `ScreenshotExtraction`, `ExtractResult`.

- Model **`claude-haiku-4-5-20251001`**, `max_tokens: 1000`, one user message with an `image` content block (base64) + a text prompt.
- The prompt (`EXTRACTION_PROMPT`) targets "a screenshot of a social-media post (often an Instagram story)" and asks for strict JSON `{company, title, url?, locations?, term?, notes?}` — with an explicit anti-fabrication instruction on `url`: *"ONLY include if a full or near-complete URL is actually legible in the image. Never guess, complete, or construct one from the company name."*
- No API key → `{ok: false, data: {company: "", title: ""}, message: "The Claude API key isn't configured yet — fill in the details below by hand."}` (same graceful-degradation pattern as `drafting.ts`/`resume-parse.ts`).
- Response parsing strips ```` ```json ```` fences, `JSON.parse`s, and defensively coerces every field (non-string/empty → `undefined`); a parse failure or an extraction with neither `company` nor `title` returns `ok: false` with a specific user-facing `message`, never a throw — the intake form always has *something* to show, even if it's blank fields the user fills by hand.
- The decoded image bytes live only in this function's call stack — nothing is written to disk or the DB (the screenshot itself is never persisted, per the intake's "extract and discard" design).

Called by `app/actions/intake.ts extractFromScreenshot`.

#### `src/lib/interview-prep.ts`
Interview & skill-prep engine (P2-M3). Exports `PrepContext`, `InterviewPrep` (re-exported from `@tracker/db`, where the type actually lives — see §4), `generateInterviewPrep(ctx)`.

- Model **`claude-sonnet-5`**, `max_tokens: 4000` — deliberately generous: *"a full five-section prep runs past 2k tokens, and a truncated response yields unparsable JSON."*
- System prompt instructs the model to ground every suggestion in the specific posting/description (not generic advice), personalize using the user's profile, **never fabricate URLs or specific problem IDs/links** — reference practice problems/resources by well-known **name only** ("Two Sum", "NeetCode 150", "Cracking the Coding Interview") — and cap list sizes (≤6 focus areas, ≤10 practice problems, ≤5 project ideas, ≤6 resources, ≤6 behavioral prompts) to stay inside the token budget.
- Output shape: `{focusAreas: [{topic, why}], practiceProblems: [{name, pattern, difficulty: "easy"|"medium"|"hard"}], projectIdeas: string[], resources: [{name, kind}], behavioral: string[]}`.
- `parsePrep(raw)` — defensive JSON parse: strips fences, type-guards every array/field individually and drops malformed entries rather than crashing; returns `null` (not a throw) only when *every* section ends up empty.
- **Two distinct failure modes, deliberately not conflated**: no API key → `offlinePrep(ctx)`, a clearly `[PLACEHOLDER]`-labeled but *valid* `InterviewPrep` object (so the UI renders normally in dev). A parse failure of a real model response instead **throws** — the code comment explains why: *"NOT that the key is missing... surface it as an error so the client can toast 'try again' rather than showing the misleading offline placeholder, which would falsely claim the API key isn't configured."*

Called by `app/actions/prep.ts generatePrep`.

#### `src/lib/neetcode.ts`
Two tiny link helpers for the prep panel, both deliberately fabrication-free: `NEETCODE_PRACTICE_URL` (constant, `https://neetcode.io/practice`) and `leetcodeSearchUrl(problemName)` (`https://leetcode.com/problemset/?search=<encoded name>`) — a LeetCode *search* URL rather than a guessed problem slug, so a model-suggested "Two Sum" always resolves to something real even though `interview-prep.ts` never invents a specific link itself.

#### `src/lib/latex-compile.ts`
**Resume Studio's** Tectonic compile sandbox. Exports `CompileResult`, `compiledKeyFor(id)`, `previewKeyFor(id)`, `compileLatexResume(id)`, `compileLatexPreview(id, source)`.

- **`runTectonic(source)`** (internal) — the actual sandbox: rejects source over 200KB up front; writes it to `main.tex` in a fresh `mkdtemp` temp dir; runs `execFile(TECTONIC_PATH ?? "tectonic", ["--keep-logs", "--outdir", dir, "main.tex"], {cwd: dir, timeout: 45_000, env: {...process.env, XDG_CACHE_HOME: TECTONIC_CACHE_DIR}})` — **never a shell string**, fixed argv only; rejects a compiled PDF over 5MB; always tails stdout+stderr to the last 4000 chars for the stored `compileLog`; **always removes the temp dir** in a `finally`, success or failure. A timeout is detected via the caught error's `killed` flag and gets a distinct "Compile timed out after 45s" log prefix.
- **`compileLatexResume(id)`** — the normal "Compile" button path: loads the row's saved `source`, runs it, and on success **persists**: writes the PDF to `uploads/latex-resumes/<id>.pdf` (`compiledKeyFor`), updates `compiledKey`/`lastCompiledAt`/`compileLog` on the row. On failure, updates only `compileLog` (leaves any previous good `compiledKey` in place) and returns `ok: false`.
- **`compileLatexPreview(id, source)`** (added for the preview-before-apply feature, §5i) — compiles an arbitrary **proposed** source string (e.g. from chat) instead of the row's saved source, and on success writes to a **separate throwaway key** `latex-resumes/<id>-preview.pdf` (`previewKeyFor`) — deliberately touching neither the row's `source` column nor its real `compiledKey`, so the saved resume and its "Save as version" PDF are untouched until the user explicitly applies the change.
- Both return `{ok, log, pdfUrl?}`; `pdfUrl` points at `/api/latex/pdf/<id>` (real) or `/api/latex/pdf/<id>?preview=1` (throwaway), each cache-busted with `?t=<timestamp>`.

Called by `api/latex/compile/route.ts` (dispatches to one or the other based on whether the request body carries a `source`) and `api/latex/pdf/[id]/route.ts` (reads back whichever key).

#### `src/lib/latex-templates.ts`
`JAKES_RESUME_TEMPLATE` — the built-in starter document for a new Resume Studio resume: a one-page CS-student resume in the style of the well-known community "Jake's Resume" (`\documentclass[letterpaper,11pt]{article}` + `latexsym`, `fullpage`, `titlesec`, `marvosym`, `color`, `verbatim`, `enumitem`, `hyperref`, `fancyhdr`, `babel`, `tabularx`). Deliberately plain-package-only, no shell-escape, no exotic fonts — "so Tectonic compiles them out of the box." Used by `createLatexResume()` as the seed `source` for every new row.

#### `src/lib/applied-side-effects.ts`
`onApplied(id, company, roleTitle)` — the canonical side effects of an application *first* reaching "applied", shared by the manual stage change and the extension's auto-apply report:
1. Enqueues the submission receipt **via SQL** directly into graphile-worker's queue:
   ```ts
   await db.execute(sql`select graphile_worker.add_job('send_confirmation', json_build_object('applicationId', ${id}::int))`);
   ```
   (The web app has no graphile-worker dependency — it enqueues by calling the SQL function graphile-worker installs in the database. This is the sanctioned cross-service enqueue pattern used everywhere in this repo.)
2. **Repost hiding**: loads all active postings, normalizes company+title with `@tracker/shared`, and sets `status = "hidden"` on every posting matching the applied role — so re-posts of a role the user already applied to stop appearing and stop notifying.

#### `src/lib/format.ts`
Client-safe display helpers: `timeAgo(date)` (coarse "just now/5m/3h/2d/1mo/1y ago"), `ROLE_LABELS` (`swe→SWE, ml→ML, data→Data, quant→Quant, other→Other CS`), `LOCATION_MODE_LABELS` (unknown → empty string so it renders nothing).

#### `src/lib/assistant.ts` — the Assistant chatbot engine
`runAssistant(history, message)` drives the `/chat` bot on **claude-sonnet-5** via tool use. Defines five **read-only** tools (`search_postings`, `get_posting_stats`, `get_applications`, `get_reminders`, `get_analytics_summary`) — each a Drizzle `db.select()` over the live data (postings/applications/reminders/sources/mode-decisions), wrapped in try/catch so a bad model-supplied enum returns `{error}` instead of crashing. The loop is bounded (`MAX_TOOL_ROUNDS=6`, per-tool result truncated to `TOOL_RESULT_MAX_CHARS=7000`, only the last `HISTORY_WINDOW=12` messages sent, `max_tokens=1200`); it runs the model, executes any requested tools in parallel, feeds results back, and returns the final text turn. Because every tool is a SELECT, the model **structurally cannot mutate state**. System prompt dates itself to America/New_York, instructs plain-text output (rendered via `RichText`), and to label general recruiting knowledge as guidance vs. live data. Offline (no `ANTHROPIC_API_KEY`) it returns a clear notice, mirroring `drafting.ts`.

#### `src/lib/posting-description.ts` — on-view description extraction
`extractPostingDescription(url)` fetches a posting's own page (SSRF-guarded by `isPublicHttpUrl`: http(s) only, rejects localhost/`.local`/private+loopback+link-local IPv4/IPv6, trailing-dot FQDNs, and bare integer/hex IP encodings — 10s timeout, 60k HTML / 15k text caps), strips it to text, and asks **claude-haiku-4-5** for a concise summary (role/skills/target grad dates/sponsorship). Returns null on any failure; the caller (`actions/postings.ts` `generatePostingDescription`) persists `""` on failure as a sentinel so it isn't re-attempted, or the summary otherwise, into `postings.description`.

### 3.4.3 `src/app/actions/` — server actions

All are `"use server"` modules called directly from client components (React 19 transitions). None re-check auth beyond the proxy guard — acceptable in a single-user app where every page is session-gated.

#### `actions/applications.ts`
The tracker's write API and the heart of the mode rules.

- **`updateStage(id, stage)`** — updates stage; on the *first* transition into `applied` (guarded by `wasApplied = appliedAt !== null`) also stamps `appliedAt` and calls `onApplied()` (receipt + repost hiding). Revalidates `/tracker` and `/`.
- **`addManualApplication(formData)`** — the paste-a-link flow. If company/role are blank, fetches the URL (5s timeout, honest user-agent) and parses `og:title` or `<title>`, splitting on ` - `, ` – `, ` | `, ` @ ` to guess role/company; falls back to hostname. **SSRF-guarded** by `safeToFetch()`: http(s) only, and a `PRIVATE_HOST_RE` rejecting localhost, 127.x, 10.x, 192.168.x, 169.254.x (link-local/cloud metadata), 0.x, ::1, `*.internal`/`*.local`, plus a separate regex for 172.16–31.x. Inserts with `stage: "saved"` and **no mode**.
- **`updateApplication(id, fields)`** — partial update of notes/resumeId/company/roleTitle/location.
- **`setApplicationMode(id, mode)`** — sets manual/assist/null. Two rule enforcements in code: *"Any move away from 'auto' revokes a standing auto-apply approval. Auto is only ever set through approveAutoApply, never here"* — it clears `autoApplyApprovedAt` whenever `mode !== "auto"`. Also records a `mode_decisions` row (recommended vs chosen + signals) whenever a recommendation existed, feeding the recommender's override learning.
- **`approveAutoApply(id)`** — the *only* code path that sets `mode: "auto"`: stamps `autoApplyApprovedAt`, **resets `blockerRetries` to 0** (fresh approval = fresh retry budget), records the mode decision. Its docstring: "Only reached through the pre-submit preview + explicit checkbox in auto-apply-optin.tsx... Per-application and revocable."
- **`deleteApplication`, `addReminder`, `toggleReminder`, `deleteReminder`** — straightforward CRUD (reminder due date validated with `isNaN(getTime())`).

#### `actions/assist.ts`
Drafting + document persistence.

- `contextFor(applicationId)` — assembles the `DraftContext` (application row + linked posting's description + `profile.data`).
- **`generateCoverLetter(applicationId)`** / **`generateShortAnswer(applicationId, prompt)`** — thin wrappers over `lib/drafting.ts`; return raw text for the client textarea.
- **`saveAssistDocuments(applicationId, {coverLetter?, answers?})`** — renders each non-empty piece to PDF (`CoverLetter.pdf`; answers concatenated as `Q: prompt\n\nanswer` blocks separated by `———` into `ShortAnswers.pdf`), saves via `saveGeneratedDocument` (destination-aware), and — critically — persists the reviewed raw text into `applications.drafts` (comment: *"this is exactly what the extension fills"*). Returns `SavedDoc[]` for the client to render download links / drive errors.
- **`updateStorageDestination(dest)`** — single-row upsert of `settings.storage_destination`. (Lives here rather than `actions/settings.ts` because it's part of the assist/document surface.)

#### `actions/postings.ts`
`toggleBookmark`, `savePostingNotes`, and **`trackPosting(id)`** — copies a posting into the tracker at stage `saved`, deduplicating on `applications.postingId`. Comment reiterates: "The application mode stays null — per spec, the user always chooses it explicitly, never a default."

#### `actions/profile.ts`
- **`uploadResume(formData)`** — validates presence and ≤ 10 MB, `saveUpload(file, "resumes")`, inserts with `isDefault: existing.length === 0` (first upload becomes default), then best-effort `parseResume()` (dynamically imported; errors logged, never block the upload).
- **`deleteResume`** — deletes row then file.
- **`setDefaultResume`** — clears all `isDefault` flags then sets one (two statements, no transaction — a crash between them leaves no default, which `resolveResumeForApplication` tolerates by falling back to newest).
- **`saveProfile(data)`** — single-row upsert of the entire `profile.data` blob (the auto-fill field map).

#### `actions/samples.ts`
`addWritingSample(set, formData)` / `deleteWritingSample(id)` — CRUD for the two few-shot sample sets.

#### `actions/settings.ts`
- **`SettingsUpdate`** — partial-update shape; now includes `autoApplyEnabled?`, `watchlistCompanies?`, and `digestHours?` alongside the original timezone/quietHours/channels/includeNewGrad/notificationRules fields.
- **`updateSettings(update)`** — single-row upsert on the constant `id: true` primary key; revalidates `/settings` and `/internships` (the latter because `includeNewGrad` changes the default listing filter). Called by `components/auto-apply-settings.tsx` (`{autoApplyEnabled}`) and `components/notification-settings.tsx` (`{watchlistCompanies, digestHours}`) in addition to its original callers.
- **`enqueueConfirmation(applicationId)`** — SQL `add_job('send_confirmation', ...)`. Its comment says "Used by tracker stage changes" but nothing currently imports it — the live path is `onApplied()` in `applied-side-effects.ts`. Dead-but-harmless export (see §9).
- **`disconnectGmail()`** — P2-M2's revoke path. Reads the stored `gmailRefreshToken`, best-effort calls Google's revoke endpoint via `revokeGoogleToken` (`@tracker/shared`; failures are swallowed since the local copy gets cleared regardless), then clears `gmailEnabled`/`gmailRefreshToken`/`gmailConnectedEmail`/`gmailLastSyncAt` in one upsert. Called from `components/gmail-settings.tsx`'s Disconnect button.

#### `actions/intake.ts` — Screenshot Intake's write path
- **`extractFromScreenshot(formData)`** — validates the uploaded `image` field (present, ≤10MB, MIME in `{image/png, image/jpeg, image/webp}`), base64-encodes it, and calls `lib/screenshot-extract.ts extractPostingFromScreenshot`. Every rejection path (missing file, oversized, wrong type) returns the same `ExtractResult` shape with a user-facing `message` rather than throwing, so the client component never needs a separate error branch.
- **`ConfirmedIntake`** / **`IntakeCreateResult`** — the user-edited-and-confirmed shape (`{company, title, url?, locations?, term?, notes?}`) and the result (`{status: "created"|"existing", postingId}`).
- **`createPostingFromIntake(input)`** — runs the confirmed fields through the **same normalize/dedupe/tag pipeline as the worker's ingest** (`classifyRole/Level/LocationMode`, `extractTerms`, `dedupeHash` from `@tracker/shared`) so a screenshot-sourced posting is indistinguishable from a polled one once created. Computes `dedupeHash({company, title, locations})` first and checks for an existing row — a match returns `{status: "existing", postingId}` **without inserting a duplicate** (the doc comment: this means "the worker (or an earlier intake) has already recorded this exact company + role + location — we return that posting instead"). On insert, `onConflictDoNothing({target: postings.dedupeHash})` handles a race against a concurrent poll/intake; losing the race re-queries and returns the winner's row as `existing`. `seenIn` stays `[]` — there's no `sources` row for a manual intake. `url` may be an empty string (the user leaves it blank when "link in bio" isn't legible in the screenshot) — this is what makes the Apply-link-hiding UI change (below) necessary.

#### `actions/prep.ts`
- `contextFor(applicationId)` — assembles `PrepContext` (application row + linked posting's description/roleType + `profile.data`), mirroring `actions/assist.ts`'s `contextFor` pattern.
- **`generatePrep(applicationId)`** — calls `lib/interview-prep.ts generateInterviewPrep`, persists the result into `applications.prep` (cached exactly like `mode_recommendation` — generated once, regenerable on demand, "so views don't re-bill"), revalidates `/tracker` and `/tracker/{id}`, and returns the fresh `InterviewPrep` for the client to render immediately without a refetch.

#### `actions/latex.ts` — Resume Studio's write path
- **`createLatexResume()`** — inserts a new `latex_resumes` row seeded with `JAKES_RESUME_TEMPLATE`, named "Untitled resume"; returns the new id for the client to `router.push` into the editor.
- **`updateLatexResume(id, {name?, source?})`** — the autosave/rename path; revalidates both the list and detail pages.
- **`deleteLatexResume(id)`** — deletes the row, then best-effort-deletes its compiled PDF (`deleteUpload(row.compiledKey)`) **and** its throwaway preview PDF (`deleteUpload(previewKeyFor(id))`, added for the preview feature — a no-op if the resume was never previewed, since `deleteUpload` swallows already-gone errors).
- **`saveLatexResumeAsVersion(id)`** — copies the row's *persisted* compiled PDF (not a preview) into the standard resume flow: reads the bytes from disk, `saveUpload(..., "resumes")`, inserts a non-default `resumes` row named `"<name> (Studio)"`, then best-effort `parseResume()` on it (dynamically imported, errors logged not thrown) — identical mechanics to the profile-upload path in `actions/profile.ts`. Fails cleanly with `{ok: false, error}` if the resume was never successfully compiled.
- **`chatLatex(id, userMessage)`** — the conversational assistant. Loads context (current `source`, `profile.data`, the default resume's `parsed` structure), and — without an API key — returns a clearly `[The Claude API key isn't configured yet...]`-labeled offline reply. With a key, model **`claude-sonnet-5`**, `max_tokens: 2500`, system prompt pins: never invent facts absent from the profile/parsed-resume/conversation; when producing LaTeX, output the **complete** updated document wrapped in exactly one `<latex>...</latex>` block (never a partial snippet, never more than one block); stay outside `<latex>` for plain prose. History capped at `MAX_CONTEXT_MESSAGES = 12` sent to the model, `MAX_STORED_MESSAGES = 30` persisted to `chat_history`.

#### `actions/sources.ts`
- `KIND_CONFIG_FIELDS` — the per-kind config field whitelist (github_repo: repo/branch/listingsPath/**columns**; greenhouse: boardToken; lever: site; smartrecruiters: company; **ashby: clientName**; workday: host/tenant/site/searchText; rss + instagram_mirror: feedUrl/defaultCompany). `columns` (README column-map parser, §3.5) is a free-text override like `"company=1,role=2,location=3,link=5"` for non-standard README tables.
- **`addSource(formData)`** — builds the `config` jsonb from only whitelisted, non-empty fields.
- **`toggleSource` / `deleteSource`** — enable/disable/remove.
- **`addPresetSource(preset)`** — one-click presets for `"simplify"` (SimplifyJobs/Summer2026-Internships, branch `dev`, `.github/scripts/listings.json`) and `"vanshb03"` (Summer2027-Internships, same layout). These are the two production sources.

#### `actions/assistant.ts` — the Assistant's write/persist path
- **`askAssistant(message)`** — loads persisted history from `settings.assistant_chat_history`, runs `runAssistant` (`lib/assistant.ts`), then upserts `[...history, user, assistant].slice(-HISTORY_CAP=30)` back with `onConflictDoUpdate` touching **only** `assistant_chat_history` + `updatedAt` (so it can't clobber other settings columns). Returns `{reply}`.
- **`clearAssistantChat()`** — resets the history to `[]`.

#### `actions/postings.ts` (also)
Beyond bookmark/notes/track, exposes **`generatePostingDescription(id)`** — calls `lib/posting-description.ts`, persists the summary or `""`-failure sentinel to `postings.description`, revalidates the detail page. And `actions/auth.ts` gained **`signInWithGoogleAction`** (used by the landing page's Continue-with-Google forms) alongside `signOutAction`.

### 3.4.4 `src/app/api/` — route handlers

#### `api/auth/[...nextauth]/route.ts`
Two lines: re-exports `GET`/`POST` from `handlers` in `src/auth.ts`. All NextAuth endpoints (`/api/auth/signin`, `/api/auth/callback/google`, session, csrf, etc.).

#### `api/assist/packet/route.ts` — the extension's data source
`GET /api/assist/packet?url=<active tab URL>`, bearer-token auth, `OPTIONS` preflight.

1. 401 unless `assistAuthorized`. 400 on unparseable `url` param.
2. **URL → application matching** (the heuristic, ordered): loads *all* applications ordered by `updatedAt desc`, then
   - first application whose stored URL (query-string stripped) is a prefix of the tab URL (`url.startsWith(a.url.split("?")[0])`),
   - else first application whose stored URL has the **same hostname** as the tab.
   The `updatedAt desc` ordering means on shared ATS domains (e.g. two Greenhouse applications at `boards.greenhouse.io`), the *most recently touched* application wins — a known heuristic limitation (§9).
3. No match → `{"match": null}` (200).
4. **Master Auto-Apply kill switch enforcement** (added with `settings.auto_apply_enabled`, migration 0007) — this route is the *sole* authoritative gate: it reads `settings.autoApplyEnabled` (default false) and computes `effectiveMode = match.mode === "auto" && !autoApplyEnabled ? "assist" : match.mode`. When the switch is off, an application the user individually opted into Auto-Apply still gets reported to the extension as `mode: "assist"` — the extension never even learns the real mode is `auto`, so there is no client-side code path that could submit while the switch is off. `autoApply.approved` is then computed from `effectiveMode`, not the raw stored mode. The switch has no effect on `assist`/`manual`/`null` applications.
5. On match, resolves the latest `cover_letter` document for the application and the effective resume, and returns:
```json
{
  "match": {
    "applicationId": 12,
    "company": "…", "roleTitle": "…",
    "mode": "assist" | "manual" | "auto" | null,   // "auto" downgraded to "assist" when the master switch is off
    "drafts": { "coverLetter": "…", "answers": [{"prompt": "…", "answer": "…"}] },
    "autoApply": { "approved": true|false },       // effectiveMode === "auto" && !!autoApplyApprovedAt
    "coverLetterPdfUrl": "/api/assist/document/34" | null,
    "resumePdfUrl": "/api/assist/resume?applicationId=12" | null,
    "resumeFilename": "ML-focused.pdf" | null
  },
  "profile": { …entire profile.data… }
}
```

#### `api/assist/document/[id]/route.ts`
`GET`, token-authed: streams a generated document's PDF bytes from disk (`uploadPath(doc.location)`, content-type `application/pdf`). Used by the popup to fetch the cover-letter bytes it will attach to file inputs. 404 on unknown id or missing file.

#### `api/assist/resume/route.ts`
`GET ?applicationId=N`, token-authed: resolves the application's effective resume via `resolveResumeForApplication`, streams the bytes with content-type `application/pdf` (or `application/octet-stream` for non-PDF) and the **`x-filename`** response header (exposed via CORS) carrying `resumeFilename(...)` so the extension can name the `File` object realistically.

#### `api/assist/match-option/route.ts` — the Haiku semantic option matcher
`POST` `{question, options[], storedAnswer}`, token-authed. The semantic fallback for choice questions: content.js's literal text match runs first; when it fails, the popup calls here.

- Strict validation: non-empty strings; options array of 2–30 strings, each 1–199 chars (bounds the prompt and blocks junk).
- No `ANTHROPIC_API_KEY` → `{index: null, reason: "no api key"}` (never an error — the field just stays orange for the human).
- Model: **`claude-haiku-4-5-20251001`**, max_tokens 100. System prompt (the safety property is in the prompt): *"Reply ONLY with the 0-based index of the option that expresses the same answer, or the word NONE if no option clearly matches. Never guess between plausibly different answers — when unsure, reply NONE."* The route's own docstring: *"This endpoint NEVER invents an answer: it only ever returns the index of an option that expresses the SAME answer the user already stored."*
- Response parsing: first integer in the reply, bounds-checked against the options length; anything else (including "NONE") → `{index: null}`. API errors are also `{index: null, reason}` — graceful degradation everywhere.
- Origin story: built (v0.3.0) after the user's veteran-status dropdown failed on wording variance — stored answer "I am not a protected veteran" vs a portal option phrased differently.

#### `api/assist/report/route.ts` — auto-apply outcome reporting
`POST` `{applicationId, event: "submitted"|"blocked"|"failed", detail?}`, token-authed.

- **`submitted`** → sets `stage: "applied"` (+ `appliedAt` if first time) and calls `onApplied()` — same receipt + repost-hiding path as a manual stage change.
- **`blocked`** → increments `applications.blocker_retries`; when the counter reaches **3**, enqueues via SQL:
  ```sql
  select graphile_worker.add_job('send_blocker_notice',
    json_build_object('applicationId', $1::int, 'detail', $2::text))
  ```
  The counter persists across popup sessions — three total blocked reports on an application trigger the notice, even across days. (`approveAutoApply` resets it to 0 on re-approval.)
- **`failed`** → no state change ("the popup already surfaced the reason").
- Responds `{ok: true, blockerRetries}`.

#### `api/documents/[id]/download/route.ts`
Session-guarded (via proxy) `GET`: streams a stored document as an attachment (`content-disposition: attachment; filename="<basename>"`, content-type `application/pdf`) using a Node `createReadStream`. Backs every "Download" link in the UI.

#### `api/latex/compile/route.ts` — Resume Studio's compile endpoint
Session-guarded `POST {id, source?}`. Dispatches on whether `source` is present in the body: with a non-empty `source` string, treats the request as "compile this **proposed** change as a throwaway preview" → `compileLatexPreview(id, source)` (leaves the saved resume and its persisted compile untouched); without it, compiles the resume's own saved source and persists the result as usual → `compileLatexResume(id)`. A failed compile (`ok: false`) is returned with **HTTP 422** (not 200) so the client's `res.ok` check doubles as the success/failure signal; the JSON body (`{ok, log, pdfUrl?}`) is identical either way.

#### `api/latex/pdf/[id]/route.ts`
Session-guarded `GET`, streams the compiled PDF inline (`content-disposition: inline`, for the studio's `<iframe>` preview pane) via `createReadStream`. `?preview=1` serves the **throwaway** preview key (`previewKeyFor(id)`) written by `compileLatexPreview`; without it, serves the resume's persisted `compiledKey`. 404 if the resume row, the relevant key, or the underlying file is missing. Filename in the `content-disposition` header is the resume's sanitized `name`, suffixed `" (preview)"` when `?preview=1`.

#### `api/push/subscribe/route.ts`
Session-guarded. `POST` — validates `{endpoint, keys:{p256dh, auth}}` and upserts into `push_subscriptions` (`onConflictDoNothing` on the unique endpoint — re-subscribing is idempotent). `DELETE` — removes by endpoint. Multi-device by design: every row receives every push.

#### `api/gmail/connect/route.ts` — P2-M2's consent-flow start
Session-guarded `GET` (not in the proxy's exclusion list, so it's protected exactly like every page — no bespoke auth check needed, matching the codebase's stated convention of not re-checking auth beyond the proxy guard). Generates a `crypto.randomUUID()` CSRF state, stores it in a short-lived (10 min) httpOnly cookie (`gmail_oauth_state`), and 307-redirects to Google's OAuth consent screen (`googleAuthUrl` from `@tracker/shared`) requesting **only** `https://www.googleapis.com/auth/gmail.readonly`, with `access_type=offline` and `prompt=consent` (the latter forces Google to reissue a `refresh_token` even on a repeat connect, since Google otherwise omits it after the first-ever grant). This is a **completely separate OAuth flow from sign-in** (`src/auth.ts`'s NextAuth Google provider) — connecting or disconnecting Gmail monitoring never touches the sign-in session or its scope.

#### `api/gmail/callback/route.ts` — P2-M2's consent-flow completion
Session-guarded `GET`. Reads `code`/`state`/`error` from the query string, reads back and deletes the `gmail_oauth_state` cookie, and rejects (redirect to `/settings?gmail=error`) unless the state matches exactly — the CSRF guard. On success: `exchangeGoogleCode` (`@tracker/shared`) for tokens; if Google didn't return a `refresh_token` (rare given `prompt=consent` above), treats it as an error rather than silently storing nothing useful. Fetches the connected account's email via `fetchGoogleUserEmail` (purely for display in Settings). Upserts `settings.{gmailEnabled: true, gmailRefreshToken, gmailConnectedEmail, gmailLastSyncAt: null}` — the reset to `null` on `gmailLastSyncAt` means the very next worker sync scans the standard 2-day lookback window rather than assuming any prior history. **Never persists the access token** (short-lived, regenerated per sync from the refresh token) and never touches the inbox itself during this flow. Redirects back to `/settings?gmail=connected|error&detail=...`, which `components/gmail-settings.tsx` reads on mount to toast the result.

### 3.4.5 Pages (`src/app/`)

#### `app/layout.tsx` (root layout)
Imports `globals.css`; metadata title template `"%s — Erevnitis"`; theme-color viewport meta per color scheme. Loads **Bricolage Grotesque** via `next/font/google` (exposed app-wide as the `--font-display` CSS variable on `<html>`). Injects a **blocking inline script before first paint** that applies the stored theme (`localStorage.theme`, falling back to `prefers-color-scheme`) by toggling the `dark` class on `<html>` — the standard anti-flash pattern (with `suppressHydrationWarning`).

#### `app/signin/page.tsx` — the public landing page
No longer a bare sign-in card: a **server wrapper that redirects an authenticated owner to `/`** and otherwise renders `<Landing/>` (`components/landing.tsx`), the animated marketing page (brand register: Bricolage display headline, scroll-reveal feature rows, ink CTA, Continue-with-Google forms wired to `signInWithGoogleAction`). The route name stays `/signin` — it's both the logged-out home and the sign-in surface (the proxy already whitelists it).

#### `app/(app)/layout.tsx`
The authenticated app shell: `<ToastProvider>` wrapping `<TopNav/>` (the horizontal top nav, replacing the old fixed sidebar) + a full-width `<main>` (`mx-auto max-w-7xl px-5 md:px-10`, no sidebar offset). `app/(app)/template.tsx` additionally wraps every page in `<MotionConfig reducedMotion="user">` + a crossfade page-transition on navigation.

#### `app/(app)/page.tsx` — Dashboard
Six parallel queries: postings new in 24h (count), active applications (count over stages saved…interviewing), reminders due within 7 days (count), 6 latest active postings, up to 8 **overdue** reminders (joined to applications), and up to 8 applications with `blockerRetries >= 3`. Renders three stat cards, then the **"Needs attention"** panel merging overdue reminders (warning/bell icon) and blocked auto-applies (danger/triangle icon, "needs your attention (N retries)"), each row linking to its `/tracker/{id}` page — this is the on-dashboard surface of the blocker flow. Then "Latest postings" in a `StaggerGrid` of `PostingCard`s.

#### `app/(app)/internships/page.tsx` — listing + filters
Server component translating query-string params into SQL. Filter keys: `q, term, year, role, loc, level, sponsor, posted, saved, sort`.

- Base condition: `status = 'active'`.
- **Level gating**: explicit `level` param wins; otherwise `includeNewGrad === false` (the settings toggle) restricts to internships. When `includeNewGrad` is on, the FilterBar shows Internships/New Grad toggle chips.
- `role`, `loc`, `sponsor`, `saved=1` → straight enum/boolean equality.
- `term` (season) → `exists (select 1 from jsonb_array_elements_text(terms) t(v) where v ilike 'summer%')` — prefix match so bare "Summer" and "Summer 2026" both hit.
- `year` → same jsonb-exists with suffix match `'% 2026'`.
- `posted` → `firstSeenAt >= now - {1|7|30}d` (whitelisted values only).
- `q` → `ilike` across company, title, and `locations::text`.
- Sort: `deadline` (`asc nulls last`), `company` (A–Z), default `firstSeenAt desc`. Hard limit 200 rows (header shows "200+" when hit).
- The **year chip options are data-driven**: `select distinct right(v, 4) from jsonb_array_elements_text(terms)` where the term ends in a year.
- The search `<form method="GET">` embeds all other active params as hidden inputs so searching doesn't clear filters.

#### `app/(app)/internships/[id]/page.tsx` — posting detail
Loads the posting, resolves `seenIn` source ids to source names, and checks whether it's already tracked. Header: logo, title, meta line (role/mode/locations/found-ago/deadline), Save (bookmark) form, **Track** button (inline server action → `trackPosting`) or "In tracker" link, and the external Apply link — **hidden when `posting.url` is empty** (`{posting.url && (...)}`) , with an inline comment noting why: *"Screenshot-intake postings can have no URL (story said 'link in bio')."* Body: description card (or "source doesn't include a description"), My-notes card (server-action form, its submit button now `<SubmitButton>` for a proper pending state — see `components/submit-button.tsx`), and the "Seen in" card listing each reporting source with its first-seen time — the visible face of cross-source dedupe.

#### `app/(app)/tracker/page.tsx` — Kanban board
Loads all applications + open reminders; builds `TrackerCard[]` where `dueSoon` is the application's undone reminders due within 7 days (soonest first). Renders `<AddApplicationForm/>` (see `components/add-application-form.tsx` — extracted from an inline `<details>` form during the "UI cohesion" pass) and `<TrackerBoard/>`. Subtitle states the product rule: "Every application, its stage, and its automation mode — always explicit."

#### `app/(app)/tracker/[id]/page.tsx` — application detail
The mode-selection and assist workspace page.

- **Computes and persists the recommendation once**: if `modeRecommendation` is absent, calls `recommendMode(id)` and stores the result on the row (so signals/reasons are stable per application and `mode_decisions` can reference them).
- Loads reminders, all resumes (id+name), the linked posting (for its description), and the profile.
- Left column: posting description card; then `AssistPanel` **only when `mode === "assist"`** — manual mode gets "you're handling this one yourself", no-mode gets a nudge to choose Assist; then **`PrepPanel`** (`applicationId`, `initialPrep: app.prep`) — rendered **unconditionally, in every mode**, since interview/skill prep doesn't touch the application's drafts or submission path.
- Right column: `ApplicationEditor` with everything it needs, including the `autoApply` bundle (`profile.data`, `applications.drafts`, resume display name) that powers the pre-submit preview.

#### `app/(app)/analytics/page.tsx` — read-only dashboard (Phase 3)
Server component, six `Promise.all`-parallelized query groups feeding six cards, all built from data the app already had (`applications`, `postings`, `sources`, `mode_decisions`, `notification_log`) — "no new data collected here" per the page subtitle.

1. **Top stat row** (`StatCard`): total applications (all-time, every stage), "Applied+" (count past Saved/In Progress), active postings tracked, response rate (`interviewing+offer+rejected` ÷ `applied+assessment+interviewing+offer+rejected`, `—` when the denominator is 0).
2. **Pipeline funnel** — `ProportionBars` (from `components/charts.tsx`, the dataviz-method chart primitives) one row per stage (count ÷ total applications), colored via a locally-defined `STAGE_VAR` map.
3. **Automation mode split** — a single 100%-composition `SegmentedBar` (charts.tsx) over manual/assist/auto/unset; `unset` (null mode) carries a **dashed** ring dot in the legend to match `ModeBadge`'s "not chosen" language.
4. **Recommendation vs. your choice** — overall agreement % from `mode_decisions` (`recommended = chosen`), plus a per-ATS breakdown (`signals->>'ats'` grouped via a raw `sql` filter expression: `count(*) filter (where recommended = chosen)`).
5. **Notification activity** — `notification_log` grouped by `kind` (instant/digest/confirmation/blocker) and by `channel` (push/email/sms), side by side.
6. **Sources & postings** — postings grouped by `status` (active/expired/hidden), plus source health (enabled count, most recent `lastPolledAt` via `timeAgo`, and any `lastError`s listed by name).

Every section has its own `EmptyState` for the zero-data case, so a fresh install renders a coherent (if sparse) page rather than blank cards. **Deliberate code duplication, explained in a comment**: `STAGE_LIST`/`STAGE_VAR` are redefined locally rather than imported from `tracker-board.tsx`, because that file is `"use client"` — importing a plain data const from a client module into this server component would turn it into a client reference and crash at render (`STAGE_LIST.map` throwing). Only the `Stage` *type* is imported (type-only imports are erased, so that's safe).

#### `app/(app)/chat/page.tsx` — the Assistant
Server component: loads `settings.assistant_chat_history` and renders `PageHeader` + `<AssistantChat initialHistory=.../>` (`components/assistant-chat.tsx`). All the chat logic is client-side + the `askAssistant`/`clearAssistantChat` server actions over `lib/assistant.ts` (§3.4.2, and the Assistant flow in §5).

#### `app/(app)/intake/page.tsx` — Screenshot Intake
Thin server wrapper: `PageHeader` ("Screenshot a story or post announcing a new internship, and Claude will pull out the details for you to confirm.") + `<ScreenshotIntake/>`. All logic lives client-side — see `components/screenshot-intake.tsx` and §5(g).

#### `app/(app)/resume-studio/page.tsx` — Resume Studio list
Server component: lists all `latex_resumes` rows (id/name/lastCompiledAt/updatedAt, newest-updated first) as cards in a `StaggerGrid`, each showing "Last compiled {time ago}" or "Not compiled yet" and an "Open" link into the editor. `<NewResumeButton/>` in the header actions creates a row (seeded from `JAKES_RESUME_TEMPLATE`) and navigates straight into it. Empty state points at the built-in template and the chat assistant.

#### `app/(app)/resume-studio/[id]/page.tsx` — Resume Studio editor
Loads one `latex_resumes` row (404 via `notFound()` if missing or the id doesn't parse) and hands it to `<LatexStudio data={...}>` — the entire editor/compile/chat/preview UI lives in that client component (below).

#### `app/(app)/documents/page.tsx`
Flat list of the `documents` table (left-joined to applications, newest first, limit 200): kind label, company/role with logo, destination label (In-app/Local/Google Drive), the storage key (which *is* the folder path), created-ago, a link to the owning application, and a `/api/documents/{id}/download` link.

#### `app/(app)/archive/page.tsx`
Lists non-active postings (limit 300, newest first) with the reason derived from status: `expired` → "Deadline passed", `hidden` → "Hidden (already applied)". This is where auto-archived and repost-hidden postings surface.

#### `app/(app)/profile/page.tsx`
Three cards: `ResumeManager` (uploads list + default star + delete + upload form; shows "parsing activates once the Claude API key is configured" for unparsed rows), `ProfileForm` (the auto-fill field map), `WritingSamples` (two-column sample sets).

#### `app/(app)/settings/page.tsx`
Five cards: `SourcesManager` (with preset buttons shown only until any github_repo source exists), `NotificationSettings` (receives `VAPID_PUBLIC_KEY` from server env — null disables the push-enable button with an explanatory hint — plus, as of the notification overhaul, `watchlistCompanies` and `digestHours` from `settings`), an **"Automation" card** wrapping `AutoApplySettings` (receives `prefs?.autoApplyEnabled ?? false`; subtitle: "Controls whether the browser extension may submit applications for you."), `StorageSettings` (receives `driveConfigured()`).

### 3.4.6 Components (`src/components/`)

#### `ui.tsx`
The tiny shared kit: `PageHeader` (title/subtitle/actions wrapped in `FadeIn`), `Card` (`rounded-2xl bg-surface p-5 shadow-card`), `EmptyState` (icon/title/hint card), and **`ModeBadge`** — the visual enforcement of "mode must be unambiguous everywhere": null → dashed-border "Mode not chosen" pill; manual → neutral gray; assist → accent blue on `accent-soft`; auto → purple (`--purple` at 14% mix, text `grape`).

#### `motion.tsx`
"Cheap entrance animations. Fades + a few px of travel only — no layout animations, no exit transitions." `FadeIn` (opacity 0→1, y 6→0, 0.25s ease-out, optional delay) and `StaggerGrid` (children stagger at 0.03s, 0.22s each). Client components wrapping server-rendered content; used by PageHeader, dashboard grids, and both posting grids.

#### `company-logo.tsx`
Client component; exports `domainFromUrl` + `CompanyLogo`. Builds an **ordered list of domain candidates** and tries each in turn, advancing on a favicon 404: (1) the URL host when it's a real company domain (not on `JOB_BOARD_HOSTS`); (2) the company slug embedded in the ATS URL (`greenhouse.io/<slug>`, `<tenant>.myworkdayjobs.com`, `ashbyhq.com/<slug>`, lever/smartrecruiters first path segment) → `<slug>.com`; (3) a domain guessed from the company name (`domainFromCompanyName`, strips corporate-suffix noise). Favicons come from **DuckDuckGo** (`icons.duckduckgo.com/ip3/<domain>.ico`) which returns a real 404 for unknown domains — so a wrong guess cleanly advances to the next candidate or the **letter avatar**, never a stray globe (the old Google-favicon 200-globe problem). Three sizes (sm 32 / md 40 / lg 48). Tradeoff: a generically-named company can occasionally resolve a *wrong* real logo (§9).

#### `filter-bar.tsx`
Stateless-URL filter **dropdowns** (converted from the old pill rows). Each single-select group (Season/Year/Role/Work mode/Sponsorship/Posted/Sort, +Level when new-grad inclusion is on) renders as a compact dropdown showing its label when empty and the selected value with an accent fill when set; "Saved" stays a toggle. `buildLink` reconstructs the querystring from the whitelist `FILTER_KEYS` **plus `PRESERVE_KEYS` (`view`, `limit`)** so a filter change keeps list/card view and pagination; menus are `router.push`-driven (SSR filtering unchanged), open/close animated via `AnimatePresence`, and close on outside-click/Escape. "Clear all" wipes filters but preserves view state.

#### `posting-card.tsx`
The internships-grid card. Whole card is a `role="link"` div navigating to the detail page (keyboard accessible); the bookmark button and external Apply link `stopPropagation`. Shows logo, company, 2-line-clamped title, the **role-type badge with per-role colors** (`ROLE_COLORS`: swe = accent blue, ml = purple/grape, data = success green, quant = warning orange, other = neutral), neutral chips for first term + New Grad + work mode, first location (+N), found-ago + "· N sources" when deduped from multiple, a warning-tinted deadline pill, and an Apply link revealed on hover — **wrapped in `{posting.url && (...)}`** since Screenshot Intake (§5g) can create postings with an empty `url` ("link in bio" not legible in the screenshot); the same guard was added to `posting-list.tsx`'s row (the list-view equivalent) and the detail page's Apply button.

#### `tracker-board.tsx`
Exports `STAGES` (the canonical ordered stage list + labels — also imported by ApplicationEditor for its stage dropdown), `Stage` type, `TrackerCard`, `TrackerBoard`. Kanban of 7 fixed columns (260px, horizontal scroll); column headers carry a **stage-colored dot** (`STAGE_DOT`: saved gray, in_progress accent, applied success, assessment warning, interviewing grape, offer success, rejected danger) and a count pill. Cards show logo, company, role, `ModeBadge`, applied/created time, a warning pill for the nearest due-soon reminder, and **chevron buttons that move the card one stage left/right** (`updateStage` in a transition). Still no drag-and-drop, but moves are now **animated**: cards are framer `motion.div`s with `layout` + a shared `layoutId` inside a `LayoutGroup`, and each column's list is an `AnimatePresence mode="popLayout"` — so moving a card glides it to the new column and the rest reflow; the columns also do a staggered entrance sweep on load (`whileHover={{y:-2}}` for the hover-lift, since a CSS transform would fight the layout transform).

#### `application-editor.tsx`
The right-column control panel on the application page. Cards:
- **Details** — company/role/location inputs saving on blur ("auto-detected fields are heuristic, so keep them editable").
- **Stage** — dropdown over `STAGES`, with the caption "Moving to 'Applied' sends your submission-confirmation receipt and hides reposts of this role."
- **Mode** — "always explicit, never defaulted" (its literal comment). Shows the recommendation card (reasons verbatim from `recommendMode`, plus "Just a suggestion — your choice always wins."), then three mode buttons. Click behavior encodes the opt-in rule: manual/assist toggle directly via `setApplicationMode` (clicking the active mode sets it back to **null** — you can un-choose a mode); **the Auto button never sets mode** — it only opens/closes the `AutoApplyOptin` preview ("Auto never sets the mode directly — it opens the pre-submit review, and approval happens there"). When mode is auto, shows "Approved <date> · **Revoke**" — Revoke calls `setApplicationMode(id, null)`, which clears the approval timestamp.
- **Resume version** — per-application resume dropdown (or a pointer to Profile when none uploaded).
- **Reminders & OA deadlines** — checkbox list with strikethrough, delete buttons, and an add row (label + `datetime-local`).
- **Notes**, and a confirm-guarded **Delete application**.

#### `auto-apply-optin.tsx`
The pre-submit review for Full Auto-Apply — the UI half of non-negotiable rule #2. Receives `AutoApplyData` (`profile`, `drafts`, `resumeName`).

- **Readiness gate**: requires at least one draft (cover letter or answers) *and* a selected resume; otherwise renders a warning card ("Auto-Apply needs your reviewed drafts and a resume version — generate and save them in Agentic Assist first") with only a Back button — you cannot approve an empty auto-apply.
- When ready, shows **exactly what will be submitted**: every non-empty profile field as a definition list, the resume name, the full cover letter (scrollable), every Q&A — under the heading "This is exactly what will be submitted for you — no final review click on the portal."
- The approve button stays disabled until the checkbox "**I understand this application will be submitted without a final review click**" is ticked; then calls `approveAutoApply(applicationId)` in a transition.

#### `assist-panel.tsx`
The Agentic Assist workspace (left column when mode = assist). State: `coverLetter` string, `qas: {prompt, answer, generating}[]`, `newPrompt`, `saved: SavedDoc[] | null`.

- **Generate/Regenerate** cover letter → `generateCoverLetter`, result lands in an always-editable textarea.
- **Short answers**: paste a portal question → "Draft" appends a QA with `generating: true` and fills the answer async (per-question streaming-ish UX); each answer is an editable textarea with a remove button.
- **Save documents** → `saveAssistDocuments` with only non-empty answers; renders each `SavedDoc` ("Saved to Google Drive / local download / in-app storage · <path>") with a Download link, and surfaces any `driveError` in warning color.
- Header copy states the rule: "You can edit everything before it's used anywhere — nothing is submitted by the app."
- Editing or removing a cover letter / answer after a save clears the stale `saved` result (`setSaved(null)`) so the UI never shows a "Saved" state that no longer matches the unsaved edit (a UI-cohesion fix).

#### `prep-panel.tsx`
Interview & skill-prep card (P2-M3), rendered on the application detail page in **every** mode — unlike `AssistPanel` it never touches drafts or the submission path, so there's no reason to gate it on mode. Receives `applicationId` + `initialPrep` (the cached `applications.prep`, possibly `null`).

- Empty state: short explanation + a **"Generate prep"** button → `generatePrep(applicationId)` (`app/actions/prep.ts`); on failure, toasts "Couldn't generate prep — try again" rather than throwing into the UI.
- Populated state, five optional sections (each only rendered if non-empty): **Focus areas** (topic + why, in `surface-secondary` chips), **Practice problems** (name linked to `leetcodeSearchUrl(name)`, pattern, and a difficulty pill colored via `DIFFICULTY_STYLES` easy=success/medium=warning/hard=danger — plus a header-level "NeetCode 150" link to `NEETCODE_PRACTICE_URL`), **Project ideas** (bullet list), **Resources** (name + kind pill chips), **Behavioral prompts** (bullet list).
- A **"Regenerate"** button at the bottom re-runs `generatePrep` and overwrites the cached `prep` — no versioning/history, always the latest generation.

#### `add-application-form.tsx`
The Tracker's "Add application by link" panel, extracted from an inline `<details>`/`<summary>` during a UI-cohesion pass. The doc comment explains why: the old inline version used **uncontrolled inputs inside a bare `<details>`** — on a successful submit the route revalidated but the DOM form itself persisted, so fields stayed filled and the panel stayed open with no success feedback. This component instead follows the `sources-manager.tsx`/`writing-samples.tsx` pattern: controlled `open` state, `formRef.current?.reset()` + `setOpen(false)` on success, a pending label, and a toast.

#### `submit-button.tsx`
A tiny drop-in `<button type="submit">` reading `useFormStatus()` for its own pending state (`{children, pendingLabel, className}`) — for the small server-action forms embedded directly in server-component pages (e.g. posting notes on the internship detail page) where converting the whole page to a client component just for one button's pending state isn't warranted. Must be rendered inside the `<form>` it submits (a `useFormStatus` requirement).

#### `notification-settings.tsx`
Client settings panel with optimistic local state; every change immediately persists via `updateSettings` (no save button).
- **Push on this device**: feature-detects service worker + PushManager; states: unsupported / denied / off / on. Enable → registers `/sw.js`, requests permission, `pushManager.subscribe({userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY})`, POSTs the subscription JSON to `/api/push/subscribe`. Without a VAPID key the button is absent and the hint says to add keys to the server env.
- **Channel toggles** (iOS-style switch buttons): push, email, and SMS — SMS carries the explicit opt-in warning note (rule #6).
- **Email digest** (new, notification overhaul) — two `HourSelect` dropdowns (12-hour labels, 0–23 internally) for `digestHours[0]`/`digestHours[1]` (default 8am/5pm), captioned "New postings are collected and emailed twice a day — not one email per posting"; and an **"Instant-alert companies"** comma-separated text input for `watchlistCompanies`, captioned "Email + push the moment these companies post — skipping the digest so you can apply early."
- **Quiet hours**: start/end hour dropdowns (12-hour labels) + free-text timezone input (IANA name, saved on blur). Caption updated to reflect the overhaul: "Push notifications pause during these hours (email always uses the twice-daily digest above)" — quiet hours no longer touch email at all.
- **Scope + rules**: include-new-grad toggle; role-type multi-select chips and work-mode chips ("None selected = all"); exclude-companies comma-separated text input — all mapping 1:1 onto `NotificationRules`.

#### `auto-apply-settings.tsx`
The master Auto-Apply kill switch UI (Settings → Automation card). A single iOS-style toggle (`initial: boolean` from `settings.autoApplyEnabled`) with optimistic local state and revert-on-failure; icon + copy flip with state (`ShieldCheck`/success green when off — "The extension will never submit an application on its own"; `ShieldAlert`/warning when on — "Applications you've individually opted in can be filled and submitted... Turn this off to stop all auto-submitting instantly"). Persists via `updateSettings({autoApplyEnabled})`. Purely a settings toggle — the actual enforcement is server-side in `api/assist/packet/route.ts` (§3.4.4), not in this component.

#### `gmail-settings.tsx` — P2-M2 connect/disconnect UI (Settings card)
Two states driven by `initial: {enabled, connectedEmail, lastSyncAt}` (from `settings.gmail*`): **disconnected** → a plain `<a href="/api/gmail/connect">` button (a real navigation, not a fetch — it needs to hit a 307-redirecting route handler, not a server action) labeled "Connect Gmail"; **connected** → "Connected as {email}" + `timeAgo(lastSyncAt)` (or "Not synced yet — checks every 15 minutes" before the first tick) + a "Disconnect" button calling the `disconnectGmail()` server action. On mount, reads the `?gmail=connected|error&detail=...` query params the callback route sets (`useSearchParams`), toasts the result, and `router.replace("/settings", {scroll:false})` to strip them from the URL so a page refresh doesn't re-toast. Privacy copy is inline in the card body, not just in docs: "Read-only — never sends, deletes, or modifies anything in Gmail. Only the extracted status is stored; email content is never saved."

#### `screenshot-intake.tsx`
The Screenshot Intake workspace (`/intake`), a single client component covering upload → extract → confirm → create → track. State machine, roughly:
1. **Drop/pick an image** (drag-and-drop zone or click-to-browse, PNG/JPG/WebP ≤10MB client-side-checked) → object-URL preview shown immediately.
2. **Extract**: `startExtract` transition calls `extractFromScreenshot(formData)`; while pending shows "Reading the screenshot…"; result populates an editable `FormFields` object (company/title/url/locations-as-comma-string/term/notes) and, if extraction was partial/failed, a warning banner with the server's `message`.
3. **Confirm the details** card — every field editable before anything is saved ("Nothing is saved until you confirm"); Confirm is disabled until company + title are both non-empty.
4. **Confirm & add posting** → `createPostingFromIntake`; success state shows "Posting added" or "Already known" (deduped) with a **View posting** link and a **Track it** button (→ `trackPosting`, same one-click track as the posting detail page) or "Add another screenshot" to reset.
The whole flow deliberately never persists the image itself — only the `FormFields` the user has reviewed.

#### `profile-manager.tsx`
Two exports. `ResumeManager` — list with Default badge, make-default star, delete, and the upload form (file ≤10MB `.pdf/.doc/.docx` + optional label). `ProfileForm` — the auto-fill field map, in two sections that mirror the extension's two rule tables exactly:
- `PROFILE_FIELDS` (12 keys): fullName, email, phone, location, linkedin, github, website, school, degree, gradDate, gpa, workAuth → matched by content.js's `RULES` for text inputs.
- `APPLICATION_ANSWER_FIELDS` (10 keys, added in Autofill v2): pronouns, requiresSponsorship (Yes/No select), authorizedToWork (select), currentlyEnrolled (select), willingToRelocate (select), gender, raceEthnicity, veteranStatus, disabilityStatus, howDidYouHear → matched by content.js's `ANSWER_RULES` for radio/checkbox/select groups. Caption: "Demographic fields are optional — leave blank to always answer those yourself" (an empty profile value disables the corresponding rule entirely, since rules require a truthy value).
Everything saves via `saveProfile` into the single `profile.data` jsonb.

#### `top-nav.tsx` (replaced the deleted `sidebar.tsx`)
The horizontal top navigation used at every breakpoint. A sticky `<header>` with a **brand row** (compass `LogoMark` + "Erevnitis" wordmark in the display font, on the left; `ThemeToggle` + an account/sign-out cluster on the right) over a **nav row** of all **11** links in order — Dashboard, Internships, Tracker, Analytics, **Assistant**, Intake, Documents, Resume, Profile, Archive, Settings (active = `accent-soft` pill; Dashboard active only on exact `/`). The nav row uses `flex-wrap justify-center` inside an `mx-auto` wrapper, so the links **stay centered at any width/zoom** — one centered row when they fit, wrapping to centered rows when they don't (no left-aligned scroll fallback, no clipping). "Screenshot Intake" and "Resume Studio" are shortened to "Intake"/"Resume" in the nav so the row fits and centers on normal laptop widths. The old fixed 240px sidebar (and its `md:ml-60` content offset) is gone; content is full-width `max-w-7xl`.

#### `assistant-chat.tsx`
The `/chat` client UI, styled like `latex-chat.tsx`: a fixed-height card (`100dvh-20rem`, `min-h-22rem`) with a scrolling message area (user bubbles in `accent-soft`, assistant answers via `RichText`), starter **suggestion chips**, a `LogoSpinner` "Checking your tracker…" typing indicator, a clear-chat button, and Enter-to-send. Calls `askAssistant`/`clearAssistantChat`; has try/catch so a failed call shows an error bubble.

#### `charts.tsx`
The analytics chart primitives, built to the dataviz method: **`ProportionBars`** (ordered magnitude rows — thin marks, 4px rounded data-ends on a recessive track, per-row `denom` for rates, grow-in on mount, native per-mark hover title, values in ink tokens) and **`SegmentedBar`** (a single 100%-composition bar with a legend + 2px surface gaps). Colors are the app's own stage/mode/status CSS-var tokens (a fixed categorical order), not a generated ramp.

#### `landing.tsx`
The animated marketing page rendered by `app/signin/page.tsx` for logged-out visitors (brand register via the Impeccable skill). Sticky nav, gradient display headline, a parallax-free product mock, `flex-wrap` scroll-revealed feature rows (staggered blur-rise), a secondary feature grid, and one committed ink CTA block. Every "Continue with Google" is a form bound to `signInWithGoogleAction`. Wrapped in `MotionConfig reducedMotion="user"`.

#### `posting-description.tsx`
Client card on the posting detail page: on first mount for a never-attempted posting (`initialDescription === null && hasUrl`) it calls `generatePostingDescription`; shows a loading state, then the `RichText`-rendered summary, or a graceful "couldn't extract — Try again" fallback. The `""`-failure sentinel means it never auto-retries.

#### `logo-mark.tsx`
The two-tone tilted compass `LogoMark` (rim + degree ticks + accent/purple needle, self-simplifying below 40px) and **`LogoSpinner`** — the same mark with a CSS-animated spinning needle (`.animate-compass-spin`), used as the Assistant's thinking indicator.

#### `sidebar.tsx`
**Deleted** — replaced by `top-nav.tsx` (above).

#### `sources-manager.tsx`
Sources list with kind label, last-polled time, and `lastError` surfaced in danger color with an alert icon (poller failures are user-visible); enabled switch; delete. Preset buttons (+SimplifyJobs, +vanshb03) shown only when `hasPresets` is false. The add form renders kind-specific fields from `KIND_FIELDS` (mirroring the server-side whitelist) with realistic placeholders (e.g. Workday host `nvidia.wd5.myworkdayjobs.com`). `github_repo`'s field list includes the **README column map** input — labeled "README column map (optional, non-standard tables only)", placeholder `company=1,role=2,location=3,link=5` — for repos whose table layout deviates from the community standard (see `sources/github.ts` §3.5).

#### `storage-settings.tsx`
Three radio-style option cards (inapp / local / gdrive) with descriptions; gdrive shows "(not connected yet)" when `driveConnected` is false — selecting it anyway is allowed (saves fall back with `driveError`, keeping the in-app copy). Persists immediately via `updateStorageDestination`.

#### `theme-toggle.tsx`
Toggles the `dark` class on `<html>` and writes `localStorage.theme`. Initial icon state read in an effect (null before hydration to avoid mismatch with the pre-paint script in the root layout).

#### `writing-samples.tsx`
Two `SampleSet` columns (cover letters / short answers — "a separate voice from cover letters"). Each sample is a `<details>` with title + char count, expandable full text, delete; add form (title + textarea).

#### `rich-text.tsx`
Dependency-free plain-text → React-element formatter (**no `dangerouslySetInnerHTML` anywhere**), used for posting descriptions and elsewhere prose needs light structure: splits on blank lines into paragraphs (`\n{2,}`), groups a block of consecutive bullet-ish lines (`-`, `•`, `*`) into a real `<ul>`, and linkifies bare `https?://` URLs into real `<a target="_blank">` elements via a split-on-regex pass (`linkify`).

#### `latex-editor.tsx` — Resume Studio's CodeMirror wrapper
`forwardRef` client component exposing an imperative `LatexEditorHandle` (`{setValue, getValue}` — `setValue` is how the chat's "Apply to editor" and the undo button replace the document content). CodeMirror 6 (`@codemirror/{state,view,commands,language,legacy-modes}`) configured with `StreamLanguage.define(stex)` for LaTeX syntax highlighting, `defaultKeymap` + `historyKeymap` + `history()` for standard editing/undo, and an `EditorView.theme` mapped onto the app's CSS custom properties (`--surface-secondary`, `--text`, `--text-tertiary`, an accent-tinted active-line highlight) so the editor reads as part of the same design system rather than a bolted-on widget. `onSaveShortcut`/`onBlur` callbacks let the parent (`latex-studio.tsx`) flush an explicit save.

#### `latex-templates.ts` note
See `src/lib/latex-templates.ts` in §3.4.2 — the built-in `JAKES_RESUME_TEMPLATE` lives there, not in a component.

#### `new-resume-button.tsx`
One-button flow: `createLatexResume()` (server action) → `router.push('/resume-studio/{id}')`. Used as the Resume Studio list page's header action.

#### `latex-chat.tsx` — Resume Studio's chat assistant UI
Renders the conversation (`ChatMessage[]`) and drives `chatLatex`. `splitLatex(content)` extracts a `<latex>...</latex>` block out of an assistant reply via regex, rendering the surrounding prose normally and the LaTeX itself in a bordered code block with three actions: **Copy** (clipboard, with a 1.5s "Copied" confirmation), **Preview** (`onPreviewLatex` — compiles the proposed source into the throwaway preview PDF without touching the editor or saved resume, see below), and **Apply to editor** (`onApplyLatex` — replaces the editor content immediately, with one-level undo). Empty-state hint suggests concrete asks ("tightening your Education section", "make my name John Doe"). Enter sends (Shift+Enter for a newline); a "Thinking…" bubble shows while the transition is pending.

#### `latex-studio.tsx` — Resume Studio's editor page (the orchestrator)
The full workspace: a top bar (name input, Undo-apply, Compile, Save-as-version, Delete) over a two-pane layout — `LatexEditor` on the left, a Preview/Chat tab switcher on the right.

- **Autosave**: 1.5s debounce on every keystroke (`AUTOSAVE_MS`) via `updateLatexResume`; a manual save also flushes on the editor's blur or its save-shortcut callback, both showing a "Saved" toast; a small "Unsaved" label appears whenever `source !== savedSource`.
- **Compile**: flushes any pending autosave first (so it always compiles the latest text), `POST /api/latex/compile {id}`, and on success sets `pdfUrl` + switches to the Preview tab; the compile log renders in a `<details>` that auto-opens only on a *fresh* failure in this session (`compileOk === false`) — a log loaded from the DB on page load is ambiguous (could be from the last success or a later failure) so it starts collapsed.
- **Apply from chat** (`applyLatex`): snapshots the pre-apply source into `undoSlot` (one-level undo, a toast offers "Undo apply"), replaces the editor content, and persists immediately.
- **Preview-before-apply** (the newest Resume Studio feature, §5i): `previewProposed(latex)` remembers the currently-shown `pdfUrl` in a ref, switches to the Preview tab, and `POST /api/latex/compile {id, source: latex}` (the `source` param routes to `compileLatexPreview` server-side, §3.4.2/§3.4.4) — **without** touching the editor's `source` state or calling `updateLatexResume`. While a proposal is open, a banner sits above the preview iframe ("Preview of a proposed change — not applied yet" / "Compiling preview…" / "Proposed change — didn't compile (see log)") with **Apply change** (→ `applyProposed`: applies the text to the editor via the normal `applyLatex` path, then triggers a *real* compile so the persisted PDF — the one "Save as version" reads — reflects it too) and **Dismiss** (→ `dismissProposed`: restores the previously-shown `pdfUrl` from the ref, clears the compile log/status, discards the proposal — the editor and saved resume were never touched).
- **Save as resume version** → `saveLatexResumeAsVersion`; disabled until there's a `compiledKey` or a live `pdfUrl`.
- **Delete** → confirm dialog → `deleteLatexResume` (which now also cleans up the throwaway preview key) → redirect to the list.

### 3.4.7 `src/app/globals.css` and `public/sw.js`
See §7 (design system) for globals.css.

**`public/sw.js`** — the web-push service worker (plain JS, not built):
- `push` event → `showNotification(payload.title, {body, icon/badge: /icons/icon-192.png, tag: payload.tag || payload.url, data: {url}, actions: [{action: "open", title: "View"}]})` — tagging by URL collapses duplicate notifications for the same posting.
- `notificationclick` → closes the notification, then focuses+navigates an existing app window if one is open under the SW scope, else `clients.openWindow(url)`. This is what makes a push tap land directly on `/internships/{id}` or `/tracker/{id}`.

---

## 3.5 apps/worker

### `apps/worker/package.json` / `tsconfig.json`
ESM. `dev`: `node --env-file=../../.env --import tsx --watch src/index.ts` (reads the **root** `.env`); `start`: `tsx src/index.ts` (env from the platform); `build`: `tsc --noEmit` — **the worker is never compiled; production runs TypeScript directly through tsx.** Deps: `graphile-worker ^0.16.6`, `fast-xml-parser`, `web-push`, `tsx`.

### `src/index.ts` — entry point
Starts graphile-worker (`run()`) against `DATABASE_URL`, concurrency 4, with the task registry and crontab:

```
taskList: poll_sources, auto_archive, send_digest, send_confirmation, send_blocker_notice, send_reminders

crontab:
* * * * *    poll_sources     ← discovery is latency-critical; conditional requests make most ticks ~free
*/5 * * * *  send_digest      ← checks the quiet-hours window every 5 min
*/5 * * * *  send_reminders
13 * * * *   auto_archive     ← minute 13 to avoid top-of-hour clashes
```

`send_confirmation` and `send_blocker_notice` are **registered but not cron'd** — they only run when the web app enqueues them via SQL `graphile_worker.add_job` (call sites: `lib/applied-side-effects.ts`, `actions/settings.ts`, `api/assist/report/route.ts`). Fatal startup error → log + `process.exit(1)` (Railway restarts the service).

### `src/ingest.ts` — the ingest pipeline
`ingestPostings(sourceId, items, {skipNotify?}) → {inserted, duplicates, irrelevant, suppressed}`. Per item, in order:

1. **Relevance**: `isRelevantRole(title)` or `irrelevant++` and skip (drops non-CS roles from broad boards).
2. **Dedupe**: compute `dedupeHash`; if a row exists, append `{sourceId, url, seenAt}` to its `seenIn` (only if this source isn't already recorded), `duplicates++` — **re-seeing a posting never re-notifies**, and the "Seen in" card on the posting page comes from this.
3. **Suppression**: before the loop, a Set of `normalizeCompany|normalizeTitle` keys is built from *all* applications; a new posting matching an applied role is inserted directly as `status: "hidden"` (`suppressed++`, no notification) — reposts of roles you've applied to are dead on arrival.
4. **Insert** with classifier fallbacks: `locationMode ?? classifyLocationMode(...)`, `roleType ?? classifyRole(...)`, `jobLevel ?? classifyLevel(...) ?? "internship"`; `terms` via `extractTerms`; `sponsorship` only accepted from `raw.sponsorship` when it's exactly `sponsors`/`citizens_only` (else `unknown`); `onConflictDoNothing` on the dedupe hash (race-safe against concurrent polls) — a conflict counts as duplicate.
5. On successful insert of a non-suppressed posting: `inserted++` and `onNewPosting(id)` **unless `skipNotify`** (first poll of a new source backfills silently — "otherwise adding SimplifyJobs would fire hundreds of 'new posting' alerts at once").

### `src/notify.ts` — notification core
Rewritten for the twice-daily-digest + company-watchlist overhaul (previously: quiet-hours-gated instant-or-digest for every channel uniformly; now: push/SMS stay instant-with-quiet-hours, email is batched into fixed digest slots except for watchlisted companies).

- `getSettings()` — the settings row or hard defaults (`DEFAULTS`: America/New_York, 23→7, push+email on / sms off, includeNewGrad false, **`watchlistCompanies: []`, `digestHours: [8, 17]`, `lastDigestSentAt: null`**).
- `toEmailPosting(p)` — maps a `postings` row (or the subset of columns needed) to the `EmailPosting` shape `email-template.ts` renders (id/company/title/url/locations/roleType/jobLevel/locationMode).
- **`deliver(msg, opts?)`** — fans out to each **enabled** channel and inserts one `notification_log` row per successful channel (failed sends still leave no log record — §9). Two new capabilities added for the overhaul:
  - `opts.only?: Channel[]` — restrict this call to a subset of channels (still additionally gated by the user's own channel prefs) — e.g. `onNewPosting`'s instant path passes `{only: ["push", "sms"]}` since email for a non-watchlisted posting goes to the digest queue instead.
  - `opts.emailHtml?: string` — supply a pre-rendered Simplify-style HTML email (from `email-template.ts`) instead of the old plain-text-in-a-`<p>` fallback; when absent, `deliver` still falls back to the original minimal HTML (`<p>{body}</p><p><a href="{url}">Open in Internships</a></p>`).
- **`onNewPosting(postingId)`** — the new-posting entry point, now channel-differentiated:
  1. Bail if the posting isn't active, or `passesNotificationRules` (rules + new-grad setting) fails.
  2. **Watchlisted company** (`isWatchedCompany`, `@tracker/shared`) → renders a rich single-posting email (`renderPostingEmail`) and `deliver`s it on **every** enabled channel **instantly, bypassing both the digest queue and quiet hours entirely** — "apply early" is the whole point of a watchlist entry.
  3. **Everyone else**: if the email channel is enabled, the posting is queued into `digest_queue` (unconditionally — no longer only during quiet hours; see `send-digest.ts` below for the new flush trigger). Push and SMS, independently, still fire **instantly** via `deliver(msg, {only: ["push", "sms"]})` — but only if `inQuietHours` is false; during quiet hours those are simply skipped for this posting (no digest_queue catch-up for push/SMS — that queue is email-only now).
- `onSubmissionConfirmed(applicationId)` — unchanged: "Application submitted ✓ · {company} — {roleTitle}" (kind `confirmation`) linking `/tracker`.

### `src/email-template.ts` — Simplify-style HTML email rendering
Table-based HTML with inline styles only (the one layout approach that survives most email clients), matching the visual language of the well-known Simplify Jobs digest emails. No dependencies. Exports `EmailPosting` (id/company/title/url/locations/roleType/jobLevel/locationMode), `renderDigestEmail(postings, appUrl)`, `renderPostingEmail(posting, appUrl)`.

- **Logo strategy mirrors `company-logo.tsx`**: `logoDomain(url)` derives the employer's domain from the posting URL unless the host is a known job-board (`JOB_BOARD_HOSTS` — greenhouse/lever/ashby/workday/icims/smartrecruiters/workable/bamboohr/jobvite/taleo/successfactors/linkedin/indeed/jobright.ai/google), in which case it falls back to a colored letter tile. Tile color is a stable hash of the company name over a 7-color palette (`TILE_COLORS`) so the same employer always gets the same tile color across emails. With a domain, `logoCell` embeds `https://www.google.com/s2/favicons?domain=<d>&sz=64`.
- `esc(s)` — minimal HTML-entity escaping (`&<>"`) applied to every piece of user/source-derived text before interpolation — this hand-rolled template has no JSX/React escaping safety net, so this function is what prevents a posting title containing `<`/`&` from breaking the email markup.
- `card(posting, appUrl)` — one posting's row: logo · company + meta line (role-type label, location mode, first location) · Internship/New-Grad badge, then the bold role title below — the whole card links to `{appUrl}/internships/{id}`.
- **`renderDigestEmail(postings, appUrl)`** — "💫 N new job(s) for you", up to 25 cards with a "…and N more — see all in the app" tail, one "Open Internships" CTA button. Subject: `"💫 N new internship(s)"`.
- **`renderPostingEmail(posting, appUrl)`** — "⚡ {company} just posted", a single card, one "View & apply" CTA. Subject: `"⚡ {company} — new internship posted"`. This is what a watchlisted company's instant alert renders.

### `src/channels/push.ts`
Web Push via the `web-push` lib. Lazy one-time VAPID configuration (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`, subject `mailto:NOTIFY_EMAIL_TO`); unconfigured → logs `[push] (unconfigured) would send: …` and returns false (all three channels share this dry-run-when-unconfigured pattern, which made local testing possible before any keys existed). Sends the JSON payload to **every** `push_subscriptions` row; on 404/410 (expired/revoked) **deletes that subscription row** (self-cleaning); other errors log and continue. Returns true if ≥1 delivery succeeded.

### `src/channels/email.ts`
Resend REST API via plain `fetch` ("keeps the dependency footprint down" — no SDK). Requires `RESEND_API_KEY` + `NOTIFY_EMAIL_TO`; sender `RESEND_FROM ?? "Internships <onboarding@resend.dev>"`. Non-OK → log + false. No retries.

### `src/channels/sms.ts`
Twilio REST via `fetch`: Basic auth (base64 `sid:token`), form-encoded POST to `/2010-04-01/Accounts/{sid}/Messages.json`. Requires all of `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `NOTIFY_SMS_TO`.

### `src/sources/http.ts`
`conditionalFetch(url, prevCache, init?)` — the polling economics. Sets user-agent `internship-tracker (personal job-search tool)`; sends `If-None-Match`/`If-Modified-Since` from the source's stored `httpCache {etag, lastModified}`; **304 → `{status: 304, notModified: true}`** (near-zero cost — "this is what lets us poll every minute without hammering anyone"); otherwise captures fresh cache headers, throws on non-OK, returns `{status, notModified: false, body, cache}`.

### `src/sources/github.ts`
Config `{repo, branch? = "dev", listingsPath?, columns?}`; fetches from `raw.githubusercontent.com/{repo}/{branch}/…`. Two parse modes:
- **`listingsPath` set** (the SimplifyJobs/vanshb03 path — `.github/scripts/listings.json`): parse the JSON array; keep rows with `active !== false && is_visible !== false` and company+title; url from `url || application_link` (rows without either are dropped); `postedAt` from unix `date_posted`; `terms` passthrough; `raw` carries `{sponsorship: mapSponsorship(...), listing: <full row>}` where `mapSponsorship`: `/offers sponsorship/i` → `sponsors`, `/citizenship|does not offer/i` → `citizens_only`, else `unknown` — this is the **only** source of sponsorship data in the system.
- **README fallback** for repos without a listings file: parse the markdown table, defaulting to the community-standard column order (`| Company | Role | Location | Link | Age |`) but **overridable per-source via `config.columns`** (see below): skips separator/header rows; strips bold/links/HTML from cells; **"↳" (or empty) company cells inherit the company from the row above**; link extracted from either an HTML anchor or a markdown link (`LINK_RE`); rows containing 🔒 (closed) skipped; locations split on `<br>` or commas-not-inside-parentheses.

**`parseColumnMap(spec)` — the per-source README column-map parser.** Added to onboard repos whose README table doesn't follow the SimplifyJobs-style layout (e.g. speedyapply puts the link in a "Posting" column at index 5; jobright-ai-style repos embed the apply link *inside* the role-title cell itself). `config.columns` is a free-text string like `"company=1,role=2,location=3,link=5"` — a comma-separated list of `key=1-based-cell-index` pairs, 1-based counting from the leading `|` of a table row. Any key omitted or malformed falls back to `DEFAULT_COLUMNS = {company: 1, role: 2, location: 3, link: 4}`. A field **can repeat an index** — e.g. `link=2` when the role cell itself carries the markdown apply link, which is exactly the jobright-ai case; `parseReadmeTable` strips markdown-link syntax from the role cell the same way it does the company cell, so the visible title never leaks link syntax even when `role` and `link` point at the same cell. `columns` has no effect on `listingsPath` repos (JSON has no column-order ambiguity). Exported (along with `parseReadmeTable`) for reuse/testing.

Note: `GITHUB_TOKEN` from `.env.example` is **not used** by this poller — raw.githubusercontent.com needs no auth (the var was reserved for API-based polling that never became necessary).

### `src/sources/ats.ts`
Four company-board pollers, all filtered through `levelFilter` (`classifyLevel(...) !== null` — full boards list every role; only intern/new-grad-classifiable ones are kept):
- **Greenhouse** `{boardToken}` → `boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`; company = boardToken; description = `decodeHtml(content)` capped at 8000 chars; postedAt = `updated_at`.
- **Lever** `{site}` → `api.lever.co/v0/postings/{site}?mode=json`; `text`→title, `hostedUrl`→url, `categories.allLocations` (fallback single `location`), `descriptionPlain`, `createdAt` epoch ms → ISO.
- **SmartRecruiters** `{company}` → `api.smartrecruiters.com/v1/companies/{company}/postings?limit=100`; location from city/region/country or `["Remote"]` when `location.remote`; URL constructed as `jobs.smartrecruiters.com/{company}/{id}`; company prefers the job's own `company.name`.
- **Workday** `{host, tenant, site, searchText?}` → **POST** `https://{host}/wday/cxs/{tenant}/{site}/jobs` with body `{appliedFacets: {}, limit: 20, offset: 0, searchText: searchText ?? "intern"}`. Unique among the pollers: **no conditional-request support** (POST endpoint — pays a full fetch every minute) and **server-side pre-filtering** via searchText. Result URL is `https://{host}/en-US/{site}{externalPath}`; always returns `{status: 200, notModified: false}`.
- `decodeHtml` — tag-strip + common entity unescape + whitespace collapse for Greenhouse's HTML descriptions.

### `src/sources/rss.ts`
Generic RSS/Atom via `fast-xml-parser` (`ignoreAttributes: false`), handling both `rss.channel.item[]` and Atom `feed.entry[]` (single-item objects normalized with `asArray`). Link: plain string or Atom `{"@_href"}`. Title split on `/^([^:\-–|]{2,40})[:\-–|]\s+(.+)$/` → company/title when it looks like "Company: Role"; else company = `defaultCompany ?? "Unknown"`. Description from `description ?? summary` (8000 cap); postedAt from `pubDate ?? published ?? updated`. Locations always `[]`. **Serves both `rss` and `instagram_mirror` source kinds** — the Instagram path is a ToS-compliant RSS-bridge feed URL, not scraping.

### `src/tasks/poll-sources.ts` — job `poll_sources` (cron: every minute)
For each enabled source: dispatch by kind to the right poller (`pollOne` switch); `isFirstPoll = lastPolledAt === null` → `ingestPostings(..., {skipNotify: true})` (silent backfill). On success: update `lastPolledAt`, `httpCache = result.cache ?? old` (**preserving the cache on 304s**), clear `lastError`. On error: store `lastError` message (surfaced in the Settings UI), keep the old cache for the next attempt. Per-source try/catch — one broken source never blocks the others. Logs per-source ingest stats when something changed.

### `src/tasks/send-digest.ts` — job `send_digest` (cron: every 5 min)
**Rewritten for the twice-daily digest.** No longer tied to quiet hours at all — it flushes at fixed clock-hour slots (`settings.digest_hours`, default `[8, 17]`, in `settings.timezone`) regardless of whether quiet hours are active.

1. `digestSlotDue(now, timezone, digestHours, lastDigestSentAt)` (`@tracker/shared`, §3.2) — return immediately (no-op) unless the current hour is a configured slot **and** this exact slot hasn't already fired.
2. **Stamp `settings.last_digest_sent_at = now()` immediately**, before doing any sending — the code comment: "so a slow send can't double-fire on the next tick." This is a deliberate at-most-once-per-slot guard, traded against the (accepted) risk that a mid-send crash could skip a slot's email entirely rather than retry it.
3. Load `digest_queue` rows with `sentAt IS NULL`; if the queue is empty, log and return (an empty slot sends nothing, silently).
4. Fetch the queued postings and keep only still-`active` ones (postings that expired or were hidden since queuing silently drop out — no email mentions them).
5. If any remain: render `renderDigestEmail` (`email-template.ts`) and `deliver()` it **email-only** (`{only: ["email"]}`) — the code comment notes push/SMS already fired instantly when each posting first arrived (§ notify.ts `onNewPosting`), so the digest email is genuinely the *only* thing this task sends; it never re-delivers push/SMS.
6. **Mark every queued row sent** regardless of whether it made the cut (including postings that expired/hid before the slot fired) — no retry loop for stale entries, matching the original digest's behavior.

Net behavior: at most two digest emails per day (or however many hours are configured), collecting everything queued since the last slot — a sharp departure from the original "one digest after the quiet-hours window ends" model, decoupling the email cadence from quiet hours entirely.

### `src/tasks/send-reminders.ts` — job `send_reminders` (cron: every 5 min)
Joins reminders × applications where `done = false AND notifiedAt IS NULL AND dueAt < now()`; delivers each as kind `instant` ("Reminder: {label}" / "{company} — {roleTitle}") linking `/tracker/{applicationId}`; stamps `notifiedAt` (exactly-once per reminder).

### `src/tasks/auto-archive.ts` — job `auto_archive` (cron: hourly at :13)
`UPDATE postings SET status='expired' WHERE status='active' AND deadline < now()`. Postings without a stated deadline never auto-expire (most sources don't provide deadlines). Expired postings appear in `/archive`.

### `src/tasks/send-confirmation.ts` — job `send_confirmation` (enqueue-only)
Payload `{applicationId}` → `onSubmissionConfirmed`. Enqueued from the web app (see §4).

### `src/tasks/send-blocker-notice.ts` — job `send_blocker_notice` (enqueue-only)
Payload `{applicationId, detail?}` → `deliver` kind `blocker`: "Auto-apply blocked — needs you" / "{company} — {roleTitle}: {detail ?? 'CAPTCHA or bot-check'}. Finish this one manually." linking `/tracker/{applicationId}`. Enqueued by `/api/assist/report` at the third blocked report.

### `src/gmail-client.ts` — P2-M2 Gmail REST client + classifier
Plain fetch throughout, matching the worker's no-SDK convention (`channels/*.ts`). Deliberately narrow surface:

- **`listRecentMessageIds(accessToken, afterEpochSeconds)`** — `GET .../messages?q=after:{epoch}&maxResults=50`; returns just the ids, newest-first, capped at one page (50) per sync tick.
- **`getMessageMeta(accessToken, id)`** — `GET .../messages/{id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`. **Never `format=full`** — the full email body never leaves Google's servers into this process. Returns `{id, from, subject, snippet}`, where `snippet` is Gmail's own short (~200 char) auto-generated preview, not anything this app constructs.
- **`classifyStatusSignal({company, roleTitle, from, subject, snippet})`** — one Anthropic REST call (`claude-haiku-4-5-20251001`, `x-api-key` header, no SDK) per *candidate* message (i.e. only messages that already matched a tracked company — see the task below, not every inbox message). System prompt enumerates the six possible signals (`interview_invite`/`oa_invite`/`offer`/`rejection`/`confirmation`/`none`) with a description of each, and explicitly instructs: only reply `"high"` confidence when the email is clearly and specifically about *this* company/role, not a newsletter or a coincidental keyword match; default to `"low"`/`"none"` when unsure. No `ANTHROPIC_API_KEY` → `{signal: "none", confidence: "low"}` (silent no-op, same graceful-degradation pattern as every other AI feature in this app). The `from`/`subject`/`snippet` passed in are never returned, logged, or persisted by this function — they exist only in this one call's request body and the caller's local variables.

### `src/tasks/sync-gmail-status.ts` — job `sync_gmail_status` (cron: every 15 min, P2-M2)
Opt-in — the very first line reads `settings` and returns immediately if `gmailEnabled` is false or no `gmailRefreshToken` is stored (confirmed in testing: this path completes in ~1.5ms, effectively free when the feature is off).

1. Compute the poll window: `since` = `gmailLastSyncAt` (minus a 5-minute overlap buffer, to tolerate clock skew — harmless because the matching below is idempotent) or, on the very first sync (`gmailLastSyncAt` is null), a 2-day lookback.
2. `refreshGoogleAccessToken` (`@tracker/shared`) using `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` (**must also be set on the worker service** — historically web-only, since only web's NextAuth sign-in needed them) + the stored refresh token. A failure here (revoked grant, expired token) is logged and the task returns cleanly — it does not crash the worker process (verified directly: an invalid token produces a caught, logged error and a normal `Completed task ... with success` from graphile-worker).
3. Load every tracked application **except** ones already `stage = 'rejected'` (nothing further to detect there) — this is the candidate match set.
4. `listRecentMessageIds` for the window, then for each id: `getMessageMeta`, then a cheap local pre-filter — does `normalizeCompany(application.company)` appear as a substring of the lowercased `from + subject`? Only messages that pass this filter (i.e. plausibly relate to a *specific* tracked application) get escalated to a Haiku `classifyStatusSignal` call; everything else costs nothing beyond the one metadata fetch.
5. A `signal !== "none"` **and** `confidence === "high"` result maps to a target stage: `confirmation→applied`, `oa_invite→assessment`, `interview_invite→interviewing`, `offer→offer`, `rejection→rejected`. The stage only moves if `target === "rejected"` (always allowed — an offer can still be rescinded) **or** the target ranks strictly further along the fixed 7-stage order than the application's current stage — so a false-positive "confirmation" detected on an application already at `interviewing` is silently ignored rather than downgrading it. (Verified with 7 hand-checked forward/no-op/rejection-override cases.)
6. On an accepted transition: updates `stage`, stamps `appliedAt` if unset and the target isn't `saved`/`in_progress`, and **prepends** (never overwrites) a short synthesized note like `[Gmail: interview invite detected, 7/12/2026]` to the application's existing `notes` — the from/subject/snippet text itself is discarded at this point and never written to the database. Then calls `deliver()` (kind `instant`) on the normal channels so the user is alerted the same way any other status change would notify them.
7. Always stamps `settings.gmailLastSyncAt = now()` at the end of the run (even if nothing matched), advancing the cursor for next time.

The stage-order array (`saved/in_progress/applied/assessment/interviewing/offer/rejected`) is duplicated locally in this file rather than imported — `schema.ts` only exports the Drizzle enum object, not a plain array, matching the same reasoning as `analytics/page.tsx`'s local `STAGE_LIST` (§3.4.5): a worker file can't import from `apps/web` anyway, and re-deriving seven literal strings is simpler than reshaping an export just for this.

---

## 3.6 apps/extension

Chrome MV3, no build step, no framework, no background service worker. Load-unpacked from `apps/extension/`.

### The three-actor security model

The extension splits responsibilities across three actors so the bearer token never touches page-context code:

1. **The popup (`popup.js`)** is the *only* holder of the `EXTENSION_TOKEN` (from `chrome.storage.sync`) and makes **all** network requests: the packet fetch, cover-letter bytes, resume bytes, `/api/assist/match-option`, and `/api/assist/report`. Comment in the code: "Fetch the cover letter PDF bytes here (content scripts can't send our auth header cross-origin)."
2. **The content script (`content.js`)** never fetches anything and never sees the token. It is injected *on demand* by the popup via `chrome.scripting.executeScript({files: ["content.js"]})` (there is **no** `content_scripts` entry in the manifest — the script literally cannot run without a user click on the popup), and receives its data (profile, drafts, base64 PDF bytes, filenames) exclusively as **serialized `executeScript` `args`**; results come back as the injected function's return value. There is no `chrome.runtime` messaging anywhere.
3. **The server** (`/api/assist/*` routes) enforces explicit CORS (Authorization header → preflight → `OPTIONS` handlers) and **constant-time token comparison** (`timingSafeEqual` in `lib/extension-auth.ts`), denying everything when the token is unconfigured.

### `manifest.json`
MV3, name "Internship Tracker Assist", **version 0.3.0**, description: "Fills application forms from your Internship Tracker profile and reviewed drafts. You always review and submit yourself." Permissions: `activeTab`, `scripting`, `storage`, `tabs` (added post-launch so the popup can read the active tab URL). `action.default_popup: popup.html`, `options_page: options.html`, 128px icon. **No `host_permissions`, no `content_scripts`, no background** — the minimal possible surface.

Version history (from git; each version = one manifest bump):

| Version | Commit | What it added |
|---|---|---|
| 0.1.0 | `a62fc1d` (Phase 1) | Initial extension: packet fetch, Assist-mode fill (text fields, drafted answers, cover-letter attach), green/orange highlights. `2b816b4` added the `tabs` permission without a version bump. |
| 0.1.1 | `b743852` | Popup URL-detection fallback (`lastFocusedWindow`, `pendingUrl`), visible version string in diagnostics, clearer error states. |
| 0.2.0 | `64f0f5d` | **Full Auto-Apply**: `__trackerAutoApply`, blocker detection, submit-button finder, bounded retry loop in the popup, `/api/assist/report` wiring. |
| 0.2.1 | `51507a3` | **Autofill v2**: resume attachment (with `x-filename`), choice-field answers (radio/checkbox/select via `ANSWER_RULES`), matching the new application-answers profile section. |
| 0.3.0 | `41c8a4b` | **Semantic option matching**: pending-choice registry, `__trackerResolvePending`, `__trackerFinishAutoApply` split, `/api/assist/match-option` Haiku fallback; word-boundary hardening for short answers. |

### `options.html` / `options.js`
Minimal settings page: App URL (trailing slash stripped on save) + token (password input), stored in **`chrome.storage.sync`** — synced across the user's Chrome profile, an accepted trade-off for a single-user tool (§9). Opened via `chrome.runtime.openOptionsPage()` from the popup when unconfigured.

### `popup.html` / `popup.js`
320px popup; all UI is innerHTML-rendered by `popup.js`. Flow of `init()`:

1. Load `{appUrl, token}` from storage.sync → "Setup needed" screen if missing.
2. Resolve the active tab URL: `chrome.tabs.query({active, currentWindow})`, falling back to `lastFocusedWindow`, accepting `pendingUrl`; non-`http` URLs get a diagnostic screen (including the extension version and whether a tab was found) — this was the 0.1.1 hardening.
3. `GET {appUrl}/api/assist/packet?url=…` with `authorization: Bearer {token}`. Network failure → "Can't reach the app". `match: null` → "No tracked application — add it there first (paste the link), pick a mode, and come back."
4. **Mode-gated UI** (the popup enforces mode semantics visually):
   - `assist` → blue **"Fill this page"** + "you review and click Submit yourself."
   - `auto` but not approved → "Approve Auto-Apply in the tracker first." (no button)
   - `auto` + approved → purple **"Auto-Apply now"** + "This will fill AND submit — no final click. Blockers stop it safely."
   - `manual`/null → prompt to set Agentic Assist in the tracker.
5. Helpers: `fetchCoverLetterB64()` / `fetchResumeB64()` (authed fetches, bytes → base64, resume filename from the `x-filename` header); `report(event, detail)` → POST `/api/assist/report`; `resolvePendingChoices(pendingChoices)` → one `match-option` POST **per pending choice** (parallel `Promise.all`), then a single `executeScript` call applying `window.__trackerResolvePending(resolutions)` in the page, returning `{matched, unresolved, stillUnfilled}`.

**Assist fill click**: fetch files → inject `content.js` → `executeScript` calling `window.__trackerFill(profile, drafts, clB64, resB64, resName)` → if `pendingChoices` returned, show "Checking a few answers with AI…" and resolve → result summary ("Filled N field(s), N answer(s), cover letter attached, resume attached, N choice(s), + N matched by AI, M still need you … Review everything, then submit yourself.").

**Auto-Apply click**: fetch files once, then the **bounded blocker-retry loop** — `BACKOFF = [0, 5, 15]` seconds, i.e. **3 attempts max**, with a visible per-second countdown ("Blocked by the portal. Retrying in Ns… (attempt X of 3)"). Each attempt (`runAttempt`):
- inject + `__trackerAutoApply(...)`;
- outcome `pending` → resolve pending choices with AI; if any **required** group remains unresolved → treat as `incomplete` (never submit); else `__trackerFinishAutoApply()`;
- a `blocked` outcome from either stage feeds the retry loop.

Terminal outcomes: `submitted` → `report("submitted")` (server marks applied, fires receipt) + "Submitted ✓ — receipt sent"; `blocked` after all retries → `report("blocked", detail)` (server counts toward the 3-strike notice) + "You'll get a notification — finish manually"; `incomplete` → `report("failed", "unfilled required fields")` + "review the orange highlights and submit yourself (downgraded to Assist behavior)"; other `failed` → report + detail.

Note the two retry layers are complementary: the popup's 3-attempt backoff is *within one session*; the server's `blocker_retries >= 3` counter is *across sessions* (each exhausted popup loop reports one `blocked`).

### `content.js` — the form filler (v0.3.0)
Header comment: "Injected on demand (activeTab) — never runs without a click. Green outline = filled from your data. Orange outline = found but not confidently fillable; review it yourself. In Assist mode this never touches submit buttons; only `__trackerAutoApply` submits, and only after opt-in."

**Cross-injection state** lives on `window` (each `executeScript` call is a fresh injection with no closure memory): `__trackerPending` (Map pendingId → `{kind, container, elements, required}`), `__trackerPendingSeq`, `__trackerUnresolvedRequired` (count of required choice groups still unresolved — the submit gate). As a DOM-durability backstop, pending elements are also tagged with `data-tracker-pending="pN"` attributes so they can be re-found even if the framework re-rendered the group between calls.

**`trackerFillCore(profile, drafts, coverLetterB64, resumeB64, resumeFilename)`** — the shared fill pass:

- Constants: `FILLED = "2px solid #34c759"` (green), `REVIEW = "2px solid #ff9f0a"` (orange) — matching the app's `--success`/`--warning` light-mode tokens.
- **`RULES`** (ordered label-pattern → profile value; first match wins): first name (from `fullName` split), last name, full name, email, phone, linkedin, github, portfolio/website, school/university/college, degree, major→degree, `/graduat/`→gradDate, gpa, city/location, pronouns.
- **`ANSWER_RULES`** (question-pattern → stored answer for choice groups): `/sponsor/`→requiresSponsorship, `/authoriz/`→authorizedToWork, currently-enrolled regex→currentlyEnrolled, `/relocat/`→willingToRelocate, pronouns, gender, race/ethnicity, veteran, disability, how-did-you-hear. Rules with empty profile values are inert (`v &&` guard) — blank demographic fields are never auto-answered.
- `labelFor(el)` — concatenates `el.labels`, aria-label, placeholder, name, id, and the nearest `[class*='field']/[class*='question']/li/fieldset/div` wrapper's label/legend/`[class*='label']` text, capped at 300 chars — robust against Greenhouse/Lever/Ashby DOM variation.
- `setValue(el, value)` — **native prototype value setter** + dispatched `input` and `change` events: the standard trick to make React/Vue controlled inputs register programmatic writes.
- `isRequired(text, el)` — `\brequired\b` or `*` in the label text, or `aria-required="true"`.
- **Text pass** over visible, empty `input`/`textarea` (excluding hidden/submit/button/checkbox/radio/file/password): long-form detection (`TEXTAREA` or `/essay|answer|describe|why|tell us/i` in the label) → **drafted-answer matching**: each draft answer's prompt is tokenized into words > 3 chars; score = fraction of those words present in the field label; best unused answer with score ≥ 0.4 wins (each answer used at most once). Unmatched textareas → orange. Standard fields → first matching `RULES` entry → green; unmatched but required → orange + `unfilled++`.
- **File pass**: iterates `input[type=file]`. **Cover-letter check runs FIRST on every file input** so a field labeled "cover letter" never receives the resume even though it may loosely match `/resume/`. Cover letter: `/cover\s*letter/i` → decode base64 → `new File([bytes], "CoverLetter.pdf", {type: "application/pdf"})` → `DataTransfer` → assign `el.files` → dispatch `change`. Resume: `/resume|\bcv\b/i` **and not** `/cover/i` → same mechanics with the server-provided filename and extension-derived MIME. One attach each; failures → orange.
- **Choice pass** (radios, checkbox groups, selects):
  - Grouping: radios by `name` (nameless radios each form their own group keyed by the element itself); checkboxes by `name` with **groups of < 2 skipped entirely** ("lone checkbox = consent box, never touched" — the filler will never tick a terms-of-service box); selects individually (visible + valueless).
  - `groupContainer(members)` — nearest common ancestor (walks up from the first member until it contains all others); `questionText(container)` — legend → heading/label descendants → up to 3 previous siblings (h1-6/label/legend/p) → aria-label, 300 cap.
  - Skips groups that already have a checked option (never overrides prior answers — including its own from a previous attempt).
  - **`findMatchingOption(options, answer)` — the word-boundary hardening (0.3.0)**: answers ≤ 4 chars ("Yes"/"No") must match by equality, prefix, or the word-boundary regex `(^|\W)answer(\W|$)` — *never* bare substring, "which would let 'No' match inside 'Not currently enrolled'". Longer answers keep permissive `===`/startsWith/includes matching.
  - Yes/No sanity check: a stored Yes/No answer is only applied to a group that actually contains literal "yes" and "no" options (`isYesNoGroup`) — prevents answering an unrelated question that merely mentions "sponsor".
  - Match → real `.click()` (radios/checkboxes) or native select setter + `change` (selects) → green outline on the whole group, `choices++`.
  - **Rule matched but no option matched** → `recordPending(...)`: assign a pendingId, tag elements with `data-tracker-pending`, store in the window registry, push `{kind, question, storedAnswer, options: [option label texts], pendingId, required}` onto `pendingChoices` for the popup, increment `__trackerUnresolvedRequired` if required. ("Defer to semantic resolution instead of giving up immediately.")
  - No rule + required → orange + `unfilled++`.
- Returns `{filled, answers, unfilled, choices, coverLetterAttached, resumeAttached, pendingChoices}`.

**Entry points on `window`:**

- **`__trackerFill = trackerFillCore`** — "Assist entry point: fill only, never submit."
- **`__trackerResolvePending(resolutions)`** — applies `[{pendingId, index|null}]` from the Haiku matcher: looks up the registry, filters held element references by `isConnected` with fallback re-query by the data attribute; `index != null` → click/select using the same mechanics as the literal path → green, decrement the required counter, delete the entry; `index null`/out-of-range/gone → orange ("leave it for the human"), `stillUnfilled++` if required. Returns `{resolved, stillUnfilled}`.
- **`trackerDetectBlocker()`** — CAPTCHA/bot-check detection: selector for recaptcha/hcaptcha/turnstile iframes, `.g-recaptcha`/`.h-captcha`/`.cf-turnstile`/`#cf-challenge-running`/`[class*="cf-challenge"]`, plus body text `/verify you are human/i`.
- **`trackerFindSubmit()`** — visible, enabled `button[type=submit]`/`input[type=submit]`, else any button whose text starts with `/^(submit|apply|send application)/i`.
- **`__trackerAutoApply(...)`** — "Full Auto-Apply entry point (opt-in only)": blocker check **FIRST** ("refuses to touch the form if present") → `{outcome: "blocked", detail}`; resets the pending registry (stale entries from a prior attempt must not linger); runs the fill; `pendingChoices` non-empty → `{outcome: "pending", ...}` (**"it must NOT submit until those are resolved"** — control returns to the popup); `unfilled > 0` → `{outcome: "incomplete"}` (downgrade to Assist behavior); no submit control → `failed`; else `submit.click()` and resolve `{outcome: "submitted"}` after a **fixed 2500ms wait** — optimistic; there is no verification that the ATS accepted the submission (§9).
- **`__trackerFinishAutoApply()`** — the post-resolution tail: **re-checks blockers** (the page may have changed), refuses with `failed: "unfilled required fields"` while `__trackerUnresolvedRequired > 0`, then finds + clicks submit with the same 2500ms pattern.

---

# 4. Database schema & job flow

Postgres, managed by Drizzle. Two singleton tables use a `boolean` primary key defaulting to `true` so the table can hold exactly one row upserted with `onConflictDoUpdate({target: id})`.

## Enums

| Enum | Values |
|---|---|
| `source_kind` | github_repo, greenhouse, lever, smartrecruiters, workday, rss, instagram_mirror |
| `role_type` | swe, ml, data, quant, other |
| `job_level` | internship, new_grad |
| `location_mode` | remote, hybrid, onsite, unknown |
| `posting_status` | active, expired, hidden |
| `sponsorship` | sponsors, citizens_only, unknown |
| `application_mode` | manual, assist, auto |
| `application_stage` | saved, in_progress, applied, assessment, interviewing, offer, rejected |
| `notification_channel` | push, email, sms |
| `notification_kind` | instant, digest, confirmation, blocker |
| `sample_set` | cover_letter, short_answer |
| `document_kind` | resume, cover_letter, short_answers, other |
| `storage_destination` | inapp, local, gdrive |

## Tables

### `sources` — user-managed discovery sources
| Column | Type | Purpose |
|---|---|---|
| `id` | serial PK | |
| `kind` | source_kind | Selects the poller in `poll-sources.ts`. |
| `name` | text | Display name (Settings UI, log lines). |
| `config` | jsonb `{}` | Kind-specific: `{repo, branch, listingsPath}` / `{boardToken}` / `{site}` / `{company}` / `{host, tenant, site, searchText}` / `{feedUrl, defaultCompany}`. Whitelisted per kind in `actions/sources.ts`. |
| `enabled` | bool default true | Poll gate. |
| `last_polled_at` | timestamptz? | Null = never polled → next poll is a **silent backfill** (skipNotify). |
| `http_cache` | jsonb? | `{etag, lastModified}` for conditional requests; preserved across 304s and errors. |
| `last_error` | text? | Last poll failure message; shown in red in Settings. |
| `created_at` | timestamptz | |

### `postings` — deduplicated discovered postings
| Column | Type | Purpose |
|---|---|---|
| `id` | serial PK | |
| `dedupe_hash` | text, **UNIQUE index** | FNV-1a-64 of normalized company\|title\|first-location — the cross-source identity; insert conflicts are counted as duplicates. |
| `company`, `title`, `url` | text | Display + application link (first source to report wins the stored URL). |
| `locations` | jsonb string[] | All listed locations. |
| `location_mode` | enum default unknown | From source or `classifyLocationMode`. |
| `role_type` | enum default other | From `classifyRole`. |
| `job_level` | enum default internship | From `classifyLevel` (fallback internship). |
| `description` | text? | Capped ~8000 chars by pollers; only ATS/RSS sources provide one. |
| `deadline` | timestamptz? | Drives auto-archive + deadline-sort + urgency in the recommender. Rarely provided. |
| `posted_at` | timestamptz? | Source-stated post date. |
| `first_seen_at` | timestamptz default now, indexed | Drives "new in 24h", recency filters, default sort. |
| `status` | enum default active, indexed | active / expired (auto-archive) / hidden (applied-role suppression). |
| `sponsorship` | enum default unknown | Only ever set from SimplifyJobs-style listing metadata. |
| `terms` | jsonb [] (migration 0003) | Normalized season/year strings, e.g. `["Summer 2026"]`; powers Season/Year filters via jsonb SQL. |
| `bookmarked` | bool | The Saved filter/star. |
| `notes` | text? | Per-posting user notes. |
| `seen_in` | jsonb `[{sourceId, url, seenAt}]` | Every source that reported this posting — appended on dedupe hits; drives "N sources" and the Seen-in card. |
| `raw` | jsonb? | Original source payload (incl. sponsorship raw). |

### `applications` — tracked applications (the Kanban rows)
| Column | Type | Purpose |
|---|---|---|
| `id` | serial PK | |
| `posting_id` | FK postings, **set null** | Optional link back (manual adds have none). Set-null so deleting a posting keeps the application. |
| `company`, `role_title`, `location?`, `url` | text | Denormalized copies — editable independently of the posting; `url` is what the extension packet matches against. |
| `mode` | application_mode **nullable** | *"null until the user explicitly picks a mode — never defaulted silently."* |
| `mode_recommendation` | jsonb? | Cached `{recommended, reasons[], signals}` from `recommendMode`, computed once on first detail-page view. |
| `drafts` | jsonb? (migration 0002) | `{coverLetter?, answers?: [{prompt, answer}]}` — the user-reviewed raw text; *"what the extension fills into portals."* |
| `stage` | enum default saved, indexed | The 7-stage pipeline. |
| `resume_id` | FK resumes, set null | Per-application resume choice; packet/resume routes fall back to default→newest. |
| `auto_apply_approved_at` | timestamptz? (migration 0004) | *"Set only via the explicit per-application auto-apply opt-in; cleared on any mode change away from 'auto'."* The packet exposes it as `autoApply.approved`, but only when the **master switch** (`settings.auto_apply_enabled`) is also on. |
| `prep` | jsonb `InterviewPrep`? (migration 0006) | Cached interview/skill-prep guidance (P2-M3) — `{focusAreas, practiceProblems, projectIdeas, resources, behavioral}` (the `InterviewPrep` TS interface lives in `packages/db/src/schema.ts` itself, next to the table, and is re-exported by `lib/interview-prep.ts`). Generated by `generatePrep()`, regenerable, useful in every mode. |
| `blocker_retries` | int default 0 (migration 0004) | Cross-session blocked-attempt counter; *"notifies at 3"*; reset by re-approval; ≥3 also surfaces in the dashboard Needs-attention panel. |
| `applied_at` | timestamptz? | Stamped on first transition into applied (manual or auto) — guards receipt/side-effect idempotence. |
| `notes`, `created_at`, `updated_at` | | `updated_at desc` ordering is what makes packet matching prefer recently-touched applications. |

### `reminders` — follow-ups and OA deadlines
`id`, `application_id` (FK **cascade** — deleting an application deletes its reminders), `label`, `due_at`, `done` (default false), `notified_at?` (stamped by send_reminders → exactly-once notification).

### `writing_samples` — few-shot voice corpus
`id`, `set` (cover_letter | short_answer — two deliberately separate voices), `title`, `content`, `created_at`. Newest 3 per set are used per draft.

### `documents` — generated/persisted documents
`id`, `application_id` (FK set null), `kind`, `destination` (where the user *chose* to store — the disk copy always exists), `location` (the disk key = `Internships/<year>/<Company>_<Role>/<file>`; comment mentions R2 key/Drive id as alternatives but in practice it's always the disk key, with Drive as a mirror), `created_at`.

### `profile` — single-row auto-fill profile
`id` boolean PK default true; `data` jsonb — the flat string map maintained by ProfileForm (12 profile fields + 10 application-answer fields, see §3.4.6); `updated_at`. Consumed verbatim by the packet route → content.js rule tables.

### `settings` — single-row app settings
`id` boolean PK true; `timezone` (default America/New_York — was LA in migration 0000, fixed in 0002); `quiet_hours_start` 23 / `quiet_hours_end` 7 (as of the notification overhaul, quiet hours gate **only push/SMS**, never email); `channels` jsonb default `{push: true, email: true, sms: false}` (**SMS off by default** — rule #6); `include_new_grad` false (gates both notifications and the default listing view); `notification_rules` jsonb `{}` (shape `NotificationRules`; default was erroneously `[]` in 0000, fixed in 0001); `storage_destination` default inapp; `auto_apply_enabled` boolean default **false** (migration 0007) — the master Auto-Apply kill switch (rule #7 in §1); `watchlist_companies` jsonb `[]` (migration 0008) — companies that alert **instantly** on every channel, bypassing the digest and quiet hours (matched via `normalizeCompany`, `isWatchedCompany` in `@tracker/shared`); `digest_hours` jsonb default `[8, 17]` (migration 0008) — the clock hours (0–23, in `timezone`) at which the batched email digest flushes; `last_digest_sent_at` timestamptz? (migration 0008) — guards against double-sending within one digest slot (`digestSlotDue`); `gmail_enabled` boolean default **false** (migration 0009) — P2-M2's own opt-in gate, separate from the Auto-Apply switch; `gmail_refresh_token` text? (migration 0009) — a real secret, a long-lived `gmail.readonly` OAuth grant obtained via `/api/gmail/connect`→`callback` (never the sign-in flow); `gmail_connected_email` text? — display-only, which Gmail account is connected; `gmail_last_sync_at` timestamptz? — the cursor `sync-gmail-status.ts` polls forward from; `updated_at`.

### `push_subscriptions`
`id`, `endpoint` (**unique** — subscribe is idempotent), `keys` jsonb `{p256dh, auth}`, `created_at`. One row per browser/device; push fans out to all; 404/410 responses self-delete the row.

### `notification_log`
`id`, `posting_id?` / `application_id?` (set-null FKs), `channel`, `kind`, `payload` jsonb (title/body/url), `sent_at`. **One row per successful channel delivery**; failures are not logged (§9).

### `digest_queue`
`id`, `posting_id` (FK cascade), `queued_at`, `sent_at?`. Populated by `onNewPosting` during quiet hours; flushed (marked sent) by `send_digest` after the window ends.

### `mode_decisions` — recommendation-vs-choice history
`id`, `application_id` (FK cascade), `recommended`, `chosen`, `signals` jsonb (the recommendation's `{ats, atsTier, deadline}`), `decided_at`. Written by `setApplicationMode` and `approveAutoApply`; read by `recommendMode` to learn per-ATS override patterns (≥2 overrides on an ATS → follow the user). Also the source of the Analytics "Recommendation vs. your choice" card (§3.4.5).

### `latex_resumes` — Resume Studio (migration 0005)
| Column | Type | Purpose |
|---|---|---|
| `id` | serial PK | |
| `name` | text | Display name, editable inline in the studio's top bar. |
| `source` | text | The full `.tex` document — CodeMirror's single source of truth, autosaved here every 1.5s. |
| `compiled_key` | text? | Upload key of the last **successfully persisted** compile, e.g. `latex-resumes/12.pdf` (`compiledKeyFor(id)`). Not touched by preview compiles. |
| `compile_log` | text? | Tail (last 4000 chars) of the most recent compile's combined stdout+stderr, for inline error display. |
| `last_compiled_at` | timestamptz? | Always written together with `compiled_key`. |
| `chat_history` | jsonb `[]` | `{role: "user"\|"assistant", content}[]`, capped at the last 30 turns server-side (`MAX_STORED_MESSAGES`); the model sees only the last 12 (`MAX_CONTEXT_MESSAGES`) per turn. |
| `created_at`, `updated_at` | | |

No column tracks the throwaway preview PDF (`latex-resumes/<id>-preview.pdf`, `previewKeyFor(id)`) — it's a pure filesystem side-effect of `compileLatexPreview`, looked up by convention from the id rather than stored, and cleaned up best-effort on `deleteLatexResume`.

## graphile-worker job flow

graphile-worker keeps its own schema (`graphile_worker.*`) in the same Postgres database — this shared database *is* the transport between web and worker; there is no HTTP between them.

| Job | Trigger | Enqueued by | Handler |
|---|---|---|---|
| `poll_sources` | cron `* * * * *` | worker crontab | `tasks/poll-sources.ts` — poll all enabled sources → ingest |
| `send_digest` | cron `*/5 * * * *` | worker crontab | `tasks/send-digest.ts` — flush digest_queue after quiet hours |
| `send_reminders` | cron `*/5 * * * *` | worker crontab | `tasks/send-reminders.ts` — due, unnotified reminders |
| `auto_archive` | cron `13 * * * *` | worker crontab | `tasks/auto-archive.ts` — expire past-deadline postings |
| `send_confirmation` | on demand | **web** via `select graphile_worker.add_job('send_confirmation', json_build_object('applicationId', $1))` from `lib/applied-side-effects.ts` (`onApplied`, used by both `updateStage` and `/api/assist/report`) and the currently-unreferenced `enqueueConfirmation` in `actions/settings.ts` | `tasks/send-confirmation.ts` → `onSubmissionConfirmed` |
| `send_blocker_notice` | on demand | **web** via `add_job('send_blocker_notice', json_build_object('applicationId', $1, 'detail', $2))` from `/api/assist/report` when `blocker_retries` reaches 3 | `tasks/send-blocker-notice.ts` — "needs you" notification |

The web app deliberately has **no graphile-worker dependency** — it enqueues by calling the SQL function graphile-worker installs. Concurrency 4 on the worker; cron jobs are skipped-if-running by graphile-worker's cron semantics.

---

# 5. End-to-end flows

## (a) Posting discovered → deduped/tagged → notified (instant push/SMS, watchlist email, or the twice-daily digest)

1. **Cron tick** (`apps/worker/src/index.ts`, `* * * * *`) runs `poll_sources`.
2. `tasks/poll-sources.ts` iterates enabled `sources`; each kind dispatches to its poller (`sources/github.ts` — including the per-source README column-map override, see §3.5 — `sources/ats.ts`, `sources/rss.ts`), all built on `sources/http.ts` `conditionalFetch` — unchanged sources return 304 and contribute zero postings.
3. Poller output (`NormalizedPosting[]`) → `ingest.ts ingestPostings()`:
   - `isRelevantRole` gate (`packages/shared/src/tagging.ts`) drops non-CS titles;
   - `dedupeHash` (`packages/shared/src/index.ts`) — an existing hash appends to `seenIn` and stops (never re-notifies);
   - applied-role suppression (normalized company|title vs all applications) inserts as `hidden` silently;
   - insert with classifier fallbacks (`classifyRole/Level/LocationMode`, `extractTerms`, sponsorship from SimplifyJobs raw);
   - new + not suppressed + not first-poll-backfill → `notify.ts onNewPosting(id)`.
4. **`onNewPosting`** (rewritten for the notification overhaul — channels now diverge): `passesNotificationRules` (`packages/shared/src/rules.ts` — new-grad gate, role/mode/company/keyword rules) gates everything below; then:
   - **Watchlisted company** (`isWatchedCompany`, matched via `normalizeCompany`) → a rich Simplify-style single-posting HTML email (`email-template.ts renderPostingEmail`) plus push/SMS, **all instantly, on every enabled channel, bypassing both the digest queue and quiet hours** — "apply early" for the companies that matter most.
   - **Everyone else**: if email is enabled, the posting is queued into `digest_queue` **unconditionally** (not just during quiet hours anymore — see flow (f), which now flushes on a fixed twice-daily schedule instead). Push and SMS still fire **instantly**, independent of the email path, unless `inQuietHours` — in which case they're simply skipped for this posting (there's no catch-up queue for push/SMS; only email is ever queued).
   - Every successful send (any channel, any path) logs one `notification_log` row (see `channels/push.ts` for the delivery mechanics — payload rendered by `apps/web/public/sw.js` with a View action deep-linking `/internships/{id}`).

## (b) Track → recommendation → Assist → drafts → documents in storage

1. **Track**: from a posting page ("Track" button → `actions/postings.ts trackPosting`) or by pasted link (`actions/applications.ts addManualApplication`, with SSRF-guarded title scraping). Application lands at stage `saved`, **mode null**.
2. **Recommendation**: first view of `/tracker/{id}` (`app/(app)/tracker/[id]/page.tsx`) calls `lib/recommendation.ts recommendMode()` — ATS classification of the URL (Greenhouse/Lever/Ashby/SmartRecruiters → assist; Workday/Taleo/iCIMS or unknown → manual), deadline-urgency flip, and mode-decision override learning — and persists the result on the row. `ApplicationEditor` renders it with "Just a suggestion — your choice always wins."
3. **User picks Assist**: mode button → `setApplicationMode(id, "assist")`, which also records the recommended-vs-chosen pair into `mode_decisions`.
4. **Drafting** (`AssistPanel` → `actions/assist.ts`): `generateCoverLetter` / per-question `generateShortAnswer` → `lib/drafting.ts` → claude-sonnet-5 with up to 3 writing samples per set as few-shot voice references (placeholder templates without an API key). Drafts appear in editable textareas.
5. **Save** (`saveAssistDocuments`): each piece → `lib/documents.ts renderPdf` (pdf-lib, US Letter, wrapped Helvetica) → `saveGeneratedDocument`: disk write to `<UPLOAD_DIR>/Internships/<year>/<Company>_<Role>/{CoverLetter,ShortAnswers}.pdf` (always), Drive mirror via `lib/gdrive.ts` if destination gdrive (`findOrCreateFolder` chain + multipart upload; failures become non-fatal `driveError`), `documents` row insert. Simultaneously the raw reviewed text is persisted to `applications.drafts` — the extension's fill source. Documents appear in `/documents` with download links (`/api/documents/{id}/download`).

## (c) Extension Fill (Agentic Assist)

1. User opens the portal tab, clicks the extension. `popup.js` reads `{appUrl, token}` from `chrome.storage.sync`, resolves the tab URL, and calls **`GET /api/assist/packet?url=…`** with the bearer token.
2. `api/assist/packet/route.ts`: `assistAuthorized` (constant-time, `lib/extension-auth.ts`) → URL-prefix-then-hostname matching against applications (newest-updated first) → returns match (mode, drafts, autoApply.approved, document/resume URLs, resume filename) + the whole profile.
3. Mode `assist` → "Fill this page". On click the popup fetches cover-letter bytes (`/api/assist/document/{id}`) and resume bytes (`/api/assist/resume?applicationId=…` + `x-filename` header) itself — content scripts never see the token — then injects `content.js` and invokes `window.__trackerFill(profile, drafts, clB64, resB64, resName)` via `executeScript` args.
4. `trackerFillCore` in the page: text fields via the ordered `RULES` label-regex table (native setter + input/change events for React compatibility); long-form questions matched to drafted answers by ≥0.4 keyword-overlap score; cover letter and resume attached to file inputs via `DataTransfer` (cover-letter matching checked first on every input so the resume can't land in a cover-letter field); choice groups (radios/checkboxes/selects) answered from `ANSWER_RULES` with word-boundary-safe literal option matching. **Green outline** (`#34c759`) = filled; **orange** (`#ff9f0a`) = needs human review.
5. **Semantic fallback**: choice groups whose question matched a rule but whose options didn't literally match the stored answer come back as `pendingChoices`. The popup shows "Checking a few answers with AI…", POSTs each to **`/api/assist/match-option`** (`{question, options, storedAnswer}` → claude-haiku-4-5 → `{index | null}`; the model may only pick an option expressing the *same* stored answer, never invent), then applies results in-page via `window.__trackerResolvePending` (registry + `data-tracker-pending` re-query for re-rendered DOM). Unresolved → orange.
6. Popup summary ends with "**Review everything, then submit yourself.**" — `__trackerFill` has no submit path at all.

## (d) Full Auto-Apply

1. **Opt-in**: on `/tracker/{id}`, clicking the "Full Auto-Apply" mode button does *not* set the mode — it opens `AutoApplyOptin` (`components/auto-apply-optin.tsx`): readiness gate (saved drafts + resume required), full preview of profile fields / resume / cover letter / answers, and the explicit checkbox. **Approve** → `approveAutoApply()` (`actions/applications.ts`) — the only code path to `mode: "auto"` — stamping `autoApplyApprovedAt` and resetting `blockerRetries`. Revocable anytime (Revoke → `setApplicationMode(id, null)` clears the approval; so does switching to any other mode).
2. **Extension**: `api/assist/packet/route.ts` first checks the **master Auto-Apply kill switch** (`settings.auto_apply_enabled`, default off, migration 0007) — if it's off, the response's `mode` is silently downgraded from `"auto"` to `"assist"` (and `autoApply.approved` computed from that downgraded mode), so the extension never even learns this application is really in Auto-Apply; it just shows the normal Assist "Fill this page" UI. Only when the switch **and** the per-application `autoApplyApprovedAt` are both set does the packet return `mode: "auto"`, `autoApply.approved: true` → purple "Auto-Apply now" ("This will fill AND submit — no final click. Blockers stop it safely."). The switch is a global, one-click way to freeze all auto-submitting instantly without touching any individual application's approval (Settings → Automation, `components/auto-apply-settings.tsx`).
3. **Attempt loop** (popup): up to 3 attempts, 0/5/15s backoff with countdown. Each attempt: inject → `__trackerAutoApply` → **blocker check before touching the form** (recaptcha/hcaptcha/turnstile/Cloudflare selectors + "verify you are human" text) → fill → `pending` outcome hands control back for Haiku resolution → required-still-unresolved ⇒ `incomplete` (no submit; orange highlights; popup says "downgraded to Assist behavior") → else `__trackerFinishAutoApply` re-checks blockers and the `__trackerUnresolvedRequired` gate, clicks the located submit control, waits 2500ms, reports `submitted`.
4. **Report** (`POST /api/assist/report`, `api/assist/report/route.ts`):
   - `submitted` → stage `applied` + `appliedAt` + `onApplied()` → **receipt path**: SQL `add_job('send_confirmation')` → worker `send-confirmation.ts` → `onSubmissionConfirmed` → "Application submitted ✓" on all channels; plus repost hiding of matching active postings.
   - `blocked` → `blocker_retries++`; **at 3** → SQL `add_job('send_blocker_notice')` → worker `send-blocker-notice.ts` → "Auto-apply blocked — needs you … Finish this one manually." deep-linking `/tracker/{id}`; the application also appears in the dashboard's Needs-attention panel (`blockerRetries >= 3` query).
   - `failed` → no state change.

## (e) Reminder → notification

1. User adds "HackerRank OA due" + a `datetime-local` on `/tracker/{id}` (`ApplicationEditor` → `addReminder`).
2. Worker cron `send_reminders` (every 5 min) selects `done = false AND notified_at IS NULL AND due_at < now()` joined to applications, delivers "Reminder: {label} / {company} — {roleTitle}" (kind `instant`) linking `/tracker/{applicationId}`, and stamps `notified_at` — exactly one notification per reminder, ever.
3. Overdue-and-undone reminders additionally surface in the dashboard Needs-attention panel until checked off.

## (f) Twice-daily email digest + instant company watchlist

Replaces the original "one digest after the quiet-hours window ends" design. Email is now **always** batched (never sent one-posting-at-a-time) except for the watchlist bypass; quiet hours no longer govern email at all.

1. Every rule-passing, non-watchlisted posting's email is queued into `digest_queue` the moment it's ingested (flow a) — regardless of time of day.
2. Every 5 minutes, `send_digest` calls `digestSlotDue(now, timezone, settings.digestHours, settings.lastDigestSentAt)` (`@tracker/shared`) — true only on the first tick inside one of the configured send hours (default **8am and 5pm**, editable in Settings → Notifications → "Email digest"). Everything else is a no-op.
3. On a due slot: **stamp `settings.last_digest_sent_at = now()` immediately** (so a slow send can't double-fire the same slot on the next 5-minute tick), then collect all unsent `digest_queue` rows, drop postings no longer active, and — if any remain — render one Simplify-style HTML email (`email-template.ts renderDigestEmail`): "💫 N new job(s) for you", up to 25 posting cards + "…and N more — see all in the app", one "Open Internships" button. Delivered **email-only** (push/SMS already fired instantly per-posting in flow a).
4. All queued rows are marked sent regardless of whether they made the cut (stale/expired entries never retry).
5. **The watchlist bypass** (`isWatchedCompany`) skips this queue entirely: a watchlisted company's posting gets its own rich single-posting email (`renderPostingEmail`) plus push/SMS, instantly, the moment it's ingested — never batched, never delayed by a digest slot, never suppressed by quiet hours.
6. **Quiet hours** (default 23:00–07:00 in `settings.timezone`, window may wrap midnight, via `inQuietHours`) now affect **only push and SMS** for non-watchlisted postings — during the window those two channels are simply skipped for that posting (no catch-up queue), while the email digest keeps accumulating and firing at its fixed slots regardless. Confirmations, blockers, and reminders are unaffected by quiet hours entirely, as before.

## (g) Screenshot Intake: story screenshot → posting

A manual, vision-assisted supplement to the polled discovery pipeline — for postings that only ever surface as a social-media screenshot (the original motivating case: zero2sudo's Instagram stories, see §9 roadmap history).

1. User opens `/intake` and drops/selects a screenshot (PNG/JPG/WebP, ≤10MB) into `components/screenshot-intake.tsx`.
2. On selection, `extractFromScreenshot(formData)` (`app/actions/intake.ts`) base64-encodes the image and calls `lib/screenshot-extract.ts extractPostingFromScreenshot` — **claude-haiku-4-5-20251001** with an `image` content block, instructed to extract `{company, title, url?, locations?, term?, notes?}` and, critically, to **never fabricate a URL** ("ONLY include if a full or near-complete URL is actually legible... never guess, complete, or construct one from the company name").
3. The extraction (or, on any failure, an empty form + an explanatory message) populates an editable confirmation form — **nothing is saved yet**. The user can edit every field, including leaving the URL blank if the screenshot said "link in bio."
4. **Confirm & add posting** → `createPostingFromIntake(input)` runs the confirmed fields through the **same** normalize/dedupe/tag pipeline the worker's `ingest.ts` uses (`classifyRole/Level/LocationMode`, `extractTerms`, `dedupeHash`), so a screenshot-sourced posting is indistinguishable from a polled one once created. A `dedupeHash` collision with an existing posting returns that posting instead of inserting a duplicate (status `"existing"`) — e.g. a poller had already caught the same company+role+location, or this is a second screenshot of the same story.
5. The result screen offers **View posting** and **Track it** (`trackPosting`, the same one-click track used everywhere else) — from here the posting behaves identically to a polled one: it can be Tracked, notified about (though it obviously won't re-notify since it was manually created), etc. The screenshot image itself is discarded after step 2 — never written to disk or the DB. Postings created this way commonly have an empty `url`, which is why the Apply link is conditionally hidden on the card, list row, and detail page (§3.4.6).

## (h) Interview & skill-prep generation (P2-M3)

1. On any application detail page (`/tracker/{id}`, any mode), `PrepPanel` shows a "Generate prep" button if `applications.prep` is still null.
2. `generatePrep(applicationId)` (`app/actions/prep.ts`) assembles `PrepContext` (application company/role, linked posting's description + roleType, and `profile.data` for personalization) and calls `lib/interview-prep.ts generateInterviewPrep` — **claude-sonnet-5**, instructed to ground every suggestion in the actual posting, personalize to the profile, and **never fabricate a specific problem link/ID** (practice problems and resources are referenced by well-known name only, e.g. "Two Sum", "NeetCode 150").
3. The parsed `InterviewPrep` (`{focusAreas, practiceProblems, projectIdeas, resources, behavioral}`) is persisted onto `applications.prep` (cached like `mode_recommendation` — generated once, cheap to view repeatedly, regenerable on demand) and rendered: practice problems link out to a **LeetCode problemset search** for their name (`lib/neetcode.ts leetcodeSearchUrl` — never a guessed slug) alongside a header link to the canonical **NeetCode 150** roadmap.
4. **Regenerate** re-runs the same path and overwrites the cached `prep` — no history is kept, only the latest generation.
5. Without `ANTHROPIC_API_KEY`, `generateInterviewPrep` returns a clearly `[PLACEHOLDER]`-labeled but structurally valid `InterviewPrep` so the whole generate/cache/regenerate flow is testable offline; a genuine parse failure of a real model response (as opposed to a missing key) instead throws, so the client can toast "try again" rather than showing a misleading "API key not configured" message.

## (i) Resume Studio: preview a chat-proposed change before applying it

Added on top of the pre-existing Resume Studio flow (write LaTeX → Compile → PDF preview → Chat → apply/undo → Save as resume version). Previously, clicking "Apply to editor" on a chat-suggested `<latex>` block replaced the editor content immediately (with one-level undo as the only safety net) — there was no way to see the result *before* committing.

1. In `components/latex-chat.tsx`, an assistant reply containing a `<latex>...</latex>` block now renders three actions instead of two: **Copy**, **Preview** (new), **Apply to editor**.
2. **Preview** → `latex-studio.tsx previewProposed(latex)`: switches to the Preview tab, remembers the currently-displayed `pdfUrl` in a ref (so it can be restored), and `POST /api/latex/compile {id, source: latex}` — the presence of a `source` field in the request body is what routes the server to `lib/latex-compile.ts compileLatexPreview(id, source)` instead of the normal `compileLatexResume(id)`.
3. `compileLatexPreview` runs the proposed source through the **same Tectonic sandbox** (`runTectonic` — temp dir, `execFile`, 45s timeout, no shell string) but writes the resulting PDF to a **separate throwaway key** (`latex-resumes/<id>-preview.pdf`, `previewKeyFor(id)`) and touches **neither** the row's `source` column nor its real `compiledKey` — the saved resume and the PDF that "Save as resume version" would copy are completely unaffected.
4. The editor shows a banner over the (now proposal-preview) iframe: "Preview of a proposed change — not applied yet" with **Apply change** / **Dismiss** actions.
   - **Apply change** → applies the proposed text to the editor via the normal `applyLatex` path (one-level undo snapshot taken, autosaved), then immediately triggers a **real** compile so the persisted `compiledKey`/PDF catches up to match what's now in the editor.
   - **Dismiss** → restores the `pdfUrl` that was showing before the preview started, clears the compile log/status; the editor and the saved resume were never touched at any point.
5. `api/latex/pdf/[id]/route.ts` serves either PDF from the same endpoint based on a query flag: `?preview=1` streams `previewKeyFor(id)`; without it, the persisted `compiledKey`.
6. **Cleanup**: `deleteLatexResume(id)` now also best-effort-deletes the preview key (`deleteUpload(previewKeyFor(id))`, a no-op if the resume was never previewed) alongside the persisted compiled PDF, so a deleted resume doesn't leave an orphaned preview file on the volume.

## (j) Gmail status monitoring — opt-in inbox → tracker stage (P2-M2)

Off by default (`settings.gmailEnabled = false`); a deliberately **separate OAuth consent flow from sign-in**, so nothing about this feature widens what the sign-in flow can access.

1. **Connect**: Settings → Gmail status monitoring → "Connect Gmail" (`components/gmail-settings.tsx`, a plain `<a>` to `api/gmail/connect/route.ts`, which redirects to Google requesting only `gmail.readonly`). Google redirects back to `api/gmail/callback/route.ts`, which CSRF-checks the state cookie, exchanges the code, and stores **only** `gmailRefreshToken` + `gmailConnectedEmail` in `settings` (never an access token, never anything from the inbox).
2. **Sync** (`apps/worker/src/tasks/sync-gmail-status.ts`, cron every 15 min, §3.5): no-ops instantly unless connected. Refreshes an access token from the stored refresh token, lists Gmail message ids received since the last sync (or a 2-day lookback on the first-ever run), and for each fetches **metadata only** — From, Subject, and Gmail's own short `snippet` — via `gmail-client.ts`, never the full message body.
3. **Match**: each message's From+Subject is checked for a normalized-company-name match against every tracked application not already `rejected`. Only actual matches are escalated to classification — most inbox mail costs nothing beyond the one cheap metadata fetch.
4. **Classify**: a match goes to `classifyStatusSignal` (Haiku) with the company/role + From/Subject/snippet, returning one of `interview_invite`/`oa_invite`/`offer`/`rejection`/`confirmation`/`none` plus a `high`/`low` confidence. Only `high`-confidence, non-`none` results act — the classifier is explicitly instructed to prefer `low`/`none` over a guess, and the company-match pre-filter already screens out most false positives (a tech newsletter that happens to mention "interview" scores `none` because it isn't *about* the specific tracked company/role).
5. **Act**: the signal maps to a target stage; the application's stage only moves if the target is `rejected` (always allowed — offers can be rescinded) or the target is strictly further along the fixed pipeline order than the application's current stage — so a stray signal can never downgrade or override more-advanced state the user (or a better signal) already set. On an accepted move: stage updates, `appliedAt` stamps if unset, a short note like `[Gmail: interview invite detected, 7/12/2026]` is **prepended** to (never replaces) the application's existing notes, and the normal notification channels fire. **The email's From/Subject/snippet are discarded at this point and never written to the database** — only the classification's consequence (a stage + a short synthesized note) persists.
6. **Disconnect**: Settings → Disconnect (`disconnectGmail()`) best-effort revokes the grant with Google and clears the stored token/email/cursor — the feature returns to fully off, same as it was before ever connecting.

---

# 6. External services & environment variables

Dev values live in git-ignored `apps/web/.env.local` (web, read by Next) and root `.env` (worker, via `--env-file`); production values live in **Railway service variables** (per service). `.env.example` is the documented template.

| Variable | In `.env.example`? | Read by | Purpose |
|---|---|---|---|
| `DATABASE_URL` | ✔ | `packages/db/src/client.ts`, `drizzle.config.ts`, `apps/worker/src/index.ts` | Postgres connection. Both Railway services reference the Postgres service (`${{Postgres.DATABASE_URL}}`). Local default `postgres://localhost:5432/internship_tracker`. |
| `AUTH_SECRET` | ✔ | next-auth (implicit) | JWT session signing. `openssl rand -base64 32`. Web only. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | ✔ | next-auth Google provider (implicit env convention); **also `api/gmail/connect`+`callback` (web) and `sync-gmail-status.ts` (worker, P2-M2)** | OAuth client from console.cloud.google.com; redirect URIs registered for prod domain + localhost, **plus a second pair for `/api/gmail/callback`** (a separate consent flow from sign-in). Same client reused for both flows — no second OAuth client needed. As of P2-M2, **must also be set on the worker service**, not just web (the worker needs it to refresh the stored Gmail token). |
| `ALLOWED_EMAIL` | ✔ | `src/auth.ts` signIn callback | The single allowed Google account (joshuamichael365@gmail.com). Unset → nobody can sign in. |
| `AUTH_DISABLED` | ✔ | `src/auth.ts` | Dev-only bypass; hard-disabled when `NODE_ENV === "production"`. "NEVER set this in production." |
| `AUTH_URL` | ✘ (deploy-time) | next-auth (env convention; aliased from `NEXTAUTH_URL`) | **The behind-proxy gotcha (§8):** on Railway the app sits behind a reverse proxy, and Auth.js's inferred origin broke the Google OAuth callback — the fix was setting `AUTH_URL=https://web-production-64a44.up.railway.app` explicitly in the Railway web-service variables. Not referenced anywhere in repo source (it's consumed inside next-auth), hence easy to miss. |
| `ANTHROPIC_API_KEY` | ✔ | `lib/drafting.ts`, `lib/resume-parse.ts`, `api/assist/match-option` (via SDK default) | Claude access. Absent → placeholder drafts, skipped parsing, `{index: null}` matching — every feature degrades gracefully. Set on **both** Railway services per DEPLOYMENT.md (though only web currently calls the API). Models: claude-sonnet-5 (drafting), claude-haiku-4-5-20251001 (resume parsing, option matching). |
| `EXTENSION_TOKEN` | ✘ (documented in DEPLOYMENT.md) | `lib/extension-auth.ts` | Shared secret for all `/api/assist/*` routes (`openssl rand -hex 24`); the same value goes into the extension's options page. Unset → assist routes always 401 (deny-by-default). Web service only. |
| `VAPID_PUBLIC_KEY` | ✔ | web `settings/page.tsx` (passed to the client for `pushManager.subscribe`) **and** worker `channels/push.ts` | Web-push VAPID keypair (`pnpm dlx web-push generate-vapid-keys`; fresh pair for prod). Public on both services. |
| `VAPID_PRIVATE_KEY` | ✔ | worker `channels/push.ts` | Worker only. |
| `RESEND_API_KEY` | ✔ | worker `channels/email.ts` | Resend email. Worker only. |
| `RESEND_FROM` | ✘ | worker `channels/email.ts` | Optional custom verified sender; defaults to `Internships <onboarding@resend.dev>`. |
| `NOTIFY_EMAIL_TO` | ✔ | worker `channels/email.ts`, `channels/push.ts` (VAPID mailto subject) | Recipient address. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` / `NOTIFY_SMS_TO` | ✔ | worker `channels/sms.ts` | SMS channel; all four required. Currently unconfigured in prod (SMS stays a no-op even if toggled on — logs "would send"). |
| `APP_URL` | ✘ (deploy-time) | worker `notify.ts` + all notification tasks | Base URL for deep links in notifications (`https://web-production-64a44.up.railway.app`; default `http://localhost:3000`). Set on both services. |
| `UPLOAD_DIR` | ✘ (deploy-time) | `lib/storage.ts` (hence documents/resume routes) | File-storage root; `/data/uploads` on the Railway volume in prod; `<repo>/data/uploads` default in dev. Web service. |
| `GITHUB_TOKEN` | ✔ | **nobody** | Reserved for GitHub-API rate limits; the poller uses raw.githubusercontent.com and never reads it. Unused. |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | ✔ | **nobody** | Planned R2 storage backend (see `lib/storage.ts` docstring) that was superseded by the Railway volume. Unused. |
| `GDRIVE_CLIENT_ID` / `GDRIVE_CLIENT_SECRET` | ✔ | `lib/gdrive.ts` | Google Drive refresh-token flow. |
| `GDRIVE_REFRESH_TOKEN` | ✘ | `lib/gdrive.ts` | Third leg of the Drive credentials (minted via OAuth playground per DEPLOYMENT.md); all three required for `driveConfigured()`. |
| `TECTONIC_PATH` | ✘ (Railway-only) | `lib/latex-compile.ts` (`runTectonic`) | Absolute path to the Tectonic binary; falls back to bare `"tectonic"` on `PATH` (works for a Homebrew-installed local dev binary). In prod, Tectonic isn't in the base image's apt repos, so it's fetched during the Railway build into `/app/bin/tectonic` and this var points at it (see DEPLOYMENT.md / CLAUDE.md §8). |
| `TECTONIC_CACHE_DIR` | ✘ (Railway-only) | `lib/latex-compile.ts` (`runTectonic`, as `XDG_CACHE_HOME`) | Where Tectonic caches downloaded LaTeX packages between compiles; set to a path on the Railway volume (`/data/tectonic-cache`) so the cache survives deploys — first compile after a fresh cache is ~10–20s, then ~1s. |
| `RAILPACK_*` | ✘ | Railway build system | Railpack (Railway's builder) configuration variables set in the Railway dashboard, not in repo code — used to pin the Node/pnpm build behavior for the two services. No source file reads them; they exist only at the platform layer alongside Railway's auto-injected `RAILWAY_*` vars. |
| `NODE_ENV` | — | `auth.ts`, `client.ts` | Production disables the auth bypass and the global DB-client cache. |

**External services summary:** Railway (hosting: web + worker + Postgres + volume), Google Cloud (OAuth sign-in; optional Drive API; **Gmail API for P2-M2 status monitoring, opt-in, read-only**), Anthropic API (drafting/parsing/matching/prep/screenshot-extract/Gmail-classification), Resend (email), Twilio (SMS, opt-in, not yet configured), Google favicon service (company logos, unauthenticated), raw.githubusercontent.com + public ATS APIs (Greenhouse/Lever/SmartRecruiters/Workday) for discovery.

---

# 7. Design system

## Token system (`apps/web/src/app/globals.css`)

Tailwind v4 (`@import "tailwindcss"`), class-based dark mode via `@custom-variant dark (&:where(.dark, .dark *))`, and an **Apple HIG-inspired token set** defined as CSS custom properties on `:root` (light) and `.dark`:

| Token | Light | Dark | Role |
|---|---|---|---|
| `--background` | `#f5f5f7` | `#161617` | Page background (also the PWA theme-color values). |
| `--surface` | `#ffffff` | `#1d1d1f` | Cards, popover surfaces. |
| `--surface-secondary` | `#fbfbfd` | `#232326` | Inputs, inset panels. |
| `--sidebar` | `rgba(245,245,247,.85)` | `rgba(22,22,23,.85)` | Translucent nav chrome (+ backdrop-blur). |
| `--text` / `--text-secondary` / `--text-tertiary` | `#1d1d1f` / `#6e6e73` / `#a1a1a6` | inverted grays in dark | Three-level text hierarchy. |
| `--accent` | `#0071e3` | `#0a84ff` | Apple blue; primary actions, links, active states. |
| `--accent-soft` | 10% blue | 16% blue | Tinted fills behind accent text. |
| `--separator` | 8% black | 10% white | Hairlines/dividers. |
| `--success` | `#34c759` | `#30d158` | Applied/Offer stages, enabled switches — **and the extension's green "filled" outline is the same `#34c759`** (hardcoded in content.js). |
| `--warning` | `#ff9f0a` | `#ffd60a` | Deadlines, reminders, assessment stage — **and the extension's orange "review" outline `#ff9f0a`**. |
| `--danger` | `#ff3b30` | `#ff453a` | Destructive actions, rejected stage, blockers. |
| `--purple` | `#af52de` | `#bf5af2` | Auto-Apply identity color (mapped to the Tailwind name `grape`). |
| `--shadow-card` / `--shadow-raised` | soft two-layer shadows | heavier in dark | Card elevation / hover elevation. |

`@theme inline` maps these onto Tailwind color names (`bg-surface`, `text-secondary`, `text-tertiary`, `bg-accent`, `bg-accent-soft`, `border-separator`, `text-success/warning/danger`, `text-grape`, `shadow-card`, `shadow-raised`) — components use semantic utilities, never raw hex. Font stack: `-apple-system, "SF Pro Text/Display", Helvetica Neue, Segoe UI, Roboto…`. Also global: `color-scheme` per theme, `::selection` in accent-soft, a **universal keyboard focus ring** (2px accent outline on every interactive element's `:focus-visible`), and two shared button classes `.btn-primary`/`.btn-secondary` (though most components inline equivalent utility stacks).

Dark mode: `.dark` class on `<html>`, toggled by `theme-toggle.tsx`, persisted in `localStorage.theme`, applied pre-paint by the inline script in `app/layout.tsx` (no flash), defaulting to `prefers-color-scheme`.

## Shared components

- **`ui.tsx`** — `PageHeader` (animated title/subtitle/actions), `Card` (the universal `rounded-2xl bg-surface p-5 shadow-card` container), `EmptyState`, `ModeBadge`.
- **`motion.tsx`** — `FadeIn` and `StaggerGrid` (motion/react): entrance-only, ≤8px travel, ≤0.25s, 0.03s stagger — deliberately cheap, no layout/exit animations.
- **`company-logo.tsx`** — favicon-in-rounded-square with letter-avatar fallback; job-board hosts short-circuit to the letter (§3.4.6).
- **`filter-bar.tsx`** — URL-state chip groups, collapsible on mobile with active-count badge.

## UI color conventions

- **Role badges** (`posting-card.tsx` `ROLE_COLORS`): SWE = accent blue · ML = purple/grape · Data = success green · Quant = warning orange · Other = neutral gray. Neutral chips for term/level/work-mode.
- **Mode badges** (`ui.tsx`): Manual = gray · Assisted = accent blue · Auto-Apply = **purple** (the purple identity carries through to the popup's purple "Auto-Apply now" button, `#8b5cf6`) · null = dashed-border "Mode not chosen".
- **Tracker stage dots** (`tracker-board.tsx` `STAGE_DOT`): Saved gray → In Progress accent → Applied green → Assessment orange → Interviewing purple → Offer green → Rejected red.
- **Extension outlines**: green `#34c759` = confidently filled from your data; orange `#ff9f0a` = found but needs your review — identical hues to the app's success/warning tokens, making the extension read as part of the same system.
- Warning-tinted pills for deadlines/due-reminders, `color-mix(in srgb, var(--token) N%, transparent)` for soft tinted backgrounds throughout.
- Popup/options pages replicate the palette in vanilla CSS (`#0071e3` buttons, `#34c759` status, `#6e6e73` secondary text, pill badges).

---

# 8. Build, deploy, and operations

## Local development

```sh
pnpm install
pnpm db:migrate        # drizzle-kit migrate against local Postgres (internship_tracker DB)
pnpm dev               # web :3000 (Turbopack) + worker, in parallel
```
- Env: copy `.env.example` → `apps/web/.env.local`; the worker reads the **root** `.env` (via `--env-file=../../.env` in its dev script). `AUTH_DISABLED=true` for pre-OAuth local work.
- Owner-machine quirks: pnpm lives at `~/Library/pnpm`; Postgres 17 via Homebrew (`/opt/homebrew/opt/postgresql@17/bin`); TZ America/New_York.
- `.claude/launch.json` lets Claude Code's preview start the web server.

## Migrations workflow (drizzle-kit)

1. Edit `packages/db/src/schema.ts`.
2. `pnpm db:generate` → new SQL file in `packages/db/migrations/` (+ meta snapshot).
3. `pnpm db:migrate` locally; in prod: `railway run --service web pnpm db:migrate`.
4. `pnpm db:studio` for a data browser. Migrations are append-only; jsonb-shape changes (e.g. Autofill v2's profile fields) need no migration.

## Railway topology

| Service | Root | Start | Key vars |
|---|---|---|---|
| **web** | monorepo, filtered | `pnpm --filter web build` / `pnpm --filter web start` | `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID/SECRET`, **`AUTH_URL`**, `ALLOWED_EMAIL`, `EXTENSION_TOKEN`, `ANTHROPIC_API_KEY`, `VAPID_PUBLIC_KEY`, `APP_URL`, `UPLOAD_DIR=/data/uploads` (+ volume at `/data`) |
| **worker** | monorepo, filtered | `pnpm --filter worker start` (tsx, no build) | `DATABASE_URL`, `APP_URL`, `VAPID_PUBLIC_KEY/PRIVATE_KEY`, `RESEND_API_KEY`, `NOTIFY_EMAIL_TO`, `ANTHROPIC_API_KEY`, `AUTH_GOOGLE_ID/SECRET` (P2-M2 Gmail token refresh — new requirement, not needed before this feature), `TWILIO_*` (pending) |
| **Postgres** | managed | — | referenced by both via `${{Postgres.DATABASE_URL}}`; also hosts the `graphile_worker` schema (the inter-service queue) |

Deploys trigger from pushes to GitHub `main`. The `/data` volume makes uploads/documents survive deploys; the DB carries everything else.

## The AUTH_URL-behind-proxy gotcha

Auth.js v5 normally infers its own origin from request headers. Behind Railway's reverse proxy this inference produced a wrong callback origin, breaking Google sign-in ("AUTH_URL needed explicitly behind Railway's proxy" — deployment note, 2026-07-02). Fix: set `AUTH_URL=https://web-production-64a44.up.railway.app` in the **web service's Railway variables**. It appears in no repo file (next-auth consumes it internally, aliased from `NEXTAUTH_URL`), so when rotating domains or reproducing the deploy, this is the variable most likely to be forgotten. Google's OAuth client must list the matching redirect URI `…/api/auth/callback/google`.

## Extension workflow

1. `chrome://extensions` → Developer mode → **Load unpacked** → select `apps/extension/`.
2. Extension options → App URL (prod domain, or `http://localhost:3000`) + the `EXTENSION_TOKEN` value.
3. After any extension code change (git pull included): hit ↻ on the extension card — unpacked extensions don't self-update. The popup shows its version (`v0.3.0`) in diagnostic states for confirming the reload took.
4. Version history 0.1.0 → 0.3.0: see the table in §3.6.

## Operational behaviors worth knowing

- Adding a source triggers a **silent backfill** on its first poll (no notification storm); expect the postings count to jump within a minute.
- Source failures don't stop other sources and surface as red `lastError` text in Settings.
- Push subscriptions self-heal: dead endpoints (404/410) are deleted on next send.
- All three notification channels no-op gracefully with a `(unconfigured) would send:` log line when their env vars are absent — safe to run with any subset configured.
- The worker exits on fatal startup errors; Railway restarts it.

---

# 9. Known limitations & roadmap

## Limitations visible in the code

1. **Heuristic tagging only; the Haiku upgrade path is unused.** `packages/shared/src/tagging.ts` bills itself as "the fallback when Claude tagging is unavailable," but no Claude posting-tagger exists — role/level/location classification is pure regex (with the quant-title-only asymmetry noted in §3.2). Sponsorship is only known for SimplifyJobs-style listings. `resumes.parsed` (Haiku-extracted structure) is stored but not yet fed into `profile.data` for auto-fill enrichment.
2. **Packet URL matching is heuristic on shared ATS domains.** `/api/assist/packet` matches by URL-prefix then bare hostname, ordered by `updatedAt desc` — two tracked applications on `boards.greenhouse.io` resolve to whichever was touched most recently. Fine for one-at-a-time applying; wrong-match risk grows with parallel applications on one ATS domain.
3. **Auto-apply submission is optimistic.** `content.js` clicks submit and waits a fixed 2500ms; there is no verification the ATS accepted the form (no success-page detection). A rejected/erroring submission could still be reported `submitted` (receipt fires, stage moves to applied).
4. **Favicon-based logos.** Google's favicon service + letter fallback; ATS-hosted postings can't derive the employer domain and always get letters; some real domains serve blank globes (mitigated by `onError` fallback).
5. **`notification_log` records successes only** — failed channel sends leave no DB trace (console logs only), so delivery debugging relies on Railway logs.
6. **Workday polling is comparatively expensive** — POST endpoint, no conditional-request support (full fetch every minute), limit 20, `searchText` default "intern" pre-filters server-side.
7. **Extension token in `chrome.storage.sync`** — synced across the user's signed-in Chrome profile rather than kept device-local. Accepted for a single-user threat model.
8. **README-table parsing depends on the community-standard column order** (Company | Role | Location | Link | Age) and the default branch name `dev` — repos deviating from the SimplifyJobs conventions need explicit config.
9. **Minor code inconsistencies:** `enqueueConfirmation` in `actions/settings.ts` is exported but unreferenced (the live path is `onApplied`); `.env.example` omits `EXTENSION_TOKEN`, `GDRIVE_REFRESH_TOKEN`, `RESEND_FROM`, `APP_URL`, `UPLOAD_DIR`, `AUTH_URL`; `GITHUB_TOKEN` and all four `R2_*` vars are declared but read by nothing (the R2 storage backend was planned in `lib/storage.ts`'s docstring and superseded by the Railway volume); `apps/web/pnpm-workspace.yaml` is a stray tool artifact, not a workspace root; `apps/web/README.md` is untouched create-next-app boilerplate. The ingest suppression key-set is rebuilt per source per tick (uncached — trivial at single-user scale).
10. **The applied-suppression set includes every application regardless of stage** (the code comment says "any stage past 'saved'" but the query selects all applications — even `saved` ones suppress matching new postings from notifying). Behaviorally this means tracking a role hides its reposts immediately, which is arguably intended but diverges from the comment.
11. **A digest slot's send is stamped *before* it's confirmed sent.** `send-digest.ts` writes `settings.last_digest_sent_at = now()` immediately on entering a due slot, specifically to prevent a slow send from double-firing on the next 5-minute tick — but the trade-off is that a mid-send crash (e.g. the worker restarts between the stamp and `deliver()` completing) would skip that slot's digest entirely rather than retry it on the next tick. Accepted for a single-user, at-most-daily-impact tool.
12. **README column-map repos need one-time manual verification.** `sources/github.ts`'s `columns` config (per-source override for non-standard README tables) has no auto-detection — adding a new repo whose table layout differs from the community standard still requires reading its README and hand-writing the `company=N,role=N,location=N,link=N` string; a wrong guess silently yields empty/garbled postings rather than an error, since malformed cells for a given company are simply dropped (a row must have both company and role and a link to be kept).
13. **Screenshot Intake never verifies the extracted URL is real** — `screenshot-extract.ts`'s prompt asks Haiku not to fabricate a URL, but nothing checks that a URL it *does* report actually resolves; a partially-legible or OCR-mangled URL could be saved as-is (the user reviews every field before confirming, which is the actual safety net here, not code validation).
14. **Interview prep and Resume Studio's chat share the same anti-fabrication instruction pattern** (never invent facts/links not present in the input) but neither is code-enforced beyond the prompt — both rely entirely on the model following instructions, same as `drafting.ts` and `match-option`.

## Roadmap (per the project plan recorded in commit history and memory notes)

- **Phase 2 — fully shipped.**
  - **P2-M1 Full Auto-Apply** shipped 2026-07-03, extension 0.2.0–0.3.0, with a **master kill switch** — `settings.auto_apply_enabled`, default off — added later as an additional safety gate on top of per-application opt-in; enforced authoritatively in `api/assist/packet/route.ts`.
  - **P2-M2 Gmail status monitoring** shipped — opt-in, read-**metadata**-only (From/Subject/Gmail's own short snippet — never the full body), a separate OAuth consent flow from sign-in, Haiku classification gated to high-confidence matches only, forward-only stage transitions (rejection excepted), never persists email content — only the classification's consequence. §5j / `apps/worker/src/{gmail-client,tasks/sync-gmail-status}.ts` / `apps/web/src/app/api/gmail/*`. This also unlocks the LinkedIn-email-alert ingestion route below, whose plumbing this feature already built.
  - **P2-M3 Interview & skill-prep recommendations** shipped — `lib/interview-prep.ts`, `components/prep-panel.tsx`, LeetCode/NeetCode 150 links, §5h.
- **Phase 3:**
  - **Analytics dashboard shipped** — `app/(app)/analytics/page.tsx`: pipeline funnel, automation mode split, recommendation-vs-choice accuracy (overall + per-ATS), notification activity, source health — all read-only aggregates of existing tables, no new data collection.
  - **Visa-sponsorship filter UI refinement** — still only the original filter chip; no richer surfacing yet.
  - **Data export** — not started.
  - **Digest smart-ranking** — the digest is now genuinely a *scheduled* batch (twice daily, configurable hours) rather than a quiet-hours artifact, but still lists postings in queue order, not ranked by fit.
- **Source expansion / discovery breadth** — three concrete pieces landed this cycle: the **per-source README column-map parser** (`sources/github.ts` `columns` config) so non-standard repos (e.g. speedyapply-style link columns, jobright-ai-style link-in-title-cell layouts) can be onboarded without code changes; **Screenshot Intake** (`/intake`) as the compliant, zero-ToS-risk route for sources that only ever post as an image (the original zero2sudo-Instagram-stories use case) — a vision model (Haiku) extracts the posting, the user reviews every field, and confirmation runs the same normalize/dedupe/tag pipeline as a polled ingest; and **Gmail status monitoring** (P2-M2, above), which also builds the exact plumbing LinkedIn ingestion needs. **LinkedIn Jobs ingestion itself still has no code written** — no individual API access (partner-gated), so the plan is LinkedIn's own email job-alerts read through the same Gmail-sync mechanism (a saved-search alert is just another classifiable email); this is now an "add a classification path," not "build Gmail access from scratch."
- **Notification model overhaul shipped** — twice-daily email digest at configurable hours (default 8am/5pm) replacing the original "one digest after quiet hours ends" design, a Simplify-style HTML template (`apps/worker/src/email-template.ts`) for both the digest and instant alerts, and a per-company **instant watchlist** that bypasses both the digest and quiet hours. Quiet hours now govern push/SMS only.
- **Resume Studio preview-before-apply shipped** — a chat-proposed LaTeX change can now be compiled and previewed in an iframe before being applied to the editor or the persisted resume (§5i), on top of the pre-existing LaTeX editor + Tectonic compile + Sonnet chat + save-as-resume-version flow.
- **Deferred ideas visible in code:** R2 storage backend behind `lib/storage.ts`; Claude-based posting tagging as the upgrade over regexes; recommendation of `auto` mode once a per-portal reliability track record exists (`lib/recommendation.ts` explicitly waits for this); resume-parse → profile enrichment ("will enrich them automatically once the Claude API key is set up" per the Profile UI copy).
