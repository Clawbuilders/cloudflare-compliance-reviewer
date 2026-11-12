import type { A11yFlag } from "./a11y-rules";

export const MARKER = "<!-- clawbuilders-a11y-reviewer -->";

const CRITERIA: Record<string, string> = {
  "1.1.1": "Non-text Content",
  "1.3.1": "Info and Relationships",
  "2.4.3": "Focus Order",
  "2.4.7": "Focus Visible",
  "4.1.2": "Name, Role, Value",
};

/** Anything derived from a diff goes in a code span with markup and mentions defused. */
function code(s: string): string {
  return "`" + s.replace(/`/g, "").replace(/</g, "‹").replace(/>/g, "›").replace(/@/g, "@​") + "`";
}

/** Outside a code fence: no pings, no HTML, no clickable links. */
function defuseProse(s: string): string {
  return s.replace(/@/g, "@​").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\]\(/g, "]​(");
}

/** A fence after its indentation: 3+ backticks (whose info string has no backtick) or 3+ tildes. */
const FENCE_OPEN = /^(`{3,}(?=[^`]*$)|~{3,})/;
/** A list item marker and the spaces after it: its length is the column the item's content starts at. */
const LIST_ITEM = /^( *)(?:[-*+]|\d{1,9}[.)])( +)(?=\S)/;

/**
 * Inline code spans are literal on GitHub (no HTML, no mentions, no links), so their text is kept as it is and only the
 * prose around them is defused. A backtick run with no closing run of the same length is not a code span: that line and the
 * rest of its paragraph are defused whole, so a span GitHub might pair differently is never left unescaped.
 */
function defuseLine(line: string, state: { openTick: boolean }): string {
  if (state.openTick) return defuseProse(line);
  let out = "";
  let i = 0;
  while (i < line.length) {
    const tick = line.indexOf("`", i);
    if (tick < 0) {
      out += defuseProse(line.slice(i));
      break;
    }
    const run = line.slice(tick).match(/^`+/)![0];
    const close = line.slice(tick + run.length).search(new RegExp(`(?<!\`)${run}(?!\`)`));
    if (close < 0) {
      state.openTick = true;
      return defuseProse(line);
    }
    const end = tick + run.length + close + run.length;
    out += defuseProse(line.slice(i, tick)) + line.slice(tick, end);
    i = end;
  }
  return out;
}

/**
 * Model output is untrusted too: no pings, no HTML, no clickable links. Markdown (lists, code) is kept.
 * Code is literal on GitHub (no HTML, no mentions, no links), so it is left as it is: escaping it would show
 * `&lt;Avatar /&gt;` instead of `<Avatar />`. That covers fenced blocks, including ones indented inside a list item (the
 * model often writes "1. Fix ... then a fenced block"), and inline code spans. Fences are matched conservatively: an
 * indent counts only if it is at most 3 spaces from the margin or from the current list item's content column, so a line
 * that is not a fence to GitHub is never treated as one here.
 */
export function defuse(s: string): string {
  let fence: { char: string; len: number } | undefined;
  let listIndent = 0;
  const ticks = { openTick: false };
  return s
    .split("\n")
    .map((line) => {
      if (fence) {
        const close = line.match(/^ *(`{3,}|~{3,})\s*$/);
        if (close && close[1][0] === fence.char && close[1].length >= fence.len) fence = undefined;
        return line;
      }
      if (!line.trim()) {
        ticks.openTick = false;
        return line;
      }
      const indent = line.match(/^ */)![0].length;
      const inList = listIndent > 0 && indent >= listIndent && indent - listIndent <= 3;
      const open = (indent <= 3 || inList) ? line.slice(indent).match(FENCE_OPEN) : null;
      if (open) {
        fence = { char: open[1][0], len: open[1].length };
        const head = indent + open[0].length;
        return line.slice(0, head) + defuseProse(line.slice(head));
      }
      const item = line.match(LIST_ITEM);
      if (item) listIndent = item[0].length;
      else if (indent === 0) listIndent = 0;
      return defuseLine(line, ticks);
    })
    .join("\n");
}

export function renderA11yComment(flags: A11yFlag[], suggestions: string): string {
  const lines = [MARKER, "## ClawBuilders Accessibility Review (Starter)", ""];
  if (flags.length === 0) {
    lines.push("No accessibility issues found by the heuristic checks in this change.");
  } else {
    lines.push(`Found **${flags.length}** potential accessibility ${flags.length === 1 ? "issue" : "issues"}.`, "");
    const byCriterion = new Map<string, A11yFlag[]>();
    for (const f of flags) byCriterion.set(f.wcag, [...(byCriterion.get(f.wcag) ?? []), f]);
    for (const [sc, group] of byCriterion) {
      lines.push(`### WCAG ${sc} — ${CRITERIA[sc] ?? "Success Criterion"} (Level ${group[0].level})`);
      for (const f of group) lines.push(`- ${code(f.file)} — ${defuseProse(f.message)}`, `  ${code(f.snippet)}`);
      lines.push("");
    }
  }
  if (suggestions.trim()) lines.push("### Suggested fixes", ...defuse(suggestions.trim()).split("\n").map((l) => `> ${l}`), "");
  lines.push(
    "---",
    "<sub>Heuristic checks against WCAG 2.2, which AODA (Ontario), the ADA and the EU Accessibility Act build on. This flags risk for humans and is **not legal advice**; verify with an accessibility audit and qualified counsel.</sub>",
  );
  return lines.join("\n");
}
