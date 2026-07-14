"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  BarChart3,
  Camera,
  FileEdit,
  FileText,
  LayoutGrid,
  LogOut,
  Search,
  Settings,
  SquareKanban,
  UserRound,
} from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { LogoMark } from "./logo-mark";
import { ThemeToggle } from "./theme-toggle";

export interface NavAccount {
  name: string | null;
  email: string | null;
  image: string | null;
}

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/internships", label: "Internships", icon: Search },
  { href: "/tracker", label: "Tracker", icon: SquareKanban },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/intake", label: "Screenshot Intake", icon: Camera },
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
      aria-current={active ? "page" : undefined}
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[14px] transition-colors ${
        active
          ? "bg-accent-soft font-medium text-accent"
          : "text-secondary hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}

function Account({ account }: { account: NavAccount | null }) {
  const isDev = !account;
  const name = account?.name?.trim() || (isDev ? "Dev session" : "Signed in");

  const avatar = account?.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={account.image}
      alt=""
      referrerPolicy="no-referrer"
      className="h-8 w-8 shrink-0 rounded-full object-cover"
    />
  ) : (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${
        isDev ? "bg-black/[0.08] text-tertiary dark:bg-white/[0.1]" : "bg-accent-soft text-accent"
      }`}
    >
      <UserRound className="h-4 w-4" />
    </div>
  );

  return (
    <div className="flex items-center gap-2">
      {avatar}
      <span className="hidden max-w-[140px] truncate text-[13px] font-medium sm:block" title={account?.email ?? name}>
        {name}
      </span>
      {!isDev && (
        <form action={signOutAction}>
          <button
            type="submit"
            aria-label="Sign out"
            title="Sign out"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-tertiary transition-colors hover:bg-black/[0.05] hover:text-danger active:scale-[0.98] dark:hover:bg-white/[0.08]"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      )}
    </div>
  );
}

/**
 * Horizontal top navigation — replaces the old fixed sidebar so page content
 * gets the full window width (notably the Tracker board). A sticky brand row
 * (wordmark + theme + account) sits above a horizontally-scrollable nav row, so
 * all ten destinations stay reachable at any width without a menu.
 */
export function TopNav({ account }: { account?: NavAccount | null }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-30 border-b border-separator bg-[var(--sidebar)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 pt-3">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <LogoMark size={28} />
          <span className="font-display text-[18px] font-bold tracking-tight">Erevnitis</span>
        </Link>
        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <Account account={account ?? null} />
        </div>
      </div>
      {/* w-max + mx-auto centers the links when they fit and falls back to a
          left-aligned scroll (never a clipped centre) once they overflow. */}
      <nav className="overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mx-auto flex w-max gap-1 py-2">
          {NAV.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} />
          ))}
        </div>
      </nav>
    </header>
  );
}
