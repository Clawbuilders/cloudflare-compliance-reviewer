/** Pure debounce/dedupe decisions so the Agent stays thin and these stay unit-testable. */
export interface ReviewerState {
  latestSha?: string;
  lastReviewedSha?: string;
}

/** A duplicate delivery of the sha we already know about must not schedule another review. */
export function shouldSchedule(state: ReviewerState, sha: string): boolean {
  return state.latestSha !== sha;
}

/** When the debounce timer fires: only the newest sha is reviewed, and only once. */
export function shouldReview(state: ReviewerState, sha: string): boolean {
  return state.latestSha === sha && state.lastReviewedSha !== sha;
}
