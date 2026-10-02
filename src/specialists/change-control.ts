import { changedPaths } from "../extractors";
import { policyFindings } from "./policy";
import type { Specialist } from "./types";

/** Pure rules over file paths and approval counts — no model is involved, so it always runs. */
export const changeControl: Specialist = {
  id: "change-control",
  label: "Change control (SOC 2-style)",
  kind: "REAL",
  applies: () => true,
  async run(ctx) {
    const facts = { changed_paths: changedPaths(ctx.files), approvals: ctx.prMeta.approvals };
    return policyFindings(ctx.engine, "change_control", facts, "change-control", () => "REAL");
  },
};
