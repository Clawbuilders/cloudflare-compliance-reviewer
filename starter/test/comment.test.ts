import { describe, expect, it } from "vitest";
import type { A11yFlag } from "../src/a11y-rules";
import { MARKER, renderA11yComment } from "../src/comment";

const flag: A11yFlag = {
  rule: "img-alt",
  wcag: "1.1.1",
  level: "A",
  file: "src/App.tsx",
  snippet: '<img src="/logo.png" />',
  message: "Image has no alt attribute.",
};

describe("renderA11yComment", () => {
  it("lists flags with WCAG criterion and level, the marker and the disclaimer", () => {
    const md = renderA11yComment([flag], "");
    expect(md).toContain(MARKER);
    expect(md).toContain("1.1.1");
    expect(md).toContain("Level A");
    expect(md).toContain("src/App.tsx");
    expect(md).toMatch(/not legal advice/i);
  });

  it("says so when nothing was found", () => {
    expect(renderA11yComment([], "")).toMatch(/no accessibility issues/i);
  });

  it("neutralises mentions and HTML from the model text and the diff (Review Focus 5)", () => {
    const md = renderA11yComment([{ ...flag, snippet: "<img src=x onerror=alert(1)> @octocat" }], "ping @everyone <script>x</script>");
    expect(md).not.toMatch(/@(octocat|everyone)/);
    expect(md).not.toContain("<script>");
    expect(md).not.toContain("<img src=x");
  });
});
