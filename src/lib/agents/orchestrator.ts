/**
 * C-01 Orchestrator — the deterministic driver of the NEMO pipeline.
 *
 * `runPipeline(caseId)` is a resumable async generator that advances a case
 * stage by stage, emitting PipelineEvent objects, calling the deterministic
 * scoring engine (scoreCase) and disclosure calculator (computeDisclosure), and
 * persisting the case after each stage. It runs in two segments separated by the
 * human gates:
 *   segment 1 (CREATED → AWAIT_G1): scope + fingerprint.
 *   segment 2 (COLLECTING/REDO → AWAIT_G2): collect, assess, resolve, compile,
 *   red-team. applyReview() handles the gate decisions in between.
 *
 * LIVE (ANTHROPIC_API_KEY set): agents call Claude; collectors/red-team may
 * draft clearly-synthetic candidates. REPLAY (no key): the seed case replays its
 * narrated SEED_EVENTS; any other case runs a short generic sequence whose
 * numbers still come from the real engine. Every agent call is wrapped so a
 * missing key or any failure degrades to deterministic behaviour — the pipeline
 * never crashes.
 */
import { isLiveEnabled } from "./client";
import { planCase, deriveLevel } from "./casePlanner";
import { buildFingerprint } from "./fingerprint";
import { scanInjection } from "./injectionFilter";
import { collect } from "./collectors";
import { runMatchers } from "./matchers";
import { classifyEvents } from "./classifier";
import { extractClaims, verifyClaims } from "./claimVerifier";
import { redTeamRecall, redTeamReport } from "./redTeam";
import { compileReport } from "./compiler";
import { scoreCase } from "@/lib/scoring/engine";
import { computeDisclosure } from "@/lib/scoring/disclosure";
import { getCase, saveCase, assertNoRawIdentifiers } from "@/lib/kg/store";
import { SEED_CASE_ID, SEED_EVENTS } from "@/lib/seed/rahulSharma";
import type {
  CaseLevel,
  ChangeRequest,
  DigitalID,
  Domain,
  EventInput,
  EvidenceRef,
  Finding,
  HalfLifeCategory,
  NemoCase,
  PipelineEvent,
  PipelineStage,
  Question,
  Verdict,
} from "@/lib/types";
import { ALL_QUESTIONS } from "@/lib/types";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function makeEvent(
  seq: number,
  caseId: string,
  stage: PipelineStage,
  component: string,
  level: PipelineEvent["level"],
  message: string,
  data?: Record<string, unknown>,
): PipelineEvent {
  return {
    id: `pe_${seq}`,
    caseId,
    ts: new Date().toISOString(),
    stage,
    component,
    level,
    message,
    data,
  };
}

const CAT_DOMAIN: Record<HalfLifeCategory, Domain> = {
  criminal: "LEGAL",
  regulatory: "LEGAL",
  governance: "PROFESSIONAL",
  financial_distress: "FINANCIAL",
  media_allegation: "SHARED_MEDIA",
  commercial_dispute: "LEGAL",
};

function toEvidenceRef(e: EventInput["evidence"][number]): EvidenceRef {
  return {
    id: e.id,
    tier: e.tier,
    source: e.source,
    retrievedAt: e.retrievedAt,
    excerpt: e.excerpt,
    entailment: e.entailment,
  };
}

function eventsToFindings(
  events: EventInput[],
  scoreByEvent: Map<string, Finding["score"]>,
): Finding[] {
  return events.map((e, i) => {
    const q = e.questions[0] ?? "integrity";
    const allegation = e.status === "ALLEGATION";
    const src = e.evidence[0];
    const summary = allegation
      ? `Named in connection with "${e.title}" (${src?.source ?? "source"}). Worded as an allegation: the matter is undecided.`
      : `${e.title}. Supported by ${src?.source ?? "the cited source"}.`;
    return {
      id: `F-${String(i + 1).padStart(3, "0")}`,
      title: e.title,
      question: q,
      severity: e.severity,
      status: e.status,
      role: e.role,
      legalStatus: e.legalStatus,
      category: e.category,
      domain: CAT_DOMAIN[e.category],
      summary,
      score: scoreByEvent.get(e.id),
      evidence: e.evidence.map(toEvidenceRef),
    };
  });
}

