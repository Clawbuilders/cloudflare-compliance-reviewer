export type Severity = "block" | "warn" | "info";

export interface Finding {
  /** Stable 8-hex id so a finding can be waived by id across pushes. */
  id: string;
  specialist: string;
  severity: Severity;
  title: string;
  message: string;
  /** Pointers to the rule/article the policy cites. Not legal advice. */
  citations: string[];
  file?: string;
  rule: string;
  kind: "REAL" | "HEURISTIC";
}

/** FNV-1a 32-bit → 8 hex chars. Synchronous (Web Crypto digest is async) and deterministic. */
export function findingId(specialist: string, rule: string, file: string | undefined, title: string): string {
  let h = 0x811c9dc5;
  for (const ch of `${specialist}|${rule}|${file ?? ""}|${title}`) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const RANK: Record<Severity, number> = { block: 0, warn: 1, info: 2 };

/** Dedupe by id (keeping the highest severity) and order block → warn → info. */
export function mergeFindings(all: Finding[]): Finding[] {
  const byId = new Map<string, Finding>();
  for (const f of all) {
    const prev = byId.get(f.id);
    if (!prev || RANK[f.severity] < RANK[prev.severity]) byId.set(f.id, f);
  }
  return [...byId.values()].sort(
    (a, b) => RANK[a.severity] - RANK[b.severity] || a.specialist.localeCompare(b.specialist) || a.title.localeCompare(b.title),
  );
}
