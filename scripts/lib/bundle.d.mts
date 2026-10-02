export interface BundleSource {
  dir: string;
  prefix: string;
}
export interface BuiltBundle {
  version: string;
  files: Record<string, string>;
}
export function isShippable(relPath: string): boolean;
export function buildBundle(sources: BundleSource[]): BuiltBundle;
export const SOURCES: BundleSource[];
