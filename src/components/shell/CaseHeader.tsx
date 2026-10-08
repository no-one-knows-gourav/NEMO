import Link from "next/link";
import { LevelBadge, VerdictBadge, AttentionDot } from "@/components/ui/primitives";
import { STATE_LABEL } from "@/lib/ui";
import type { NemoCase, Verdict } from "@/lib/types";

function worst(verdicts: Partial<Record<string, Verdict>>): Verdict | null {
  const order: Verdict[] = [
    "STOP",
    "RED_FLAG",
    "CONCERNS",
    "INSUFFICIENT_COVERAGE",
    "CLEAR",
  ];
  for (const v of order)
    if (Object.values(verdicts).includes(v)) return v;
  return null;
}

export function CaseHeader({ c }: { c: NemoCase }) {
  const top = worst(c.verdicts);
  const needsReview =
    c.state === "AWAIT_G1" || c.state === "AWAIT_G2" || c.state === "STOPPED";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
      <div className="flex items-center gap-3">
        <Link href="/cases" className="text-[12px] text-ink-tertiary hover:text-ink">
          ← Checks
        </Link>
        <h1
          className="font-display text-ink"
          style={{ fontWeight: 700, fontSize: 20 }}
        >
          {c.subject.name}
        </h1>
        <LevelBadge level={c.level} />
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-secondary">
          {needsReview ? <AttentionDot /> : null}
          {STATE_LABEL[c.state] ?? c.state}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {top ? <VerdictBadge verdict={top} /> : null}
        <span className="text-[11px] text-ink-tertiary">{c.subject.purpose}</span>
      </div>
    </div>
  );
}
