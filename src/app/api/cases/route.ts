/**
 * /api/cases — list all cases (GET) and create a case (POST).
 *
 * GET  → CaseSummary[]
 * POST { ...SubjectIntake, level? } → { id }  (case created in CREATED state)
 */
import { NextResponse } from "next/server";
import { getCaseSummaries } from "@/lib/data";
import { newCaseId, saveCase } from "@/lib/kg/store";
import { deriveLevel } from "@/lib/agents/casePlanner";
import { isLiveEnabled } from "@/lib/agents/client";
import type { CaseLevel, NemoCase, SubjectIntake } from "@/lib/types";

export async function GET() {
  const summaries = await getCaseSummaries();
  return NextResponse.json(summaries);
}

interface CreateBody extends Partial<SubjectIntake> {
  level?: CaseLevel;
}

export async function POST(req: Request) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.name || !body.purpose) {
    return NextResponse.json(
      { error: "A subject name and purpose are required." },
      { status: 400 },
    );
  }

  const subject: SubjectIntake = {
    name: String(body.name),
    purpose: String(body.purpose),
    dealContext: body.dealContext,
    subjectType: body.subjectType ?? "FOUNDER",
    jurisdiction: body.jurisdiction,
    declaredIdentifiers: body.declaredIdentifiers,
    documents: body.documents,
    questionnaire: body.questionnaire,
  };

  const level = deriveLevel(subject, body.level);
  const now = new Date().toISOString();
  const nemoCase: NemoCase = {
    id: newCaseId(),
    subject,
    level,
    state: "CREATED",
    createdAt: now,
    updatedAt: now,
    findings: [],
    claims: [],
    coverage: [],
    questionScores: {},
    verdicts: {},
    referenceCalls: [],
    changeRequests: [],
    reviews: [],
    events: [],
    mode: isLiveEnabled() ? "live" : "replay",
  };

  await saveCase(nemoCase);
  return NextResponse.json({ id: nemoCase.id }, { status: 201 });
}
