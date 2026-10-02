import type { PrCommittee } from "./committee-agent";

export interface Env {
  AI: Ai;
  /** R2 bucket holding versioned Rego policy bundles (policies/ACTIVE points at the live one). */
  POLICIES: R2Bucket;
  COMMITTEE: DurableObjectNamespace<PrCommittee>;
  COMMITTEE_WORKFLOW: Workflow;
  WAIVER_WORKFLOW: Workflow;

  GITHUB_TOKEN?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  /** Bearer token for the /mcp endpoint. Unset = /mcp is disabled (404), never open. */
  MCP_TOKEN?: string;
  /** "true" = never write to GitHub; verdicts are still recorded so you can test locally. */
  DRY_RUN?: string;
  ALLOW_UNSIGNED_WEBHOOKS?: string;
  /** Local testing only (honoured only when DRY_RUN=true): JSON map of login → permission, e.g. {"alice":"write","bob":"write"}. */
  DEV_PERMISSIONS?: string;
  TRIAGE_THRESHOLD?: string;
  MAX_DIFF_CHARS?: string;
}
