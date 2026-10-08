"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/ui";

const TABS: { seg: string; label: string }[] = [
  { seg: "", label: "Overview" },
  { seg: "live", label: "Live run" },
  { seg: "identity", label: "Identity" },
  { seg: "evidence", label: "Evidence map" },
  { seg: "findings", label: "Findings" },
  { seg: "crossover", label: "Declared vs discovered" },
  { seg: "coverage", label: "Coverage" },
  { seg: "report", label: "Report" },
];

export function CaseTabs({ caseId }: { caseId: string }) {
  const pathname = usePathname();
  const base = `/cases/${caseId}`;
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-rule px-4">
      {TABS.map((t) => {
        const href = t.seg ? `${base}/${t.seg}` : base;
        const active = t.seg
          ? pathname === href || pathname.startsWith(href + "/")
          : pathname === base;
        return (
          <Link
            key={t.seg || "overview"}
            href={href}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-[13px] -mb-px",
              active
                ? "border-fathom font-medium text-ink"
                : "border-transparent text-ink-secondary hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
