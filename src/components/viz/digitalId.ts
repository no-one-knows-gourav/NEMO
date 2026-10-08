/**
 * Derive a display-only Digital ID (DID-V shape, PRD 16.1) from a NemoCase when
 * the case has not minted one yet, so the Identity-record showpiece renders for
 * the seed. The public ID is generated deterministically from the case id (it
 * is NOT derived from any identifier — OUT-010 only forbids identifier-derived
 * ids; a case-id seed keeps the demo record stable across index and viewer).
 */
import type { DigitalID, NemoCase, Question, Verdict } from "@/lib/types";
import { ALL_QUESTIONS } from "@/lib/types";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function b32(n: number, len: number): string {
  let out = "";
  let x = n;
  for (let i = 0; i < len; i++) {
    out = CROCKFORD[x % 32] + out;
    x = Math.floor(x / 32);
  }
  return out;
}

export function publicIdFor(c: NemoCase): string {
  const kind = /ORG|COMPANY|ENTITY/i.test(c.subject.subjectType) ? "ORG" : "PER";
  const h1 = hashStr(c.id);
  const h2 = hashStr(c.id + "#plate");
  const check = CROCKFORD[((h1 ^ h2) >>> 0) % 32];
  return `NEMO-${kind}-${b32(h1, 4)}-${b32(h2, 4)}-${check}`;
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** A case whose digitalId is set, else a derived display record. */
export function resolveDigitalId(c: NemoCase): DigitalID {
  if (c.digitalId) return c.digitalId;

  const verdicts = {} as Record<Question, Verdict>;
  for (const q of ALL_QUESTIONS) verdicts[q] = c.verdicts[q] ?? "INSUFFICIENT_COVERAGE";

  const scores: DigitalID["scores"] = {};
  const covs: number[] = [];
  for (const q of ALL_QUESTIONS) {
    const qs = c.questionScores[q];
    if (qs) {
      scores[q] = { point: qs.qPoint, low: qs.qLow, high: qs.qHigh, ef: qs.ef };
      covs.push(qs.coverage);
    }
  }
  const overall = covs.length ? covs.reduce((a, b) => a + b, 0) / covs.length : 0;

  const changed: string[] = [];
  for (const q of ALL_QUESTIONS) {
    if (verdicts[q] === "RED_FLAG") changed.push(`verdicts.${q}`);
  }
  if (c.disclosure && c.disclosure.trustBand === "Low") changed.push("disclosure.dd");

  const d = c.disclosure;
  const asOf = c.updatedAt.slice(0, 10);

  return {
    digitalId: publicIdFor(c),
    uuid: `demo-${c.id}`,
    variant: "V",
    status: "VERIFIED",
    version: c.fingerprint?.version ?? 1,
    changedFields: changed,
    subjectType: c.subject.subjectType,
    canonicalName: c.fingerprint?.canonicalName ?? c.subject.name,
    aliases: (c.fingerprint?.aliases ?? []).map((a) => a.value),
    identifierTypesHeld: (c.fingerprint?.attributes ?? [])
      .filter((a) => a.tier === "U" || a.tier === "R")
      .map((a) => a.type),
    linkedEntities: (c.fingerprint?.linkedEntities ?? []).map((e) => ({
      id: e.id,
      relation: e.relation,
      from: e.from,
      to: e.to,
    })),
    verdicts,
    scores,
    disclosure: d
      ? {
          tm: d.trust,
          dd: d.disclosureDegree,
          c: d.consistency,
          v: d.verification,
          delta: d.dissimilarity,
        }
      : { tm: 0, dd: 0, c: 0, v: 0, delta: 0 },
    coverage: { overall },
    caseLevel: c.level,
    asOf,
    nextRefresh: addMonths(asOf, 3),
    refs: { case: c.id },
    reviewedBy: c.reviews.map((r) => r.reviewer),
    signature: { alg: "Ed25519", kid: "nemo-sign-2026-10", sig: "(demo signature)" },
  };
}

/** Fixed 44-char machine-readable line (no personal identifiers, §9.2.2). */
export function machineLine(did: DigitalID): string {
  const kind = did.subjectType && /ORG/i.test(did.subjectType) ? "ORG" : "PER";
  const idCore = did.digitalId.replace(/^NEMO-(PER|ORG)-/, "").replace(/-/g, "");
  const ver = `V${String(did.version).padStart(2, "0")}`;
  const date = did.asOf.replace(/-/g, "");
  const raw = `NMO<${kind}<${idCore}<${ver}<${date}<${did.caseLevel}`;
  return (raw + "<".repeat(44)).slice(0, 44);
}
