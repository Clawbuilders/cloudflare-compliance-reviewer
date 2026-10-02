import { describe, expect, it } from "vitest";
import { shouldReview, shouldSchedule } from "../src/review-state";

describe("debounce state (Review Focus 3)", () => {
  it("schedules for a new sha but not for a duplicate delivery of the same sha", () => {
    expect(shouldSchedule({}, "aaa")).toBe(true);
    expect(shouldSchedule({ latestSha: "aaa" }, "aaa")).toBe(false);
    expect(shouldSchedule({ latestSha: "aaa" }, "bbb")).toBe(true);
  });

  it("reviews only the latest sha, once", () => {
    expect(shouldReview({ latestSha: "bbb" }, "aaa")).toBe(false); // superseded by a newer push
    expect(shouldReview({ latestSha: "bbb" }, "bbb")).toBe(true);
    expect(shouldReview({ latestSha: "bbb", lastReviewedSha: "bbb" }, "bbb")).toBe(false);
  });
});
