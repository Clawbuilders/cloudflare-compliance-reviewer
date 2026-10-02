import { Agent } from "agents";
import { MARKER, renderComment } from "./comment";
import type { Env } from "./env";
import type { Finding } from "./findings";
import { getCollaboratorPermission, upsertComment, type Permission } from "./github";
import { shouldReview, shouldSchedule, type ReviewerState } from "./review-state";
import { tokenFor, type PrRef } from "./review-runtime";
import { canRequestWaiver, decideApproval, parseCommand, type WaiverStatus } from "./waivers";

export interface PullRequestEvent extends PrRef {}

export interface CommentEvent {
  repo: string;
  number: number;
  commentId: number;
  author: string;
  authorType: string;
  body: string;
  installationId?: number;
}

export interface Verdict {
  sha: string;
  policyVersion: string;
  tier: string;
  skipped: string[];
  findings: Finding[];
}

interface State extends ReviewerState {
  pr?: PullRequestEvent;
}

interface WaiverRow {
  finding_id: string;
  reason: string;
  requested_by: string;
  workflow_id: string;
  status: WaiverStatus;
  approved_by: string | null;
  policy_version: string | null;
  created_at: number;
  decided_at: number | null;
}

/**
 * One instance per pull request (named "owner/repo#123"). It owns the PR's durable state: the debounce, an append-only
 * audit log of every verdict (with the policy version that produced it), and the waiver ledger. The slow, retryable work
 * runs in Workflows; this class decides *when* to start them.
 */
export class PrCommittee extends Agent<Env, State> {
  initialState: State = {};

  onStart(): void {
    this.sql`CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, sha TEXT NOT NULL, policy_version TEXT NOT NULL,
      tier TEXT NOT NULL, skipped_json TEXT NOT NULL, findings_json TEXT NOT NULL)`;
    this.sql`CREATE TABLE IF NOT EXISTS waivers (
      finding_id TEXT PRIMARY KEY, reason TEXT NOT NULL, requested_by TEXT NOT NULL, workflow_id TEXT NOT NULL,
      status TEXT NOT NULL, approved_by TEXT, policy_version TEXT, created_at INTEGER NOT NULL, decided_at INTEGER)`;
  }

  // ---------- entry points called by the Worker ----------

  /** A pull_request webhook. Rapid pushes collapse into one review of the newest commit (15 second debounce). */
  async handlePullRequest(p: PullRequestEvent): Promise<void> {
    if (!shouldSchedule(this.state, p.sha)) return; // duplicate delivery
    this.setState({ ...this.state, latestSha: p.sha, pr: p });
    await this.schedule(15, "startReview", { sha: p.sha });
  }

