/**
 * Seeds the demo case into .data/cases.json and prints the computed verdicts,
 * disclosure metrics and coverage so we can sanity-check the engine output.
 * Run: `npm run seed`
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildSeedCase } from "../src/lib/seed/rahulSharma";
import { QUESTION_LABEL } from "../src/lib/types";

async function main() {
  const c = buildSeedCase();
  const dir = path.join(process.cwd(), ".data");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "cases.json");

  let existing: unknown[] = [];
  try {
    existing = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    existing = [];
  }
  const others = (existing as { id: string }[]).filter((x) => x.id !== c.id);
  await fs.writeFile(file, JSON.stringify([c, ...others], null, 2), "utf8");

  console.log(`Seeded ${c.subject.name} (${c.id}) → ${file}\n`);
  console.log("Verdicts:");
  for (const [q, v] of Object.entries(c.verdicts)) {
    const s = c.questionScores[q as keyof typeof c.questionScores];
    console.log(
      `  ${QUESTION_LABEL[q as keyof typeof QUESTION_LABEL].padEnd(22)} ${String(v).padEnd(22)} ` +
        `point=${s?.qPoint.toFixed(3)} cov=${s?.coverage.toFixed(2)} ef=${s?.ef.toFixed(3)}` +
        (s?.pattern ? " [PATTERN]" : "") +
        (s?.s1Override ? " [S1]" : ""),
    );
  }
  const d = c.disclosure!;
  console.log("\nDisclosure:");
  console.log(
    `  TM=${d.trust.toFixed(2)} (${d.trustBand})  DD=${d.disclosureDegree.toFixed(2)}  ` +
      `C=${d.consistency.toFixed(2)}  V=${d.verification.toFixed(2)}  δ=${d.dissimilarity.toFixed(2)}`,
  );
  const covRetrieved = c.coverage.filter(
    (r) => r.state === "FOUND_RETRIEVED" || r.state === "NOT_FOUND",
  ).length;
  console.log(
    `\nCoverage: ${covRetrieved}/${c.coverage.length} sources fully searched.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
