import { describe, expect, it } from "vitest";
import { selectSpecialists } from "../src/committee";
import { shouldReview, shouldSchedule } from "../src/review-state";
import { diffOf } from "./specialists/helpers";

const ALL = ["privacy", "licensing", "casl", "ai-governance", "sensitive-data", "change-control"];

describe("selectSpecialists — triage can add scrutiny, never remove a known signal", () => {
  it("runs what triage chose and reports what it skipped", () => {
    const files = diffOf({ "src/math.ts": ["export const x = 1;"] });
    const s = selectSpecialists(files, ["licensing"]);
    expect(s.run).toContain("licensing");
    expect(s.skipped).toContain("privacy");
    expect([...s.run, ...s.skipped].sort()).toEqual([...ALL].sort());
  });

  it("forces a specialist whose deterministic signal fired, even if triage skipped it", () => {
    const files = diffOf({ "src/user.ts": ["console.log(user.email);"] });
    const s = selectSpecialists(files, []); // triage said nothing is needed
    expect(s.run).toContain("privacy");
    expect(s.forced).toEqual(expect.arrayContaining(["privacy"]));
  });

  it("always runs change-control (no model involved) and never lists a specialist twice", () => {
    const s = selectSpecialists(diffOf({ "README.md": ["docs"] }), ["privacy", "privacy"]);
    expect(s.run).toContain("change-control");
    expect(new Set(s.run).size).toBe(s.run.length);
  });

  it("ignores unknown ids from a misbehaving triage tier", () => {
    const s = selectSpecialists(diffOf({ "a.ts": ["x"] }), ["nonsense"]);
    expect(s.run.every((id) => ALL.includes(id))).toBe(true);
  });
});

describe("review-state (Review Focus 3)", () => {
  it("schedules a review for a sha that has not been reviewed yet", () => {
    expect(shouldSchedule({}, "a")).toBe(true);
    expect(shouldSchedule({ latestSha: "b", lastReviewedSha: "a" }, "b")).toBe(true);
  });

  it("lets a redelivery retry a sha whose review never completed (a failed start must not be lost)", () => {
    expect(shouldSchedule({ latestSha: "a" }, "a")).toBe(true);
  });

  it("does not schedule again once a sha has been reviewed", () => {
    expect(shouldSchedule({ latestSha: "a", lastReviewedSha: "a" }, "a")).toBe(false);
  });

  it("reviews only the newest sha, once", () => {
    expect(shouldReview({ latestSha: "b" }, "a")).toBe(false);
    expect(shouldReview({ latestSha: "b" }, "b")).toBe(true);
    expect(shouldReview({ latestSha: "b", lastReviewedSha: "b" }, "b")).toBe(false);
  });
});
