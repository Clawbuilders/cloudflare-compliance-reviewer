/**
 * Glue shared by the review workflow and the MCP tool: GitHub inputs → SpecialistContext.
 * Everything with a decision in it lives in tested pure modules; this file only wires I/O.
 */
import { parseUnifiedDiff, reviewable, type DiffFile } from "./diff";
import type { Env } from "./env";
import { countApprovals, fetchFileAtRef, fetchPrDiff, resolveGitHubToken } from "./github";
import { findingId, type Finding } from "./findings";
import { PolicyEngine, PolicyUnavailableError } from "./policy-engine";
import { SPECIALISTS, getSpecialist, runSpecialist } from "./specialists";
import type { SpecialistContext } from "./specialists";

export interface PrRef {
  repo: string;
  number: number;
  sha: string;
  installationId?: number;
}

export const SPECIALIST_IDS = SPECIALISTS.map((s) => s.id);

export async function tokenFor(env: Env, installationId?: number): Promise<string | undefined> {
  return (await resolveGitHubToken(env, installationId)) ?? env.GITHUB_TOKEN;
}

/** A diff for a given sha never changes, so the parsed result is safe to reuse across workflow steps in the same isolate. */
const diffCache = new Map<string, DiffFile[]>();

export async function loadReviewableFiles(env: Env, p: PrRef): Promise<DiffFile[]> {
  const key = `${p.repo}#${p.number}@${p.sha}`;
  const hit = diffCache.get(key);
  if (hit) return hit;
  const token = await tokenFor(env, p.installationId);
  const files = reviewable(parseUnifiedDiff(await fetchPrDiff(p.repo, p.number, token)));
  if (diffCache.size >= 20) diffCache.delete(diffCache.keys().next().value as string);
  diffCache.set(key, files);
  return files;
}

/** GET JSON with a hard timeout; null on timeout, non-200, or bad JSON. Used for deps.dev / ClearlyDefined. */
export async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json", "User-Agent": "ClawBuilders-Compliance-Committee" } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function policyUnavailableFinding(message: string): Finding {
  const title = "Policy engine unavailable";
  return {
    id: findingId("committee", "policy_engine_unavailable", undefined, title),
    specialist: "committee",
    severity: "block",
    title,
    message: `No policy bundle could be loaded, so this change was NOT checked: ${message}. Publish one with \`npm run policies:publish\`.`,
    citations: [],
    rule: "policy_engine_unavailable",
    kind: "REAL",
  };
}

/** Build the context for one specialist and run it. A missing policy bundle becomes a loud blocking finding, never a pass. */
export async function runOneSpecialist(env: Env, p: PrRef, id: string): Promise<Finding[]> {
  const specialist = getSpecialist(id);
  if (!specialist) return [];
  let engine: PolicyEngine;
  try {
    engine = await PolicyEngine.loadCached(env);
  } catch (e) {
    if (e instanceof PolicyUnavailableError) return [policyUnavailableFinding(e.message)];
    throw e;
  }
  const token = await tokenFor(env, p.installationId);
  const ctx: SpecialistContext = {
    files: await loadReviewableFiles(env, p),
    prMeta: { title: "", body: "", approvals: await countApprovals(p.repo, p.number, token).catch(() => 0) },
    engine,
    ai: env.AI,
    fetchFile: (path) => fetchFileAtRef(p.repo, path, p.sha, token),
    fetchJson: fetchJsonWithTimeout,
  };
  return runSpecialist(specialist, ctx);
}
