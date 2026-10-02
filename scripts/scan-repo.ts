/**
 * Baseline scan: run the committee over a whole repository, as if every tracked file were added in one pull request.
 *
 *   npx tsx scripts/scan-repo.ts <path-to-git-repo> [--out findings.json] [--skip change-control,casl]
 *
 * Runs entirely on this machine: no model is called (an AI stub that always fails stands in, so nothing from your code is sent
 * anywhere), and only package names and versions go to deps.dev for licence lookups (npm `package.json` and Cargo `Cargo.lock`). change-control is skipped by default —
 * "approvals" and "blast radius" are properties of a pull request, not of a snapshot.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseUnifiedDiff, reviewable } from "../src/diff";
import { mergeFindings, type Finding } from "../src/findings";
import { extractCargoPackages } from "../src/extractors";
import { initRegorus, PolicyEngine } from "../src/policy-engine";
import { fetchJsonWithTimeout } from "../src/review-runtime";
import { runSpecialist, SPECIALISTS } from "../src/specialists";
// @ts-ignore plain .mjs shared with the other scripts
import { buildBundle, SOURCES } from "./lib/bundle.mjs";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const repo = args.find((a) => !a.startsWith("--"));
const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
if (!repo) {
  console.error("usage: tsx scripts/scan-repo.ts <path-to-git-repo> [--out findings.json] [--skip id,id]");
  process.exit(2);
}
const skip = new Set((flag("--skip") ?? "change-control").split(",").filter(Boolean));

const git = (...a: string[]) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8", maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "ignore"] });
const commit = git("rev-parse", "HEAD").trim();
const allFiles = parseUnifiedDiff(git("diff", "--no-color", EMPTY_TREE, "HEAD"));
const files = reviewable(allFiles);

initRegorus(fs.readFileSync(path.join(root, "vendor/regorus/regorusjs_bg.wasm")));
const engine = PolicyEngine.fromBundle(buildBundle(SOURCES.map((s: { dir: string; prefix: string }) => ({ ...s, dir: path.join(root, s.dir) }))));

const ctx = {
  files,
  // Lockfiles are filtered out of the review diff but carry the exact dependency versions licensing needs.
  allFiles,
  // A whole repository has far more dependencies than one pull request: look up many, and skip the optional enrichment.
  maxDependencies: Number(flag("--max-deps") ?? 600),
  licenseEnrichment: false,
  prMeta: { title: "baseline scan", body: "", approvals: 0 },
  engine,
  ai: { run: async () => { throw new Error("models are disabled for baseline scans"); } },
  fetchFile: async (p: string) => { try { return git("show", `HEAD:${p}`); } catch { return null; } },
  fetchJson: fetchJsonWithTimeout,
};

const all: Finding[] = [];
const timings: Record<string, number> = {};
for (const s of SPECIALISTS) {
  if (skip.has(s.id)) continue;
  const t = Date.now();
  all.push(...(await runSpecialist(s, ctx)));
  timings[s.id] = Date.now() - t;
}
const findings = mergeFindings(all);

const summary: Record<string, Record<string, number>> = {};
for (const f of findings) {
  summary[f.specialist] ??= { block: 0, warn: 0, info: 0 };
  summary[f.specialist][f.severity]++;
}
const result = { commit, policyVersion: engine.version, filesScanned: files.length, packagesChecked: Math.min(Number(flag("--max-deps") ?? 600), extractCargoPackages(allFiles).length), skipped: [...skip], timings, summary, findings };
const out = flag("--out");
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ commit, policyVersion: engine.version, filesScanned: files.length, skipped: [...skip], timings, summary, total: findings.length }, null, 2));
