# CODEBASE.md — Internship Tracker & Auto-Apply Assistant

> **What this file is.** An exhaustive, file-level reference for the entire repository, written to be fed to AI models (and humans) answering questions about this project with zero prior context. It complements the higher-level `docs/PROJECT_DOCUMENTATION.pdf`; this document goes deeper — every source file, every table, every flow, every environment variable. Everything described here was verified by reading the actual code as of commit `cbf138c` (2026-07-03).
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

1. **Discovers** new SWE/ML/CS internship postings in near-real-time by polling community GitHub repos (SimplifyJobs, vanshb03), ATS boards (Greenhouse, Lever, SmartRecruiters, Workday), and RSS/Atom feeds — every minute, with conditional HTTP requests so unchanged sources cost almost nothing.
2. **Deduplicates and tags** postings across sources (one card per company+role+location, keyword-classified into SWE/ML/Data/Quant, internship vs new-grad, remote/hybrid/onsite, season/year terms, visa sponsorship).
3. **Notifies instantly** via web push + email (+ SMS if explicitly enabled), or batches overnight matches into a **morning digest** during quiet hours (default 11 PM–7 AM).
4. **Tracks applications** through a seven-stage Kanban pipeline (Saved → In Progress → Applied → Assessment/OA → Interviewing → Offer → Rejected) with per-application reminders/OA deadlines.
5. **Assists applications** at three explicit, per-application automation levels (below), including LLM-drafted cover letters and short answers in the user's own voice (few-shot from their writing samples), PDF generation, organized document storage (in-app / local download / Google Drive), and browser-side form auto-fill through a companion Chrome extension.

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

---

# 2. Repo map

pnpm workspace monorepo (`pnpm-workspace.yaml`: `apps/*` + `packages/*`), Node ≥ 22, pnpm 10.18.3.

| Path | What it is |
|---|---|
| **`apps/web/`** | Next.js 16 (App Router, Turbopack, React 19, Tailwind v4) application: all UI pages, server actions, API routes (including the token-authed `/api/assist/*` routes the extension talks to), NextAuth v5 Google sign-in, the PWA push service worker, and all server-side libraries (drafting, PDF rendering, storage, recommendation engine, resume parsing). Runs as the Railway "web" service. |
| **`apps/worker/`** | Always-on Node service built on **graphile-worker** (Postgres-backed job queue + cron). Hosts the source pollers, the ingest pipeline (normalize → dedupe → tag → suppress → store → notify), the three notification channels (web push, Resend email, Twilio SMS), quiet-hours digest, reminders, auto-archive, and the on-demand confirmation/blocker jobs. Runs as the Railway "worker" service. Executed directly with `tsx` — never compiled. |
| **`apps/extension/`** | Chrome Manifest V3 extension ("Internship Tracker Assist", v0.3.0). Plain JS, no build step, loaded unpacked. Popup + options page + an on-demand-injected content script that fills forms. Implements Agentic Assist filling and Full Auto-Apply submission. No background service worker; no static `content_scripts` registration. |
| **`packages/db/`** | Drizzle ORM schema (`src/schema.ts`), the Postgres client singleton, drizzle-kit migrations in `migrations/`, and re-exported query operators. Consumed by both web and worker via workspace protocol (`@tracker/db`), imported directly as TypeScript source (`main: ./src/index.ts` — no build). |
| **`packages/shared/`** | Dependency-free shared TypeScript (`@tracker/shared`): type aliases mirroring DB enums, `NormalizedPosting`, normalization + FNV-1a dedupe hashing, keyword tagging/classification regexes, notification-rule evaluation, and quiet-hours math. Imported by web, worker (and its hash is portable to the extension by design). |
| **`packages/db/migrations/`** | Five generated SQL migrations, 0000–0004 (see §4). `migrations/meta/` is drizzle-kit bookkeeping (excluded from this doc). |
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
- **`inQuietHours(now, timezone, startHour, endHour)`** — gets the current hour *in the user's timezone* via `Intl.DateTimeFormat(..., {hour: "numeric", hour12: false, timeZone})`. Handles both windows: non-wrapping (`start <= end` → `hour ∈ [start, end)`) and midnight-wrapping (`23 → 7` → `hour >= 23 || hour < 7`).

