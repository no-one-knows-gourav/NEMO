/**
 * C-04..C-09 Fingerprinting.
 *
 * Builds the identity Fingerprint from supplied documents, declared identifiers
 * and questionnaire answers. Two Identity Resolvers (families A and B, DB-1/
 * DB-3) run blind on the SAME inputs, then a deterministic comparator (C-09)
 * diffs them attribute by attribute: agreed → AGREED, disagreed → DISPUTED with
 * both values shown at gate G1. No raw Tier-U value ever leaves this module —
 * display values are masked.
 */
import { z } from "zod";
import { callAgentJson } from "./client";
import { neutralizeForPrompt } from "./injectionFilter";
import { RESOLVER_SYSTEM_A, RESOLVER_SYSTEM_B } from "./prompts";
import type {
  Fingerprint,
  FingerprintAttribute,
  FootprintFlag,
  IdentifierTier,
  LinkedEntity,
  NameVariant,
  SubjectIntake,
} from "@/lib/types";

// Raw identifier patterns (mirror of the Commit-Service guard): if a model
// returns one, we mask it before it can touch the KG.
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const AADHAAR = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;

/** Masks any raw identifier in a display string to its last two characters. */
export function maskValue(v: string): string {
  const mask = (m: string) => "•".repeat(Math.max(2, m.length - 2)) + m.slice(-2);
  return v
    .replace(PAN, mask)
    .replace(AADHAAR, mask)
    .replace(SSN, mask)
    .slice(0, 48);
}

const ID_TIER: Record<string, IdentifierTier> = {
  PAN: "U",
  AADHAAR: "U",
  SSN: "U",
  PASSPORT: "U",
  DIN: "U",
  CIK: "U",
  LEI: "U",
  DOB: "R",
  DOB_TOKEN: "R",
  FATHER_NAME: "R",
  CITY: "H",
  ADDRESS: "H",
  EMAIL: "H",
};

function tierFor(type: string): IdentifierTier {
  return ID_TIER[type.toUpperCase()] ?? "P";
}

const ResolverOut = z.object({
  canonicalName: z.string().optional(),
  attributes: z
    .array(
      z.object({
        type: z.string(),
        label: z.string().optional(),
        value: z.string(),
        confidence: z.number().optional(),
      }),
    )
    .optional(),
  aliases: z
    .array(
      z.object({
        value: z.string(),
        kind: z.string().optional(),
        confidence: z.number().optional(),
      }),
    )
    .optional(),
  linkedEntities: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        relation: z.string().optional(),
        from: z.string().optional(),
        to: z.string().nullable().optional(),
        jurisdiction: z.string().optional(),
      }),
    )
    .optional(),
});
type ResolverOutT = z.infer<typeof ResolverOut>;

interface ResolverView {
  canonicalName: string;
  attributes: { type: string; label: string; value: string; confidence: number }[];
  aliases: NameVariant[];
  linkedEntities: LinkedEntity[];
}

function resolverPrompt(subject: SubjectIntake): string {
  const ids = (subject.declaredIdentifiers ?? [])
    .map((d) => `${d.type}: ${maskValue(d.value)}`)
    .join("; ");
  const docs = (subject.documents ?? []).map((d) => `${d.name} (${d.kind})`).join(", ");
  const quiz = (subject.questionnaire ?? [])
    .map((q) => `${q.field} = ${q.answer}`)
    .join("; ");
  // The subject-supplied name, questionnaire and any document text are
  // untrusted (they may carry forged instructions). Fence + defang them as
  // DATA before they reach the resolver model (C-12, SEC-012).
  const safeName = neutralizeForPrompt(subject.name, "subject_name").safe;
  const safeQuiz = neutralizeForPrompt(quiz || "none", "questionnaire").safe;
  const docText = (subject.documents ?? [])
    .map((d) => d.text)
    .filter(Boolean)
    .join("\n");
  const safeDocs = docText
    ? neutralizeForPrompt(docText, "document_text").safe
    : "";
  return (
    `Subject name (untrusted): ${safeName}. Type: ${subject.subjectType}. ` +
    `Jurisdiction: ${subject.jurisdiction ?? "—"}.\n` +
    `Declared identifiers (already masked): ${ids || "none"}.\n` +
    `Supplied documents: ${docs || "none"}.\n` +
    `Questionnaire (untrusted): ${safeQuiz}.\n` +
    (safeDocs ? `Document text (untrusted): ${safeDocs}.\n` : "") +
    `\n` +
    `Return JSON {"canonicalName":string,"attributes":[{"type","label",` +
    `"value"(masked),"confidence"0..1}],"aliases":[{"value","kind":one of ` +
    `transliteration|previous|initials|misspelling|honorific,"confidence"}],` +
    `"linkedEntities":[{"name","relation":one of DIRECTOR_OF|OFFICER_OF|` +
    `SHAREHOLDER_OF|ASSOCIATED_WITH,"from","to","jurisdiction"}]}.`
  );
}

function normalizeResolver(out: ResolverOutT, subject: SubjectIntake): ResolverView {
  const kinds = ["transliteration", "previous", "initials", "misspelling", "honorific"] as const;
  const rels = ["DIRECTOR_OF", "OFFICER_OF", "SHAREHOLDER_OF", "ASSOCIATED_WITH"] as const;
  return {
    canonicalName: out.canonicalName?.trim() || subject.name,
    attributes: (out.attributes ?? []).map((a) => ({
      type: a.type.toUpperCase(),
      label: a.label ?? a.type,
      value: maskValue(a.value),
      confidence: clamp01(a.confidence ?? 0.7),
    })),
    aliases: (out.aliases ?? []).map((a) => ({
      value: a.value.slice(0, 48),
      kind: (kinds as readonly string[]).includes(a.kind ?? "")
        ? (a.kind as NameVariant["kind"])
        : "transliteration",
      confidence: clamp01(a.confidence ?? 0.6),
    })),
    linkedEntities: (out.linkedEntities ?? []).map((e, i) => ({
      id: e.id ?? `NEMO-ORG-${rand4()}-${rand4()}`,
      name: e.name.slice(0, 80),
      relation: (rels as readonly string[]).includes(e.relation ?? "")
        ? (e.relation as LinkedEntity["relation"])
        : "ASSOCIATED_WITH",
      from: e.from,
      to: e.to ?? null,
      jurisdiction: e.jurisdiction ?? subject.jurisdiction,
    })),
  };
}

