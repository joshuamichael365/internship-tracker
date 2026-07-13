import type { ReactNode } from "react";
import { FadeIn } from "@/components/motion";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <FadeIn className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-secondary">{subtitle}</p>}
      </div>
      {actions}
    </FadeIn>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-surface p-5 shadow-card ${className}`}>{children}</div>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <Card className="flex flex-col items-center gap-2 py-14 text-center">
      {icon && (
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          {icon}
        </div>
      )}
      <p className="text-[15px] font-medium">{title}</p>
      {hint && <p className="max-w-sm text-[13px] text-secondary">{hint}</p>}
    </Card>
  );
}

/**
 * Shared toggle switch — was three near-identical copies (sources-manager,
 * auto-apply-settings, notification-settings) before being unified here.
 * Modern-iOS-style elongated pill (wider track, more thumb travel than the
 * squatter shape this replaced) in the brand accent when on, rather than
 * --success green — green stays reserved for actual success states
 * (Applied/Offer) elsewhere in the app.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[28px] w-[50px] shrink-0 rounded-full transition-colors active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 ${
        checked ? "bg-accent" : "bg-black/[0.15] dark:bg-white/[0.2]"
      }`}
    >
      <span
        className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-card transition-[left] ${
          checked ? "left-[25px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}

const MODE_STYLES: Record<string, string> = {
  manual: "bg-black/[0.06] text-secondary dark:bg-white/[0.1]",
  assist: "bg-accent-soft text-accent",
  auto: "bg-[color-mix(in_srgb,var(--purple)_14%,transparent)] text-grape",
};

const MODE_LABELS: Record<string, string> = {
  manual: "Manual",
  assist: "Assisted",
  auto: "Auto-Apply",
};

/** Per-spec: an application's chosen mode must be visually unambiguous everywhere it appears. */
export function ModeBadge({ mode }: { mode: "manual" | "assist" | "auto" | null }) {
  if (!mode) {
    return (
      <span className="rounded-full border border-dashed border-separator px-2.5 py-0.5 text-[12px] font-medium text-tertiary">
        Mode not chosen
      </span>
    );
  }
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${MODE_STYLES[mode]}`}>
      {MODE_LABELS[mode]}
    </span>
  );
}
