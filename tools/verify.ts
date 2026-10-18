/**
 * Verification of a lot, parallelized and timed (from Planecircle's tools/verify.ts).
 *
 * Usage:
 *   npm run verify -- --group starter25   verification of a lot (fuzz targeted on the card group)
 *   npm run verify -- --full              full verification (end of a series, before a merge)
 *   npm run verify -- --ci                continuous integration (GitHub Actions): checks, tests and short fuzzes on
 *                                         the whole pool, without interface tests or bench
 *   options: --ui (forces the interface tests), --no-ui (skips them), --no-bench (skips the bench of --full)
 *
 * Each step prints its duration; the detail of a step is printed only on failure (full logs in
 * test-results/verify/). A step whose tool does not exist yet is left out (fuzz from lot A7, interface tests from
 * lot A8). The interface tests require Vite (npm run dev): by default, they run only if the client, the view or the
 * protocol changed since the last commit.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const full = flag("full");
const ci = flag("ci");
const cardGroup = opt("group")?.toLowerCase();
if (!full && !ci && !cardGroup) {
  console.error("Specify --group <group> (verification of a lot), --full or --ci.");
  process.exit(2);
}
const jobs = Math.max(1, availableParallelism() - 2);
const LOGS = "test-results/verify";
mkdirSync(LOGS, { recursive: true });

interface Step {
  name: string;
  cmd: string;
  /** Result line(s) to print even on success. */
  show?: RegExp;
  /** Tool the step needs: the step is left out while it does not exist. */
  needs?: string;
}

interface Result {
  step: Step;
  ok: boolean;
  seconds: number;
  out: string;
}

const available = (s: Step) => !s.needs || existsSync(s.needs);

function run(step: Step): Promise<Result> {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const child = spawn("bash", ["-c", step.cmd], { env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" } });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      out += d;
    });
    child.on("close", (code) => {
      const seconds = (performance.now() - t0) / 1000;
      writeFileSync(`${LOGS}/${step.name.replace(/\W+/g, "-")}.log`, out);
      resolve({ step, ok: code === 0, seconds, out });
    });
  });
}

function report(r: Result): void {
  const shown = r.step.show ? (r.out.match(new RegExp(r.step.show, "gm")) ?? []).map((l) => l.trim()).join(" | ") : "";
  console.log(`${r.ok ? "✅" : "❌"} ${r.step.name.padEnd(28)} ${r.seconds.toFixed(1).padStart(6)} s  ${shown}`);
  if (!r.ok) console.log(`${r.out.split("\n").slice(-40).join("\n")}\n`);
}

/** Steps started together; the group must finish before the next one. */
async function group(steps: Step[]): Promise<boolean> {
  const results = await Promise.all(steps.filter(available).map(run));
  for (const r of results) report(r);
  return results.every((r) => r.ok);
}

/** A fuzz series; all the series run together (`runFuzz`). */
const fuzz = (name: string, args: string) => ({ name, args });
const FUZZ_SHOW = /^results: .*$/;

/**
 * All the fuzz series on a single process group (`fuzz.ts --batch`): no start-up or waiting for the slowest between two
 * series. One line per series, in the order they finish.
 */
async function runFuzz(series: { name: string; args: string }[]): Promise<boolean> {
  const file = `${LOGS}/fuzz-batch.json`;
  writeFileSync(file, JSON.stringify(series));
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", "tools/fuzz.ts", "--batch", file, "--jobs", String(jobs)], {
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    });
    let ok = true;
    let buf = "";
    let stderr = "";
    const reported = new Set<string>();
    child.stdout.on("data", (d) => {
      buf += d;
      for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (!line.startsWith("{")) continue;
        const r = JSON.parse(line) as { name: string; ok: boolean; seconds: number; out: string };
        const step: Step = { name: r.name, cmd: "", show: FUZZ_SHOW };
        writeFileSync(`${LOGS}/${step.name.replace(/\W+/g, "-")}.log`, r.out);
        report({ step, ok: r.ok, seconds: r.seconds, out: r.out });
        reported.add(r.name);
        ok &&= r.ok;
      }
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("close", (code) => {
      // Abrupt stop (process killed, memory): the series without a summary have failed.
      for (const s of series.filter((x) => !reported.has(x.name)))
        report({ step: { name: s.name, cmd: "" }, ok: false, seconds: 0, out: stderr || `fuzz stopped (code ${code})` });
      resolve(ok && code === 0 && reported.size === series.length);
    });
  });
}

/** Files changed since the last commit (tracked or not). */
async function changedFiles(): Promise<string[]> {
  const r = await run({ name: "git-status", cmd: "git status --porcelain" });
  return r.out
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter(Boolean);
}

async function viteUp(): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:5174/", { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

const t0 = performance.now();
let ok = true;

// 1. Static checks (light, together), then vitest (it already takes all the cores).
ok &&= await group([
  { name: "tsc", cmd: "npx tsc -p tsconfig.json" },
  { name: "biome", cmd: "npx biome check .", show: /^Checked .*$/ },
  {
    name: "coverage",
    cmd: `npx tsx tools/card-coverage.ts --group ${cardGroup ?? "all"}`,
    show: /^.* cards handled .*$/,
    needs: "tools/card-coverage.ts",
  },
  { name: "bundle", cmd: "npx tsx tools/bundle-size.ts", show: /^bundle: .*$/, needs: "tools/bundle-size.ts" },
]);
// A lot runs the card smoke test of its own group only (the others: CI on every push, --full).
const SMOKE = "packages/ai/test/smoke";
const smokeFiles = existsSync(SMOKE) ? readdirSync(SMOKE).filter((f) => f.endsWith(".test.ts")) : [];
const own = (code: string) => smokeFiles.filter((f) => f === `${code}.test.ts` || f.startsWith(`${code}-`));
const keep = !full && !ci && cardGroup && smokeFiles.length ? own(cardGroup) : null;
const skip = keep ? smokeFiles.filter((f) => !keep.includes(f)).map((f) => `${SMOKE}/${f}`) : [];
ok &&= await group([
  {
    name: keep ? `vitest (smoke: ${keep.join(", ") || "none"})` : "vitest",
    cmd: `FC_SKIP=${skip.join(",")} npx vitest run`,
    show: /^\s*Tests .*$/,
  },
]);

