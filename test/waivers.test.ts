import { describe, expect, it } from "vitest";
import { MARKER, renderComment } from "../src/comment";
import { canRequestWaiver, decideApproval, parseCommand } from "../src/waivers";

describe("parseCommand", () => {
  it("parses /waive with a reason, /approve and /reject", () => {
    expect(parseCommand("/waive abcd1234 vendor sandbox only, no real data")).toEqual({ cmd: "waive", findingId: "abcd1234", reason: "vendor sandbox only, no real data" });
    expect(parseCommand("/approve abcd1234")).toEqual({ cmd: "approve", findingId: "abcd1234" });
    expect(parseCommand("/reject ABCD1234 not acceptable")).toEqual({ cmd: "reject", findingId: "abcd1234" });
  });

  it("finds the command on any line of a multi-line comment", () => {
    expect(parseCommand("Thanks for the review!\r\n\r\n/waive 0123abcd fixture data only\r\nCheers")).toMatchObject({ cmd: "waive", findingId: "0123abcd" });
  });

  it("rejects malformed commands", () => {
    expect(parseCommand("/waive abcd1234")).toBeNull(); // a waiver needs a reason
    expect(parseCommand("/waive abcd1234 ok")).toBeNull(); // too short to be a reason
    expect(parseCommand("/waive xyz reason here")).toBeNull(); // not an 8-hex id
    expect(parseCommand("/waive abcd1234567 reason here")).toBeNull(); // too long
    expect(parseCommand("please /waive abcd1234 reason here")).toBeNull(); // not at line start
    expect(parseCommand("/approved abcd1234")).toBeNull();
    expect(parseCommand("")).toBeNull();
  });

  it("ignores quoted text and fenced code blocks (people quote the bot all the time)", () => {
    expect(parseCommand("> /waive abcd1234 quoted reason")).toBeNull();
    expect(parseCommand("```\n/waive abcd1234 inside a code block\n```")).toBeNull();
  });

  it("never mistakes the committee's own comment for a command (Review Focus 3/5)", () => {
    const md = renderComment({
      findings: [{ id: "abcd1234", specialist: "privacy", severity: "block", title: "PII", message: "m", citations: [], rule: "r", kind: "HEURISTIC" }],
      waived: new Set(),
      policyVersion: "v",
      tier: "clef",
      skipped: [],
    });
    expect(md).toContain(MARKER);
    expect(md).toContain("/waive abcd1234");
    expect(parseCommand(md)).toBeNull();
  });

  it("truncates an absurdly long reason", () => {
    const c = parseCommand(`/waive abcd1234 ${"x".repeat(5000)}`);
    expect(c && c.cmd === "waive" && c.reason.length).toBeLessThanOrEqual(500);
  });
});

describe("canRequestWaiver", () => {
  it("needs at least triage access", () => {
    for (const p of ["admin", "maintain", "write", "triage"] as const) expect(canRequestWaiver(p, "alice")).toBe(true);
    for (const p of ["read", "none"] as const) expect(canRequestWaiver(p, "alice")).toBe(false);
  });
  it("never lets a bot account request", () => {
    expect(canRequestWaiver("admin", "dependabot[bot]")).toBe(false);
  });
});

describe("decideApproval — four eyes (Review Focus 2)", () => {
  const base = { requester: "alice", approver: "bob", approverPermission: "write" as const, status: "pending" as const };

  it("accepts a different maintainer with write access or more", () => {
    for (const p of ["write", "maintain", "admin"] as const) expect(decideApproval({ ...base, approverPermission: p })).toEqual({ ok: true });
  });

  it("refuses self-approval, including different letter case", () => {
    expect(decideApproval({ ...base, approver: "alice" })).toMatchObject({ ok: false });
    expect(decideApproval({ ...base, approver: "ALICE" })).toMatchObject({ ok: false });
    const r = decideApproval({ ...base, approver: "Alice" });
    expect(r.ok === false && r.reason).toMatch(/own/i);
  });

  it("refuses approvers without write access", () => {
    for (const p of ["triage", "read", "none"] as const) expect(decideApproval({ ...base, approverPermission: p })).toMatchObject({ ok: false });
  });

  it("refuses bot approvers", () => {
    expect(decideApproval({ ...base, approver: "github-actions[bot]" })).toMatchObject({ ok: false });
  });

  it("never waives a request that is already decided or expired", () => {
    for (const status of ["approved", "rejected", "expired"] as const) {
      const r = decideApproval({ ...base, status });
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.reason).toContain(status);
    }
  });
});
