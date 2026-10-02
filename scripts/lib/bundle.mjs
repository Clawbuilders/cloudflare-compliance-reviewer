// Shared by the CLI scripts and the tests: collect Rego into a deterministic, versioned bundle.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Policies we never ship: tests, and GOPAL's education pack (Regorus rejects ferpa_compliance.rego:64). */
export function isShippable(relPath) {
  return relPath.endsWith(".rego") && !relPath.endsWith("_test.rego") && !relPath.split("/").includes("education");
}

/** @param {{dir: string, prefix: string}[]} sources */
export function buildBundle(sources) {
  const files = {};
  for (const { dir, prefix } of sources) {
    if (!fs.existsSync(dir)) continue;
    for (const full of walk(dir)) {
      const rel = path.relative(dir, full).split(path.sep).join("/");
      if (isShippable(rel)) files[prefix + rel] = fs.readFileSync(full, "utf8");
    }
  }
  const hash = crypto.createHash("sha256");
  for (const key of Object.keys(files).sort()) hash.update(`${key}\0${files[key]}\0`);
  return { version: hash.digest("hex").slice(0, 12), files };
}

/** Where our sources live, relative to the repo root. */
export const SOURCES = [
  { dir: "policies/committee", prefix: "committee/" },
  { dir: "policies/vendor/gopal", prefix: "gopal/" },
];
