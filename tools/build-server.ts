/**
 * Server compiled for production (from Planecircle): a single file `packages/server/dist/main.mjs` (engine, cards, ws
 * included), run by Node without `tsx` (`deploy/ecosystem.config.cjs`). The commit is written into the file
 * (`FC_BUILD`, shown by `/healthz`).
 *
 * Usage: npm run build:server
 */
import { execSync } from "node:child_process";
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = join(root, "packages", "server", "dist", "main.mjs");

let commit = "unknown";
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  if (execSync("git status --porcelain", { cwd: root }).toString().trim()) commit += "+modified";
} catch {
  // Outside a git repository: unknown version.
}

await build({
  entryPoints: [join(root, "packages", "server", "src", "main.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  // Optional native dependencies of ws: absent, ws does without them.
  external: ["bufferutil", "utf-8-validate"],
  define: { "process.env.FC_BUILD": JSON.stringify(commit) },
  // Bundled CommonJS modules (ws): `require` in ESM.
  banner: { js: "import { createRequire as __fcRequire } from 'node:module'; const require = __fcRequire(import.meta.url);" },
  logLevel: "warning",
});
// Worker of the AI seats: a second file next to the server, loaded by `aiPool.ts`.
const workerFile = join(root, "packages", "server", "dist", "ai-worker.mjs");
await build({
  entryPoints: [join(root, "packages", "server", "src", "aiWorker.ts")],
  outfile: workerFile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  banner: { js: "import { createRequire as __fcRequire } from 'node:module'; const require = __fcRequire(import.meta.url);" },
  logLevel: "warning",
});
console.log(`AI worker compiled: ${workerFile} (${(statSync(workerFile).size / 1_048_576).toFixed(1)} MB)`);
console.log(`Server compiled: ${outfile} (${(statSync(outfile).size / 1_048_576).toFixed(1)} MB, ${commit})`);
