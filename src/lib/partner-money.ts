// Pure integer money primitives for partner deals: no prisma, no I/O, BigInt arithmetic, half away from zero.

export type Minor = number;
export interface Rat { n: bigint; d: bigint }
export type RateSource = "LIVE" | "FALLBACK" | "MANUAL";
export interface RateMap { base: "LKR"; fetchedAt: string; perUnit: Record<string, { rate: string; source: RateSource }> }
export type RateMicro = Record<string, number>;

export class EngineInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineInvariantError";
  }
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const abs = (x: bigint): bigint => (x < 0n ? -x : x);

export function toBig(m: number, what = "amount"): bigint {
  if (!Number.isSafeInteger(m)) throw new EngineInvariantError(`${what} is not a safe integer`);
  return BigInt(m);
}

export function toSafeInt(v: bigint, what = "result"): number {
  if (v > MAX_SAFE || v < -MAX_SAFE) throw new EngineInvariantError(`${what} is not a safe integer`);
  return Number(v);
}

export function divRound(n: bigint, d: bigint): bigint {
  if (d === 0n) throw new EngineInvariantError("division by zero");
  const neg = (n < 0n) !== (d < 0n);
  const ad = abs(d);
  const q = (2n * abs(n) + ad) / (2n * ad);
  return neg ? -q : q;
}

export const mulBp = (m: Minor, bp: number): Minor =>
  toSafeInt(divRound(toBig(m) * toBig(bp, "basis points"), 10000n), "mulBp result");

export function mulFrac(m: Minor, num: number, den: number): Minor {
  const d = toBig(den, "denominator");
  if (d <= 0n) throw new EngineInvariantError("denominator must be positive");
  return toSafeInt(divRound(toBig(m) * toBig(num, "numerator"), d), "mulFrac result");
}

function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

export function ratFromBig(n: bigint, d: bigint): Rat {
  if (d === 0n) throw new EngineInvariantError("rational with zero denominator");
  if (n === 0n) return { n: 0n, d: 1n };
  const g = gcd(n, d);
  const s = d < 0n ? -1n : 1n;
  return { n: (s * n) / g, d: (s * d) / g };
}

export const RAT_ZERO: Rat = { n: 0n, d: 1n };
export const ratFrom = (n: number, d: number): Rat => ratFromBig(toBig(n, "numerator"), toBig(d, "denominator"));
export const ratAdd = (a: Rat, b: Rat): Rat => ratFromBig(a.n * b.d + b.n * a.d, a.d * b.d);
export const ratSub = (a: Rat, b: Rat): Rat => ratFromBig(a.n * b.d - b.n * a.d, a.d * b.d);
export const ratMul = (a: Rat, b: Rat): Rat => ratFromBig(a.n * b.n, a.d * b.d);
export const ratMulInt = (a: Rat, k: number): Rat => ratFromBig(a.n * toBig(k, "multiplier"), a.d);
export const ratMulBig = (a: Rat, k: bigint): Rat => ratFromBig(a.n * k, a.d);
export const ratDivBig = (a: Rat, k: bigint): Rat => ratFromBig(a.n, a.d * k);
export const ratCmp = (a: Rat, b: Rat): number => {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
};
export const ratToStrings = (a: Rat): { n: string; d: string } => ({ n: a.n.toString(), d: a.d.toString() });

export const mulRat = (m: Minor, r: Rat): Minor => toSafeInt(divRound(toBig(m) * r.n, r.d), "mulRat result");

const MAX_DECIMAL_TEXT = 200;
const MAX_DECIMAL_SHIFT = 400;
const DECIMAL_RE = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;

/** Parses a decimal string exactly and returns round-half-away(value * 10^scale) as a BigInt. */
export function parseScaled(text: string, scale: number): bigint {
  const s = text.trim();
  if (s.length === 0 || s.length > MAX_DECIMAL_TEXT) throw new EngineInvariantError("invalid decimal value");
  const m = DECIMAL_RE.exec(s);
  if (!m) throw new EngineInvariantError(`invalid decimal value "${s.slice(0, 40)}"`);
  const intPart = m[2] ?? "";
  const fracPart = m[3] ?? "";
  if (intPart.length + fracPart.length === 0) throw new EngineInvariantError("invalid decimal value");
  const exp = m[4] === undefined ? 0 : Number(m[4]);
  const shift = exp - fracPart.length + scale;
  if (!Number.isFinite(shift) || Math.abs(shift) > MAX_DECIMAL_SHIFT) throw new EngineInvariantError("decimal exponent out of range");
  const digits = BigInt(intPart + fracPart);
  const scaled = shift >= 0 ? digits * 10n ** BigInt(shift) : divRound(digits, 10n ** BigInt(-shift));
  return m[1] === "-" ? -scaled : scaled;
}

