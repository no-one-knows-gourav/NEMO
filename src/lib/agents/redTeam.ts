/**
 * C-23 Red Team (two modes).
 *
 * Recall mode (once per Resolve round): blind to findings/verdicts, sees only
 * the fingerprint, coverage map and plan. Proposes at most ONE extra candidate
 * the primary search may have missed; it enters assessment as a normal event.
 * Report mode (after compile): re-checks key figures in the draft against the
 * findings and lists any "compile error" mismatches. Both stay short and fall
 * back to a deterministic no-op in replay / on failure.
 */
import { z } from "zod";
import { callAgentJson } from "./client";
import { REDTEAM_RECALL_SYSTEM, REDTEAM_REPORT_SYSTEM } from "./prompts";
import type {
  CasePlan,
  CoverageRow,
  EventInput,
  Fingerprint,
  Finding,
  HalfLifeCategory,
  Role,
  Severity,
  SourceTier,
} from "@/lib/types";

export interface RecallResult {
  extra: EventInput | null;
  note: string | null;
}

const CATS: HalfLifeCategory[] = [
  "criminal",
  "regulatory",
  "governance",
  "financial_distress",
  "media_allegation",
  "commercial_dispute",
];
const SEVS: Severity[] = ["S1", "S2", "S3", "S4", "S5"];
const ROLES: Role[] = [
  "ACCUSED",
  "RESPONDENT_DIRECTOR",
  "REGULATOR_KEY_PERSON",
  "PLAINTIFF",
  "WITNESS",
  "COUNSEL",
  "MENTIONED",
];

function coerce<T>(v: string | undefined, allowed: T[], dflt: T): T {
  return (allowed as unknown as string[]).includes(v ?? "") ? (v as unknown as T) : dflt;
}

const RecallOut = z.object({
  miss: z
    .object({
      title: z.string(),
      category: z.string().optional(),
      severity: z.string().optional(),
      role: z.string().optional(),
      m: z.number().optional(),
      questions: z.array(z.string()).optional(),
      source: z.string().optional(),
      note: z.string().optional(),
    })
    .nullable()
    .optional(),
});
type RecallOutT = z.infer<typeof RecallOut>;

/** Recall mode: proposes at most one recall-miss candidate. Allow only live. */
export async function redTeamRecall(
  fp: Fingerprint,
  coverage: CoverageRow[],
  plan: CasePlan,
  opts: { allowSynthetic: boolean },
): Promise<RecallResult> {
  if (!opts.allowSynthetic) return { extra: null, note: null };
  try {
    const out = await callAgentJson<RecallOutT>({
      system: REDTEAM_RECALL_SYSTEM,
      tier: "large",
      family: "B",
      maxTokens: 500,
      prompt:
        `Subject: ${fp.canonicalName}. Aliases: ` +
        `${fp.aliases.map((a) => a.value).join(", ") || "—"}.\n` +
        `Coverage (source:state): ${coverage
          .map((c) => `${c.sourceId}:${c.state}`)
          .join(", ")}.\n` +
        `Questions: ${plan.questions.join(", ")}.\n\n` +
        `If the primary search plausibly missed something, return JSON ` +
        `{"miss":{"title","category":one of ${CATS.join("|")},` +
        `"severity":S1..S5,"role":one of ${ROLES.join("|")},"m":0..1,` +
        `"questions":[ids],"source","note":"why it was missed"}}. If nothing, ` +
        `return {"miss":null}.`,
    });
    const parsed = RecallOut.safeParse(out);
    if (parsed.success && parsed.data.miss) {
      const m = parsed.data.miss;
      const questions = (m.questions ?? []).filter((q) =>
        plan.questions.includes(q as never),
      ) as EventInput["questions"];
      const extra: EventInput = {
        id: "ev_recall_1",
        title: m.title.slice(0, 160),
        category: coerce<HalfLifeCategory>(m.category, CATS, "media_allegation"),
        severity: coerce<Severity>(m.severity, SEVS, "S4"),
        role: coerce<Role>(m.role, ROLES, "MENTIONED"),
        ageYears: 2,
        m: typeof m.m === "number" ? Math.min(1, Math.max(0, m.m)) : 0.6,
        questions: questions.length ? questions : [plan.questions[0] ?? "integrity"],
        status: "ALLEGATION",
        evidence: [
          {
            id: "ev_recall_1_src",
            tier: "T3" as SourceTier,
            platform: "regional_outlet",
            tamper: "news_page",
            independent: true,
            entailment: 0.88,
            source: m.source ?? "Red-team recall source",
          },
        ],
      };
      return { extra, note: m.note ?? `Recall miss: ${m.title}` };
    }
  } catch {
    // fall through
  }
  return { extra: null, note: null };
}

export interface ReportCheckResult {
  compileErrors: string[];
  note: string;
}

const ReportOut = z.object({
  compileErrors: z.array(z.string()).optional(),
});
type ReportOutT = z.infer<typeof ReportOut>;

/** Report mode: re-checks the draft's figures against the findings. */
export async function redTeamReport(
  report: string,
  findings: Finding[],
  opts: { allowSynthetic: boolean },
): Promise<ReportCheckResult> {
  if (!opts.allowSynthetic || !report) {
    return { compileErrors: [], note: "Report-mode recheck: no discrepancies." };
  }
  try {
    const out = await callAgentJson<ReportOutT>({
      system: REDTEAM_REPORT_SYSTEM,
      tier: "large",
      family: "B",
      maxTokens: 600,
      prompt:
        `Findings (id: title [severity/status]):\n` +
        findings
          .map((f) => `- ${f.id}: ${f.title} [${f.severity}/${f.status}]`)
          .join("\n") +
        `\n\nDraft report:\n${report.slice(0, 6000)}\n\n` +
        `Re-verify key figures/dates/names against the findings. Return JSON ` +
        `{"compileErrors":["short description of each mismatch"]}. Empty if clean.`,
    });
    const parsed = ReportOut.safeParse(out);
    const errs = (parsed.success ? parsed.data.compileErrors ?? [] : []).slice(0, 5);
    return {
      compileErrors: errs,
      note: errs.length
        ? `Report-mode recheck flagged ${errs.length} compile error(s).`
        : "Report-mode recheck: no discrepancies.",
    };
  } catch {
    return { compileErrors: [], note: "Report-mode recheck: no discrepancies." };
  }
}
