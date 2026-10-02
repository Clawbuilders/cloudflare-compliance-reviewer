import { AgentWorkflow, WorkflowRejectedError, type AgentWorkflowEvent, type AgentWorkflowStep } from "agents/workflows";
import "./regorus-init";
import type { PrCommittee } from "./committee-agent";
import { selectSpecialists } from "./committee";
import { truncateForModel } from "./diff";
import { triage } from "./clef";
import type { Env } from "./env";
import { mergeFindings, type Finding } from "./findings";
import { PolicyEngine } from "./policy-engine";
import { loadDiff, runOneSpecialist, SPECIALIST_IDS, type PrRef } from "./review-runtime";

const RETRY = { retries: { limit: 3, delay: "5 seconds", backoff: "exponential" }, timeout: "2 minutes" } as const;

/**
 * The durable review pipeline. Each step's result is checkpointed, so a crash or a flaky API retries only the failed step:
 *   triage (Clef) → one step per specialist (parallel) → publish (merge, comment, audit log).
 * Everything with a decision in it is a unit-tested pure function; this class sequences them.
 */
export class CommitteeWorkflow extends AgentWorkflow<PrCommittee, PrRef, unknown, Env> {
  async run(event: AgentWorkflowEvent<PrRef>, step: AgentWorkflowStep) {
    const p: PrRef = { repo: event.payload.repo, number: event.payload.number, sha: event.payload.sha, installationId: event.payload.installationId };

    const plan = await step.do("triage", RETRY, async () => {
      const { all, files } = await loadDiff(this.env, p);
      if (all.length === 0) return { run: [] as string[], skipped: SPECIALIST_IDS, tier: "empty diff" };
      // A change that only touches lockfiles has nothing for a model to read; deterministic signals still pick the specialists.
      let triaged: string[] = [];
      let tier = "deterministic";
      if (files.length > 0) {
        const t = await triage(this.env.AI, truncateForModel(files, Number(this.env.MAX_DIFF_CHARS ?? "8000")), SPECIALIST_IDS, Number(this.env.TRIAGE_THRESHOLD ?? "0.35"));
        triaged = t.run;
        tier = t.tier;
      }
      const sel = selectSpecialists(files, triaged, all);
      return { run: sel.run, skipped: sel.skipped, tier };
    });

    const results = await Promise.all(plan.run.map((id) => step.do(`specialist:${id}`, RETRY, async () => runOneSpecialist(this.env, p, id))));

    return step.do("publish", RETRY, async () => {
      const findings: Finding[] = mergeFindings(results.flat());
      const policyVersion = await PolicyEngine.loadCached(this.env).then((e) => e.version).catch(() => "unavailable");
      await this.agent.recordVerdict({ sha: p.sha, policyVersion, tier: plan.tier, skipped: plan.skipped, findings });
      await this.agent.rerenderComment();
      return { findings: findings.length, blocking: findings.filter((f) => f.severity === "block").length, tier: plan.tier, policyVersion };
    });
  }
}

export interface WaiverParams {
  repo: string;
  number: number;
  findingId: string;
  requester: string;
  reason: string;
  installationId?: number;
}

/**
 * A waiver is a durable request that waits — possibly for days, costing nothing while it waits — for a *different*
 * maintainer to approve. Rejection and expiry both end with no waiver.
 */
export class WaiverWorkflow extends AgentWorkflow<PrCommittee, WaiverParams, unknown, Env> {
  async run(event: AgentWorkflowEvent<WaiverParams>, step: AgentWorkflowStep) {
    const { findingId } = event.payload;
    await step.do("announce", RETRY, async () => this.agent.announceWaiver(findingId));

    let outcome: "approved" | "rejected" | "expired" = "expired";
    let approver = "";
    try {
      const approval = await this.waitForApproval<{ metadata?: { approvedBy?: string } }>(step, { timeout: "7 days" });
      outcome = "approved";
      approver = approval?.metadata?.approvedBy ?? "";
    } catch (e) {
      outcome = e instanceof WorkflowRejectedError ? "rejected" : "expired";
    }

    await step.do("record", RETRY, async () => this.agent.finishWaiver({ findingId, outcome, approver }));
    return { findingId, outcome };
  }
}
