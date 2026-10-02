import { describe, expect, it } from "vitest";
import { findingId, mergeFindings, type Finding } from "../src/findings";

const f = (over: Partial<Finding>): Finding => ({
  id: "x",
  specialist: "privacy",
  severity: "warn",
  title: "t",
  message: "m",
  citations: [],
  rule: "r",
  kind: "HEURISTIC",
  ...over,
});

describe("findingId", () => {
  it("is stable, 8 hex chars, and differs per file/title/rule", () => {
    const a = findingId("privacy", "pii_logging", "src/a.ts", "PII in logs");
    expect(a).toBe(findingId("privacy", "pii_logging", "src/a.ts", "PII in logs"));
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(a).not.toBe(findingId("privacy", "pii_logging", "src/b.ts", "PII in logs"));
    expect(a).not.toBe(findingId("privacy", "other_rule", "src/a.ts", "PII in logs"));
    expect(findingId("privacy", "r", undefined, "t")).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("mergeFindings", () => {
  it("dedupes by id and sorts block before warn before info", () => {
    const merged = mergeFindings([
      f({ id: "1", severity: "info", title: "c" }),
      f({ id: "2", severity: "block", title: "a" }),
      f({ id: "2", severity: "block", title: "a" }),
      f({ id: "3", severity: "warn", title: "b" }),
    ]);
    expect(merged.map((x) => x.id)).toEqual(["2", "3", "1"]);
  });

  it("keeps the highest severity when the same id appears twice", () => {
    const merged = mergeFindings([f({ id: "1", severity: "warn" }), f({ id: "1", severity: "block" })]);
    expect(merged).toHaveLength(1);
    expect(merged[0].severity).toBe("block");
  });
});
