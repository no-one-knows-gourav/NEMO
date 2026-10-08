"use client";

/**
 * Declared vs discovered — the registration view (UI spec §9.3), the brand's
 * signature visual. DID-D (declared, printed in the fathom plate) and DID-S
 * (discovered, printed in the magenta plate) are laid over one another. Rows
 * that AGREE print in register (crisp ink); mismatches slip OUT of register
 * using the global .plate-slip treatment (data-ghost + magenta). Registration
 * crosshairs in the margin line up on agreeing rows and split on mismatches.
 * On first open the plates slip from registered to their offsets; Reduce motion
 * shows the final state immediately (§9.3.4). An accessible plain-text table is
 * one toggle away (§9.3.5).
 */
import { useEffect, useState } from "react";
import { StatProbe } from "@/components/ui/score";
import type { AlignmentField, AlignmentOutcome } from "@/lib/types";
import { cn, fmtNum, fmtPct } from "@/lib/ui";

const OUTCOME_LABEL: Record<AlignmentOutcome, string> = {
  AGREE: "Agrees",
  MINOR_VARIANCE: "Minor variance",
  DECLARED_NOT_FOUND: "Declared, not found",
  FOUND_NOT_DECLARED: "Found, not declared",
  CONFLICT: "Conflict",
};

interface Metrics {
  tm: number;
  dd: number;
  c: number;
  v: number;
  delta: number;
  band?: string;
}

const METRIC_HELP: Record<string, string> = {
  Consistency:
    "How well what they told us matches what we found, weighting serious items more. Below 0.60 is low.",
  Disclosure:
    "Of the serious things we found that they were asked about, how much they told us.",
  Verified: "Of what they told us, how much public records support.",
  Difference: "How far apart the declared and discovered identities are overall.",
};

