import { defineConfig } from "vitest/config";

// Starter is self-contained: without this file vitest walks up to the Advanced track's config at the repo root,
// which imports a vitest that a fresh `cd starter && npm install` does not have.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
