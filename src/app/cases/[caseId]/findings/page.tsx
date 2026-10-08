import { notFound } from "next/navigation";
import {
  Card,
  Chip,
  SeverityBars,
  TierMark,
  VerdictBadge,
} from "@/components/ui/primitives";
import { ScoreInterval } from "@/components/ui/score";
import { getCaseById } from "@/lib/data";
import { QUESTION_LABEL, type Finding, type Verdict } from "@/lib/types";
import { fmtNum, SEVERITY_COLOR, SEVERITY_FILLED } from "@/lib/ui";
import {
  FINDING_STATUS_LABEL,
  LEGAL_STATUS_LABEL,
  ROLE_LABEL,
} from "@/components/case/helpers";

export default async function FindingsPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const c = await getCaseById(caseId);
  if (!c) notFound();

  const findings = [...c.findings].sort(
    (a, b) => SEVERITY_FILLED[b.severity] - SEVERITY_FILLED[a.severity],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-display text-ink" style={{ fontWeight: 700, fontSize: 18 }}>
            Findings
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-secondary">
            What NEMO found and how confident it is. Allegations are undecided
            matters, worded as allegations.
          </p>
        </div>
        <span className="text-[12px] text-ink-tertiary tabular">
          {findings.length} finding{findings.length === 1 ? "" : "s"}
        </span>
      </div>

      {findings.length === 0 ? (
        <Card className="p-10 text-center text-[13px] text-ink-secondary">
          No findings recorded for this check.
        </Card>
      ) : (
        findings.map((f) => (
          <FindingCard
            key={f.id}
            f={f}
            verdict={c.verdicts[f.question] ?? null}
          />
        ))
      )}
    </div>
  );
}

function FindingCard({ f, verdict }: { f: Finding; verdict: Verdict | null }) {
  const isAllegation = f.status === "ALLEGATION";
  const sc = f.score;
  return (
    <Card className="overflow-hidden">
      <div className="flex gap-0">
        <span
          className="w-1 shrink-0"
          style={{ background: isAllegation ? "var(--magenta)" : SEVERITY_COLOR[f.severity] }}
          aria-hidden
        />
        <div className="min-w-0 flex-1 p-4">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-[14px] font-medium text-ink">{f.title}</h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <SeverityBars severity={f.severity} showLabel />
              </div>
            </div>
            {verdict ? <VerdictBadge verdict={verdict} size="sm" /> : null}
          </div>

          {/* Meta chips */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Chip tone="muted">{QUESTION_LABEL[f.question]}</Chip>
            <Chip tone={isAllegation ? "attention" : "muted"}>
              {FINDING_STATUS_LABEL[f.status]}
            </Chip>
            <Chip tone="muted">{ROLE_LABEL[f.role]}</Chip>
            {f.legalStatus ? (
              <Chip tone="muted">{LEGAL_STATUS_LABEL[f.legalStatus]}</Chip>
            ) : null}
          </div>

          {/* Summary */}
          <p className="mt-3 text-[13px] text-ink-secondary">{f.summary}</p>

          {/* Risk contribution interval */}
          {sc ? (
            <div className="mt-3">
              <ScoreInterval
                point={sc.rc}
                low={sc.rcLow}
                high={sc.rcHigh}
                label="Risk contribution"
              />
            </div>
          ) : null}

          {/* Evidence */}
          <div className="mt-4">
            <div className="mb-2 text-[11px] uppercase tracking-wide text-ink-tertiary">
              Evidence ({f.evidence.length})
            </div>
            <div className="space-y-2">
              {f.evidence.map((ev) => (
                <div
                  key={ev.id}
                  className="rounded-md border border-rule bg-survey/60 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <TierMark tier={ev.tier} />
                      <span className="text-[12px] text-ink">{ev.source}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-ink-tertiary tabular">
                      {typeof ev.entailment === "number" ? (
                        <span title="Entailment: how well the fact is supported by the cited span">
                          entailment {fmtNum(ev.entailment)}
                        </span>
                      ) : null}
                      {ev.retrievedAt ? <span>{ev.retrievedAt}</span> : null}
                    </div>
                  </div>
                  {ev.excerpt ? (
                    <p className="mt-1.5 font-serif text-[13px] italic text-ink-secondary">
                      “{ev.excerpt}”
                    </p>
                  ) : null}
                  {ev.location ? (
                    <div className="mt-1 text-[11px] text-ink-tertiary">{ev.location}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* Human review */}
          {f.humanReview ? (
            <div className="mt-3 text-[11px] text-ink-tertiary">
              {f.humanReview.gate} · reviewer decision:{" "}
              <span className="text-ink-secondary">{f.humanReview.decision.toLowerCase()}</span>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
