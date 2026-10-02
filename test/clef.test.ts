import { describe, expect, it } from "vitest";
import { clefDecide, triage } from "../src/clef";

type Call = { model: string; input: any };
function fakeAi(handler: (model: string, input: any) => any) {
  const calls: Call[] = [];
  const ai = {
    async run(model: string, input: any) {
      calls.push({ model, input });
      return handler(model, input);
    },
  };
  return { ai: ai as any, calls };
}
const noul = (p: number) => ({ type: "noul", noul: p });
const clefReply = (probs: Record<string, number>) => ({
  model: "clef-flash",
  answers: Object.fromEntries(Object.entries(probs).map(([k, v]) => [k, noul(v)])),
  usage: { input_tokens: 10, output_tokens: 0 },
});
const SPECIALISTS = ["privacy", "licensing", "casl"];

describe("clefDecide", () => {
  it("calls the first-party Clef model with typed questions and returns answers", async () => {
    const { ai, calls } = fakeAi(() => clefReply({ a: 0.9 }));
    const out = await clefDecide(ai, "diff text", { a: { type: "noul", instructions: "q?" } });
    expect(calls[0].model).toBe("@cf/cloudflare/clef-flash");
    expect(calls[0].input).toMatchObject({ model: "clef-flash", state: "diff text" });
    expect(out.a.noul).toBe(0.9);
  });

  it("unwraps a {result:{answers}} envelope (the gateway wrapped Jev in Episode 5)", async () => {
    const { ai } = fakeAi(() => ({ result: clefReply({ a: 0.4 }) }));
    expect((await clefDecide(ai, "s", { a: { type: "noul", instructions: "q" } })).a.noul).toBe(0.4);
  });

  it("passes images through and throws on a malformed reply", async () => {
    const { ai, calls } = fakeAi(() => ({ nope: true }));
    await expect(clefDecide(ai, "s", { a: { type: "noul", instructions: "q" } }, { images: ["data:image/png;base64,AAA"] })).rejects.toThrow();
    expect(calls[0].input.images).toEqual(["data:image/png;base64,AAA"]);
  });
});

describe("triage", () => {
  it("runs only specialists at or above the threshold (tier clef)", async () => {
    const { ai } = fakeAi(() => clefReply({ needs_privacy: 0.9, needs_licensing: 0.05, needs_casl: 0.5 }));
    const t = await triage(ai, "summary", SPECIALISTS, 0.35);
    expect(t.tier).toBe("clef");
    expect(t.run).toEqual(["privacy", "casl"]);
    expect(t.probs.needs_licensing ?? t.probs.licensing).toBeCloseTo(0.05);
  });

  it("re-asks the full model only for borderline probabilities and uses its answer", async () => {
    const { ai, calls } = fakeAi((model) =>
      model.endsWith("clef-flash")
        ? clefReply({ needs_privacy: 0.9, needs_licensing: 0.3, needs_casl: 0.0 })
        : clefReply({ needs_licensing: 0.8 }),
    );
    const t = await triage(ai, "summary", SPECIALISTS, 0.35);
    expect(calls.map((c) => c.model)).toEqual(["@cf/cloudflare/clef-flash", "@cf/cloudflare/clef"]);
    expect(Object.keys(calls[1].input.questions)).toEqual(["needs_licensing"]);
    expect(t.run).toEqual(["privacy", "licensing"]);
  });

  it("keeps the flash answer when the borderline re-ask fails", async () => {
    const { ai } = fakeAi((model) => {
      if (model.endsWith("clef-flash")) return clefReply({ needs_privacy: 0.9, needs_licensing: 0.3, needs_casl: 0.0 });
      throw new Error("clef unavailable");
    });
    const t = await triage(ai, "s", SPECIALISTS, 0.35);
    expect(t.tier).toBe("clef");
    expect(t.run).toEqual(["privacy"]);
  });

  it("falls back to the Llama judgement when Clef fails (tier llama), tolerating OpenAI-style replies", async () => {
    const { ai } = fakeAi((model) => {
      if (model.includes("clef")) throw new Error("boom");
      return { choices: [{ message: { content: '```json\n{"privacy":0.8,"licensing":0.1,"casl":0.2}\n```' } }] };
    });
    const t = await triage(ai, "s", SPECIALISTS, 0.35);
    expect(t.tier).toBe("llama");
    expect(t.run).toEqual(["privacy"]);
  });

  it("fails open and runs every specialist when both tiers fail", async () => {
    const { ai } = fakeAi(() => {
      throw new Error("down");
    });
    const t = await triage(ai, "s", SPECIALISTS, 0.35);
    expect(t.tier).toBe("fail-open");
    expect(t.run).toEqual(SPECIALISTS);
  });
});
