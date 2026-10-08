<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/nemo-logo-dark.svg">
    <img alt="NEMO" src="public/nemo-logo-light.svg" width="240">
  </picture>
</p>

<h1 align="center">NEMO</h1>

<p align="center"><b>Background intelligence for private capital.</b></p>

NEMO is a multi-agent system that vets the people behind a deal — founders, key
management, LPs, co-investors — and produces a decision-grade identity record, a
cited report, and a knowledge graph, keeping humans at the judgment points.

> ### 🚧 Status: in active development
> NEMO is an early-stage prototype. It **currently runs locally** on a developer
> machine (see [Run it](#run-it)). A **hosted cloud deployment is coming soon** —
> multi-tenant, with managed data stores, authentication and the live agent
> pipeline running server-side. Interfaces, scores and schemas may still change.

This repo is a **Next.js web prototype with a live multi-agent pipeline**, built
from the handoff docs in [`docs/`](docs/): the product requirements
(`NEMO_PRD.md`) and the UI/brand spec (`NEMO_UI_Spec.md`).

## What it does

Given a subject and their supplied documents, NEMO:

1. **Scopes** the check and records its legal basis (Case Planner + Policy Engine).
2. Builds and human-verifies an **identity fingerprint** (double-blind resolvers → Gate G1).
3. Extracts the subject's **claims**.
4. Collects public evidence across **Personal, Financial, Legal, Professional**.
5. **Matches, groups, classifies and scores** evidence with double-blind agent
   pairs and a deterministic scoring formula (never an LLM).
6. Resolves open items, **compiles** a report, and **red-teams** it.
7. Passes it through a second **human review** (Gate G2).
8. Publishes a signed **Digital ID**, a **report** (+ RAG chunks), and a **KG snapshot**,
   then keeps monitoring.

## The scoring engine is real

`src/lib/scoring/engine.ts` implements PRD Section 8 exactly — Strength of
Evidence, Risk Contribution, Error Factor, coverage, verdict bands and the
pattern rule — as pure, replayable code. It is validated against the PRD's own
worked example:

```bash
npm test     # PRD §8.8 — all assertions pass to 3 decimals
```

## Run it

```bash
npm install
npm run seed   # materialise the demo case into .data/
npm run dev    # http://localhost:3000
```

Open the seeded check **Rahul Sharma** (an L2 fintech-founder case from PRD
Appendix C). Walk the tabs: Overview → Identity (Gate G1) → Evidence map →
Declared vs discovered → Report (Gate G2) → Identity record. Then try **Ask NEMO**.

### Live vs replay mode

The pipeline runs **live** against Claude when an API key is present, and falls
back to a **seeded replay** otherwise, so the app is always demoable.

```bash
cp .env.local.example .env.local
# set ANTHROPIC_API_KEY=... then restart `npm run dev`
```

Start a new check and open its **Live run** tab to watch the agents work.
Double-blind A/B judge pairs use different Claude model families (PRD DB-3).

## Architecture

| Layer | Where | Notes |
|---|---|---|
| Shared types | `src/lib/types.ts` | The contract every layer codes against (PRD Appendix B) |
| Scoring | `src/lib/scoring/*` | Deterministic §8 engine + §9 disclosure/trust + Appendix A config |
| Knowledge graph / store | `src/lib/kg/store.ts` | Single-writer Commit Service; rejects raw Tier-U identifiers |
| Agent pipeline | `src/lib/agents/*` | Case Planner, fingerprinting, collectors, matchers A/B, classifier, claim verifier, red team, compiler, orchestrator |
| API | `src/app/api/*` | Case CRUD, SSE pipeline run, gate reviews, RAG Q&A |
| Screens | `src/app/*` | Home, Checks, Check workspace (Overview / Live run / Identity / Evidence map / Findings / Declared vs discovered / Coverage / Report), Identity records, Ask NEMO |
| Design system | `globals.css`, `src/components/*` | "Hydrographic survey" brand: soundings, coverage hatching, plate registration |

Conventions for contributors (and agents) are in [`CLAUDE.md`](CLAUDE.md).

## Privacy by construction

Raw unique identifiers (PAN, Aadhaar, passport, SSN) never enter the graph,
logs, prompts or the UI — only masked values and vault tokens. The store
enforces this on every write. `chartMagenta` has exactly one meaning in the UI:
*a person needs to look at this.*

---

*Prototype built from the NEMO v1.0 PRD and UI specification.*
