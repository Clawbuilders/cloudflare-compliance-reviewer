import type { DiffFile } from "./diff";
import { SPECIALISTS } from "./specialists";

export interface Selection {
  /** Specialists to run, in registry order. */
  run: string[];
  /** Specialists triage skipped and nothing forced. */
  skipped: string[];
  /** Specialists that triage skipped but a deterministic signal in the diff forced on. */
  forced: string[];
}

/**
 * Combine the model's triage with deterministic signals. Triage exists to save work, so it may add scrutiny but must never
 * suppress a specialist whose own check already saw something (a wrong "skip" would be a silent miss).
 */
export function selectSpecialists(files: DiffFile[], triaged: string[], allFiles?: DiffFile[]): Selection {
  const wanted = new Set(triaged);
  const run: string[] = [];
  const skipped: string[] = [];
  const forced: string[] = [];
  for (const s of SPECIALISTS) {
    if (wanted.has(s.id)) run.push(s.id);
    else if (s.applies(files, allFiles)) {
      run.push(s.id);
      forced.push(s.id);
    } else skipped.push(s.id);
  }
  return { run, skipped, forced };
}
