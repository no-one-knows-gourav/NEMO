/**
 * NEMO presentational primitives. Colour never carries meaning alone: every
 * verdict/severity mark pairs a glyph with its label (A11Y-001). All server-safe.
 */
import type { ReactNode } from "react";
import type {
  CaseLevel,
  Severity,
  SourceTier,
  Verdict,
} from "@/lib/types";
import {
  cn,
  LEVEL_LABEL,
  LEVEL_SOUNDINGS,
  SEVERITY_COLOR,
  SEVERITY_FILLED,
  SEVERITY_LABEL,
  TIER_LABEL,
  VERDICT_COLOR,
  VERDICT_GLYPH,
  VERDICT_LABEL,
  type VerdictGlyph,
} from "@/lib/ui";

// --- Card -----------------------------------------------------------------

export function Card({
  children,
  className,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: React.ElementType;
}) {
  return (
    <As
      className={cn(
        "rounded-xl border border-rule bg-sheet",
        "shadow-[var(--shadow-sheet)]",
        className,
      )}
    >
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-4 pt-4", className)}>
      <div>
        <div className="font-display text-ink" style={{ fontWeight: 600, fontSize: 15 }}>
          {title}
        </div>
        {subtitle ? (
          <div className="mt-0.5 text-[12px] text-ink-secondary">{subtitle}</div>
        ) : null}
      </div>
      {right}
    </div>
  );
}

// --- Verdict glyph + badge -------------------------------------------------

export function VerdictGlyphMark({
  glyph,
  color,
  size = 12,
}: {
  glyph: VerdictGlyph;
  color: string;
  size?: number;
}) {
  const c = size / 2;
  const common = { fill: color };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {glyph === "circle" && <circle cx={c} cy={c} r={c - 1} {...common} />}
      {glyph === "triangle" && (
        <path
          d={`M${c} 1 L${size - 1} ${size - 1} L1 ${size - 1} Z`}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
        />
      )}
      {glyph === "diamond" && (
        <path d={`M${c} 1 L${size - 1} ${c} L${c} ${size - 1} L1 ${c} Z`} {...common} />
      )}
      {glyph === "square" && (
        <rect x={1.5} y={1.5} width={size - 3} height={size - 3} fill="none" stroke={color} strokeWidth={1.5} />
      )}
      {glyph === "octagon" && (
        <path
          d={`M${size * 0.33} 1 L${size * 0.67} 1 L${size - 1} ${size * 0.33} L${size - 1} ${size * 0.67} L${size * 0.67} ${size - 1} L${size * 0.33} ${size - 1} L1 ${size * 0.67} L1 ${size * 0.33} Z`}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}

export function VerdictBadge({
  verdict,
  size = "md",
  className,
}: {
  verdict: Verdict;
  size?: "sm" | "md";
  className?: string;
}) {
  const color = VERDICT_COLOR[verdict];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5",
        size === "sm" ? "text-[11px]" : "text-[12px]",
        className,
      )}
      style={{ color, borderColor: color }}
    >
      <VerdictGlyphMark glyph={VERDICT_GLYPH[verdict]} color={color} size={size === "sm" ? 10 : 12} />
      <span className="font-medium">{VERDICT_LABEL[verdict]}</span>
    </span>
  );
}

// --- Severity sounding bars ------------------------------------------------

export function SeverityBars({
  severity,
  showLabel = false,
  className,
}: {
  severity: Severity;
  showLabel?: boolean;
  className?: string;
}) {
  const filled = SEVERITY_FILLED[severity];
  const color = SEVERITY_COLOR[severity];
  return (
    <span className={cn("inline-flex items-center gap-2", className)} title={`${severity} — ${SEVERITY_LABEL[severity]}`}>
      <span className="inline-flex items-end gap-[2px]" style={{ height: 14 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            style={{
              width: 3,
              height: 4 + i * 2,
              background: i <= filled ? color : "var(--rule)",
              borderRadius: 1,
            }}
          />
        ))}
      </span>
      {showLabel ? (
        <span className="text-[11px]" style={{ color }}>
          {severity} · {SEVERITY_LABEL[severity]}
        </span>
      ) : null}
    </span>
  );
}

// --- Source tier mark ------------------------------------------------------

export function TierMark({ tier }: { tier: SourceTier }) {
  const ink = "var(--tier-ink)";
  const s = 12;
  return (
    <span title={`${tier} — ${TIER_LABEL[tier]}`} className="inline-flex items-center gap-1 text-[11px] text-ink-secondary">
      <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden="true">
        {tier === "T1" && <rect x={1} y={1} width={10} height={10} fill={ink} />}
        {tier === "T2" && (
          <>
            <rect x={1} y={1} width={10} height={10} fill="none" stroke={ink} />
            <rect x={1} y={1} width={10} height={5} fill={ink} />
          </>
        )}
        {tier === "T3" && (
          <>
            <rect x={1} y={1} width={10} height={10} fill="none" stroke={ink} />
            <circle cx={6} cy={6} r={2} fill={ink} />
          </>
        )}
        {tier === "T4" && <rect x={1} y={1} width={10} height={10} fill="none" stroke={ink} />}
        {tier === "T5" && (
          <rect x={1} y={1} width={10} height={10} fill="none" stroke={ink} strokeDasharray="2 1.5" />
        )}
      </svg>
      {tier}
    </span>
  );
}

// --- Case level badge ------------------------------------------------------

export function LevelBadge({ level }: { level: CaseLevel }) {
  const n = LEVEL_SOUNDINGS[level];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-rule px-2 py-0.5 text-[11px] text-ink-secondary">
      <span className="inline-flex flex-col gap-[2px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 10,
              height: 1.5,
              background: i < n ? "var(--fathom)" : "var(--rule)",
            }}
          />
        ))}
      </span>
      {LEVEL_LABEL[level]}
    </span>
  );
}

// --- Generic chip ----------------------------------------------------------

export function Chip({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "attention" | "muted";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
        tone === "attention" && "border-magenta text-magenta",
        tone === "muted" && "border-rule text-ink-tertiary",
        tone === "default" && "border-rule text-ink-secondary",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A magenta dot = "a person needs to look at this" (UI-020). */
export function AttentionDot({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block rounded-full", className)}
      style={{ width: 7, height: 7, background: "var(--magenta)" }}
      aria-label="needs attention"
    />
  );
}
