/** Pure debounce/dedupe decisions so the Agent stays thin and these stay unit-testable. */
export interface ReviewerState {
  latestSha?: string;
  lastReviewedSha?: string;
}

/**
 * Schedule unless this sha was already reviewed. Deliberately NOT "unless we have seen it": a review that failed to start
 * must be retried when GitHub redelivers the webhook. Duplicates inside the debounce window are harmless — the schedule is
 * idempotent and `shouldReview` lets exactly one of them through.
 */
export function shouldSchedule(state: ReviewerState, sha: string): boolean {
  return state.lastReviewedSha !== sha;
}

/** When the debounce timer fires: only the newest sha is reviewed, and only once. */
export function shouldReview(state: ReviewerState, sha: string): boolean {
  return state.latestSha === sha && state.lastReviewedSha !== sha;
}
