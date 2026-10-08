"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { NemoLogo } from "@/components/brand/Logo";
import { AttentionDot } from "@/components/ui/primitives";
import { cn } from "@/lib/ui";

interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

const NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/review", label: "Review queue", badge: 2 },
  { href: "/cases", label: "Checks" },
  { href: "/monitor", label: "Monitor", badge: 1 },
  { href: "/records", label: "Identity records" },
  { href: "/ask", label: "Ask NEMO" },
  { href: "/playbook", label: "Playbook" },
  { href: "/admin", label: "Admin" },
];

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const stored = (() => {
      try {
        return localStorage.getItem("nemo-theme");
      } catch {
        return null;
      }
    })();
    const initial =
      stored === "dark" || stored === "light"
        ? (stored as "light" | "dark")
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("nemo-theme", next);
    } catch {
      /* ignore */
    }
  }
  return (
    <button
      onClick={toggle}
      className="rounded-md border border-rule px-2 py-1 text-[12px] text-ink-secondary hover:bg-shoal/40"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? "☾" : "☀"}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen bg-survey text-ink">
      {/* Sidebar */}
      <aside className="hidden w-[220px] shrink-0 flex-col border-r border-rule bg-sheet/40 md:flex">
        <div className="px-4 py-4">
          <Link href="/" aria-label="NEMO home">
            <NemoLogo size={22} />
          </Link>
        </div>
        <nav className="flex-1 px-2">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "mb-0.5 flex items-center justify-between rounded-md px-3 py-1.5 text-[13px]",
                  active
                    ? "bg-shoal/70 font-medium text-ink"
                    : "text-ink-secondary hover:bg-shoal/40",
                )}
              >
                <span>{item.label}</span>
                {item.badge ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-magenta">
                    <AttentionDot />
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-rule px-4 py-3 text-[12px] text-ink-secondary">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-fathom text-[11px] text-white"
              aria-hidden
            >
              S
            </span>
            <div className="leading-tight">
              <div className="text-ink">Saigourav</div>
              <div className="text-ink-tertiary">Deal analyst</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center justify-between border-b border-rule bg-sheet/60 px-4 backdrop-blur">
          <div className="flex items-center gap-2 text-[12px] text-ink-tertiary md:hidden">
            <NemoLogo size={18} />
          </div>
          <div className="hidden text-[12px] text-ink-tertiary md:block">
            Background intelligence for private capital
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/cases/new"
              className="rounded-md bg-fathom px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
            >
              Start a check
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
