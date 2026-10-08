"use client";

/**
 * Ask NEMO (UI spec §6.12): question answering over published reports and
 * graphs. Posts to POST /api/ask { caseId?, question } -> { answer, citations }.
 * The answer renders with citation chips (chunk/node + as-of). Live answers
 * need ANTHROPIC_API_KEY; without it the API returns grounded, templated
 * replay answers. Wrapped in AppShell.
 */
import { useRef, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Chip } from "@/components/ui/primitives";
import { cn } from "@/lib/ui";

// The seeded demo case (src/lib/seed/rahulSharma.ts). The data layer is
// server-only, so the id is referenced here as a constant.
const SEED_CASE_ID = "case_seed_rahul";

interface Citation {
  chunkId?: string;
  node?: string;
  asOf?: string;
}
interface Turn {
  role: "you" | "nemo";
  text: string;
  citations?: Citation[];
  pending?: boolean;
}

const SCOPES = [
  { id: "all", label: "All my checks", caseId: undefined as string | undefined },
  { id: "seed", label: "Rahul Sharma check", caseId: SEED_CASE_ID },
];

const EXAMPLES = [
  "Has he ever been debarred by a regulator?",
  "What did the exit claim turn out to be?",
  "Is there any pending litigation naming him?",
  "How consistent is what he declared with the record?",
];

export default function AskPage() {
  const [scope, setScope] = useState(SCOPES[1]);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setTurns((t) => [...t, { role: "you", text: q }, { role: "nemo", text: "", pending: true }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId: scope.caseId, question: q }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { answer: string; citations?: Citation[] } = await res.json();
      setTurns((t) => {
        const next = [...t];
        next[next.length - 1] = {
          role: "nemo",
          text: data.answer,
          citations: data.citations ?? [],
        };
        return next;
      });
    } catch {
      setTurns((t) => {
        const next = [...t];
        next[next.length - 1] = {
          role: "nemo",
          text:
            "I couldn't reach the answering service. Live answers need ANTHROPIC_API_KEY; otherwise NEMO replays grounded answers from the seeded case.",
        };
        return next;
      });
    } finally {
      setBusy(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    }
  }

  return (
    <AppShell>
      <div className="mx-auto flex h-[calc(100vh-3rem)] max-w-3xl flex-col p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-ink" style={{ fontWeight: 800, fontSize: 20 }}>
            Ask NEMO
          </h1>
          <div className="flex items-center gap-2 text-[12px] text-ink-secondary">
            <span className="text-ink-tertiary">Ask about</span>
            <select
              value={scope.id}
              onChange={(e) => setScope(SCOPES.find((s) => s.id === e.target.value) ?? SCOPES[0])}
              className="rounded-md border border-rule bg-sheet px-2 py-1 text-[12px] text-ink"
            >
              {SCOPES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-1 text-[12px] text-ink-secondary">
          Answers are drawn only from checks you can see, with citations. When NEMO
          can&rsquo;t find something in those checks, it says so.
        </p>

        {/* Conversation */}
        <div
          ref={scrollRef}
          className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto rounded-xl border border-rule bg-sheet p-4"
        >
          {turns.length === 0 ? (
            <div>
              <div className="text-[12px] text-ink-tertiary">Try asking</div>
              <div className="mt-2 flex flex-col gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => ask(ex)}
                    className="rounded-md border border-rule px-3 py-2 text-left text-[13px] text-ink hover:border-fathom hover:bg-shoal/30"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((t, i) => (
              <div key={i} className={cn("flex", t.role === "you" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-3 py-2 text-[13px]",
                    t.role === "you"
                      ? "bg-fathom text-white"
                      : "border border-rule bg-survey/60 text-ink",
                  )}
                >
                  {t.pending ? (
                    <span className="text-ink-tertiary">Searching the checks you can see…</span>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap leading-relaxed">{t.text}</p>
                      {t.citations && t.citations.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {t.citations.map((ci, j) => (
                            <Chip key={j} tone="muted">
                              <span className="font-mono text-[10px]">
                                {ci.node ?? ci.chunkId ?? `source ${j + 1}`}
                              </span>
                              {ci.asOf ? <span className="tabular"> · {ci.asOf}</span> : null}
                            </Chip>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="mt-3 flex items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            className="min-w-0 flex-1 rounded-md border border-rule bg-sheet px-3 py-2 text-[13px] text-ink"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-md bg-fathom px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Ask
          </button>
        </form>
      </div>
    </AppShell>
  );
}
