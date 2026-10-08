import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import {
  AttentionDot,
  Card,
  CardHeader,
  LevelBadge,
  VerdictBadge,
} from "@/components/ui/primitives";
import { getCaseSummaries } from "@/lib/data";
import type { CaseSummary } from "@/lib/types";
import { relativeTime, reviewBuckets, subjectTypeLabel } from "@/components/case/helpers";

export default async function ReviewQueuePage() {
  const cases = await getCaseSummaries();
  const { g1, g2 } = reviewBuckets(cases);
  const now = Date.now();
  const total = g1.length + g2.length;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-6 space-y-5">
        <div>
          <h1 className="font-display text-ink" style={{ fontWeight: 800, fontSize: 22 }}>
            Review queue
          </h1>
          <p className="mt-1 text-[13px] text-ink-secondary">
            {total === 0
              ? "Nothing is waiting for a person right now."
              : `${total} item${total === 1 ? "" : "s"} waiting at the two gates.`}
          </p>
        </div>

        <ReviewSection
          title="Identity checks"
          gate="G1"
          hint="Confirm who this person is before NEMO searches."
          items={g1}
          hrefFor={(c) => `/cases/${c.id}/identity`}
          now={now}
        />

        <ReviewSection
          title="Final reviews"
          gate="G2"
          hint="Decide the report before the committee reads it."
          items={g2}
          hrefFor={(c) => `/cases/${c.id}/report`}
          now={now}
        />
      </div>
    </AppShell>
  );
}

function ReviewSection({
  title,
  gate,
  hint,
  items,
  hrefFor,
  now,
}: {
  title: string;
  gate: string;
  hint: string;
  items: CaseSummary[];
  hrefFor: (c: CaseSummary) => string;
  now: number;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={`${title} (${gate})`}
        subtitle={hint}
        right={
          <span className="text-[12px] text-ink-tertiary tabular">
            {items.length}
          </span>
        }
      />
      <div className="mt-2 divide-y divide-rule border-t border-rule">
        {items.length === 0 ? (
          <div className="px-4 py-5 text-[13px] text-ink-secondary">
            Nothing waiting here.
          </div>
        ) : (
          items.map((c) => (
            <Link
              key={c.id}
              href={hrefFor(c)}
              className="flex items-center gap-3 px-4 py-3 hover:bg-shoal/30"
            >
              <AttentionDot />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-ink">{c.name}</div>
                <div className="text-[11px] text-ink-tertiary">
                  {subjectTypeLabel(c.subjectType)}
                </div>
              </div>
              <span className="hidden shrink-0 sm:block">
                <LevelBadge level={c.level} />
              </span>
              {c.topVerdict ? (
                <span className="hidden shrink-0 md:block">
                  <VerdictBadge verdict={c.topVerdict} size="sm" />
                </span>
              ) : null}
              {c.unresolvedCount > 0 ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-magenta tabular">
                  <AttentionDot /> {c.unresolvedCount}
                </span>
              ) : null}
              <span className="w-20 shrink-0 text-right text-[11px] text-ink-tertiary tabular">
                waiting {relativeTime(c.updatedAt, now).replace(" ago", "")}
              </span>
            </Link>
          ))
        )}
      </div>
    </Card>
  );
}
