/**
 * Deterministic accessibility checks (HEURISTIC — regex over added lines, not a browser). Each rule maps to a WCAG 2.2
 * success criterion. They are cheap, explainable and run before any model: the model only turns flags into fix advice.
 * AODA (Ontario), the ADA and the EU Accessibility Act all point at WCAG, so these criteria are the common currency.
 */
import type { DiffFile } from "./diff";

export interface A11yFlag {
  rule: string;
  wcag: string;
  level: "A" | "AA";
  file: string;
  snippet: string;
  message: string;
}

const UI = /\.(tsx|jsx|html?|vue|svelte|css|scss)$/i;
export const isUiFile = (path: string): boolean => UI.test(path);

const snip = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 100);
const has = (attrs: string, re: RegExp) => re.test(attrs);
const visibleText = (inner: string) => inner.replace(/<[^>]*>/g, "").trim();
const hasImgAlt = (inner: string) => /<img\b[^>]*\balt\s*=\s*(?:"[^"]+"|'[^']+'|\{)/i.test(inner);

export function findA11yIssues(files: DiffFile[]): A11yFlag[] {
  const flags: A11yFlag[] = [];
  for (const f of files) {
    if (!isUiFile(f.path)) continue;
    // `=>` would end a tag match early (arrow functions in JSX props), so neutralise it first.
    const text = f.added.join("\n").replace(/=>/g, "=_");
    const add = (rule: string, wcag: string, level: "A" | "AA", match: string, message: string) =>
      flags.push({ rule, wcag, level, file: f.path, snippet: snip(match), message });

    for (const m of text.matchAll(/<img\b[^>]*>/gi)) {
      if (!has(m[0], /\balt\s*=/i)) add("img-alt", "1.1.1", "A", m[0], 'Image has no alt attribute. Add descriptive alt text, or alt="" if it is purely decorative.');
    }
    for (const m of text.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
      const named = has(m[1], /\b(aria-label|aria-labelledby|title)\s*=/i) || visibleText(m[2]) !== "" || hasImgAlt(m[2]);
      if (!named) add("button-name", "4.1.2", "A", m[0], "Button has no accessible name. Add visible text or an aria-label.");
    }
    for (const m of text.matchAll(/<a\b([^>]*\bhref\b[^>]*)>([\s\S]*?)<\/a>/gi)) {
      const named = has(m[1], /\b(aria-label|aria-labelledby|title)\s*=/i) || visibleText(m[2]) !== "" || hasImgAlt(m[2]);
      if (!named) add("link-name", "4.1.2", "A", m[0], "Link has no accessible name. Add link text or an aria-label.");
    }
    for (const m of text.matchAll(/<input\b([^>]*)>/gi)) {
      const type = /\btype\s*=\s*["']?(\w+)/i.exec(m[1])?.[1]?.toLowerCase();
      if (type && ["hidden", "submit", "button", "reset", "image"].includes(type)) continue;
      if (!has(m[1], /\b(aria-label|aria-labelledby|id)\s*=/i)) {
        add("input-label", "1.3.1", "A", m[0], "Input has no label hook. Add an id with a matching <label for>, or an aria-label.");
      }
    }
    for (const m of text.matchAll(/tab[iI]ndex\s*=\s*(?:\{\s*|["'])\s*(-?\d+)/g)) {
      if (parseInt(m[1], 10) > 0) add("tabindex-positive", "2.4.3", "A", m[0], "Positive tabindex overrides the natural focus order. Use 0 or -1 and fix the DOM order instead.");
    }
    for (const m of text.matchAll(/outline\s*:\s*['"]?(?:none|0(?:px)?)(?![\w.-])/gi)) {
      add("focus-visible", "2.4.7", "AA", m[0], "Removing the focus outline hides keyboard focus. Provide a visible replacement (e.g. :focus-visible styles).");
    }
    for (const m of text.matchAll(/<(?:div|span)\b([^>]*)>/gi)) {
      if (has(m[1], /\bonClick\s*=/i) && !has(m[1], /\brole\s*=/i)) {
        add("click-handler-role", "4.1.2", "A", m[0], "Click handler on a non-interactive element. Use a <button>, or add role and keyboard handling.");
      }
    }
  }
  return flags;
}
