"use client";

import { use, useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/ui";
import type { PipelineEvent, PipelineStage } from "@/lib/types";
import { clockTime, STAGE_LABEL, STAGE_ORDER } from "@/components/case/helpers";

const LEVEL_STYLE: Record<
  PipelineEvent["level"],
  { color: string; glyph: string; label: string }
> = {
  info: { color: "var(--ink-secondary)", glyph: "·", label: "" },
  finding: { color: "var(--fathom)", glyph: "◆", label: "Finding" },
  warn: { color: "var(--verdict-concerns)", glyph: "△", label: "Note" },
  gate: { color: "var(--magenta)", glyph: "◉", label: "Gate" },
  done: { color: "var(--verdict-clear)", glyph: "●", label: "Done" },
  error: { color: "var(--verdict-redflag)", glyph: "✕", label: "Error" },
};

export default function LiveRunPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = use(params);
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"live" | "replay" | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    setEvents([]);
    setError(null);
    setDone(false);
    setMode(null);
    setRunning(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(`/api/cases/${caseId}/run`, {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`The run could not start (${res.status}).`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          for (const line of chunk.split("\n")) {
            const trimmed = line.trimStart();
            if (!trimmed.startsWith("data:")) continue;
            const json = trimmed.slice(5).trim();
            if (!json) continue;
            try {
              const ev = JSON.parse(json) as PipelineEvent;
              setEvents((prev) => [...prev, ev]);
              if (ev.data && typeof ev.data.mode === "string") {
                setMode(ev.data.mode as "live" | "replay");
              }
            } catch {
              /* ignore malformed line */
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(
          err instanceof Error ? err.message : "The live run failed.",
        );
      }
    } finally {
      setRunning(false);
      setDone(true);
      abortRef.current = null;
    }
  }, [caseId]);

  const byStage = STAGE_ORDER.map((stage) => ({
    stage,
    items: events.filter((e) => e.stage === stage),
  })).filter((g) => g.items.length > 0);

  const gateEvents = events.filter((e) => e.level === "gate");
  const lastGate = gateEvents[gateEvents.length - 1];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* Controls */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="font-display text-ink" style={{ fontWeight: 600, fontSize: 15 }}>
            Live run
          </div>
          <div className="text-[12px] text-ink-secondary">
            Watch the pipeline work: scope, identity, search, assess, recheck,
            report.
          </div>
        </div>
        <div className="flex items-center gap-3">
          {running ? (
            <span className="inline-flex items-center gap-2 text-[12px] text-fathom">
              <span className="relative inline-flex h-2 w-2">
                <span className="nemo-ping absolute inline-flex h-2 w-2 rounded-full" style={{ background: "var(--fathom)" }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "var(--fathom)" }} />
              </span>
              Running…
            </span>
          ) : null}
          <button
            onClick={run}
            disabled={running}
            className="rounded-md bg-fathom px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {done && !running ? "Run again" : "Run pipeline"}
          </button>
        </div>
      </Card>

      {/* Mode note */}
      <div className="rounded-md border border-rule px-4 py-2.5 text-[12px] text-ink-secondary">
        {mode === "live"
          ? "Live mode: agents are reasoning over real inputs."
          : mode === "replay"
            ? "Replay mode: no ANTHROPIC_API_KEY is set, so NEMO is replaying the seeded trace. This is expected for the demo."
            : "Live mode needs ANTHROPIC_API_KEY. Without it, NEMO replays the seeded trace — which is fine for the demo."}
      </div>

      {error ? (
        <div
          className="rounded-md border px-4 py-3 text-[13px]"
          style={{ color: "var(--verdict-redflag)", borderColor: "var(--verdict-redflag)" }}
        >
          {error}
        </div>
      ) : null}

      {/* Stage groups */}
      {events.length === 0 && !running ? (
        <Card className="p-10 text-center">
          <p className="text-[14px] text-ink">The pipeline hasn&apos;t run yet.</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-secondary">
            Press <span className="font-medium">Run pipeline</span> to stream the
            seven stages. Findings and gates ping as they arrive.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {byStage.map((g) => (
            <StageGroup key={g.stage} stage={g.stage} items={g.items} />
          ))}
        </div>
      )}

      {/* After the stream */}
      {done && events.length > 0 ? (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <span className="text-[13px] text-ink">Run finished.</span>
          <Link
            href={`/cases/${caseId}`}
            className="rounded-md bg-fathom px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
          >
            Open overview
          </Link>
          {lastGate?.stage === "gate_g1" ? (
            <Link
              href={`/cases/${caseId}/identity`}
              className="rounded-md border border-magenta px-3 py-1.5 text-[12px] text-magenta hover:bg-shoal/30"
            >
              Open identity check
            </Link>
          ) : null}
          {lastGate?.stage === "gate_g2" ? (
            <Link
              href={`/cases/${caseId}/report`}
              className="rounded-md border border-magenta px-3 py-1.5 text-[12px] text-magenta hover:bg-shoal/30"
            >
              Open final review
            </Link>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function StageGroup({
  stage,
  items,
}: {
  stage: PipelineStage;
  items: PipelineEvent[];
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-rule px-4 py-2.5">
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--fathom)" }} aria-hidden />
        <span className="font-display text-ink" style={{ fontWeight: 600, fontSize: 13 }}>
          {STAGE_LABEL[stage]}
        </span>
        <span className="text-[11px] text-ink-tertiary tabular">
          {items.length} event{items.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="divide-y divide-rule">
        {items.map((e) => (
          <EventRow key={e.id} e={e} />
        ))}
      </ul>
    </Card>
  );
}

function EventRow({ e }: { e: PipelineEvent }) {
  const s = LEVEL_STYLE[e.level];
  const ping = e.level === "finding" || e.level === "gate";
  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <span className="relative mt-0.5 inline-flex h-3.5 w-3.5 items-center justify-center">
        {ping ? (
          <span
            className="nemo-ping absolute inline-flex h-3.5 w-3.5 rounded-full"
            style={{ background: s.color, opacity: 0.4 }}
            aria-hidden
          />
        ) : null}
        <span className="relative text-[11px] leading-none" style={{ color: s.color }}>
          {s.glyph}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-ink">{e.message}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-tertiary">
          <span className="tabular">{clockTime(e.ts)}</span>
          <span className="font-mono">{e.component}</span>
          {s.label ? (
            <span style={{ color: s.color }}>{s.label}</span>
          ) : null}
        </div>
      </div>
    </li>
  );
}
