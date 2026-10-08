/**
 * Validates the scoring engine against the PRD Section 8.8 worked example.
 * Run with: `npx tsx src/lib/scoring/engine.test.ts` (no test runner needed).
 */
import type { EventInput } from "@/lib/types";
import { scoreEvent, recency, strengthOfEvidence } from "./engine";

let passed = 0;
let failed = 0;

function approx(label: string, got: number, want: number, tol = 0.01) {
  const ok = Math.abs(got - want) <= tol;
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}: ${got.toFixed(3)} ≈ ${want}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}: got ${got.toFixed(4)}, want ${want}`);
  }
}

console.log("PRD 8.8 Event A — fraud conviction, 6y old, matched by DIN+father");
{
  const ev = {
    id: "evA",
    tier: "T1" as const,
    platform: "official_portal" as const,
    tamper: "official_portal_direct" as const,
    independent: true,
    entailment: 0.98,
    source: "Court portal",
  };
  const r = recency("S1", "criminal", 6);
  approx("recency r (floored to S1=0.80)", r, 0.8);
  const soe = strengthOfEvidence(ev, "S1", "criminal", 6);
  approx("SoE", soe, 0.745);

  const event: EventInput = {
    id: "evA",
    title: "Fraud conviction",
    category: "criminal",
    severity: "S1",
    role: "ACCUSED",
    ageYears: 6,
    m: 0.97,
    questions: ["crimes_compliance"],
    status: "CONFIRMED",
    legalStatus: "CONVICTED",
    evidence: [ev],
  };
  const sc = scoreEvent(event);
  approx("RC", sc.rc, 0.722);
}

console.log("PRD 8.8 Event B — pending labour case, respondent director, 1y");
{
  const ev = {
    id: "evB",
    tier: "T2" as const,
    platform: "official_portal" as const,
    tamper: "official_portal_direct" as const,
    independent: true,
    entailment: 0.95,
    source: "eCourts",
  };
  const soe = strengthOfEvidence(ev, "S4", "commercial_dispute", 1);
  approx("SoE", soe, 0.446);

  const event: EventInput = {
    id: "evB",
    title: "Pending labour case",
    category: "commercial_dispute",
    severity: "S4",
    role: "RESPONDENT_DIRECTOR",
    ageYears: 1,
    m: 0.85,
    questions: ["integrity"],
    status: "ALLEGATION",
    legalStatus: "PENDING",
    evidence: [ev],
  };
  const sc = scoreEvent(event);
  approx("RC", sc.rc, 0.066);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
