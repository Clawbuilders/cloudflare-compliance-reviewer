import { clefDecide } from "../clef";
import { extractAiDisclosure, extractAiUsage } from "../extractors";
import { truncateForModel } from "../diff";
import { findingId, type Finding } from "../findings";
import { policyFindings } from "./policy";
import type { Specialist } from "./types";

export const DECLARATIONS_PATH = "compliance/ai-system.json";

/**
 * GOPAL (Principled-Evolution/gopal, Apache-2.0) turns published AI rules into Rego. It judges *declared facts about an AI
 * system* (documentation completeness, human oversight, measured toxicity…), not source code — so this specialist reads a
 * declarations file kept in the repo. A declared value is still an assertion unless an evaluator backs it; the comment says so.
 */
const SINGLE_TARGETS = [
  { pkg: "data.global.v1.accountability", id: "accountability", title: "Accountability" },
  { pkg: "data.international.eu_ai_act.v1.transparency", id: "eu_ai_act.transparency", title: "EU AI Act transparency" },
  { pkg: "data.international.eu_ai_act.v1.human_oversight", id: "eu_ai_act.human_oversight", title: "EU AI Act human oversight" },
];
const NIST_FUNCTIONS = ["govern", "map", "measure", "manage"].map((fn) => ({ fn, pkg: `data.international.nist.v1.${fn}` }));

export const aiGovernance: Specialist = {
  id: "ai-governance",
  label: "AI governance (EU AI Act, NIST AI RMF via GOPAL)",
  kind: "REAL",
  applies: (files) => extractAiUsage(files).length > 0 || files.some((f) => f.path === DECLARATIONS_PATH),

  async run(ctx) {
    const findings: Finding[] = [];
    const usage = extractAiUsage(ctx.files);
    const declChanged = ctx.files.some((f) => f.path === DECLARATIONS_PATH);
    const raw = await ctx.fetchFile(DECLARATIONS_PATH);

    let declarations: Record<string, unknown> | null = null;
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) declarations = parsed;
      } catch {
        /* handled below */
      }
      if (!declarations) {
        findings.push({
          id: findingId("ai-governance", "declarations_invalid", DECLARATIONS_PATH, "invalid"),
          specialist: "ai-governance",
          severity: "warn",
          title: "AI declarations file is not valid JSON",
          message: `${DECLARATIONS_PATH} could not be parsed as a JSON object, so the AI governance rules could not be evaluated.`,
          citations: [],
          file: DECLARATIONS_PATH,
          rule: "declarations_invalid",
          kind: "HEURISTIC",
        });
      }
    }

    // Does AI output reach end users? Clef gives a probability; failure means "unknown", which we treat as not user-facing.
    let userFacing = false;
    if (usage.length) {
      try {
        const answers = await clefDecide(ctx.ai, truncateForModel(ctx.files, 4000), {
          user_facing: { type: "noul", instructions: "Does AI-generated output in this change reach end users (for example in a chat window, a page, or an email)?" },
        });
        userFacing = (answers.user_facing?.noul ?? 0) >= 0.5;
      } catch {
        /* unknown */
      }
    }

    findings.push(
      ...policyFindings(
        ctx.engine,
        "ai_governance",
        { ai_usage: usage, declarations_present: raw !== null, user_facing: userFacing, discloses_ai: extractAiDisclosure(ctx.files) },
        "ai-governance",
        () => "HEURISTIC",
      ),
    );

    if (declarations && (usage.length > 0 || declChanged)) findings.push(...evaluateGopal(ctx.engine, declarations));
    return findings;
  },
};

type Engine = Parameters<typeof policyFindings>[0];
type Meta = { title?: string; references?: string[] } | undefined;
type Report = { reason?: string; recommendations?: string[] } | undefined;

function evaluateGopal(engine: Engine, declarations: Record<string, unknown>): Finding[] {
  const out: Finding[] = [];
  const make = (id: string, title: string, message: string, citations: string[]): Finding => ({
    id: findingId("ai-governance", `gopal:${id}`, DECLARATIONS_PATH, title),
    specialist: "ai-governance",
    severity: "warn",
    title,
    message,
    citations,
    file: DECLARATIONS_PATH,
    rule: `gopal:${id}`,
    kind: "REAL",
  });

  for (const t of SINGLE_TARGETS) {
    const allow = engine.evaluate<boolean>(`${t.pkg}.allow`, declarations).value;
    if (allow === true) continue;
    if (allow === undefined) {
      out.push({ ...make(`${t.id}.unavailable`, `${t.title} policy is not in the policy bundle`, "The GOPAL policy could not be evaluated because it is missing from the active bundle.", []), severity: "info" });
      continue;
    }
    const report = engine.evaluate<Report>(`${t.pkg}.compliance_report`, declarations).value;
    const meta = engine.evaluate<Meta>(`${t.pkg}.metadata`, declarations).value;
    const message = [report?.reason, ...(report?.recommendations ?? [])].filter(Boolean).join(" ") || "The declared facts do not satisfy this policy.";
    out.push(make(t.id, `${meta?.title ?? t.title}: declared facts do not satisfy this policy`, message, meta?.references?.length ? meta.references : [t.pkg]));
  }

  const failing = NIST_FUNCTIONS.filter((n) => engine.evaluate<boolean>(`${n.pkg}.allow`, declarations).value === false).map((n) => n.fn);
  if (failing.length) {
    const refs = engine.evaluate<Meta>(`${NIST_FUNCTIONS[0].pkg}.metadata`, declarations).value?.references ?? ["NIST AI Risk Management Framework"];
    out.push(make("nist_ai_rmf", "NIST AI RMF: declared facts do not yet satisfy the framework checks", `Not satisfied: ${failing.join(", ")}. Add the missing declarations to ${DECLARATIONS_PATH}, backed by evidence where you can.`, refs));
  }
  return out;
}
