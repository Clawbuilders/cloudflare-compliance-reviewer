// Build dist/bundle.json from our policies + vendored GOPAL. Run: npm run policies:bundle
import fs from "node:fs";
import path from "node:path";
import { buildBundle, SOURCES } from "./lib/bundle.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const bundle = buildBundle(SOURCES.map((s) => ({ ...s, dir: path.join(root, s.dir) })));
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/bundle.json"), JSON.stringify(bundle));
fs.writeFileSync(path.join(root, "dist/ACTIVE"), bundle.version); // no trailing newline
console.log(`bundle ${bundle.version}: ${Object.keys(bundle.files).length} policy files`);
