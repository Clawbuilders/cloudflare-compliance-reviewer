/**
 * Policy engine: Regorus (a Rego interpreter compiled to WebAssembly) + versioned Rego text from R2.
 *
 * Why this shape: Workers cannot compile WebAssembly from bytes at runtime, so a precompiled OPA
 * `.wasm` could not be fetched from R2. Instead ONE engine wasm ships with the Worker and the
 * *policies* travel as plain text — change a policy by publishing a new bundle to R2, no redeploy.
 */
import { Engine, initSync } from "../vendor/regorus/regorusjs.js";

let ready = false;
let cached: PolicyEngine | undefined;

/** Call once at startup. Workers pass the statically imported module; Node tests pass bytes. */
export function initRegorus(module: WebAssembly.Module | BufferSource): void {
  if (ready) return;
  initSync({ module });
  ready = true;
}

export class PolicyUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PolicyUnavailableError";
  }
}

export interface PolicyBundle {
  version: string;
  files: Record<string, string>;
}

export interface EvalResult<T = unknown> {
  value: T | undefined;
  policyVersion: string;
}

/** The slice of R2Bucket we need — lets tests pass a stub. */
export interface PolicyStore {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
}

export const ACTIVE_KEY = "policies/ACTIVE";
export const bundleKey = (version: string) => `policies/${version}/bundle.json`;

export class PolicyEngine {
  private constructor(
    private readonly engine: Engine,
    readonly version: string,
  ) {}

  static fromBundle(bundle: PolicyBundle): PolicyEngine {
    if (!ready) throw new PolicyUnavailableError("Regorus wasm is not initialised (call initRegorus first)");
    const engine = new Engine();
    for (const [path, rego] of Object.entries(bundle.files)) {
      try {
        engine.addPolicy(path, rego);
      } catch (cause) {
        throw new PolicyUnavailableError(`Policy ${path} failed to load: ${String(cause).split("\n")[0]}`, { cause });
      }
    }
    return new PolicyEngine(engine, bundle.version);
  }

  /** Reads the active version pointer. Throws PolicyUnavailableError when nothing is published. */
  private static async activeVersion(env: { POLICIES: PolicyStore }): Promise<string> {
    const pointer = await env.POLICIES.get(ACTIVE_KEY);
    if (!pointer) throw new PolicyUnavailableError(`No active policy bundle (${ACTIVE_KEY} is missing)`);
    const version = (await pointer.text()).trim();
    if (!version) throw new PolicyUnavailableError(`${ACTIVE_KEY} is empty`);
    return version;
  }

  private static async loadVersion(env: { POLICIES: PolicyStore }, version: string): Promise<PolicyEngine> {
    const object = await env.POLICIES.get(bundleKey(version));
    if (!object) throw new PolicyUnavailableError(`Policy bundle ${bundleKey(version)} not found`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(await object.text());
    } catch (cause) {
      throw new PolicyUnavailableError(`Policy bundle ${version} is not valid JSON`, { cause });
    }
    const files = (parsed as PolicyBundle | undefined)?.files;
    if (!files || typeof files !== "object" || Array.isArray(files)) {
      throw new PolicyUnavailableError(`Policy bundle ${version} has no "files" map`);
    }
    return PolicyEngine.fromBundle({ version, files });
  }

  /** Reads `policies/ACTIVE` then that version's bundle. Throws PolicyUnavailableError — never returns an empty engine. */
  static async load(env: { POLICIES: PolicyStore }): Promise<PolicyEngine> {
    return PolicyEngine.loadVersion(env, await PolicyEngine.activeVersion(env));
  }

  /**
   * Like `load`, but parses a bundle only when the active version changes. The pointer is re-read on every call (it is tiny),
   * so publishing a new bundle reaches running agents without a redeploy; an unchanged version reuses the parsed engine.
   */
  static async loadCached(env: { POLICIES: PolicyStore }): Promise<PolicyEngine> {
    const version = await PolicyEngine.activeVersion(env);
    if (cached?.version === version) return cached;
    cached = await PolicyEngine.loadVersion(env, version);
    return cached;
  }

  /** Evaluate a Rego query (e.g. `data.committee.privacy.deny`). Undefined rules give `value: undefined`. */
  evaluate<T = unknown>(query: string, input: unknown): EvalResult<T> {
    this.engine.setInputJson(JSON.stringify(input ?? {}));
    const raw = JSON.parse(this.engine.evalQuery(query)) as {
      result?: { expressions?: { value?: T }[] }[];
    };
    return { value: raw.result?.[0]?.expressions?.[0]?.value, policyVersion: this.version };
  }
}
