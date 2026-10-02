import { getAgentByName } from "agents";
import { A11yReviewer, type Env, type PrEvent } from "./a11y-reviewer";
import { verifyWebhookSignature } from "./github";

export { A11yReviewer };

const HANDLED = new Set(["opened", "synchronize", "reopened"]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "GET") return new Response("ClawBuilders Starter accessibility reviewer is running. Point a GitHub pull_request webhook at POST /.");
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    // Read the raw body once: the HMAC needs it verbatim.
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
    if (request.headers.get("x-github-event") !== "pull_request" || !HANDLED.has(payload.action) || !payload.pull_request) {
      return new Response("Event ignored");
    }

    const ev: PrEvent = {
      repo: payload.repository.full_name,
      number: payload.pull_request.number,
      sha: payload.pull_request.head.sha,
      installationId: payload.installation?.id,
    };
    const agent = await getAgentByName(env.A11Y_REVIEWER, `${ev.repo}#${ev.number}`);

    if (env.DRY_RUN === "true") {
      const markdown = await agent.performReview(ev);
      return new Response(markdown ?? "Skipped: no user-interface changes.", { headers: { "content-type": "text/markdown; charset=utf-8" } });
    }
    await agent.handlePullRequest(ev);
    return new Response("Review scheduled", { status: 202 });
  },
} satisfies ExportedHandler<Env>;
