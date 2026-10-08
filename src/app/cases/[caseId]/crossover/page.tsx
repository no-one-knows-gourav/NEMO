/**
 * Declared vs discovered / Crossover (UI spec §9.3) — the brand showpiece.
 * Server reads the case and hands disclosure fields + metrics to the client
 * registration view. Rendered inside the case layout.
 */
import { notFound } from "next/navigation";
import { CrossoverView } from "@/components/viz/CrossoverView";
import { getCaseById } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CrossoverPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const c = await getCaseById(caseId);
  if (!c) notFound();

  const d = c.disclosure;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h2 className="font-display text-ink" style={{ fontWeight: 700, fontSize: 17 }}>
          Declared vs discovered
        </h2>
        <p className="mt-0.5 text-[12px] text-ink-secondary">
          The declared identity and the discovered identity, printed as two plates.
          Where they agree, the row reads as crisp ink. Where they disagree, the
          plates slip out of register — the bigger the gap, the louder the slip.
        </p>
      </div>

      {d ? (
        <CrossoverView
          fields={d.fields}
          metrics={{
            tm: d.trust,
            dd: d.disclosureDegree,
            c: d.consistency,
            v: d.verification,
            delta: d.dissimilarity,
            band: d.trustBand,
          }}
        />
      ) : (
        <p className="text-[13px] text-ink-secondary">
          The declared-vs-discovered comparison is not ready yet.
        </p>
      )}
    </div>
  );
}
