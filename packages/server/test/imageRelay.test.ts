/** The image relay: allow list, one request at a time, failures remembered, the breaker after a refusal. */
import { describe, expect, it } from "vitest";
import { createImageRelay } from "../src/imageRelay";

function fakeCdn(status: number, type = "image/jpeg") {
  const calls: string[] = [];
  const fetch = (async (url: string | URL) => {
    calls.push(String(url));
    return new Response(status === 200 ? new Uint8Array([1, 2, 3]) : "no", { status, headers: { "content-type": type } });
  }) as typeof globalThis.fetch;
  return { calls, fetch };
}

describe("image relay", () => {
  it("relays card images only", async () => {
    const cdn = fakeCdn(200);
    const relay = createImageRelay({ fetch: cdn.fetch, minGapMs: 0 });
    expect((await relay.get("/full/13-013C_fr.jpg")).status).toBe(200);
    expect((await relay.get("/../etc/passwd")).status).toBe(404);
    expect((await relay.get("/full/13-013C_fr.png")).status).toBe(404);
    expect(cdn.calls).toEqual(["https://fftcg.cdn.sewest.net/images/cards/full/13-013C_fr.jpg"]);
  });

  it("merges identical requests and remembers a missing image", async () => {
    const cdn = fakeCdn(403);
    const relay = createImageRelay({ fetch: cdn.fetch, minGapMs: 0 });
    const [a, b] = await Promise.all([relay.get("/full/27-123S_fr.jpg"), relay.get("/full/27-123S_fr.jpg")]);
    expect([a.status, b.status]).toEqual([404, 404]);
    expect((await relay.get("/full/27-123S_fr.jpg")).status).toBe(404);
    expect(cdn.calls).toHaveLength(1);
  });

  it("stops asking after a refusal (429 or a Cloudflare challenge)", async () => {
    const cdn = fakeCdn(200, "text/html");
    const relay = createImageRelay({ fetch: cdn.fetch, minGapMs: 0 });
    expect((await relay.get("/full/1-001H_eg.jpg")).status).toBe(503);
    expect((await relay.get("/full/1-002R_eg.jpg")).status).toBe(503);
    expect(cdn.calls).toHaveLength(1);
    expect(relay.stats().breaker).toBe(true);
  });
});
