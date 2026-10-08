/**
 * C-10 Domain Collectors.
 *
 * Produces candidate EventInput / EvidenceInput items per domain plus a
 * coverage map. In a prototype WITHOUT live data feeds, LIVE mode may let the
 * model draft a small number of plausible, clearly-synthetic public-record-style
 * candidate matters for the subject (the orchestrator labels them synthetic in
 * the UI), and derive coverage states. REPLAY mode produces NO candidate events
 * (the seed case supplies its own) but still returns a generic coverage map so
 * the engine has something to score.
 */
import { z } from "zod";
import { callAgentJson } from "./client";
import { neutralizeForPrompt } from "./injectionFilter";
import { COLLECTOR_SYSTEM } from "./prompts";
import type {
  CasePlan,
  CoverageRow,
  CoverageSourceInput,
  Domain,
  EventInput,
  HalfLifeCategory,
  Question,
  RetrievalState,
  Role,
  Severity,
  SourceTier,
  SubjectIntake,
} from "@/lib/types";

export interface CollectionResult {
  events: EventInput[];
  coverage: CoverageRow[];
  coverageByQuestion: Partial<Record<Question, CoverageSourceInput[]>>;
  /** True when the events were drafted by the model as synthetic candidates. */
  synthetic: boolean;
}

// Generic source families for the coverage map (prototype priors).
const SOURCE_META: Record<
  string,
  { name: string; domain: Domain; tier: SourceTier; questions: Question[] }
> = {
  sanctions: { name: "OFAC/UN/EU/UK sanctions", domain: "LEGAL", tier: "T1", questions: ["crimes_compliance"] },
  pep: { name: "PEP datasets", domain: "PERSONAL", tier: "T1", questions: ["crimes_compliance", "identity"] },
  ecourts: { name: "eCourts (district)", domain: "LEGAL", tier: "T1", questions: ["integrity"] },
  high_court: { name: "High Court portals", domain: "LEGAL", tier: "T1", questions: ["integrity"] },
  sebi: { name: "SEBI / RBI / ED / SFIO orders", domain: "LEGAL", tier: "T1", questions: ["crimes_compliance"] },
  mca: { name: "MCA21 (directorships, filings)", domain: "PROFESSIONAL", tier: "T1", questions: ["credibility", "track_record", "connections"] },
  ibbi: { name: "IBBI / NCLT insolvency", domain: "FINANCIAL", tier: "T1", questions: ["financial"] },
  defaulters: { name: "Wilful-defaulter data (licensed)", domain: "FINANCIAL", tier: "T2", questions: ["financial"] },
  tracxn: { name: "Tracxn / Venture Intelligence", domain: "PROFESSIONAL", tier: "T3", questions: ["track_record"] },
  media: { name: "National & regional media", domain: "SHARED_MEDIA", tier: "T3", questions: ["integrity", "credibility"] },
  opencorporates: { name: "OpenCorporates", domain: "PROFESSIONAL", tier: "T3", questions: ["connections"] },
  crowd: { name: "Crowd / web mentions", domain: "SHARED_CROWD", tier: "T4", questions: ["integrity"] },
};

function buildCoverage(
  plan: CasePlan,
  states: Record<string, RetrievalState>,
): { coverage: CoverageRow[]; coverageByQuestion: Partial<Record<Question, CoverageSourceInput[]>> } {
  const coverage: CoverageRow[] = [];
  const byQ: Partial<Record<Question, CoverageSourceInput[]>> = {};
  for (const sourceId of plan.sources) {
    const meta = SOURCE_META[sourceId];
    if (!meta) continue;
    const state = states[sourceId] ?? "NOT_FOUND";
    const completeness = state === "PARTIAL" ? 0.6 : state === "UNREACHABLE" ? 0 : 1;
    coverage.push({
      sourceId,
      sourceName: meta.name,
      domain: meta.domain,
      tier: meta.tier,
      state,
      completeness,
    });
    for (const q of meta.questions) {
      if (!plan.questions.includes(q)) continue;
      (byQ[q] ??= []).push({
        sourceId,
        weight: meta.tier === "T1" ? 1 : meta.tier === "T2" ? 0.8 : 0.6,
        state,
        completeness,
      });
    }
  }
  // Ensure every planned question has at least one coverage source.
  for (const q of plan.questions) {
    if (!byQ[q] || byQ[q]!.length === 0) {
      byQ[q] = [{ sourceId: "media", weight: 0.6, state: "NOT_FOUND" }];
    }
  }
  return { coverage, coverageByQuestion: byQ };
}

const CollectorOut = z.object({
  coverage: z.record(z.string(), z.string()).optional(),
  candidates: z
    .array(
      z.object({
        title: z.string(),
        category: z.string().optional(),
        severity: z.string().optional(),
        role: z.string().optional(),
        ageYears: z.number().optional(),
        m: z.number().optional(),
        questions: z.array(z.string()).optional(),
        sourceId: z.string().optional(),
        sourceName: z.string().optional(),
        tier: z.string().optional(),
        excerpt: z.string().optional(),
      }),
    )
    .optional(),
});
type CollectorOutT = z.infer<typeof CollectorOut>;

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

