/**
 * NEMO deterministic scoring engine (PRD Section 8, component C-21).
 *
 * Pure and deterministic: identical inputs and configuration version produce
 * identical outputs (FR-066). LLMs supply inputs (match probability m,
 * classification, status); this module never calls a model. Every formula
 * traces to a numbered sub-section of PRD Section 8.
 */
import type {
  CoverageSourceInput,
  EventInput,
  EventScore,
  Question,
  QuestionScore,
  QuestionScoreInput,
  RetrievalState,
  Severity,
  Verdict,
} from "@/lib/types";
import { DEFAULT_CONFIG, ROLE_FACTOR_KEY, type ScoringConfig } from "./config";

/**
 * Calibration half-width for m when no reliability bins exist for the matcher
 * (PRD 8.5 "calibration half-width for m"). A conservative default prior.
 */
export const M_CALIBRATION_HALF_WIDTH = 0.05;

const SEVERITY_RANK: Record<Severity, number> = {
  S1: 1,
  S2: 2,
  S3: 3,
  S4: 4,
  S5: 5,
};

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Noisy-OR over independent probabilities: 1 − Π(1 − p_i). */
export function noisyOr(values: number[]): number {
  return 1 - values.reduce((acc, v) => acc * (1 - clamp01(v)), 1);
}

// ---------------------------------------------------------------------------
// 8.2 Strength of Evidence
// ---------------------------------------------------------------------------

/** Recency factor r = max(floor(s), 2^(−Δt / h_cat)) (PRD 8.2). */
export function recency(
  severity: Severity,
  category: EventInput["category"],
  ageYears: number,
  cfg: ScoringConfig = DEFAULT_CONFIG,
): number {
  const floor = cfg.severity[severity].recencyFloor;
  const h = cfg.halfLifeYears[category];
  const decay = Math.pow(2, -Math.max(0, ageYears) / h);
  return Math.max(floor, decay);
}

/** SoE = w_type × f_platform × r × (1 − τ), range [0, 1] (PRD 8.2). */
export function strengthOfEvidence(
  ev: EventInput["evidence"][number],
  severity: Severity,
  category: EventInput["category"],
  ageYears: number,
  cfg: ScoringConfig = DEFAULT_CONFIG,
): number {
  const wType = cfg.sourceTiers[ev.tier].wType;
  const fPlatform = cfg.platformFactor[ev.platform];
  const r = recency(severity, category, ageYears, cfg);
  const tau = ev.tamperOverride ?? cfg.tamperExposure[ev.tamper];
  return clamp01(wType * fPlatform * r * (1 - tau));
}

// ---------------------------------------------------------------------------
// 8.4 / 8.5 Risk Contribution and Error Factor (event level)
// ---------------------------------------------------------------------------

export function scoreEvent(
  event: EventInput,
  cfg: ScoringConfig = DEFAULT_CONFIG,
): EventScore {
  const s = cfg.severity[event.severity].weight;
  const rho = cfg.roleFactor[ROLE_FACTOR_KEY[event.role]];

  // Per-evidence SoE; SoE_event combines INDEPENDENT items only (8.4).
  const soeByEvidence = event.evidence.map((ev) => ({
    id: ev.id,
    soe: strengthOfEvidence(ev, event.severity, event.category, event.ageYears, cfg),
  }));
  const independentSoe = event.evidence
    .map((ev, i) => ({ ev, soe: soeByEvidence[i].soe }))
    .filter((x) => x.ev.independent)
    .map((x) => x.soe);
  const soeEvent =
    independentSoe.length > 0 ? noisyOr(independentSoe) : 0;

  const m = clamp01(event.m);
  const rc = clamp01(s * rho * soeEvent * m);

  // 8.5 Error Factor: e_m = calibration half-width
  //                        + |m_A − m_B| / 2 (when double-blind ran)
  //                        + 0.10 if entailment < 0.90 (C-19)
  let eM = M_CALIBRATION_HALF_WIDTH;
  if (typeof event.mA === "number" && typeof event.mB === "number") {
    eM += Math.abs(event.mA - event.mB) / 2;
  }
  const minEntailment = event.evidence.length
    ? Math.min(...event.evidence.map((e) => e.entailment))
    : 1;
  if (minEntailment < cfg.entailment.warnBelow) eM += 0.1;

  const rcLow = clamp01(s * rho * soeEvent * Math.max(0, m - eM));
  const rcHigh = clamp01(s * rho * soeEvent * Math.min(1, m + eM));

  return {
    eventId: event.id,
    soeEvent,
    rc,
    rcLow,
    rcHigh,
    ef: rcHigh - rcLow,
    soeByEvidence,
    m,
    severityWeight: s,
    roleFactor: rho,
  };
}

// ---------------------------------------------------------------------------
// 8.6 Coverage per question
// ---------------------------------------------------------------------------

export function stateScore(state: RetrievalState, completeness = 1): number {
  switch (state) {
    case "FOUND_RETRIEVED":
    case "NOT_FOUND":
      return 1.0;
    case "PARTIAL":
      return 0.5 * clamp01(completeness);
    case "FOUND_NOT_RETRIEVED":
      return 0.3;
    case "UNREACHABLE":
      return 0.0;
    case "OUT_OF_SCOPE":
      return NaN; // excluded from the weighted sum
  }
}

