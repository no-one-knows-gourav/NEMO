/**
 * NEMO disclosure, dissimilarity and trust (PRD Section 9, component C-32).
 * Deterministic code; compares the declared identity (DID-D) against the
 * discovered identity (DID-S) field by field and derives the metrics.
 */
import type { AlignmentField, DisclosureMetrics } from "@/lib/types";
import { DEFAULT_CONFIG, type ScoringConfig } from "./config";

/** Dissimilarity d per outcome (PRD 9.2). */
export function dissimilarityFor(field: AlignmentField): number {
  switch (field.outcome) {
    case "AGREE":
      return 0.0;
    case "MINOR_VARIANCE":
      return 0.2;
    case "DECLARED_NOT_FOUND":
      return 0.5 * (field.coverage ?? 1);
    case "FOUND_NOT_DECLARED":
    case "CONFLICT":
      return 1.0;
  }
}

/** Agreement a per outcome, for fields present in both (PRD 9.3). */
function agreementFor(outcome: AlignmentField["outcome"]): number | null {
  switch (outcome) {
    case "AGREE":
      return 1.0;
    case "MINOR_VARIANCE":
      return 0.8;
    case "CONFLICT":
      return 0.0;
    // DECLARED_NOT_FOUND / FOUND_NOT_DECLARED are not "present in both".
    default:
      return null;
  }
}

function trustBand(tm: number): DisclosureMetrics["trustBand"] {
  if (tm >= 0.8) return "High";
  if (tm >= 0.6) return "Moderate";
  return "Low";
}

export function computeDisclosure(
  fields: AlignmentField[],
  cfg: ScoringConfig = DEFAULT_CONFIG,
): DisclosureMetrics {
  const { alpha, beta, gamma } = cfg.disclosure;

  // δ: all aligned fields.
  let dissNum = 0;
  let dissDen = 0;
  for (const f of fields) {
    dissNum += f.weight * dissimilarityFor(f);
    dissDen += f.weight;
  }
  const dissimilarity = dissDen === 0 ? 0 : dissNum / dissDen;

  // C: fields present in both.
  let cNum = 0;
  let cDen = 0;
  for (const f of fields) {
    const a = agreementFor(f.outcome);
    if (a === null) continue;
    cNum += f.weight * a;
    cDen += f.weight;
  }
  const consistency = cDen === 0 ? 1 : cNum / cDen;

  // DD: material discovered items the subject was asked to declare.
  let ddNum = 0;
  let ddDen = 0;
  for (const f of fields) {
    // discovered material items: those that exist in the world (DISCOVERED
    // present) — AGREE, MINOR_VARIANCE, FOUND_NOT_DECLARED, CONFLICT.
    const discovered =
      f.outcome !== "DECLARED_NOT_FOUND" && f.discovered !== undefined;
    if (!discovered) continue;
    ddNum += f.weight * (f.declaredFlag ? 1 : 0);
    ddDen += f.weight;
  }
  const disclosureDegree = ddDen === 0 ? 1 : ddNum / ddDen;

  // V: declared claims that discovered evidence supports.
  let vNum = 0;
  let vDen = 0;
  for (const f of fields) {
    if (!f.declaredFlag) continue;
    vNum += f.weight * (f.supportedFlag ? 1 : 0);
    vDen += f.weight;
  }
  const verification = vDen === 0 ? 1 : vNum / vDen;

  const trust =
    Math.pow(consistency, alpha) *
    Math.pow(disclosureDegree, beta) *
    Math.pow(verification, gamma);

  return {
    dissimilarity,
    consistency,
    disclosureDegree,
    verification,
    trust,
    trustBand: trustBand(trust),
    fields,
  };
}

/** Rerun importance score (PRD 9.4). */
export function rerunScore(
  changed: { weight: number; dOld: number; dNew: number }[],
): number {
  return changed.reduce(
    (acc, c) => acc + c.weight * Math.abs(c.dNew - c.dOld),
    0,
  );
}