function BandProbe({
  value,
  label,
  threshold,
  invert,
}: {
  value: number;
  label: string;
  threshold: number;
  invert?: boolean;
}) {
  // invert: for Difference (δ), lower is better.
  const good = invert ? value <= threshold : value >= threshold;
  return (
    <div title={METRIC_HELP[label]}>
      <StatProbe
        value={fmtNum(value)}
        label={label}
        tone={good ? "var(--ink)" : "var(--magenta)"}
      />
      <div className="mt-1 px-1">
        <div className="relative h-1.5 w-full rounded-full bg-shoal/60">
          <span
            className="absolute top-0 h-1.5 w-px bg-rule"
            style={{ left: `${threshold * 100}%` }}
          />
          <span
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border"
            style={{
              left: `${Math.max(0, Math.min(1, value)) * 100}%`,
              background: "var(--sheet)",
              borderColor: good ? "var(--fathom)" : "var(--magenta)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Crosshair({ split }: { split?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <g stroke={split ? "var(--magenta)" : "var(--ink-tertiary)"} strokeWidth="1">
        <line x1="9" y1="2" x2="9" y2="16" />
        <line x1="2" y1="9" x2="16" y2="9" />
        <circle cx="9" cy="9" r="3.5" fill="none" />
      </g>
      {split ? (
        <g stroke="var(--fathom)" strokeWidth="1" opacity="0.7" transform="translate(-2,-1)">
          <line x1="9" y1="2" x2="9" y2="16" />
          <line x1="2" y1="9" x2="16" y2="9" />
        </g>
      ) : null}
    </svg>
  );
}

function RegistrationRow({ f }: { f: AlignmentField }) {
  const declared = f.declared ?? "";
  const discovered = f.discovered ?? "";
  const mismatch = f.outcome !== "AGREE";

  let valueCell: React.ReactNode;
  if (f.outcome === "AGREE") {
    valueCell = <span className="text-ink">{declared || discovered}</span>;
  } else if (f.outcome === "DECLARED_NOT_FOUND") {
    valueCell = (
      <div className="space-y-1">
        <div className="text-fathom">{declared}</div>
        <div className="relative overflow-hidden rounded-sm border border-dashed border-rule px-2 py-1 text-[11px] text-ink-tertiary">
          <span className="hatch-unsurveyed absolute inset-0" />
          <span className="relative">
            No public record found{typeof f.coverage === "number" ? ` (coverage ${fmtPct(f.coverage)})` : ""}
          </span>
        </div>
      </div>
    );
  } else if (f.outcome === "FOUND_NOT_DECLARED") {
    valueCell = (
      <div className="space-y-1">
        <div className="rounded-sm border border-dashed border-rule px-2 py-1 text-[11px] text-ink-tertiary">
          Not declared
        </div>
        <div className="text-magenta">{discovered}</div>
      </div>
    );
  } else {
    // CONFLICT / MINOR_VARIANCE — slip out of register with the ghost plate
    valueCell = (
      <div className="space-y-0.5">
        <span className="plate-slip inline-block text-fathom" data-ghost={discovered}>
          {declared}
        </span>
        <div className="text-[11px] text-magenta">{discovered}</div>
        {f.outcome === "MINOR_VARIANCE" ? (
          <div className="text-[10px] text-ink-tertiary">Minor variance</div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(110px,160px)_1fr_auto] items-start gap-3 border-b border-rule py-2",
        mismatch && "bg-magenta/5",
      )}
    >
      <div className="text-[12px] text-ink-secondary">{f.field}</div>
      <div className="text-[13px] leading-relaxed">{valueCell}</div>
      <div className="flex items-center gap-1.5 pl-2">
        <Crosshair split={mismatch} />
        {mismatch ? (
          <span className="inline-block h-4 w-[3px] rounded-full bg-magenta" aria-hidden />
        ) : null}
      </div>
    </div>
  );
}

export function CrossoverView({
  fields,
  metrics,
}: {
  fields: AlignmentField[];
  metrics: Metrics;
}) {
  const [view, setView] = useState<"registration" | "table">("registration");
  const [slipped, setSlipped] = useState(false);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setSlipped(true);
      return;
    }
    const id = requestAnimationFrame(() => setSlipped(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="space-y-4">
      <style>{`
        .xover-stage .plate-slip::after {
          transition: transform 400ms ease, opacity 400ms ease;
          transform: translate(-2px, -1px);
          opacity: 0;
        }
        .xover-stage.slipped .plate-slip::after {
          transform: translate(0, 0);
          opacity: 0.55;
        }
        @media (prefers-reduced-motion: reduce) {
          .xover-stage .plate-slip::after { transition: none; }
        }
      `}</style>

      {/* Metrics strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <BandProbe value={metrics.tm} label="Consistency" threshold={0.6} />
        <BandProbe value={metrics.dd} label="Disclosure" threshold={0.6} />
        <BandProbe value={metrics.c} label="Internal consistency" threshold={0.6} />
        <BandProbe value={metrics.v} label="Verified" threshold={0.6} />
        <BandProbe value={metrics.delta} label="Difference" threshold={0.3} invert />
      </div>
      <p className="text-[11px] text-ink-tertiary">
        Overall difference δ {fmtNum(metrics.delta)}
        {metrics.band ? ` · consistency band ${metrics.band}` : ""}. Changes above
        importance 0.15 are sent for review.
      </p>

      {/* View toggle */}
      <div className="inline-flex rounded-md border border-rule p-0.5">
        {(["registration", "table"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={cn(
              "rounded px-2.5 py-1 text-[12px] capitalize",
              view === v ? "bg-fathom text-white" : "text-ink-secondary hover:bg-shoal/40",
            )}
          >
            {v === "registration" ? "Registration" : "Table"}
          </button>
        ))}
      </div>

      {view === "registration" ? (
        <div className="rounded-xl border border-rule bg-sheet p-4 shadow-[var(--shadow-sheet)]">
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px]">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--fathom)" }} />
              Declared plate — what the subject told us
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--magenta)" }} />
              Discovered plate — what public records show
            </span>
          </div>
          <div className={cn("xover-stage", slipped && "slipped")}>
            <div className="grid grid-cols-[minmax(110px,160px)_1fr_auto] gap-3 border-b border-rule pb-1.5 text-[10px] uppercase tracking-wide text-ink-tertiary">
              <span>Field</span>
              <span>Value</span>
              <span className="pl-2">Register</span>
            </div>
            {fields.map((f) => (
              <RegistrationRow key={f.field} f={f} />
            ))}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-rule bg-sheet">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-rule text-[11px] uppercase tracking-wide text-ink-tertiary">
                <th className="px-3 py-2 font-medium">Field</th>
                <th className="px-3 py-2 font-medium">Declared</th>
                <th className="px-3 py-2 font-medium">Discovered</th>
                <th className="px-3 py-2 font-medium">Outcome</th>
                <th className="px-3 py-2 font-medium">Weight</th>
                <th className="px-3 py-2 font-medium">Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {fields.map((f) => {
                const mismatch = f.outcome !== "AGREE";
                return (
                  <tr key={f.field} className={mismatch ? "bg-magenta/5" : undefined}>
                    <td className="px-3 py-2 text-ink">{f.field}</td>
                    <td className="px-3 py-2 text-ink-secondary">{f.declared ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-secondary">{f.discovered ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={mismatch ? "text-magenta" : "text-ink-secondary"}>
                        {OUTCOME_LABEL[f.outcome]}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular text-ink-secondary">{fmtNum(f.weight)}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-ink-tertiary">
                      {f.evidenceIds?.join(", ") ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
