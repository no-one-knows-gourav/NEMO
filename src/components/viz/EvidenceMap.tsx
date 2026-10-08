"use client";

/**
 * Evidence map (UI spec §9.1): a custom inline-SVG node-link graph — no external
 * libraries. Person at the centre, linked organisations, findings/matters,
 * evidence spans and sources. Nodes are styled by type; edges are drawn as
 * fathom "fathom lines". Four layout arrangements (Soundings / Network /
 * Timeline / Ownership). Clicking a node opens an inspector side panel. Legible
 * in light and dark (all colours are NEMO tokens).
 */
import { useMemo, useState } from "react";
import type { Domain, Role, Severity, SourceTier } from "@/lib/types";
import { cn, SEVERITY_COLOR, SEVERITY_LABEL } from "@/lib/ui";

export type GraphNodeType = "person" | "org" | "finding" | "source" | "evidence";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  domain: Domain;
  hop: number;
  severity?: Severity;
  status?: string;
  tier?: SourceTier;
  attention?: boolean;
  struckOff?: boolean;
  date?: string | null;
  detail: { k: string; v: string }[];
}

export interface GraphEdge {
  from: string;
  to: string;
  type: string;
  role?: Role;
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

type Layout = "soundings" | "network" | "timeline" | "ownership";

const LAYOUTS: { id: Layout; label: string }[] = [
  { id: "soundings", label: "Soundings" },
  { id: "network", label: "Network" },
  { id: "timeline", label: "Timeline" },
  { id: "ownership", label: "Ownership" },
];

const W = 820;
const H = 540;

const SECTOR: Record<Domain, number> = {
  PERSONAL: 0,
  FINANCIAL: 1,
  LEGAL: 2,
  PROFESSIONAL: 3,
  SHARED_MEDIA: 2,
  SHARED_CROWD: 3,
};
const SECTOR_LABEL = ["Personal", "Financial", "Legal", "Professional"];

function roleWidth(role?: Role): number {
  switch (role) {
    case "ACCUSED":
      return 2.5;
    case "RESPONDENT_DIRECTOR":
      return 1.75;
    case "PLAINTIFF":
      return 0.9;
    default:
      return 0.6;
  }
}

function edgeStroke(e: GraphEdge, nodeById: Map<string, GraphNode>): string {
  if (e.type === "PARTY_TO") {
    const f = nodeById.get(e.to);
    return f?.severity ? SEVERITY_COLOR[f.severity] : "var(--fathom)";
  }
  if (e.type === "EVIDENCED_BY" || e.type === "EXTRACTED_FROM") return "var(--rule)";
  if (e.type === "ASSOCIATED_WITH") return "var(--ink-tertiary)";
  return "var(--fathom)";
}

function layoutPositions(
  m: GraphModel,
  layout: Layout,
): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  const cx = W / 2;
  const cy = H / 2;
  const person = m.nodes.find((n) => n.type === "person");

