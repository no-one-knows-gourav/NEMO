/**
 * NEMO shared domain types.
 *
 * This file is the contract every layer codes against: the deterministic
 * scoring engine (src/lib/scoring), the knowledge-graph store (src/lib/kg),
 * the live agent pipeline (src/lib/agents) and all UI screens (src/app,
 * src/components). Enumerations trace to PRD Appendix B; scoring shapes trace
 * to PRD Section 8; disclosure shapes to Section 9; KG nodes to Section 15.2.
 */

// ---------------------------------------------------------------------------
// Enumerations (PRD Appendix B)
// ---------------------------------------------------------------------------

export type Verdict =
  | "CLEAR"
  | "CONCERNS"
  | "RED_FLAG"
  | "INSUFFICIENT_COVERAGE"
  | "STOP";

export type RetrievalState =
  | "FOUND_RETRIEVED"
  | "FOUND_NOT_RETRIEVED"
  | "NOT_FOUND"
  | "UNREACHABLE"
  | "PARTIAL"
  | "OUT_OF_SCOPE";

export type SourceTier = "T1" | "T2" | "T3" | "T4" | "T5";
export type Severity = "S1" | "S2" | "S3" | "S4" | "S5";
export type IdentifierTier = "U" | "R" | "H" | "P";

export type Question =
  | "identity"
  | "integrity"
  | "credibility"
  | "financial"
  | "track_record"
  | "crimes_compliance"
  | "connections";

export const ALL_QUESTIONS: Question[] = [
  "identity",
  "integrity",
  "credibility",
  "financial",
  "track_record",
  "crimes_compliance",
  "connections",
];

export const QUESTION_LABEL: Record<Question, string> = {
  identity: "Identity",
  integrity: "Integrity",
  credibility: "Credibility",
  financial: "Financial situation",
  track_record: "Track record",
  crimes_compliance: "Crimes and compliance",
  connections: "Connections",
};

export type Domain =
  | "PERSONAL"
  | "FINANCIAL"
  | "LEGAL"
  | "PROFESSIONAL"
  | "SHARED_MEDIA"
  | "SHARED_CROWD";

export type LegalStatus =
  | "PENDING"
  | "CONVICTED"
  | "FINAL_ORDER"
  | "ACQUITTED"
  | "QUASHED"
  | "SETTLED"
  | "WITHDRAWN"
  | "APPEALED"
  | "UNKNOWN";

export type Role =
  | "ACCUSED"
  | "RESPONDENT_DIRECTOR"
  | "REGULATOR_KEY_PERSON"
  | "PLAINTIFF"
  | "WITNESS"
  | "COUNSEL"
  | "MENTIONED";

export type MatchDecisionType = "ACCEPT" | "REJECT" | "AMBIGUOUS" | "HUMAN";
export type FindingStatus = "CONFIRMED" | "ALLEGATION" | "DISMISSED";
export type ClaimStatus = "VERIFIED" | "CONTRADICTED" | "UNVERIFIED";

export type AlignmentOutcome =
  | "AGREE"
  | "MINOR_VARIANCE"
  | "DECLARED_NOT_FOUND"
  | "FOUND_NOT_DECLARED"
  | "CONFLICT";

export type CRType =
  | "IDENTITY_FIX"
  | "IDENTITY_MERGE"
  | "IDENTITY_SPLIT"
  | "EVIDENCE_FIX"
  | "NEW_LEAD"
  | "MATERIALITY_OVERRIDE"
  | "SUBJECT_RESPONSE"
  | "REQUEST_DOCS"
  | "SCOPE_CHANGE"
  | "WORDING";

export type DIDStatus =
  | "PROVISIONAL"
  | "FINAL"
  | "VERIFIED"
  | "SUPERSEDED"
  | "MERGED"
  | "REVOKED";

export type CaseLevel = "L1" | "L2" | "L3";

export type CaseState =
  | "CREATED"
  | "SCOPED"
  | "ANCHORING"
  | "AWAIT_G1"
  | "COLLECTING"
  | "ASSESSING"
  | "RESOLVING"
  | "COMPILING"
  | "RED_TEAM"
  | "AWAIT_G2"
  | "REDO"
  | "PUBLISHING"
  | "MONITORING"
  | "STOPPED";

export type ChunkType =
  | "SUMMARY"
  | "FINDING"
  | "ABSENCE"
  | "CLAIM_CHECK"
  | "DISCLOSURE"
  | "COVERAGE"
  | "UNRESOLVED"
  | "METHOD";

export type PlatformKind =
  | "official_portal"
  | "licensed_feed"
  | "national_outlet"
  | "regional_outlet"
  | "trade_press"
  | "scraped_copy"
  | "pr_wire"
  | "content_farm";

