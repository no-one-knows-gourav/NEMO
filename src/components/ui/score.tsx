/**
 * Score visualisations (UI spec §5 VIZ). A point score shown as a depth
 * sounding with its uncertainty interval (error factor) as a bracket, and a
 * coverage sounding bar with an unsurveyed (hatched) remainder.
 */
import { cn, fmtNum, fmtPct } from "@/lib/ui";

const BAND_STOPS = [0.1, 0.4]; // clear | concerns | red_flag

/** Horizontal score track with point marker and low–high interval. */
export function ScoreInterval({
  point,
  low,
  high,
  label,
  className,
}: {
  point: number;
  low: number;
  high: number;
  label?: string;
  className?: string;
}) {
  const pct = (x: number) => `${Math.max(0, Math.min(1, x)) * 100}%`;
  return (
    <div className={cn("w-full", className)}>
      {label ? (
        <div className="mb-1 flex items-center justify-between text-[11px] text-ink-secondary">
          <span>{label}</span>
          <span className="tabular">
            {fmtNum(point)}{" "}
            <span className="text-ink-tertiary">
              ({fmtNum(low)}–{fmtNum(high)})
            </span>
          </span>
        </div>
      ) : null}
      <div className="relative h-2 w-full rounded-full bg-shoal/60">
        {/* band separators */}
        {BAND_STOPS.map((b) => (
          <span
            key={b}
            className="absolute top-0 h-2 w-px bg-rule"
            style={{ left: pct(b) }}
          />
        ))}
        {/* interval */}
        <span
          className="absolute top-0 h-2 rounded-full"
          style={{
            left: pct(low),
            width: pct(Math.max(0, high - low)),
            background: "color-mix(in srgb, var(--fathom) 45%, transparent)",
          }}
        />
        {/* point */}
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{
            left: pct(point),
            background: "var(--sheet)",
            borderColor: "var(--fathom)",
          }}
        />
      </div>
    </div>
  );
}

/** Coverage sounding: searched portion solid, remainder hatched (unsurveyed). */
export function CoverageSounding({
  coverage,
  className,
  showValue = true,
}: {
  coverage: number;
  className?: string;
  showValue?: boolean;
}) {
  const c = Math.max(0, Math.min(1, coverage));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative h-2 w-full overflow-hidden rounded-full border border-rule">
        <div className="hatch-unsurveyed absolute inset-0" />
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${c * 100}%`, background: "var(--fathom)" }}
        />
      </div>
      {showValue ? (
        <span className="tabular text-[11px] text-ink-secondary">{fmtPct(c)}</span>
      ) : null}
    </div>
  );
}

/** A small stat tile ("probe"): a number with a label (UI spec cards). */
export function StatProbe({
  value,
  label,
  tone,
  sub,
}: {
  value: string;
  label: string;
  tone?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-rule bg-sheet px-3 py-2.5">
      <div
        className="font-display tabular"
        style={{ fontWeight: 700, fontSize: 22, color: tone ?? "var(--ink)" }}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-ink-secondary">{label}</div>
      {sub ? <div className="text-[10px] text-ink-tertiary">{sub}</div> : null}
    </div>
  );
}
