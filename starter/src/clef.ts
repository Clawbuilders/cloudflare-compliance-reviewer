/**
 * Clef is Cloudflare's first-party decision model: it answers typed questions with probabilities your code can branch on.
 * Here it asks one yes/no question — "does this change touch user-interface markup?" — so non-UI pull requests cost
 * almost nothing. Billed in Workers AI Neurons (inside the free daily allowance).
 */
export interface AiBinding {
  run(model: string, input: unknown, options?: unknown): Promise<any>;
}

export async function probabilityOfUiChange(ai: AiBinding, diffText: string): Promise<number> {
  const res = await ai.run("@cf/cloudflare/clef-flash", {
    model: "clef-flash",
    state: diffText,
    questions: {
      touches_ui: { type: "noul", instructions: "Does this change add or modify user-interface markup or styles (HTML, JSX, CSS)?" },
    },
  });
  const body = res?.answers ? res : res?.result;
  const p = body?.answers?.touches_ui?.noul;
  if (typeof p !== "number") throw new Error("Clef returned no touches_ui answer");
  return p;
}
