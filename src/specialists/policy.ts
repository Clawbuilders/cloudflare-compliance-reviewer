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
 * A specialist whose Rego package is not in the loaded bundle checked nothing. That must block, never read as a pass.
 * Regorus reports an undefined rule as no result (`value: undefined`); a defined rule set with no hits is `[]`.
 */
export function policyMissingFinding(pkg: string, specialist: string, policyVersion: string): Finding {
  const title = "Policy package missing";
  return {
    id: findingId(specialist, "policy_package_missing", undefined, title),
    specialist,
    severity: "block",
    title,
    message:
      `Policy package committee.${pkg} is not in the published bundle (version ${policyVersion}), so this specialist did NOT check the change. ` +
      "Add the package and publish the bundle with `npm run policies:publish -- --remote` (or `-- --local` for local dev).",
    citations: [],
    rule: "policy_package_missing",
    kind: "REAL",
  };
}

/**
 * Evaluate `data.committee.<pkg>.deny` / `.warn` over extracted facts and turn the results into Findings.
 * `kindFor` lets one policy mix REAL and HEURISTIC rules. A package may define only one of the two sets; when it defines
 * neither, the package is missing from the bundle and the result is one blocking finding (fail closed).
 */
export function policyFindings(
  engine: PolicyEngine,
  pkg: string,
  facts: unknown,
  specialist: string,
  kindFor: (rule: string) => Finding["kind"],
): Finding[] {
  const sets = (["deny", "warn"] as const).map((set) => engine.evaluate<PolicyResult[]>(`data.committee.${pkg}.${set}`, facts).value);
  if (sets.every((v) => v === undefined)) return [policyMissingFinding(pkg, specialist, engine.version)];
  const out: Finding[] = [];
  for (const [i, severity] of (["block", "warn"] as const).entries()) {
    for (const r of sets[i] ?? []) {
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
