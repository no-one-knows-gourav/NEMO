/**
 * Evidence map (UI spec §9.1). The server derives a serialisable graph model
 * from the case fingerprint, findings and their evidence, and hands it to the
 * client <EvidenceMap> which renders the inline-SVG node-link graph. Rendered
 * inside the case layout.
 */
import { notFound } from "next/navigation";
import {
  EvidenceMap,
  type GraphEdge,
  type GraphModel,
  type GraphNode,
} from "@/components/viz/EvidenceMap";
import { getCaseById } from "@/lib/data";
import type { Domain, NemoCase } from "@/lib/types";
import { QUESTION_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";

const REL_WORD: Record<string, string> = {
  DIRECTOR_OF: "Director of",
  OFFICER_OF: "Officer of",
  SHAREHOLDER_OF: "Shareholder of",
  ASSOCIATED_WITH: "Associated with",
};

function buildGraph(c: NemoCase): GraphModel {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const personId = `person:${c.id}`;

  nodes.push({
    id: personId,
    type: "person",
    label: c.fingerprint?.canonicalName ?? c.subject.name,
    domain: "PERSONAL",
    hop: 0,
    detail: [
      { k: "Subject type", v: c.subject.subjectType },
      { k: "Jurisdiction", v: c.subject.jurisdiction ?? "—" },
      { k: "Purpose", v: c.subject.purpose },
    ],
  });

  // Linked organisations
  for (const e of c.fingerprint?.linkedEntities ?? []) {
    nodes.push({
      id: e.id,
      type: "org",
      label: e.name,
      domain: "PROFESSIONAL",
      hop: 1,
      struckOff: e.status === "struck_off",
      date: e.from ?? null,
      detail: [
        { k: "Relation", v: REL_WORD[e.relation] ?? e.relation },
        { k: "Period", v: `${e.from ?? "?"}${e.to ? ` – ${e.to}` : " – present"}` },
        { k: "Jurisdiction", v: e.jurisdiction ?? "—" },
        { k: "Status", v: e.status ?? "—" },
      ],
    });
    edges.push({ from: personId, to: e.id, type: e.relation });
  }

  // Findings (matters) + evidence spans + sources
  const sourceSeen = new Set<string>();
  for (const f of c.findings) {
    nodes.push({
      id: f.id,
      type: "finding",
      label: f.title,
      domain: f.domain as Domain,
      hop: 1,
      severity: f.severity,
      status: f.status,
      attention: f.status === "ALLEGATION",
      date: f.evidence[0]?.retrievedAt ?? null,
      detail: [
        { k: "Question", v: QUESTION_LABEL[f.question] },
        { k: "Status", v: f.status },
        { k: "Role", v: f.role },
        { k: "Legal status", v: f.legalStatus ?? "—" },
      ],
    });
    edges.push({ from: personId, to: f.id, type: "PARTY_TO", role: f.role });

    for (const ev of f.evidence) {
      const evId = `ev:${f.id}:${ev.id}`;
      nodes.push({
        id: evId,
        type: "evidence",
        label: ev.source,
        domain: f.domain as Domain,
        hop: 2,
        tier: ev.tier,
        date: ev.retrievedAt ?? null,
        detail: [
          { k: "Source", v: ev.source },
          { k: "Tier", v: ev.tier },
          { k: "Retrieved", v: ev.retrievedAt ?? "—" },
          ...(typeof ev.entailment === "number"
            ? [{ k: "Entailment", v: ev.entailment.toFixed(2) }]
            : []),
        ],
      });
      edges.push({ from: f.id, to: evId, type: "EVIDENCED_BY" });

      const srcId = `src:${ev.source}`;
      if (!sourceSeen.has(srcId)) {
        sourceSeen.add(srcId);
        nodes.push({
          id: srcId,
          type: "source",
          label: ev.source,
          domain: f.domain as Domain,
          hop: 3,
          tier: ev.tier,
          detail: [
            { k: "Source", v: ev.source },
            { k: "Tier", v: ev.tier },
          ],
        });
      }
      edges.push({ from: evId, to: srcId, type: "EXTRACTED_FROM" });
    }
  }

  return { nodes, edges };
}

export default async function EvidencePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const c = await getCaseById(caseId);
  if (!c) notFound();
  const graph = buildGraph(c);

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <div>
        <h2 className="font-display text-ink" style={{ fontWeight: 700, fontSize: 17 }}>
          Evidence map
        </h2>
        <p className="mt-0.5 text-[12px] text-ink-secondary">
          Everything anchored to this person: companies, matters, and the sources
          each finding rests on. Hatched gaps are unsurveyed water.
        </p>
      </div>
      <EvidenceMap graph={graph} />
    </div>
  );
}
