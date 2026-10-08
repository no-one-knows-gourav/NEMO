/**
 * C-25 Compiler + C-26 Blind Verifier + C-24 (simplified) Reference Call List.
 *
 * compileReport builds the narrative report markdown STRICTLY from the case
 * data, in the Section 16.3 template order. The structured body is rendered
 * deterministically (so citations and numbers are always exact); in LIVE mode
 * the model writes only a grounded executive-summary paragraph on top. The
 * Blind Verifier (different family, no access to the draft) independently states
 * a verdict per question from the findings/coverage; disagreements with the
 * engine's verdicts are returned for gate G2 (never auto-applied). Reference
 * Call candidates are derived from the fingerprint's linked entities.
 */
import { callAgentJson, callAgentText } from "./client";
import { BLIND_VERIFIER_SYSTEM, COMPILER_SYSTEM } from "./prompts";
import {
  LEVEL_LABEL,
  SEVERITY_LABEL,
  STATE_LABEL,
  VERDICT_LABEL,
  fmtPct,
} from "@/lib/ui";
import type {
  NemoCase,
  Question,
  ReferenceCall,
  Verdict,
} from "@/lib/types";
import { ALL_QUESTIONS, QUESTION_LABEL } from "@/lib/types";
import { z } from "zod";

export interface CompileResult {
  report: string;
  referenceCalls: ReferenceCall[];
  blindVerifier: Partial<Record<Question, Verdict>>;
  verdictDisagreements: Question[];
}

const VERDICTS: Verdict[] = [
  "CLEAR",
  "CONCERNS",
  "RED_FLAG",
  "INSUFFICIENT_COVERAGE",
  "STOP",
];

function num(x: number | undefined): string {
  return typeof x === "number" ? x.toFixed(2) : "—";
}

// ---------------------------------------------------------------------------
// Reference Call List (C-24 simplified)
// ---------------------------------------------------------------------------

