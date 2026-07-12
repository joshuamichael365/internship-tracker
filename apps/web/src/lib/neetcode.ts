/**
 * NeetCode 150 integration helpers for the interview-prep panel.
 *
 * We deliberately never fabricate a specific problem slug/URL (the prep engine
 * is instructed not to invent links). Instead we link each model-suggested
 * problem to a LeetCode *search* for its real name — always valid, no guessing —
 * and point users at the canonical NeetCode 150 roadmap for structured practice.
 */

/** The canonical NeetCode 150 practice roadmap (verified reachable). */
export const NEETCODE_PRACTICE_URL = "https://neetcode.io/practice";

/** A LeetCode problem-set search for a problem name — safe, no fabricated slug. */
export function leetcodeSearchUrl(problemName: string): string {
  return `https://leetcode.com/problemset/?search=${encodeURIComponent(problemName.trim())}`;
}
