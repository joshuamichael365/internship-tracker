"use client";

/**
 * Erevnitis marketing / landing page — the public face shown to a logged-out
 * visitor before they sign in. Product-authentic: the mock visuals are built
 * from the same design tokens as the real app, and scroll-reveal + parallax
 * come from `motion` (already a dependency). The sign-in path is the app's
 * server action, used as the action of the "Continue with Google" forms.
 */

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Bookmark,
  Check,
  Clock,
  FileText,
  GraduationCap,
  Radar,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { LogoMark } from "@/components/logo-mark";
import { signInWithGoogleAction } from "@/app/actions/auth";

/* ---------- sign-in buttons (server-action forms) ---------- */

function SignInButton({
  variant = "primary",
  children = "Continue with Google",
  className = "",
}: {
  variant?: "primary" | "ghost";
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <form action={signInWithGoogleAction} className={className}>
      <button
        type="submit"
        className={
          variant === "primary"
            ? "group inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[15px] font-semibold text-white shadow-raised transition-all hover:opacity-90 active:scale-[0.98]"
            : "inline-flex items-center gap-2 rounded-full border border-separator bg-surface px-5 py-2.5 text-[15px] font-semibold text-foreground shadow-card transition-all hover:shadow-raised active:scale-[0.98]"
        }
      >
        {children}
        {variant === "primary" && (
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        )}
      </button>
    </form>
  );
}

/* ---------- small motion helper ---------- */

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ---------- mock product visuals (real tokens) ---------- */

const CHIP = "rounded-full px-2 py-0.5 text-[10px] font-semibold";

function MockPostingCard({ company, role, tag, tagClass, mode }: {
  company: string;
  role: string;
  tag: string;
  tagClass: string;
  mode?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface p-3.5 shadow-card">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-[13px] font-semibold text-accent">
          {company[0]}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-secondary">{company}</p>
          <p className="truncate text-[13px] font-semibold leading-tight">{role}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`${CHIP} ${tagClass}`}>{tag}</span>
        <span className={`${CHIP} bg-black/[0.06] text-secondary dark:bg-white/[0.1]`}>Remote</span>
        {mode && <span className={`${CHIP} bg-grape/15 text-grape`}>{mode}</span>}
      </div>
    </div>
  );
}

function HeroVisual() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const yBack = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -60]);
  const yFront = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -20]);

  return (
    <div ref={ref} className="relative mx-auto mt-14 h-[300px] w-full max-w-2xl sm:h-[340px]">
      {/* glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(50% 45% at 50% 40%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%)",
        }}
      />
      {/* back layer — kanban peek */}
      <motion.div
        style={{ y: yBack }}
        className="absolute left-1/2 top-6 w-[260px] -translate-x-1/2 rounded-2xl bg-surface/80 p-3 shadow-raised backdrop-blur sm:left-[58%] sm:w-[300px]"
      >
        <p className="mb-2 text-[11px] font-semibold text-tertiary">Your tracker</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["Saved", "bg-tertiary"],
            ["Applied", "bg-success"],
            ["Interview", "bg-grape"],
          ].map(([label, dot]) => (
            <div key={label} className="rounded-lg bg-surface-secondary p-2">
              <div className="mb-1.5 flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                <span className="text-[9px] font-semibold text-secondary">{label}</span>
              </div>
              <div className="space-y-1">
                <div className="h-4 rounded bg-black/[0.05] dark:bg-white/[0.06]" />
                <div className="h-4 rounded bg-black/[0.05] dark:bg-white/[0.06]" />
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* front layer — posting card + toast */}
      <motion.div style={{ y: yFront }} className="absolute left-1/2 top-0 w-[280px] -translate-x-1/2 sm:left-[38%]">
        <MockPostingCard
          company="Stripe"
          role="Software Engineer Intern"
          tag="SWE"
          tagClass="bg-accent-soft text-accent"
        />
      </motion.div>

      <motion.div
        style={{ y: yFront }}
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="absolute bottom-4 left-1/2 flex w-[250px] -translate-x-1/2 items-center gap-2.5 rounded-xl bg-surface p-3 shadow-raised sm:left-[34%]"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft">
          <Bell className="h-4 w-4 text-accent" />
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-semibold leading-tight">New · Jane Street</p>
          <p className="truncate text-[11px] text-secondary">Quant Trading Intern · just posted</p>
        </div>
      </motion.div>
    </div>
  );
}

/* ---------- feature rows ---------- */