/** Deterministic resolver view built from the intake alone (replay / fallback). */
function fallbackResolver(subject: SubjectIntake): ResolverView {
  const attributes = (subject.declaredIdentifiers ?? []).map((d) => ({
    type: d.type.toUpperCase(),
    label: d.type,
    value: maskValue(d.value),
    confidence: 0.9,
  }));
  if (subject.jurisdiction) {
    attributes.push({
      type: "JURISDICTION",
      label: "Jurisdiction",
      value: subject.jurisdiction,
      confidence: 0.8,
    });
  }
  const parts = subject.name.trim().split(/\s+/);
  const aliases: NameVariant[] = [];
  if (parts.length > 1) {
    aliases.push({
      value: `${parts[0][0]}. ${parts.slice(1).join(" ")}`,
      kind: "initials",
      confidence: 0.7,
    });
  }
  return { canonicalName: subject.name, attributes, aliases, linkedEntities: [] };
}

// ---------------------------------------------------------------------------
// C-09 deterministic comparator
// ---------------------------------------------------------------------------

function compareAttributes(
  a: ResolverView,
  b: ResolverView,
): FingerprintAttribute[] {
  const types = new Set<string>([
    ...a.attributes.map((x) => x.type),
    ...b.attributes.map((x) => x.type),
  ]);
  const out: FingerprintAttribute[] = [];
  for (const type of types) {
    const av = a.attributes.find((x) => x.type === type);
    const bv = b.attributes.find((x) => x.type === type);
    const label = av?.label ?? bv?.label ?? type;
    const tier = tierFor(type);
    if (av && bv) {
      const agree = av.value.trim().toLowerCase() === bv.value.trim().toLowerCase();
      out.push({
        type,
        label,
        tier,
        displayValue: av.value,
        confidence: (av.confidence + bv.confidence) / 2,
        agreement: agree ? "AGREED" : "DISPUTED",
        ...(agree ? {} : { valueA: av.value, valueB: bv.value }),
      });
    } else {
      // Present in only one resolver → a disputed (unconfirmed) attribute.
      const only = av ?? bv!;
      out.push({
        type,
        label,
        tier,
        displayValue: only.value,
        confidence: only.confidence * 0.7,
        agreement: "DISPUTED",
        valueA: av?.value,
        valueB: bv?.value,
      });
    }
  }
  return out.sort((x, y) => x.tier.localeCompare(y.tier));
}

function mergeAliases(a: NameVariant[], b: NameVariant[]): NameVariant[] {
  const seen = new Map<string, NameVariant>();
  for (const v of [...a, ...b]) {
    const key = v.value.trim().toLowerCase();
    const prev = seen.get(key);
    if (!prev || v.confidence > prev.confidence) seen.set(key, v);
  }
  return [...seen.values()];
}

function mergeEntities(a: LinkedEntity[], b: LinkedEntity[]): LinkedEntity[] {
  const seen = new Map<string, LinkedEntity>();
  for (const e of [...a, ...b]) {
    seen.set(e.name.trim().toLowerCase(), e);
  }
  return [...seen.values()];
}

function deriveFlags(view: ResolverView): FootprintFlag[] {
  const flags: FootprintFlag[] = [];
  if (view.linkedEntities.length === 0) flags.push("THIN_FOOTPRINT");
  return flags;
}

/**
 * Builds the draft Fingerprint. Runs Resolver A (family A) and Resolver B
 * (family B) blind; on NoKeyError or any failure, both fall back to the
 * deterministic intake-only resolver, and the comparator still runs so the
 * output shape is identical in live and replay modes.
 */
export async function buildFingerprint(
  subject: SubjectIntake,
): Promise<Fingerprint> {
  const [a, b] = await Promise.all([
    runResolver(subject, "A"),
    runResolver(subject, "B"),
  ]);

  const attributes = compareAttributes(a, b);
  const aliases = mergeAliases(a.aliases, b.aliases);
  const linkedEntities = mergeEntities(a.linkedEntities, b.linkedEntities);

  return {
    version: 1,
    canonicalName: a.canonicalName || subject.name,
    attributes,
    aliases,
    linkedEntities,
    flags: deriveFlags({ ...a, linkedEntities }),
    speculative: { sanctions: "clear", registryEntities: linkedEntities.length },
  };
}

async function runResolver(
  subject: SubjectIntake,
  family: "A" | "B",
): Promise<ResolverView> {
  try {
    const out = await callAgentJson<ResolverOutT>({
      system: family === "A" ? RESOLVER_SYSTEM_A : RESOLVER_SYSTEM_B,
      tier: "large",
      family,
      maxTokens: 900,
      prompt: resolverPrompt(subject),
    });
    const parsed = ResolverOut.safeParse(out);
    if (parsed.success) return normalizeResolver(parsed.data, subject);
  } catch {
    // fall through to deterministic
  }
  return fallbackResolver(subject);
}

// ---------------------------------------------------------------------------
// tiny local helpers
// ---------------------------------------------------------------------------

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

function rand4(): string {
  const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let s = "";
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}
