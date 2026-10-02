import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initRegorus, PolicyEngine, type PolicyBundle } from "../../src/policy-engine";
import { buildBundle, SOURCES } from "../../scripts/lib/bundle.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Initialise the Regorus wasm once for Node-based tests (Workers use a static wasm import instead). */
export function ensureRegorus(): void {
  initRegorus(fs.readFileSync(path.join(root, "vendor/regorus/regorusjs_bg.wasm")));
}

/** Build an engine from inline Rego sources: { "a.rego": "package a ..." }. */
export function engineFrom(files: Record<string, string>, version = "test"): PolicyEngine {
  ensureRegorus();
  const bundle: PolicyBundle = { version, files };
  return PolicyEngine.fromBundle(bundle);
}

/** Build an engine from the real committee policies on disk (our policies only, no GOPAL). */
export function committeeEngine(): PolicyEngine {
  ensureRegorus();
  const dir = path.join(root, "policies/committee");
  const files: Record<string, string> = {};
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith(".rego") && !f.endsWith("_test.rego")) files[`committee/${f}`] = fs.readFileSync(path.join(dir, f), "utf8");
  }
  return PolicyEngine.fromBundle({ version: "disk", files });
}

/** The real production bundle: our committee policies plus the vendored GOPAL tree. Cached — building it parses ~60 files. */
let full: PolicyEngine | undefined;
export function fullEngine(): PolicyEngine {
  ensureRegorus();
  if (!full) {
    const bundle = buildBundle(SOURCES.map((s) => ({ ...s, dir: path.join(root, s.dir) })));
    full = PolicyEngine.fromBundle(bundle);
  }
  return full;
}