  /** An issue_comment webhook on this PR: waiver commands. */
  async handleComment(ev: CommentEvent): Promise<void> {
    if (ev.authorType === "Bot") return; // never react to bots, including ourselves
    const cmd = parseCommand(ev.body);
    if (!cmd) return;
    const token = await tokenFor(this.env, ev.installationId);
    const permission = await this.permissionOf(ev.repo, ev.author, token);
    const reply = (text: string) => this.postComment(ev, `<!-- clawbuilders-reply:${ev.commentId} -->`, text, token);

    const finding = this.latestFindings().find((f) => f.id === cmd.findingId);
    if (!finding) return reply(`No finding with id \`${cmd.findingId}\` in the latest review.`);

    const existing = this.waiver(cmd.findingId);

    if (cmd.cmd === "waive") {
      if (!canRequestWaiver(permission, ev.author)) return reply("Requesting a waiver needs triage access or more.");
      if (existing && (existing.status === "pending" || existing.status === "approved")) {
        return reply(`A waiver for \`${cmd.findingId}\` is already ${existing.status}.`);
      }
      const workflowId = await this.runWorkflow("WAIVER_WORKFLOW", {
        repo: ev.repo,
        number: ev.number,
        findingId: cmd.findingId,
        requester: ev.author,
        reason: cmd.reason,
        installationId: ev.installationId,
      });
      const now = Date.now();
      this.sql`INSERT OR REPLACE INTO waivers (finding_id, reason, requested_by, workflow_id, status, created_at)
        VALUES (${cmd.findingId}, ${cmd.reason}, ${ev.author}, ${workflowId}, 'pending', ${now})`;
      return;
    }

    if (!existing || existing.status !== "pending") return reply(`There is no pending waiver for \`${cmd.findingId}\`.`);

    if (cmd.cmd === "reject") {
      // The requester may withdraw their own request; anyone else needs the same standing as an approver.
      const selfWithdraw = existing.requested_by.toLowerCase() === ev.author.toLowerCase();
      const decision = selfWithdraw ? { ok: true as const } : decideApproval({ requester: existing.requested_by, approver: ev.author, approverPermission: permission, status: existing.status });
      if (!decision.ok) return reply(decision.reason);
      await this.rejectWorkflow(existing.workflow_id, { reason: `Rejected by ${ev.author}` });
      return;
    }

    const decision = decideApproval({ requester: existing.requested_by, approver: ev.author, approverPermission: permission, status: existing.status });
    if (!decision.ok) return reply(decision.reason);
    await this.approveWorkflow(existing.workflow_id, { reason: `Approved by ${ev.author}`, metadata: { approvedBy: ev.author } });
  }

  // ---------- scheduled / workflow callbacks ----------

  /** Debounce timer fired: start the durable review for the newest commit. */
  async startReview(payload: { sha: string }): Promise<void> {
    const pr = this.state.pr;
    if (!pr || !shouldReview(this.state, payload.sha)) return;
    this.setState({ ...this.state, lastReviewedSha: payload.sha });
    await this.runWorkflow("COMMITTEE_WORKFLOW", { repo: pr.repo, number: pr.number, sha: pr.sha, installationId: pr.installationId });
  }

  /** The workflow records what it decided, and which policy version decided it. */
  async recordVerdict(v: Verdict): Promise<void> {
    this.sql`INSERT INTO audit_log (ts, sha, policy_version, tier, skipped_json, findings_json)
      VALUES (${Date.now()}, ${v.sha}, ${v.policyVersion}, ${v.tier}, ${JSON.stringify(v.skipped)}, ${JSON.stringify(v.findings)})`;
  }

  getWaivedIds(): string[] {
    return this.sql<{ finding_id: string }>`SELECT finding_id FROM waivers WHERE status = 'approved'`.map((r) => r.finding_id);
  }

  /** WaiverWorkflow step 1: tell the PR a waiver was requested (idempotent: one comment per finding, edited in place). */
  async announceWaiver(findingId: string): Promise<void> {
    const w = this.waiver(findingId);
    const pr = this.state.pr;
    if (!w || !pr) return;
    const body = [
      `<!-- clawbuilders-waiver:${findingId} -->`,
      `**Waiver requested** for \`${findingId}\` by \`${w.requested_by}\`.`,
      `Reason: ${escapeInline(w.reason)}`,
      "",
      `A different maintainer with write access can reply \`/approve ${findingId}\` or \`/reject ${findingId}\`. The request expires if nobody decides.`,
    ].join("\n");
    await this.write(pr, `<!-- clawbuilders-waiver:${findingId} -->`, body);
  }

  /** WaiverWorkflow final step: record the outcome in the ledger and refresh the review comment. */
  async finishWaiver(r: { findingId: string; outcome: "approved" | "rejected" | "expired"; approver: string }): Promise<void> {
    const version = this.latestVerdict()?.policy_version ?? null;
    this.sql`UPDATE waivers SET status = ${r.outcome}, approved_by = ${r.outcome === "approved" ? r.approver : null},
      policy_version = ${version}, decided_at = ${Date.now()} WHERE finding_id = ${r.findingId}`;
    const pr = this.state.pr;
    if (pr) {
      const note = r.outcome === "approved" ? `**Waiver approved** for \`${r.findingId}\` by \`${r.approver}\`.` : `**Waiver ${r.outcome}** for \`${r.findingId}\`.`;
      await this.write(pr, `<!-- clawbuilders-waiver:${r.findingId} -->`, `<!-- clawbuilders-waiver:${r.findingId} -->\n${note}`);
    }
    await this.rerenderComment();
  }

