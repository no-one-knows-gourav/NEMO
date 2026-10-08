/**
 * Identity check / Gate G1 (UI spec §6.8, PRD 14.1). A person approves or
 * corrects the identity details before NEMO runs committed collection (HR-001).
 * Rendered inside the case layout (AppShell + header + tabs already applied).
 */
import { notFound } from "next/navigation";
import {
  AttentionDot,
  Card,
  CardHeader,
  Chip,
  TierMark,
} from "@/components/ui/primitives";
import { GateReview } from "@/components/viz/GateReview";
import { getCaseById } from "@/lib/data";
import type { FingerprintAttribute, FootprintFlag, NameVariant } from "@/lib/types";
import { fmtPct } from "@/lib/ui";

export const dynamic = "force-dynamic";

const FLAG_LABEL: Record<FootprintFlag, string> = {
  THIN_FOOTPRINT: "Thin footprint — little public record for this person",
  LATE_FOOTPRINT: "Late footprint — the public trail starts recently",
  MEDIA_SPIKE: "Media spike — a burst of coverage in a short window",
  GAP: "Coverage gap in a required source",
  PATTERN: "Repeated pattern across linked entities",
};

const RELATION_LABEL: Record<string, string> = {
  DIRECTOR_OF: "Director of",
  OFFICER_OF: "Officer of",
  SHAREHOLDER_OF: "Shareholder of",
  ASSOCIATED_WITH: "Associated with",
};

const ALIAS_KIND_LABEL: Record<NameVariant["kind"], string> = {
  transliteration: "transliteration",
  previous: "former name",
  initials: "initials",
  misspelling: "misspelling",
  honorific: "honorific",
};

function AttrRow({ a }: { a: FingerprintAttribute }) {
  const disputed = a.agreement === "DISPUTED";
  return (
    <tr className={disputed ? "bg-magenta/5" : undefined}>
      <td className="py-2 pr-3 align-top">
        <div className="flex items-center gap-1.5 text-[13px] text-ink">
          {disputed ? <AttentionDot /> : null}
          {a.label}
        </div>
        <div className="text-[11px] text-ink-tertiary">Tier {a.tier}</div>
      </td>
      <td className="py-2 pr-3 align-top">
        {disputed ? (
          <div className="space-y-1 text-[12px]">
            <div>
              <span className="text-ink-tertiary">Resolver A:</span>{" "}
              <span className="font-mono tabular text-ink">{a.valueA ?? "—"}</span>
            </div>
            <div>
              <span className="text-ink-tertiary">Resolver B:</span>{" "}
              <span className="font-mono tabular text-ink">{a.valueB ?? "(not included)"}</span>
            </div>
          </div>
        ) : (
          <span className="font-mono tabular text-[13px] text-ink">{a.displayValue}</span>
        )}
      </td>
      <td className="py-2 pr-3 align-top tabular text-[12px] text-ink-secondary">
        {fmtPct(a.confidence)}
      </td>
      <td className="py-2 pr-3 align-top text-[12px] text-ink-secondary">
        {a.provenance ?? "—"}
      </td>
      <td className="py-2 align-top">
        {disputed ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-magenta">
            <AttentionDot /> Disputed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-secondary">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <circle cx="6" cy="6" r="5" fill="none" stroke="var(--verdict-clear)" />
              <circle cx="6" cy="6" r="1.8" fill="var(--verdict-clear)" />
            </svg>
            Agreed
          </span>
        )}
      </td>
    </tr>
  );
}