Called by: `apps/worker/src/notify.ts` (both functions) and `apps/worker/src/tasks/send-digest.ts` (`inQuietHours`).

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

There is no 0005 — Autofill v2 and semantic option matching (extension v0.2.1/0.3.0) were code-only changes; the application-answer fields live inside the schemaless `profile.data` jsonb.

---

## 3.4 apps/web

Next.js 16.2.10, React 19.2.4, next-auth 5.0.0-beta.31, Tailwind v4, `motion` 12.x, `lucide-react` icons, `@anthropic-ai/sdk`, `pdf-lib`. All pages set `export const dynamic = "force-dynamic"` (every render hits the DB — no caching for a single-user dashboard).

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
- **`updateSettings(update)`** — single-row upsert on the constant `id: true` primary key; revalidates `/settings` and `/internships` (the latter because `includeNewGrad` changes the default listing filter).
- **`enqueueConfirmation(applicationId)`** — SQL `add_job('send_confirmation', ...)`. Its comment says "Used by tracker stage changes" but nothing currently imports it — the live path is `onApplied()` in `applied-side-effects.ts`. Dead-but-harmless export (see §9).

#### `actions/sources.ts`
- `KIND_CONFIG_FIELDS` — the per-kind config field whitelist (github_repo: repo/branch/listingsPath; greenhouse: boardToken; lever: site; smartrecruiters: company; workday: host/tenant/site/searchText; rss + instagram_mirror: feedUrl/defaultCompany).
- **`addSource(formData)`** — builds the `config` jsonb from only whitelisted, non-empty fields.
- **`toggleSource` / `deleteSource`** — enable/disable/remove.
- **`addPresetSource(preset)`** — one-click presets for `"simplify"` (SimplifyJobs/Summer2026-Internships, branch `dev`, `.github/scripts/listings.json`) and `"vanshb03"` (Summer2027-Internships, same layout). These are the two production sources.

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
4. On match, resolves the latest `cover_letter` document for the application and the effective resume, and returns:
```json
{
  "match": {
    "applicationId": 12,
    "company": "…", "roleTitle": "…",
    "mode": "assist" | "manual" | "auto" | null,
    "drafts": { "coverLetter": "…", "answers": [{"prompt": "…", "answer": "…"}] },
    "autoApply": { "approved": true|false },       // !!autoApplyApprovedAt
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

#### `api/push/subscribe/route.ts`
Session-guarded. `POST` — validates `{endpoint, keys:{p256dh, auth}}` and upserts into `push_subscriptions` (`onConflictDoNothing` on the unique endpoint — re-subscribing is idempotent). `DELETE` — removes by endpoint. Multi-device by design: every row receives every push.

### 3.4.5 Pages (`src/app/`)

#### `app/layout.tsx` (root layout)
Imports `globals.css`; metadata title template `"%s — Internships"`; theme-color viewport meta per color scheme. Injects a **blocking inline script before first paint** that applies the stored theme (`localStorage.theme`, falling back to `prefers-color-scheme`) by toggling the `dark` class on `<html>` — the standard anti-flash pattern (with `suppressHydrationWarning` on `<html>` since the class differs from server output).

#### `app/signin/page.tsx`
Centered card with a "Continue with Google" button — an inline server action calling `signIn("google", {redirectTo: "/"})`. Notes "Single-user app — only the owner can sign in."

#### `app/(app)/layout.tsx`
The authenticated app shell: `<Sidebar/>` + `<main>` with `md:ml-60` offset and a `max-w-6xl` content column.

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
Loads the posting, resolves `seenIn` source ids to source names, and checks whether it's already tracked. Header: logo, title, meta line (role/mode/locations/found-ago/deadline), Save (bookmark) form, **Track** button (inline server action → `trackPosting`) or "In tracker" link, and the external Apply link. Body: description card (or "source doesn't include a description"), My-notes card (server-action form), and the "Seen in" card listing each reporting source with its first-seen time — the visible face of cross-source dedupe.

#### `app/(app)/tracker/page.tsx` — Kanban board
Loads all applications + open reminders; builds `TrackerCard[]` where `dueSoon` is the application's undone reminders due within 7 days (soonest first). Renders the "Add application by link" `<details>` form (URL required; company/role "auto-detected if blank" → `addManualApplication`) and `<TrackerBoard/>`. Subtitle states the product rule: "Every application, its stage, and its automation mode — always explicit."

#### `app/(app)/tracker/[id]/page.tsx` — application detail
The mode-selection and assist workspace page.

- **Computes and persists the recommendation once**: if `modeRecommendation` is absent, calls `recommendMode(id)` and stores the result on the row (so signals/reasons are stable per application and `mode_decisions` can reference them).
- Loads reminders, all resumes (id+name), the linked posting (for its description), and the profile.
- Left column: posting description card; then `AssistPanel` **only when `mode === "assist"`** — manual mode gets "you're handling this one yourself", no-mode gets a nudge to choose Assist.
- Right column: `ApplicationEditor` with everything it needs, including the `autoApply` bundle (`profile.data`, `applications.drafts`, resume display name) that powers the pre-submit preview.

#### `app/(app)/documents/page.tsx`
Flat list of the `documents` table (left-joined to applications, newest first, limit 200): kind label, company/role with logo, destination label (In-app/Local/Google Drive), the storage key (which *is* the folder path), created-ago, a link to the owning application, and a `/api/documents/{id}/download` link.

#### `app/(app)/archive/page.tsx`
Lists non-active postings (limit 300, newest first) with the reason derived from status: `expired` → "Deadline passed", `hidden` → "Hidden (already applied)". This is where auto-archived and repost-hidden postings surface.

#### `app/(app)/profile/page.tsx`
Three cards: `ResumeManager` (uploads list + default star + delete + upload form; shows "parsing activates once the Claude API key is configured" for unparsed rows), `ProfileForm` (the auto-fill field map), `WritingSamples` (two-column sample sets).

#### `app/(app)/settings/page.tsx`
Three cards: `SourcesManager` (with preset buttons shown only until any github_repo source exists), `NotificationSettings` (receives `VAPID_PUBLIC_KEY` from server env — null disables the push-enable button with an explanatory hint), `StorageSettings` (receives `driveConfigured()`).

### 3.4.6 Components (`src/components/`)

#### `ui.tsx`
The tiny shared kit: `PageHeader` (title/subtitle/actions wrapped in `FadeIn`), `Card` (`rounded-2xl bg-surface p-5 shadow-card`), `EmptyState` (icon/title/hint card), and **`ModeBadge`** — the visual enforcement of "mode must be unambiguous everywhere": null → dashed-border "Mode not chosen" pill; manual → neutral gray; assist → accent blue on `accent-soft`; auto → purple (`--purple` at 14% mix, text `grape`).

#### `motion.tsx`
"Cheap entrance animations. Fades + a few px of travel only — no layout animations, no exit transitions." `FadeIn` (opacity 0→1, y 6→0, 0.25s ease-out, optional delay) and `StaggerGrid` (children stagger at 0.03s, 0.22s each). Client components wrapping server-rendered content; used by PageHeader, dashboard grids, and both posting grids.

#### `company-logo.tsx`
Client component; exports `domainFromUrl` + `CompanyLogo`. Derives a company domain from the posting/application URL, **unless** the host is on the `JOB_BOARD_HOSTS` list (greenhouse, lever, ashby, workday, icims, smartrecruiters, workable, bamboohr, jobvite, taleo, successfactors, linkedin, indeed, google, notion, airtable — matched as exact host or subdomain) — job-board hosts don't identify the employer, so those fall back immediately. With a domain, renders `https://www.google.com/s2/favicons?domain=<d>&sz=64` in a bordered rounded square (plain `<img>` to avoid next/image remote-domain config); `onError` swaps to the fallback **letter avatar** (first letter of company on `accent-soft`). Three sizes (sm 32 / md 40 / lg 48). This favicon approach is a deliberate zero-cost choice with known blank-globe misses (§9).

