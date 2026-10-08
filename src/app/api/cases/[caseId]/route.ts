/**
 * /api/cases/[caseId] — fetch (GET) or delete (DELETE) one case.
 * Next 16: `params` is a Promise and must be awaited.
 */
import { NextResponse } from "next/server";
import { getCaseById } from "@/lib/data";
import { deleteCase } from "@/lib/kg/store";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params;
  const nemoCase = await getCaseById(caseId);
  if (!nemoCase) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }
  return NextResponse.json(nemoCase);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params;
  await deleteCase(caseId);
  return NextResponse.json({ ok: true });
}