export function decimalToMinor(v: { toString(): string } | string | number): Minor {
  if (typeof v === "number" && !Number.isFinite(v)) throw new EngineInvariantError("amount is not finite");
  return toSafeInt(parseScaled(typeof v === "string" ? v : String(v), 2), "decimalToMinor result");
}

export function bpFromPct(pct: string | number): number {
  if (typeof pct === "number" && !Number.isFinite(pct)) throw new EngineInvariantError("percentage is not finite");
  const s = (typeof pct === "string" ? pct : String(pct)).trim();
  const m = /^(\d{1,3})(?:\.(\d+))?$/.exec(s);
  if (!m) throw new EngineInvariantError("percentage must be a plain decimal with at most 2 decimal places");
  const frac = m[2] ?? "";
  if (/[1-9]/.test(frac.slice(2))) throw new EngineInvariantError("percentage has more than 2 decimal places");
  const bp = Number(m[1]) * 100 + Number(frac.slice(0, 2).padEnd(2, "0"));
  if (bp < 1 || bp > 10000) throw new EngineInvariantError("percentage must be greater than 0 and at most 100");
  return bp;
}

export const minorToMajor = (m: Minor): number => m / 100;

export function minorToDecimalString(m: Minor): string {
  const b = toBig(m);
  const a = abs(b);
  return `${b < 0n ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
}

/** Largest-remainder split of total over integer weights; ties go to the lower index; parts always sum to total. */
export function allocateMinor(total: Minor, weights: number[]): Minor[] {
  if (weights.length === 0) throw new EngineInvariantError("allocateMinor needs at least one weight");
  let w = weights.map((x) => {
    const b = toBig(x, "weight");
    if (b < 0n) throw new EngineInvariantError("weight must not be negative");
    return b;
  });
  let sum = w.reduce((a, b) => a + b, 0n);
  if (sum === 0n) {
    w = weights.map(() => 1n);
    sum = BigInt(weights.length);
  }
  const t = toBig(total, "total");
  const T = abs(t);
  const base = w.map((x) => (T * x) / sum);
  const rem = w.map((x) => (T * x) % sum);
  let left = T - base.reduce((a, b) => a + b, 0n);
  const order = weights.map((_, i) => i).sort((i, j) => (rem[i] === rem[j] ? i - j : rem[i] > rem[j] ? -1 : 1));
  for (const i of order) {
    if (left <= 0n) break;
    base[i] += 1n;
    left -= 1n;
  }
  return base.map((x) => toSafeInt(t < 0n ? -x : x, "allocation part"));
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

export function convertMinor(amount: Minor, from: string, to: string, micro: RateMicro): Minor | null {
  if (from === to) return toSafeInt(toBig(amount), "convertMinor amount");
  if (!has(micro, from) || !has(micro, to)) return null;
  const a = micro[from];
  const b = micro[to];
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a <= 0 || b <= 0) return null;
  return toSafeInt(divRound(toBig(amount) * BigInt(a), BigInt(b)), "convertMinor result");
}

/** Rates that are missing or not a positive 6-dp number are left out, so conversions return null (needs a rate). */
export function microFromRates(r: RateMap): RateMicro {
  const out: RateMicro = { LKR: 1_000_000 };
  for (const [ccy, entry] of Object.entries(r.perUnit)) {
    if (ccy === "LKR") continue;
    try {
      const v = parseScaled(entry.rate, 6);
      if (v > 0n && v <= MAX_SAFE) out[ccy] = Number(v);
    } catch {
      // an unparsable rate counts as missing
    }
  }
  return out;
}

const SHA_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/** Dependency-free SHA-256 (hex) so pure modules stay usable in any runtime; verified against node:crypto in the tests. */
export function sha256Hex(input: string): string {
  const msg = new TextEncoder().encode(input);
  const len = msg.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[len] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor((len * 8) / 0x100000000));
  view.setUint32(total - 4, (len * 8) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, "0")).join("");
}