#### `filter-bar.tsx`
Stateless-URL filter chips. `buildLink` reconstructs the querystring from the whitelist `FILTER_KEYS`, toggling one key (clicking an active chip removes it — every chip's href is precomputed, so filtering is pure navigation, SSR-friendly, no client state). Groups render as labeled rows; a "More" row hosts the level toggle (only when new-grad inclusion is on), Saved, and sort chips, plus "Clear all (N)". On mobile (`< md`) the whole bar collapses behind a "Filters" button with an active-count badge; on desktop it's always expanded.

#### `posting-card.tsx`
The internships-grid card. Whole card is a `role="link"` div navigating to the detail page (keyboard accessible); the bookmark button and external Apply link `stopPropagation`. Shows logo, company, 2-line-clamped title, the **role-type badge with per-role colors** (`ROLE_COLORS`: swe = accent blue, ml = purple/grape, data = success green, quant = warning orange, other = neutral), neutral chips for first term + New Grad + work mode, first location (+N), found-ago + "· N sources" when deduped from multiple, a warning-tinted deadline pill, and an Apply link revealed on hover.

#### `tracker-board.tsx`
Exports `STAGES` (the canonical ordered stage list + labels — also imported by ApplicationEditor for its stage dropdown), `Stage` type, `TrackerCard`, `TrackerBoard`. Kanban of 7 fixed columns (260px, horizontal scroll); column headers carry a **stage-colored dot** (`STAGE_DOT`: saved gray, in_progress accent, applied success, assessment warning, interviewing grape, offer success, rejected danger) and a count pill. Cards show logo, company, role, `ModeBadge`, applied/created time, a warning pill for the nearest due-soon reminder, and **chevron buttons that move the card one stage left/right** (`updateStage` in a transition; card dims while pending). No drag-and-drop — deliberate simplicity.

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

#### `notification-settings.tsx`
Client settings panel with optimistic local state; every change immediately persists via `updateSettings` (no save button).
- **Push on this device**: feature-detects service worker + PushManager; states: unsupported / denied / off / on. Enable → registers `/sw.js`, requests permission, `pushManager.subscribe({userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY})`, POSTs the subscription JSON to `/api/push/subscribe`. Without a VAPID key the button is absent and the hint says to add keys to the server env.
- **Channel toggles** (iOS-style switch buttons): push, email, and SMS — SMS carries the explicit opt-in warning note (rule #6).
- **Quiet hours**: start/end hour dropdowns (12-hour labels) + free-text timezone input (IANA name, saved on blur).
- **Scope + rules**: include-new-grad toggle; role-type multi-select chips and work-mode chips ("None selected = all"); exclude-companies comma-separated text input — all mapping 1:1 onto `NotificationRules`.

#### `profile-manager.tsx`
Two exports. `ResumeManager` — list with Default badge, make-default star, delete, and the upload form (file ≤10MB `.pdf/.doc/.docx` + optional label). `ProfileForm` — the auto-fill field map, in two sections that mirror the extension's two rule tables exactly:
- `PROFILE_FIELDS` (12 keys): fullName, email, phone, location, linkedin, github, website, school, degree, gradDate, gpa, workAuth → matched by content.js's `RULES` for text inputs.
- `APPLICATION_ANSWER_FIELDS` (10 keys, added in Autofill v2): pronouns, requiresSponsorship (Yes/No select), authorizedToWork (select), currentlyEnrolled (select), willingToRelocate (select), gender, raceEthnicity, veteranStatus, disabilityStatus, howDidYouHear → matched by content.js's `ANSWER_RULES` for radio/checkbox/select groups. Caption: "Demographic fields are optional — leave blank to always answer those yourself" (an empty profile value disables the corresponding rule entirely, since rules require a truthy value).
Everything saves via `saveProfile` into the single `profile.data` jsonb.

#### `sidebar.tsx`
Desktop: fixed 240px sidebar (translucent `--sidebar` + backdrop-blur) with logo mark, 7 nav links (Dashboard, Internships, Tracker, Documents, Profile, Archive, Settings; active = `accent-soft` pill; Dashboard active only on exact `/`), ThemeToggle at bottom. Mobile: sticky top bar + horizontally scrolling pill nav.

#### `sources-manager.tsx`
Sources list with kind label, last-polled time, and `lastError` surfaced in danger color with an alert icon (poller failures are user-visible); enabled switch; delete. Preset buttons (+SimplifyJobs, +vanshb03) shown only when `hasPresets` is false. The add form renders kind-specific fields from `KIND_FIELDS` (mirroring the server-side whitelist) with realistic placeholders (e.g. Workday host `nvidia.wd5.myworkdayjobs.com`).

#### `storage-settings.tsx`
Three radio-style option cards (inapp / local / gdrive) with descriptions; gdrive shows "(not connected yet)" when `driveConnected` is false — selecting it anyway is allowed (saves fall back with `driveError`, keeping the in-app copy). Persists immediately via `updateStorageDestination`.

#### `theme-toggle.tsx`
Toggles the `dark` class on `<html>` and writes `localStorage.theme`. Initial icon state read in an effect (null before hydration to avoid mismatch with the pre-paint script in the root layout).

#### `writing-samples.tsx`
Two `SampleSet` columns (cover letters / short answers — "a separate voice from cover letters"). Each sample is a `<details>` with title + char count, expandable full text, delete; add form (title + textarea).

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
- `getSettings()` — the settings row or hard defaults (America/New_York, 23→7, push+email on / sms off, includeNewGrad false).
- `deliver(msg: {title, body, url, kind, postingId?, applicationId?})` — fans out to each **enabled** channel (push → `sendPush`, email → simple HTML with an "Open in Internships" link, sms → title+body+url text) and inserts one `notification_log` row **per successful channel** (failed sends leave no log record — a known observability gap, §9).
- `onNewPosting(postingId)` — the new-posting entry point: bail if not active; `passesNotificationRules` gate (rules + new-grad setting); **`inQuietHours` → insert into `digest_queue` and stop**; else instant `deliver` "{company} — new internship" linking `/internships/{id}`.
- `onSubmissionConfirmed(applicationId)` — "Application submitted ✓ · {company} — {roleTitle}" (kind `confirmation`) linking `/tracker`.

### `src/channels/push.ts`
Web Push via the `web-push` lib. Lazy one-time VAPID configuration (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`, subject `mailto:NOTIFY_EMAIL_TO`); unconfigured → logs `[push] (unconfigured) would send: …` and returns false (all three channels share this dry-run-when-unconfigured pattern, which made local testing possible before any keys existed). Sends the JSON payload to **every** `push_subscriptions` row; on 404/410 (expired/revoked) **deletes that subscription row** (self-cleaning); other errors log and continue. Returns true if ≥1 delivery succeeded.

### `src/channels/email.ts`
Resend REST API via plain `fetch` ("keeps the dependency footprint down" — no SDK). Requires `RESEND_API_KEY` + `NOTIFY_EMAIL_TO`; sender `RESEND_FROM ?? "Internships <onboarding@resend.dev>"`. Non-OK → log + false. No retries.

### `src/channels/sms.ts`
Twilio REST via `fetch`: Basic auth (base64 `sid:token`), form-encoded POST to `/2010-04-01/Accounts/{sid}/Messages.json`. Requires all of `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `NOTIFY_SMS_TO`.

### `src/sources/http.ts`
`conditionalFetch(url, prevCache, init?)` — the polling economics. Sets user-agent `internship-tracker (personal job-search tool)`; sends `If-None-Match`/`If-Modified-Since` from the source's stored `httpCache {etag, lastModified}`; **304 → `{status: 304, notModified: true}`** (near-zero cost — "this is what lets us poll every minute without hammering anyone"); otherwise captures fresh cache headers, throws on non-OK, returns `{status, notModified: false, body, cache}`.

### `src/sources/github.ts`
Config `{repo, branch? = "dev", listingsPath?}`; fetches from `raw.githubusercontent.com/{repo}/{branch}/…`. Two parse modes:
- **`listingsPath` set** (the SimplifyJobs/vanshb03 path — `.github/scripts/listings.json`): parse the JSON array; keep rows with `active !== false && is_visible !== false` and company+title; url from `url || application_link` (rows without either are dropped); `postedAt` from unix `date_posted`; `terms` passthrough; `raw` carries `{sponsorship: mapSponsorship(...), listing: <full row>}` where `mapSponsorship`: `/offers sponsorship/i` → `sponsors`, `/citizenship|does not offer/i` → `citizens_only`, else `unknown` — this is the **only** source of sponsorship data in the system.
- **README fallback** for repos without a listings file: parse the community-standard markdown table (`| Company | Role | Location | Link | Age |`): skips separator/header rows; strips bold/links/HTML from cells; **"↳" (or empty) company cells inherit the company from the row above**; link extracted from either an HTML anchor or a markdown link; rows containing 🔒 (closed) skipped; locations split on `<br>` or commas-not-inside-parentheses.

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
The quiet-hours digest flush: return immediately if still inside quiet hours; load `digest_queue` rows with `sentAt IS NULL`; fetch their postings and keep only still-`active` ones (postings that expired or were hidden overnight silently drop out); if any remain, one `deliver` of kind `digest`: "N new internships overnight" with a bullet list capped at 15 + "…and N more", linking `/internships`. Then **mark every queued row sent** (including the filtered-out ones — no retry loop for stale entries). Net behavior: the digest arrives within 5 minutes of the quiet-hours window ending.

### `src/tasks/send-reminders.ts` — job `send_reminders` (cron: every 5 min)
Joins reminders × applications where `done = false AND notifiedAt IS NULL AND dueAt < now()`; delivers each as kind `instant` ("Reminder: {label}" / "{company} — {roleTitle}") linking `/tracker/{applicationId}`; stamps `notifiedAt` (exactly-once per reminder).

### `src/tasks/auto-archive.ts` — job `auto_archive` (cron: hourly at :13)
`UPDATE postings SET status='expired' WHERE status='active' AND deadline < now()`. Postings without a stated deadline never auto-expire (most sources don't provide deadlines). Expired postings appear in `/archive`.

### `src/tasks/send-confirmation.ts` — job `send_confirmation` (enqueue-only)
Payload `{applicationId}` → `onSubmissionConfirmed`. Enqueued from the web app (see §4).

### `src/tasks/send-blocker-notice.ts` — job `send_blocker_notice` (enqueue-only)
Payload `{applicationId, detail?}` → `deliver` kind `blocker`: "Auto-apply blocked — needs you" / "{company} — {roleTitle}: {detail ?? 'CAPTCHA or bot-check'}. Finish this one manually." linking `/tracker/{applicationId}`. Enqueued by `/api/assist/report` at the third blocked report.

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
| `auto_apply_approved_at` | timestamptz? (migration 0004) | *"Set only via the explicit per-application auto-apply opt-in; cleared on any mode change away from 'auto'."* The packet exposes it as `autoApply.approved`. |
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
`id` boolean PK true; `timezone` (default America/New_York — was LA in migration 0000, fixed in 0002); `quiet_hours_start` 23 / `quiet_hours_end` 7; `channels` jsonb default `{push: true, email: true, sms: false}` (**SMS off by default** — rule #6); `include_new_grad` false (gates both notifications and the default listing view); `notification_rules` jsonb `{}` (shape `NotificationRules`; default was erroneously `[]` in 0000, fixed in 0001); `storage_destination` default inapp; `updated_at`.

### `push_subscriptions`
`id`, `endpoint` (**unique** — subscribe is idempotent), `keys` jsonb `{p256dh, auth}`, `created_at`. One row per browser/device; push fans out to all; 404/410 responses self-delete the row.

### `notification_log`
`id`, `posting_id?` / `application_id?` (set-null FKs), `channel`, `kind`, `payload` jsonb (title/body/url), `sent_at`. **One row per successful channel delivery**; failures are not logged (§9).

### `digest_queue`
`id`, `posting_id` (FK cascade), `queued_at`, `sent_at?`. Populated by `onNewPosting` during quiet hours; flushed (marked sent) by `send_digest` after the window ends.

### `mode_decisions` — recommendation-vs-choice history
`id`, `application_id` (FK cascade), `recommended`, `chosen`, `signals` jsonb (the recommendation's `{ats, atsTier, deadline}`), `decided_at`. Written by `setApplicationMode` and `approveAutoApply`; read by `recommendMode` to learn per-ATS override patterns (≥2 overrides on an ATS → follow the user).

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

## (a) Posting discovered → deduped/tagged → notified instantly or digested

1. **Cron tick** (`apps/worker/src/index.ts`, `* * * * *`) runs `poll_sources`.
2. `tasks/poll-sources.ts` iterates enabled `sources`; each kind dispatches to its poller (`sources/github.ts`, `sources/ats.ts`, `sources/rss.ts`), all built on `sources/http.ts` `conditionalFetch` — unchanged sources return 304 and contribute zero postings.
3. Poller output (`NormalizedPosting[]`) → `ingest.ts ingestPostings()`:
   - `isRelevantRole` gate (`packages/shared/src/tagging.ts`) drops non-CS titles;
   - `dedupeHash` (`packages/shared/src/index.ts`) — an existing hash appends to `seenIn` and stops (never re-notifies);
   - applied-role suppression (normalized company|title vs all applications) inserts as `hidden` silently;
   - insert with classifier fallbacks (`classifyRole/Level/LocationMode`, `extractTerms`, sponsorship from SimplifyJobs raw);
   - new + not suppressed + not first-poll-backfill → `notify.ts onNewPosting(id)`.
4. `onNewPosting`: `passesNotificationRules` (`packages/shared/src/rules.ts` — new-grad gate, role/mode/company/keyword rules) →
   - **inside quiet hours** (`inQuietHours` in the user's timezone): insert into `digest_queue`, done (see flow f);
   - **otherwise**: `deliver()` fans out to enabled channels — `channels/push.ts` (all subscriptions; payload rendered by `apps/web/public/sw.js` with a View action deep-linking `/internships/{id}`), `channels/email.ts` (Resend), `channels/sms.ts` (Twilio if opted in) — logging each success to `notification_log`.

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
2. **Extension**: packet now returns `mode: "auto"`, `autoApply.approved: true` → purple "Auto-Apply now" ("This will fill AND submit — no final click. Blockers stop it safely.").
3. **Attempt loop** (popup): up to 3 attempts, 0/5/15s backoff with countdown. Each attempt: inject → `__trackerAutoApply` → **blocker check before touching the form** (recaptcha/hcaptcha/turnstile/Cloudflare selectors + "verify you are human" text) → fill → `pending` outcome hands control back for Haiku resolution → required-still-unresolved ⇒ `incomplete` (no submit; orange highlights; popup says "downgraded to Assist behavior") → else `__trackerFinishAutoApply` re-checks blockers and the `__trackerUnresolvedRequired` gate, clicks the located submit control, waits 2500ms, reports `submitted`.
4. **Report** (`POST /api/assist/report`, `api/assist/report/route.ts`):
   - `submitted` → stage `applied` + `appliedAt` + `onApplied()` → **receipt path**: SQL `add_job('send_confirmation')` → worker `send-confirmation.ts` → `onSubmissionConfirmed` → "Application submitted ✓" on all channels; plus repost hiding of matching active postings.
   - `blocked` → `blocker_retries++`; **at 3** → SQL `add_job('send_blocker_notice')` → worker `send-blocker-notice.ts` → "Auto-apply blocked — needs you … Finish this one manually." deep-linking `/tracker/{id}`; the application also appears in the dashboard's Needs-attention panel (`blockerRetries >= 3` query).
   - `failed` → no state change.

## (e) Reminder → notification

1. User adds "HackerRank OA due" + a `datetime-local` on `/tracker/{id}` (`ApplicationEditor` → `addReminder`).
2. Worker cron `send_reminders` (every 5 min) selects `done = false AND notified_at IS NULL AND due_at < now()` joined to applications, delivers "Reminder: {label} / {company} — {roleTitle}" (kind `instant`) linking `/tracker/{applicationId}`, and stamps `notified_at` — exactly one notification per reminder, ever.
3. Overdue-and-undone reminders additionally surface in the dashboard Needs-attention panel until checked off.

## (f) Quiet-hours digest

1. During quiet hours (default 23:00–07:00 in `settings.timezone`, window may wrap midnight), `onNewPosting` diverts each rule-passing posting into `digest_queue` instead of delivering.
2. Every 5 minutes `send_digest` checks `inQuietHours`; the first tick **after** the window ends (≤5 min lag) collects all unsent queue rows, drops postings no longer active, and sends one kind-`digest` message: "N new internships overnight" + up to 15 bullets ("• Company — Title (Location)") + "…and N more", linking `/internships`.
3. All queued rows are marked sent regardless (stale entries never retry). Quiet hours affect **only** instant posting alerts — confirmations, blockers, and reminders deliver whenever they occur.

---

# 6. External services & environment variables

Dev values live in git-ignored `apps/web/.env.local` (web, read by Next) and root `.env` (worker, via `--env-file`); production values live in **Railway service variables** (per service). `.env.example` is the documented template.

| Variable | In `.env.example`? | Read by | Purpose |
|---|---|---|---|
| `DATABASE_URL` | ✔ | `packages/db/src/client.ts`, `drizzle.config.ts`, `apps/worker/src/index.ts` | Postgres connection. Both Railway services reference the Postgres service (`${{Postgres.DATABASE_URL}}`). Local default `postgres://localhost:5432/internship_tracker`. |
| `AUTH_SECRET` | ✔ | next-auth (implicit) | JWT session signing. `openssl rand -base64 32`. Web only. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | ✔ | next-auth Google provider (implicit env convention) | OAuth client from console.cloud.google.com; redirect URIs registered for prod domain + localhost. |
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
| `RAILPACK_*` | ✘ | Railway build system | Railpack (Railway's builder) configuration variables set in the Railway dashboard, not in repo code — used to pin the Node/pnpm build behavior for the two services. No source file reads them; they exist only at the platform layer alongside Railway's auto-injected `RAILWAY_*` vars. |
| `NODE_ENV` | — | `auth.ts`, `client.ts` | Production disables the auth bypass and the global DB-client cache. |

**External services summary:** Railway (hosting: web + worker + Postgres + volume), Google Cloud (OAuth sign-in; optional Drive API), Anthropic API (drafting/parsing/matching), Resend (email), Twilio (SMS, opt-in, not yet configured), Google favicon service (company logos, unauthenticated), raw.githubusercontent.com + public ATS APIs (Greenhouse/Lever/SmartRecruiters/Workday) for discovery.

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
| **worker** | monorepo, filtered | `pnpm --filter worker start` (tsx, no build) | `DATABASE_URL`, `APP_URL`, `VAPID_PUBLIC_KEY/PRIVATE_KEY`, `RESEND_API_KEY`, `NOTIFY_EMAIL_TO`, `ANTHROPIC_API_KEY`, `TWILIO_*` (pending) |
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

## Roadmap (per the project plan recorded in commit history and memory notes)

- **Phase 2 — remaining:**
  - **P2-M2 Gmail monitoring** — read-only full-body scope (approved), extracting application-status changes (interview invites, rejections) into the tracker; storing only extracted status, never email content.
  - **P2-M3 Interview prep** — assistance for scheduled interviews.
  - (P2-M1 Full Auto-Apply shipped 2026-07-03, extension 0.2.0–0.3.0.)
- **Phase 3:**
  - **Visa-sponsorship filter UI refinement** (data + filter exist; richer surfacing planned).
  - **Analytics dashboard** (application funnel, response rates — `mode_decisions` and `notification_log` are ready inputs).
  - **Data export.**
  - **Digest smart-ranking** — ordering the morning digest by fit instead of queue order.
- **Deferred ideas visible in code:** R2 storage backend behind `lib/storage.ts`; Claude-based posting tagging as the upgrade over regexes; recommendation of `auto` mode once a per-portal reliability track record exists (`lib/recommendation.ts` explicitly waits for this); resume-parse → profile enrichment ("will enrich them automatically once the Claude API key is set up" per the Profile UI copy).
