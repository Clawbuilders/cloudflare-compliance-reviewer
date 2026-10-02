import { beforeAll, describe, expect, it } from "vitest";
import { PolicyEngine, PolicyUnavailableError, type PolicyStore } from "../src/policy-engine";
import { engineFrom, ensureRegorus } from "./helpers/engine";

const ALLOW = `package t
import rego.v1
default allow := false
allow if input.x == 1
deny contains {"rule": "r1", "title": "bad"} if input.bad
`;

function store(objects: Record<string, string | null>): PolicyStore {
  return {
    async get(key: string) {
      const v = objects[key];
      return v === undefined || v === null ? null : { text: async () => v };
    },
  };
}

beforeAll(() => ensureRegorus());

describe("PolicyEngine.fromBundle", () => {
  it("evaluates a rule against input", () => {
    const e = engineFrom({ "a.rego": ALLOW }, "v-test");
    expect(e.version).toBe("v-test");
    expect(e.evaluate("data.t.allow", { x: 1 })).toEqual({ value: true, policyVersion: "v-test" });
    expect(e.evaluate("data.t.allow", { x: 2 }).value).toBe(false);
  });

  it("returns undefined for an undefined rule", () => {
    const e = engineFrom({ "a.rego": ALLOW });
    expect(e.evaluate("data.t.nope", {}).value).toBeUndefined();
  });

  it("returns set rules as arrays of objects", () => {
    const e = engineFrom({ "a.rego": ALLOW });
    expect(e.evaluate("data.t.deny", { bad: true }).value).toEqual([{ rule: "r1", title: "bad" }]);
    expect(e.evaluate("data.t.deny", {}).value).toEqual([]);
  });

  it("throws PolicyUnavailableError when a policy does not parse", () => {
    expect(() => engineFrom({ "bad.rego": "package t\nthis is not rego" })).toThrow(PolicyUnavailableError);
  });
});

describe("PolicyEngine.loadCached", () => {
  it("re-reads the pointer every time but parses the bundle only when the active version changes", async () => {
    const reads: string[] = [];
    const objects: Record<string, string> = {
      "policies/ACTIVE": "v1",
      "policies/v1/bundle.json": JSON.stringify({ version: "v1", files: { "a.rego": ALLOW } }),
      "policies/v2/bundle.json": JSON.stringify({ version: "v2", files: { "a.rego": ALLOW } }),
    };
    const s: PolicyStore = {
      async get(key) {
        reads.push(key);
        const v = objects[key];
        return v === undefined ? null : { text: async () => v };
      },
    };
    const first = await PolicyEngine.loadCached({ POLICIES: s });
    const second = await PolicyEngine.loadCached({ POLICIES: s });
    expect(second).toBe(first);
    expect(reads.filter((k) => k === "policies/v1/bundle.json")).toHaveLength(1);
    expect(reads.filter((k) => k === "policies/ACTIVE")).toHaveLength(2);

    objects["policies/ACTIVE"] = "v2"; // a new policy was published: no redeploy needed, agents pick it up
    const third = await PolicyEngine.loadCached({ POLICIES: s });
    expect(third.version).toBe("v2");
    expect(third).not.toBe(first);
  });

  it("still throws PolicyUnavailableError when nothing is published", async () => {
    await expect(PolicyEngine.loadCached({ POLICIES: store({}) })).rejects.toBeInstanceOf(PolicyUnavailableError);
  });
});

describe("PolicyEngine.load (Review Focus 1: never a silent pass)", () => {
  it("rejects when policies/ACTIVE is missing", async () => {
    await expect(PolicyEngine.load({ POLICIES: store({}) })).rejects.toBeInstanceOf(PolicyUnavailableError);
  });

  it("rejects when the active bundle object is missing", async () => {
    await expect(PolicyEngine.load({ POLICIES: store({ "policies/ACTIVE": "abc123\n" }) })).rejects.toBeInstanceOf(
      PolicyUnavailableError,
    );
  });

  it("rejects when the bundle JSON is malformed or has the wrong shape", async () => {
    const bad = store({ "policies/ACTIVE": "abc123", "policies/abc123/bundle.json": "{not json" });
    await expect(PolicyEngine.load({ POLICIES: bad })).rejects.toBeInstanceOf(PolicyUnavailableError);
    const wrong = store({ "policies/ACTIVE": "abc123", "policies/abc123/bundle.json": JSON.stringify({ files: 3 }) });
    await expect(PolicyEngine.load({ POLICIES: wrong })).rejects.toBeInstanceOf(PolicyUnavailableError);
  });

  it("loads the bundle named by ACTIVE (trimming whitespace) and reports its version", async () => {
    const bundle = JSON.stringify({ version: "abc123", files: { "a.rego": ALLOW } });
    const s = store({ "policies/ACTIVE": "abc123\n", "policies/abc123/bundle.json": bundle });
    const e = await PolicyEngine.load({ POLICIES: s });
    expect(e.version).toBe("abc123");
    expect(e.evaluate("data.t.allow", { x: 1 }).value).toBe(true);
  });
});
