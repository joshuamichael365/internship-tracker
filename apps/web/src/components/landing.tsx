"use client";

/**
 * Erevnitis marketing / landing page. Reworked with the Impeccable `bolder`
 * pass in the brand register: a distinctive display face (Bricolage Grotesque,
 * scoped via --font-display), an asymmetric left-weighted hero, the compass's
 * two-tone needle as a recurring signature device, and one committed ink
 * colour moment — instead of the safe centred / gradient-text default.
 */

import { motion, MotionConfig, type Variants } from "motion/react";
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

/* ---------- signature device: the compass needle, two-tone ---------- */

function CompassBar({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-hidden="true">
      <span className="h-[5px] w-8 rounded-full bg-accent" />
      <span className="h-[5px] w-4 rounded-full bg-grape" />
    </span>
  );
}

/* ---------- sign-in buttons (server-action forms) ---------- */

function SignInButton({
  variant = "primary",
  children = "Continue with Google",
  className = "",
}: {
  variant?: "primary" | "ghost" | "light";
  children?: React.ReactNode;
  className?: string;
}) {
  const styles = {
    primary:
      "group inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[15px] font-semibold text-white shadow-raised transition-all hover:opacity-90 active:scale-[0.98]",
    ghost:
      "inline-flex items-center gap-2 rounded-full border border-separator bg-surface px-5 py-2.5 text-[15px] font-semibold text-foreground shadow-card transition-all hover:shadow-raised active:scale-[0.98]",
    light:
      "group inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[15px] font-semibold text-[#221d33] shadow-raised transition-all hover:opacity-90 active:scale-[0.98]",
  } as const;
  return (
    <form action={signInWithGoogleAction} className={className}>
      <button type="submit" className={styles[variant]}>
        {children}
        {variant !== "ghost" && (
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        )}
      </button>
    </form>
  );
}

/* ---------- scroll reveal system ---------- */

const EASE = [0.22, 1, 0.36, 1] as const;

// Container orchestrates a cascade; each item rises + sharpens from a soft blur.
const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};
const rise: Variants = {
  hidden: { opacity: 0, y: 28, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.65, ease: EASE } },
};

/** A block that cascades its children in as it scrolls into view. */
function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-100px" }}
    >
      {children}
    </motion.div>
  );
}

/* ---------- mock product visuals (real tokens) ---------- */

const CHIP = "rounded-full px-2 py-0.5 text-[10px] font-semibold";

function MockPostingCard({ company, role, tag, tagClass }: {
  company: string;
  role: string;
  tag: string;
  tagClass: string;
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
      </div>
    </div>
  );
}

