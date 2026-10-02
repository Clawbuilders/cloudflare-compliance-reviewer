#!/usr/bin/env bash
# Rebuild vendor/regorus from upstream. Needs: git, Rust (+ wasm32-unknown-unknown target), node (for npx wasm-pack).
# Attendees never need to run this — the built artifact is committed.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
REF="${REGORUS_REF:-main}"
git clone --depth 1 --branch "$REF" https://github.com/microsoft/regorus.git "$WORK/regorus"
cd "$WORK/regorus/bindings/wasm"
npx -y wasm-pack build --target web --release --out-dir pkg \
  --no-default-features \
  --features "ast,regorus/std,regorus/jsonpatch,regorus/time,regorus/regex,regorus/semver,regorus/glob"
cp pkg/regorusjs.js pkg/regorusjs.d.ts pkg/regorusjs_bg.wasm pkg/regorusjs_bg.wasm.d.ts "$HERE/vendor/regorus/"
echo "Built Regorus @ $(git -C "$WORK/regorus" rev-parse HEAD). Update vendor/regorus/PROVENANCE.md (commit + sha256)."
shasum -a 256 "$HERE/vendor/regorus/regorusjs_bg.wasm"
