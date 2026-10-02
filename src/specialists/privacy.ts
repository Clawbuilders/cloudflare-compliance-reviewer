import { extractNewHosts, extractPiiLogging, extractTrackers } from "../extractors";
import { policyFindings } from "./policy";
import type { Specialist } from "./types";

const facts = (files: Parameters<typeof extractPiiLogging>[0]) => ({
  pii_logging: extractPiiLogging(files),
  trackers: extractTrackers(files),
  new_hosts: extractNewHosts(files),
});

export const privacy: Specialist = {
  id: "privacy",
  label: "Privacy (GDPR, PIPEDA, Quebec Law 25)",
  kind: "HEURISTIC",
  applies: (files) => {
    const f = facts(files);
    return f.pii_logging.length + f.trackers.length + f.new_hosts.length > 0;
  },
  async run(ctx) {
    return policyFindings(ctx.engine, "privacy", facts(ctx.files), "privacy", () => "HEURISTIC");
  },
};
