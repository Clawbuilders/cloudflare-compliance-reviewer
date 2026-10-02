import type { Finding, Severity } from "./findings";

export const MARKER = "<!-- clawbuilders-compliance-committee -->";

/** Neutralise anything attacker-controlled (diff text, file paths): no pings, no HTML, no link syntax. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/@/g, "@​")
    .replace(/[[\]()]/g, (c) => `\\${c}`);
}

function code(s: string): string {
  return "`" + s.replace(/`/g, "").replace(/</g, "‹").replace(/>/g, "›").replace(/@/g, "@​") + "`";
}

const HEADINGS: Record<Severity, string> = { block: "Blocking", warn: "Warnings", info: "Notes" };

export interface RenderInput {
  findings: Finding[];
  waived: Set<string>;
  policyVersion: string;
  tier: string;
  skipped: string[];
}

export function renderComment({ findings, waived, policyVersion, tier, skipped }: RenderInput): string {
  const open = findings.filter((f) => !waived.has(f.id));
  const count = (s: Severity) => open.filter((f) => f.severity === s).length;
  const lines: string[] = [MARKER, "## ClawBuilders Compliance Committee", ""];

  if (findings.length === 0) {
    lines.push("No findings. The committee reviewed this change and its policies raised nothing.");
  } else {
    lines.push(`**${count("block")} blocking · ${count("warn")} warnings · ${count("info")} notes**` + (waived.size ? ` · ${waived.size} waived` : ""), "");
    for (const sev of ["block", "warn", "info"] as Severity[]) {
      const group = findings.filter((f) => f.severity === sev);
      if (!group.length) continue;
      lines.push(`### ${HEADINGS[sev]}`);
      for (const f of group) {
        const where = f.file ? ` — ${code(f.file)}` : "";
        if (waived.has(f.id)) {
          lines.push(`- ~~**${esc(f.title)}**~~${where} — waived (id \`${f.id}\`)`);
          continue;
        }
        lines.push(`- **${esc(f.title)}**${where} _(${esc(f.specialist)} · ${f.kind})_`);
        lines.push(`  ${esc(f.message)}`);
        if (f.citations.length) lines.push(`  Cites: ${f.citations.join("; ")}`);
        lines.push(`  ID \`${f.id}\`` + (sev === "block" ? ` · reply \`/waive ${f.id} <reason>\` to request a waiver (a different maintainer must \`/approve ${f.id}\`)` : ""));
      }
      lines.push("");
    }
  }

  if (skipped.length) lines.push(`Specialists skipped by triage: ${skipped.map((s) => `\`${s}\``).join(", ")}.`, "");
  lines.push(
    "---",
    `<sub>Policy version \`${policyVersion}\` · triage: ${tier} · Verdicts come from Rego policies over extracted facts. This flags risk for humans and is **not legal advice**; citations are pointers — verify them with qualified counsel.</sub>`,
  );
  return lines.join("\n");
}
