/**
 * Seeded demo case: "Rahul Sharma", the L2 seed fintech founder from PRD
 * Appendix C (and the Section 8.8 worked example). Every score is computed by
 * the real engine so the numbers stay internally consistent, and the pipeline
 * event log narrates the Appendix C trace. Used as the default demo and as the
 * replay-mode dataset when no ANTHROPIC_API_KEY is configured.
 */
import {
  scoreCase,
} from "@/lib/scoring/engine";
import { computeDisclosure } from "@/lib/scoring/disclosure";
import type {
  AlignmentField,
  Claim,
  CoverageRow,
  CoverageSourceInput,
  EventInput,
  Finding,
  NemoCase,
  PipelineEvent,
  Question,
  ReferenceCall,
  Verdict,
} from "@/lib/types";
import { ALL_QUESTIONS } from "@/lib/types";

const CASE_ID = "case_seed_rahul";
const AS_OF = "2026-10-08";

// ---------------------------------------------------------------------------
// Events (scored by the engine)
// ---------------------------------------------------------------------------

const events: EventInput[] = [
  {
    id: "ev_exit",
    title: "Claimed exit of XYZ Pvt Ltd contradicted",
    category: "governance",
    severity: "S2", // credential conflict backed by a supplied doc (FR-073)
    role: "ACCUSED",
    ageYears: 2,
    m: 0.95,
    mA: 0.96,
    mB: 0.94,
    questions: ["credibility", "track_record"],
    status: "CONFIRMED",
    legalStatus: "FINAL_ORDER",
    entityId: "org_xyz",
    evidence: [
      {
        id: "ev_mca_xyz",
        tier: "T1",
        platform: "official_portal",
        tamper: "official_portal_direct",
        independent: true,
        entailment: 0.97,
        source: "MCA21",
        retrievedAt: "2026-10-06",
        excerpt:
          "XYZ Pvt Ltd — status: Struck Off (2021). No share-transfer filings on record.",
      },
    ],
  },
  {
    id: "ev_labour",
    title: "Pending labour case naming the subject as respondent director",
    category: "commercial_dispute",
    severity: "S4",
    role: "RESPONDENT_DIRECTOR",
    ageYears: 1,
    m: 0.85,
    mA: 0.87,
    mB: 0.83,
    questions: ["integrity"],
    status: "ALLEGATION",
    legalStatus: "PENDING",
    entityId: "org_xyz",
    evidence: [
      {
        id: "ev_ecourts_labour",
        tier: "T2",
        platform: "official_portal",
        tamper: "official_portal_direct",
        independent: true,
        entailment: 0.95,
        source: "eCourts (Gurugram)",
        retrievedAt: "2026-10-06",
        excerpt:
          "O.P. No. 441/2025 — respondent no. 2 (director). Matter pending. Next hearing listed.",
      },
      {
        id: "ev_media_salary",
        tier: "T3",
        platform: "regional_outlet",
        tamper: "news_page",
        independent: true,
        entailment: 0.88,
        source: "Regional business daily",
        retrievedAt: "2026-10-07",
        excerpt:
          "Former staff of XYZ allege salary delays in the months before shutdown.",
      },
    ],
  },
];

// Coverage per question (source weights from the Playbook; prototype priors).
const coverageByQuestion: Partial<Record<Question, CoverageSourceInput[]>> = {
  identity: [
    { sourceId: "mca_din", weight: 1.0, state: "FOUND_RETRIEVED" },
    { sourceId: "kyc", weight: 1.0, state: "FOUND_RETRIEVED" },
  ],
  integrity: [
    { sourceId: "ecourts", weight: 1.0, state: "PARTIAL", completeness: 0.62 },
    { sourceId: "high_court", weight: 0.8, state: "FOUND_RETRIEVED" },
    { sourceId: "media", weight: 0.6, state: "FOUND_RETRIEVED" },
  ],
  credibility: [
    { sourceId: "mca", weight: 1.0, state: "FOUND_RETRIEVED" },
    { sourceId: "questionnaire", weight: 1.0, state: "FOUND_RETRIEVED" },
    { sourceId: "linkedin", weight: 0.4, state: "FOUND_RETRIEVED" },
  ],
  financial: [
    { sourceId: "ibbi", weight: 1.0, state: "NOT_FOUND" },
    { sourceId: "drt", weight: 0.8, state: "NOT_FOUND" },
    { sourceId: "defaulters", weight: 0.9, state: "NOT_FOUND" },
  ],
  track_record: [
    { sourceId: "mca", weight: 1.0, state: "FOUND_RETRIEVED" },
    { sourceId: "tracxn", weight: 0.6, state: "FOUND_RETRIEVED" },
  ],
  crimes_compliance: [
    { sourceId: "sanctions", weight: 1.0, state: "NOT_FOUND" },
    { sourceId: "pep", weight: 1.0, state: "NOT_FOUND" },
    { sourceId: "sebi", weight: 0.9, state: "NOT_FOUND" },
    { sourceId: "ed_sfio", weight: 0.9, state: "NOT_FOUND" },
  ],
  connections: [
    { sourceId: "mca_network", weight: 1.0, state: "FOUND_RETRIEVED" },
    { sourceId: "opencorporates", weight: 0.7, state: "PARTIAL", completeness: 0.7 },
  ],
};

