import { describe, expect, it } from "vitest";
import { findA11yIssues, isUiFile } from "../src/a11y-rules";
import { parseUnifiedDiff } from "../src/diff";

/** Build a one-file diff whose added lines are `lines`. */
function diffOf(path: string, lines: string[], removed: string[] = []): ReturnType<typeof parseUnifiedDiff> {
  const body = [...removed.map((l) => `-${l}`), ...lines.map((l) => `+${l}`)].join("\n");
  return parseUnifiedDiff(`diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,${lines.length} @@\n${body}\n`);
}
const rules = (path: string, lines: string[], removed?: string[]) => findA11yIssues(diffOf(path, lines, removed)).map((f) => f.rule);

describe("isUiFile", () => {
  it("accepts markup and style files, rejects the rest", () => {
    for (const p of ["a.tsx", "a.jsx", "x/y.html", "a.vue", "a.svelte", "a.css", "a.scss"]) expect(isUiFile(p)).toBe(true);
    for (const p of ["a.ts", "a.md", "a.json", "a.rs"]) expect(isUiFile(p)).toBe(false);
  });
});

describe("img-alt (WCAG 1.1.1)", () => {
  it("flags an image without alt, including multi-line JSX tags", () => {
    expect(rules("a.tsx", ['<img src="/logo.png" />'])).toEqual(["img-alt"]);
    expect(rules("a.tsx", ["<img", '  src="/logo.png"', "  className={c}", "/>"])).toEqual(["img-alt"]);
  });
  it("accepts alt text, alt={expr} and decorative alt=\"\"", () => {
    expect(rules("a.tsx", ['<img src="a" alt="Logo" />', "<img src={s} alt={t} />", '<img src="a" alt="" />'])).toEqual([]);
  });
});

describe("button-name / link-name (WCAG 4.1.2)", () => {
  it("flags an icon-only button and link without an accessible name", () => {
    expect(rules("a.tsx", ["<button onClick={go}><svg /></button>"])).toEqual(["button-name"]);
    expect(rules("a.tsx", ['<a href="/x"><img src="i" alt="" /></a>'])).toEqual(["link-name"]);
  });
  it("accepts visible text, aria-label and title", () => {
    expect(rules("a.tsx", ["<button>Save</button>", '<button aria-label="Close"><svg /></button>', '<a href="/x" title="Home"><svg /></a>'])).toEqual([]);
  });
});

describe("input-label (WCAG 1.3.1)", () => {
  it("flags an input with no label hook", () => {
    expect(rules("a.tsx", ['<input type="text" name="email" />'])).toEqual(["input-label"]);
  });
  it("accepts aria-label, id (for a <label for>), hidden and button-like inputs", () => {
    expect(rules("a.tsx", ['<input aria-label="Email" />', '<input id="email" />', '<input type="hidden" name="t" />', '<input type="submit" />'])).toEqual([]);
  });
});

describe("tabindex-positive (WCAG 2.4.3)", () => {
  it("flags positive tabindex in HTML and JSX, not 0 or -1", () => {
    expect(rules("a.html", ['<div tabindex="3">'])).toEqual(["tabindex-positive"]);
    expect(rules("a.tsx", ["<div tabIndex={2}>"])).toEqual(["tabindex-positive"]);
    expect(rules("a.tsx", ["<div tabIndex={0}>", '<div tabindex="-1">'])).toEqual([]);
  });
});

describe("focus-visible (WCAG 2.4.7)", () => {
  it("flags outline removal in CSS and inline styles", () => {
    expect(rules("a.css", ["button:focus { outline: none; }"])).toEqual(["focus-visible"]);
    expect(rules("a.tsx", ["<div style={{ outline: 0 }} />"])).toEqual(["focus-visible"]);
  });
});

describe("click-handler-role (WCAG 4.1.2 / 2.1.1)", () => {
  it("flags onClick on a div/span without a role, accepts one with a role", () => {
    expect(rules("a.tsx", ["<div onClick={go}>Go</div>"])).toEqual(["click-handler-role"]);
    expect(rules("a.tsx", ['<div role="button" tabIndex={0} onClick={go}>Go</div>'])).toEqual([]);
  });
});

describe("snippets are complete, readable tokens", () => {
  it("includes the closing brace/quote of tabindex and outline matches", () => {
    const snippets = findA11yIssues(diffOf("a.tsx", ["<div tabIndex={3}>", '<div style={{ outline: "none" }} />'])).map((f) => f.snippet);
    expect(snippets).toContain("tabIndex={3}");
    expect(snippets).toContain('outline: "none"');
  });
});

describe("scope", () => {
  it("ignores non-UI files and removed lines", () => {
    expect(rules("a.ts", ['const s = "<img src=x>";'])).toEqual([]);
    expect(rules("a.tsx", ['<img src="a" alt="ok" />'], ['<img src="old" />'])).toEqual([]);
  });
  it("reports the file, a short snippet and the WCAG criterion", () => {
    const [f] = findA11yIssues(diffOf("web/App.tsx", ['<img src="/logo.png" />']));
    expect(f).toMatchObject({ rule: "img-alt", wcag: "1.1.1", level: "A", file: "web/App.tsx" });
    expect(f.snippet).toContain("<img");
    expect(f.message.length).toBeGreaterThan(10);
  });
});
