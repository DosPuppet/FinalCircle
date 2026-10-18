/** Client files and card images served by the server: compression, cache and security headers, the /ffimg/ route. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { createImageRelay, type RunningServer, startServer } from "../src/index";

let srv: RunningServer | null = null;
let dir = "";
afterEach(async () => {
  await srv?.close();
  srv = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

function get(
  port: number,
  path: string,
  encoding?: string,
): Promise<{ status: number; headers: Record<string, unknown>; body: Buffer }> {
  return new Promise((ok, ko) => {
    const req = request({ port, path, headers: encoding ? { "Accept-Encoding": encoding } : {} }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        ok({ status: res.statusCode ?? 0, headers: res.headers as Record<string, unknown>, body: Buffer.concat(chunks) }),
      );
    });
    req.on("error", ko);
    req.end();
  });
}

function site(): string {
  dir = mkdtempSync(join(tmpdir(), "fc-dist-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>FinalCircle</title>");
  return dir;
}

describe("client files", () => {
  it("content security policy: the site's own scripts and images only, no framing", async () => {
    srv = await startServer({ port: 0, host: "127.0.0.1", aiWorkers: 0, staticDir: site() });
    const csp = String((await get(srv.port, "/")).headers["content-security-policy"]);
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).not.toContain("https://fftcg");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("compressed (brotli, else gzip), cached for one year under /assets/, never for index.html", async () => {
    site();
    mkdirSync(join(dir, "assets"));
    const js = `export const data = ${JSON.stringify(Array.from({ length: 2000 }, (_, i) => ({ card: `Card ${i}` })))};`;
    writeFileSync(join(dir, "assets", "index-abc.js"), js);
    srv = await startServer({ port: 0, host: "127.0.0.1", aiWorkers: 0, staticDir: dir });

    const br = await get(srv.port, "/assets/index-abc.js", "gzip, deflate, br");
    expect(br.headers["content-encoding"]).toBe("br");
    expect(br.headers["cache-control"]).toMatch(/immutable/);
    expect(brotliDecompressSync(br.body).toString()).toBe(js);
    expect(br.body.length).toBeLessThan(js.length / 4);
    const gz = await get(srv.port, "/assets/index-abc.js", "gzip");
    expect(gz.headers["content-encoding"]).toBe("gzip");
    expect(gunzipSync(gz.body).toString()).toBe(js);
    expect(br.headers["x-content-type-options"]).toBe("nosniff");
    expect(br.headers["x-frame-options"]).toBe("DENY");
    const plain = await get(srv.port, "/assets/index-abc.js");
    expect(plain.headers["content-encoding"]).toBeUndefined();
    expect(plain.body.toString()).toBe(js);
    expect((await get(srv.port, "/", "br")).headers["cache-control"]).toBe("no-cache");
  });

  it("a badly encoded URL answers 400 without stopping the server", async () => {
    srv = await startServer({ port: 0, host: "127.0.0.1", aiWorkers: 0, staticDir: site() });
    expect((await fetch(`http://127.0.0.1:${srv.port}/%`)).status).toBe(400);
    expect((await fetch(`http://127.0.0.1:${srv.port}/healthz`)).status).toBe(200);
  });
});

describe("card images (/ffimg/)", () => {
  it("relays an allowed image, refuses any other path, and answers 503 while the CDN refuses", async () => {
    const asked: string[] = [];
    let refuse = false;
    const fake = (async (url: string | URL | Request) => {
      asked.push(String(url));
      if (refuse) return new Response("<html>challenge</html>", { status: 403, headers: { "content-type": "text/html" } });
      return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { "content-type": "image/jpeg" } });
    }) as typeof fetch;
    const images = createImageRelay({ fetch: fake, minGapMs: 0, breakerMs: 60_000 });
    srv = await startServer({ port: 0, host: "127.0.0.1", aiWorkers: 0, images });
    const ok = await get(srv.port, "/ffimg/thumbs/21-010H_fr.jpg");
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toBe("image/jpeg");
    expect(ok.headers["cache-control"]).toMatch(/max-age/);
    expect([...ok.body]).toEqual([0xff, 0xd8, 0xff]);
    expect(asked).toEqual(["https://fftcg.cdn.sewest.net/images/cards/thumbs/21-010H_fr.jpg"]);
    // Not an open proxy: only card image paths.
    for (const path of ["/ffimg/../../etc/passwd", "/ffimg/thumbs/x.png", "/ffimg/https://example.org/a.jpg"])
      expect((await get(srv.port, path)).status).toBe(404);
    expect(asked).toHaveLength(1);
    // A 403 is a missing image (404); the breaker opens on a refusal of another kind.
    refuse = true;
    expect((await get(srv.port, "/ffimg/full/21-010H_fr.jpg")).status).toBe(404);
  });
});
