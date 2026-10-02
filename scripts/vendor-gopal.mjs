// Vendor a pinned GOPAL commit (Apache-2.0) into policies/vendor/gopal. Run: npm run policies:vendor
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const COMMIT = "e565a6020cba595db630f8a037859f3a0b81d837"; // tested in the Episode 6 spike: 835/843 tests pass under Regorus
const KEEP = ["helper_functions", "global", "international"]; // no education pack (see scripts/lib/bundle.mjs)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dest = path.join(root, "policies/vendor/gopal");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gopal-"));
try {
  const url = `https://codeload.github.com/Principled-Evolution/gopal/tar.gz/${COMMIT}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  const tarball = path.join(tmp, "gopal.tar.gz");
  fs.writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));
  execFileSync("tar", ["-xzf", tarball, "-C", tmp]);
  const src = path.join(tmp, `gopal-${COMMIT}`);

  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const dir of KEEP) fs.cpSync(path.join(src, dir), path.join(dest, dir), { recursive: true });
  fs.copyFileSync(path.join(src, "LICENSE"), path.join(dest, "LICENSE"));
  fs.writeFileSync(
    path.join(dest, "SOURCE.md"),
    `# Vendored GOPAL\n\nSource: https://github.com/Principled-Evolution/gopal\nCommit: ${COMMIT}\nLicense: Apache-2.0 (see LICENSE)\nIncluded: ${KEEP.join(", ")} (unmodified). Excluded: industry_specific/* (education pack does not load in Regorus).\nRefresh with \`npm run policies:vendor\`.\n`,
  );
  console.log(`Vendored GOPAL ${COMMIT.slice(0, 12)} -> ${path.relative(root, dest)}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