function HeroVisual() {
  return (
    <div className="relative mx-auto h-[320px] w-full max-w-md">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(52% 44% at 55% 42%, color-mix(in srgb, var(--accent) 24%, transparent), transparent 72%)",
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.6 }}
        className="absolute right-0 top-8 w-[240px] rounded-2xl bg-surface/85 p-3 shadow-raised backdrop-blur"
      >
        <p className="mb-2 text-[11px] font-semibold text-tertiary">Your tracker</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["Saved", "bg-tertiary"],
            ["Applied", "bg-success"],
            ["Offer", "bg-accent"],
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

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.6 }}
        className="absolute left-0 top-0 w-[260px]"
      >
        <MockPostingCard company="Stripe" role="Software Engineer Intern" tag="SWE" tagClass="bg-accent-soft text-accent" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="absolute bottom-2 left-4 flex w-[248px] items-center gap-2.5 rounded-xl bg-surface p-3 shadow-raised"
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
  index,
  kicker,
  title,
  body,
  points,
  visual,
  flip = false,
}: {
  index: string;
  kicker: string;
  title: string;
  body: string;
  points: string[];
  visual: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-120px" }}
      className="grid items-center gap-8 py-14 sm:py-20 md:grid-cols-2 md:gap-14"
    >
      <motion.div variants={stagger} className={flip ? "md:order-2" : ""}>
        <motion.div variants={rise} className="flex items-center gap-3">
          <span className="font-display text-[15px] font-bold text-accent">{index}</span>
          <CompassBar />
          <span className="text-[13px] font-semibold text-secondary">{kicker}</span>
        </motion.div>
        <motion.h3
          variants={rise}
          className="font-display mt-3 text-[28px] font-bold leading-[1.05] tracking-tight sm:text-[36px]"
        >
          {title}
        </motion.h3>
        <motion.p variants={rise} className="mt-3 text-[16px] leading-relaxed text-secondary">
          {body}
        </motion.p>
        <motion.ul variants={stagger} className="mt-5 grid gap-2.5">
          {points.map((p) => (
            <motion.li variants={rise} key={p} className="flex items-start gap-2.5 text-[15px]">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft">
                <Check className="h-3 w-3 text-accent" />
              </span>
              <span className="text-secondary">{p}</span>
            </motion.li>
          ))}
        </motion.ul>
      </motion.div>
      <motion.div variants={rise} className={flip ? "md:order-1" : ""}>
        {visual}
      </motion.div>
    </motion.div>
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
    <MotionConfig reducedMotion="user">
    <div className="relative min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 34% at 78% 0%, color-mix(in srgb, var(--purple) 13%, transparent), transparent 60%)",
        }}
      />

      {/* nav */}
      <header className="sticky top-0 z-40 border-b border-separator/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <LogoMark size={30} />
            <span className="font-display text-[18px] font-bold tracking-tight">Erevnitis</span>
          </div>
          <SignInButton variant="ghost">Sign in</SignInButton>
        </div>
      </header>

      {/* hero — asymmetric, left-weighted */}
      <section className="mx-auto max-w-6xl px-5 pt-16 sm:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } }}
          >
            {[
              <div key="k" className="flex items-center gap-3">
                <CompassBar />
                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-secondary">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                  </span>
                  Polls every 60 seconds
                </span>
              </div>,
              <h1
                key="h"
                className="font-display mt-6 text-[clamp(2.7rem,6.2vw,4.7rem)] font-bold leading-[0.98] tracking-tight"
              >
                Find internships the <span className="text-accent">moment</span> they open.
              </h1>,
              <p key="p" className="mt-6 max-w-lg text-[17px] leading-relaxed text-secondary sm:text-[19px]">
                Erevnitis watches every source, drafts your applications, tracks each one to the
                offer, and makes sure you never miss a deadline — all in one calm place.
              </p>,
              <div key="c" className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <SignInButton variant="primary" />
                <a
                  href="#features"
                  className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-semibold text-secondary transition-colors hover:text-foreground"
                >
                  See how it works
                </a>
              </div>,
              <p key="n" className="mt-4 text-[13px] text-tertiary">
                Single-user app — only the owner can sign in.
              </p>,
            ].map((el, i) => (
              <motion.div
                key={i}
                variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } } }}
              >
                {el}
              </motion.div>
            ))}
          </motion.div>

          <HeroVisual />
        </div>
      </section>

      {/* feature rows */}
      <section id="features" className="mx-auto max-w-6xl px-5 pt-8">
        <FeatureRow
          index="01"
          kicker="Discover"
          title="A feed that never sleeps."
          body="New postings from GitHub trackers, company ATS boards, and RSS feeds land within a minute of going live — de-duplicated into one card per role."
          points={[
            "Real-time polling across every source you add",
            "Instant push the moment a watchlisted company posts",
            "Auto-extracted role summaries: skills, terms, sponsorship",
          ]}
          visual={
            <div className="rounded-3xl bg-surface-secondary p-5 shadow-card">
              <div className="grid gap-2.5">
                {[
                  ["Databricks", "ML Engineer Intern", "ML", "bg-grape/15 text-grape"],
                  ["Ramp", "Software Engineer Intern", "SWE", "bg-accent-soft text-accent"],
                  ["Two Sigma", "Quant Researcher Intern", "Quant", "bg-warning/15 text-warning"],
                ].map(([c, r, t, tc]) => (
                  <MockPostingCard key={c} company={c} role={r} tag={t} tagClass={tc} />
                ))}
              </div>
            </div>
          }
        />

        <FeatureRow
          flip
          index="02"
          kicker="Track"
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
          index="03"
          kicker="Assist"
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

      {/* secondary grid */}
      <section className="mx-auto max-w-6xl px-5 py-10">
        <Reveal className="mb-10">
          <motion.div variants={rise}>
            <CompassBar />
          </motion.div>
          <motion.h2
            variants={rise}
            className="font-display mt-3 max-w-xl text-[28px] font-bold leading-[1.05] tracking-tight sm:text-[38px]"
          >
            Everything else you&rsquo;d want, already built in.
          </motion.h2>
        </Reveal>
        <Reveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECONDARY.map((f) => (
            <motion.div
              key={f.title}
              variants={rise}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="h-full rounded-2xl bg-surface p-5 shadow-card"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft">
                <f.icon className="h-5 w-5 text-accent" />
              </div>
              <h3 className="mt-4 text-[16px] font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-secondary">{f.body}</p>
            </motion.div>
          ))}
        </Reveal>
      </section>

      {/* final CTA — one committed ink colour moment */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
        <Reveal>
          <motion.div
            variants={rise}
            className="relative overflow-hidden rounded-[32px] px-6 py-20 text-center"
            style={{ background: "#221d33" }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(60% 90% at 50% 0%, color-mix(in srgb, var(--accent) 34%, transparent), transparent 68%)",
              }}
            />
            <div className="relative">
              <div className="mx-auto mb-6 flex justify-center">
                <CompassBar />
              </div>
              <h2 className="font-display mx-auto max-w-2xl text-[32px] font-bold leading-[1.03] tracking-tight text-white sm:text-[46px]">
                Your next internship is already out there.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-[17px] text-white/70">
                Sign in and let Erevnitis do the watching, drafting, and tracking.
              </p>
              <div className="mt-8 flex justify-center">
                <SignInButton variant="light" />
              </div>
            </div>
          </motion.div>
        </Reveal>
      </section>

      {/* footer */}
      <footer className="border-t border-separator">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-[13px] text-tertiary sm:flex-row">
          <div className="flex items-center gap-2">
            <LogoMark size={20} />
            <span className="font-display font-bold text-secondary">Erevnitis</span>
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
    </MotionConfig>
  );
}
