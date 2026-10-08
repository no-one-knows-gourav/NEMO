/**
 * Final review / Gate G2 (UI spec §6.9, PRD 14.2 + 16.3 report template).
 * The report is rendered from case data in the PRD 16.3 section order. Report
 * body is set in font-serif; verbatim source excerpts are italic serif (brand
 * rule). Findings reveal their source inline via native <details>. Rendered
 * inside the case layout.
 */
import { notFound } from "next/navigation";
import {
  AttentionDot,
  Card,
  CardHeader,
  Chip,
  SeverityBars,
  TierMark,
  VerdictBadge,
} from "@/components/ui/primitives";
import { CoverageSounding, ScoreInterval } from "@/components/ui/score";
import { GateReview } from "@/components/viz/GateReview";
import { resolveDigitalId } from "@/components/viz/digitalId";
import { getCaseById } from "@/lib/data";
import type {
  AlignmentOutcome,
  Finding,
  NemoCase,
  Question,
  RetrievalState,
  Severity,
} from "@/lib/types";
import { ALL_QUESTIONS, QUESTION_LABEL } from "@/lib/types";
import { fmtNum, fmtPct } from "@/lib/ui";

export const dynamic = "force-dynamic";

const SEV_RANK: Record<Severity, number> = { S1: 5, S2: 4, S3: 3, S4: 2, S5: 1 };

const OUTCOME_LABEL: Record<AlignmentOutcome, string> = {
  AGREE: "Agrees",
  MINOR_VARIANCE: "Minor variance",
  DECLARED_NOT_FOUND: "Declared, not found",
  FOUND_NOT_DECLARED: "Found, not declared",
  CONFLICT: "Conflict",
};

const STATE_WORD: Record<RetrievalState, string> = {
  FOUND_RETRIEVED: "Searched in full",
  FOUND_NOT_RETRIEVED: "Found, not yet retrieved",
  NOT_FOUND: "Searched, nothing found",
  UNREACHABLE: "Could not reach",
  PARTIAL: "Partly searched",
  OUT_OF_SCOPE: "Out of scope",
};