function FeatureRow({
  eyebrow,
  title,
  body,
  points,
  visual,
  flip = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  visual: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <Reveal className="grid items-center gap-8 py-14 sm:py-20 md:grid-cols-2 md:gap-14">
      <div className={flip ? "md:order-2" : ""}>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-accent">{eyebrow}</p>
        <h3 className="mt-2 text-[26px] font-bold tracking-tight sm:text-[32px]">{title}</h3>
        <p className="mt-3 text-[16px] leading-relaxed text-secondary">{body}</p>
        <ul className="mt-5 grid gap-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-[15px]">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft">
                <Check className="h-3 w-3 text-accent" />
              </span>
              <span className="text-secondary">{p}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={flip ? "md:order-1" : ""}>{visual}</div>
    </Reveal>
  );
}

/* ---------- page ---------- */

const SECONDARY = [
  { icon: FileText, title: "Resume Studio", body: "A LaTeX editor with live compile and an AI writing partner — tailor a resume per role without leaving the app." },
  { icon: GraduationCap, title: "Interview prep", body: "Every posting turns into focus areas and practice problems linked to LeetCode and the NeetCode 150." },
  { icon: BarChart3, title: "Analytics", body: "See your funnel, response rates, and which sources actually convert — built from data you already have." },
  { icon: Clock, title: "Twice-daily digest", body: "A clean email at the times you choose, plus instant alerts for the companies on your watchlist." },
  { icon: ShieldCheck, title: "You stay in control", body: "Auto-apply only ever runs after a per-application opt-in and a master switch that's off by default." },
  { icon: Sparkles, title: "Screenshot intake", body: "Drop in a screenshot of a posting and it's parsed, de-duplicated, and tracked like any other." },
];