// ---------------------------------------------------------------------------
// runPipeline
// ---------------------------------------------------------------------------

const SEGMENT1_STATES = new Set(["CREATED", "SCOPED", "ANCHORING"]);
const SEGMENT2_STATES = new Set([
  "COLLECTING",
  "ASSESSING",
  "RESOLVING",
  "COMPILING",
  "RED_TEAM",
  "REDO",
]);

export async function* runPipeline(
  caseId: string,
): AsyncGenerator<PipelineEvent> {
  const c = await getCase(caseId);
  if (!c) {
    yield makeEvent(1, caseId, "scope", "C-01 Orchestrator", "error", "Case not found.");
    return;
  }

  const live = isLiveEnabled();
  c.mode = live ? "live" : "replay";
  let seq = c.events.length;

  const emit = (
    stage: PipelineStage,
    component: string,
    level: PipelineEvent["level"],
    message: string,
    data?: Record<string, unknown>,
  ): PipelineEvent => {
    const ev = makeEvent(++seq, caseId, stage, component, level, message, data);
    assertNoRawIdentifiers(ev.message);
    c.events.push(ev);
    return ev;
  };

  // --- Seed case: replay the narrated Appendix-C trace verbatim. ------------
  if (caseId === SEED_CASE_ID) {
    for (const se of SEED_EVENTS) {
      yield emit(se.stage, se.component, se.level, se.message, se.data);
    }
    c.state = "AWAIT_G2";
    await saveCase(c);
    return;
  }

  // --- Segment 1: scope + fingerprint → AWAIT_G1 ---------------------------
  if (SEGMENT1_STATES.has(c.state)) {
    yield emit("scope", "C-02 Case Planner", "info", `Scoping case for ${c.subject.name} (${c.subject.subjectType}).`);
    const plan = await planCase(c.subject, c.level);
    c.plan = plan;
    c.level = plan.level;
    c.state = "SCOPED";
    yield emit("scope", "C-03 Policy Engine", "done", `Plan validated: depth ${plan.level}, ${plan.questions.length} questions, ${plan.sources.length} sources in the allowlist.`, { level: plan.level });
    await saveCase(c);

    c.state = "ANCHORING";
    yield emit("fingerprint", "C-04 Doc Parser", "info", `Parsing supplied documents. Raw identifiers vaulted; only masked tokens enter the graph.`);
    // C-12 Injection Filter: scan all untrusted intake text before any model
    // sees it. A hit is quarantined for human view, never silently dropped.
    const untrusted = [
      c.subject.name,
      ...(c.subject.questionnaire ?? []).map((q) => `${q.field} ${q.answer}`),
      ...(c.subject.documents ?? []).map((d) => d.text ?? ""),
    ].join("\n");
    const inj = scanInjection(untrusted);
    if (inj.flagged) {
      yield emit(
        "fingerprint",
        "C-12 Injection Filter",
        "warn",
        `Quarantined possible instruction-injection in supplied material (${inj.reasons.join(", ")}). Content kept as data only; no instruction was followed.`,
        { quarantined: true, reasons: inj.reasons },
      );
    }
    if (inj.maskedIdentifiers > 0) {
      yield emit(
        "fingerprint",
        "C-12 Injection Filter",
        "info",
        `Masked ${inj.maskedIdentifiers} raw identifier(s) found in free text before anything was stored.`,
      );
    }
    const fp = await buildFingerprint(c.subject);
    c.fingerprint = fp;
    const disputed = fp.attributes.filter((a) => a.agreement === "DISPUTED").length;
    yield emit("fingerprint", "C-08 Resolvers A/B", "info", `Resolvers A and B ran blind on ${fp.attributes.length} attribute(s); ${fp.aliases.length} name variant(s) generated.`);
    yield emit("fingerprint", "C-09 Fingerprint Comparator", disputed ? "warn" : "info", `Draft identity ready. ${disputed} disputed attribute(s) flagged for review.`, { disputed });
    await saveCase(c);

    c.state = "AWAIT_G1";
    yield emit("gate_g1", "Gate G1", "gate", `Identity check ready for review. Approve to begin collection.`, { disputed });
    await saveCase(c);
    return;
  }

  // --- Segment 2: collect → assess → resolve → compile → red-team → G2 -----
  if (SEGMENT2_STATES.has(c.state)) {
    const plan = c.plan ?? (await planCase(c.subject, c.level));
    c.plan = plan;
    const questions = plan.questions;
    const fp = c.fingerprint ?? (await buildFingerprint(c.subject));
    c.fingerprint = fp;
    const allowSynthetic = live;

    // Collect
    c.state = "COLLECTING";
    yield emit("collect", "C-10 Domain Collectors", "info", `Collecting across ${plan.domains.length} domains.`);
    const col = await collect(c.subject, plan, { allowSynthetic });
    c.coverage = col.coverage;
    let events = col.events;
    if (col.synthetic && events.length) {
      yield emit("collect", "C-10 Domain Collectors", "warn", `Drafted ${events.length} clearly-synthetic candidate matter(s) for this prototype run.`, { synthetic: true, count: events.length });
    } else {
      yield emit("collect", "C-10 Domain Collectors", "info", `Coverage map recorded for ${col.coverage.length} source(s).`);
    }
    await saveCase(c);

    // Assess: match → classify → verify claims
    c.state = "ASSESSING";
    const matched = await runMatchers(events, fp);
    events = matched.events;
    yield emit("assess", "C-15/16 Matchers A/B + Comparator", "info", `Matching: ${matched.rejected.length} rejected, ${matched.disputed.length} split to follow-up, ${events.length} retained.`, { rejected: matched.rejected.length, disputed: matched.disputed.length });

    const classified = await classifyEvents(events);
    events = classified.events;
    if (classified.severitySplits.length) {
      yield emit("assess", "C-18 Classifiers A/B", "warn", `Severity disagreement on ${classified.severitySplits.length} item(s); took the more severe level and flagged for final review.`);
    } else {
      yield emit("assess", "C-18 Classifiers A/B", "info", `Classified ${events.length} matter(s).`);
    }

    const claims = c.claims && c.claims.length ? c.claims : extractClaims(c.subject);
    const cv = await verifyClaims(claims, events);
    c.claims = cv.claims;
    const contradicted = cv.claims.filter((cl) => cl.status === "CONTRADICTED").length;
    yield emit("assess", "C-20 Claim Verifier", contradicted ? "finding" : "info", `Verified ${cv.claims.length} claim(s): ${contradicted} contradicted by the record.`);

    // Resolve: Red Team recall
    c.state = "RESOLVING";
    const recall = await redTeamRecall(fp, c.coverage, plan, { allowSynthetic });
    if (recall.extra) {
      events.push(recall.extra);
      yield emit("resolve", "C-23 Red Team (recall)", "warn", recall.note ?? `Recall miss added: ${recall.extra.title}.`);
    } else {
      yield emit("resolve", "C-23 Red Team (recall)", "info", `Independent recheck found no missed matters.`);
    }

    // Score (deterministic engine — never an LLM)
    const scores = scoreCase(questions, events, col.coverageByQuestion);
    const scoreByEvent = new Map<string, Finding["score"]>();
    for (const q of questions) {
      for (const es of scores[q].eventScores) {
        if (!scoreByEvent.has(es.eventId)) scoreByEvent.set(es.eventId, es);
      }
    }
    c.questionScores = scores;
    const verdicts: Partial<Record<Question, Verdict>> = {};
    for (const q of questions) verdicts[q] = scores[q].verdict;
    c.verdicts = verdicts;
    c.findings = eventsToFindings(events, scoreByEvent);
    c.disclosure = computeDisclosure(cv.alignment);
    yield emit("assess", "C-21 Scoring Engine", "info", `Scored ${questions.length} questions. ${c.findings.length} finding(s). Trust band: ${c.disclosure.trustBand}.`, { trustBand: c.disclosure.trustBand });
    await saveCase(c);

    // Compile + Blind Verifier
    c.state = "COMPILING";
    const compiled = await compileReport(c);
    c.report = compiled.report;
    c.referenceCalls = compiled.referenceCalls;
    if (compiled.verdictDisagreements.length) {
      yield emit("compile", "C-25/26 Compiler + Blind Verifier", "warn", `Compiler and blind verifier disagree on ${compiled.verdictDisagreements.length} verdict(s): ${compiled.verdictDisagreements.join(", ")} — flagged for review.`, { disagreements: compiled.verdictDisagreements });
    } else {
      yield emit("compile", "C-25/26 Compiler + Blind Verifier", "info", `Report compiled; blind verifier agrees on all verdicts.`);
    }
    await saveCase(c);

    // Red Team report mode
    c.state = "RED_TEAM";
    const rep = await redTeamReport(c.report, c.findings, { allowSynthetic });
    c.redTeamNotes = {
      recallMisses: recall.note ? [recall.note] : [],
      compileErrors: rep.compileErrors,
    };
    yield emit("red_team", "C-23 Red Team (report)", rep.compileErrors.length ? "warn" : "info", rep.note);
    await saveCase(c);

    c.state = "AWAIT_G2";
    yield emit("gate_g2", "Gate G2", "gate", `Final review ready. ${c.findings.length} finding(s); worst verdict ${worst(c.verdicts)}.`, { findings: c.findings.length });
    await saveCase(c);
    return;
  }

  // --- Nothing to advance (awaiting a gate, published, or stopped) ---------
  yield emit("scope", "C-01 Orchestrator", "info", `Case is in state ${c.state}; awaiting a review decision or already published.`);
  await saveCase(c);
}

