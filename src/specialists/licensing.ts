import { extractDependencies } from "../extractors";
import { findingId, type Finding } from "../findings";
import { lookupLicense } from "../license-lookup";
import { policyFindings } from "./policy";
import type { Specialist } from "./types";
import type { DiffFile } from "../diff";

const MAX_DEPENDENCIES = 15;
const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|rs|go|py|java|kt|rb|php|c|cc|cpp|h|hpp|cs|swift|sh)$/i;

const newCodeFiles = (files: DiffFile[]) => files.filter((f) => f.status === "added" && !f.binary && CODE_FILE.test(f.path));
const hasSpdxHeader = (f: DiffFile) => /SPDX-License-Identifier/.test(f.added.slice(0, 15).join("\n"));

export const licensing: Specialist = {
  id: "licensing",
  label: "Licensing (SPDX via deps.dev and ClearlyDefined)",
  kind: "REAL+HEURISTIC",
  applies: (files) => extractDependencies(files).length > 0 || newCodeFiles(files).length > 0,

  async run(ctx) {
    const findings: Finding[] = [];
    const deps = extractDependencies(ctx.files);
    const checked = deps.slice(0, MAX_DEPENDENCIES);

    const looked = await Promise.all(checked.map(async (d) => ({ d, info: await lookupLicense(d.name, d.version, ctx.fetchJson) })));
    const dependencies = [];
    for (const { d, info } of looked) {
      if (info.license === null) {
        const title = `${d.name}@${d.version}: license lookup unavailable`;
        findings.push({
          id: findingId("licensing", "license_lookup_unavailable", "package.json", title),
          specialist: "licensing",
          severity: "info",
          title,
          message: "deps.dev and ClearlyDefined did not answer for this package. That says nothing about the package itself — check its license manually.",
          citations: [],
          file: "package.json",
          rule: "license_lookup_unavailable",
          kind: "REAL",
        });
      } else {
        dependencies.push({ name: d.name, version: d.version, license: info.license, discovered: info.discovered });
      }
    }
    if (deps.length > checked.length) {
      findings.push({
        id: findingId("licensing", "license_check_truncated", "package.json", String(deps.length)),
        specialist: "licensing",
        severity: "info",
        title: `Checked ${checked.length} of ${deps.length} new dependencies`,
        message: "Only the first dependencies were looked up to stay within time limits. Review the rest manually.",
        citations: [],
        file: "package.json",
        rule: "license_check_truncated",
        kind: "REAL",
      });
    }

    // REUSE-style headers only matter for repositories that have adopted the REUSE specification.
    let reuse = { enabled: false, files_missing_header: [] as string[] };
    const added = newCodeFiles(ctx.files);
    if (added.length) {
      const adopted = (await ctx.fetchFile("REUSE.toml")) ?? (await ctx.fetchFile(".reuse/dep5"));
      if (adopted !== null) reuse = { enabled: true, files_missing_header: added.filter((f) => !hasSpdxHeader(f)).map((f) => f.path) };
    }

    findings.push(...policyFindings(ctx.engine, "licensing", { dependencies, reuse }, "licensing", (rule) => (rule === "missing_spdx_header" ? "HEURISTIC" : "REAL")));
    return findings;
  },
};
