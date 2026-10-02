import { getAgentByName } from "agents";
import "./regorus-init";
import { CommitteeWorkflow, WaiverWorkflow } from "./committee-workflow";
import { PrCommittee, type CommentEvent, type PullRequestEvent } from "./committee-agent";
import type { Env } from "./env";
import { verifyWebhookSignature } from "./github";
import { handleMcp } from "./mcp";
import { PolicyEngine } from "./policy-engine";

export { CommitteeWorkflow, PrCommittee, WaiverWorkflow };

const PR_ACTIONS = new Set(["opened", "synchronize", "reopened"]);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") {
      const policyVersion = await PolicyEngine.loadCached(env).then((e) => e.version).catch(() => null);
      return Response.json({ ok: policyVersion !== null, policyVersion });
    }
    if (url.pathname === "/mcp") return handleMcp(request, env, ctx);

    // Local-testing viewer. Exists only when DRY_RUN=true, which is never set in production.
    if (url.pathname === "/__dry-run/state" && env.DRY_RUN === "true") {
      const repo = url.searchParams.get("repo") ?? "";
      const number = url.searchParams.get("number") ?? "";
      const agent = await getAgentByName(env.COMMITTEE, `${repo}#${number}`);
      return Response.json({ audit: await agent.getAuditLog(), waivers: await agent.getWaivers(), findings: await agent.getLatestFindings(), markdown: await agent.rerenderComment() });
    }

    if (request.method === "GET") return new Response("ClawBuilders Compliance Committee is running. Point a GitHub webhook (pull_request, issue_comment) at POST /.");
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    // The HMAC needs the raw body, so read it exactly once.
    const raw = await request.text();
    const unsignedOk = env.DRY_RUN === "true" || env.ALLOW_UNSIGNED_WEBHOOKS === "true";
    if (!env.GITHUB_WEBHOOK_SECRET && !unsignedOk) {
      return new Response("GITHUB_WEBHOOK_SECRET is not set. Set it (npx wrangler secret put GITHUB_WEBHOOK_SECRET) or use DRY_RUN for local testing.", { status: 401 });
    }
    if (!(await verifyWebhookSignature(env.GITHUB_WEBHOOK_SECRET, raw, request.headers.get("x-hub-signature-256")))) {
      return new Response("Invalid webhook signature", { status: 401 });
    }

    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    const event = request.headers.get("x-github-event");
    const repo: string | undefined = payload.repository?.full_name;
    const installationId: number | undefined = payload.installation?.id;

    if (event === "pull_request" && PR_ACTIONS.has(payload.action) && payload.pull_request && repo) {
      const ev: PullRequestEvent = { repo, number: payload.pull_request.number, sha: payload.pull_request.head.sha, installationId };
      await (await getAgentByName(env.COMMITTEE, `${repo}#${ev.number}`)).handlePullRequest(ev);
      return new Response("Review scheduled", { status: 202 });
    }

    // Waiver commands arrive as comments on a pull request (issues and PRs share the issue_comment event).
    if (event === "issue_comment" && payload.action === "created" && payload.issue?.pull_request && payload.comment && repo) {
      const ev: CommentEvent = {
        repo,
        number: payload.issue.number,
        commentId: payload.comment.id,
        author: payload.comment.user?.login ?? "",
        authorType: payload.comment.user?.type ?? "",
        body: payload.comment.body ?? "",
        installationId,
      };
      await (await getAgentByName(env.COMMITTEE, `${repo}#${ev.number}`)).handleComment(ev);
      return new Response("Comment handled", { status: 202 });
    }

    return new Response("Event ignored");
  },
} satisfies ExportedHandler<Env>;
