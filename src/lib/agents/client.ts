/**
 * LLM client for the live NEMO agent pipeline.
 *
 * Wraps the Anthropic SDK. The PRD requires A/B judge pairs to use different
 * model families where available (DB-3), so we expose three model tiers and a
 * `family` selector. When no ANTHROPIC_API_KEY is configured the pipeline falls
 * back to seeded replay (see orchestrator), so the app is always demoable.
 */
import Anthropic from "@anthropic-ai/sdk";

export type ModelFamily = "A" | "B" | "C";

/** PRD model tiers (§12). Overridable via env for operators. */
export const MODELS = {
  large: process.env.NEMO_MODEL_LARGE ?? "claude-sonnet-5-5",
  largeAlt: process.env.NEMO_MODEL_LARGE_ALT ?? "claude-opus-5-5",
  largeC: process.env.NEMO_MODEL_LARGE_C ?? "claude-opus-5-5",
  small: process.env.NEMO_MODEL_SMALL ?? "claude-haiku-4-5-20251001",
} as const;

export function isLiveEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export class NoKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY not set — pipeline runs in replay mode.");
    this.name = "NoKeyError";
  }
}

export interface AgentCallOptions {
  system: string;
  prompt: string;
  /** "large" (frontier) or "small" (fast). */
  tier?: "large" | "small";
  /** Judge family for A/B/C diversity; picks a different model for B/C. */
  family?: ModelFamily;
  maxTokens?: number;
  temperature?: number;
}

function pickModel(
  tier: "large" | "small",
  family: ModelFamily,
): string {
  if (tier === "small") return MODELS.small;
  if (family === "B") return MODELS.largeAlt;
  if (family === "C") return MODELS.largeC;
  return MODELS.large;
}

/** Calls Claude and returns raw text. Throws NoKeyError when no key is set. */
export async function callAgentText(opts: AgentCallOptions): Promise<string> {
  if (!isLiveEnabled()) throw new NoKeyError();
  const model = pickModel(opts.tier ?? "large", opts.family ?? "A");
  const res = await getClient().messages.create({
    model,
    max_tokens: opts.maxTokens ?? 1500,
    temperature: opts.temperature ?? (opts.family === "B" ? 0.4 : 0.2),
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/** Extracts the first JSON object/array from a model response. */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error("No JSON found in model response");
  // Balance braces/brackets from the first opening token.
  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        return JSON.parse(candidate.slice(start, i + 1)) as T;
      }
    }
  }
  throw new Error("Unbalanced JSON in model response");
}

/** Calls an agent and parses JSON, with one repair retry. */
export async function callAgentJson<T>(opts: AgentCallOptions): Promise<T> {
  const text = await callAgentText(opts);
  try {
    return extractJson<T>(text);
  } catch {
    const repair = await callAgentText({
      ...opts,
      prompt:
        opts.prompt +
        "\n\nReturn ONLY valid minified JSON. No prose, no code fences.",
    });
    return extractJson<T>(repair);
  }
}
