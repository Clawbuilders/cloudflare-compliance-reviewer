import { extractCargoPackages, extractDependencies, type PackageRef } from "../extractors";
import { findingId, type Finding } from "../findings";
import { lookupLicense } from "../license-lookup";
import { policyFindings } from "./policy";
import type { Specialist } from "./types";
import type { DiffFile } from "../diff";

const DEFAULT_MAX_DEPENDENCIES = 15;
const LOOKUP_CONCURRENCY = 8;
const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|rs|go|py|java|kt|rb|php|c|cc|cpp|h|hpp|cs|swift|sh)$/i;

/** npm packages from any package.json plus exact Cargo.lock packages, from the UNFILTERED diff when it is available. */
const packagesIn = (files: DiffFile[]): PackageRef[] => [
  ...extractDependencies(files).map((d): PackageRef => ({ ...d, ecosystem: "npm", file: "package.json" })),
  ...extractCargoPackages(files),
];

/** Run `fn` over `items` with at most `limit` in flight, keeping result order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const newCodeFiles = (files: DiffFile[]) => files.filter((f) => f.status === "added" && !f.binary && CODE_FILE.test(f.path));
const hasSpdxHeader = (f: DiffFile) => /SPDX-License-Identifier/.test(f.added.slice(0, 15).join("\n"));

export const licensing: Specialist = {
  id: "licensing",
  label: "Licensing (SPDX via deps.dev and ClearlyDefined)",
  kind: "REAL+HEURISTIC",
  applies: (files, allFiles) => packagesIn(allFiles ?? files).length > 0 || newCodeFiles(files).length > 0,

  async run(ctx) {
    const findings: Finding[] = [];
    const deps = packagesIn(ctx.allFiles ?? ctx.files);
    const checked = deps.slice(0, ctx.maxDependencies ?? DEFAULT_MAX_DEPENDENCIES);

    const looked = await mapLimit(checked, LOOKUP_CONCURRENCY, async (d) => ({
      d,
      info: await lookupLicense(d.name, d.version, ctx.fetchJson, { ecosystem: d.ecosystem, enrich: ctx.licenseEnrichment }),
    }));
    const dependencies = [];
    for (const { d, info } of looked) {
      if (info.license === null) {
        const title = `${d.name}@${d.version}: license lookup unavailable`;
        findings.push({
          id: findingId("licensing", "license_lookup_unavailable", d.file, title),
          specialist: "licensing",
          severity: "info",
          title,
          message: "deps.dev and ClearlyDefined did not answer for this package. That says nothing about the package itself — check its license manually.",
          citations: [],
          file: d.file,
          rule: "license_lookup_unavailable",
          kind: "REAL",
        });
      } else {
        dependencies.push({ name: d.name, version: d.version, license: info.license, discovered: info.discovered, file: d.file });
      }
    }
    if (deps.length > checked.length) {
      findings.push({
        id: findingId("licensing", "license_check_truncated", deps[0].file, String(deps.length)),
        specialist: "licensing",
        severity: "info",
        title: `Checked ${checked.length} of ${deps.length} new dependencies`,
        message: "Only the first dependencies were looked up to stay within time limits. Review the rest manually.",
        citations: [],
        file: deps[0].file,
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