export function coverageForQuestion(
  sources: CoverageSourceInput[],
  cfg: ScoringConfig = DEFAULT_CONFIG,
): number {
  void cfg;
  let num = 0;
  let den = 0;
  for (const src of sources) {
    if (src.state === "OUT_OF_SCOPE") continue;
    const ss = stateScore(src.state, src.completeness ?? 1);
    num += src.weight * ss;
    den += src.weight;
  }
  return den === 0 ? 0 : num / den;
}

// ---------------------------------------------------------------------------
// 8.6 Verdict bands + pattern rule
// ---------------------------------------------------------------------------

const BAND_ORDER: Verdict[] = ["CLEAR", "CONCERNS", "RED_FLAG"];

function raiseBand(v: Verdict): Verdict {
  if (v === "INSUFFICIENT_COVERAGE") return "CONCERNS";
  const i = BAND_ORDER.indexOf(v);
  if (i < 0) return v; // STOP unchanged
  return BAND_ORDER[Math.min(i + 1, BAND_ORDER.length - 1)];
}

function baseVerdict(
  qPoint: number,
  coverage: number,
  efQ: number,
  cfg: ScoringConfig,
): Verdict {
  const b = cfg.verdictBands;
  if (qPoint >= b.redFlagAt) return "RED_FLAG";
  if (qPoint >= b.clearBelow) return "CONCERNS";
  // qPoint < clearBelow
  if (coverage >= b.minCoverageForClear && efQ <= b.maxEfForClear) {
    return "CLEAR";
  }
  return "INSUFFICIENT_COVERAGE";
}

/** Detects the Section 8.6 pattern rule over the events in one question. */
function patternTriggered(events: EventInput[], cfg: ScoringConfig): boolean {
  const minRank = SEVERITY_RANK[cfg.patternRule.minSeverity];
  const byCategory = new Map<string, EventInput[]>();
  for (const e of events) {
    if (SEVERITY_RANK[e.severity] > minRank) continue; // not S3-or-worse
    if (e.ageYears > cfg.patternRule.windowYears) continue;
    const arr = byCategory.get(e.category) ?? [];
    arr.push(e);
    byCategory.set(e.category, arr);
  }
  for (const [, arr] of byCategory) {
    if (arr.length < cfg.patternRule.minFindings) continue;
    const entities = new Set(arr.map((e) => e.entityId ?? e.id));
    if (entities.size >= cfg.patternRule.minDistinctEntities) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Question-level scoring (PRD 8.5 question level + 8.6 aggregation)
// ---------------------------------------------------------------------------

export function scoreQuestion(
  input: QuestionScoreInput,
  cfg: ScoringConfig = DEFAULT_CONFIG,
  opts: { hardStop?: boolean } = {},
): QuestionScore {
  const eventScores = input.events.map((e) => scoreEvent(e, cfg));

  const qPoint = noisyOr(eventScores.map((e) => e.rc));
  const qLow = noisyOr(eventScores.map((e) => e.rcLow));
  const qHigh = noisyOr(eventScores.map((e) => e.rcHigh));

  const coverage = coverageForQuestion(input.coverage, cfg);
  const uCov = cfg.coverageUncertaintyKappa * (1 - coverage);
  const qHighPrime = 1 - (1 - qHigh) * (1 - uCov);
  const efQ = qHighPrime - qLow;

  // S1 CONFIRMED override (8.6).
  const s1Override = input.events.some(
    (e) => e.severity === "S1" && e.status === "CONFIRMED" && e.m >= 0.9,
  );

  let verdict: Verdict;
  if (opts.hardStop) {
    verdict = "STOP";
  } else {
    verdict = baseVerdict(qPoint, coverage, efQ, cfg);
    if (s1Override) verdict = "RED_FLAG";
  }

  const pattern = patternTriggered(input.events, cfg);
  if (pattern && !opts.hardStop && !s1Override) {
    verdict = raiseBand(verdict);
  }

  return {
    question: input.question,
    qPoint,
    qLow,
    qHigh: qHighPrime,
    ef: efQ,
    coverage,
    verdict,
    pattern,
    s1Override,
    eventScores,
    configVersion: cfg.configVersion,
  };
}

/**
 * Scores every question for a case. `events` are tagged with the questions
 * they belong to; `coverageByQuestion` carries per-source weights per question.
 */
export function scoreCase(
  questions: Question[],
  events: EventInput[],
  coverageByQuestion: Partial<Record<Question, CoverageSourceInput[]>>,
  cfg: ScoringConfig = DEFAULT_CONFIG,
  opts: { hardStop?: boolean } = {},
): Record<Question, QuestionScore> {
  const out = {} as Record<Question, QuestionScore>;
  for (const q of questions) {
    const qEvents = events.filter((e) => e.questions.includes(q));
    out[q] = scoreQuestion(
      { question: q, events: qEvents, coverage: coverageByQuestion[q] ?? [] },
      cfg,
      opts,
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// 8.3 Match acceptance cascade helper (used by the matcher layer)
// ---------------------------------------------------------------------------

export type MatchDisposition = "ACCEPT" | "REJECT" | "AMBIGUOUS";

export function matchDisposition(
  m: number,
  severity: Severity,
  cfg: ScoringConfig = DEFAULT_CONFIG,
): MatchDisposition {
  if (m < cfg.rejectM) return "REJECT";
  if (m >= cfg.severity[severity].acceptM) return "ACCEPT";
  return "AMBIGUOUS";
}

export { DEFAULT_CONFIG };
export type { ScoringConfig };
