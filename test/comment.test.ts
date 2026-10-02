import { describe, expect, it } from "vitest";
import { MARKER, renderComment } from "../src/comment";
import type { Finding } from "../src/findings";

const base: Finding = {
  id: "abcd1234",
  specialist: "privacy",
  severity: "block",
  title: "Personal data written to logs",
  message: "console.log writes an email address.",
  citations: ["GDPR Art. 5(1)(c)", "PIPEDA 4.7"],
  file: "src/user.ts",
  rule: "pii_logging",
  kind: "HEURISTIC",
};
const ctx = { waived: new Set<string>(), policyVersion: "0690d890a795", tier: "clef", skipped: [] as string[] };

describe("renderComment", () => {
  it("contains the marker, policy version, finding id, citations and the disclaimer", () => {
    const md = renderComment({ ...ctx, findings: [base] });
    expect(md).toContain(MARKER);
    expect(md).toContain("0690d890a795");
    expect(md).toContain("abcd1234");
    expect(md).toContain("GDPR Art. 5(1)(c)");
    expect(md).toMatch(/not legal advice/i);
    expect(md).toContain("/waive abcd1234");
  });

  it("says so when there are no findings", () => {
    expect(renderComment({ ...ctx, findings: [] })).toMatch(/no findings/i);
  });

  it("strikes through waived findings and drops the waive hint", () => {
    const md = renderComment({ ...ctx, findings: [base], waived: new Set(["abcd1234"]) });
    expect(md).toContain("~~");
    expect(md).toMatch(/waived/i);
    expect(md).not.toContain("/waive abcd1234");
  });

  it("neutralises mentions and HTML coming from the diff (Review Focus 5)", () => {
    const hostile: Finding = {
      ...base,
      title: "@octocat <script>alert(1)</script> [click](http://evil.example)",
      file: "src/@octocat`<img src=x>.ts",
      message: "ping @everyone and <b>bold</b>",
    };
    const md = renderComment({ ...ctx, findings: [hostile] });
    expect(md).not.toMatch(/@(octocat|everyone)/);
    expect(md).not.toContain("<script>");
    expect(md).not.toContain("<img");
    expect(md).not.toContain("<b>");
    expect(md).not.toContain("](http://evil.example)");
  });

  it("lists specialists that triage skipped", () => {
    const md = renderComment({ ...ctx, findings: [], skipped: ["casl", "sensitive-data"] });
    expect(md).toContain("casl");
    expect(md).toContain("sensitive-data");
  });
});
