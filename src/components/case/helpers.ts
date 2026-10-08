/**
 * Presentational helpers for the core screens (case namespace, not src/lib).
 * Plain-word terminology per UI spec §3.7. Pure + server-safe.
 */
import type {
  CaseSummary,
  Domain,
  FindingStatus,
  LegalStatus,
  PipelineStage,
  RetrievalState,
  Role,
  Verdict,
} from "@/lib/types";

/** Plain-word labels for finding roles (allegation-safe wording). */
export const ROLE_LABEL: Record<Role, string> = {
  ACCUSED: "Named / accused",
  RESPONDENT_DIRECTOR: "Respondent director",
  REGULATOR_KEY_PERSON: "Key person (regulator)",
  PLAINTIFF: "Plaintiff",
  WITNESS: "Witness",
  COUNSEL: "Counsel",
  MENTIONED: "Mentioned",
};

export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  CONFIRMED: "Confirmed",
  ALLEGATION: "Allegation — undecided",
  DISMISSED: "Dismissed",
};

export const LEGAL_STATUS_LABEL: Record<LegalStatus, string> = {
  PENDING: "Pending",
  CONVICTED: "Convicted",
  FINAL_ORDER: "Final order",
  ACQUITTED: "Acquitted",
  QUASHED: "Quashed",
  SETTLED: "Settled",
  WITHDRAWN: "Withdrawn",
  APPEALED: "Appealed",
  UNKNOWN: "Unknown",
};

export const DOMAIN_LABEL: Record<Domain, string> = {
  PERSONAL: "Personal",
  FINANCIAL: "Financial",
  LEGAL: "Legal",
  PROFESSIONAL: "Professional",
  SHARED_MEDIA: "Media",
  SHARED_CROWD: "Crowd",
};

/** Retrieval state in plain words (UI spec §3.7 / coverage map). */
export const RETRIEVAL_STATE_LABEL: Record<RetrievalState, string> = {
  FOUND_RETRIEVED: "Searched",
  FOUND_NOT_RETRIEVED: "Found, not retrieved",
  NOT_FOUND: "No records found",
  UNREACHABLE: "Couldn't reach",
  PARTIAL: "Partly searched",
  OUT_OF_SCOPE: "Out of scope",
};

/** Plain label for a subject type (founder / manager / LP / co-investor). */
export const SUBJECT_TYPE_LABEL: Record<string, string> = {
  FOUNDER: "Founder",
  MANAGER: "Fund manager",
  LP: "Limited partner",
  CO_INVESTOR: "Co-investor",
  PERSON: "Individual",
  ORGANIZATION: "Organisation",
};

export function subjectTypeLabel(t: string): string {
  return SUBJECT_TYPE_LABEL[t] ?? t.charAt(0) + t.slice(1).toLowerCase();
}

/** Plain stage labels for the live run (maps PipelineStage → UI words). */
export const STAGE_LABEL: Record<PipelineStage, string> = {
  scope: "Scope",
  fingerprint: "Identity inputs",
  gate_g1: "Identity check",
  collect: "Search",
  assess: "Assess",
  resolve: "Follow-up",
  compile: "Compile",
  red_team: "Independent recheck",
  gate_g2: "Final review",
  publish: "Publish",
};

export const STAGE_ORDER: PipelineStage[] = [
  "scope",
  "fingerprint",
  "gate_g1",
  "collect",
  "assess",
  "resolve",
  "compile",
  "red_team",
  "gate_g2",
  "publish",
];

/** Severity order of verdicts (worst first). */
const VERDICT_RANK: Record<Verdict, number> = {
  STOP: 0,
  RED_FLAG: 1,
  CONCERNS: 2,
  INSUFFICIENT_COVERAGE: 3,
  CLEAR: 4,
};

export function worstVerdict(
  verdicts: Array<Verdict | null | undefined>,
): Verdict | null {
  let best: Verdict | null = null;
  for (const v of verdicts) {
    if (!v) continue;
    if (best === null || VERDICT_RANK[v] < VERDICT_RANK[best]) best = v;
  }
  return best;
}

/** Relative time in plain words, e.g. "25 min ago", "yesterday", "3 d ago". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = now - t;
  const past = diff >= 0;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  const hr = Math.round(abs / 3600000);
  const day = Math.round(abs / 86400000);
  if (min < 1) return "just now";
  if (min < 60) return past ? `${min} min ago` : `in ${min} min`;
  if (hr < 24) return past ? `${hr} h ago` : `in ${hr} h`;
  if (day === 1) return past ? "yesterday" : "tomorrow";
  if (day < 30) return past ? `${day} d ago` : `in ${day} d`;
  return new Date(t).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Absolute, readable date: "8 Oct 2026". */
export function longDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Clock time for the activity feed: "14:30". */
export function clockTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type RecommendedAction = {
  key: "proceed" | "conditions" | "pause" | "decline";
  title: string;
  body: string;
  /** CSS colour token for the accent rule. */
  tone: string;
};

/**
 * Compiler-style recommended options for the committee (read-only; the real
 * decision is recorded at final review, C-25 / HR-010).
 */
export function recommendedAction(
  top: Verdict | null,
  unresolved: number,
): RecommendedAction {
  const open =
    unresolved > 0
      ? ` (${unresolved} open follow-up${unresolved === 1 ? "" : "s"})`
      : "";
  if (top === "STOP") {
    return {
      key: "decline",
      title: "Hold for compliance review",
      body:
        "A compliance condition stopped this check. Do not proceed until compliance has cleared it.",
      tone: "var(--verdict-stop-ring)",
    };
  }
  if (top === "RED_FLAG") {
    return {
      key: "pause",
      title: `Pause pending follow-ups${open}`,
      body:
        "A red flag is open. Resolve the outstanding follow-ups before the committee decides, or decline.",
      tone: "var(--verdict-redflag)",
    };
  }
  if (top === "CONCERNS" || top === "INSUFFICIENT_COVERAGE") {
    return {
      key: "conditions",
      title: `Proceed with conditions${open}`,
      body:
        top === "INSUFFICIENT_COVERAGE"
          ? "Coverage is thin on at least one question. Proceed only with the stated conditions and a plan to close the gap."
          : "Concerns are documented but not disqualifying. Proceed with conditions and monitoring.",
      tone: "var(--verdict-concerns)",
    };
  }
  return {
    key: "proceed",
    title: "Proceed",
    body: "No disqualifying findings. Nothing requires a person before the committee decides.",
    tone: "var(--verdict-clear)",
  };
}

/** Split summaries into the two review-queue buckets (G1 identity / G2 final). */
export function reviewBuckets(cases: CaseSummary[]): {
  g1: CaseSummary[];
  g2: CaseSummary[];
} {
  const g1: CaseSummary[] = [];
  const g2: CaseSummary[] = [];
  for (const c of cases) {
    if (!c.needsReview) continue;
    if (c.state === "AWAIT_G1") g1.push(c);
    else if (c.state === "AWAIT_G2" || c.state === "STOPPED") g2.push(c);
    else g2.push(c);
  }
  return { g1, g2 };
}
