import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import {
  AttentionDot,
  Card,
  LevelBadge,
  VerdictBadge,
} from "@/components/ui/primitives";
import { getCaseSummaries } from "@/lib/data";
import { STATE_LABEL } from "@/lib/ui";
import type { CaseSummary } from "@/lib/types";
import { relativeTime, subjectTypeLabel } from "@/components/case/helpers";

export default async function CasesPage() {
  const cases = await getCaseSummaries();
  const now = Date.now();
  const sorted = [...cases].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-ink" style={{ fontWeight: 800, fontSize: 22 }}>
              Checks
            </h1>
            <p className="mt-1 text-[13px] text-ink-secondary">
              {cases.length === 0
                ? "No checks yet."
                : `${cases.length} check${cases.length === 1 ? "" : "s"}, most recently updated first.`}
            </p>
          </div>
          <Link
            href="/cases/new"
            className="inline-flex items-center gap-2 rounded-md bg-fathom px-4 py-2 text-[13px] font-medium text-white hover:opacity-90"
          >
            <span className="text-[15px] leading-none">+</span> Start a check
          </Link>
        </div>

        {sorted.length === 0 ? (
          <Card className="mt-6 p-10 text-center">
            <p className="text-[14px] text-ink">You haven&apos;t started a check yet.</p>
            <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-secondary">
              A check surveys one person or organisation against seven questions.
              Start one and NEMO fixes their identity first, then searches.
            </p>
            <Link
              href="/cases/new"
              className="mt-4 inline-flex rounded-md bg-fathom px-4 py-2 text-[13px] font-medium text-white hover:opacity-90"
            >
              Start a check
            </Link>
          </Card>
        ) : (
          <>
            {/* Table on wide screens */}
            <Card className="mt-6 hidden overflow-hidden md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-rule text-[11px] uppercase tracking-wide text-ink-tertiary">
                    <th className="px-4 py-2.5 font-medium">Subject</th>
                    <th className="px-3 py-2.5 font-medium">Depth</th>
                    <th className="px-3 py-2.5 font-medium">Stage</th>
                    <th className="px-3 py-2.5 font-medium">Top verdict</th>
                    <th className="px-3 py-2.5 text-right font-medium">Needs</th>
                    <th className="px-4 py-2.5 text-right font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c) => (
                    <tr
                      key={c.id}
                      className="group border-b border-rule last:border-0 hover:bg-shoal/30"
                    >
                      <td className="px-4 py-3">
                        <Link href={`/cases/${c.id}`} className="block">
                          <span className="flex items-center gap-2">
                            {c.needsReview ? <AttentionDot /> : null}
                            <span className="font-medium text-ink group-hover:underline">
                              {c.name}
                            </span>
                          </span>
                          <span className="text-[11px] text-ink-tertiary">
                            {subjectTypeLabel(c.subjectType)}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <LevelBadge level={c.level} />
                      </td>
                      <td className="px-3 py-3 text-[12px] text-ink-secondary">
                        {STATE_LABEL[c.state] ?? c.state}
                      </td>
                      <td className="px-3 py-3">
                        {c.topVerdict ? (
                          <VerdictBadge verdict={c.topVerdict} size="sm" />
                        ) : (
                          <span className="text-[12px] text-ink-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {c.unresolvedCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[12px] text-magenta tabular">
                            <AttentionDot /> {c.unresolvedCount}
                          </span>
                        ) : (
                          <span className="text-[12px] text-ink-tertiary">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] text-ink-tertiary tabular">
                        {relativeTime(c.updatedAt, now)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {/* Cards on phone */}
            <div className="mt-6 grid gap-3 md:hidden">
              {sorted.map((c) => (
                <CaseCard key={c.id} c={c} now={now} />
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function CaseCard({ c, now }: { c: CaseSummary; now: number }) {
  return (
    <Card className="p-4">
      <Link href={`/cases/${c.id}`} className="block">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {c.needsReview ? <AttentionDot /> : null}
              <span className="truncate font-medium text-ink">{c.name}</span>
            </div>
            <div className="text-[11px] text-ink-tertiary">
              {subjectTypeLabel(c.subjectType)} · {STATE_LABEL[c.state] ?? c.state}
            </div>
          </div>
          <LevelBadge level={c.level} />
        </div>
        <div className="mt-3 flex items-center justify-between">
          {c.topVerdict ? (
            <VerdictBadge verdict={c.topVerdict} size="sm" />
          ) : (
            <span className="text-[12px] text-ink-tertiary">No verdict yet</span>
          )}
          <div className="flex items-center gap-3 text-[11px] text-ink-tertiary">
            {c.unresolvedCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-magenta tabular">
                <AttentionDot /> {c.unresolvedCount}
              </span>
            ) : null}
            <span className="tabular">{relativeTime(c.updatedAt, now)}</span>
          </div>
        </div>
      </Link>
    </Card>
  );
}
