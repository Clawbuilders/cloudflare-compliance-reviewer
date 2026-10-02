/* tslint:disable */
/* eslint-disable */

/**
 * WASM wrapper for [`regorus::Engine`]
 */
export class Engine {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Add policy data.
     *
     * See https://docs.rs/regorus/latest/regorus/struct.Engine.html#method.add_data
     * * `data`: JSON encoded value to be used as policy data.
     */
    addDataJson(data: string): void;
    /**
     * Add a policy
     *
     * The policy is parsed into AST.
     * See https://docs.rs/regorus/latest/regorus/struct.Engine.html#method.add_policy
     *
     * * `path`: A filename to be associated with the policy.
     * * `rego`: Rego policy.
     */
    addPolicy(path: string, rego: string): string;
    /**
     * Clear policy data.
     *
     * See https://docs.rs/regorus/0.1.0-alpha.2/regorus/struct.Engine.html#method.clear_data
     */
    clearData(): void;
    /**
     * Clear the policy length configuration, reverting to defaults.
     */
    clearPolicyLengthConfig(): void;
    /**
     * Evaluate query.
     *
     * See https://docs.rs/regorus/0.1.0-alpha.2/regorus/struct.Engine.html#method.eval_query
     * * `query`: Rego expression to be evaluate.
     */
    evalQuery(query: string): string;
    /**
     * Evaluate rule(s) at given path.
     *
     * See https://docs.rs/regorus/latest/regorus/struct.Engine.html#method.eval_rule
     *
     * * `path`: The full path to the rule(s).
     */
    evalRule(path: string): string;
    /**
     * Get AST of policies.
     *
     * See https://docs.rs/regorus/latest/regorus/struct.Engine.html#method.get_ast_as_json
     */
    getAstAsJson(): string;
    /**
     * Get the list of packages defined by loaded policies.
     *
     * See https://docs.rs/regorus/latest/regorus/struct.Engine.html#method.get_packages
     */
    getPackages(): string[];
    /**
     * Get the list of policies.
     *
     * See https://docs.rs/regorus/latest/regorus/struct.Engine.html#method.get_policies
     */
    getPolicies(): string;
    /**
     * Construct a new Engine
     *
     * See https://docs.rs/regorus/latest/regorus/struct.Engine.html
     */
    constructor();
    /**
     * Gather output from print statements instead of emiting to stderr.
     *
     * See https://docs.rs/regorus/latest/regorus/struct.Engine.html#method.set_gather_prints
     * * `b`: Whether to enable gathering prints or not.
     */
    setGatherPrints(b: boolean): void;
    /**
     * Set input.
     *
     * See https://docs.rs/regorus/0.1.0-alpha.2/regorus/struct.Engine.html#method.set_input
     * * `input`: JSON encoded value to be used as input to query.
     */
    setInputJson(input: string): void;
    /**
     * Set the policy length limits used when loading policies.
     *
     * Accepts a JS object: `{ maxCol, maxFileBytes, maxLines }`.
     */
    setPolicyLengthConfig(config: any): void;
    /**
     * Turn on rego v0.
     *
     * Regorus defaults to rego v1.
     *
     * * `enable`: Whether to enable or disable rego v0.
     */
    setRegoV0(enable: boolean): void;
    /**
     * Take the gathered output of print statements.
     *
     * See https://docs.rs/regorus/latest/regorus/struct.Engine.html#method.take_prints
     */
    takePrints(): string[];
}

export class Program {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Compile an RVM program from modules and entry points.
     */
    static compileFromModules(data_json: string, modules_json: string, entry_points_json: string): Program;
    /**
     * Deserialize an RVM program from binary format.
     */
    static deserializeBinary(data: Uint8Array): ProgramDeserializationResult;
    /**
     * Generate a readable assembly listing.
     */
    generateListing(): string;
    /**
     * Generate a tabular assembly listing.
     */
    generateTabularListing(): string;
    /**
     * Serialize a program to binary format.
     */
    serializeBinary(): Uint8Array;
}

export class ProgramDeserializationResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Get the deserialized program.
     */
    program(): Program;
    /**
     * Whether the program was partially deserialized.
     */
    readonly isPartial: boolean;
}

export class Rvm {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Execute an entry point by name and return the JSON result.
     */
    executeEntryPoint(entry_point: string): string;
    /**
     * Execute the program and return the JSON result.
     */
    execute(): string;
    /**
     * Get the execution state as a string.
     */
    getExecutionState(): string;
    /**
     * Load a program into the VM.
     */
    loadProgram(program: Program): void;
    constructor();
    /**
     * Resume execution with an optional JSON value.
     */
    resume(resume_json?: string | null): string;
    /**
     * Set VM data from JSON.
     */
    setDataJson(data_json: string): void;
    /**
     * Set execution mode (0 = run-to-completion, 1 = suspendable).
     */
    setExecutionMode(mode: number): void;
    /**
     * Set VM input from JSON.
     */
    setInputJson(input_json: string): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_engine_free: (a: number, b: number) => void;
    readonly __wbg_program_free: (a: number, b: number) => void;
    readonly __wbg_programdeserializationresult_free: (a: number, b: number) => void;
    readonly __wbg_rvm_free: (a: number, b: number) => void;
    readonly engine_addDataJson: (a: number, b: number, c: number) => [number, number];
    readonly engine_addPolicy: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly engine_clearData: (a: number) => [number, number];
    readonly engine_clearPolicyLengthConfig: (a: number) => void;
    readonly engine_evalQuery: (a: number, b: number, c: number) => [number, number, number, number];
    readonly engine_evalRule: (a: number, b: number, c: number) => [number, number, number, number];
    readonly engine_getAstAsJson: (a: number) => [number, number, number, number];
    readonly engine_getPackages: (a: number) => [number, number, number, number];
    readonly engine_getPolicies: (a: number) => [number, number, number, number];
    readonly engine_new: () => number;
    readonly engine_setGatherPrints: (a: number, b: number) => void;
    readonly engine_setInputJson: (a: number, b: number, c: number) => [number, number];
    readonly engine_setPolicyLengthConfig: (a: number, b: any) => [number, number];
    readonly engine_setRegoV0: (a: number, b: number) => void;
    readonly engine_takePrints: (a: number) => [number, number, number, number];
    readonly program_compileFromModules: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly program_deserializeBinary: (a: number, b: number) => [number, number, number];
    readonly program_generateListing: (a: number) => [number, number, number, number];
    readonly program_generateTabularListing: (a: number) => [number, number, number, number];
    readonly program_serializeBinary: (a: number) => [number, number, number, number];
    readonly programdeserializationresult_isPartial: (a: number) => number;
    readonly programdeserializationresult_program: (a: number) => number;
    readonly rvm_execute: (a: number) => [number, number, number, number];
    readonly rvm_executeEntryPoint: (a: number, b: number, c: number) => [number, number, number, number];
    readonly rvm_getExecutionState: (a: number) => [number, number];
    readonly rvm_loadProgram: (a: number, b: number) => void;
    readonly rvm_new: () => number;
    readonly rvm_resume: (a: number, b: number, c: number) => [number, number, number, number];
    readonly rvm_setDataJson: (a: number, b: number, c: number) => [number, number];
    readonly rvm_setExecutionMode: (a: number, b: number) => [number, number];
    readonly rvm_setInputJson: (a: number, b: number, c: number) => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