function worst(verdicts: Partial<Record<Question, Verdict>>): Verdict {
  const order: Verdict[] = ["STOP", "RED_FLAG", "CONCERNS", "INSUFFICIENT_COVERAGE", "CLEAR"];
  for (const v of order) if (Object.values(verdicts).includes(v)) return v;
  return "CLEAR";
}

// ---------------------------------------------------------------------------
// applyReview — gate decisions (Section 14)
// ---------------------------------------------------------------------------

export interface ReviewBody {
  gate: "G1" | "G2";
  action: "approve" | "request_change";
  crs?: ChangeRequest[];
  reviewer?: string;
  rationale?: string;
}

export async function applyReview(
  caseId: string,
  body: ReviewBody,
): Promise<NemoCase | null> {
  const c = await getCase(caseId);
  if (!c) return null;
  const at = new Date().toISOString();
  const reviewer = body.reviewer ?? "reviewer";
  const decision = body.action === "approve" ? "APPROVED" : "CHANGES_REQUESTED";

  c.reviews.push({ gate: body.gate, reviewer, decision, rationale: body.rationale, at });
  if (body.crs && body.crs.length) c.changeRequests.push(...body.crs);

  if (body.gate === "G1") {
    c.state = body.action === "approve" ? "COLLECTING" : "ANCHORING";
  } else {
    if (body.action === "approve") {
      c.digitalId = await mintDigitalId(c);
      c.state = "MONITORING";
    } else {
      c.state = "REDO";
    }
  }

  const stage: PipelineStage = body.gate === "G1" ? "gate_g1" : "gate_g2";
  c.events.push(
    makeEvent(
      c.events.length + 1,
      caseId,
      stage,
      body.gate === "G1" ? "Gate G1" : "Gate G2",
      "gate",
      `${body.gate} ${decision.toLowerCase().replace("_", " ")} by ${reviewer}.` +
        (body.gate === "G2" && body.action === "approve" ? ` DID-V ${c.digitalId?.digitalId} minted.` : ""),
    ),
  );

  await saveCase(c);
  return c;
}

