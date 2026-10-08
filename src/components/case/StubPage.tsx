import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/primitives";
import { NemoMark } from "@/components/brand/Logo";

/** A tasteful placeholder for sidebar links that land in a later build. */
export function StubPage({
  title,
  tagline,
  items,
}: {
  title: string;
  tagline: string;
  items: { label: string; detail: string }[];
}) {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center gap-3">
          <NemoMark size={22} />
          <h1 className="font-display text-ink" style={{ fontWeight: 800, fontSize: 22 }}>
            {title}
          </h1>
        </div>
        <p className="mt-1 text-[13px] text-ink-secondary">{tagline}</p>
        <p className="mt-0.5 text-[12px] text-ink-tertiary">Coming in this build.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {items.map((it) => (
            <Card key={it.label} className="guilloche p-4">
              <div className="font-display text-ink" style={{ fontWeight: 600, fontSize: 14 }}>
                {it.label}
              </div>
              <p className="mt-1 text-[12px] text-ink-secondary">{it.detail}</p>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
