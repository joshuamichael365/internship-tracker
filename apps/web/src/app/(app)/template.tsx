"use client";

import { motion } from "motion/react";

/**
 * Route transition for every (app) page. A template re-mounts on each
 * navigation (unlike a layout), so this gives a quick, consistent enter
 * animation as you move between pages — a crossfade + small rise. Kept fast
 * (~220ms) per the product register: it conveys the navigation without making
 * the user wait through a load sequence. Respects reduced-motion.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
