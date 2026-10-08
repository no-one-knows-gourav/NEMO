/**
 * Case + knowledge-graph store for the NEMO prototype.
 *
 * The PRD mandates a graph DB behind a Commit Service (C-36). For a single-node
 * prototype we persist cases to a JSON file under `.data/` and expose a
 * Commit-Service-shaped API: all writes go through `commit*` helpers so we keep
 * one writer and can enforce invariants (no raw Tier-U values, provenance,
 * access labels). Swappable for Neo4j/Postgres later without touching callers.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  CaseState,
  CaseSummary,
  NemoCase,
  PipelineEvent,
  Question,
  Verdict,
} from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const CASES_FILE = path.join(DATA_DIR, "cases.json");

/**
 * The JSON file is the source of truth. We deliberately do NOT hold a
 * long-lived in-memory cache: in Next dev each route can get its own module
 * instance, so a cached Map in one instance would go stale when another
 * instance writes (e.g. an API route creates a case the records page can't
 * see). Reading fresh each call keeps every route consistent. cases.json is
 * tiny, so the cost is negligible for the prototype.
 */
async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function load(): Promise<Map<string, NemoCase>> {
  await ensureDir();
  try {
    const raw = await fs.readFile(CASES_FILE, "utf8");
    const arr = JSON.parse(raw) as NemoCase[];
    return new Map(arr.map((c) => [c.id, c]));
  } catch {
    return new Map();
  }
}

async function persistMap(map: Map<string, NemoCase>) {
  await ensureDir();
  const arr = [...map.values()];
  await fs.writeFile(CASES_FILE, JSON.stringify(arr, null, 2), "utf8");
}

// Patterns for raw Tier-U identifiers that must never enter the KG (KG-002).
const RAW_ID_PATTERNS: RegExp[] = [
  /\b[A-Z]{5}\d{4}[A-Z]\b/, // PAN
  /\b\d{4}\s?\d{4}\s?\d{4}\b/, // Aadhaar (full, 12 digits)
  /\b\d{3}-\d{2}-\d{4}\b/, // US SSN
];

/** Commit Service guard: rejects raw Tier-U identifiers in free text. */
export function assertNoRawIdentifiers(text: string): void {
  for (const re of RAW_ID_PATTERNS) {
    if (re.test(text)) {
      throw new Error(
        "Commit rejected: raw Tier-U identifier detected (KG-002 / PRV-010).",
      );
    }
  }
}

// Global variants for masking (the above are used only for detection).
const RAW_ID_PATTERNS_G: RegExp[] = [
  /\b[A-Z]{5}\d{4}[A-Z]\b/g, // PAN
  /\b\d{4}\s?\d{4}\s?\d{4}\b/g, // Aadhaar (full, 12 digits)
  /\b\d{3}-\d{2}-\d{4}\b/g, // US SSN
];

/** Masks any raw Tier-U identifier in a string to its last two characters. */
export function maskRawIdentifiers(text: string): string {
  const mask = (m: string) => "•".repeat(Math.max(2, m.length - 2)) + m.slice(-2);
  let out = text;
  for (const re of RAW_ID_PATTERNS_G) out = out.replace(re, mask);
  return out;
}

/**
 * Enforces the privacy invariant at the single write choke point: no raw
 * Tier-U identifier is ever persisted in subject free text (name, purpose,
 * deal context, questionnaire answers, document text) or in declared-identifier
 * values. Raw values belong only in the Identity Vault (PRV-010); this store is
 * KG-equivalent, so we mask on the way in. Mutates and returns the case.
 */
function sanitizeCaseForStore(c: NemoCase): NemoCase {
  const s = c.subject;
  s.name = maskRawIdentifiers(s.name ?? "");
  s.purpose = maskRawIdentifiers(s.purpose ?? "");
  if (s.dealContext) s.dealContext = maskRawIdentifiers(s.dealContext);
  if (s.declaredIdentifiers) {
    s.declaredIdentifiers = s.declaredIdentifiers.map((d) => ({
      type: d.type,
      value: maskRawIdentifiers(d.value ?? ""),
    }));
  }
  if (s.questionnaire) {
    s.questionnaire = s.questionnaire.map((q) => ({
      field: maskRawIdentifiers(q.field ?? ""),
      answer: maskRawIdentifiers(q.answer ?? ""),
    }));
  }
  if (s.documents) {
    s.documents = s.documents.map((d) => ({
      ...d,
      name: maskRawIdentifiers(d.name ?? ""),
      text: d.text ? maskRawIdentifiers(d.text) : d.text,
    }));
  }
  return c;
}

export async function listCases(): Promise<CaseSummary[]> {
  const m = await load();
  return [...m.values()]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .map(toSummary);
}

function worstVerdict(verdicts: Partial<Record<Question, Verdict>>): Verdict | null {
  const order: Verdict[] = [
    "STOP",
    "RED_FLAG",
    "CONCERNS",
    "INSUFFICIENT_COVERAGE",
    "CLEAR",
  ];
  for (const v of order) {
    if (Object.values(verdicts).includes(v)) return v;
  }
  return null;
}

export function toSummary(c: NemoCase): CaseSummary {
  const needsReview =
    c.state === "AWAIT_G1" || c.state === "AWAIT_G2" || c.state === "STOPPED";
  const unresolvedCount = c.findings.filter(
    (f) => f.status === "ALLEGATION",
  ).length;
  return {
    id: c.id,
    name: c.subject.name,
    subjectType: c.subject.subjectType,
    level: c.level,
    state: c.state,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    topVerdict: worstVerdict(c.verdicts),
    needsReview,
    unresolvedCount,
  };
}

export async function getCase(id: string): Promise<NemoCase | null> {
  const m = await load();
  return m.get(id) ?? null;
}

export async function saveCase(c: NemoCase): Promise<void> {
  const m = await load();
  sanitizeCaseForStore(c);
  c.updatedAt = new Date().toISOString();
  m.set(c.id, c);
  await persistMap(m);
}

export async function upsertCase(c: NemoCase): Promise<NemoCase> {
  await saveCase(c);
  return c;
}

export async function deleteCase(id: string): Promise<void> {
  const m = await load();
  m.delete(id);
  await persistMap(m);
}

export async function setState(id: string, state: CaseState): Promise<void> {
  const c = await getCase(id);
  if (!c) return;
  c.state = state;
  await saveCase(c);
}

/** Appends a pipeline event (ids only; never raw identifiers). */
export async function appendEvent(
  id: string,
  ev: PipelineEvent,
): Promise<void> {
  assertNoRawIdentifiers(ev.message);
  const c = await getCase(id);
  if (!c) return;
  c.events.push(ev);
  await saveCase(c);
}

/** No-op: the store reads fresh from disk each call, so there is no cache to
 * invalidate. Kept for API compatibility with earlier callers. */
export function invalidateCache(): void {
  /* intentionally empty */
}

export function newCaseId(): string {
  return "case_" + Math.random().toString(36).slice(2, 10);
}