// ---------------------------------------------------------------------------
// mintDigitalId — DID-V per PRD 16.1 (random public id, no raw identifiers)
// ---------------------------------------------------------------------------

const CROCK = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CHECK = "0123456789ABCDEFGHJKMNPQRSTVWXYZ*~$=U";

function rand4(): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += CROCK[Math.floor(Math.random() * CROCK.length)];
  return s;
}

function checkChar(data: string): string {
  let n = 0;
  for (const ch of data) {
    const v = CROCK.indexOf(ch.toUpperCase());
    if (v >= 0) n = (n * 32 + v) % 1369; // keep bounded, mod 37^2
  }
  return CHECK[n % 37];
}

export function randomPublicId(kind: "PER" | "ORG"): string {
  const g1 = rand4();
  const g2 = rand4();
  return `NEMO-${kind}-${g1}-${g2}-${checkChar(g1 + g2)}`;
}

function nextRefresh(level: CaseLevel, asOf: string): string {
  const d = new Date(asOf);
  const months = level === "L1" ? 12 : level === "L2" ? 3 : 1;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export async function mintDigitalId(c: NemoCase): Promise<DigitalID> {
  const isOrg = /org|company|entity|fund/i.test(c.subject.subjectType);
  const asOf = new Date().toISOString().slice(0, 10);

  const verdicts = {} as Record<Question, Verdict>;
  for (const q of ALL_QUESTIONS) verdicts[q] = c.verdicts[q] ?? "INSUFFICIENT_COVERAGE";

  const scores: DigitalID["scores"] = {};
  for (const q of ALL_QUESTIONS) {
    const s = c.questionScores[q];
    if (s) scores[q] = { point: s.qPoint, low: s.qLow, high: s.qHigh, ef: s.ef };
  }

  const covVals = Object.values(c.questionScores).map((s) => s.coverage);
  const overall = covVals.length ? covVals.reduce((a, b) => a + b, 0) / covVals.length : 0;

  const identifierTypes = new Set<string>();
  for (const a of c.fingerprint?.attributes ?? []) {
    if (a.tier === "U" || a.tier === "R") identifierTypes.add(a.type);
  }
  for (const d of c.subject.declaredIdentifiers ?? []) identifierTypes.add(d.type.toUpperCase());

  return {
    digitalId: randomPublicId(isOrg ? "ORG" : "PER"),
    uuid: randomUUID(),
    variant: "V",
    status: "VERIFIED",
    version: (c.digitalId?.version ?? 0) + 1,
    changedFields: c.digitalId ? ["verdicts", "disclosure"] : undefined,
    subjectType: c.subject.subjectType,
    canonicalName: c.fingerprint?.canonicalName ?? c.subject.name,
    aliases: (c.fingerprint?.aliases ?? []).map((a) => a.value),
    identifierTypesHeld: [...identifierTypes],
    linkedEntities: (c.fingerprint?.linkedEntities ?? []).map((e) => ({
      id: e.id,
      relation: e.relation,
      from: e.from,
      to: e.to,
    })),
    verdicts,
    scores,
    disclosure: {
      tm: c.disclosure?.trust ?? 1,
      dd: c.disclosure?.disclosureDegree ?? 1,
      c: c.disclosure?.consistency ?? 1,
      v: c.disclosure?.verification ?? 1,
      delta: c.disclosure?.dissimilarity ?? 0,
    },
    coverage: { overall },
    caseLevel: c.level,
    asOf,
    nextRefresh: nextRefresh(c.level, asOf),
    reviewedBy: c.reviews.map((r) => r.reviewer),
  };
}
