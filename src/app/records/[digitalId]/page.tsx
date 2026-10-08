/**
 * Identity record viewer (UI spec §9.2, PRD 16.1). The branded, signed-looking
 * DID-V card: header band + guilloche, a rosette generated deterministically
 * from the public ID (no photo, OUT-015), the machine-readable line in B612
 * Mono, verdicts per question, scores, disclosure, coverage, linked entities,
 * version + changed fields (starred), and the signing key id. Reads like a
 * security-printed credential. Wrapped in AppShell.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { NemoMark } from "@/components/brand/Logo";
import { AppShell } from "@/components/shell/AppShell";
import { Card, LevelBadge, VerdictBadge, VerdictGlyphMark } from "@/components/ui/primitives";
import { CoverageSounding } from "@/components/ui/score";
import { machineLine, resolveDigitalId } from "@/components/viz/digitalId";
import { getCaseById, getCaseSummaries } from "@/lib/data";
import type { DigitalID } from "@/lib/types";
import { ALL_QUESTIONS, QUESTION_LABEL } from "@/lib/types";
import { fmtNum, fmtPct, VERDICT_COLOR, VERDICT_GLYPH } from "@/lib/ui";

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

async function resolveRecord(
  digitalId: string,
): Promise<{ did: DigitalID; caseId: string } | null> {
  const summaries = await getCaseSummaries();
  for (const s of summaries) {
    const c = await getCaseById(s.id);
    if (!c) continue;
    const did = resolveDigitalId(c);
    if (did.digitalId === digitalId) return { did, caseId: c.id };
  }
  return null;
}

/** Deterministic guilloche rosette seeded from the public ID (§9.2.2). */
function Rosette({ seed }: { seed: string }) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const petals = 7 + (h % 6);
  const twist = (h % 20) / 40 + 0.15;
  const paths: string[] = [];
  for (let r = 10; r <= 28; r += 6) {
    let d = "";
    const steps = 72;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const rr = r + Math.sin(a * petals + r * twist) * 3.2;
      const x = 34 + Math.cos(a) * rr;
      const y = 34 + Math.sin(a) * rr;
      d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    paths.push(d);
  }
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" aria-hidden="true">
      <circle cx="34" cy="34" r="31" fill="none" stroke="var(--fathom)" strokeWidth="0.5" opacity="0.5" />
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="var(--fathom)" strokeWidth="0.4" opacity="0.6" />
      ))}
      <circle cx="34" cy="34" r="2" fill="var(--magenta)" />
    </svg>
  );
}

