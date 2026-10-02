// Run every test_* rule under policies/ (ours + vendored GOPAL) through the same Regorus engine the Worker uses.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const { initSync, Engine } = await import(path.join(root, "vendor/regorus/regorusjs.js"));
initSync({ module: fs.readFileSync(path.join(root, "vendor/regorus/regorusjs_bg.wasm")) });

function walk(d, out = []) {
  if (!fs.existsSync(d)) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    e.isDirectory() ? walk(p, out) : p.endsWith(".rego") && out.push(p);
  }
  return out;
}

const engine = new Engine();
const loaded = new Map();
for (const f of walk(path.join(root, "policies"))) loaded.set(f, engine.addPolicy(f, fs.readFileSync(f, "utf8")));

let pass = 0;
const failures = [];
for (const [file, pkg] of loaded) {
  if (!file.endsWith("_test.rego")) continue;
  const names = [...new Set([...fs.readFileSync(file, "utf8").matchAll(/^(test_[A-Za-z0-9_]+)/gm)].map((m) => m[1]))];
  for (const name of names) {
    try {
      const out = JSON.parse(engine.evalQuery(`${pkg}.${name}`));
      out.result?.[0]?.expressions?.[0]?.value === true ? pass++ : failures.push(`${path.relative(root, file)} :: ${name}`);
    } catch (e) {
      failures.push(`${path.relative(root, file)} :: ${name} (${String(e).split("\n")[0]})`);
    }
  }
}
console.log(`policy tests: ${pass} passed, ${failures.length} failed (${loaded.size} files loaded)`);
failures.slice(0, 30).forEach((f) => console.log("  FAIL", f));
process.exit(failures.length ? 1 : 0);
