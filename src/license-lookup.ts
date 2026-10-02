/**
 * License facts for an npm package. deps.dev is the primary source (fast, reliable, already used in Episode 5);
 * ClearlyDefined is enrichment: it also scans the package's files and lists attribution parties. ClearlyDefined can be
 * slow or return 5xx, so every call has a short timeout and a failure falls back to deps.dev alone.
 */
export type FetchJson = (url: string, timeoutMs: number) => Promise<unknown | null>;

export interface LicenseLookup {
  /** SPDX expression; "" = the registry answered but lists no license; null = nobody answered (an outage, not a fact about the package). */
  license: string | null;
  /** License expressions ClearlyDefined found inside the package's files. */
  discovered: string[];
  sources: ("deps.dev" | "clearlydefined")[];
}

export const DEPS_DEV_TIMEOUT_MS = 4000;
export const CLEARLY_DEFINED_TIMEOUT_MS = 3000;

export type Ecosystem = "npm" | "cargo";

export function depsDevUrl(name: string, version: string, ecosystem: Ecosystem = "npm"): string {
  return `https://api.deps.dev/v3/systems/${ecosystem}/packages/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`;
}

export function clearlyDefinedUrl(name: string, version: string, ecosystem: Ecosystem = "npm"): string {
  if (ecosystem === "cargo") return `https://api.clearlydefined.io/definitions/crate/cratesio/-/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
  const scoped = name.startsWith("@") && name.includes("/");
  const [ns, pkg] = scoped ? name.split("/", 2) : ["-", name];
  return `https://api.clearlydefined.io/definitions/npm/npmjs/${encodeURIComponent(ns)}/${encodeURIComponent(pkg)}/${encodeURIComponent(version)}`;
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

export async function lookupLicense(name: string, version: string, fetchJson: FetchJson, opts: { ecosystem?: Ecosystem; enrich?: boolean } = {}): Promise<LicenseLookup> {
  const ecosystem = opts.ecosystem ?? "npm";
  const [dd, cd] = await Promise.all([
    fetchJson(depsDevUrl(name, version, ecosystem), DEPS_DEV_TIMEOUT_MS).catch(() => null),
    // Enrichment is optional: a large scan skips it to stay fast and kind to a free public service.
    opts.enrich === false ? Promise.resolve(null) : fetchJson(clearlyDefinedUrl(name, version, ecosystem), CLEARLY_DEFINED_TIMEOUT_MS).catch(() => null),
  ]);
  const sources: LicenseLookup["sources"] = [];

  let license: string | null = null;
  const ddLicenses = (dd as { licenses?: unknown } | null)?.licenses;
  if (isStringArray(ddLicenses)) {
    sources.push("deps.dev");
    // Several entries mean several licenses were detected; AND is the conservative reading.
    license = ddLicenses.length ? ddLicenses.join(" AND ") : "";
  }

  const cdLicensed = (cd as { licensed?: { declared?: unknown; facets?: { core?: { discovered?: { expressions?: unknown } } } } } | null)?.licensed;
  let discovered: string[] = [];
  if (cdLicensed) {
    sources.push("clearlydefined");
    const expr = cdLicensed.facets?.core?.discovered?.expressions;
    if (isStringArray(expr)) discovered = expr;
    const declared = typeof cdLicensed.declared === "string" ? cdLicensed.declared.trim() : "";
    if (!license && declared && declared.toUpperCase() !== "NOASSERTION") license = declared;
  }
  return { license, discovered, sources };
}
