import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import "./regorus-init";
import { selectSpecialists } from "./committee";
import { triage } from "./clef";
import { parseUnifiedDiff, reviewable, truncateForModel } from "./diff";
import type { Env } from "./env";
import { mergeFindings } from "./findings";
import { PolicyEngine, PolicyUnavailableError } from "./policy-engine";
import { fetchJsonWithTimeout, policyUnavailableFinding, SPECIALIST_IDS } from "./review-runtime";
import { getSpecialist, runSpecialist } from "./specialists";

/** Run the committee over a raw diff — no GitHub involved. Used by the MCP tool so any agent can pre-check a change. */
export async function checkCompliance(env: Env, diff: string, declarations?: unknown) {
  const files = reviewable(parseUnifiedDiff(diff));
  if (files.length === 0) return { policyVersion: null, tier: "no reviewable files", skipped: SPECIALIST_IDS, findings: [] };

  let engine: PolicyEngine;
  try {
    engine = await PolicyEngine.loadCached(env);
  } catch (e) {
    if (e instanceof PolicyUnavailableError) return { policyVersion: null, tier: "unavailable", skipped: [], findings: [policyUnavailableFinding(e.message)] };
    throw e;
  }

  const t = await triage(env.AI, truncateForModel(files, Number(env.MAX_DIFF_CHARS ?? "8000")), SPECIALIST_IDS, Number(env.TRIAGE_THRESHOLD ?? "0.35"));
  const sel = selectSpecialists(files, t.run);
  const declText = declarations === undefined ? null : JSON.stringify(declarations);
  const ctx = {
    files,
    prMeta: { title: "", body: "", approvals: 0 },
    engine,
    ai: env.AI,
    fetchFile: async (path: string) => (path === "compliance/ai-system.json" ? declText : null),
    fetchJson: fetchJsonWithTimeout,
  };
  const results = await Promise.all(sel.run.map((id) => runSpecialist(getSpecialist(id)!, ctx)));
  return { policyVersion: engine.version, tier: t.tier, skipped: sel.skipped, findings: mergeFindings(results.flat()) };
}

function createServer(env: Env) {
  const server = new McpServer({ name: "clawbuilders-compliance-committee", version: "1.0.0" });
  server.registerTool(
    "check_compliance",
    {
      description:
        "Check a unified git diff against the policy-as-code committee (privacy, licensing, CASL, AI governance, sensitive data, change control). Returns cited findings. Flags risk for humans; not legal advice.",
      inputSchema: {
        diff: z.string().min(1).max(500_000).describe("A unified diff (git diff output)."),
        declarations: z.record(z.string(), z.unknown()).optional().describe("Contents of compliance/ai-system.json, if the repo has one."),
      },
    },
    async ({ diff, declarations }) => {
      const result = await checkCompliance(env, diff, declarations);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
  return server;
}

/** Bearer-token protected. With no MCP_TOKEN configured the endpoint does not exist (404) rather than being open. */
export async function handleMcp(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!env.MCP_TOKEN) return new Response("Not found", { status: 404 });
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${env.MCP_TOKEN}`) return new Response("Unauthorized", { status: 401, headers: { "www-authenticate": "Bearer" } });
  return createMcpHandler(() => createServer(env), { route: "/mcp" })(request, env as never, ctx);
}
