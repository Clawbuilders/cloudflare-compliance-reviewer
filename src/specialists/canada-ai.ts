import { extractAiScreening, extractAutomatedDecisions, hasHumanReview, postingDisclosesAi } from "../extractors";
import { DECLARATIONS_PATH } from "./ai-governance";
import { policyFindings } from "./policy";
import type { Specialist } from "./types";

/**
 * Canada AI: the binding AI rules in Canada that code can show today (there is no federal AI act; AIDA lapsed in January 2025).
 *   - Quebec Law 25, s. 12.1: a decision about a person made by automated processing alone needs a notice and a human review route.
 *   - Ontario ESA 2000, s. 8.4(1) and O. Reg. 476/24: a public job posting must say if AI screens, assesses or selects applicants.
 *
 * The shape every specialist follows: extractors turn the diff into facts, policies/committee/canada_ai.rego decides.
 * Nothing here judges; it only gathers facts.
 */
export const canadaAi: Specialist = {
  id: "canada-ai",
  label: "Canada AI (Quebec Law 25 s. 12.1, Ontario ESA AI-in-hiring disclosure)",
  kind: "HEURISTIC",
  // Deterministic forcing: if either signal fires, this specialist runs even when triage skipped it.
  applies: (files) => extractAutomatedDecisions(files).length > 0 || extractAiScreening(files).length > 0,

  async run(ctx) {
    const facts = {
      automated_decisions: extractAutomatedDecisions(ctx.files),
      human_review_in_change: hasHumanReview(ctx.files),
      ai_screening: extractAiScreening(ctx.files),
      posting_discloses_ai: postingDisclosesAi(ctx.files),
      declarations: await readDeclarations(ctx.fetchFile),
    };
    return policyFindings(ctx.engine, "canada_ai", facts, "canada-ai", () => "HEURISTIC");
  },
};

/** The repo's compliance/ai-system.json as an object. Missing or invalid = {} (no declarations), so the rules still apply. */
async function readDeclarations(fetchFile: (path: string) => Promise<string | null>): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse((await fetchFile(DECLARATIONS_PATH)) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
