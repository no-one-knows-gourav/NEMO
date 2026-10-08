import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Card,
  CardHeader,
  Chip,
  SeverityBars,
  VerdictBadge,
} from "@/components/ui/primitives";
import { CoverageSounding, ScoreInterval, StatProbe } from "@/components/ui/score";
import { getCaseById } from "@/lib/data";
import {
  ALL_QUESTIONS,
  QUESTION_LABEL,
  type Finding,
  type Question,
  type Verdict,
} from "@/lib/types";
import { fmtNum, fmtPct, SEVERITY_FILLED } from "@/lib/ui";
import { longDate, recommendedAction, worstVerdict } from "@/components/case/helpers";

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const c = await getCaseById(caseId);
  if (!c) notFound();

  const top = worstVerdict(Object.values(c.verdicts));
  const scoredQuestions = ALL_QUESTIONS.filter((q) => c.questionScores[q]);
  const overallCoverage =
    scoredQuestions.length > 0
      ? scoredQuestions.reduce(
          (s, q) => s + (c.questionScores[q]!.coverage ?? 0),
          0,
        ) / scoredQuestions.length
      : 0;

  const openFindings = c.findings.filter((f) => f.status === "ALLEGATION");
  const affected = new Set(openFindings.map((f) => f.question));
  const rec = recommendedAction(top, openFindings.length);

  const topFindings = [...c.findings]
    .sort((a, b) => SEVERITY_FILLED[b.severity] - SEVERITY_FILLED[a.severity])
    .slice(0, 5);

  const d = c.disclosure;
  const didLabel = c.digitalId?.digitalId ?? c.fingerprint?.canonicalName ?? c.subject.name;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Banner states */}
      {top === "STOP" ? (
        <Banner tone="var(--verdict-stop-ring)">
          Stopped for compliance review. All tabs are read-only until compliance
          clears the condition.
        </Banner>
      ) : null}
      {affected.size > 0 ? (
        <Banner tone="var(--magenta)" attention>
          Unresolved items affect {affected.size} question
          {affected.size === 1 ? "" : "s"}. Verdicts may change once they close.
        </Banner>
      ) : null}

      {/* Identity record mini + meta */}
      <Card className="guilloche flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-lg border border-rule bg-sheet px-4 py-3">
            <div className="text-[10px] uppercase tracking-wide text-ink-tertiary">
              Identity record
            </div>
            <div className="mt-1 font-mono text-[12px] text-ink">{didLabel}</div>
            <div className="text-[11px] text-ink-tertiary">
              v{c.digitalId?.version ?? c.fingerprint?.version ?? 1}
            </div>
          </div>
          <div>
            <div className="font-display text-ink" style={{ fontWeight: 700, fontSize: 18 }}>
              {c.subject.name}
            </div>
            <div className="text-[12px] text-ink-secondary">{c.subject.purpose}</div>
            <div className="text-[11px] text-ink-tertiary">As of {longDate(c.updatedAt)}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/cases/${caseId}/identity`}
            className="rounded-md border border-rule px-3 py-1.5 text-[12px] text-ink-secondary hover:bg-shoal/40"
          >
            Open identity record
          </Link>
          <Link
            href={`/cases/${caseId}/report`}
            className="rounded-md border border-rule px-3 py-1.5 text-[12px] text-ink-secondary hover:bg-shoal/40"
          >
            Open report
          </Link>
        </div>
      </Card>

      {/* Seven questions */}
      <Card>
        <CardHeader title="Seven questions" subtitle="The verdict on each, with its score, uncertainty and coverage." />
        <div className="mt-3 divide-y divide-rule">
          {ALL_QUESTIONS.map((q) => (
            <QuestionRow key={q} q={q} c={c} />
          ))}
        </div>
      </Card>

      {/* Trust / disclosure / coverage */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatProbe
          value={d ? fmtPct(d.consistency) : "—"}
          label="Consistency"
          sub={d ? `Trust band: ${d.trustBand.toLowerCase()}` : undefined}
          tone={d && d.trustBand === "Low" ? "var(--verdict-concerns)" : undefined}
        />
        <StatProbe
          value={d ? fmtPct(d.disclosureDegree) : "—"}
          label="Disclosure"
          sub={d ? `Verified ${fmtPct(d.verification)}` : undefined}
        />
        <StatProbe
          value={fmtPct(overallCoverage)}
          label="Coverage"
          sub={`${scoredQuestions.length} of 7 questions scored`}
        />
      </div>

      {/* Top findings */}
      <Card>
        <CardHeader
          title="Top findings"
          subtitle="The highest-severity findings. Allegations are undecided matters."
          right={
            <Link
              href={`/cases/${caseId}/findings`}
              className="text-[12px] text-fathom hover:underline"
            >
              All findings →
            </Link>
          }
        />
        <div className="mt-3 divide-y divide-rule">
          {topFindings.length === 0 ? (
            <div className="px-4 py-5 text-[13px] text-ink-secondary">
              No findings recorded.
            </div>
          ) : (
            topFindings.map((f) => (
              <FindingLine
                key={f.id}
                f={f}
                caseId={caseId}
                verdict={c.verdicts[f.question] ?? null}
              />
            ))
          )}
        </div>
      </Card>

      {/* Recommended options */}
      <Card className="overflow-hidden">
        <div className="flex gap-0">
          <span
            className="w-1 shrink-0"
            style={{ background: rec.tone }}
            aria-hidden
          />
          <div className="p-5">
            <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
              Recommended options for the committee
            </div>
            <div
              className="mt-1 font-display"
              style={{ fontWeight: 700, fontSize: 18, color: rec.tone }}
            >
              {rec.title}
            </div>
            <p className="mt-1 max-w-2xl text-[13px] text-ink-secondary">{rec.body}</p>
            <p className="mt-2 text-[11px] text-ink-tertiary">
              Drafted by the compiler. The decision is recorded at final review.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function QuestionRow({
  q,
  c,
}: {
  q: Question;
  c: Awaited<ReturnType<typeof getCaseById>>;
}) {
  const qs = c!.questionScores[q];
  const verdict = qs?.verdict ?? c!.verdicts[q] ?? null;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-2 px-4 py-3 sm:grid-cols-[150px_140px_1fr_90px]">
      <div className="text-[13px] font-medium text-ink">{QUESTION_LABEL[q]}</div>
      <div>{verdict ? <VerdictBadge verdict={verdict} size="sm" /> : <span className="text-[12px] text-ink-tertiary">—</span>}</div>
      <div className="min-w-0">
        {qs ? (
          <ScoreInterval point={qs.qPoint} low={qs.qLow} high={qs.qHigh} />
        ) : (
          <span className="text-[12px] text-ink-tertiary">Not scored</span>
        )}
      </div>
      <div className="flex flex-col items-start gap-1 sm:items-end">
        {qs ? (
          <>
            <div className="w-full max-w-[120px]">
              <CoverageSounding coverage={qs.coverage} showValue />
            </div>
            <span className="text-[10px] text-ink-tertiary tabular">EF {fmtNum(qs.ef)}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function FindingLine({
  f,
  caseId,
  verdict,
}: {
  f: Finding;
  caseId: string;
  verdict: Verdict | null;
}) {
  const isAllegation = f.status === "ALLEGATION";
  return (
    <Link
      href={`/cases/${caseId}/findings`}
      className="flex items-start gap-3 px-4 py-3 hover:bg-shoal/30"
    >
      <SeverityBars severity={f.severity} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-ink">{f.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Chip tone="muted">{QUESTION_LABEL[f.question]}</Chip>
          <Chip tone={isAllegation ? "attention" : "muted"}>
            {isAllegation
              ? "Allegation — undecided"
              : f.status === "CONFIRMED"
                ? "Confirmed"
                : "Dismissed"}
          </Chip>
        </div>
      </div>
      {verdict ? <VerdictBadge verdict={verdict} size="sm" /> : null}
    </Link>
  );
}

function Banner({
  children,
  tone,
  attention,
}: {
  children: React.ReactNode;
  tone: string;
  attention?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border px-4 py-3 text-[13px]"
      style={{ borderColor: tone, color: tone }}
      role={attention ? "status" : undefined}
    >
      {children}
    </div>
  );
}
