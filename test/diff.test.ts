import { describe, expect, it } from "vitest";
import { parseUnifiedDiff, reviewable, truncateForModel } from "../src/diff";

const MODIFIED = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 keep
-old line
+new line
+another new line
 keep2
`;
const ADDED = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..333
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+export const x = 1;
+export const y = 2;
`;
const DELETED = `diff --git a/old.ts b/old.ts
deleted file mode 100644
index 444..0000000
--- a/old.ts
+++ /dev/null
@@ -1 +0,0 @@
-gone
`;
const RENAMED = `diff --git a/a.ts b/b.ts
similarity index 100%
rename from a.ts
rename to b.ts
`;
const BINARY = `diff --git a/logo.png b/logo.png
new file mode 100644
index 0000000..555
Binary files /dev/null and b/logo.png differ
`;

describe("parseUnifiedDiff", () => {
  it("parses modified files with added and removed lines", () => {
    const [f] = parseUnifiedDiff(MODIFIED);
    expect(f).toMatchObject({ path: "src/a.ts", status: "modified", additions: 2, deletions: 1, binary: false });
    expect(f.added).toEqual(["new line", "another new line"]);
    expect(f.removed).toEqual(["old line"]);
  });

  it("detects added, deleted, renamed and binary files", () => {
    const files = parseUnifiedDiff([ADDED, DELETED, RENAMED, BINARY].join(""));
    expect(files.map((f) => [f.path, f.status, f.binary])).toEqual([
      ["src/new.ts", "added", false],
      ["old.ts", "deleted", false],
      ["b.ts", "renamed", false],
      ["logo.png", "added", true],
    ]);
  });

  it("returns [] for an empty or whitespace-only diff (Review Focus 4)", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
    expect(parseUnifiedDiff("\n\n  \n")).toEqual([]);
  });
});

describe("reviewable", () => {
  it("drops lockfiles, dist, vendor, minified and binary files but keeps package.json", () => {
    const text = ["package-lock.json", "dist/x.js", "vendor/a.go", "web/app.min.js", "package.json", "src/ok.ts"]
      .map((p) => `diff --git a/${p} b/${p}\n--- a/${p}\n+++ b/${p}\n@@ -1 +1 @@\n-a\n+b\n`)
      .join("");
    const kept = reviewable([...parseUnifiedDiff(text), ...parseUnifiedDiff(BINARY)]).map((f) => f.path);
    expect(kept).toEqual(["package.json", "src/ok.ts"]);
  });

  it("returns [] for a lockfile-only diff (Review Focus 4)", () => {
    const lock = "diff --git a/yarn.lock b/yarn.lock\n--- a/yarn.lock\n+++ b/yarn.lock\n@@ -1 +1 @@\n-a\n+b\n";
    expect(reviewable(parseUnifiedDiff(lock))).toEqual([]);
  });
});

describe("truncateForModel", () => {
  it("never exceeds the budget and says what it dropped (Review Focus 4)", () => {
    const big = Array.from({ length: 200 }, (_, i) => `+line number ${i} with some padding text`).join("\n");
    const text = `diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -0,0 +1,200 @@\n${big}\n`;
    const files = parseUnifiedDiff(text.repeat(3).replace(/a\.ts/g, "f.ts"));
    const out = truncateForModel(files, 500);
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out).toMatch(/truncated/);
  });

  it("returns everything when it fits", () => {
    const out = truncateForModel(parseUnifiedDiff(MODIFIED), 10_000);
    expect(out).toContain("src/a.ts");
    expect(out).toContain("+new line");
    expect(out).not.toMatch(/truncated/);
  });
});
