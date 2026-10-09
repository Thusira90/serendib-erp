/**
 * Demo image generator: draws faceted gems, rough stones and certificate scans
 * as PNGs into public/uploads/demo/ so the demo has pictures everywhere.
 * Purely local, no network. public/uploads/ is gitignored.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(process.cwd(), "public", "uploads", "demo");

export type Shape = "oval" | "round" | "cushion" | "pear" | "emerald" | "marquise" | "heart";

// Deterministic pseudo-random so re-running the seed gives identical pictures.
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Outline points for each cut, centred on (400,400). */
function outline(shape: Shape, n = 28): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    let x = c, y = s;
    switch (shape) {
      case "round": break;
      case "oval": x = c * 1.0; y = s * 0.78; break;
      case "cushion": {
        const p = 3.2;
        x = Math.sign(c) * Math.pow(Math.abs(c), 2 / p); y = Math.sign(s) * Math.pow(Math.abs(s), 2 / p);
        x *= 0.9; y *= 0.9; break;
      }
      case "emerald": {
        const p = 6;
        x = Math.sign(c) * Math.pow(Math.abs(c), 2 / p) * 0.82; y = Math.sign(s) * Math.pow(Math.abs(s), 2 / p) * 1.0; break;
      }
      case "pear": {
        const t = (s + 1) / 2; // 0 top .. 1 bottom
        const w = 0.35 + 0.65 * Math.pow(1 - t, 0.7) * (t < 0.15 ? 0.6 : 1);
        x = c * Math.max(0.12, s > 0 ? 0.85 * (1 - 0.82 * s * s) : 0.85) * 0.95; y = s * 0.98;
        void w; break;
      }
      case "marquise": x = c * 1.0; y = s * 0.5 * (1 - 0.55 * Math.abs(c) * Math.abs(c)) * 1.6; break;
      case "heart": {
        const t = a;
        x = (16 * Math.pow(Math.sin(t), 3)) / 17;
        y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 * 1.02 + 0.05;
        break;
      }
    }
    pts.push([400 + x * 250, 400 + y * 250]);
  }
  return pts;
}

const poly = (pts: [number, number][]) => pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ");
const scale = (pts: [number, number][], k: number): [number, number][] =>
  pts.map(([x, y]) => [400 + (x - 400) * k, 400 + (y - 400) * k]);

function bg(id: string): string {
  return `<defs>
    <radialGradient id="bg${id}" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#2b2f3a"/><stop offset="1" stop-color="#0d0f14"/></radialGradient>
  </defs><rect width="800" height="800" fill="url(#bg${id})"/>`;
}

