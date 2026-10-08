import { cn } from "@/lib/ui";

/**
 * The NEMO "sounding" mark: three nested irregular depth contours tightening
 * toward the upper right, with a solid Chart-magenta point at the deepest spot
 * ("the thing found"). Also reads as a fingerprint whorl. (UI spec §3.2.)
 */
export function NemoMark({
  size = 24,
  className,
  mono = false,
}: {
  size?: number;
  className?: string;
  mono?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M3.5 15.5C3 10 7 4.5 13 4.2c5-.25 7.8 3 7.6 6.3"
        stroke="var(--fathom)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M6 15.6c-.3-4.2 2.8-7.9 7-8 3.4-.1 5.3 2.1 5.2 4.6"
        stroke="var(--fathom)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M8.6 15.4c-.1-2.7 1.9-5 4.6-5 2 0 3.1 1.3 3 2.9"
        stroke="var(--fathom)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="15.2" cy="13.4" r="1.4" fill={mono ? "var(--ink)" : "var(--magenta)"} />
    </svg>
  );
}

/** Horizontal lockup: mark + lowercase `nemo` wordmark (Archivo Expanded). */
export function NemoLogo({
  size = 22,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <NemoMark size={size} />
      <span
        className="font-display lowercase text-ink"
        style={{ fontWeight: 800, fontSize: size * 0.82, letterSpacing: 0 }}
      >
        nemo
      </span>
    </span>
  );
}
