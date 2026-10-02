import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs helper shared with the CLI scripts
import { buildBundle } from "../scripts/lib/bundle.mjs";

const dirs: string[] = [];
function tmp(files: Record<string, string>): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-"));
  dirs.push(d);
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true });
    fs.writeFileSync(path.join(d, rel), content);
  }
  return d;
}
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe("buildBundle", () => {
  it("is deterministic: same inputs give the same version", () => {
    const d = tmp({ "a.rego": "package a", "sub/b.rego": "package b" });
    const one = buildBundle([{ dir: d, prefix: "x/" }]);
    const two = buildBundle([{ dir: d, prefix: "x/" }]);
    expect(one.version).toBe(two.version);
    expect(one.version).toMatch(/^[0-9a-f]{12}$/);
    expect(Object.keys(one.files).sort()).toEqual(["x/a.rego", "x/sub/b.rego"]);
  });

  it("changes version when a single byte changes", () => {
    const a = buildBundle([{ dir: tmp({ "a.rego": "package a" }), prefix: "" }]);
    const b = buildBundle([{ dir: tmp({ "a.rego": "package b" }), prefix: "" }]);
    expect(a.version).not.toBe(b.version);
  });

  it("excludes *_test.rego and education packs", () => {
    const d = tmp({
      "ok.rego": "package ok",
      "ok_test.rego": "package ok_test",
      "industry_specific/education/v1/x.rego": "package edu",
      "notes.md": "ignore me",
    });
    const { files } = buildBundle([{ dir: d, prefix: "" }]);
    expect(Object.keys(files)).toEqual(["ok.rego"]);
  });
});
