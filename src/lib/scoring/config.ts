/**
 * NEMO default configuration (PRD Appendix A, config_version 2026.10.0).
 *
 * All numeric weights, thresholds and time budgets are configurable starting
 * priors, not validated constants. The scoring engine reads them from here so
 * any score can be replayed against a named config version (FR-066, FR-067).
 */
import type {
  CaseLevel,
  HalfLifeCategory,
  PlatformKind,
  Severity,
  SourceTier,
  TamperKind,
} from "@/lib/types";

export interface ScoringConfig {
  configVersion: string;
  sourceTiers: Record<SourceTier, { wType: number }>;
  platformFactor: Record<PlatformKind, number>;
  tamperExposure: Record<TamperKind, number>;
  halfLifeYears: Record<HalfLifeCategory, number>;
  severity: Record<
    Severity,
    { weight: number; recencyFloor: number; acceptM: number }
  >;
  rejectM: number;
  roleFactor: {
    accused_personal: number;
    regulator_key_person: number;
    respondent_director: number;
    plaintiff: number;
    witness_or_mentioned: number;
  };
  verdictBands: {
    clearBelow: number;
    redFlagAt: number;
    minCoverageForClear: number;
    maxEfForClear: number;
  };
  coverageUncertaintyKappa: number;
  patternRule: {
    minFindings: number;
    minSeverity: Severity;
    minDistinctEntities: number;
    windowYears: number;
  };
  doubleBlind: {
    splitGap: number;
    singleJudgeAuditRate: number;
    trueNegativeRecheckRate: number;
    kappaDowngrade: number;
    kappaAlarm: number;
    kappaMinItems: number;
  };
  resolve: {
    voiMin: number;
    maxRounds: Record<CaseLevel, number>;
  };
  disclosure: {
    alpha: number;
    beta: number;
    gamma: number;
    rerunThreshold: number;
    claimMateriality: { high: number; medium: number; low: number };
    dateToleranceMonths: number;
  };
  footprintFlags: {
    thinRatio: number;
    lateWindowMonths: number;
    mediaSpikeMultiple: number;
  };
  entailment: {
    warnBelow: number;
    rejectBelow: number;
  };
}

export const DEFAULT_CONFIG: ScoringConfig = {
  configVersion: "2026.10.0",
  sourceTiers: {
    T1: { wType: 0.95 },
    T2: { wType: 0.6 },
    T3: { wType: 0.7 },
    T4: { wType: 0.3 },
    T5: { wType: 0.15 },
  },
  platformFactor: {
    official_portal: 1.0,
    licensed_feed: 0.95,
    national_outlet: 1.0,
    regional_outlet: 0.9,
    trade_press: 0.85,
    scraped_copy: 0.8,
    pr_wire: 0.5,
    content_farm: 0.3,
  },
  tamperExposure: {
    official_portal_direct: 0.02,
    licensed_or_mirror: 0.05,
    news_page: 0.1,
    supplied_unverified: 0.35,
    social_post: 0.4,
    anonymous_post: 0.5,
    screenshot: 0.6,
  },
  halfLifeYears: {
    criminal: 10,
    regulatory: 8,
    governance: 5,
    financial_distress: 4,
    media_allegation: 3,
    commercial_dispute: 2.5,
  },
  severity: {
    S1: { weight: 1.0, recencyFloor: 0.8, acceptM: 0.9 },
    S2: { weight: 0.8, recencyFloor: 0.5, acceptM: 0.85 },
    S3: { weight: 0.5, recencyFloor: 0.2, acceptM: 0.8 },
    S4: { weight: 0.25, recencyFloor: 0.0, acceptM: 0.75 },
    S5: { weight: 0.05, recencyFloor: 0.0, acceptM: 0.75 },
  },
  rejectM: 0.3,
  roleFactor: {
    accused_personal: 1.0,
    regulator_key_person: 0.9,
    respondent_director: 0.7,
    plaintiff: 0.1,
    witness_or_mentioned: 0.05,
  },
  verdictBands: {
    clearBelow: 0.1,
    redFlagAt: 0.4,
    minCoverageForClear: 0.6,
    maxEfForClear: 0.35,
  },
  coverageUncertaintyKappa: 0.3,
  patternRule: {
    minFindings: 3,
    minSeverity: "S3",
    minDistinctEntities: 2,
    windowYears: 5,
  },
  doubleBlind: {
    splitGap: 0.3,
    singleJudgeAuditRate: 0.07,
    trueNegativeRecheckRate: 0.05,
    kappaDowngrade: 0.85,
    kappaAlarm: 0.6,
    kappaMinItems: 500,
  },
  resolve: {
    voiMin: 0.05,
    maxRounds: { L1: 1, L2: 3, L3: 5 },
  },
  disclosure: {
    alpha: 1.0,
    beta: 1.0,
    gamma: 0.5,
    rerunThreshold: 0.15,
    claimMateriality: { high: 1.0, medium: 0.6, low: 0.3 },
    dateToleranceMonths: 3,
  },
  footprintFlags: {
    thinRatio: 0.2,
    lateWindowMonths: 18,
    mediaSpikeMultiple: 3,
  },
  entailment: {
    warnBelow: 0.9,
    rejectBelow: 0.5,
  },
};

/** Maps a PRD Role to the role factor key. */
export const ROLE_FACTOR_KEY: Record<
  import("@/lib/types").Role,
  keyof ScoringConfig["roleFactor"]
> = {
  ACCUSED: "accused_personal",
  RESPONDENT_DIRECTOR: "respondent_director",
  REGULATOR_KEY_PERSON: "regulator_key_person",
  PLAINTIFF: "plaintiff",
  WITNESS: "witness_or_mentioned",
  COUNSEL: "witness_or_mentioned",
  MENTIONED: "witness_or_mentioned",
};
