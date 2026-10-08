"use client";

/**
 * Client review actions for gate G1 (identity check) and G2 (final review).
 * Posts to POST /api/cases/:id/review { gate, action, crs?, reviewer?, rationale? }
 * and refreshes the server component on success. Primary actions use bg-fathom;
 * magenta is reserved for attention, never for buttons (UI-020).
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Question, Verdict } from "@/lib/types";
import { QUESTION_LABEL } from "@/lib/types";
import { VERDICT_LABEL } from "@/lib/ui";

type Action = "approve" | "request_change";
const REVIEWER = "analyst_17";

const VERDICTS: Verdict[] = [
  "CLEAR",
  "CONCERNS",
  "RED_FLAG",
  "INSUFFICIENT_COVERAGE",
  "STOP",
];

export function GateReview({
  caseId,
  gate,
  approveLabel,
  overridable = false,
  questions = [],
  blocked,
}: {
  caseId: string;
  gate: "G1" | "G2";
  approveLabel: string;
  /** G2: allow a verdict override panel. */
  overridable?: boolean;
  questions?: Question[];
  /** When set, Approve is disabled and the reason is shown. */
  blocked?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [mode, setMode] = useState<null | "change" | "override">(null);
  const [comment, setComment] = useState("");
  const [rationale, setRationale] = useState("");
  const [ovrQ, setOvrQ] = useState<Question | "">(questions[0] ?? "");
  const [ovrV, setOvrV] = useState<Verdict>("CONCERNS");

  async function send(action: Action, body: Record<string, unknown>) {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gate, action, reviewer: REVIEWER, ...body }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(
        action === "approve"
          ? gate === "G1"
            ? "Identity details approved."
            : "Report approved."
          : "Change requested — NEMO is updating the case.",
      );
      setMode(null);
      setComment("");
      setRationale("");
      router.refresh();
    } catch {
      setStatus("Could not reach the review service. (API not running yet.)");
    } finally {
      setBusy(false);
    }
  }

  const btnPrimary =
    "rounded-md bg-fathom px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50";
  const btnGhost =
    "rounded-md border border-rule px-3 py-1.5 text-[12px] text-ink-secondary hover:bg-shoal/40 disabled:opacity-50";

  return (
    <div className="rounded-xl border border-rule bg-sheet p-3 shadow-[var(--shadow-sheet)]">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btnPrimary}
          disabled={busy || !!blocked}
          title={blocked ?? undefined}
          onClick={() => send("approve", {})}
        >
          {approveLabel}
        </button>
        <button
          type="button"
          className={btnGhost}
          disabled={busy}
          onClick={() => setMode(mode === "change" ? null : "change")}
        >
          Request a change
        </button>
        {overridable ? (
          <button
            type="button"
            className={btnGhost}
            disabled={busy}
            onClick={() => setMode(mode === "override" ? null : "override")}
          >
            Override verdict
          </button>
        ) : null}
        {blocked ? (
          <span className="text-[11px] text-ink-tertiary">{blocked}</span>
        ) : null}
      </div>

      {mode === "change" ? (
        <div className="mt-3">
          <label className="mb-1 block text-[11px] text-ink-secondary">
            What should NEMO change? Your note is parsed into a change request.
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-rule bg-survey px-2.5 py-2 text-[13px] text-ink"
            placeholder='e.g. "Add the strike-off date to the summary"'
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={busy || !comment.trim()}
              onClick={() =>
                send("request_change", {
                  crs: [{ type: "WORDING", rawComment: comment.trim() }],
                })
              }
            >
              Run change
            </button>
            <button type="button" className={btnGhost} onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {mode === "override" ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={ovrQ}
              onChange={(e) => setOvrQ(e.target.value as Question)}
              className="rounded-md border border-rule bg-survey px-2 py-1.5 text-[12px] text-ink"
            >
              {questions.map((q) => (
                <option key={q} value={q}>
                  {QUESTION_LABEL[q]}
                </option>
              ))}
            </select>
            <select
              value={ovrV}
              onChange={(e) => setOvrV(e.target.value as Verdict)}
              className="rounded-md border border-rule bg-survey px-2 py-1.5 text-[12px] text-ink"
            >
              {VERDICTS.map((v) => (
                <option key={v} value={v}>
                  {VERDICT_LABEL[v]}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-rule bg-survey px-2.5 py-2 text-[13px] text-ink"
            placeholder="Rationale (required for an override)"
          />
          <div className="flex gap-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={busy || !ovrQ || !rationale.trim()}
              onClick={() =>
                send("request_change", {
                  rationale: rationale.trim(),
                  crs: [
                    {
                      type: "MATERIALITY_OVERRIDE",
                      target: { question: ovrQ },
                      instruction: { verdict: ovrV },
                      rawComment: rationale.trim(),
                    },
                  ],
                })
              }
            >
              Record override
            </button>
            <button type="button" className={btnGhost} onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {status ? (
        <p className="mt-2 text-[11px] text-ink-secondary" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