export type TamperKind =
  | "official_portal_direct"
  | "licensed_or_mirror"
  | "news_page"
  | "supplied_unverified"
  | "social_post"
  | "anonymous_post"
  | "screenshot";

export type HalfLifeCategory =
  | "criminal"
  | "regulatory"
  | "governance"
  | "financial_distress"
  | "media_allegation"
  | "commercial_dispute";

export type FootprintFlag =
  | "THIN_FOOTPRINT"
  | "LATE_FOOTPRINT"
  | "MEDIA_SPIKE"
  | "GAP"
  | "PATTERN";

// ---------------------------------------------------------------------------
// Scoring engine I/O (PRD Section 8)
// ---------------------------------------------------------------------------

/** One extracted piece of evidence supporting an event (Section 8.2). */
export interface EvidenceInput {
  id: string;
  tier: SourceTier;
  platform: PlatformKind;
  tamper: TamperKind;
  /** τ override from document forensics (FR-062); falls back to `tamper`. */
  tamperOverride?: number;
  /** Whether this evidence item is independent (vs a syndicated copy). */
  independent: boolean;
  /** NLI entailment score of the extracted fact vs its cited span (C-19). */
  entailment: number;
  source: string;
  retrievedAt?: string;
  excerpt?: string;
}

/** An event the subject may be party to, scored per PRD Section 8.4. */
export interface EventInput {
  id: string;
  title: string;
  category: HalfLifeCategory;
  severity: Severity;
  role: Role;
  /** Years since the event date (not retrieval date). */
  ageYears: number;
  /** Calibrated match probability m (Section 8.3). */
  m: number;
  /** Double-blind matcher outputs, when a pair ran. */
  mA?: number;
  mB?: number;
  /** Questions this event contributes to. */
  questions: Question[];
  status: FindingStatus;
  legalStatus?: LegalStatus;
  evidence: EvidenceInput[];
  /** Distinct linked entity id, used by the pattern rule (Section 8.6). */
  entityId?: string;
}

export interface EventScore {
  eventId: string;
  soeEvent: number;
  rc: number;
  rcLow: number;
  rcHigh: number;
  ef: number;
  /** Per-evidence SoE breakdown, for the report and inspector. */
  soeByEvidence: { id: string; soe: number }[];
  m: number;
  severityWeight: number;
  roleFactor: number;
}

/** Coverage input per source for one question (Section 8.6). */
export interface CoverageSourceInput {
  sourceId: string;
  /** Importance of this source for the question, from the Playbook. */
  weight: number;
  state: RetrievalState;
  /** 0..1, used when state is PARTIAL. */
  completeness?: number;
}

export interface QuestionScoreInput {
  question: Question;
  events: EventInput[];
  coverage: CoverageSourceInput[];
}

export interface QuestionScore {
  question: Question;
  qPoint: number;
  qLow: number;
  qHigh: number;
  ef: number;
  coverage: number;
  verdict: Verdict;
  /** Set when the pattern rule (Section 8.6) raised the band. */
  pattern: boolean;
  /** Set when an S1 CONFIRMED override forced RED_FLAG. */
  s1Override: boolean;
  eventScores: EventScore[];
  configVersion: string;
}

// ---------------------------------------------------------------------------
// Disclosure, dissimilarity, trust (PRD Section 9)
// ---------------------------------------------------------------------------

export interface AlignmentField {
  field: string;
  /** Section the field belongs to, e.g. "Education", "Ventures". */
  group: string;
  declared?: string;
  discovered?: string;
  outcome: AlignmentOutcome;
  /** Adverse items use severity weight; positive claims use materiality. */
  weight: number;
  /** For DECLARED_NOT_FOUND: coverage of the relevant sources (0..1). */
  coverage?: number;
  /** Was this field asked about in the questionnaire and declared? */
  declaredFlag: boolean;
  /** Does discovered evidence support the declared claim? */
  supportedFlag: boolean;
  evidenceIds?: string[];
}

export interface DisclosureMetrics {
  /** Dissimilarity δ. */
  dissimilarity: number;
  /** Consistency C. */
  consistency: number;
  /** Disclosure Degree DD. */
  disclosureDegree: number;
  /** Verification rate V. */
  verification: number;
  /** Trust metric TM = C^α · DD^β · V^γ. */
  trust: number;
  trustBand: "High" | "Moderate" | "Low";
  fields: AlignmentField[];
}

// ---------------------------------------------------------------------------
// Knowledge graph (PRD Section 15.2) — pseudonymous, token-based
// ---------------------------------------------------------------------------

