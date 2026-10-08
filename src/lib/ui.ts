/** Shared UI helpers: class merge + label/token maps (UI spec §3.3, §3.7). */
import { clsx, type ClassValue } from "clsx";
import type {
  CaseLevel,
  Severity,
  SourceTier,
  Verdict,
} from "@/lib/types";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** Plain UI labels for verdicts (UI spec §3.3 "Plain label in UI"). */
export const VERDICT_LABEL: Record<Verdict, string> = {
  CLEAR: "Clear",
  CONCERNS: "Concerns",
  RED_FLAG: "Red flag",
  INSUFFICIENT_COVERAGE: "Not enough coverage",
  STOP: "Stopped: compliance review",
};

/** Token color var per verdict (text/glyph color). */
export const VERDICT_COLOR: Record<Verdict, string> = {
  CLEAR: "var(--verdict-clear)",
  CONCERNS: "var(--verdict-concerns)",
  RED_FLAG: "var(--verdict-redflag)",
  INSUFFICIENT_COVERAGE: "var(--verdict-unsurveyed)",
  STOP: "var(--verdict-stop-ring)",
};

/** Verdict glyph: circle / triangle / diamond / square / octagon (§3.3). */
export type VerdictGlyph = "circle" | "triangle" | "diamond" | "square" | "octagon";
export const VERDICT_GLYPH: Record<Verdict, VerdictGlyph> = {
  CLEAR: "circle",
  CONCERNS: "triangle",
  RED_FLAG: "diamond",
  INSUFFICIENT_COVERAGE: "square",
  STOP: "octagon",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  S1: "Fraud / laundering",
  S2: "Default / removal / forgery",
  S3: "Conduct / non-disclosure",
  S4: "Commercial dispute",
  S5: "Petty",
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  S1: "var(--sev1)",
  S2: "var(--sev2)",
  S3: "var(--sev3)",
  S4: "var(--sev4)",
  S5: "var(--sev5)",
};

/** Filled sounding bars = 6 − level (§3.3). */
export const SEVERITY_FILLED: Record<Severity, number> = {
  S1: 5,
  S2: 4,
  S3: 3,
  S4: 2,
  S5: 1,
};

export const TIER_LABEL: Record<SourceTier, string> = {
  T1: "Official record (adjudicated or registry)",
  T2: "Official, not yet decided (e.g. a pending case)",
  T3: "Independent professional source",
  T4: "Self-reported (CV, deck, LinkedIn, website)",
  T5: "Anonymous or crowd source. A lead, not evidence.",
};

export const LEVEL_LABEL: Record<CaseLevel, string> = {
  L1: "Light depth",
  L2: "Standard depth",
  L3: "Enhanced depth",
};

export const LEVEL_SOUNDINGS: Record<CaseLevel, number> = {
  L1: 1,
  L2: 2,
  L3: 3,
};

/** UI term for a case state (backend → plain words, §3.7). */
export const STATE_LABEL: Record<string, string> = {
  CREATED: "Created",
  SCOPED: "Scoped",
  ANCHORING: "Building identity",
  AWAIT_G1: "Needs identity check",
  COLLECTING: "Searching",
  ASSESSING: "Assessing",
  RESOLVING: "Following up",
  COMPILING: "Compiling",
  RED_TEAM: "Independent recheck",
  AWAIT_G2: "Needs final review",
  REDO: "Updating after your change",
  PUBLISHING: "Publishing",
  MONITORING: "Monitoring",
  STOPPED: "Stopped for compliance review",
};

export function fmtPct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function fmtNum(x: number, digits = 2): string {
  return x.toFixed(digits);
}
