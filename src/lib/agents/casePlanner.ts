/**
 * C-02 Case Planner.
 *
 * Proposes a CasePlan for a subject. A deterministic core (the Policy Engine's
 * job, C-03) owns level assignment, the mandatory question set and the source
 * allowlist; the LLM is used only to enrich the domain/source selection with a
 * short rationale. The mandatory questions (identity, credibility,
 * crimes_compliance; plus financial for LPs) are ALWAYS present regardless of
 * what the model returns, and the whole thing falls back to the deterministic
 * plan on NoKeyError or any failure (replay mode).
 */
import { z } from "zod";
import { callAgentJson } from "./client";
import { PLANNER_SYSTEM } from "./prompts";
import { DEFAULT_CONFIG } from "@/lib/scoring/config";
import { ALL_QUESTIONS } from "@/lib/types";
import type {
  CaseLevel,
  CasePlan,
  Domain,
  Question,
  SubjectIntake,
} from "@/lib/types";

const CONFIG_VERSION = DEFAULT_CONFIG.configVersion;

/** Canonical source allowlist ids (prototype priors). */
const SOURCE_CATALOG: Record<string, Domain> = {
  sanctions: "LEGAL",
  pep: "PERSONAL",
  ecourts: "LEGAL",
  high_court: "LEGAL",
  sebi: "LEGAL",
  mca: "PROFESSIONAL",
  ibbi: "FINANCIAL",
  defaulters: "FINANCIAL",
  tracxn: "PROFESSIONAL",
  media: "SHARED_MEDIA",
  opencorporates: "PROFESSIONAL",
  crowd: "SHARED_CROWD",
};

const ALL_DOMAINS: Domain[] = [
  "PERSONAL",
  "FINANCIAL",
  "LEGAL",
  "PROFESSIONAL",
  "SHARED_MEDIA",
  "SHARED_CROWD",
];

function isLP(subject: SubjectIntake): boolean {
  const s = `${subject.subjectType} ${subject.purpose}`.toLowerCase();
  return /\blp\b|limited partner|fund investor|anchor investor/.test(s);
}

/** Deterministic level assignment (Policy Engine rule, overridable upward). */
export function deriveLevel(
  subject: SubjectIntake,
  requested?: CaseLevel,
): CaseLevel {
  if (requested) return requested;
  const p = `${subject.purpose} ${subject.dealContext ?? ""}`.toLowerCase();
  if (/acceler|screen|co-?invest/.test(p)) return "L1";
  if (/growth|buyout|control|series\s*[cd]|enhanced|defence|defense/.test(p)) {
    return "L3";
  }
  return "L2";
}

/** Mandatory + level-required question set (PRD 11.1). */
export function questionsForLevel(
  level: CaseLevel,
  subject: SubjectIntake,
): Question[] {
  if (level === "L1") {
    const qs: Question[] = ["identity", "credibility", "crimes_compliance"];
    if (isLP(subject)) qs.push("financial");
    return qs;
  }
  return [...ALL_QUESTIONS];
}

function domainsForLevel(level: CaseLevel): Domain[] {
  if (level === "L1") return ["LEGAL", "PROFESSIONAL", "SHARED_MEDIA"];
  return [...ALL_DOMAINS];
}

function sourcesForDomains(domains: Domain[]): string[] {
  return Object.entries(SOURCE_CATALOG)
    .filter(([, d]) => domains.includes(d))
    .map(([id]) => id);
}

function associatePolicy(level: CaseLevel): string {
  if (level === "L1") return "None";
  if (level === "L2") return "1 hop, L1 depth";
  return "2 hops, L1 depth (1 hop at L2 depth for co-founders)";
}

function machineBudget(level: CaseLevel): number {
  return level === "L1" ? 2 : level === "L2" ? 8 : 48;
}

/** The deterministic plan — always valid, always includes the mandatory set. */
export function deterministicPlan(
  subject: SubjectIntake,
  requested?: CaseLevel,
): CasePlan {
  const level = deriveLevel(subject, requested);
  const domains = domainsForLevel(level);
  return {
    questions: questionsForLevel(level, subject),
    domains,
    sources: sourcesForDomains(domains),
    level,
    associatePolicy: associatePolicy(level),
    legalBasis:
      "Legitimate interest — pre-investment diligence; subject notice on file",
    budgets: {
      machineTimeHours: machineBudget(level),
      maxResolveRounds: DEFAULT_CONFIG.resolve.maxRounds[level],
    },
    rulesApplied: [
      { ruleId: "LEVEL_ASSIGN", version: CONFIG_VERSION },
      { ruleId: "MANDATORY_Q", version: CONFIG_VERSION },
      { ruleId: "SOURCE_ALLOWLIST", version: CONFIG_VERSION },
    ],
  };
}

const PlannerOut = z.object({
  extraSources: z.array(z.string()).optional(),
  domains: z.array(z.string()).optional(),
  associateRationale: z.string().optional(),
});

/**
 * Proposes a plan. LIVE: asks the model to enrich the source/domain selection,
 * then the deterministic Policy Engine re-imposes the mandatory questions, the
 * level and the allowlist. REPLAY / any error: the deterministic plan.
 */
export async function planCase(
  subject: SubjectIntake,
  requested?: CaseLevel,
): Promise<CasePlan> {
  const base = deterministicPlan(subject, requested);
  try {
    const out = await callAgentJson<z.infer<typeof PlannerOut>>({
      system: PLANNER_SYSTEM,
      tier: "large",
      family: "A",
      maxTokens: 700,
      prompt:
        `Subject: ${subject.name} (${subject.subjectType}).\n` +
        `Purpose: ${subject.purpose}. Context: ${subject.dealContext ?? "—"}.\n` +
        `Jurisdiction: ${subject.jurisdiction ?? "—"}.\n` +
        `Assigned level: ${base.level}. Candidate source ids: ` +
        `${Object.keys(SOURCE_CATALOG).join(", ")}.\n\n` +
        `Return JSON {"extraSources":[source ids most relevant to this ` +
        `subject],"domains":[domains to prioritise],"associateRationale":` +
        `"one line"}.`,
    });
    const parsed = PlannerOut.safeParse(out);
    if (parsed.success) {
      const extra = (parsed.data.extraSources ?? []).filter(
        (s) => s in SOURCE_CATALOG,
      );
      const merged = Array.from(new Set([...base.sources, ...extra]));
      return { ...base, sources: merged };
    }
  } catch {
    // NoKeyError or transport failure → deterministic plan.
  }
  return base;
}