const questions: Question[] = [...ALL_QUESTIONS];
const scores = scoreCase(questions, events, coverageByQuestion);

const verdicts = {} as Partial<Record<Question, Verdict>>;
for (const q of questions) verdicts[q] = scores[q].verdict;

// ---------------------------------------------------------------------------
// Findings (UI surface) derived from the scored events
// ---------------------------------------------------------------------------

const findings: Finding[] = [
  {
    id: "F-001",
    title: "Claimed 'successful exit' of XYZ Pvt Ltd is contradicted",
    question: "track_record",
    severity: "S2",
    status: "CONFIRMED",
    role: "ACCUSED",
    legalStatus: "FINAL_ORDER",
    category: "governance",
    domain: "PROFESSIONAL",
    summary:
      "The pitch deck claims a successful exit of XYZ Pvt Ltd. MCA records show the company was struck off in 2021 with no share-transfer filings. The struck-off status was not disclosed in the questionnaire.",
    score: scores.track_record.eventScores.find((e) => e.eventId === "ev_exit"),
    evidence: [
      {
        id: "ev_mca_xyz",
        tier: "T1",
        source: "MCA21",
        retrievedAt: "2026-10-06",
        excerpt:
          "XYZ Pvt Ltd — status: Struck Off (2021). No share-transfer filings on record.",
        location: "MCA master data, company view",
        entailment: 0.97,
      },
    ],
    humanReview: { gate: "G2", decision: "UPHELD", reviewer: "reviewer_17" },
  },
  {
    id: "F-002",
    title: "Named as respondent in a pending labour matter",
    question: "integrity",
    severity: "S4",
    status: "ALLEGATION",
    role: "RESPONDENT_DIRECTOR",
    legalStatus: "PENDING",
    category: "commercial_dispute",
    domain: "LEGAL",
    summary:
      "Named as respondent director in a pending labour matter in Gurugram (2025). Worded as an allegation: the matter is undecided. A regional article alleging salary delays at XYZ corroborates the timing.",
    score: scores.integrity.eventScores.find((e) => e.eventId === "ev_labour"),
    evidence: [
      {
        id: "ev_ecourts_labour",
        tier: "T2",
        source: "eCourts (Gurugram)",
        retrievedAt: "2026-10-06",
        excerpt:
          "O.P. No. 441/2025 — respondent no. 2 (director). Matter pending.",
        location: "District court cause list",
        entailment: 0.95,
      },
      {
        id: "ev_media_salary",
        tier: "T3",
        source: "Regional business daily",
        retrievedAt: "2026-10-07",
        excerpt:
          "Former staff of XYZ allege salary delays in the months before shutdown.",
        entailment: 0.88,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Claims (DID-D)
// ---------------------------------------------------------------------------

const claims: Claim[] = [
  {
    id: "C-01",
    type: "education",
    value: "B.Tech, IIT Delhi, 2012",
    materiality: "medium",
    origin: "cv",
    status: "VERIFIED",
    evidenceIds: ["ev_nad"],
  },
  {
    id: "C-02",
    type: "venture_outcome",
    value: "Successful exit of XYZ Pvt Ltd",
    claimedDates: "2021",
    materiality: "high",
    origin: "deck",
    status: "CONTRADICTED",
    evidenceIds: ["ev_mca_xyz"],
  },
  {
    id: "C-03",
    type: "metric",
    value: "₹40 Cr ARR at current venture",
    materiality: "high",
    origin: "deck",
    status: "UNVERIFIED",
    evidenceIds: [],
  },
  {
    id: "C-04",
    type: "directorship",
    value: "Director, three companies (current and past)",
    materiality: "medium",
    origin: "questionnaire",
    status: "VERIFIED",
    evidenceIds: ["ev_mca_din"],
  },
];

// ---------------------------------------------------------------------------
// Coverage map (UI)
// ---------------------------------------------------------------------------

const coverage: CoverageRow[] = [
  { sourceId: "sanctions", sourceName: "OFAC/UN/EU/UK sanctions", domain: "LEGAL", tier: "T1", state: "NOT_FOUND", completeness: 1 },
  { sourceId: "pep", sourceName: "PEP datasets", domain: "PERSONAL", tier: "T1", state: "NOT_FOUND", completeness: 1 },
  { sourceId: "mca", sourceName: "MCA21 (directorships, filings)", domain: "PROFESSIONAL", tier: "T1", state: "FOUND_RETRIEVED", completeness: 1 },
  { sourceId: "ecourts", sourceName: "eCourts (district)", domain: "LEGAL", tier: "T1", state: "PARTIAL", completeness: 0.62, errorClass: "some districts not digitised" },
  { sourceId: "high_court", sourceName: "High Court portals", domain: "LEGAL", tier: "T1", state: "FOUND_RETRIEVED", completeness: 1 },
  { sourceId: "sebi", sourceName: "SEBI / RBI / ED / SFIO orders", domain: "LEGAL", tier: "T1", state: "NOT_FOUND", completeness: 1 },
  { sourceId: "ibbi", sourceName: "IBBI / NCLT insolvency", domain: "FINANCIAL", tier: "T1", state: "NOT_FOUND", completeness: 1 },
  { sourceId: "defaulters", sourceName: "Wilful-defaulter data (licensed)", domain: "FINANCIAL", tier: "T2", state: "NOT_FOUND", completeness: 1 },
  { sourceId: "tracxn", sourceName: "Tracxn / Venture Intelligence", domain: "PROFESSIONAL", tier: "T3", state: "FOUND_RETRIEVED", completeness: 1 },
  { sourceId: "media", sourceName: "National & regional media", domain: "SHARED_MEDIA", tier: "T3", state: "FOUND_RETRIEVED", completeness: 1 },
  { sourceId: "pune_court", sourceName: "District court portal (Pune)", domain: "LEGAL", tier: "T1", state: "UNREACHABLE", completeness: 0, errorClass: "portal timeout" },
];

// ---------------------------------------------------------------------------
// Disclosure (DID-D vs DID-S)
// ---------------------------------------------------------------------------

const alignmentFields: AlignmentField[] = [
  { field: "Canonical name", group: "Identity", declared: "Rahul Sharma", discovered: "Rahul Sharma", outcome: "AGREE", weight: 0.6, declaredFlag: true, supportedFlag: true },
  { field: "Education — B.Tech IIT Delhi", group: "Education", declared: "2012", discovered: "2012", outcome: "AGREE", weight: 0.6, declaredFlag: true, supportedFlag: true, evidenceIds: ["ev_nad"] },
  { field: "Directorships", group: "Corporate", declared: "3", discovered: "3", outcome: "AGREE", weight: 0.6, declaredFlag: true, supportedFlag: true, evidenceIds: ["ev_mca_din"] },
  { field: "XYZ Pvt Ltd outcome", group: "Ventures", declared: "Successful exit", discovered: "Struck off 2021", outcome: "CONFLICT", weight: 0.8, declaredFlag: true, supportedFlag: false, evidenceIds: ["ev_mca_xyz"] },
  { field: "XYZ struck-off status", group: "Ventures", discovered: "Struck off 2021", outcome: "FOUND_NOT_DECLARED", weight: 0.5, declaredFlag: false, supportedFlag: false, evidenceIds: ["ev_mca_xyz"] },
  { field: "Pending labour matter", group: "Litigation", discovered: "Respondent, 2025", outcome: "FOUND_NOT_DECLARED", weight: 0.25, declaredFlag: false, supportedFlag: false, evidenceIds: ["ev_ecourts_labour"] },
  { field: "Current venture ARR (₹40 Cr)", group: "Metrics", declared: "₹40 Cr", outcome: "DECLARED_NOT_FOUND", weight: 1.0, coverage: 0.8, declaredFlag: true, supportedFlag: false },
  { field: "PEP status", group: "Identity", declared: "Not a PEP", discovered: "Not a PEP", outcome: "AGREE", weight: 0.3, declaredFlag: true, supportedFlag: true },
];

const disclosure = computeDisclosure(alignmentFields);

// ---------------------------------------------------------------------------
// Reference Call List
// ---------------------------------------------------------------------------

const referenceCalls: ReferenceCall[] = [
  {
    personRef: "NEMO-PER-2B8D-4KQ1",
    displayName: "A. Mehta",
    relationship: "Co-founder, XYZ Pvt Ltd",
    overlap: { from: "2017-06", to: "2021-03" },
    whyCall: [
      "Claimed exit of XYZ contradicted by registry",
      "Can speak to the founder's conduct at shutdown",
    ],
    suggestedQuestions: [
      "How did XYZ end?",
      "What role did the founder play in the wind-down?",
    ],
    contactRoute: "Public professional channel only",
    priority: "HIGH",
  },
  {
    personRef: "NEMO-PER-5H2N-9LP3",
    displayName: "S. Rao",
    relationship: "Former CFO, XYZ Pvt Ltd",
    overlap: { from: "2019-01", to: "2021-03" },
    whyCall: ["Salary-delay allegations in the period before shutdown"],
    suggestedQuestions: ["Were salaries delayed? For how long?"],
    contactRoute: "Public professional channel only",
    priority: "MEDIUM",
  },
];

// ---------------------------------------------------------------------------
// Pipeline event log (narrates the Appendix C trace)
// ---------------------------------------------------------------------------

function ev(
  seq: number,
  stage: PipelineEvent["stage"],
  component: string,
  level: PipelineEvent["level"],
  message: string,
  data?: Record<string, unknown>,
): PipelineEvent {
  return {
    id: `pe_${seq}`,
    caseId: CASE_ID,
    ts: new Date(Date.parse(AS_OF) + seq * 60000).toISOString(),
    stage,
    component,
    level,
    message,
    data,
  };
}

export const SEED_EVENTS: PipelineEvent[] = [
  ev(1, "scope", "C-02 Case Planner", "info", "Case scoped: purpose SEED_INVESTMENT, level L2 (fintech rule). All seven questions selected."),
  ev(2, "scope", "C-03 Policy Engine", "done", "Plan validated. Legal basis recorded. 18 sources in the allowlist."),
  ev(3, "fingerprint", "C-04 Doc Parser", "info", "Parsed CV, deck and KYC. DIN tokenised to the vault; only tokens entered the graph."),
  ev(4, "fingerprint", "C-05 Hard-ID Lookup", "info", "DIN resolved against MCA: three past directorships found."),
  ev(5, "fingerprint", "C-08 Resolvers A/B", "info", "Resolvers A and B agree on DIN, father's name and DOB token; disagree on one alias."),
  ev(6, "fingerprint", "C-09 Fingerprint Comparator", "gate", "Draft identity ready. One disputed alias flagged for your review.", { disputed: 1 }),
  ev(7, "gate_g1", "Gate G1", "gate", "Identity check: reviewer removed the disputed alias and approved. Provisional declared and discovered identities minted."),
  ev(8, "collect", "C-10 Domain Collectors", "info", "Wave B streaming across Personal, Financial, Legal, Professional and media."),
  ev(9, "assess", "C-13 Rule Prefilter", "info", "40 district-court hits for the name. 31 rejected on a father's-name conflict."),
  ev(10, "assess", "C-14 Probabilistic Linker", "info", "7 more rejected by the linker; 2 sent to the double-blind matchers."),
  ev(11, "assess", "C-15 Matchers A/B", "finding", "Matchers agree: subject is plaintiff in a contract suit (S4). They split on a labour case — sent to follow-up."),
  ev(12, "resolve", "C-22 Investigator", "finding", "Labour-case order opened: subject is respondent director; status pending. Logged as an allegation."),
  ev(13, "assess", "C-20 Claim Verifier", "finding", "MCA shows XYZ struck off in 2021. The 'successful exit' claim is contradicted and was not disclosed."),
  ev(14, "red_team", "C-23 Red Team (recall)", "warn", "Independent recheck found a regional-language article on salary delays the first search missed. Corroborates the labour matter."),
  ev(15, "compile", "C-25 Compiler + Blind Verifier", "info", "Compiler and blind verifier agree on all verdicts except track record (CONCERNS vs RED_FLAG) — flagged."),
  ev(16, "red_team", "C-23 Red Team (report)", "warn", "Report-mode recheck found a wrong year in a figure (compile error). Routed back and fixed."),
  ev(17, "gate_g2", "Gate G2", "gate", "Final review ready. Track record RED_FLAG, consistency Low. Two findings, one unresolved item."),
];

// ---------------------------------------------------------------------------
// Assemble the case
// ---------------------------------------------------------------------------

export function buildSeedCase(): NemoCase {
  return {
    id: CASE_ID,
    subject: {
      name: "Rahul Sharma",
      purpose: "Seed investment diligence",
      dealContext: "Seed round, fintech",
      subjectType: "FOUNDER",
      jurisdiction: "IN",
      declaredIdentifiers: [
        { type: "DIN", value: "•••• (vaulted)" },
        { type: "PAN", value: "•••••••••• (vaulted)" },
      ],
      documents: [
        { name: "Pitch deck.pdf", kind: "deck" },
        { name: "Founder CV.pdf", kind: "cv" },
        { name: "KYC bundle.pdf", kind: "kyc" },
        { name: "Self-declaration.pdf", kind: "questionnaire" },
      ],
      questionnaire: [
        { field: "Previous ventures and outcomes", answer: "XYZ Pvt Ltd — successful exit (2021)" },
        { field: "Litigation as a party", answer: "None" },
        { field: "PEP status", answer: "Not a PEP" },
      ],
    },
    level: "L2",
    state: "AWAIT_G2",
    createdAt: AS_OF + "T09:00:00+05:30",
    updatedAt: AS_OF + "T14:30:00+05:30",
    plan: {
      questions,
      domains: ["PERSONAL", "FINANCIAL", "LEGAL", "PROFESSIONAL", "SHARED_MEDIA", "SHARED_CROWD"],
      sources: coverage.map((c) => c.sourceId),
      level: "L2",
      associatePolicy: "1 hop, L1 depth",
      legalBasis: "Legitimate interest — pre-investment diligence; subject consent on file",
      budgets: { machineTimeHours: 8, maxResolveRounds: 3 },
      rulesApplied: [
        { ruleId: "LEVEL_FINTECH", version: "2026.10.0" },
        { ruleId: "MANDATORY_Q", version: "2026.10.0" },
      ],
    },
    fingerprint: {
      version: 1,
      canonicalName: "Rahul Sharma",
      attributes: [
        { type: "DIN", label: "Director ID (DIN)", tier: "U", displayValue: "••••••12", confidence: 0.99, agreement: "AGREED", provenance: "MCA master data" },
        { type: "PAN", label: "PAN", tier: "U", displayValue: "••••••••3K", confidence: 0.99, agreement: "AGREED", provenance: "KYC document" },
        { type: "DOB_TOKEN", label: "Date of birth", tier: "R", displayValue: "1990 (vault-compared)", confidence: 0.95, agreement: "AGREED" },
        { type: "FATHER_NAME", label: "Father's name", tier: "R", displayValue: "••• Sharma", confidence: 0.92, agreement: "AGREED" },
        { type: "CITY", label: "City", tier: "H", displayValue: "Gurugram", confidence: 0.8, agreement: "AGREED" },
      ],
      aliases: [
        { value: "R. Sharma", kind: "initials", confidence: 0.8 },
        { value: "Rahul K. Sharma", kind: "transliteration", confidence: 0.7 },
      ],
      linkedEntities: [
        { id: "NEMO-ORG-2B8D-4KQ1", name: "Current fintech venture", relation: "DIRECTOR_OF", from: "2022-04", to: null, jurisdiction: "IN", status: "active" },
        { id: "NEMO-ORG-7K2M-1XP9", name: "XYZ Pvt Ltd", relation: "DIRECTOR_OF", from: "2017-06", to: "2021-03", jurisdiction: "IN", status: "struck_off" },
      ],
      flags: ["LATE_FOOTPRINT"],
      speculative: { sanctions: "clear", registryEntities: 3 },
    },
    findings,
    claims,
    coverage,
    questionScores: scores,
    verdicts,
    disclosure,
    referenceCalls,
    changeRequests: [],
    reviews: [
      { gate: "G1", reviewer: "analyst_17", decision: "APPROVED", rationale: "Removed one disputed alias (namesake).", at: AS_OF + "T10:00:00+05:30" },
    ],
    events: SEED_EVENTS,
    mode: "replay",
    redTeamNotes: {
      recallMisses: ["Regional-language article on salary delays at XYZ (corroborates the labour matter)."],
      compileErrors: ["A figure cited the wrong year; corrected against the source."],
    },
  };
}

export { CASE_ID as SEED_CASE_ID };