export default async function IdentityPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const c = await getCaseById(caseId);
  if (!c) notFound();
  const fp = c.fingerprint;

  if (!fp) {
    return (
      <div className="text-[13px] text-ink-secondary">
        Identity details are still being built. Check back once the fingerprint is ready.
      </div>
    );
  }

  const disputed = fp.attributes.filter((a) => a.agreement === "DISPUTED").length;
  const spec = fp.speculative;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-ink" style={{ fontWeight: 700, fontSize: 17 }}>
            Identity check
          </h2>
          <p className="mt-0.5 text-[12px] text-ink-secondary">
            Approve the identity details before NEMO searches. This is where false
            positives are prevented at the source.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-secondary">
          {disputed > 0 ? (
            <>
              <AttentionDot /> {disputed} detail{disputed === 1 ? "" : "s"} need your decision
            </>
          ) : (
            "All details agree between resolvers"
          )}
        </span>
      </div>

      {/* Attributes */}
      <Card>
        <CardHeader
          title="Identity details"
          subtitle="Every attribute, with confidence, provenance and A/B resolver agreement"
        />
        <div className="overflow-x-auto px-4 pb-4 pt-2">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-rule text-[11px] uppercase tracking-wide text-ink-tertiary">
                <th className="py-1.5 pr-3 font-medium">Detail</th>
                <th className="py-1.5 pr-3 font-medium">Value</th>
                <th className="py-1.5 pr-3 font-medium">Confidence</th>
                <th className="py-1.5 pr-3 font-medium">Provenance</th>
                <th className="py-1.5 font-medium">Agreement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {fp.attributes.map((a) => (
                <AttrRow key={a.type} a={a} />
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-ink-tertiary">
            Values for Tier-U identifiers (PAN, DIN, passport) are masked. Raw
            identifiers never enter the graph or this screen.
          </p>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Aliases + fan-out */}
        <Card>
          <CardHeader
            title="Name variants"
            subtitle={`${fp.aliases.length} variant${fp.aliases.length === 1 ? "" : "s"} planned for the query fan-out`}
          />
          <div className="space-y-2 px-4 pb-4 pt-2">
            {fp.aliases.map((al) => (
              <div
                key={al.value}
                className="flex items-center justify-between rounded-md border border-rule px-2.5 py-1.5"
              >
                <span className="font-mono text-[13px] text-ink">{al.value}</span>
                <span className="flex items-center gap-2 text-[11px] text-ink-tertiary">
                  <Chip tone="muted">{ALIAS_KIND_LABEL[al.kind]}</Chip>
                  <span className="tabular">{fmtPct(al.confidence)}</span>
                </span>
              </div>
            ))}
            <p className="text-[11px] text-ink-tertiary">
              Each variant seeds its own queries across courts, registries and media.
            </p>
          </div>
        </Card>

        {/* Linked entities */}
        <Card>
          <CardHeader
            title="Linked companies"
            subtitle="Entities and roles anchored to this person"
          />
          <div className="space-y-2 px-4 pb-4 pt-2">
            {fp.linkedEntities.map((e) => (
              <div key={e.id} className="rounded-md border border-rule px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-ink">{e.name}</span>
                  {e.status === "struck_off" ? (
                    <Chip tone="attention">struck off</Chip>
                  ) : e.status ? (
                    <Chip tone="muted">{e.status}</Chip>
                  ) : null}
                </div>
                <div className="mt-0.5 text-[11px] text-ink-secondary">
                  {RELATION_LABEL[e.relation] ?? e.relation}
                  {e.from ? ` · ${e.from}` : ""}
                  {e.to ? ` to ${e.to}` : e.from ? " to present" : ""}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-ink-tertiary">{e.id}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Early search (speculative wave A) */}
        <Card>
          <CardHeader
            title="Early search"
            subtitle="Speculative wave-A results — staged, not yet committed"
          />
          <div className="space-y-2 px-4 pb-4 pt-2 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="text-ink-secondary">Sanctions and watchlists</span>
              {spec?.sanctions === "hit" ? (
                <span className="inline-flex items-center gap-1.5 text-magenta">
                  <AttentionDot /> Possible match
                </span>
              ) : (
                <span className="text-verdict-clear">No match</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-secondary">Registry entities</span>
              <span className="tabular text-ink">{spec?.registryEntities ?? 0} found</span>
            </div>
          </div>
        </Card>

        {/* Flags + DID-D draft */}
        <Card>
          <CardHeader title="Footprint flags" subtitle="Declared identity (DID-D) draft summary" />
          <div className="space-y-3 px-4 pb-4 pt-2">
            <div className="flex flex-wrap gap-1.5">
              {fp.flags.length === 0 ? (
                <span className="text-[12px] text-ink-secondary">None</span>
              ) : (
                fp.flags.map((f) => (
                  <Chip key={f} tone="attention">
                    {FLAG_LABEL[f] ?? f}
                  </Chip>
                ))
              )}
            </div>
            <div className="rounded-md border border-rule bg-survey/60 px-2.5 py-2 text-[12px]">
              <div className="mb-1 font-medium text-ink">Declared identity (draft)</div>
              <div className="text-ink-secondary">
                {fp.canonicalName} · {c.subject.subjectType}
                {c.subject.jurisdiction ? ` · ${c.subject.jurisdiction}` : ""}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(c.subject.declaredIdentifiers ?? []).map((id) => (
                  <span key={id.type} className="font-mono text-[11px] text-ink-tertiary">
                    {id.type} {id.value}
                  </span>
                ))}
              </div>
              <div className="mt-1 text-[11px] text-ink-tertiary">
                On approval, provisional declared (DID-D) and discovered (DID-S)
                identities are minted.
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Sources chip row */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-tertiary">
        <span>Anchored from:</span>
        <TierMark tier="T1" />
        <span>registries</span>
        <TierMark tier="T4" />
        <span>supplied documents</span>
      </div>

      {/* Gate action */}
      <GateReview
        caseId={c.id}
        gate="G1"
        approveLabel="Approve identity details"
        blocked={
          disputed > 0
            ? `Resolve ${disputed} disputed detail${disputed === 1 ? "" : "s"} before approving`
            : undefined
        }
      />
    </div>
  );
}
