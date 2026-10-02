/**
 * Clef = Cloudflare's first-party decision model (@cf/cloudflare/clef, clef-flash). It returns typed answers with
 * probabilities (noul = yes/no, choice, score) that code can branch on — it does not write prose. Billed in Workers AI
 * Neurons, so it sits inside the free daily allowance (unlike the third-party Jev model used in Episode 5).
 */

export type ClefQuestion =
  | { type: "noul"; instructions: string }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

/** Minimal slice of the Workers AI binding. */
export interface AiBinding {
  run(model: string, input: unknown, options?: unknown): Promise<any>;
}

export async function clefDecide(
  ai: AiBinding,
  state: string,
  questions: Record<string, ClefQuestion>,
  opts: { model?: "clef" | "clef-flash"; images?: string[] } = {},
): Promise<Record<string, any>> {
  const model = opts.model ?? "clef-flash";
  const input: Record<string, unknown> = { model, state, questions };
  if (opts.images?.length) input.images = opts.images;
  const res = await ai.run(`@cf/cloudflare/${model}`, input);
  // Direct binding calls return {model, answers, usage}; tolerate a {result:{...}} envelope too (Jev was wrapped via the gateway).
  const body = res?.answers ? res : res?.result;
  if (!body?.answers) throw new Error("Clef returned no answers");
  return body.answers;
}

/** One yes/no question per specialist: "does this change need that reviewer?" */
export const SPECIALIST_QUESTIONS: Record<string, string> = {
  privacy: "Could this change affect how personal information is collected, logged, stored, shared, or tracked?",
  licensing: "Does this change add or update third-party dependencies, or add new source files?",
  casl: "Does this change send, template, or schedule email or text messages to people?",
  "ai-governance": "Does this change add or modify AI, LLM, or machine-learning model usage, prompts, or model data flows?",
  "sensitive-data": "Could this change touch payment card data or personal health information?",
  "change-control": "Does this change CI/CD pipelines, infrastructure, authentication, or deployment configuration?",
};

export interface TriageResult {
  run: string[];
  tier: "clef" | "llama" | "fail-open";
  probs: Record<string, number>;
}

const BORDERLINE_BAND = 0.15;
const LLAMA = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

function questionsFor(ids: string[]): Record<string, ClefQuestion> {
  return Object.fromEntries(
    ids.map((id) => [`needs_${id}`, { type: "noul", instructions: SPECIALIST_QUESTIONS[id] ?? `Is this change relevant to ${id}?` } as ClefQuestion]),
  );
}

function probsFrom(answers: Record<string, any>, ids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) {
    const p = answers[`needs_${id}`]?.noul;
    out[id] = typeof p === "number" ? p : 1; // missing answer → be conservative and run the specialist
  }
  return out;
}

function extractText(res: any): string {
  const r = res?.response ?? res?.choices?.[0]?.message?.content ?? res?.result?.response ?? "";
  return typeof r === "string" ? r : JSON.stringify(r);
}

function parseJsonObject(text: string): Record<string, unknown> {
  const stripped = text.replace(/```(?:json)?/gi, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in model reply");
  return JSON.parse(stripped.slice(start, end + 1));
}

/** Decide which specialists to wake. Tiers: clef-flash (+ full clef for borderline) → Llama JSON → fail open (run all). */
export async function triage(ai: AiBinding, summary: string, specialists: string[], threshold: number): Promise<TriageResult> {
  try {
    const answers = await clefDecide(ai, summary, questionsFor(specialists), { model: "clef-flash" });
    const probs = probsFrom(answers, specialists);

    const borderline = specialists.filter((id) => Math.abs(probs[id] - threshold) <= BORDERLINE_BAND && probs[id] !== 1);
    if (borderline.length) {
      try {
        const refined = await clefDecide(ai, summary, questionsFor(borderline), { model: "clef" });
        Object.assign(probs, probsFrom(refined, borderline));
      } catch {
        /* keep the flash answer */
      }
    }
    return { run: specialists.filter((id) => probs[id] >= threshold), tier: "clef", probs };
  } catch {
    /* fall through to the free generative judgement */
  }

  try {
    const res = await ai.run(LLAMA, {
      max_tokens: 200,
      messages: [
        { role: "system", content: "You route code changes to reviewers. Reply with ONLY a JSON object mapping each reviewer id to a probability from 0 to 1 that it should review the change." },
        { role: "user", content: `Reviewers:\n${specialists.map((id) => `- ${id}: ${SPECIALIST_QUESTIONS[id] ?? id}`).join("\n")}\n\nChange:\n${summary}` },
      ],
    });
    const obj = parseJsonObject(extractText(res));
    const probs = Object.fromEntries(specialists.map((id) => [id, Number.isFinite(Number(obj[id])) ? Number(obj[id]) : 1]));
    return { run: specialists.filter((id) => probs[id] >= threshold), tier: "llama", probs };
  } catch {
    return { run: [...specialists], tier: "fail-open", probs: Object.fromEntries(specialists.map((id) => [id, 1])) };
  }
}
