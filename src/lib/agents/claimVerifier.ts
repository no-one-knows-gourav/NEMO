/**
 * C-20 Claim Verifier.
 *
 * Extracts declared claims from the intake (questionnaire/documents) and then,
 * against the discovered events, marks each VERIFIED / CONTRADICTED / UNVERIFIED
 * and builds the declared-vs-discovered AlignmentField[] consumed by the
 * deterministic disclosure calculator (C-32, computeDisclosure). This module
 * never computes a metric. LIVE uses the model to judge support/contradiction;
 * REPLAY / any failure uses a deterministic heuristic.
 */
import { z } from "zod";
import { callAgentJson } from "./client";
import { CLAIM_VERIFIER_SYSTEM } from "./prompts";
import { DEFAULT_CONFIG } from "@/lib/scoring/config";
import type {
  AlignmentField,
  AlignmentOutcome,
  Claim,
  ClaimStatus,
  EventInput,
  SubjectIntake,
} from "@/lib/types";

const MAT = DEFAULT_CONFIG.disclosure.claimMateriality;

/** C-06-lite: draft atomic claims from the questionnaire + declared docs. */
export function extractClaims(subject: SubjectIntake): Claim[] {
  const claims: Claim[] = [];
  let n = 0;
  for (const q of subject.questionnaire ?? []) {
    n += 1;
    const field = q.field.toLowerCase();
    const materiality: Claim["materiality"] = /venture|exit|revenue|arr|fund|litig|pep/.test(field)
      ? "high"
      : "medium";
    claims.push({
      id: `CL-${String(n).padStart(2, "0")}`,
      type: classifyClaimType(field),
      value: q.answer.slice(0, 160),
      materiality,
      origin: "questionnaire",
      status: "UNVERIFIED",
      evidenceIds: [],
    });
  }
  // Always assert the canonical name as a low-materiality identity claim.
  claims.unshift({
    id: "CL-00",
    type: "identity_name",
    value: subject.name,
    materiality: "low",
    origin: "questionnaire",
    status: "UNVERIFIED",
    evidenceIds: [],
  });
  return claims;
}

function classifyClaimType(field: string): string {
  if (/venture|exit|company|director/.test(field)) return "venture_outcome";
  if (/educat|degree|iit|university/.test(field)) return "education";
  if (/revenue|arr|metric|valuation/.test(field)) return "metric";
  if (/litig|case|court/.test(field)) return "litigation_declaration";
  if (/pep/.test(field)) return "pep_declaration";
  return "declaration";
}

export interface ClaimVerifyResult {
  claims: Claim[];
  alignment: AlignmentField[];
}

const VerifyOut = z.object({
  claims: z
    .array(
      z.object({
        id: z.string(),
        status: z.string(),
        evidenceIds: z.array(z.string()).optional(),
        discovered: z.string().optional(),
      }),
    )
    .optional(),
});
type VerifyOutT = z.infer<typeof VerifyOut>;

function statusCoerce(v: string): ClaimStatus {
  const up = v.toUpperCase();
  return up === "VERIFIED" || up === "CONTRADICTED" ? (up as ClaimStatus) : "UNVERIFIED";
}

function weightFor(materiality: Claim["materiality"]): number {
  return materiality === "high" ? MAT.high : materiality === "medium" ? MAT.medium : MAT.low;
}

function outcomeFor(status: ClaimStatus, hasDiscovered: boolean): AlignmentOutcome {
  if (status === "VERIFIED") return "AGREE";
  if (status === "CONTRADICTED") return "CONFLICT";
  // UNVERIFIED: declared but nothing discovered to support it.
  return hasDiscovered ? "MINOR_VARIANCE" : "DECLARED_NOT_FOUND";
}

function toAlignment(claims: Claim[], discoveredById: Map<string, string>): AlignmentField[] {
  const fields: AlignmentField[] = [];
  for (const c of claims) {
    const discovered = discoveredById.get(c.id);
    const outcome = outcomeFor(c.status, Boolean(discovered));
    fields.push({
      field: c.value.slice(0, 60),
      group: groupFor(c.type),
      declared: c.value,
      discovered,
      outcome,
      weight: weightFor(c.materiality),
      coverage: outcome === "DECLARED_NOT_FOUND" ? 0.8 : undefined,
      declaredFlag: true,
      supportedFlag: c.status === "VERIFIED",
      evidenceIds: c.evidenceIds.length ? c.evidenceIds : undefined,
    });
  }
  return fields;
}

function groupFor(type: string): string {
  if (type.startsWith("identity")) return "Identity";
  if (type === "education") return "Education";
  if (type === "venture_outcome") return "Ventures";
  if (type === "metric") return "Metrics";
  if (type.includes("litigation")) return "Litigation";
  return "Declarations";
}

/** Deterministic heuristic verifier (replay / fallback). */
function heuristicVerify(claims: Claim[], events: EventInput[]): ClaimVerifyResult {
  const discoveredById = new Map<string, string>();
  const out = claims.map((c) => {
    // A claim that names a company contradicted by a governance event, etc.
    const hit = events.find((e) =>
      e.title.toLowerCase().includes(firstWord(c.value)) && firstWord(c.value).length > 3,
    );
    if (hit && (hit.status === "CONFIRMED" || hit.severity <= "S3")) {
      discoveredById.set(c.id, hit.title);
      return {
        ...c,
        status: "CONTRADICTED" as ClaimStatus,
        evidenceIds: hit.evidence.map((e) => e.id),
      };
    }
    // Name claim with no adverse event → VERIFIED by absence.
    if (c.type === "identity_name") {
      return { ...c, status: "VERIFIED" as ClaimStatus };
    }
    return c; // stays UNVERIFIED
  });
  return { claims: out, alignment: toAlignment(out, discoveredById) };
}

function firstWord(s: string): string {
  return s.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

/** Verifies claims against discovered events; builds the field alignment. */
export async function verifyClaims(
  claims: Claim[],
  events: EventInput[],
): Promise<ClaimVerifyResult> {
  if (claims.length === 0) return { claims, alignment: [] };
  try {
    const out = await callAgentJson<VerifyOutT>({
      system: CLAIM_VERIFIER_SYSTEM,
      tier: "large",
      family: "C",
      maxTokens: 1000,
      prompt:
        `Declared claims:\n` +
        claims.map((c) => `- ${c.id} [${c.type}, ${c.materiality}]: ${c.value}`).join("\n") +
        `\n\nDiscovered matters:\n` +
        (events.length
          ? events
              .map((e) => `- ${e.id} [${e.severity} ${e.category}]: ${e.title}`)
              .join("\n")
          : "(none found)") +
        `\n\nFor each claim return JSON {"claims":[{"id","status":` +
        `"VERIFIED|CONTRADICTED|UNVERIFIED","evidenceIds":[event ids],` +
        `"discovered":"what the record shows, if anything"}]}.`,
    });
    const parsed = VerifyOut.safeParse(out);
    if (parsed.success && parsed.data.claims) {
      const byId = new Map(parsed.data.claims.map((j) => [j.id, j]));
      const discoveredById = new Map<string, string>();
      const updated = claims.map((c) => {
        const j = byId.get(c.id);
        if (!j) return c;
        const status = statusCoerce(j.status);
        if (j.discovered) discoveredById.set(c.id, j.discovered.slice(0, 120));
        return { ...c, status, evidenceIds: j.evidenceIds ?? c.evidenceIds };
      });
      return { claims: updated, alignment: toAlignment(updated, discoveredById) };
    }
  } catch {
    // fall through to heuristic
  }
  return heuristicVerify(claims, events);
}
