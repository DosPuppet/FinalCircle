/**
 * Local copy of the Comprehensive Rules as text (outside Git: data/cache/rules/), for lookups by section number.
 *
 * Usage:
 *   npx tsx tools/rules-text.ts            text of the cached PDF (data/cache/rules/fftcg-comprules-v<ver>.pdf)
 *   npx tsx tools/rules-text.ts --fetch    downloads the PDF first (one request to Square Enix's CDN)
 *   options: --version 3.3 (default), --url <pdf url> (a new version is published under another path)
 *
 * The extractor reads what the official PDF uses (Flate streams, object streams, ToUnicode maps, Tj/TJ text) and
 * breaks a line when the vertical text position changes. docs/rules.md is the digest the engine follows.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const argv = process.argv.slice(2);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const version = opt("version") ?? "3.3";
const url = opt("url") ?? `https://fftcg.cdn.sewest.net/2026-08/fftcg-comprules-v${version}.pdf`;
const DIR = "data/cache/rules";
const pdfPath = `${DIR}/fftcg-comprules-v${version}.pdf`;
const txtPath = `${DIR}/fftcg-comprules-v${version}.txt`;
mkdirSync(DIR, { recursive: true });

if (argv.includes("--fetch")) {
  const res = await fetch(url, { headers: { "User-Agent": "FinalCircle/0.1 (non-commercial fan project)" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  writeFileSync(pdfPath, Buffer.from(await res.arrayBuffer()));
}
if (!existsSync(pdfPath)) {
  console.error(`${pdfPath} is missing: rerun with --fetch.`);
  process.exit(1);
}

// Latin-1 keeps one character per byte, so offsets in the string are offsets in the file.
const data = readFileSync(pdfPath).toString("latin1");
const objs = new Map<number, string>();
for (const m of data.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) objs.set(Number(m[1]), m[2]!);

function streamOf(body: string): string | null {
  const m = /stream\r?\n([\s\S]*?)\r?\nendstream/.exec(body);
  if (!m) return null;
  const raw = Buffer.from(m[1]!, "latin1");
  return body.includes("FlateDecode") ? inflateSync(raw, { finishFlush: 2 }).toString("latin1") : m[1]!;
}

// Objects packed inside object streams.
for (const body of [...objs.values()]) {
  if (!body.includes("/ObjStm")) continue;
  const s = streamOf(body)!;
  const n = Number(/\/N (\d+)/.exec(body)![1]);
  const first = Number(/\/First (\d+)/.exec(body)![1]);
  const header = s.slice(0, first).trim().split(/\s+/).map(Number);
  for (let i = 0; i < n; i++) {
    const start = first + header[2 * i + 1]!;
    const end = i + 1 < n ? first + header[2 * i + 3]! : s.length;
    if (!objs.has(header[2 * i]!)) objs.set(header[2 * i]!, s.slice(start, end));
  }
}

const refOf = (body: string, key: string) => {
  const m = new RegExp(`/${key}\\s+(\\d+) 0 R`).exec(body);
  return m ? Number(m[1]) : undefined;
};
const utf16 = (hex: string) => Buffer.from(hex, "hex").swap16().toString("utf16le");

function parseCmap(s: string): Map<number, string> {
  const cmap = new Map<number, string>();
  for (const block of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const m of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) cmap.set(parseInt(m[1]!, 16), utf16(m[2]!));
  for (const block of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const m of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])/g)) {
      const lo = parseInt(m[1]!, 16);
      const hi = parseInt(m[2]!, 16);
      if (m[3]!.startsWith("[")) {
        const items = [...m[3]!.matchAll(/<([0-9A-Fa-f]+)>/g)];
        for (let i = 0; i < items.length; i++) cmap.set(lo + i, utf16(items[i]![1]!));
      } else {
        const start = parseInt(m[3]!.slice(1, -1), 16);
        for (let i = 0; i <= hi - lo; i++) cmap.set(lo + i, String.fromCodePoint(start + i));
      }
    }
  return cmap;
}

interface Font {
  cmap: Map<number, string>;
  width: 1 | 2;
}
const fonts = new Map<number, Font>();
for (const [num, body] of objs) {
  if (!/\/Type\s*\/Font\b/.test(body)) continue;
  const tu = refOf(body, "ToUnicode");
  const cmap = tu !== undefined ? parseCmap(streamOf(objs.get(tu)!) ?? "") : new Map<number, string>();
  fonts.set(num, { cmap, width: body.includes("Identity-H") || body.includes("/Type0") ? 2 : 1 });
}

function fontResources(page: string): Map<string, number> {
  const res = new Map<string, number>();
  const r = refOf(page, "Resources");
  const rbody = r !== undefined ? objs.get(r)! : page;
  let dict = /\/Font\s*<<([\s\S]*?)>>/.exec(rbody)?.[1];
  if (dict === undefined) {
    const f = refOf(rbody, "Font");
    dict = f !== undefined ? /<<([\s\S]*)>>/.exec(objs.get(f)!)?.[1] : undefined;
  }
  for (const m of (dict ?? "").matchAll(/\/([\w+.-]+)\s+(\d+) 0 R/g)) res.set(m[1]!, Number(m[2]));
  return res;
}

function decode(raw: string, font: Font): string {
  let out = "";
  for (let i = 0; i + font.width <= raw.length; i += font.width) {
    const code = font.width === 2 ? (raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1) : raw.charCodeAt(i);
    out += font.cmap.get(code) ?? (font.width === 1 ? String.fromCharCode(code) : "?");
  }
  return out;
}

const ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
function unescapeLiteral(lit: string): string {
  return lit.replace(/\\([0-7]{1,3}|.)/gs, (_, e: string) =>
    /^[0-7]+$/.test(e) ? String.fromCharCode(parseInt(e, 8)) : (ESCAPES[e] ?? e),
  );
}

// Page order from the page tree.
const order: number[] = [];
const walk = (n: number) => {
  const b = objs.get(n)!;
  if (/\/Type\s*\/Pages/.test(b))
    for (const k of /\/Kids\s*\[([\s\S]*?)\]/.exec(b)![1]!.matchAll(/(\d+) 0 R/g)) walk(Number(k[1]));
  else order.push(n);
};
const root = [...objs].find(([, b]) => /\/Type\s*\/Pages/.test(b) && !b.includes("/Parent"));
walk(root![0]);

const TOKEN = /\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>|\[|\]|\/[^\s/[\]()<>]+|-?\d*\.?\d+|[A-Za-z'"*]+/gs;
const NUMBER = /^-?\d*\.?\d+$/;
const out: string[] = [];
order.forEach((pageNum, index) => {
  const page = objs.get(pageNum)!;
  const res = fontResources(page);
  const contents = /\/Contents\s*(\[[\s\S]*?\]|\d+ 0 R)/.exec(page)![1]!;
  const content = [...contents.matchAll(/(\d+) 0 R/g)].map((m) => streamOf(objs.get(Number(m[1]))!) ?? "").join("");
  out.push(`\n===== page ${index + 1} =====`);
  let font: Font = { cmap: new Map(), width: 1 };
  let stack: string[] = [];
  let line = "";
  let y = 0;
  let lineY: number | null = null;
  const put = (text: string) => {
    if (lineY !== null && Math.abs(y - lineY) > 1) {
      out.push(line);
      line = "";
    }
    lineY = y;
    line += text;
  };
  const strings = (items: string[]) =>
    items
      .map((t) => {
        if (t.startsWith("(")) return decode(unescapeLiteral(t.slice(1, -1)), font);
        if (t.startsWith("<")) return decode(Buffer.from(t.slice(1, -1).replace(/\s/g, ""), "hex").toString("latin1"), font);
        return NUMBER.test(t) && Number(t) < -200 ? " " : "";
      })
      .join("");
  for (const [tok] of content.matchAll(TOKEN)) {
    if (tok === "Tf") {
      const name = stack.length >= 2 ? stack[stack.length - 2]!.slice(1) : "";
      font = fonts.get(res.get(name) ?? -1) ?? { cmap: new Map(), width: 1 };
      stack = [];
    } else if (tok === "Tj" || tok === "TJ" || tok === "'" || tok === '"') {
      if (tok === "'" || tok === '"') y -= 10;
      put(strings(stack));
      stack = [];
    } else if (tok === "Tm") {
      y = stack.length ? Number(stack[stack.length - 1]) : y;
      stack = [];
    } else if (tok === "Td" || tok === "TD") {
      y += stack.length ? Number(stack[stack.length - 1]) : 0;
      stack = [];
    } else if (tok === "T*") {
      y -= 10;
      stack = [];
    } else if (/^[A-Za-z]+$/.test(tok) && tok !== "true" && tok !== "false") stack = [];
    else stack.push(tok);
  }
  if (line) out.push(line);
});
writeFileSync(txtPath, `${out.join("\n")}\n`);
console.log(`${txtPath}: ${order.length} pages, ${out.length} lines`);
