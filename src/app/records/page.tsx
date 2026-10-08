/**
 * Identity records directory (UI spec §6.10.1). Lists published Digital IDs.
 * Each case resolves to a DID-V (its own, or a display record derived from the
 * case data so the directory is never empty). Links to the record viewer.
 */
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card, LevelBadge, VerdictGlyphMark } from "@/components/ui/primitives";
import { resolveDigitalId } from "@/components/viz/digitalId";
import { getCaseById, getCaseSummaries } from "@/lib/data";
import type { DigitalID } from "@/lib/types";
import { ALL_QUESTIONS, QUESTION_LABEL } from "@/lib/types";
import { fmtNum, fmtPct, VERDICT_COLOR, VERDICT_GLYPH, VERDICT_LABEL } from "@/lib/ui";

export const dynamic = "force-dynamic";

const ABBR: Record<string, string> = {
  identity: "Id",
  integrity: "In",
  credibility: "Cr",
  financial: "Fi",
  track_record: "Tr",
  crimes_compliance: "Cm",
  connections: "Co",
};

function VerdictStrip({ did }: { did: DigitalID }) {
  return (
    <div className="flex items-end gap-1.5">
      {ALL_QUESTIONS.map((q) => {
        const v = did.verdicts[q];
        return (
          <div
            key={q}
            className="flex flex-col items-center gap-0.5"
            title={`${QUESTION_LABEL[q]}: ${VERDICT_LABEL[v]}`}
          >
            <VerdictGlyphMark glyph={VERDICT_GLYPH[v]} color={VERDICT_COLOR[v]} size={11} />
            <span className="text-[9px] text-ink-tertiary">{ABBR[q]}</span>
          </div>
        );
      })}
    </div>
  );
}

export default async function RecordsPage() {
  const summaries = await getCaseSummaries();
  const records = (
    await Promise.all(
      summaries.map(async (s) => {
        const c = await getCaseById(s.id);
        return c ? resolveDigitalId(c) : null;
      }),
    )
  ).filter((d): d is DigitalID => d !== null);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="font-display text-ink" style={{ fontWeight: 800, fontSize: 22 }}>
          Identity records
        </h1>
        <p className="mt-1 text-[13px] text-ink-secondary">
          Directory of Digital IDs for lookups and downstream use. Each card is a
          security-printed credential — a pointer and summary, never the detail.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {records.map((did) => (
            <Link key={did.digitalId} href={`/records/${did.digitalId}`}>
              <Card className="h-full p-4 transition hover:border-fathom">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-display text-ink" style={{ fontWeight: 700, fontSize: 15 }}>
                      {did.canonicalName}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] tracking-wide text-ink-secondary">
                      {did.digitalId}
                    </div>
                  </div>
                  <LevelBadge level={did.caseLevel} />
                </div>

                <div className="mt-3">
                  <VerdictStrip did={did} />
                </div>

                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-ink-tertiary">
                  <span>
                    Consistency{" "}
                    <span className="tabular text-ink-secondary">{fmtNum(did.disclosure.tm)}</span>
                  </span>
                  <span>
                    Coverage{" "}
                    <span className="tabular text-ink-secondary">{fmtPct(did.coverage.overall)}</span>
                  </span>
                  <span>
                    v{did.version} · as of <span className="tabular">{did.asOf}</span>
                  </span>
                  {did.nextRefresh ? (
                    <span>
                      Next refresh <span className="tabular">{did.nextRefresh}</span>
                    </span>
                  ) : null}
                </div>
              </Card>
            </Link>
          ))}
          {records.length === 0 ? (
            <p className="text-[13px] text-ink-secondary">No identity records yet.</p>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
