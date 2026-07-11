"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
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
import { ThemeToggle } from "./theme-toggle";

export interface SidebarAccount {
  name: string | null;
  email: string | null;
  image: string | null;
}

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/internships", label: "Internships", icon: Search },
  { href: "/tracker", label: "Tracker", icon: SquareKanban },
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

function AccountFooter({ account, compact = false }: { account: SidebarAccount | null; compact?: boolean }) {
  const isDev = !account;
  const name = account?.name?.trim() || (isDev ? "Dev session" : "Signed in");
  const email = account?.email ?? (isDev ? "AUTH_DISABLED — local preview" : "");

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

  const signOutButton = !isDev && (
    <form action={signOutAction}>
      <button
        type="submit"
        aria-label="Sign out"
        title="Sign out"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-tertiary transition-colors duration-150 hover:bg-black/[0.05] hover:text-danger active:scale-[0.98] dark:hover:bg-white/[0.08]"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </form>
  );

  if (compact) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        {avatar}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium">{name}</p>
          <p className="truncate text-[10px] text-tertiary">{email}</p>
        </div>
        {signOutButton}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-separator bg-surface-secondary p-2">
      {avatar}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{name}</p>
        <p className="truncate text-[11px] text-tertiary">{email}</p>
      </div>
      {signOutButton}
    </div>
  );
}

export function Sidebar({ account }: { account?: SidebarAccount | null }) {
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
        <div className="flex flex-col gap-3 px-1">
          <div className="px-2">
            <ThemeToggle />
          </div>
          <AccountFooter account={account ?? null} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-separator bg-[var(--sidebar)] px-4 py-3 backdrop-blur-xl md:hidden">
        <span className="shrink-0 text-[17px] font-semibold tracking-tight">Internships</span>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          <div className="min-w-0 max-w-[160px] flex-1">
            <AccountFooter account={account ?? null} compact />
          </div>
          <ThemeToggle />
        </div>
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
