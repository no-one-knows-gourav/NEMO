/**
 * /api/ask — grounded Q&A over a case (C-35).
 *
 * Body: { caseId?, question }. When caseId is omitted the seed demo case is
 * used. LIVE: Claude answers strictly from the case report/findings/coverage,
 * citing finding ids and source names and stating the as-of date; it refuses
 * when nothing relevant is found (FR-122/124). REPLAY (no key / failure): a
 * grounded, templated answer assembled deterministically from the case data.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCaseById, SEED_CASE_ID } from "@/lib/data";
import { callAgentJson } from "@/lib/agents/client";
import { QA_SYSTEM } from "@/lib/agents/prompts";
import type { Finding, NemoCase } from "@/lib/types";

interface Citation {
  chunkId?: string;
  node?: string;
  asOf: string;
}

interface AskResponse {
  answer: string;
  citations: Citation[];
}

function relevantFindings(c: NemoCase, question: string): Finding[] {
  const terms = question
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
  const scored = c.findings.map((f) => {
    const hay = `${f.title} ${f.summary} ${f.question} ${f.category}`.toLowerCase();
    const score = terms.reduce((n, t) => (hay.includes(t) ? n + 1 : n), 0);
    return { f, score };
  });
  const hits = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  return (hits.length ? hits : scored).slice(0, 3).map((s) => s.f);
}

function templatedAnswer(c: NemoCase, question: string, asOf: string): AskResponse {
  const findings = relevantFindings(c, question);
  const citations: Citation[] = [];
  if (!findings.length) {
    return {
      answer: `As of ${asOf}, the case record for ${c.subject.name} contains no finding that addresses that question. I can only answer from what is in the case.`,
      citations: [],
    };
  }
  const lines = findings.map((f) => {
    for (const e of f.evidence) {
      citations.push({ chunkId: f.id, node: e.source, asOf });
    }
    if (!f.evidence.length) citations.push({ chunkId: f.id, asOf });
    return `${f.title} (${f.status.toLowerCase()}, severity ${f.severity}).`;
  });
  return {
    answer:
      `As of ${asOf}, the case record for ${c.subject.name} shows: ` +
      lines.join(" ") +
      ` See findings ${findings.map((f) => f.id).join(", ")}.`,
    citations,
  };
}

const LiveOut = z.object({
  answer: z.string(),
  grounded: z.boolean().optional(),
  citations: z
    .array(z.object({ findingId: z.string().optional(), source: z.string().optional() }))
    .optional(),
});

export async function POST(req: Request) {
  let body: { caseId?: string; question?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const question = (body.question ?? "").trim();
  if (!question) {
    return NextResponse.json({ error: "A question is required." }, { status: 400 });
  }

  const caseId = body.caseId ?? SEED_CASE_ID;
  const c = await getCaseById(caseId);
  if (!c) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }
  const asOf = c.updatedAt.slice(0, 10);

  // Build the grounding context (report + findings + coverage + disclosure).
  const context =
    `Subject: ${c.subject.name}. As of: ${asOf}.\n` +
    `Verdicts: ${Object.entries(c.verdicts)
      .map(([q, v]) => `${q}=${v}`)
      .join(", ")}.\n` +
    `Findings:\n` +
    (c.findings.length
      ? c.findings
          .map(
            (f) =>
              `- ${f.id} [${f.question}]: ${f.title} (${f.status}, ${f.severity}). ${f.summary} Sources: ${f.evidence
                .map((e) => e.source)
                .join(", ")}.`,
          )
          .join("\n")
      : "(none)") +
    `\nCoverage: ${c.coverage.map((r) => `${r.sourceName}:${r.state}`).join(", ")}.\n` +
    (c.disclosure
      ? `Disclosure: trust ${c.disclosure.trust.toFixed(2)} (${c.disclosure.trustBand}).`
      : "");

  try {
    const out = await callAgentJson<z.infer<typeof LiveOut>>({
      system: QA_SYSTEM,
      tier: "large",
      family: "A",
      maxTokens: 700,
      prompt:
        `Case context (your ONLY source of truth):\n${context}\n\n` +
        `Question: ${question}\n\n` +
        `Return JSON {"answer":"...","grounded":true|false,` +
        `"citations":[{"findingId":"F-..","source":"name"}]}. ` +
        `If the context does not answer the question, set grounded=false and ` +
        `say you cannot answer from the case record.`,
    });
    const parsed = LiveOut.safeParse(out);
    if (parsed.success) {
      const citations: Citation[] = (parsed.data.citations ?? []).map((c2) => ({
        chunkId: c2.findingId,
        node: c2.source,
        asOf,
      }));
      return NextResponse.json({
        answer: parsed.data.answer,
        citations,
      } satisfies AskResponse);
    }
  } catch {
    // NoKeyError or failure → templated answer.
  }

  return NextResponse.json(templatedAnswer(c, question, asOf) satisfies AskResponse);
}
