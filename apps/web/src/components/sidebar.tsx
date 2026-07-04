"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  FileEdit,
  FileText,
  LayoutGrid,
  Search,
  Settings,
  SquareKanban,
  UserRound,
} from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/internships", label: "Internships", icon: Search },
  { href: "/tracker", label: "Tracker", icon: SquareKanban },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/resume-studio", label: "Resume Studio", icon: FileEdit },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/archive", label: "Archive", icon: Archive },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors duration-150 ${
        active
          ? "bg-accent-soft font-medium text-accent"
          : "text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
      }`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-separator bg-[var(--sidebar)] px-3 py-5 backdrop-blur-xl md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-white shadow-card">
            <SquareKanban className="h-4.5 w-4.5" />
          </div>
          <span className="text-[17px] font-semibold tracking-tight">Internships</span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} />
          ))}
        </nav>
        <div className="px-3">
          <ThemeToggle />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-separator bg-[var(--sidebar)] px-4 py-3 backdrop-blur-xl md:hidden">
        <span className="text-[17px] font-semibold tracking-tight">Internships</span>
        <ThemeToggle />
      </header>
      <nav className="sticky top-[49px] z-20 flex gap-1 overflow-x-auto border-b border-separator bg-[var(--sidebar)] px-3 py-2 backdrop-blur-xl md:hidden">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
              isActive(item.href)
                ? "bg-accent font-medium text-white"
                : "bg-black/[0.05] text-foreground dark:bg-white/[0.08]"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
