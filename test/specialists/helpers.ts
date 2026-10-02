import { parseUnifiedDiff, type DiffFile } from "../../src/diff";
import type { SpecialistContext } from "../../src/specialists/types";
import { fullEngine } from "../helpers/engine";

/** Build a diff of several files: { "path": ["added line", ...] }. */
export function diffOf(files: Record<string, string[]>, status: "modified" | "added" = "modified"): DiffFile[] {
  const text = Object.entries(files)
    .map(([path, lines]) => {
      const header = status === "added" ? `new file mode 100644\n--- /dev/null\n+++ b/${path}` : `--- a/${path}\n+++ b/${path}`;
      return `diff --git a/${path} b/${path}\n${header}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join("\n")}\n`;
    })
    .join("");
  return parseUnifiedDiff(text);
}

export interface CtxOptions {
  files: DiffFile[];
  repoFiles?: Record<string, string>;
  json?: (url: string) => unknown | null;
  approvals?: number;
  ai?: { run: (model: string, input: any) => Promise<any> };
}

export function makeCtx(o: CtxOptions): SpecialistContext {
  return {
    files: o.files,
    prMeta: { title: "test", body: "", approvals: o.approvals ?? 0 },
    engine: fullEngine(),
    ai: (o.ai ?? { run: async () => { throw new Error("no ai in this test"); } }) as any,
    fetchFile: async (path) => o.repoFiles?.[path] ?? null,
    fetchJson: async (url) => (o.json ? (o.json(url) as any) : null),
  };
}
