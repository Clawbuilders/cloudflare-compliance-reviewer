import { describe, expect, it } from "vitest";
import { policyFindings } from "../src/specialists/policy";
import { engineFrom } from "./helpers/engine";

const PKG = `package committee.demo
import rego.v1
deny contains {"rule": "bad", "title": "Bad thing", "message": "m"} if input.bad
`;

describe("policyFindings", () => {
  it("fails closed when the specialist's package is not in the bundle", () => {
    const engine = engineFrom({ "committee/other.rego": PKG.replace("committee.demo", "committee.other") }, "v-missing");
    const out = policyFindings(engine, "demo", { bad: true }, "demo", () => "REAL");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ severity: "block", rule: "policy_package_missing", specialist: "demo" });
    expect(out[0].message).toContain("committee.demo is not in the published bundle");
    expect(out[0].message).toContain("did NOT check");
  });

  it("an empty result set means checked with no findings, even when the package defines only deny", () => {
    const engine = engineFrom({ "committee/demo.rego": PKG });
    expect(policyFindings(engine, "demo", { bad: false }, "demo", () => "REAL")).toEqual([]);
  });

  it("turns rule hits into findings", () => {
    const engine = engineFrom({ "committee/demo.rego": PKG });
    const out = policyFindings(engine, "demo", { bad: true }, "demo", () => "HEURISTIC");
    expect(out).toMatchObject([{ severity: "block", rule: "bad", title: "Bad thing", kind: "HEURISTIC" }]);
  });
});
