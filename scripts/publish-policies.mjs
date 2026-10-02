// Publish the policy bundle to R2 and point policies/ACTIVE at it.
//   npm run policies:publish -- --local     (wrangler dev's local R2)
//   npm run policies:publish -- --remote    (your real bucket)
// Publishing a new bundle changes agent behaviour with NO Worker redeploy; every verdict records the version it used.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const mode = args.includes("--remote") ? "--remote" : args.includes("--local") ? "--local" : null;
if (!mode) {
  console.error("Pass --local or --remote.");
  process.exit(2);
}
const bucketFlag = args.indexOf("--bucket");
const bucket = bucketFlag >= 0 ? args[bucketFlag + 1] : "compliance-policies";

execFileSync("node", [path.join(root, "scripts/build-bundle.mjs")], { stdio: "inherit" });
const version = fs.readFileSync(path.join(root, "dist/ACTIVE"), "utf8");
const put = (key, file, type) =>
  execFileSync("npx", ["wrangler", "r2", "object", "put", `${bucket}/${key}`, "--file", file, "--content-type", type, mode], {
    cwd: root,
    stdio: "inherit",
  });

// Bundle first, pointer second: agents never see a pointer to a missing bundle.
put(`policies/${version}/bundle.json`, path.join(root, "dist/bundle.json"), "application/json");
put("policies/ACTIVE", path.join(root, "dist/ACTIVE"), "text/plain");
console.log(`Active policy version -> ${version} (${mode.slice(2)})`);
