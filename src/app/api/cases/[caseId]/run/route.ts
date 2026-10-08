/**
 * /api/cases/[caseId]/run — POST streams the pipeline as Server-Sent Events.
 *
 * Each PipelineEvent from runPipeline() is written as `data: <json>\n\n`, with a
 * small delay between events so the UI animates. A final `{level:"done"}` event
 * carries the terminal case state before the stream closes.
 * Next 16: `params` is a Promise and must be awaited.
 */
import { runPipeline } from "@/lib/agents/orchestrator";
import { getCase } from "@/lib/kg/store";

export const dynamic = "force-dynamic";

const STEP_DELAY_MS = 350;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        for await (const ev of runPipeline(caseId)) {
          write(ev);
          await delay(STEP_DELAY_MS);
        }
        const finalCase = await getCase(caseId);
        write({ level: "done", data: { state: finalCase?.state ?? "UNKNOWN" } });
      } catch (err) {
        write({
          level: "error",
          message: err instanceof Error ? err.message : "Pipeline error.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