// 2. Fuzz: all the series together, on all the cores (from lot A7).
if (existsSync("tools/fuzz.ts")) {
  const fuzzes = ci
    ? [
        fuzz("fuzz", "--games 150 --pool all --seed 1 --offers 4"),
        fuzz("fuzz AI levels", "--games 20 --pool all --ai levels"),
        fuzz("fuzz chaos", "--games 100 --pool all --ai chaos --seed 3000"),
      ]
    : full
      ? [
          fuzz("fuzz seed 1", "--games 300 --pool all --seed 1 --offers 4"),
          fuzz("fuzz seed 1000", "--games 300 --pool all --seed 1000"),
          fuzz("fuzz seed 5000", "--games 300 --pool all --seed 5000"),
          fuzz("fuzz mixed AI", "--games 100 --pool all --ai mixed"),
          fuzz("fuzz AI levels", "--games 60 --pool all --ai levels"),
          fuzz("fuzz chaos", "--games 300 --pool all --ai chaos --seed 3000"),
        ]
      : [
          fuzz(`fuzz ${cardGroup}`, `--games 300 --pool ${cardGroup} --seed 1 --offers 4`),
          fuzz(`fuzz ${cardGroup} mixed AI`, `--games 60 --pool ${cardGroup} --ai mixed`),
          fuzz(`fuzz ${cardGroup} AI levels`, `--games 30 --pool ${cardGroup} --ai levels`),
          fuzz("fuzz whole pool", "--games 200 --pool all --seed 2000"),
          fuzz(`fuzz ${cardGroup} chaos`, `--games 150 --pool ${cardGroup} --ai chaos`),
        ];
  ok = (await runFuzz(fuzzes)) && ok;
}

// 3. Bench (full verification only: it judges a lot's regression poorly, especially on battery).
if (full && !flag("no-bench"))
  ok = (await group([{ name: "bench", cmd: "npx tsx tools/bench.ts", show: /^Targets .*$/, needs: "tools/bench.ts" }])) && ok;

// 4. Interface tests, if the client, the view or the protocol changed (or --ui, or --full), from lot A8.
const UI_QUEUES: Step[][] = [
  [
    { name: "ui-smoke", cmd: "npx tsx tools/ui-smoke.ts", show: /^No page error\.$/, needs: "tools/ui-smoke.ts" },
    { name: "mobile-smoke", cmd: "npx tsx tools/mobile-smoke.ts", show: /^ok: no page error$/, needs: "tools/mobile-smoke.ts" },
    {
      name: "tutorial-smoke",
      cmd: "npx tsx tools/tutorial-smoke.ts",
      show: /^ok: tutorial followed end to end.*$/,
      needs: "tools/tutorial-smoke.ts",
    },
  ],
  [
    { name: "deck-smoke", cmd: "npx tsx tools/deck-smoke.ts", show: /^ok: game started.*$/, needs: "tools/deck-smoke.ts" },
    { name: "replay-smoke", cmd: "npx tsx tools/replay-smoke.ts", show: /^ok: replay .*$/, needs: "tools/replay-smoke.ts" },
  ],
];
const LANG_SMOKE: Step = {
  name: "lang-smoke",
  cmd: `npx tsx tools/lang-smoke.ts ${full ? 150 : 50}`,
  show: /^ok: both languages.*$/,
  needs: "tools/lang-smoke.ts",
};
const anyUi = [...UI_QUEUES.flat(), LANG_SMOKE].some(available);
const changed = await changedFiles();
const uiTouched = changed.some((f) => /packages\/client\/|engine\/src\/view\.ts|server\/src\/protocol\.ts/.test(f));
if (!anyUi) {
  console.log("·  interface tests skipped (none written yet)");
} else if (!ci && !flag("no-ui") && (full || flag("ui") || uiTouched)) {
  if (await viteUp()) {
    // Two queues in parallel; more would make the games played in the browser run out of time.
    const chain = async (steps: Step[]) => {
      let chainOk = true;
      for (const step of steps) chainOk = (await group([step])) && chainOk;
      return chainOk;
    };
    const results = await Promise.all(UI_QUEUES.map(chain));
    ok = results.every(Boolean) && ok;
    // Display in both languages: two games in the browser, alone (in a queue, it slowed the others into timeouts).
    ok = (await group([LANG_SMOKE])) && ok;
  } else {
    console.log("⚠️  interface tests skipped: Vite does not answer on http://localhost:5174 (run npm run dev)");
    ok = false;
  }
} else {
  const why = ci ? "continuous integration" : flag("no-ui") ? "--no-ui" : "neither client, nor view, nor protocol changed";
  console.log(`·  interface tests skipped (${why})`);
}

console.log(
  `\n${ok ? "✅ Verification passed" : "❌ Verification failed"} in ${((performance.now() - t0) / 1000).toFixed(0)} s.`,
);
process.exitCode = ok ? 0 : 1;