export default async function RecordViewer({
  params,
}: {
  params: Promise<{ digitalId: string }>;
}) {
  const { digitalId } = await params;
  const resolved = await resolveRecord(decodeURIComponent(digitalId));
  if (!resolved) notFound();
  const { did, caseId } = resolved;
  const machine = machineLine(did);
  const microtext = `${did.digitalId} V${did.version}  `.repeat(8);
  const changed = new Set(did.changedFields ?? []);
  const primaryEntity = did.linkedEntities[0];

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-3 flex items-center justify-between">
          <Link href="/records" className="text-[12px] text-ink-tertiary hover:text-ink">
            ← Identity records
          </Link>
          <Link href={`/cases/${caseId}`} className="text-[12px] text-fathom hover:underline">
            Open check →
          </Link>
        </div>

        {/* The card (ID-1 proportions ~1.586:1) */}
        <div
          className="overflow-hidden rounded-xl border border-rule bg-sheet"
          style={{ boxShadow: "var(--shadow-sheet)" }}
        >
          {/* header band */}
          <div className="flex items-center justify-between bg-fathom px-4 py-2.5 text-white">
            <span className="inline-flex items-center gap-2">
              <NemoMark size={20} mono />
              <span className="font-display lowercase" style={{ fontWeight: 800, fontSize: 16 }}>
                nemo
              </span>
              <span className="font-display ml-2 text-[12px]" style={{ fontWeight: 600 }}>
                Identity record
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/50 px-2 py-0.5 text-[11px]">
              <span className="inline-block h-2 w-2 rounded-full bg-white" /> {did.status}
            </span>
          </div>

          {/* guilloche band */}
          <div className="guilloche h-3 w-full" />

          <div className="relative p-5">
            {/* microtext border */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden whitespace-nowrap font-mono text-ink-tertiary"
              style={{ fontSize: 5, opacity: 0.4, letterSpacing: 1 }}
              aria-hidden
            >
              {microtext}
            </div>

            <div className="flex items-start gap-4 pt-2">
              <div className="shrink-0">
                <Rosette seed={did.digitalId} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-ink" style={{ fontWeight: 800, fontSize: 20 }}>
                  {did.canonicalName}
                </div>
                <div className="text-[12px] text-ink-secondary">
                  {did.subjectType}
                  {primaryEntity ? ` · ${primaryEntity.relation.replace(/_/g, " ").toLowerCase()} ${primaryEntity.id}` : ""}
                </div>
                <div className="mt-2 font-mono text-[13px] tracking-[0.12em] text-ink">
                  {did.digitalId}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-tertiary">
                  <span>
                    Version {did.version}
                    {changed.size > 0 ? <span className="text-magenta"> ✦</span> : null}
                  </span>
                  <span className="tabular">As of {did.asOf}</span>
                  <LevelBadge level={did.caseLevel} />
                </div>
              </div>
            </div>

            {/* verdict strip + metrics */}
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div className="flex items-end gap-2">
                {ALL_QUESTIONS.map((q) => {
                  const v = did.verdicts[q];
                  return (
                    <div
                      key={q}
                      className="flex flex-col items-center gap-0.5"
                      title={QUESTION_LABEL[q]}
                    >
                      <VerdictGlyphMark glyph={VERDICT_GLYPH[v]} color={VERDICT_COLOR[v]} size={12} />
                      <span className="text-[9px] text-ink-tertiary">{ABBR[q]}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-5 text-[11px] text-ink-tertiary">
                <span>
                  Consistency{" "}
                  <span className="tabular text-ink">{fmtNum(did.disclosure.tm)}</span>
                </span>
                <span>
                  Coverage <span className="tabular text-ink">{fmtPct(did.coverage.overall)}</span>
                </span>
              </div>
            </div>

            {/* machine line */}
            <div className="mt-4 overflow-x-auto rounded border border-rule bg-survey/60 px-2 py-1.5">
              <code className="font-mono text-[11px] tracking-wider text-ink-secondary">
                {machine}
              </code>
            </div>
          </div>
        </div>

        {/* Back face — verdicts, references, signature */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <div className="p-4">
              <div className="mb-2 font-display text-ink" style={{ fontWeight: 600, fontSize: 14 }}>
                Seven questions
              </div>
              <div className="space-y-1.5">
                {ALL_QUESTIONS.map((q) => {
                  const sc = did.scores[q];
                  const starred = changed.has(`verdicts.${q}`);
                  return (
                    <div key={q} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="flex items-center gap-1 text-ink-secondary">
                        {QUESTION_LABEL[q]}
                        {starred ? <span className="text-magenta">✦</span> : null}
                      </span>
                      <span className="flex items-center gap-2">
                        {sc ? (
                          <span className="tabular text-[11px] text-ink-tertiary">
                            {fmtNum(sc.point)}
                          </span>
                        ) : null}
                        <VerdictBadge verdict={did.verdicts[q]} size="sm" />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card>
            <div className="space-y-3 p-4 text-[12px]">
              <div>
                <div className="mb-1 font-display text-ink" style={{ fontWeight: 600, fontSize: 14 }}>
                  Disclosure
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-ink-secondary">
                  <span>
                    Disclosure <span className="tabular">{fmtPct(did.disclosure.dd)}</span>
                  </span>
                  <span>
                    Verified <span className="tabular">{fmtPct(did.disclosure.v)}</span>
                  </span>
                  <span>
                    Consistency <span className="tabular">{fmtNum(did.disclosure.c)}</span>
                  </span>
                  <span>
                    Difference <span className="tabular">{fmtNum(did.disclosure.delta)}</span>
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-ink-tertiary">Overall coverage</span>
                  <span className="inline-block w-28">
                    <CoverageSounding coverage={did.coverage.overall} />
                  </span>
                </div>
              </div>

              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-tertiary">
                  Linked entities
                </div>
                {did.linkedEntities.length === 0 ? (
                  <span className="text-ink-tertiary">None</span>
                ) : (
                  <ul className="space-y-0.5">
                    {did.linkedEntities.map((e) => (
                      <li key={e.id} className="text-ink-secondary">
                        <span className="font-mono text-[10px] text-ink-tertiary">{e.id}</span> ·{" "}
                        {e.relation.replace(/_/g, " ").toLowerCase()}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {changed.size > 0 ? (
                <div>
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-tertiary">
                    Changed in this version <span className="text-magenta">✦</span>
                  </div>
                  <div className="font-mono text-[11px] text-ink-secondary">
                    {[...changed].join(", ")}
                  </div>
                </div>
              ) : null}

              <div className="border-t border-rule pt-2 text-[11px] text-ink-tertiary">
                <div>
                  Reviewed by {did.reviewedBy?.join(", ") || "—"}
                </div>
                <div className="mt-0.5">
                  Signed {did.signature?.alg ?? "—"} · key{" "}
                  <span className="font-mono">{did.signature?.kid ?? "—"}</span>
                </div>
                {did.nextRefresh ? (
                  <div className="mt-0.5 tabular">Next refresh {did.nextRefresh}</div>
                ) : null}
              </div>
            </div>
          </Card>
        </div>

        <p className="mt-3 text-[11px] text-ink-tertiary">
          This record is a pointer and summary. It holds no raw identifiers, dates
          of birth, addresses, photos or finding text — those stay in the
          access-controlled report and knowledge graph.
        </p>
      </div>
    </AppShell>
  );
}
