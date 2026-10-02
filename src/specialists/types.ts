import type { AiBinding } from "../clef";
import type { DiffFile } from "../diff";
import type { Finding } from "../findings";
import type { PolicyEngine } from "../policy-engine";

export interface SpecialistContext {
  /** The reviewable diff: lockfiles, build output, vendored code and binaries are already filtered out. */
  files: DiffFile[];
  /** The same diff WITHOUT that filter — licensing needs lockfiles (`Cargo.lock` carries the exact versions). */
  allFiles?: DiffFile[];
  /** How many new dependencies to look up (default 15). Large scans raise it. */
  maxDependencies?: number;
  /** Ask ClearlyDefined as well as deps.dev (default true). Large scans turn it off. */
  licenseEnrichment?: boolean;
  prMeta: { title: string; body: string; approvals: number };
  engine: PolicyEngine;
  ai: AiBinding;
  /** File contents on the PR's head commit, or null when absent. */
  fetchFile(path: string): Promise<string | null>;
  /** GET JSON with a hard timeout; null on any failure (timeout, non-200, bad JSON). */
  fetchJson(url: string, timeoutMs: number): Promise<unknown | null>;
}

export interface Specialist {
  id: string;
  label: string;
  /** Honesty label shown in the README: REAL = real policy engine / live registry; HEURISTIC = pattern-based extraction. */
  kind: "REAL" | "HEURISTIC" | "REAL+HEURISTIC";
  /** Deterministic forcing: when true the specialist runs even if triage skipped it (triage can add scrutiny, never remove a known signal). */
  applies(files: DiffFile[], allFiles?: DiffFile[]): boolean;
  run(ctx: SpecialistContext): Promise<Finding[]>;
}
