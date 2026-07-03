/**
 * Cheap entrance animations. Fades + a few px of travel only — no layout
 * animations, no exit transitions. Used to wrap page headers and card grids
 * from server components (the wrappers themselves are client components).
 */
"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

/** A single element that fades/rises in on mount. */
export function FadeIn({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A grid/list whose direct children fade in with a small stagger.
 * Pass the same class names you'd give the underlying grid.
 */
export function StaggerGrid({
  children,
  className = "",
}: {
  children: ReactNode[];
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.03 } } }}
    >
      {children.map((child, i) => (
        <motion.div
          key={i}
          variants={{
            hidden: { opacity: 0, y: 8 },
            show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" } },
          }}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}
