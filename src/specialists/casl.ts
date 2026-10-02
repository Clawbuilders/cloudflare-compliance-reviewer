import { extractEmailSenders } from "../extractors";
import { policyFindings } from "./policy";
import type { Specialist } from "./types";

export const casl: Specialist = {
  id: "casl",
  label: "CASL (Canada's anti-spam law)",
  kind: "HEURISTIC",
  applies: (files) => extractEmailSenders(files).length > 0,
  async run(ctx) {
    return policyFindings(ctx.engine, "casl", { email_senders: extractEmailSenders(ctx.files) }, "casl", () => "HEURISTIC");
  },
};