export type KGNodeType =
  | "Case"
  | "Plan"
  | "Person"
  | "Alias"
  | "Identifier"
  | "Attribute"
  | "Organization"
  | "Address"
  | "Source"
  | "EvidenceSpan"
  | "Event"
  | "Claim"
  | "MatchDecision"
  | "Classification"
  | "Finding"
  | "Score"
  | "CoverageRecord"
  | "OpenItem"
  | "Probe"
  | "DigitalID"
  | "ReportVersion"
  | "Review"
  | "ChangeRequest"
  | "Snapshot";

export interface KGProvenance {
  createdBy: string;
  modelId?: string;
  promptVersion?: string;
  playbookVersion?: string;
  configVersion?: string;
}

export interface KGNode {
  id: string;
  type: KGNodeType;
  caseScope: string; // case id or "GLOBAL"
  accessLabel: "CASE_TEAM" | "COMPLIANCE_ONLY" | "REVIEWER_ONLY";
  recordedAt: string;
  supersededAt?: string;
  stale?: boolean;
  provenance: KGProvenance;
  confidence?: number;
  props: Record<string, unknown>;
}

export type KGEdgeType =
  | "HAS_ALIAS"
  | "HAS_IDENTIFIER"
  | "HAS_ATTRIBUTE"
  | "DIRECTOR_OF"
  | "OFFICER_OF"
  | "SHAREHOLDER_OF"
  | "PARTY_TO"
  | "EVIDENCED_BY"
  | "EXTRACTED_FROM"
  | "SUPPORTS"
  | "CONTRADICTS"
  | "MATCHED_BY"
  | "DERIVED_FROM"
  | "SUPERSEDES"
  | "REVIEWED_BY"
  | "ASSOCIATED_WITH"
  | "DECLARED_AS"
  | "DISCOVERED_AS";

