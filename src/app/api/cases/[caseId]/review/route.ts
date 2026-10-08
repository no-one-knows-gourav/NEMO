/**
 * /api/cases/[caseId]/review — POST a gate decision (G1 or G2).
 *
 * Body: { gate:"G1"|"G2", action:"approve"|"request_change", crs?, reviewer?,
 *         rationale? }
 * On G1 approve → state COLLECTING (ready for the next run).
 * On G2 approve → a DID-V is minted and state becomes MONITORING.
 * Returns { ok:true, case }.
 * Next 16: `params` is a Promise and must be awaited.
 */
import { NextResponse } from "next/server";
import { applyReview, type ReviewBody } from "@/lib/agents/orchestrator";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params;

  let body: ReviewBody;
  try {
    body = (await req.json()) as ReviewBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    (body.gate !== "G1" && body.gate !== "G2") ||
    (body.action !== "approve" && body.action !== "request_change")
  ) {
    return NextResponse.json(
      { error: "gate must be G1|G2 and action must be approve|request_change." },
      { status: 400 },
    );
  }

  const updated = await applyReview(caseId, body);
  if (!updated) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, case: updated });
}