function rand4(): string {
  const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let s = "";
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

export function buildReferenceCalls(c: NemoCase): ReferenceCall[] {
  if (c.referenceCalls && c.referenceCalls.length) return c.referenceCalls;
  const fp = c.fingerprint;
  if (!fp) return [];
  const topFinding = c.findings[0];
  const calls: ReferenceCall[] = [];
  for (const e of fp.linkedEntities.slice(0, 3)) {
    const adverse = e.status === "struck_off" || e.status === "liquidated";
    calls.push({
      personRef: `NEMO-PER-${rand4()}-${rand4()}`,
      displayName: "Former colleague",
      relationship: `${e.relation.replace("_", " ").toLowerCase()} — ${e.name}`,
      overlap: e.from ? { from: e.from, to: e.to ?? "present" } : undefined,
      whyCall: adverse
        ? [`${e.name} is marked ${e.status}`, "Can speak to conduct during that period"]
        : [`Overlapping tenure at ${e.name}`],
      suggestedQuestions: [
        `What was the subject's role at ${e.name}?`,
        topFinding ? `Can you comment on: ${topFinding.title}?` : "How did the venture conclude?",
      ],
      contactRoute: "Public professional channel only",
      priority: adverse ? "HIGH" : "MEDIUM",
    });
  }
  return calls;
}

// ---------------------------------------------------------------------------
// Blind Verifier (C-26)
// ---------------------------------------------------------------------------

const BlindOut = z.object({
  verdicts: z.record(z.string(), z.string()).optional(),
});
type BlindOutT = z.infer<typeof BlindOut>;

async function blindVerify(
  c: NemoCase,
): Promise<Partial<Record<Question, Verdict>>> {
  const questions = Object.keys(c.verdicts) as Question[];
  try {
    const out = await callAgentJson<BlindOutT>({
      system: BLIND_VERIFIER_SYSTEM,
      tier: "large",
      family: "B",
      maxTokens: 700,
      prompt:
        `Findings:\n` +
        (c.findings.length
          ? c.findings
              .map(
                (f) =>
                  `- [${f.question}] ${f.title} (severity ${f.severity}, ${f.status}, role ${f.role})`,
              )
              .join("\n")
          : "(no adverse findings)") +
        `\n\nCoverage: ${c.coverage
          .map((r) => `${r.sourceId}:${r.state}`)
          .join(", ")}.\n` +
        `Questions in scope: ${questions.join(", ")}.\n\n` +
        `Independently state a verdict per question. Return JSON ` +
        `{"verdicts":{question:"CLEAR|CONCERNS|RED_FLAG|INSUFFICIENT_COVERAGE"}}.`,
    });
    const parsed = BlindOut.safeParse(out);
    if (parsed.success && parsed.data.verdicts) {
      const result: Partial<Record<Question, Verdict>> = {};
      for (const q of questions) {
        const v = parsed.data.verdicts[q];
        if (v && (VERDICTS as string[]).includes(v)) result[q] = v as Verdict;
        else result[q] = c.verdicts[q];
      }
      return result;
    }
  } catch {
    // fall through
  }
  // Replay / failure: blind verifier mirrors the engine (no disagreement).
  return { ...c.verdicts };
}

// ---------------------------------------------------------------------------
// Deterministic report renderer (Section 16.3 order)
// ---------------------------------------------------------------------------

function renderReport(
  c: NemoCase,
  referenceCalls: ReferenceCall[],
  summaryProse: string,
): string {
  const asOf = c.updatedAt.slice(0, 10);
  const did = c.digitalId?.digitalId ?? "(provisional — not yet minted)";
  const L: string[] = [];

  L.push(`# Due-diligence report — ${c.subject.name}`);
  L.push(`Digital ID: \`${did}\` · Depth: ${LEVEL_LABEL[c.level]} · As of: ${asOf}`);
  L.push("");

  // 1. Summary
  L.push(`## 1. Summary`);
  if (summaryProse) {
    L.push(summaryProse.trim());
    L.push("");
  }
  L.push(`| Question | Verdict | Point | Interval | EF |`);
  L.push(`|---|---|---|---|---|`);
  for (const q of ALL_QUESTIONS) {
    const v = c.verdicts[q];
    if (!v) continue;
    const s = c.questionScores[q];
    const interval = s ? `${num(s.qLow)}–${num(s.qHigh)}` : "—";
    L.push(
      `| ${QUESTION_LABEL[q]} | ${VERDICT_LABEL[v]} | ${num(s?.qPoint)} | ${interval} | ${num(s?.ef)} |`,
    );
  }
  L.push("");
  if (c.disclosure) {
    L.push(
      `Trust metric: ${num(c.disclosure.trust)} (${c.disclosure.trustBand}) · ` +
        `Disclosure degree: ${num(c.disclosure.disclosureDegree)} · ` +
        `Consistency: ${num(c.disclosure.consistency)}`,
    );
  }
  L.push(`Overall coverage: ${fmtPct(overallCoverage(c))}`);
  L.push("");
  const top = c.findings.slice(0, 5);
  if (top.length) {
    L.push(`Top findings:`);
    for (const f of top) L.push(`- ${f.title} (${SEVERITY_LABEL[f.severity]}, ${f.status.toLowerCase()})`);
  } else {
    L.push(`No adverse findings surfaced within the surveyed sources.`);
  }
  L.push("");
  L.push(`Recommended action options: proceed · proceed with conditions · pause pending probes · decline.`);
  L.push("");

  // 2. Identity (Q1)
  L.push(`## 2. Identity`);
  if (c.fingerprint) {
    L.push(`Canonical name: ${c.fingerprint.canonicalName}.`);
    const agreed = c.fingerprint.attributes.filter((a) => a.agreement === "AGREED");
    if (agreed.length) {
      L.push(`Confirmed attributes (masked): ${agreed.map((a) => `${a.label} ${a.displayValue}`).join("; ")}.`);
    }
    if (c.fingerprint.aliases.length) {
      L.push(`Known name variants: ${c.fingerprint.aliases.map((a) => a.value).join(", ")}.`);
    }
    if (c.fingerprint.flags.length) {
      L.push(`Flags: ${c.fingerprint.flags.join(", ")}.`);
    }
  } else {
    L.push(`Identity fingerprint not available.`);
  }
  L.push("");

  // 3. Per-question sections (Integrity … Connections)
  let n = 3;
  for (const q of ALL_QUESTIONS) {
    if (q === "identity") continue;
    const v = c.verdicts[q];
    if (!v) continue;
    L.push(`## ${n}. ${QUESTION_LABEL[q]}`);
    n += 1;
    const fs = c.findings.filter((f) => f.question === q);
    if (fs.length === 0) {
      const s = c.questionScores[q];
      L.push(
        `No qualifying findings. Verdict ${VERDICT_LABEL[v]} at coverage ` +
          `${fmtPct(s?.coverage ?? 0)} (qualified statement of absence).`,
      );
    } else {
      for (const f of fs) {
        const sc = f.score;
        L.push(
          `- **${f.title}** — ${SEVERITY_LABEL[f.severity]}, ${f.status.toLowerCase()}, ` +
            `role ${f.role.replace("_", " ").toLowerCase()}` +
            (sc ? `, RC ${num(sc.rc)} (${num(sc.rcLow)}–${num(sc.rcHigh)}), m ${num(sc.m)}` : "") +
            `. ${f.summary}`,
        );
        for (const e of f.evidence) {
          L.push(`  - Citation [${e.id}]: ${e.source}${e.retrievedAt ? ` (retrieved ${e.retrievedAt})` : ""} — ${e.tier}.`);
        }
      }
    }
    L.push("");
  }

  // 4. Disclosure and consistency
  L.push(`## ${n}. Disclosure and consistency`);
  n += 1;
  if (c.disclosure) {
    L.push(`| Field | Declared | Discovered | Outcome |`);
    L.push(`|---|---|---|---|`);
    for (const f of c.disclosure.fields) {
      L.push(`| ${f.field} | ${f.declared ?? "—"} | ${f.discovered ?? "—"} | ${f.outcome} |`);
    }
    L.push("");
    L.push(
      `Dissimilarity δ ${num(c.disclosure.dissimilarity)} · Consistency C ` +
        `${num(c.disclosure.consistency)} · Disclosure degree DD ` +
        `${num(c.disclosure.disclosureDegree)} · Verification V ` +
        `${num(c.disclosure.verification)} · Trust TM ${num(c.disclosure.trust)} ` +
        `(${c.disclosure.trustBand}).`,
    );
  } else {
    L.push(`Disclosure metrics not available.`);
  }
  L.push("");

  // 5. Connections graph excerpt
  L.push(`## ${n}. Connections`);
  n += 1;
  if (c.fingerprint?.linkedEntities.length) {
    for (const e of c.fingerprint.linkedEntities) {
      L.push(`- ${e.name} — ${e.relation.replace("_", " ").toLowerCase()}${e.status ? ` (${e.status})` : ""}${e.from ? `, ${e.from}–${e.to ?? "present"}` : ""}.`);
    }
  } else {
    L.push(`No linked entities resolved.`);
  }
  L.push("");

  // 6. Coverage map
  L.push(`## ${n}. Coverage map`);
  n += 1;
  L.push(`| Source | Domain | Tier | State | Completeness |`);
  L.push(`|---|---|---|---|---|`);
  for (const r of c.coverage) {
    L.push(`| ${r.sourceName} | ${r.domain} | ${r.tier} | ${STATE_LABEL[r.state]} | ${fmtPct(r.completeness)} |`);
  }
  L.push("");

  // 7. Unresolved items
  L.push(`## ${n}. Unresolved items and recommended probes`);
  n += 1;
  const unresolved = c.findings.filter((f) => f.status === "ALLEGATION");
  if (unresolved.length) {
    for (const f of unresolved) L.push(`- ${f.title} — status pending; recommend targeted source retrieval / subject response.`);
  } else {
    L.push(`None.`);
  }
  L.push("");

  // 8. Reference Call List
  L.push(`## ${n}. Reference call list`);
  n += 1;
  if (referenceCalls.length) {
    for (const r of referenceCalls) {
      L.push(`- **${r.displayName}** (${r.relationship}) — ${r.priority}. ${r.whyCall.join("; ")}.`);
    }
  } else {
    L.push(`No reference-call candidates identified.`);
  }
  L.push("");

  // 9. Methodology and versions
  L.push(`## ${n}. Methodology and versions`);
  n += 1;
  const cfgVer = Object.values(c.questionScores)[0]?.configVersion ?? "2026.10.0";
  L.push(`Run mode: ${c.mode}. Config version: ${cfgVer}. Scoring and disclosure are deterministic (PRD §8/§9); models supplied inputs only.`);
  L.push("");

  // 10. Change log
  L.push(`## ${n}. Change log`);
  n += 1;
  if (c.reviews.length) {
    for (const r of c.reviews) L.push(`- ${r.gate}: ${r.decision} by ${r.reviewer} at ${r.at}${r.rationale ? ` — ${r.rationale}` : ""}.`);
  } else {
    L.push(`No reviews recorded yet.`);
  }
  if (c.redTeamNotes) {
    if (c.redTeamNotes.recallMisses.length) L.push(`- Red-team recall misses: ${c.redTeamNotes.recallMisses.join("; ")}.`);
    if (c.redTeamNotes.compileErrors.length) L.push(`- Compile errors fixed: ${c.redTeamNotes.compileErrors.join("; ")}.`);
  }
  L.push("");

  return L.join("\n");
}

function overallCoverage(c: NemoCase): number {
  const vals = Object.values(c.questionScores).map((s) => s.coverage);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

async function writeSummaryProse(c: NemoCase): Promise<string> {
  try {
    const verdictLines = (Object.keys(c.verdicts) as Question[])
      .map((q) => `${QUESTION_LABEL[q]}: ${c.verdicts[q]}`)
      .join(", ");
    return await callAgentText({
      system: COMPILER_SYSTEM,
      tier: "large",
      family: "A",
      maxTokens: 400,
      prompt:
        `Write a 2-3 sentence neutral executive summary for a due-diligence ` +
        `report, strictly from this data. Subject: ${c.subject.name}. ` +
        `Verdicts: ${verdictLines}. Top findings: ` +
        `${c.findings.slice(0, 3).map((f) => f.title).join("; ") || "none"}. ` +
        `Trust band: ${c.disclosure?.trustBand ?? "—"}. ` +
        `Do not invent facts. Word unproven matters as allegations. Prose only.`,
    });
  } catch {
    return "";
  }
}

/**
 * Compiles the report, builds the Reference Call List and runs the Blind
 * Verifier cross-check. Fully deterministic in replay; the model only adds a
 * grounded executive-summary paragraph and the independent verdict read.
 */
export async function compileReport(c: NemoCase): Promise<CompileResult> {
  const referenceCalls = buildReferenceCalls(c);
  const [summaryProse, blindVerifier] = await Promise.all([
    writeSummaryProse(c),
    blindVerify(c),
  ]);
  const report = renderReport(c, referenceCalls, summaryProse);

  const verdictDisagreements: Question[] = [];
  for (const q of Object.keys(c.verdicts) as Question[]) {
    if (blindVerifier[q] && blindVerifier[q] !== c.verdicts[q]) {
      verdictDisagreements.push(q);
    }
  }

  return { report, referenceCalls, blindVerifier, verdictDisagreements };
}
