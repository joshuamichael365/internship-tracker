# Internship Tracker & Auto-Apply Assistant

Single-user web app that discovers new SWE/ML/CS internship postings in near-real-time,
notifies instantly (web push + email + SMS, with an overnight digest), tracks applications
through a Kanban pipeline, and assists applications at three explicit per-application
automation levels: **Manual**, **Agentic Assist**, and **Full Auto-Apply**.

## Layout

| Path | What it is |
|---|---|
| `apps/web` | Next.js 16 app — UI, API routes, PWA/push service worker |
| `apps/worker` | Always-on Node service — source pollers, dedupe/tagging, notifications, digests, auto-archive |
| `apps/extension` | Chrome MV3 extension — form auto-fill in your own browser (M5) |
| `packages/db` | Drizzle ORM schema + migrations (Postgres) |
| `packages/shared` | Shared types, posting normalization/dedupe |

## Development

```sh
pnpm install
pnpm db:migrate          # needs local Postgres with an internship_tracker DB
pnpm dev                 # web on :3000 + worker
```

Copy `.env.example` to `apps/web/.env.local` and fill in what you have.
`AUTH_DISABLED=true` bypasses Google sign-in for local dev only.

Deployment (Railway: web + worker + Postgres) is documented at the end of Phase 1.