function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="scroll-mt-4">
      <h3
        className="font-display text-ink"
        style={{ fontWeight: 700, fontSize: 15 }}
      >
        <span className="mr-2 tabular text-ink-tertiary">{n}</span>
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function FindingBlock({ f }: { f: Finding }) {
  return (
    <div className="border-l-2 border-rule pl-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-medium text-ink">{f.title}</span>
        <SeverityBars severity={f.severity} />
        <Chip tone={f.status === "ALLEGATION" ? "attention" : "muted"}>
          {f.status === "ALLEGATION"
            ? "Allegation — undecided"
            : f.status === "CONFIRMED"
              ? "Confirmed"
              : "Dismissed"}
        </Chip>
        {f.legalStatus ? (
          <span className="text-[11px] text-ink-tertiary">{f.legalStatus}</span>
        ) : null}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{f.summary}</p>
      {f.score ? (
        <div className="mt-1 flex flex-wrap gap-4 text-[11px] text-ink-tertiary">
          <span className="tabular">
            SoE {fmtNum(f.score.soeEvent)} · m {fmtNum(f.score.m)} · RC{" "}
            {fmtNum(f.score.rc)} ({fmtNum(f.score.rcLow)}–{fmtNum(f.score.rcHigh)})
          </span>
        </div>
      ) : null}
      {f.evidence.length > 0 ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] text-fathom hover:underline">
            Source{f.evidence.length > 1 ? "s" : ""} ({f.evidence.length})
          </summary>
          <div className="mt-1.5 space-y-2">
            {f.evidence.map((e) => (
              <div key={e.id} className="rounded-md border border-rule bg-survey/60 px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-tertiary">
                  <TierMark tier={e.tier} />
                  <span>{e.source}</span>
                  {e.location ? <span>· {e.location}</span> : null}
                  {e.retrievedAt ? <span>· retrieved {e.retrievedAt}</span> : null}
                  {typeof e.entailment === "number" ? (
                    <span className="tabular">· entailment {fmtNum(e.entailment)}</span>
                  ) : null}
                </div>
                {e.excerpt ? (
                  <p className="mt-1 font-serif text-[13px] italic text-ink">
                    &ldquo;{e.excerpt}&rdquo;
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function unresolvedItems(c: NemoCase): string[] {
  const out: string[] = [];
  for (const row of c.coverage) {
    if (row.state === "UNREACHABLE" || row.state === "PARTIAL" || row.state === "FOUND_NOT_RETRIEVED") {
      out.push(
        `${row.sourceName}: ${STATE_WORD[row.state]}${
          row.errorClass ? ` (${row.errorClass})` : ""
        }${row.state === "PARTIAL" ? ` — ${fmtPct(row.completeness)} complete` : ""}`,
      );
    }
  }
  for (const f of c.findings) {
    if (f.status === "ALLEGATION" && f.legalStatus === "PENDING") {
      out.push(`${f.title} — matter pending, revisit on disposal`);
    }
  }
  return out;
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const c = await getCaseById(caseId);
  if (!c) notFound();

  const did = resolveDigitalId(c);
  const answered = ALL_QUESTIONS.filter((q) => c.questionScores[q]);
  const topFindings = [...c.findings]
    .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity])
    .slice(0, 5);
  const unresolved = unresolvedItems(c);
  const configVersion =
    Object.values(c.questionScores)[0]?.configVersion ?? "—";

  const seriousUnopened = c.findings.filter(
    (f) => f.status === "CONFIRMED" && SEV_RANK[f.severity] >= 3 && !f.humanReview,
  ).length;

  const disagreements = c.events.filter(
    (e) =>
      /disagree|split|verifier|concerns vs|red flag vs/i.test(e.message) &&
      (e.level === "warn" || e.level === "info"),
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-ink" style={{ fontWeight: 700, fontSize: 17 }}>
            Final review
          </h2>
          <p className="mt-0.5 text-[12px] text-ink-secondary">
            Verify the report, open the sources for serious findings, resolve
            disagreements, then approve or request a change.
          </p>
        </div>
        <span className="font-mono text-[11px] text-ink-tertiary">
          {did.digitalId} · v{did.version}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Report body */}
        <Card className="font-serif">
          <div className="space-y-6 px-5 py-5">
            {/* 1. Summary */}
            <Section n={1} title="Summary">
              <div className="space-y-3 text-[13px] text-ink-secondary">
                <div className="flex flex-wrap gap-x-6 gap-y-1 font-sans text-[12px]">
                  <span>
                    <span className="text-ink-tertiary">Subject</span>{" "}
                    <span className="text-ink">{c.subject.name}</span>
                  </span>
                  <span>
                    <span className="text-ink-tertiary">Digital ID</span>{" "}
                    <span className="font-mono text-ink">{did.digitalId}</span>
                  </span>
                  <span>
                    <span className="text-ink-tertiary">Depth</span>{" "}
                    <span className="text-ink">{c.level}</span>
                  </span>
                  <span>
                    <span className="text-ink-tertiary">As of</span>{" "}
                    <span className="tabular text-ink">{did.asOf}</span>
                  </span>
                </div>

                {/* Verdict table */}
                <div className="overflow-x-auto rounded-md border border-rule font-sans">
                  <table className="w-full border-collapse text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-rule text-[11px] uppercase tracking-wide text-ink-tertiary">
                        <th className="px-3 py-1.5 font-medium">Question</th>
                        <th className="px-3 py-1.5 font-medium">Verdict</th>
                        <th className="px-3 py-1.5 font-medium">Score (interval)</th>
                        <th className="px-3 py-1.5 font-medium">EF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rule">
                      {ALL_QUESTIONS.map((q) => {
                        const qs = c.questionScores[q];
                        const v = c.verdicts[q] ?? "INSUFFICIENT_COVERAGE";
                        return (
                          <tr key={q}>
                            <td className="px-3 py-1.5 text-ink">{QUESTION_LABEL[q]}</td>
                            <td className="px-3 py-1.5">
                              <VerdictBadge verdict={v} size="sm" />
                            </td>
                            <td className="px-3 py-1.5">
                              {qs ? (
                                <span className="tabular text-ink-secondary">
                                  {fmtNum(qs.qPoint)}{" "}
                                  <span className="text-ink-tertiary">
                                    ({fmtNum(qs.qLow)}–{fmtNum(qs.qHigh)})
                                  </span>
                                </span>
                              ) : (
                                <span className="text-ink-tertiary">—</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 tabular text-ink-secondary">
                              {qs ? fmtNum(qs.ef) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap gap-x-6 gap-y-1 font-sans text-[12px]">
                  <span>
                    <span className="text-ink-tertiary">Consistency (TM)</span>{" "}
                    <span className="tabular text-ink">{fmtNum(did.disclosure.tm)}</span>{" "}
                    {c.disclosure ? (
                      <span className="text-ink-tertiary">({c.disclosure.trustBand})</span>
                    ) : null}
                  </span>
                  <span>
                    <span className="text-ink-tertiary">Disclosure (DD)</span>{" "}
                    <span className="tabular text-ink">{fmtNum(did.disclosure.dd)}</span>
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="text-ink-tertiary">Overall coverage</span>
                    <span className="inline-block w-24">
                      <CoverageSounding coverage={did.coverage.overall} />
                    </span>
                  </span>
                </div>

                <div className="font-sans">
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-tertiary">
                    Top findings
                  </div>
                  <ul className="space-y-1">
                    {topFindings.map((f) => (
                      <li key={f.id} className="flex items-center gap-2 text-[12px] text-ink">
                        <SeverityBars severity={f.severity} />
                        {f.title}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="font-sans">
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-tertiary">
                    Recommended actions for the committee
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {["Proceed", "Proceed with conditions", "Pause pending follow-ups", "Decline"].map(
                      (a) => (
                        <Chip key={a}>{a}</Chip>
                      ),
                    )}
                  </div>
                </div>
              </div>
            </Section>

            {/* 2–8 per-question findings */}
            {answered.map((q, i) => {
              const fs = c.findings.filter((f) => f.question === q);
              const qs = c.questionScores[q];
              return (
                <Section key={q} n={2 + i} title={QUESTION_LABEL[q]}>
                  <div className="mb-2 flex items-center gap-2 font-sans">
                    <VerdictBadge verdict={c.verdicts[q] ?? "INSUFFICIENT_COVERAGE"} size="sm" />
                    {qs ? (
                      <span className="inline-block w-48">
                        <ScoreInterval point={qs.qPoint} low={qs.qLow} high={qs.qHigh} />
                      </span>
                    ) : null}
                  </div>
                  {fs.length > 0 ? (
                    <div className="space-y-3">
                      {fs.map((f) => (
                        <FindingBlock key={f.id} f={f} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[13px] italic text-ink-tertiary">
                      No adverse findings. Required sources were searched
                      {qs ? ` (coverage ${fmtPct(qs.coverage)})` : ""}; nothing of concern was returned.
                    </p>
                  )}
                </Section>
              );
            })}

            {/* Declared vs discovered */}
            {c.disclosure ? (
              <Section n={2 + answered.length} title="Disclosure and consistency">
                <div className="overflow-x-auto rounded-md border border-rule font-sans">
                  <table className="w-full border-collapse text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-rule text-[11px] uppercase tracking-wide text-ink-tertiary">
                        <th className="px-3 py-1.5 font-medium">Field</th>
                        <th className="px-3 py-1.5 font-medium">Declared</th>
                        <th className="px-3 py-1.5 font-medium">Discovered</th>
                        <th className="px-3 py-1.5 font-medium">Outcome</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rule">
                      {c.disclosure.fields.map((f) => {
                        const mismatch = f.outcome !== "AGREE";
                        return (
                          <tr key={f.field} className={mismatch ? "bg-magenta/5" : undefined}>
                            <td className="px-3 py-1.5 text-ink">{f.field}</td>
                            <td className="px-3 py-1.5 text-ink-secondary">{f.declared ?? "—"}</td>
                            <td className="px-3 py-1.5 text-ink-secondary">{f.discovered ?? "—"}</td>
                            <td className="px-3 py-1.5">
                              <span
                                className={
                                  mismatch
                                    ? "inline-flex items-center gap-1.5 text-magenta"
                                    : "text-ink-secondary"
                                }
                              >
                                {mismatch ? <AttentionDot /> : null}
                                {OUTCOME_LABEL[f.outcome]}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 font-sans text-[11px] text-ink-tertiary">
                  Consistency {fmtNum(c.disclosure.trust)} · Disclosure{" "}
                  {fmtNum(c.disclosure.disclosureDegree)} · Verified{" "}
                  {fmtNum(c.disclosure.verification)} · Difference{" "}
                  {fmtNum(c.disclosure.dissimilarity)}.{" "}
                  <a href={`/cases/${c.id}/crossover`} className="text-fathom hover:underline">
                    Open the registration view
                  </a>
                  .
                </p>
              </Section>
            ) : null}

            {/* Coverage map */}
            <Section n={3 + answered.length} title="Coverage map">
              <div className="overflow-x-auto rounded-md border border-rule font-sans">
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-rule text-[11px] uppercase tracking-wide text-ink-tertiary">
                      <th className="px-3 py-1.5 font-medium">Source</th>
                      <th className="px-3 py-1.5 font-medium">Tier</th>
                      <th className="px-3 py-1.5 font-medium">State</th>
                      <th className="px-3 py-1.5 font-medium">Completeness</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {c.coverage.map((row) => (
                      <tr key={row.sourceId}>
                        <td className="px-3 py-1.5 text-ink">{row.sourceName}</td>
                        <td className="px-3 py-1.5">
                          <TierMark tier={row.tier} />
                        </td>
                        <td className="px-3 py-1.5 text-ink-secondary">{STATE_WORD[row.state]}</td>
                        <td className="px-3 py-1.5">
                          <span className="inline-block w-24">
                            <CoverageSounding coverage={row.completeness} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* Unresolved */}
            <Section n={4 + answered.length} title="Unresolved items and recommended probes">
              {unresolved.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 font-sans text-[12px] text-ink-secondary">
                  {unresolved.map((u, idx) => (
                    <li key={idx}>{u}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] italic text-ink-tertiary">Nothing outstanding.</p>
              )}
            </Section>

            {/* Reference calls */}
            {c.referenceCalls.length > 0 ? (
              <Section n={5 + answered.length} title="Reference call list">
                <div className="space-y-2 font-sans">
                  {c.referenceCalls.map((r) => (
                    <div key={r.personRef} className="rounded-md border border-rule px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] text-ink">
                          {r.displayName} · {r.relationship}
                        </span>
                        <Chip tone={r.priority === "HIGH" ? "attention" : "muted"}>
                          {r.priority} priority
                        </Chip>
                      </div>
                      <ul className="mt-1 list-disc pl-5 text-[11px] text-ink-secondary">
                        {r.whyCall.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                      <div className="mt-1 text-[11px] text-ink-tertiary">
                        Contact route: {r.contactRoute}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            ) : null}

            {/* Methodology */}
            <Section n={6 + answered.length} title="Methodology and versions">
              <ul className="space-y-1 font-sans text-[12px] text-ink-secondary">
                <li>Mode: {c.mode === "live" ? "Live (LLM-backed)" : "Replay (seeded)"}.</li>
                <li>Scoring config: {configVersion}.</li>
                <li>
                  Rules applied:{" "}
                  {(c.plan?.rulesApplied ?? [])
                    .map((r) => `${r.ruleId} ${r.version}`)
                    .join(", ") || "—"}
                  .
                </li>
                <li>Legal basis: {c.plan?.legalBasis ?? "—"}.</li>
              </ul>
            </Section>

            {/* Change log */}
            <Section n={7 + answered.length} title="Change log">
              <ul className="space-y-1 font-sans text-[12px] text-ink-secondary">
                {c.reviews.map((r, i) => (
                  <li key={i}>
                    <span className="tabular text-ink-tertiary">{r.at.slice(0, 10)}</span> — Gate{" "}
                    {r.gate} {r.decision.toLowerCase()} by {r.reviewer}
                    {r.rationale ? `: ${r.rationale}` : ""}
                  </li>
                ))}
                {c.changeRequests.map((cr) => (
                  <li key={cr.crId}>
                    <span className="tabular text-ink-tertiary">{cr.createdAt.slice(0, 10)}</span> —{" "}
                    {cr.type} ({cr.gate}): {cr.rawComment}
                  </li>
                ))}
                {c.reviews.length === 0 && c.changeRequests.length === 0 ? (
                  <li>No changes yet.</li>
                ) : null}
              </ul>
            </Section>

            {/* Optional compiled markdown */}
            {c.report ? (
              <Section n={8 + answered.length} title="Compiled narrative">
                <pre className="whitespace-pre-wrap font-serif text-[13px] leading-relaxed text-ink">
                  {c.report}
                </pre>
              </Section>
            ) : null}
          </div>
        </Card>

        {/* Review checklist rail */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader title="Before you approve" subtitle="Serious findings and disagreements" />
            <div className="space-y-2 px-4 pb-4 pt-2 text-[12px]">
              <div className="flex items-center gap-2">
                {seriousUnopened > 0 ? <AttentionDot /> : null}
                <span className="text-ink-secondary">
                  {seriousUnopened > 0
                    ? `Open the source for ${seriousUnopened} serious finding${seriousUnopened === 1 ? "" : "s"}`
                    : "All serious-finding sources reviewed"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {disagreements.length > 0 ? <AttentionDot /> : null}
                <span className="text-ink-secondary">
                  {disagreements.length > 0
                    ? `Resolve ${disagreements.length} disagreement${disagreements.length === 1 ? "" : "s"}`
                    : "No open disagreements"}
                </span>
              </div>
            </div>
          </Card>

          {disagreements.length > 0 ? (
            <Card>
              <CardHeader title="Judge disagreements" subtitle="Writer vs blind verifier" />
              <div className="space-y-2 px-4 pb-4 pt-2 text-[12px] text-ink-secondary">
                {disagreements.map((d) => (
                  <div key={d.id} className="rounded-md border border-rule px-2.5 py-2">
                    <div className="text-[11px] text-ink-tertiary">{d.component}</div>
                    {d.message}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {c.redTeamNotes ? (
            <Card>
              <CardHeader title="Independent recheck" subtitle="Red-team notes" />
              <div className="space-y-2 px-4 pb-4 pt-2 text-[12px] text-ink-secondary">
                {c.redTeamNotes.recallMisses.length > 0 ? (
                  <div>
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] text-ink-tertiary">
                      <AttentionDot /> Missed items found and added
                    </div>
                    <ul className="list-disc space-y-1 pl-5">
                      {c.redTeamNotes.recallMisses.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {c.redTeamNotes.compileErrors.length > 0 ? (
                  <div>
                    <div className="mb-1 text-[11px] text-ink-tertiary">Fixed before review</div>
                    <ul className="list-disc space-y-1 pl-5">
                      {c.redTeamNotes.compileErrors.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          <GateReview
            caseId={c.id}
            gate="G2"
            approveLabel="Approve"
            overridable
            questions={answered as Question[]}
            blocked={
              seriousUnopened > 0
                ? "Open every serious-finding source before approving"
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
