"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/primitives";
import { cn, LEVEL_LABEL } from "@/lib/ui";
import type { CaseLevel, SubjectIntake } from "@/lib/types";

const SUBJECT_TYPES: { value: string; label: string }[] = [
  { value: "FOUNDER", label: "Founder" },
  { value: "MANAGER", label: "Fund manager" },
  { value: "LP", label: "Limited partner" },
  { value: "CO_INVESTOR", label: "Co-investor" },
];

const PURPOSES = [
  "Seed investment diligence",
  "Series A investment diligence",
  "Growth / buyout diligence",
  "LP onboarding",
  "Co-investor check",
  "Accelerator intake",
  "Portfolio monitoring",
];

const LEVELS: { value: CaseLevel; includes: string }[] = [
  { value: "L1", includes: "Core registries and sanctions. No questionnaire required." },
  { value: "L2", includes: "All seven questions, six domains, one-hop associates, monitoring." },
  { value: "L3", includes: "Everything in Standard, plus deeper associate checks and a wider source set." },
];

const STEPS = [
  { n: 1, label: "Subject" },
  { n: 2, label: "Purpose" },
  { n: 3, label: "Documents" },
  { n: 4, label: "Declaration" },
  { n: 5, label: "Depth" },
];

const QUESTIONNAIRE_FIELDS = [
  "Previous ventures and outcomes",
  "Litigation as a party",
  "PEP status",
];

function fieldClass() {
  return "w-full rounded-md border border-rule bg-survey px-3 py-2 text-[13px] text-ink placeholder:text-ink-tertiary focus:border-fathom focus:outline-none";
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[12px] font-medium text-ink-secondary">
      {children}
    </label>
  );
}

