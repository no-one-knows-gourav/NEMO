import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { NemoMark } from "@/components/brand/Logo";
import {
  AttentionDot,
  Card,
  LevelBadge,
  VerdictBadge,
} from "@/components/ui/primitives";
import { CoverageSounding } from "@/components/ui/score";
import { getCaseSummaries } from "@/lib/data";
import { STATE_LABEL } from "@/lib/ui";
import type { CaseSummary } from "@/lib/types";
import {
  relativeTime,
  subjectTypeLabel,
} from "@/components/case/helpers";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const RUNNING_STATES = new Set([
  "SCOPED",
  "ANCHORING",
  "COLLECTING",
  "ASSESSING",
  "RESOLVING",
  "COMPILING",
  "RED_TEAM",
  "REDO",
  "PUBLISHING",
]);

export default async function HomePage() {
  const cases = await getCaseSummaries();
  const now = Date.now();

  const identityChecks = cases.filter((c) => c.state === "AWAIT_G1");
  const finalReviews = cases.filter(
    (c) => c.state === "AWAIT_G2" || c.state === "STOPPED",
  );
  const followUps = cases.filter((c) => c.unresolvedCount > 0);
  const running = cases.filter((c) => RUNNING_STATES.has(c.state));
  const recent = [...cases]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 6);

  const needsYou =
    identityChecks.length + finalReviews.length + followUps.length;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-6 md:py-8">
        {/* Greeting */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1
              className="font-display text-ink"
              style={{ fontWeight: 800, fontSize: 26 }}
            >
              {greeting()}, Saigourav
            </h1>
            <p className="mt-1 text-[13px] text-ink-secondary">
              {needsYou > 0
                ? `${needsYou} thing${needsYou === 1 ? "" : "s"} wait for you across ${cases.length} check${cases.length === 1 ? "" : "s"}.`
                : "Nothing is waiting on you right now."}
            </p>
          </div>
          <Link
            href="/cases/new"
            className="hidden shrink-0 items-center gap-2 rounded-md bg-fathom px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 sm:inline-flex"
          >
            <span className="text-[15px] leading-none">+</span> Start a check
          </Link>
        </div>

        {/* Needs you */}
        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-ink" style={{ fontWeight: 600, fontSize: 14 }}>
              Needs you
            </h2>
            <Link
              href="/review"
              className="text-[12px] text-fathom hover:underline"
            >
              See review queue →
            </Link>
          </div>
          <Card className="divide-y divide-rule overflow-hidden">
            {identityChecks.length === 0 &&
            finalReviews.length === 0 &&
            followUps.length === 0 ? (
              <div className="px-4 py-6 text-[13px] text-ink-secondary">
                Nothing needs a person right now. New gates and follow-ups will
                appear here.
              </div>
            ) : (
              <>
                {identityChecks.map((c) => (
                  <NeedsRow
                    key={c.id}
                    kind="Identity check"
                    href={`/cases/${c.id}/identity`}
                    c={c}
                    detail="waiting for identity check"
                    now={now}
                  />
                ))}
                {finalReviews.map((c) => (
                  <NeedsRow
                    key={c.id}
                    kind="Final review"
                    href={`/cases/${c.id}/report`}
                    c={c}
                    detail={
                      c.unresolvedCount > 0
                        ? `${c.unresolvedCount} unresolved item${c.unresolvedCount === 1 ? "" : "s"}`
                        : "ready for your decision"
                    }
                    now={now}
                  />
                ))}
                {followUps
                  .filter(
                    (c) =>
                      c.state !== "AWAIT_G1" && c.state !== "AWAIT_G2",
                  )
                  .map((c) => (
                    <NeedsRow
                      key={`fu-${c.id}`}
                      kind="Follow-up"
                      href={`/cases/${c.id}`}
                      c={c}
                      detail={`${c.unresolvedCount} open follow-up${c.unresolvedCount === 1 ? "" : "s"}`}
                      now={now}
                    />
                  ))}
              </>
            )}
          </Card>
        </section>

        {/* Running now */}
        {running.length > 0 ? (
          <section className="mt-6">
            <h2 className="mb-2 font-display text-ink" style={{ fontWeight: 600, fontSize: 14 }}>
              Running now
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {running.map((c) => (
                <Card key={c.id} className="p-4">
                  <Link href={`/cases/${c.id}/live`} className="block">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-ink" style={{ fontWeight: 600, fontSize: 14 }}>
                        {c.name}
                      </span>
                      <LevelBadge level={c.level} />
                    </div>
                    <div className="mt-1 text-[12px] text-ink-secondary">
                      {STATE_LABEL[c.state] ?? c.state}
                    </div>
                    <div className="mt-3">
                      <CoverageSounding coverage={progressFor(c.state)} />
                    </div>
                  </Link>
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        {/* Recent checks */}
        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-ink" style={{ fontWeight: 600, fontSize: 14 }}>
              Recent checks
            </h2>
            <Link href="/cases" className="text-[12px] text-fathom hover:underline">
              All checks →
            </Link>
          </div>
          <Card className="divide-y divide-rule overflow-hidden">
            {recent.map((c) => (
              <Link
                key={c.id}
                href={`/cases/${c.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-shoal/30"
              >
                <NemoMark size={18} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-ink">{c.name}</span>
                    {c.needsReview ? <AttentionDot /> : null}
                  </div>
                  <div className="text-[11px] text-ink-tertiary">
                    {subjectTypeLabel(c.subjectType)} · {STATE_LABEL[c.state] ?? c.state}
                  </div>
                </div>
                {c.topVerdict ? <VerdictBadge verdict={c.topVerdict} size="sm" /> : null}
                <span className="hidden w-20 shrink-0 text-right text-[11px] text-ink-tertiary tabular sm:block">
                  {relativeTime(c.updatedAt, now)}
                </span>
              </Link>
            ))}
          </Card>
        </section>

        {/* First-run / how it works strip */}
        <section className="mt-8">
          <Card className="guilloche p-5">
            <div className="text-[12px] text-ink-secondary">How NEMO works</div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink">
              {[
                "Scope",
                "Identity",
                "Identity check",
                "Search",
                "Assess",
                "Follow-up",
                "Recheck",
                "Report",
              ].map((s, i, arr) => (
                <span key={s} className="inline-flex items-center gap-2">
                  <span className="font-medium">{s}</span>
                  {i < arr.length - 1 ? (
                    <span className="text-ink-tertiary">→</span>
                  ) : null}
                </span>
              ))}
            </div>
            <p className="mt-2 max-w-2xl text-[12px] text-ink-secondary">
              A hydrographic survey of a person: NEMO fixes who someone is, sounds
              every relevant record, scores what it finds against seven questions,
              and brings a person in at two gates.
            </p>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}

/** A rough progress proxy from state, for the running-now coverage bar. */
function progressFor(state: string): number {
  const map: Record<string, number> = {
    SCOPED: 0.08,
    ANCHORING: 0.18,
    COLLECTING: 0.45,
    ASSESSING: 0.62,
    RESOLVING: 0.74,
    COMPILING: 0.86,
    RED_TEAM: 0.92,
    REDO: 0.8,
    PUBLISHING: 0.97,
  };
  return map[state] ?? 0.5;
}

function NeedsRow({
  kind,
  href,
  c,
  detail,
  now,
}: {
  kind: string;
  href: string;
  c: CaseSummary;
  detail: string;
  now: number;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3 hover:bg-shoal/30">
      <AttentionDot />
      <span className="w-28 shrink-0 text-[12px] font-medium text-ink">{kind}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{c.name}</span>
      <span className="hidden shrink-0 sm:block">
        <LevelBadge level={c.level} />
      </span>
      <span className="w-40 shrink-0 text-right text-[12px] text-ink-secondary">
        {detail}
      </span>
      <span className="hidden w-16 shrink-0 text-right text-[11px] text-ink-tertiary tabular md:block">
        {relativeTime(c.updatedAt, now)}
      </span>
    </Link>
  );
}