  if (layout === "soundings") {
    pos[person?.id ?? "__"] = { x: cx, y: cy };
    const byHopSector = new Map<string, GraphNode[]>();
    for (const n of m.nodes) {
      if (n.type === "person") continue;
      const key = `${n.hop}:${SECTOR[n.domain]}`;
      (byHopSector.get(key) ?? byHopSector.set(key, []).get(key)!).push(n);
    }
    const radByHop = [0, 130, 215, 290];
    for (const [key, group] of byHopSector) {
      const [hopStr, sectStr] = key.split(":");
      const hop = Math.min(3, Number(hopStr) || 1);
      const sect = Number(sectStr);
      const base = (-Math.PI * 3) / 4 + sect * (Math.PI / 2); // 4 sectors
      const span = Math.PI / 2 - 0.3;
      group.forEach((n, i) => {
        const t = group.length === 1 ? 0.5 : i / (group.length - 1);
        const ang = base + 0.15 + t * span;
        const r = radByHop[hop] || 150;
        pos[n.id] = { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
      });
    }
    return pos;
  }

  if (layout === "network") {
    pos[person?.id ?? "__"] = { x: cx, y: cy };
    const rest = m.nodes.filter((n) => n.type !== "person");
    const ga = Math.PI * (3 - Math.sqrt(5));
    rest.forEach((n, i) => {
      const ring = 110 + (n.hop - 1) * 95 + (i % 2) * 26;
      const ang = i * ga;
      pos[n.id] = { x: cx + Math.cos(ang) * ring, y: cy + Math.sin(ang) * ring * 0.74 };
    });
    return pos;
  }

  if (layout === "timeline") {
    const lanes: Record<number, number> = { 0: 90, 1: 180, 2: 290, 3: 400 };
    const dated = m.nodes.filter((n) => n.date);
    const times = dated.map((n) => Date.parse(n.date as string)).filter((t) => !Number.isNaN(t));
    const min = times.length ? Math.min(...times) : 0;
    const max = times.length ? Math.max(...times) : 1;
    const xFor = (d?: string | null) => {
      if (!d) return W - 90;
      const t = Date.parse(d);
      if (Number.isNaN(t) || max === min) return 120;
      return 120 + ((t - min) / (max - min)) * (W - 220);
    };
    const laneCount: Record<number, number> = {};
    for (const n of m.nodes) {
      if (n.type === "person") {
        pos[n.id] = { x: 60, y: H / 2 };
        continue;
      }
      const lane = SECTOR[n.domain];
      laneCount[lane] = (laneCount[lane] ?? 0) + 1;
      const jitter = (laneCount[lane] % 3) * 16 - 16;
      pos[n.id] = { x: xFor(n.date), y: (lanes[lane] ?? 290) + jitter };
    }
    return pos;
  }

  // ownership: top-down layers
  const layers: GraphNode[][] = [[], [], [], []];
  for (const n of m.nodes) {
    const l =
      n.type === "person" ? 0 : n.type === "org" ? 1 : n.type === "finding" ? 2 : 3;
    layers[l].push(n);
  }
  const ys = [70, 200, 340, 470];
  layers.forEach((group, li) => {
    group.forEach((n, i) => {
      const step = W / (group.length + 1);
      pos[n.id] = { x: step * (i + 1), y: ys[li] };
    });
  });
  return pos;
}

function NodeShape({ n, selected }: { n: GraphNode; selected: boolean }) {
  const stroke = "var(--fathom)";
  const ring = n.attention ? (
    <circle r={n.type === "person" ? 24 : 15} fill="none" stroke="var(--magenta)" strokeWidth={1.5} />
  ) : null;
  const halo = selected ? (
    <circle r={n.type === "person" ? 26 : 17} fill="none" stroke="var(--fathom)" strokeWidth={1} strokeDasharray="2 2" />
  ) : null;

  if (n.type === "person") {
    return (
      <g>
        {halo}
        {ring}
        <circle r={18} fill="var(--fathom)" />
        <circle cx={4} cy={-1} r={2.4} fill="var(--magenta)" />
      </g>
    );
  }
  if (n.type === "org") {
    return (
      <g>
        {halo}
        {ring}
        <rect x={-13} y={-13} width={26} height={26} rx={5} fill="var(--sheet)" stroke={stroke} strokeWidth={1.5} />
        {n.struckOff ? (
          <line x1={-13} y1={13} x2={13} y2={-13} stroke="var(--verdict-redflag)" strokeWidth={1.5} />
        ) : null}
      </g>
    );
  }
  if (n.type === "finding") {
    const col = n.severity ? SEVERITY_COLOR[n.severity] : "var(--ink)";
    const filled = n.status === "CONFIRMED";
    return (
      <g>
        {halo}
        {ring}
        <path
          d="M0 -13 L13 0 L0 13 L-13 0 Z"
          fill={filled ? col : "var(--sheet)"}
          stroke={col}
          strokeWidth={1.5}
          strokeDasharray={n.status === "DISMISSED" ? "2 2" : undefined}
        />
      </g>
    );
  }
  if (n.type === "source") {
    return (
      <g>
        {halo}
        <rect x={-7} y={-7} width={14} height={14} fill="var(--sheet)" stroke="var(--ink-secondary)" strokeWidth={1} />
      </g>
    );
  }
  return (
    <g>
      {halo}
      <circle r={4} fill="var(--fathom)" />
    </g>
  );
}

export function EvidenceMap({ graph }: { graph: GraphModel }) {
  const [layout, setLayout] = useState<Layout>("soundings");
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const nodeById = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n])),
    [graph.nodes],
  );
  const pos = useMemo(() => layoutPositions(graph, layout), [graph, layout]);

  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const n of graph.nodes) map.set(n.id, new Set([n.id]));
    for (const e of graph.edges) {
      map.get(e.from)?.add(e.to);
      map.get(e.to)?.add(e.from);
    }
    return map;
  }, [graph]);

  const active = hovered ?? selected;
  const selNode = selected ? nodeById.get(selected) : null;

  function dim(id: string): boolean {
    if (!active) return false;
    return !neighbours.get(active)?.has(id);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div>
        {/* Layout toggle */}
        <div className="mb-3 inline-flex rounded-md border border-rule p-0.5">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLayout(l.id)}
              className={cn(
                "rounded px-2.5 py-1 text-[12px]",
                layout === l.id
                  ? "bg-fathom text-white"
                  : "text-ink-secondary hover:bg-shoal/40",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-rule bg-sheet">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full"
            style={{ aspectRatio: `${W} / ${H}` }}
            role="img"
            aria-label="Evidence map"
          >
            {/* soundings depth rings + sector guides */}
            {layout === "soundings" ? (
              <g opacity={0.5}>
                {[130, 215, 290].map((r, i) => (
                  <g key={r}>
                    <circle cx={W / 2} cy={H / 2} r={r} fill="none" stroke="var(--rule)" />
                    <text x={W / 2 + r - 4} y={H / 2 - 4} fontSize={9} fill="var(--ink-tertiary)">
                      {i + 1}
                    </text>
                  </g>
                ))}
                {[0, 1, 2, 3].map((s) => {
                  const ang = (-Math.PI * 3) / 4 + s * (Math.PI / 2);
                  return (
                    <line
                      key={s}
                      x1={W / 2}
                      y1={H / 2}
                      x2={W / 2 + Math.cos(ang) * 300}
                      y2={H / 2 + Math.sin(ang) * 300}
                      stroke="var(--rule)"
                      strokeDasharray="2 4"
                    />
                  );
                })}
                {SECTOR_LABEL.map((lab, s) => {
                  const ang = (-Math.PI * 3) / 4 + s * (Math.PI / 2) + Math.PI / 4;
                  return (
                    <text
                      key={lab}
                      x={W / 2 + Math.cos(ang) * 310}
                      y={H / 2 + Math.sin(ang) * 310}
                      fontSize={10}
                      fill="var(--ink-tertiary)"
                      textAnchor="middle"
                    >
                      {lab}
                    </text>
                  );
                })}
              </g>
            ) : null}

            {/* edges */}
            {graph.edges.map((e, i) => {
              const a = pos[e.from];
              const b = pos[e.to];
              if (!a || !b) return null;
              const faded = dim(e.from) || dim(e.to);
              const dashed = e.type === "ASSOCIATED_WITH" || e.type === "CONTRADICTS";
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={edgeStroke(e, nodeById)}
                  strokeWidth={e.type === "PARTY_TO" ? roleWidth(e.role) : e.type.includes("EVIDENCED") ? 0.6 : 1.2}
                  strokeDasharray={dashed ? "3 3" : undefined}
                  opacity={faded ? 0.08 : e.type.includes("EVIDENCED") ? 0.5 : 0.65}
                />
              );
            })}

            {/* nodes */}
            {graph.nodes.map((n) => {
              const p = pos[n.id];
              if (!p) return null;
              const faded = dim(n.id);
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x} ${p.y})`}
                  opacity={faded ? 0.25 : 1}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setSelected(n.id)}
                  tabIndex={0}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      setSelected(n.id);
                    }
                  }}
                >
                  <NodeShape n={n} selected={selected === n.id} />
                  {n.type !== "evidence" ? (
                    <text
                      y={n.type === "person" ? 32 : 24}
                      fontSize={n.type === "person" ? 11 : 10}
                      fill="var(--ink-secondary)"
                      textAnchor="middle"
                    >
                      {n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>

        {/* legend */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-tertiary">
          <span>● Person</span>
          <span>▢ Organisation</span>
          <span>◆ Matter / finding</span>
          <span>▫ Source</span>
          <span className="text-magenta">◯ Needs attention</span>
        </div>
      </div>

      {/* Inspector */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-xl border border-rule bg-sheet p-4 shadow-[var(--shadow-sheet)]">
          {selNode ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {selNode.attention ? (
                  <span
                    className="inline-block rounded-full"
                    style={{ width: 7, height: 7, background: "var(--magenta)" }}
                  />
                ) : null}
                <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
                  {selNode.type}
                </span>
              </div>
              <div className="font-display text-ink" style={{ fontWeight: 600, fontSize: 14 }}>
                {selNode.label}
              </div>
              {selNode.severity ? (
                <div className="text-[11px] text-ink-secondary">
                  {selNode.severity} · {SEVERITY_LABEL[selNode.severity]}
                </div>
              ) : null}
              <dl className="mt-1 space-y-1 text-[12px]">
                {selNode.detail.map((d, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <dt className="text-ink-tertiary">{d.k}</dt>
                    <dd className="text-right text-ink">{d.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <p className="text-[12px] text-ink-secondary">
              Select a node to inspect its details. Hover to isolate a node and its
              direct links.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
