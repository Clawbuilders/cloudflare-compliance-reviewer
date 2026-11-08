import { describe, expect, it } from "vitest";
import type { A11yFlag } from "../src/a11y-rules";
import { defuse, MARKER, renderA11yComment } from "../src/comment";

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

  it("keeps code fences literal: GitHub shows fenced text as-is, so escaping it would print &lt; to the reader", () => {
    const md = renderA11yComment([flag], 'Add a name:\n```tsx\n<Avatar alt="Ada" /> // @octocat\n```\nThen <b>check</b> @everyone');
    expect(md).toContain('> <Avatar alt="Ada" /> // @octocat');
    expect(md).not.toContain("&lt;Avatar");
    expect(md).toContain("&lt;b&gt;check&lt;/b&gt;");
    expect(md).not.toMatch(/@everyone/);
  });

  it("escapes again after a fence closes, and does not treat look-alike lines as fences", () => {
    expect(defuse("~~~\n<a>\n~~~\n<a>")).toBe("~~~\n<a>\n~~~\n&lt;a&gt;");
    // A closing fence must use the same character and be at least as long as the opener.
    expect(defuse("````\n```\n<a>\n````\n<a>")).toBe("````\n```\n<a>\n````\n&lt;a&gt;");
    // Not fences to GitHub: indented four spaces, or a backtick info string that contains a backtick.
    expect(defuse("    ```\n<script>")).toBe("    ```\n&lt;script&gt;");
    expect(defuse("``` a`b\n<script>")).not.toContain("<script>");
    expect(defuse("> ```\n<script>")).not.toContain("<script>");
  });
});