export function Landing() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-background text-foreground">
      {/* ambient background */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(70% 40% at 50% 0%, color-mix(in srgb, var(--purple) 12%, transparent), transparent 60%)",
        }}
      />

      {/* nav */}
      <header className="sticky top-0 z-40 border-b border-separator/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <LogoMark size={30} />
            <span className="text-[17px] font-bold tracking-tight">Erevnitis</span>
          </div>
          <SignInButton variant="ghost">Sign in</SignInButton>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-6xl px-5 pt-16 text-center sm:pt-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-separator bg-surface px-3 py-1 text-[12px] font-semibold text-secondary shadow-card">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            Polls every 60 seconds
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-[40px] font-bold leading-[1.05] tracking-tight sm:text-[60px]">
            Find internships the{" "}
            <span className="bg-gradient-to-r from-accent to-grape bg-clip-text text-transparent">
              moment
            </span>{" "}
            they open.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-secondary sm:text-[19px]">
            Erevnitis watches every source, drafts your applications, tracks each one to the
            offer, and makes sure you never miss a deadline — all in one calm place.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <SignInButton variant="primary" />
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-semibold text-secondary transition-colors hover:text-foreground"
            >
              See how it works
            </a>
          </div>
          <p className="mt-4 text-[13px] text-tertiary">Single-user app — only the owner can sign in.</p>
        </motion.div>

        <HeroVisual />
      </section>

      {/* feature rows */}
      <section id="features" className="mx-auto max-w-6xl px-5">
        <FeatureRow
          eyebrow="Discover"
          title="A feed that never sleeps."
          body="New postings from GitHub trackers, company ATS boards, and RSS feeds land within a minute of going live — de-duplicated into one card per role."
          points={[
            "Real-time polling across every source you add",
            "Instant push the moment a watchlisted company posts",
            "Auto-extracted role summaries: skills, terms, sponsorship",
          ]}
          visual={
            <div className="relative rounded-3xl bg-surface-secondary p-5 shadow-card">
              <div className="grid gap-2.5">
                {[
                  ["Databricks", "ML Engineer Intern", "ML", "bg-grape/15 text-grape"],
                  ["Ramp", "Software Engineer Intern", "SWE", "bg-accent-soft text-accent"],
                  ["Two Sigma", "Quant Researcher Intern", "Quant", "bg-warning/15 text-warning"],
                ].map(([c, r, t, tc], i) => (
                  <motion.div
                    key={c}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 * i, duration: 0.4 }}
                  >
                    <MockPostingCard company={c} role={r} tag={t} tagClass={tc} />
                  </motion.div>
                ))}
              </div>
            </div>
          }
        />

        <FeatureRow
          flip
          eyebrow="Track"
          title="Every application, one board."
          body="A seven-stage pipeline from Saved to Offer, with per-application reminders and OA deadlines so nothing slips through the cracks."
          points={[
            "Drag through Saved → Applied → Interview → Offer",
            "Reminders and assessment deadlines on each card",
            "Reposts of a role you've applied to hide automatically",
          ]}
          visual={
            <div className="rounded-3xl bg-surface-secondary p-5 shadow-card">
              <div className="grid grid-cols-3 gap-3">
                {[
                  ["Applied", "bg-success", 3],
                  ["Interview", "bg-grape", 2],
                  ["Offer", "bg-accent", 1],
                ].map(([label, dot, n]) => (
                  <div key={label as string}>
                    <div className="mb-2 flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${dot}`} />
                      <span className="text-[11px] font-semibold text-secondary">{label}</span>
                    </div>
                    <div className="grid gap-2">
                      {Array.from({ length: n as number }).map((_, i) => (
                        <div key={i} className="rounded-xl bg-surface p-2.5 shadow-card">
                          <div className="mb-1.5 h-2 w-3/4 rounded bg-black/[0.08] dark:bg-white/[0.1]" />
                          <div className="h-2 w-1/2 rounded bg-black/[0.05] dark:bg-white/[0.06]" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          }
        />

        <FeatureRow
          eyebrow="Assist"
          title="AI that writes in your voice."
          body="Draft cover letters and application answers in seconds — grounded in your own writing samples. You review and edit everything before it's ever used."
          points={[
            "Three modes: Manual, Agentic Assist, Full Auto-Apply",
            "A browser extension fills the real portal for you",
            "Nothing submits without your explicit, per-role opt-in",
          ]}
          visual={
            <div className="rounded-3xl bg-surface-secondary p-5 shadow-card">
              <div className="rounded-2xl bg-surface p-4 shadow-card">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" />
                  <span className="text-[12px] font-semibold text-secondary">Cover letter · draft</span>
                </div>
                <div className="space-y-2">
                  <div className="h-2.5 w-full rounded bg-black/[0.06] dark:bg-white/[0.08]" />
                  <div className="h-2.5 w-[92%] rounded bg-black/[0.06] dark:bg-white/[0.08]" />
                  <div className="h-2.5 w-[97%] rounded bg-black/[0.06] dark:bg-white/[0.08]" />
                  <div className="h-2.5 w-[70%] rounded bg-black/[0.06] dark:bg-white/[0.08]" />
                </div>
                <div className="mt-4 flex gap-2">
                  <span className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-white">Use draft</span>
                  <span className="rounded-lg bg-surface-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary">Edit</span>
                </div>
              </div>
            </div>
          }
        />
      </section>

      {/* secondary feature grid */}
      <section className="mx-auto max-w-6xl px-5 py-10">
        <Reveal className="mb-10 text-center">
          <h2 className="text-[28px] font-bold tracking-tight sm:text-[36px]">Everything else you&rsquo;d want.</h2>
          <p className="mx-auto mt-3 max-w-lg text-[16px] text-secondary">
            The small things that turn a job hunt from stressful into handled.
          </p>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECONDARY.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.06}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="h-full rounded-2xl bg-surface p-5 shadow-card"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft">
                  <f.icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="mt-4 text-[16px] font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-secondary">{f.body}</p>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* final CTA */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
        <Reveal className="relative overflow-hidden rounded-[32px] bg-surface px-6 py-16 text-center shadow-raised">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(60% 80% at 50% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%)",
            }}
          />
          <div className="mx-auto mb-6 flex justify-center">
            <LogoMark size={56} />
          </div>
          <h2 className="mx-auto max-w-xl text-[30px] font-bold tracking-tight sm:text-[42px]">
            Your next internship is already out there.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[17px] text-secondary">
            Sign in and let Erevnitis do the watching, drafting, and tracking.
          </p>
          <div className="mt-8 flex justify-center">
            <SignInButton variant="primary" />
          </div>
        </Reveal>
      </section>

      {/* footer */}
      <footer className="border-t border-separator">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-[13px] text-tertiary sm:flex-row">
          <div className="flex items-center gap-2">
            <LogoMark size={20} />
            <span className="font-semibold text-secondary">Erevnitis</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Radar className="h-3.5 w-3.5" />
            <span>Discover · Track · Apply · Prepare</span>
          </div>
          <span className="flex items-center gap-1.5">
            <Bookmark className="h-3.5 w-3.5" /> A calmer way to job hunt
          </span>
        </div>
      </footer>
    </div>
  );
}
