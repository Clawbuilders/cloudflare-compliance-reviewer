import { describe, expect, it } from "vitest";
import { shouldReview, shouldSchedule } from "../src/review-state";

describe("debounce state (Review Focus 3)", () => {
  it("schedules for a sha that has not been reviewed, including a redelivery after a failed review", () => {
    expect(shouldSchedule({}, "aaa")).toBe(true);
    expect(shouldSchedule({ latestSha: "aaa" }, "aaa")).toBe(true);
    expect(shouldSchedule({ latestSha: "aaa" }, "bbb")).toBe(true);
  });

  it("does not schedule again once the sha has been reviewed", () => {
    expect(shouldSchedule({ latestSha: "aaa", lastReviewedSha: "aaa" }, "aaa")).toBe(false);
  });

  it("reviews only the latest sha, once", () => {
    expect(shouldReview({ latestSha: "bbb" }, "aaa")).toBe(false); // superseded by a newer push
    expect(shouldReview({ latestSha: "bbb" }, "bbb")).toBe(true);
    expect(shouldReview({ latestSha: "bbb", lastReviewedSha: "bbb" }, "bbb")).toBe(false);
  });
});
