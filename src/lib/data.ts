/**
 * Server-side data access for screens (server components call these directly,
 * so the UI does not depend on the API routes existing). Auto-seeds the demo
 * case on first read so the app is never empty.
 */
import "server-only";
import {
  getCase,
  listCases,
  saveCase,
} from "@/lib/kg/store";
import { buildSeedCase, SEED_CASE_ID } from "@/lib/seed/rahulSharma";
import type { CaseSummary, NemoCase } from "@/lib/types";

let seeded = false;
async function ensureSeed() {
  if (seeded) return;
  seeded = true;
  const existing = await getCase(SEED_CASE_ID);
  if (!existing) {
    await saveCase(buildSeedCase());
  }
}

export async function getCaseSummaries(): Promise<CaseSummary[]> {
  await ensureSeed();
  return listCases();
}

export async function getCaseById(id: string): Promise<NemoCase | null> {
  await ensureSeed();
  return getCase(id);
}

export { SEED_CASE_ID };
