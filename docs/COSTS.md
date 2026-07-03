# Cost Breakdown — Internship Tracker & Auto-Apply Assistant

Last updated: July 4, 2026. All amounts USD. This document explains **who pays for what**,
what the app costs **today**, what each **action** costs, and what **future features** will add.

## The three wallets (read this first)

| Wallet | What it pays for | Current spend |
|---|---|---|
| **Claude subscription** (Claude Code plan) | *Building* the app: the manager session and every dev agent (Sonnet/Opus) it spawns. Agent tokens draw from the plan's included usage allowance — hitting a limit pauses work until the window resets; it never bills extra dollars. | $0 beyond the subscription you already pay |
| **Anthropic API credit** (the $5 key) | The *deployed app's own* AI calls at runtime — drafting, parsing, semantic matching. Pay-as-you-go against prepaid credit. | Pennies so far |
| **Railway** | Hosting: web + worker + Postgres + volume, 24/7. | $5/mo Hobby plan (includes $5 usage; this app fits in roughly $5–10/mo total) |

Key point: **agents never touch the API key.** Development effort and runtime AI are financially
independent. You can build all day on the subscription without moving the API balance.

## What the app costs today (monthly)

| Item | Cost | Notes |
|---|---|---|
| Railway (web + worker + Postgres + volume) | ~$5–10 | Hobby plan $5 includes $5 usage; this workload usually stays near that |
| Anthropic API (runtime features) | ~$1–5 at realistic usage | Scales with how many applications you run through Assist |
| Resend email | $0 | Free tier, 100 emails/day — far above actual usage |
| Web push | $0 | Standard Web Push, no vendor |
| Company logos (Google favicon service) | $0 | |
| GitHub (private repo) | $0 | |
| Twilio SMS | **$0 (off by default)** | If ever enabled: ~$1.15/mo number + ~$4/mo A2P registration + ~$0.008/message ⇒ ~$5–10/mo |
| **Total today** | **~$6–15/mo** | Plus your existing Claude subscription |

## Per-action API costs (what depletes the $5 credit)

| Action | Model | Approx. cost |
|---|---|---|
| Draft a cover letter | claude-sonnet-5 | 2–4¢ |
| Draft one short answer | claude-sonnet-5 | 1–2¢ |
| Parse an uploaded resume | claude-haiku-4-5 | <1¢ |
| Semantic option match (one unclear dropdown/radio) | claude-haiku-4-5 | ~0.1¢ |
| **Fully AI-assisted application** (letter + 2 answers + a few matches) | — | **~5–8¢** |

Reference points: the $5 starting credit covers roughly **60–100 fully assisted applications**.
Discovery, notifications, filtering, and the tracker use **zero** API tokens — polling and tagging
run on free keyword heuristics.

## What development has cost (for transparency)

All Phase 1 + Phase 2 work so far — the discovery engine, notifications, tracker, Agentic Assist,
Full Auto-Apply, the extension, UI refinement, documentation — was built inside the Claude
subscription's included usage. Dev agents typically consume 25k–120k tokens per delegated task
from the plan allowance. Dollar cost above the subscription: **$0**.

## Future features — projected costs

| Feature | Hosting delta | API delta | Notes |
|---|---|---|---|
| Gmail status monitoring (P2-M2) | $0 | ~pennies/day | Gmail API is free; Haiku classifies only application-related emails (~0.1–0.3¢ each) |
| Interview & skill prep (P2-M3) | $0 | ~2–5¢ per tracked application | One Sonnet generation per application, cached |
| LaTeX resume editor + AI chat (proposed) | ~$0 | ~1–3¢ per chat turn | Tectonic compiler is free/open-source, runs on existing Railway service; package cache on the existing volume |
| Google Drive storage | $0 | $0 | Free API, user's own storage quota |
| Visa filter / analytics / export (Phase 3) | $0 | $0 | Pure database features |

## Cost-control principles baked into the app

1. **Cheapest model that does the job**: Haiku for classification/extraction, Sonnet only for prose
   in your voice. Nothing uses Opus at runtime.
2. **AI is never in the hot loop**: the every-minute discovery poll uses conditional HTTP requests
   (mostly free 304 responses) and regex tagging — $0 per tick, ~1.4M ticks/year.
3. **Opt-in for anything that bills**: SMS is a Settings toggle (off), Drive needs explicit
   connection, semantic matching only fires when literal matching already failed.
4. **No paid third-party services**: no scraping APIs, no compile services, no social-listening
   subscriptions — rejected during design partly on cost grounds (see DEPLOYMENT.md history).

## If costs ever spike, look here first

- **Anthropic console usage page** — the only variable cost. A spike means many drafting calls.
- **Railway usage dashboard** — resource-based; a runaway worker loop would show as CPU hours.
  (The worker's jobs are cron-bounded, so this would indicate a bug — report it.)
- Twilio, only if you've enabled SMS.