/**
 * Collects candidate events + coverage. Pass `allowSynthetic` false (default in
 * replay) to skip model-drafted candidates.
 */
export async function collect(
  subject: SubjectIntake,
  plan: CasePlan,
  opts: { allowSynthetic: boolean },
): Promise<CollectionResult> {
  // Default coverage states: official registries/sanctions "found" (clean),
  // media present, one partial court source — a realistic baseline.
  const defaultStates: Record<string, RetrievalState> = {
    sanctions: "NOT_FOUND",
    pep: "NOT_FOUND",
    sebi: "NOT_FOUND",
    ibbi: "NOT_FOUND",
    defaulters: "NOT_FOUND",
    mca: "FOUND_RETRIEVED",
    tracxn: "FOUND_RETRIEVED",
    media: "FOUND_RETRIEVED",
    high_court: "FOUND_RETRIEVED",
    ecourts: "PARTIAL",
    opencorporates: "FOUND_RETRIEVED",
    crowd: "NOT_FOUND",
  };

  if (!opts.allowSynthetic) {
    const { coverage, coverageByQuestion } = buildCoverage(plan, defaultStates);
    return { events: [], coverage, coverageByQuestion, synthetic: false };
  }

  try {
    const out = await callAgentJson<CollectorOutT>({
      system: COLLECTOR_SYSTEM,
      tier: "large",
      family: "A",
      maxTokens: 1400,
      prompt:
        `Subject (untrusted name): ${neutralizeForPrompt(subject.name, "subject_name").safe} ` +
        `(${subject.subjectType}), ${subject.jurisdiction ?? "—"}. ` +
        `Purpose: ${neutralizeForPrompt(subject.purpose, "purpose").safe}.\n` +
        `Planned questions: ${plan.questions.join(", ")}.\n` +
        `Source families: ${plan.sources.join(", ")}.\n\n` +
        `Draft at most 4 plausible, clearly-synthetic candidate public-record ` +
        `matters this subject could be party to. Return JSON ` +
        `{"coverage":{sourceId:"FOUND_RETRIEVED|NOT_FOUND|PARTIAL|UNREACHABLE"},` +
        `"candidates":[{"title","category":one of ${CATS.join("|")},` +
        `"severity":S1..S5,"role":one of ${ROLES.join("|")},"ageYears":number,` +
        `"m":0..1 how likely it is really the subject,"questions":[question ids],` +
        `"sourceId","sourceName","tier":T1..T5,"excerpt"}]}.`,
    });
    const parsed = CollectorOut.safeParse(out);
    if (parsed.success) {
      const states: Record<string, RetrievalState> = { ...defaultStates };
      for (const [k, v] of Object.entries(parsed.data.coverage ?? {})) {
        if (k in SOURCE_META && isState(v)) states[k] = v;
      }
      const { coverage, coverageByQuestion } = buildCoverage(plan, states);
      const events = (parsed.data.candidates ?? []).slice(0, 4).map((c, i) =>
        toEvent(c, i, plan.questions),
      );
      return { events, coverage, coverageByQuestion, synthetic: true };
    }
  } catch {
    // fall through
  }
  const { coverage, coverageByQuestion } = buildCoverage(plan, defaultStates);
  return { events: [], coverage, coverageByQuestion, synthetic: false };
}

function isState(v: string): v is RetrievalState {
  return ["FOUND_RETRIEVED", "FOUND_NOT_RETRIEVED", "NOT_FOUND", "UNREACHABLE", "PARTIAL", "OUT_OF_SCOPE"].includes(v);
}

function toEvent(
  c: NonNullable<CollectorOutT["candidates"]>[number],
  i: number,
  planQuestions: Question[],
): EventInput {
  const severity = coerce<Severity>(c.severity, SEVS, "S4");
  const category = coerce<HalfLifeCategory>(c.category, CATS, "commercial_dispute");
  const role = coerce<Role>(c.role, ROLES, "MENTIONED");
  const tier = coerce<SourceTier>(c.tier, ["T1", "T2", "T3", "T4", "T5"], "T3");
  const questions = (c.questions ?? []).filter((q): q is Question =>
    planQuestions.includes(q as Question),
  );
  return {
    id: `ev_cand_${i + 1}`,
    title: (c.title ?? "Candidate matter").slice(0, 160),
    category,
    severity,
    role,
    ageYears: typeof c.ageYears === "number" ? Math.max(0, c.ageYears) : 2,
    m: typeof c.m === "number" ? Math.min(1, Math.max(0, c.m)) : 0.6,
    questions: questions.length ? questions : [planQuestions[0] ?? "integrity"],
    status: "ALLEGATION",
    evidence: [
      {
        id: `ev_cand_${i + 1}_src`,
        tier,
        platform: tier === "T1" ? "official_portal" : "national_outlet",
        tamper: tier === "T1" ? "official_portal_direct" : "news_page",
        independent: true,
        entailment: 0.9,
        source: c.sourceName ?? c.sourceId ?? "Synthetic candidate source",
        excerpt: c.excerpt?.slice(0, 240),
      },
    ],
  };
}