function Section({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-fathom text-[11px] font-medium text-white tabular">
          {n}
        </span>
        <h2 className="font-display text-ink" style={{ fontWeight: 600, fontSize: 15 }}>
          {title}
        </h2>
      </div>
      {hint ? <p className="mb-3 text-[12px] text-ink-secondary">{hint}</p> : null}
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

export default function NewCheckPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [otherNames, setOtherNames] = useState("");
  const [subjectType, setSubjectType] = useState("FOUNDER");
  const [org, setOrg] = useState("");
  const [jurisdiction, setJurisdiction] = useState("IN");
  const [city, setCity] = useState("");
  const [din, setDin] = useState("");
  const [pan, setPan] = useState("");

  const [purpose, setPurpose] = useState(PURPOSES[0]);
  const [dealContext, setDealContext] = useState("");
  const [legalBasis, setLegalBasis] = useState("Legitimate interest");

  const [docText, setDocText] = useState("");

  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [level, setLevel] = useState<CaseLevel>("L2");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("A full name is required to start a check.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const declaredIdentifiers: { type: string; value: string }[] = [];
    if (din.trim()) declaredIdentifiers.push({ type: "DIN", value: din.trim() });
    if (pan.trim()) declaredIdentifiers.push({ type: "PAN", value: pan.trim() });

    const questionnaire = QUESTIONNAIRE_FIELDS.filter(
      (f) => (answers[f] ?? "").trim(),
    ).map((f) => ({ field: f, answer: answers[f].trim() }));

    const intake: SubjectIntake = {
      name: name.trim(),
      purpose,
      dealContext: dealContext.trim() || undefined,
      subjectType,
      jurisdiction: jurisdiction.trim() || undefined,
      declaredIdentifiers: declaredIdentifiers.length
        ? declaredIdentifiers
        : undefined,
      documents: docText.trim()
        ? [{ name: "Pasted document", kind: "other", text: docText.trim() }]
        : undefined,
      questionnaire: questionnaire.length ? questionnaire : undefined,
    };

    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...intake, level }),
      });
      if (!res.ok) {
        throw new Error(`The server rejected the check (${res.status}).`);
      }
      const data = (await res.json()) as { id?: string };
      if (!data.id) throw new Error("The server did not return a check id.");
      router.push(`/cases/${data.id}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not start the check. Try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <form onSubmit={submit} className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex items-center gap-3">
          <Link href="/cases" className="text-[12px] text-ink-tertiary hover:text-ink">
            ← Checks
          </Link>
          <h1 className="font-display text-ink" style={{ fontWeight: 800, fontSize: 22 }}>
            Start a check
          </h1>
        </div>
        <p className="mt-1 text-[13px] text-ink-secondary">
          Give NEMO what it needs to fix the subject&apos;s identity and scope
          the survey. Identifiers go straight to the vault.
        </p>

        <div className="mt-6 grid gap-6 md:grid-cols-[180px_1fr]">
          {/* Step rail */}
          <nav className="hidden md:block">
            <ol className="sticky top-4 space-y-1">
              {STEPS.map((s) => (
                <li
                  key={s.n}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-ink-secondary"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-rule text-[11px] tabular">
                    {s.n}
                  </span>
                  {s.label}
                </li>
              ))}
            </ol>
          </nav>

          {/* Steps */}
          <div className="space-y-5">
            <Section n={1} title="Who are you checking?">
              <div>
                <Label>Full name</Label>
                <input
                  className={fieldClass()}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Rahul Kumar Sharma"
                  autoFocus
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Other names</Label>
                  <input
                    className={fieldClass()}
                    value={otherNames}
                    onChange={(e) => setOtherNames(e.target.value)}
                    placeholder="R. Sharma (comma-separated)"
                  />
                </div>
                <div>
                  <Label>Organisation</Label>
                  <input
                    className={fieldClass()}
                    value={org}
                    onChange={(e) => setOrg(e.target.value)}
                    placeholder="Acme Robotics Pvt Ltd"
                  />
                </div>
              </div>
              <div>
                <Label>Role</Label>
                <div className="flex flex-wrap gap-2">
                  {SUBJECT_TYPES.map((t) => (
                    <button
                      type="button"
                      key={t.value}
                      onClick={() => setSubjectType(t.value)}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-[12px]",
                        subjectType === t.value
                          ? "border-fathom bg-fathom text-white"
                          : "border-rule text-ink-secondary hover:bg-shoal/40",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Country</Label>
                  <input
                    className={fieldClass()}
                    value={jurisdiction}
                    onChange={(e) => setJurisdiction(e.target.value)}
                    placeholder="IN"
                  />
                </div>
                <div>
                  <Label>City</Label>
                  <input
                    className={fieldClass()}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Bengaluru"
                  />
                </div>
              </div>
              <div>
                <Label>Known identifiers</Label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <input
                    className={cn(fieldClass(), "font-mono")}
                    value={din}
                    onChange={(e) => setDin(e.target.value)}
                    placeholder="DIN"
                    type="password"
                    autoComplete="off"
                  />
                  <input
                    className={cn(fieldClass(), "font-mono")}
                    value={pan}
                    onChange={(e) => setPan(e.target.value)}
                    placeholder="PAN"
                    type="password"
                    autoComplete="off"
                  />
                </div>
                <p className="mt-1 text-[11px] text-ink-tertiary">
                  Sent straight to the vault and replaced by tokens. Never stored
                  in the clear.
                </p>
              </div>
            </Section>

            <Section
              n={2}
              title="Why are you checking?"
              hint="The purpose and legal basis set the depth and what NEMO is allowed to do."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Purpose</Label>
                  <select
                    className={fieldClass()}
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                  >
                    {PURPOSES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Legal basis</Label>
                  <select
                    className={fieldClass()}
                    value={legalBasis}
                    onChange={(e) => setLegalBasis(e.target.value)}
                  >
                    <option>Legitimate interest</option>
                    <option>Subject consent</option>
                    <option>Legal obligation</option>
                  </select>
                </div>
              </div>
              <div>
                <Label>Deal context (internal only)</Label>
                <textarea
                  className={cn(fieldClass(), "min-h-20 resize-y")}
                  value={dealContext}
                  onChange={(e) => setDealContext(e.target.value)}
                  placeholder="Kept internal. Never sent to any source."
                />
              </div>
            </Section>

            <Section
              n={3}
              title="Documents"
              hint="Paste the text of a CV, pitch deck or declaration. NEMO parses it in a sealed sandbox and extracts claims to check."
            >
              <div>
                <Label>Paste document text</Label>
                <textarea
                  className={cn(fieldClass(), "min-h-32 resize-y font-serif")}
                  value={docText}
                  onChange={(e) => setDocText(e.target.value)}
                  placeholder="Paste CV / deck / declaration text here…"
                />
              </div>
            </Section>

            <Section
              n={4}
              title="Self-declaration"
              hint="A few questions the subject answers up front. NEMO compares these against what it discovers."
            >
              {QUESTIONNAIRE_FIELDS.map((f) => (
                <div key={f}>
                  <Label>{f}</Label>
                  <input
                    className={fieldClass()}
                    value={answers[f] ?? ""}
                    onChange={(e) =>
                      setAnswers((a) => ({ ...a, [f]: e.target.value }))
                    }
                    placeholder={
                      f === "PEP status"
                        ? "e.g. Not a politically exposed person"
                        : "Leave blank if not applicable"
                    }
                  />
                </div>
              ))}
            </Section>

            <Section
              n={5}
              title="Depth"
              hint="NEMO's policy suggests a depth from the purpose and sector. You can raise it; lowering needs a compliance approver."
            >
              <div className="space-y-2">
                {LEVELS.map((l) => (
                  <button
                    type="button"
                    key={l.value}
                    onClick={() => setLevel(l.value)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left",
                      level === l.value
                        ? "border-fathom bg-shoal/40"
                        : "border-rule hover:bg-shoal/20",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        level === l.value ? "border-fathom" : "border-rule",
                      )}
                    >
                      {level === l.value ? (
                        <span className="h-2 w-2 rounded-full bg-fathom" />
                      ) : null}
                    </span>
                    <span>
                      <span className="block text-[13px] font-medium text-ink">
                        {LEVEL_LABEL[l.value]}
                      </span>
                      <span className="block text-[12px] text-ink-secondary">
                        {l.includes}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </Section>

            {error ? (
              <div
                className="rounded-md border border-rule px-4 py-3 text-[13px]"
                style={{ color: "var(--verdict-redflag)", borderColor: "var(--verdict-redflag)" }}
              >
                {error}
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2 pb-4">
              <Link
                href="/cases"
                className="rounded-md border border-rule px-4 py-2 text-[13px] text-ink-secondary hover:bg-shoal/40"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-fathom px-5 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? "Starting…" : "Start check"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
