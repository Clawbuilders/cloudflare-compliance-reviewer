import { findingId, type Finding } from "../findings";
import type { PolicyEngine } from "../policy-engine";

export interface PolicyResult {
  rule: string;
  title: string;
  message: string;
  citations?: string[];
  file?: string;
}

/**
 * Evaluate `data.committee.<pkg>.deny` / `.warn` over extracted facts and turn the results into Findings.
 * `kindFor` lets one policy mix REAL and HEURISTIC rules.
 */
export function policyFindings(
  engine: PolicyEngine,
  pkg: string,
  facts: unknown,
  specialist: string,
  kindFor: (rule: string) => Finding["kind"],
): Finding[] {
  const out: Finding[] = [];
  for (const [set, severity] of [["deny", "block"], ["warn", "warn"]] as const) {
    const results = engine.evaluate<PolicyResult[]>(`data.committee.${pkg}.${set}`, facts).value ?? [];
    for (const r of results) {
      out.push({
        id: findingId(specialist, r.rule, r.file, r.title),
        specialist,
        severity,
        title: r.title,
        message: r.message,
        citations: r.citations ?? [],
        file: r.file,
        rule: r.rule,
        kind: kindFor(r.rule),
      });
    }
  }
  return out;
}
