/**
 * C-13..C-16 Matching.
 *
 * For candidate events whose initial match probability m falls in the ambiguous
 * band (per matchDisposition + the per-severity accept thresholds in config),
 * Matcher A and Matcher B (families A/B, DB-1/DB-3) each independently output an
 * m and a one-line rationale. A deterministic comparator (C-16) then decides:
 *   - both ACCEPT  → accept, m = mean(mA, mB)
 *   - both REJECT  → reject (dropped)
 *   - split by > splitGap or different bands → flagged for Resolve, m = mean
 * Events outside the ambiguous band pass through unchanged (hard accept/reject).
 */
import { z } from "zod";
import { callAgentJson } from "./client";
import { MATCHER_SYSTEM_A, MATCHER_SYSTEM_B } from "./prompts";
import { DEFAULT_CONFIG, matchDisposition } from "@/lib/scoring/engine";
import type { EventInput, Fingerprint, Role } from "@/lib/types";

export interface MatchResult {
  /** Events that survived matching (accepted or sent to Resolve). */
  events: EventInput[];
  /** Ids of events the comparator rejected outright. */
  rejected: string[];
  /** Ids of events the judges split on (routed to Resolve). */
  disputed: string[];
}

const ROLES: Role[] = [
  "ACCUSED",
  "RESPONDENT_DIRECTOR",
  "REGULATOR_KEY_PERSON",
  "PLAINTIFF",
  "WITNESS",
  "COUNSEL",
  "MENTIONED",
];

const MatcherOut = z.object({
  m: z.number(),
  role: z.string().optional(),
  rationale: z.string().optional(),
});
type MatcherOutT = z.infer<typeof MatcherOut>;

function matcherPrompt(ev: EventInput, fp: Fingerprint): string {
  const attrs = fp.attributes
    .filter((a) => a.agreement === "AGREED")
    .map((a) => `${a.label}: ${a.displayValue}`)
    .join("; ");
  const ent = fp.linkedEntities.map((e) => e.name).join(", ");
  const src = ev.evidence[0];
  return (
    `Subject fingerprint — name: ${fp.canonicalName}; agreed attributes: ` +
    `${attrs || "—"}; linked entities: ${ent || "—"}.\n` +
    `Candidate matter: "${ev.title}" (category ${ev.category}, severity ` +
    `${ev.severity}). Source: ${src?.source ?? "—"}. ` +
    `Excerpt: ${src?.excerpt ?? "—"}.\n\n` +
    `How likely is the named party the subject? Return JSON ` +
    `{"m":0..1,"role":one of ${ROLES.join("|")},"rationale":"one line naming ` +
    `the disambiguating attributes you used"}.`
  );
}

async function runMatcher(
  ev: EventInput,
  fp: Fingerprint,
  family: "A" | "B",
): Promise<{ m: number; role?: Role } | null> {
  try {
    const out = await callAgentJson<MatcherOutT>({
      system: family === "A" ? MATCHER_SYSTEM_A : MATCHER_SYSTEM_B,
      tier: "large",
      family,
      maxTokens: 400,
      prompt: matcherPrompt(ev, fp),
    });
    const parsed = MatcherOut.safeParse(out);
    if (!parsed.success) return null;
    const role = (ROLES as string[]).includes(parsed.data.role ?? "")
      ? (parsed.data.role as Role)
      : undefined;
    return { m: Math.min(1, Math.max(0, parsed.data.m)), role };
  } catch {
    return null;
  }
}

/**
 * Runs the double-blind matchers over ambiguous-band events. On NoKeyError or
 * any failure the event keeps its incoming m (deterministic replay) and the
 * disposition cascade still applies.
 */
export async function runMatchers(
  events: EventInput[],
  fp: Fingerprint,
): Promise<MatchResult> {
  const cfg = DEFAULT_CONFIG;
  const out: EventInput[] = [];
  const rejected: string[] = [];
  const disputed: string[] = [];

  for (const ev of events) {
    const disp = matchDisposition(ev.m, ev.severity, cfg);
    if (disp === "REJECT") {
      rejected.push(ev.id);
      continue;
    }
    if (disp === "ACCEPT") {
      out.push(ev); // hard accept, no double-blind needed
      continue;
    }

    // AMBIGUOUS band → run both judges.
    const [a, b] = await Promise.all([
      runMatcher(ev, fp, "A"),
      runMatcher(ev, fp, "B"),
    ]);

    if (!a || !b) {
      // Could not run a pair (replay/failure): keep the event with its m.
      out.push(ev);
      continue;
    }

    const mean = (a.m + b.m) / 2;
    const dispA = matchDisposition(a.m, ev.severity, cfg);
    const dispB = matchDisposition(b.m, ev.severity, cfg);
    const split = Math.abs(a.m - b.m) > cfg.doubleBlind.splitGap || dispA !== dispB;

    if (dispA === "REJECT" && dispB === "REJECT") {
      rejected.push(ev.id);
      continue;
    }

    const merged: EventInput = {
      ...ev,
      m: mean,
      mA: a.m,
      mB: b.m,
      role: a.role ?? ev.role,
    };
    if (split) disputed.push(ev.id);
    out.push(merged);
  }

  return { events: out, rejected, disputed };
}
