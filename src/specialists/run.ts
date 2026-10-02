import { findingId, type Finding } from "../findings";
import type { Specialist, SpecialistContext } from "./types";

/** Run a specialist; a crash becomes one visible note — a broken reviewer must never look like a clean bill of health. */
export async function runSpecialist(s: Specialist, ctx: SpecialistContext): Promise<Finding[]> {
  try {
    return await s.run(ctx);
  } catch (e) {
    const message = `The ${s.label} reviewer failed to run: ${e instanceof Error ? e.message : String(e)}`;
    return [
      {
        id: findingId(s.id, "specialist_failed", undefined, message.slice(0, 60)),
        specialist: s.id,
        severity: "info",
        title: `${s.label} reviewer did not complete`,
        message,
        citations: [],
        rule: "specialist_failed",
        kind: "HEURISTIC",
      },
    ];
  }
}
