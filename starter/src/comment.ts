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

/** Model output is untrusted too: no pings, no HTML, no clickable links. Markdown (lists, code fences) is kept. */
function defuse(s: string): string {
  return s.replace(/@/g, "@​").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\]\(/g, "]​(");
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
      for (const f of group) lines.push(`- ${code(f.file)} — ${f.message}`, `  ${code(f.snippet)}`);
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
