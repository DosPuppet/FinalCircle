/**
 * Relay of the official card images (`/ffimg/<full|thumbs>/<code>_<eg|fr>.jpg`), for the game server and for Vite in
 * development: browsers never reach Square Enix's CDN themselves. The CDN is behind Cloudflare, which bans an address
 * that asks too fast: the relay fetches one image at a time, at least `minGapMs` apart, merges identical requests,
 * remembers failures, and stops fetching for `breakerMs` after a refusal (the client then draws the card from its text).
 * Only card image paths are relayed (allow list): never an open proxy. Images are never stored in the repository; the
 * optional disk cache lives outside Git (`data/cache/images`), nginx caches them in production.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const FFIMG_PATH = /^\/(full|thumbs)\/((?:\d{1,2}|PR|B|C|Re)-\d{3}[A-Z]?(?:_\d)?)_(eg|fr)(?:_[A-Za-z]+)?\.jpg$/;
export const CDN = "https://fftcg.cdn.sewest.net/images/cards";

export interface RelayOptions {
  /** Disk cache (development); absent: none. */
  cacheDir?: string;
  /** Minimum gap between two requests to the CDN. */
  minGapMs?: number;
  /** Pause after the CDN refused (429, Cloudflare challenge). */
  breakerMs?: number;
  /** How long a missing image (403, 404) is remembered. */
  failTtlMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

export interface RelayResult {
  status: 200 | 404 | 503;
  body?: Buffer;
}

export function createImageRelay(opts: RelayOptions = {}) {
  const minGap = opts.minGapMs ?? 1100;
  const breakerMs = opts.breakerMs ?? 30 * 60_000;
  const failTtl = opts.failTtlMs ?? 60 * 60_000;
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const failed = new Map<string, number>();
  const inflight = new Map<string, Promise<RelayResult>>();
  let breakerUntil = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let last = 0;

  const cacheFile = (path: string) => (opts.cacheDir ? join(opts.cacheDir, path) : null);

  async function fromCdn(path: string): Promise<RelayResult> {
    if (now() < breakerUntil) return { status: 503 };
    const wait = last + minGap - now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = now();
    if (now() < breakerUntil) return { status: 503 };
    let res: Response;
    try {
      res = await doFetch(CDN + path, {
        headers: { "User-Agent": "FinalCircle/0.1 (non-commercial fan project)" },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return { status: 503 };
    }
    const type = res.headers.get("content-type") ?? "";
    if (res.ok && type.startsWith("image/")) {
      const body = Buffer.from(await res.arrayBuffer());
      const file = cacheFile(path);
      if (file) {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, body);
      }
      return { status: 200, body };
    }
    if (res.status === 403 || res.status === 404) {
      failed.set(path, now() + failTtl);
      return { status: 404 };
    }
    // 429, a Cloudflare challenge (HTML), a server error: the CDN does not want us now.
    breakerUntil = now() + breakerMs;
    return { status: 503 };
  }

  return {
    /** An image by its relay path (`/full/1-001H_fr.jpg`). */
    get(path: string): Promise<RelayResult> {
      if (!FFIMG_PATH.test(path)) return Promise.resolve({ status: 404 });
      const file = cacheFile(path);
      if (file && existsSync(file)) return Promise.resolve({ status: 200, body: readFileSync(file) });
      const until = failed.get(path);
      if (until !== undefined && until > now()) return Promise.resolve({ status: 404 });
      const pending = inflight.get(path);
      if (pending) return pending;
      const job = queue.then(() => fromCdn(path));
      queue = job.catch(() => undefined);
      const done = job.finally(() => inflight.delete(path));
      inflight.set(path, done);
      return done;
    },
    /** For `/healthz`: the breaker's state. */
    stats: () => ({ breaker: now() < breakerUntil, failed: failed.size, inflight: inflight.size }),
  };
}

export type ImageRelay = ReturnType<typeof createImageRelay>;
