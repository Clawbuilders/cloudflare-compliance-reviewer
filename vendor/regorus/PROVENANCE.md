# Regorus WebAssembly build

Built from [microsoft/regorus](https://github.com/microsoft/regorus) (MIT) `bindings/wasm`.

- Commit: `121e638406c081398336dc3b05874d4f31aecbcf` (2026-10-01), crate `regorusjs` 0.12.0
- Features: `--no-default-features --features "ast,regorus/std,regorus/jsonpatch,regorus/time,regorus/regex,regorus/semver,regorus/glob"`
  (no `http`/`net`: policies cannot make network calls; smaller binary)
- Command: `scripts/build-regorus.sh`
- `regorusjs_bg.wasm` sha256: `bee644fd7d4069bb2524a2d76282f110125c8f8fa9aac19a3b2857b1cf580218`
- Size: 3507285 bytes raw

Why it is vendored: Workers cannot compile WebAssembly from bytes at runtime, so the engine ships
with the Worker as a pre-compiled module. Policies are plain Rego text loaded from R2.
