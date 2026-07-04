"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";

/** Card/list toggle persisted in the URL as ?view=list — keeps everything else SSR-friendly. */
export function ViewToggle() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "list" ? "list" : "card";

  const hrefFor = (v: "card" | "list") => {
    const next = new URLSearchParams(searchParams.toString());
    if (v === "card") next.delete("view");
    else next.set("view", "list");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <div className="flex items-center gap-0.5 rounded-xl bg-surface p-1 shadow-card">
      <Link
        href={hrefFor("card")}
        aria-label="Card view"
        aria-pressed={view === "card"}
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors active:scale-[0.98] ${
          view === "card" ? "bg-accent text-white" : "text-tertiary hover:text-foreground"
        }`}
      >
        <LayoutGrid className="h-4 w-4" />
      </Link>
      <Link
        href={hrefFor("list")}
        aria-label="List view"
        aria-pressed={view === "list"}
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors active:scale-[0.98] ${
          view === "list" ? "bg-accent text-white" : "text-tertiary hover:text-foreground"
        }`}
      >
        <List className="h-4 w-4" />
      </Link>
    </div>
  );
}
