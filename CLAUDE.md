# NEMO — build conventions

NEMO is a multi-agent background-intelligence system for VC/PE/accelerator due
diligence. This repo is a **Next.js web prototype with a live multi-agent
pipeline**. Full spec in `docs/NEMO_PRD.md` (product/requirements) and
`docs/NEMO_UI_Spec.md` (screens, brand, copy). Requirement IDs like `FR-084`,
`UI-020`, `PRV-020` refer to those docs.

## Stack
- **Next.js 16** (App Router, `src/` dir), **React 19**, **TypeScript**, **Tailwind v4**.
- Next 16 gotchas: in pages and route handlers, `params`/`searchParams` are
  **Promises — `await` them**. `headers()`/`cookies()` are async. Route handlers
  live in `route.ts` (not alongside a `page.tsx` in the same segment).
- Run `npx tsc --noEmit` to typecheck. Do **not** start the dev server in an
  agent (the integrator runs it).

## The deterministic core is DONE — do not rewrite
- `src/lib/types.ts` — the shared type contract. Import from here; don't fork types.
- `src/lib/scoring/engine.ts` — PRD §8 scoring (validated against the §8.8
  worked example by `npm test`). Pure/deterministic. **Never** have an LLM
  produce scores; agents supply inputs (m, severity, status), the engine scores.
- `src/lib/scoring/disclosure.ts` — PRD §9 trust/disclosure.
- `src/lib/scoring/config.ts` — PRD Appendix A defaults.
- `src/lib/kg/store.ts` — case persistence + Commit-Service guards (one writer).
- `src/lib/data.ts` — **server-component read API** (`getCaseSummaries`,
  `getCaseById`); auto-seeds the demo case. Screens read through this.
- `src/lib/agents/client.ts` — Claude wrapper (`callAgentJson`, `isLiveEnabled`)
  with model tiers for A/B/C double-blind pairs. Falls back to replay when no
  `ANTHROPIC_API_KEY`.
- `src/lib/seed/rahulSharma.ts` — seeded demo case (PRD Appendix C trace).

## Design system (use tokens, never raw hex — UI spec §3.3)
- Tailwind color utilities are wired to NEMO tokens: `bg-survey`, `bg-sheet`,
  `text-ink`, `text-ink-secondary`, `text-ink-tertiary`, `bg-shoal`,
  `text-fathom`/`bg-fathom`, `text-magenta`, `border-rule`, and
  `text-verdict-clear` / `-concerns` / `-redflag` / `-unsurveyed`, `text-sev1…5`.
- Fonts: `font-display` (Archivo, brand headings), `font-serif` (Source Serif 4,
  report body; **italic = verbatim quoted source text**), `font-mono` (B612 Mono,
  digital IDs / machine lines). Add `tabular` class to numbers in scores/dates/tables.
- **chartMagenta has exactly one meaning: "a person needs to look at this"**
  (UI-020). Never use magenta for decoration or primary buttons. Primary action
  buttons use `bg-fathom`.
- Colour never carries meaning alone — always pair with glyph + label (A11Y-001).

## Reuse these primitives (don't reinvent)
- `src/components/shell/AppShell.tsx` — wrap every page: `<AppShell>…</AppShell>`.
- `src/components/brand/Logo.tsx` — `NemoLogo`, `NemoMark`.
- `src/components/ui/primitives.tsx` — `Card`, `CardHeader`, `VerdictBadge`,
  `SeverityBars`, `TierMark`, `LevelBadge`, `Chip`, `AttentionDot`.
- `src/components/ui/score.tsx` — `ScoreInterval`, `CoverageSounding`, `StatProbe`.
- `src/lib/ui.ts` — `cn()`, label maps (`VERDICT_LABEL`, `SEVERITY_LABEL`,
  `STATE_LABEL`, `LEVEL_LABEL`, `TIER_LABEL`), `fmtPct`, `fmtNum`.

## Copy & terminology (UI spec §3.7) — use PLAIN words in the UI
Check (not case) · Depth: Light/Standard/Enhanced (not L1/L2/L3) · Identity check
(gate G1) · Final review (gate G2) · Identity details (fingerprint) · Declared vs
discovered (crossover) · Disclosure / Consistency score · Matter (event) · Finding
· Follow-up (resolve/probe) · Independent recheck (Red Team). Headings are
sentence case; no ALL-CAPS except "NEMO" and machine-readable lines. Allegations
are always worded as allegations ("named as respondent", never "committed").

## Privacy invariants
- Never put raw Tier-U identifiers (PAN/Aadhaar/passport/SSN) in UI text, logs,
  prompts or the KG. Show masked values only. `store.ts` enforces this on write.