export function gemSvg(code: string, shape: Shape, colour: string): string {
  const r = rng(code);
  const out = outline(shape);
  const table = scale(out, 0.52);
  const girdle = scale(out, 0.8);
  let facets = "";
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[(i + 1) % out.length];
    const g1 = girdle[i], g2 = girdle[(i + 1) % out.length];
    const t1 = table[i], t2 = table[(i + 1) % out.length];
    const f1 = 0.55 + r() * 0.9, f2 = 0.5 + r() * 0.9, f3 = 0.6 + r() * 0.8;
    facets += `<polygon points="${poly([a, b, g2, g1])}" fill="${shade(colour, f1)}" stroke="${shade(colour, 0.35)}" stroke-width="1.2"/>`;
    facets += `<polygon points="${poly([g1, g2, t2, t1])}" fill="${shade(colour, f2)}" stroke="${shade(colour, 0.3)}" stroke-width="1.2"/>`;
    // alternating sparkle on the crown
    if (i % 3 === 0) facets += `<polygon points="${poly([t1, t2, [400, 400]])}" fill="${shade(colour, f3 + 0.35)}" stroke="${shade(colour, 0.3)}" stroke-width="1"/>`;
    else facets += `<polygon points="${poly([t1, t2, [400, 400]])}" fill="${shade(colour, f3)}" stroke="${shade(colour, 0.3)}" stroke-width="1"/>`;
  }
  const glints = Array.from({ length: 6 }, () => {
    const gx = 260 + r() * 280, gy = 260 + r() * 280;
    return `<circle cx="${gx.toFixed(0)}" cy="${gy.toFixed(0)}" r="${(3 + r() * 6).toFixed(1)}" fill="#fff" opacity="${(0.35 + r() * 0.5).toFixed(2)}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">${bg(code)}
    <ellipse cx="400" cy="700" rx="230" ry="26" fill="#000" opacity=".45"/>
    <polygon points="${poly(out)}" fill="${shade(colour, 0.5)}" stroke="${shade(colour, 1.5)}" stroke-width="3"/>
    ${facets}${glints}
    <polygon points="${poly(out)}" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width="2"/>
  </svg>`;
}

export function roughSvg(code: string, colour: string, stage: "rough" | "marked" | "cutting" = "rough"): string {
  const r = rng(code + stage);
  const n = 11;
  const pts: [number, number][] = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const rad = 190 + r() * 90;
    return [400 + Math.cos(a) * rad * 1.1, 410 + Math.sin(a) * rad * 0.85] as [number, number];
  });
  let faces = "";
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const k = 0.45 + r() * 0.9;
    faces += `<polygon points="${poly([a, b, [400 + (r() - 0.5) * 60, 400 + (r() - 0.5) * 60]])}" fill="${shade(colour, k)}" stroke="${shade(colour, 0.3)}" stroke-width="1.5"/>`;
  }
  const speckle = Array.from({ length: 40 }, () => `<circle cx="${(250 + r() * 300).toFixed(0)}" cy="${(260 + r() * 280).toFixed(0)}" r="${(1 + r() * 3).toFixed(1)}" fill="#fff" opacity="${(0.1 + r() * 0.25).toFixed(2)}"/>`).join("");
  let extra = "";
  if (stage === "marked") {
    extra = `<polygon points="${poly(scale(outline("oval"), 0.9))}" fill="none" stroke="#ffe066" stroke-width="5" stroke-dasharray="14 10"/>
      <line x1="150" y1="400" x2="650" y2="400" stroke="#ffe066" stroke-width="3" stroke-dasharray="6 8"/>`;
  }
  if (stage === "cutting") {
    extra = `<polygon points="${poly(scale(outline("oval"), 0.82))}" fill="${shade(colour, 1.1)}" opacity=".9" stroke="#fff" stroke-opacity=".5" stroke-width="3"/>
      ${Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return `<line x1="400" y1="400" x2="${(400 + Math.cos(a) * 200).toFixed(0)}" y2="${(400 + Math.sin(a) * 160).toFixed(0)}" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>`; }).join("")}`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">${bg(code + stage)}
    <ellipse cx="400" cy="700" rx="260" ry="28" fill="#000" opacity=".45"/>
    <polygon points="${poly(pts)}" fill="${shade(colour, 0.6)}" stroke="${shade(colour, 0.3)}" stroke-width="3"/>
    ${faces}${speckle}${extra}</svg>`;
}

export function certSvg(opts: { lab: string; number: string; stone: string; weight: string; dims: string; colour: string; origin: string; treatment: string; date: string; accent: string }): string {
  const rows: [string, string][] = [
    ["Report No.", opts.number], ["Object", opts.stone], ["Weight", opts.weight], ["Dimensions", opts.dims],
    ["Colour", opts.colour], ["Origin", opts.origin], ["Comments", opts.treatment], ["Date", opts.date],
  ];
  const lines = rows.map(([k, v], i) => `<text x="80" y="${330 + i * 62}" font-family="Georgia,serif" font-size="22" fill="#6b6b6b">${k}</text>
    <text x="300" y="${330 + i * 62}" font-family="Georgia,serif" font-size="26" fill="#1a1a1a">${v.replace(/&/g, "&amp;")}</text>
    <line x1="80" y1="${344 + i * 62}" x2="720" y2="${344 + i * 62}" stroke="#d9d3c3" stroke-width="1"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1100" viewBox="0 0 800 1100">
    <rect width="800" height="1100" fill="#f7f3e8"/><rect x="24" y="24" width="752" height="1052" fill="none" stroke="${opts.accent}" stroke-width="4"/>
    <rect x="36" y="36" width="728" height="1028" fill="none" stroke="${opts.accent}" stroke-width="1.5"/>
    <text x="400" y="130" text-anchor="middle" font-family="Georgia,serif" font-size="38" font-weight="bold" fill="${opts.accent}">${opts.lab.replace(/&/g, "&amp;")}</text>
    <text x="400" y="175" text-anchor="middle" font-family="Georgia,serif" font-size="22" letter-spacing="6" fill="#444">GEMSTONE REPORT</text>
    <line x1="200" y1="205" x2="600" y2="205" stroke="${opts.accent}" stroke-width="2"/>
    <text x="400" y="262" text-anchor="middle" font-family="Georgia,serif" font-size="18" fill="#888">DEMO DOCUMENT · NOT A REAL LABORATORY REPORT</text>
    ${lines}
    <circle cx="640" cy="930" r="62" fill="none" stroke="${opts.accent}" stroke-width="3" opacity=".7"/>
    <text x="640" y="936" text-anchor="middle" font-family="Georgia,serif" font-size="16" fill="${opts.accent}" opacity=".8">SEAL</text>
    <text x="80" y="960" font-family="Georgia,serif" font-size="16" fill="#999">Sample data generated for demonstration only.</text>
  </svg>`;
}

async function writePng(file: string, svg: string): Promise<string> {
  fs.mkdirSync(OUT, { recursive: true });
  const full = path.join(OUT, file);
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(full);
  return `/uploads/demo/${file}`;
}

export const imgGem = (code: string, shape: Shape, colour: string, variant = "") =>
  writePng(`${code}${variant}.png`, gemSvg(code + variant, shape, colour));
export const imgRough = (code: string, colour: string, stage: "rough" | "marked" | "cutting" = "rough") =>
  writePng(`${code}-${stage}.png`, roughSvg(code, colour, stage));
export const imgCert = (file: string, o: Parameters<typeof certSvg>[0]) => writePng(file, certSvg(o));
