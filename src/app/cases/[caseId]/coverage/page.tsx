import { notFound } from "next/navigation";
import { Card, CardHeader, Chip, TierMark } from "@/components/ui/primitives";
import { CoverageSounding } from "@/components/ui/score";
import { getCaseById } from "@/lib/data";
import type { CoverageRow, RetrievalState } from "@/lib/types";
import { cn } from "@/lib/ui";
import { DOMAIN_LABEL, RETRIEVAL_STATE_LABEL } from "@/components/case/helpers";

/** States where NEMO could not survey the water — drawn hatched. */
const UNSURVEYED: Set<RetrievalState> = new Set([
  "UNREACHABLE",
  "FOUND_NOT_RETRIEVED",
  "OUT_OF_SCOPE",
]);

function stateTone(state: RetrievalState): string {
  switch (state) {
    case "FOUND_RETRIEVED":
      return "var(--verdict-clear)";
    case "NOT_FOUND":
      return "var(--ink-secondary)";
    case "PARTIAL":
      return "var(--verdict-concerns)";
    case "UNREACHABLE":
      return "var(--verdict-redflag)";
    default:
      return "var(--ink-tertiary)";
  }
}

export default async function CoveragePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const c = await getCaseById(caseId);
  if (!c) notFound();

  const rows = c.coverage;
  const reachable = rows.filter((r) => !UNSURVEYED.has(r.state)).length;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h2 className="font-display text-ink" style={{ fontWeight: 700, fontSize: 18 }}>
          Coverage
        </h2>
        <p className="mt-0.5 text-[13px] text-ink-secondary">
          Where NEMO looked, what state each source is in, and where it couldn&apos;t
          reach. Hatching marks unsurveyed water.
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Sources surveyed"
          subtitle={`${reachable} of ${rows.length} sources reached`}
        />
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-y border-rule text-[11px] uppercase tracking-wide text-ink-tertiary">
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-3 py-2.5 font-medium">Domain</th>
                <th className="px-3 py-2.5 font-medium">Tier</th>
                <th className="px-3 py-2.5 font-medium">State</th>
                <th className="px-4 py-2.5 font-medium">Completeness</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <CoverageRowView key={r.sourceId} r={r} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Legend */}
      <Card className="p-4">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-ink-tertiary">
          Legend
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-ink-secondary">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-6 rounded-full" style={{ background: "var(--fathom)" }} />
            Searched
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="relative h-2 w-6 overflow-hidden rounded-full border border-rule">
              <span className="hatch-unsurveyed absolute inset-0" />
            </span>
            Unsurveyed — couldn&apos;t reach or out of scope
          </span>
        </div>
      </Card>
    </div>
  );
}

function CoverageRowView({ r }: { r: CoverageRow }) {
  const unsurveyed = UNSURVEYED.has(r.state);
  // FR-065: a thorough "no records found" is a genuine clear, not a gap.
  const qualifiedClear = r.state === "NOT_FOUND" && r.completeness >= 0.9;

  return (
    <tr className="relative border-b border-rule last:border-0">
      <td className="relative px-4 py-3">
        {unsurveyed ? (
          <span className="hatch-unsurveyed pointer-events-none absolute inset-0 opacity-30" aria-hidden />
        ) : null}
        <span className="relative text-[13px] text-ink">{r.sourceName}</span>
        {r.errorClass ? (
          <span className="relative mt-0.5 block text-[11px] text-ink-tertiary">
            {r.errorClass}
          </span>
        ) : null}
      </td>
      <td className="px-3 py-3 text-[12px] text-ink-secondary">
        {DOMAIN_LABEL[r.domain]}
      </td>
      <td className="px-3 py-3">
        <TierMark tier={r.tier} />
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1">
          <span
            className={cn("text-[12px] font-medium")}
            style={{ color: stateTone(r.state) }}
          >
            {RETRIEVAL_STATE_LABEL[r.state]}
          </span>
          {qualifiedClear ? (
            <Chip tone="muted" className="w-fit">
              Searched in full — a genuine clear, not a gap
            </Chip>
          ) : null}
        </div>
      </td>
      <td className="w-40 px-4 py-3">
        <CoverageSounding coverage={r.completeness} showValue />
      </td>
    </tr>
  );
}
