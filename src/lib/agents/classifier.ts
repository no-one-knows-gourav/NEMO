/**
 * C-18 Classifiers.
 *
 * Assigns severity, role, category, legal status and the diligence questions a
 * matched event informs. For S1..S3 events two classifiers (families A/B, DB-6)
 * run blind and the comparator takes the MORE SEVERE level on disagreement and
 * flags it for gate G2. S4/S5 events get a single (family A) classifier. On
 * NoKeyError / any failure the event keeps its incoming classification
 * (deterministic replay).
 */
import { z } from "zod";
import { callAgentJson } from "./client";
import { CLASSIFIER_SYSTEM_A, CLASSIFIER_SYSTEM_B } from "./prompts";
import type {
  EventInput,
  HalfLifeCategory,
  LegalStatus,
  Question,
  Role,
  Severity,
} from "@/lib/types";
import { ALL_QUESTIONS } from "@/lib/types";

export interface ClassifyResult {
  events: EventInput[];
  /** Event ids where A and B disagreed on severity (flag for gate G2). */
  severitySplits: string[];
}

const SEVS: Severity[] = ["S1", "S2", "S3", "S4", "S5"];
const CATS: HalfLifeCategory[] = [
  "criminal",
  "regulatory",
  "governance",
  "financial_distress",
  "media_allegation",
  "commercial_dispute",
];
const ROLES: Role[] = [
  "ACCUSED",
  "RESPONDENT_DIRECTOR",
  "REGULATOR_KEY_PERSON",
  "PLAINTIFF",
  "WITNESS",
  "COUNSEL",
  "MENTIONED",
];
const LEGAL: LegalStatus[] = [
  "PENDING",
  "CONVICTED",
  "FINAL_ORDER",
  "ACQUITTED",
  "QUASHED",
  "SETTLED",
  "WITHDRAWN",
  "APPEALED",
  "UNKNOWN",
];

const SEV_RANK: Record<Severity, number> = { S1: 1, S2: 2, S3: 3, S4: 4, S5: 5 };

const ClassOut = z.object({
  severity: z.string().optional(),
  category: z.string().optional(),
  role: z.string().optional(),
  legalStatus: z.string().optional(),
  questions: z.array(z.string()).optional(),
});
type ClassOutT = z.infer<typeof ClassOut>;

function coerce<T>(v: string | undefined, allowed: T[], dflt: T): T {
  return (allowed as unknown as string[]).includes(v ?? "") ? (v as unknown as T) : dflt;
}

function classPrompt(ev: EventInput): string {
  const src = ev.evidence[0];
  return (
    `Matter: "${ev.title}". Current draft: category ${ev.category}, severity ` +
    `${ev.severity}, role ${ev.role}. Source: ${src?.source ?? "—"}. ` +
    `Excerpt: ${src?.excerpt ?? "—"}.\n\n` +
    `Classify it. Return JSON {"severity":S1..S5 (S1 most severe),` +
    `"category":one of ${CATS.join("|")},"role":one of ${ROLES.join("|")},` +
    `"legalStatus":one of ${LEGAL.join("|")},"questions":[ids from ` +
    `${ALL_QUESTIONS.join("|")}]}.`
  );
}

async function runClassifier(
  ev: EventInput,
  family: "A" | "B",
): Promise<ClassOutT | null> {
  try {
    const out = await callAgentJson<ClassOutT>({
      system: family === "A" ? CLASSIFIER_SYSTEM_A : CLASSIFIER_SYSTEM_B,
      tier: "large",
      family,
      maxTokens: 400,
      prompt: classPrompt(ev),
    });
    const parsed = ClassOut.safeParse(out);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function applyClass(ev: EventInput, c: ClassOutT): EventInput {
  const questions = (c.questions ?? []).filter((q): q is Question =>
    (ALL_QUESTIONS as string[]).includes(q),
  );
  return {
    ...ev,
    severity: coerce<Severity>(c.severity, SEVS, ev.severity),
    category: coerce<HalfLifeCategory>(c.category, CATS, ev.category),
    role: coerce<Role>(c.role, ROLES, ev.role),
    legalStatus: coerce<LegalStatus>(c.legalStatus, LEGAL, ev.legalStatus ?? "UNKNOWN"),
    questions: questions.length ? questions : ev.questions,
  };
}

/** Classifies each event; A/B blind for the double-blind scope (S1..S3). */
export async function classifyEvents(
  events: EventInput[],
): Promise<ClassifyResult> {
  const result: EventInput[] = [];
  const severitySplits: string[] = [];

  for (const ev of events) {
    const inScope = SEV_RANK[ev.severity] <= SEV_RANK.S3;
    if (inScope) {
      const [a, b] = await Promise.all([
        runClassifier(ev, "A"),
        runClassifier(ev, "B"),
      ]);
      if (a && b) {
        const sevA = coerce<Severity>(a.severity, SEVS, ev.severity);
        const sevB = coerce<Severity>(b.severity, SEVS, ev.severity);
        // DB-6: take the more severe (lower rank number) and flag the split.
        const moreSevere = SEV_RANK[sevA] <= SEV_RANK[sevB] ? sevA : sevB;
        if (sevA !== sevB) severitySplits.push(ev.id);
        const base = applyClass(ev, a);
        result.push({ ...base, severity: moreSevere });
        continue;
      }
      if (a || b) {
        result.push(applyClass(ev, (a ?? b)!));
        continue;
      }
      result.push(ev); // replay / failure
      continue;
    }
    // S4/S5: single judge.
    const a = await runClassifier(ev, "A");
    result.push(a ? applyClass(ev, a) : ev);
  }

  return { events: result, severitySplits };
}
