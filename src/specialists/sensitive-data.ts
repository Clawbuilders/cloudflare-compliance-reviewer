import { extractCardData, extractHealthData } from "../extractors";
import { policyFindings } from "./policy";
import type { Specialist } from "./types";

const facts = (files: Parameters<typeof extractCardData>[0]) => ({ card_data: extractCardData(files), health_data: extractHealthData(files) });

export const sensitiveData: Specialist = {
  id: "sensitive-data",
  label: "Sensitive data (PCI DSS, PHIPA)",
  kind: "HEURISTIC",
  applies: (files) => {
    const f = facts(files);
    return f.card_data.length + f.health_data.length > 0;
  },
  async run(ctx) {
    return policyFindings(ctx.engine, "sensitive_data", facts(ctx.files), "sensitive-data", () => "HEURISTIC");
  },
};
