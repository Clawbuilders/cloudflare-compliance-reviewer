import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { SPECIALIST_QUESTIONS } from "../../src/clef";
import { selectSpecialists } from "../../src/committee";
import { parseUnifiedDiff, reviewable } from "../../src/diff";
import { mergeFindings } from "../../src/findings";
import { getSpecialist } from "../../src/specialists";
import { runSpecialist } from "../../src/specialists/run";
import { ensureRegorus } from "../helpers/engine";
import { makeCtx } from "./helpers";

const fixture = (name: string) =>
  reviewable(parseUnifiedDiff(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/canada-ai", name), "utf8")));

/** The committee path for one specialist: deterministic selection, then the specialist's extractors and Rego policy. */
async function review(name: string, repoFiles?: Record<string, string>) {
  const files = fixture(name);
  const selected = selectSpecialists(files, []).run.includes("canada-ai");
  const findings = mergeFindings(await runSpecialist(getSpecialist("canada-ai")!, makeCtx({ files, repoFiles })));
  return { selected, findings };
}

beforeAll(() => ensureRegorus());

describe("canada-ai (Quebec Law 25 s. 12.1, Ontario ESA ss. 8.1-8.6)", () => {
  it("is registered with a Clef triage question", () => {
    expect(getSpecialist("canada-ai")?.kind).toBe("HEURISTIC");
    expect(SPECIALIST_QUESTIONS["canada-ai"]).toMatch(/automated decision|hiring/i);
  });

  it("an AI resume screener that auto-rejects, with no human review and no posting disclosure: block + warn", async () => {
    const { selected, findings } = await review("noncompliant.diff");
    expect(selected).toBe(true); // forced by its own signal even when triage says nothing is needed
    expect(findings.map((f) => [f.severity, f.rule])).toEqual([
      ["block", "automated_decision_without_notice"],
      ["warn", "ai_screening_without_disclosure"],
    ]);
    const [block, warn] = findings;
    expect(block.citations.join(" ")).toContain("Quebec Law 25, s. 12.1");
    expect(block.message).toContain("flags the code for human review");
    expect(block.file).toBe("src/hiring/screen.ts");
    expect(warn.citations).toEqual(["Ontario Employment Standards Act, 2000, ss. 8.1-8.6", "O. Reg. 476/24"]);
    expect(warn.message).toMatch(/25 or more employees/);
    expect(findings.every((f) => f.kind === "HEURISTIC" && f.specialist === "canada-ai")).toBe(true);
  });

  it("the compliant variant (a recruiter reviews low scores, the posting discloses AI) passes", async () => {
    const { selected, findings } = await review("compliant.diff");
    expect(selected).toBe(true);
    expect(findings).toEqual([]);
  });

  it("declarations in compliance/ai-system.json clear both rules for the same code", async () => {
    const decl = JSON.stringify({
      automated_decisions: { notice: "The rejection email says the decision was automated.", human_review: "Reply to the email to have a recruiter review it." },
      hiring: { ai_screening_disclosure: "Our postings say: we use AI to screen applications." },
    });
    expect((await review("noncompliant.diff", { "compliance/ai-system.json": decl })).findings).toEqual([]);
  });

  it("an invalid declarations file counts as no declarations (fail closed)", async () => {
    const { findings } = await review("noncompliant.diff", { "compliance/ai-system.json": "{ not json" });
    expect(findings.map((f) => f.rule)).toContain("automated_decision_without_notice");
  });
});
