/**
 * Erevnitis' compass mark: a fixed dial (rim + degree ticks) with a two-tone
 * needle — one half `--accent`, one half `--purple` — tilted 45°. Fully
 * theme-aware (reads CSS custom properties, so it never needs a separate
 * light/dark copy) and self-simplifies below 40px: tick marks read as noise
 * at favicon-ish sizes, so small renders drop them and keep only the rim +
 * needle, which stays legible at any size.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const detailed = size >= 40;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Erevnitis"
    >
      <circle cx="50" cy="50" r="44" fill="var(--surface)" stroke="var(--text-tertiary)" strokeWidth="2" />
      {detailed && (
        <>
          <g stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round">
            <line x1="72" y1="11.9" x2="70" y2="15.4" />
            <line x1="88.1" y1="28" x2="84.6" y2="30" />
            <line x1="88.1" y1="72" x2="84.6" y2="70" />
            <line x1="72" y1="88.1" x2="70" y2="84.6" />
            <line x1="28" y1="88.1" x2="30" y2="84.6" />
            <line x1="11.9" y1="72" x2="15.4" y2="70" />
            <line x1="11.9" y1="28" x2="15.4" y2="30" />
            <line x1="28" y1="11.9" x2="30" y2="15.4" />
          </g>
          <g stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round">
            <line x1="50" y1="6" x2="50" y2="14" />
            <line x1="94" y1="50" x2="86" y2="50" />
            <line x1="50" y1="94" x2="50" y2="86" />
            <line x1="6" y1="50" x2="14" y2="50" />
          </g>
        </>
      )}
      <g transform="rotate(45 50 50)">
        <path d={detailed ? "M50,16 L56,50 L44,50 Z" : "M50,14 L58,50 L42,50 Z"} fill="var(--accent)" />
        <path d={detailed ? "M50,84 L44,50 L56,50 Z" : "M50,86 L42,50 L58,50 Z"} fill="var(--purple)" />
      </g>
      <circle cx="50" cy="50" r={detailed ? 3 : 3.5} fill="var(--text)" />
    </svg>
  );
}

/**
 * The compass mark as a "thinking" loading indicator — the needle spins
 * continuously (CSS animation, see .animate-compass-spin in globals.css)
 * while the rim stays fixed, like a compass hunting for a bearing. Used by
 * the Assistant chat while waiting on a reply.
 */
export function LogoSpinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Thinking"
    >
      <circle cx="50" cy="50" r="44" fill="var(--surface)" stroke="var(--text-tertiary)" strokeWidth="2" />
      <g className="animate-compass-spin">
        <path d="M50,14 L58,50 L42,50 Z" fill="var(--accent)" />
        <path d="M50,86 L42,50 L58,50 Z" fill="var(--purple)" />
      </g>
      <circle cx="50" cy="50" r="3.5" fill="var(--text)" />
    </svg>
  );
}