  /** Re-render the review comment from the stored verdict plus the current waiver ledger. */
  async rerenderComment(): Promise<string | null> {
    const row = this.latestVerdict();
    const pr = this.state.pr;
    if (!row || !pr) return null;
    const markdown = renderComment({
      findings: JSON.parse(row.findings_json) as Finding[],
      waived: new Set(this.getWaivedIds()),
      policyVersion: row.policy_version,
      tier: row.tier,
      skipped: JSON.parse(row.skipped_json) as string[],
    });
    await this.write(pr, MARKER, markdown);
    return markdown;
  }

  // ---------- read-only views (used by tests and the MCP/diagnostics) ----------

  getAuditLog(): { sha: string; policy_version: string; tier: string; findings: number; ts: number }[] {
    return this.sql<{ sha: string; policy_version: string; tier: string; findings_json: string; ts: number }>`SELECT sha, policy_version, tier, findings_json, ts FROM audit_log ORDER BY id`.map(
      (r) => ({ sha: r.sha, policy_version: r.policy_version, tier: r.tier, findings: (JSON.parse(r.findings_json) as unknown[]).length, ts: r.ts }),
    );
  }

  getWaivers(): WaiverRow[] {
    return this.sql<WaiverRow>`SELECT * FROM waivers ORDER BY created_at`;
  }

  getLatestFindings(): Finding[] {
    return this.latestFindings();
  }

  // ---------- internals ----------

  /** Real GitHub permission; in DRY_RUN a DEV_PERMISSIONS map stands in so waiver flows can be exercised without real users. */
  private async permissionOf(repo: string, login: string, token: string | undefined): Promise<Permission> {
    if (this.env.DRY_RUN === "true" && this.env.DEV_PERMISSIONS) {
      try {
        const map = JSON.parse(this.env.DEV_PERMISSIONS) as Record<string, Permission>;
        return map[login] ?? "none";
      } catch {
        return "none";
      }
    }
    return getCollaboratorPermission(repo, login, token).catch(() => "none" as const);
  }

  private latestVerdict() {
    return this.sql<{ policy_version: string; tier: string; skipped_json: string; findings_json: string }>`
      SELECT policy_version, tier, skipped_json, findings_json FROM audit_log ORDER BY id DESC LIMIT 1`[0];
  }

  private latestFindings(): Finding[] {
    const row = this.latestVerdict();
    return row ? (JSON.parse(row.findings_json) as Finding[]) : [];
  }

  private waiver(findingId: string): WaiverRow | undefined {
    return this.sql<WaiverRow>`SELECT * FROM waivers WHERE finding_id = ${findingId}`[0];
  }

  private async write(pr: PullRequestEvent, marker: string, body: string): Promise<void> {
    if (this.env.DRY_RUN === "true") return;
    const token = await tokenFor(this.env, pr.installationId);
    if (!token) {
      console.warn("No GitHub credentials configured; nothing posted.");
      return;
    }
    await upsertComment({ repo: pr.repo, issueNumber: pr.number, body, marker, token });
  }

  private async postComment(ev: CommentEvent, marker: string, text: string, token: string | undefined): Promise<void> {
    if (this.env.DRY_RUN === "true" || !token) return;
    await upsertComment({ repo: ev.repo, issueNumber: ev.number, body: `${marker}\n${text}`, marker, token });
  }
}

/** User-supplied text (a waiver reason) goes into a comment: defuse pings and HTML. */
function escapeInline(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/@/g, "@​").replace(/\r?\n/g, " ");
}
