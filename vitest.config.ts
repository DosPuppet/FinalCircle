import { rmSync } from "node:fs";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      // Vitest 5.0.1 does not delete the temporary directory of its main instance (`/tmp/<nanoid>/ssr`, about 60 MB
      // per run; it filled up `/tmp` in Planecircle on 2026-10-02). It is deleted on close.
      name: "finalcircle-clear-vitest-tmp",
      configureVitest({ vitest }) {
        const dir = (vitest as unknown as { _tmpDir?: string })._tmpDir;
        if (!dir) return;
        const clear = () => rmSync(dir, { recursive: true, force: true });
        vitest.onClose(clear);
        process.once("exit", clear);
      },
    },
  ],
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    // `verify --group <G>`: the card smoke tests of the other groups are skipped (FC_SKIP, comma-separated files); CI
    // and `verify --full` run them all.
    exclude: [...configDefaults.exclude, ...(process.env.FC_SKIP?.split(",").filter(Boolean) ?? [])],
    // Workers reused across test files (cards and engine loaded once per worker): tests must not leave shared module
    // state changed (a stubbed global is restored in afterEach).
    isolate: false,
    // Until the first tests (lot A2), an empty tree passes.
    passWithNoTests: true,
  },
});