export interface KGEdge {
  id: string;
  type: KGEdgeType;
  from: string;
  to: string;
  props?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Identity fingerprint (Section 7.3, Gate G1)
// ---------------------------------------------------------------------------

export interface FingerprintAttribute {
  type: string; // e.g. "DOB_TOKEN", "FATHER_NAME", "CITY", "DIN"
  label: string;
  tier: IdentifierTier;
  /** Masked/tokenised value for display (never a raw Tier-U value). */
  displayValue: string;
  confidence: number;
  agreement: "AGREED" | "DISPUTED";
  /** For disputed attributes, the two resolver values. */
  valueA?: string;
  valueB?: string;
  provenance?: string;
}

export interface NameVariant {
  value: string;
  kind: "transliteration" | "previous" | "initials" | "misspelling" | "honorific";
  confidence: number;
}

export interface LinkedEntity {
  id: string;
  name: string;
  relation: "DIRECTOR_OF" | "OFFICER_OF" | "SHAREHOLDER_OF" | "ASSOCIATED_WITH";
  from?: string;
  to?: string | null;
  jurisdiction?: string;
  status?: "active" | "struck_off" | "liquidated";
}

export interface Fingerprint {
  version: number;
  canonicalName: string;
  photoRef?: string;
  attributes: FingerprintAttribute[];
  aliases: NameVariant[];
  linkedEntities: LinkedEntity[];
  flags: FootprintFlag[];
  /** Speculative wave-A summary shown at gate G1. */
  speculative?: {
    sanctions: "clear" | "hit";
    registryEntities: number;
  };
}

// ---------------------------------------------------------------------------
// Findings, claims, coverage (surfaced to UI)
// ---------------------------------------------------------------------------

export interface Finding {
  id: string;
  title: string;
  question: Question;
  severity: Severity;
  status: FindingStatus;
  role: Role;
  legalStatus?: LegalStatus;
  category: HalfLifeCategory;
  domain: Domain;
  summary: string;
  /** Worded as an allegation when status is ALLEGATION (copy rule). */
  score?: EventScore;
  evidence: EvidenceRef[];
  humanReview?: { gate: "G1" | "G2"; decision: string; reviewer: string };
}

export interface EvidenceRef {
  id: string;
  tier: SourceTier;
  source: string;
  retrievedAt?: string;
  excerpt?: string;
  url?: string;
  location?: string;
  entailment?: number;
}

export interface Claim {
  id: string;
  type: string;
  value: string;
  claimedDates?: string;
  materiality: "high" | "medium" | "low";
  origin: "deck" | "cv" | "questionnaire" | "linkedin" | "website";
  status: ClaimStatus;
  evidenceIds: string[];
}

export interface CoverageRow {
  sourceId: string;
  sourceName: string;
  domain: Domain;
  tier: SourceTier;
  state: RetrievalState;
  completeness: number;
  question?: Question;
  errorClass?: string;
}

// ---------------------------------------------------------------------------
// Reference Call List (Section 16.5)
// ---------------------------------------------------------------------------

export interface ReferenceCall {
  personRef: string;
  displayName: string;
  relationship: string;
  overlap?: { from: string; to: string };
  whyCall: string[];
  suggestedQuestions: string[];
  contactRoute: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

// ---------------------------------------------------------------------------
// Change requests, reviews (Section 14)
// ---------------------------------------------------------------------------

export interface ChangeRequest {
  crId: string;
  caseId: string;
  gate: "G1" | "G2";
  type: CRType;
  target?: { nodeType: string; nodeId: string };
  instruction?: Record<string, unknown>;
  rawComment: string;
  parsedBy?: string;
  confirmedByReviewer: boolean;
  createdBy: string;
  createdAt: string;
}

export interface ReviewDecision {
  gate: "G1" | "G2";
  reviewer: string;
  decision: string;
  rationale?: string;
  reportVersion?: number;
  at: string;
}

// ---------------------------------------------------------------------------
// Digital ID (Section 16.1)
// ---------------------------------------------------------------------------

export interface DigitalID {
  digitalId: string;
  uuid: string;
  variant: "D" | "S" | "V";
  status: DIDStatus;
  version: number;
  changedFields?: string[];
  subjectType: string;
  canonicalName: string;
  aliases: string[];
  identifierTypesHeld: string[];
  linkedEntities: { id: string; relation: string; from?: string; to?: string | null }[];
  verdicts: Record<Question, Verdict>;
  scores: Partial<Record<Question, { point: number; low: number; high: number; ef: number }>>;
  disclosure: { tm: number; dd: number; c: number; v: number; delta: number };
  coverage: { overall: number };
  caseLevel: CaseLevel;
  asOf: string;
  nextRefresh?: string;
  refs?: Record<string, string>;
  reviewedBy?: string[];
  signature?: { alg: string; kid: string; sig: string };
}

// ---------------------------------------------------------------------------
// Pipeline run events (live agent streaming)
// ---------------------------------------------------------------------------

export type PipelineStage =
  | "scope"
  | "fingerprint"
  | "gate_g1"
  | "collect"
  | "assess"
  | "resolve"
  | "compile"
  | "red_team"
  | "gate_g2"
  | "publish";

export interface PipelineEvent {
  id: string;
  caseId: string;
  ts: string;
  stage: PipelineStage;
  component: string; // e.g. "C-02 Case Planner"
  level: "info" | "finding" | "warn" | "gate" | "done" | "error";
  message: string;
  /** Optional structured payload (ids only; never raw identifiers). */
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Case (the top-level record the UI lists and opens)
// ---------------------------------------------------------------------------

export interface CasePlan {
  questions: Question[];
  domains: Domain[];
  sources: string[];
  level: CaseLevel;
  associatePolicy: string;
  legalBasis: string;
  budgets: { machineTimeHours: number; maxResolveRounds: number };
  rulesApplied: { ruleId: string; version: string }[];
}

export interface SubjectIntake {
  name: string;
  purpose: string;
  dealContext?: string;
  subjectType: string;
  jurisdiction?: string;
  declaredIdentifiers?: { type: string; value: string }[];
  documents?: { name: string; kind: string; text?: string }[];
  questionnaire?: { field: string; answer: string }[];
}

export interface NemoCase {
  id: string;
  subject: SubjectIntake;
  level: CaseLevel;
  state: CaseState;
  createdAt: string;
  updatedAt: string;
  plan?: CasePlan;
  fingerprint?: Fingerprint;
  findings: Finding[];
  claims: Claim[];
  coverage: CoverageRow[];
  questionScores: Partial<Record<Question, QuestionScore>>;
  verdicts: Partial<Record<Question, Verdict>>;
  disclosure?: DisclosureMetrics;
  referenceCalls: ReferenceCall[];
  changeRequests: ChangeRequest[];
  reviews: ReviewDecision[];
  digitalId?: DigitalID;
  events: PipelineEvent[];
  /** Was this run live (LLM-backed) or seeded replay? */
  mode: "live" | "replay";
  /** Narrative report markdown (compiled). */
  report?: string;
  redTeamNotes?: { recallMisses: string[]; compileErrors: string[] };
}

export interface CaseSummary {
  id: string;
  name: string;
  subjectType: string;
  level: CaseLevel;
  state: CaseState;
  createdAt: string;
  updatedAt: string;
  topVerdict: Verdict | null;
  needsReview: boolean;
  unresolvedCount: number;
}
