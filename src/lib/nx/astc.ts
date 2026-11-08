/**
 * ASTC (LDR, 2D) block decoder, following the Khronos ASTC specification.
 * Decodes one 128-bit block into RGBA8 texels (bw × bh). HDR endpoint modes, which the
 * console's UI textures don't use, decode to magenta like the reference "error colour".
 */

const ERROR: [number, number, number, number] = [255, 0, 255, 255];

/** Reads `len` bits starting at bit `start` from a 16-byte block (little endian). */
function bits(b: Uint8Array, o: number, start: number, len: number): number {
  let v = 0;
  for (let i = 0; i < len; i++) {
    const bit = start + i;
    v |= ((b[o + (bit >> 3)] >> (bit & 7)) & 1) << i;
  }
  return v >>> 0;
}

/* ------------------------- integer sequence encoding ------------------------- */

interface Range {
  trits: number;
  quints: number;
  bits: number;
}

/** Quantisation ranges, indexed by the number of levels - 1 they can represent. */
function rangeFor(max: number): Range {
  const table: Record<number, Range> = {
    1: { trits: 0, quints: 0, bits: 1 },
    2: { trits: 1, quints: 0, bits: 0 },
    3: { trits: 0, quints: 0, bits: 2 },
    4: { trits: 0, quints: 1, bits: 0 },
    5: { trits: 1, quints: 0, bits: 1 },
    7: { trits: 0, quints: 0, bits: 3 },
    9: { trits: 0, quints: 1, bits: 1 },
    11: { trits: 1, quints: 0, bits: 2 },
    15: { trits: 0, quints: 0, bits: 4 },
    19: { trits: 0, quints: 1, bits: 2 },
    23: { trits: 1, quints: 0, bits: 3 },
    31: { trits: 0, quints: 0, bits: 5 },
    39: { trits: 0, quints: 1, bits: 3 },
    47: { trits: 1, quints: 0, bits: 4 },
    63: { trits: 0, quints: 0, bits: 6 },
    79: { trits: 0, quints: 1, bits: 4 },
    95: { trits: 1, quints: 0, bits: 5 },
    127: { trits: 0, quints: 0, bits: 7 },
    159: { trits: 0, quints: 1, bits: 5 },
    191: { trits: 1, quints: 0, bits: 6 },
    255: { trits: 0, quints: 0, bits: 8 },
  };
  return table[max];
}

const COLOR_MAXES = [1, 2, 3, 4, 5, 7, 9, 11, 15, 19, 23, 31, 39, 47, 63, 79, 95, 127, 159, 191, 255];

function iseBits(count: number, r: Range): number {
  if (r.trits) return Math.ceil((8 * count) / 5) + count * r.bits;
  if (r.quints) return Math.ceil((7 * count) / 3) + count * r.bits;
  return count * r.bits;
}

function decodeTrits(T: number): number[] {
  const b = (i: number) => (T >> i) & 1;
  let C: number;
  let t4: number;
  let t3: number;
  if (((T >> 2) & 7) === 7) {
    C = (((T >> 5) & 7) << 2) | (T & 3);
    t4 = 2;
    t3 = 2;
  } else {
    C = T & 0x1f;
    if (((T >> 5) & 3) === 3) {
      t4 = 2;
      t3 = b(7);
    } else {
      t4 = b(7);
      t3 = (T >> 5) & 3;
    }
  }
  let t0: number;
  let t1: number;
  let t2: number;
  const c = (i: number) => (C >> i) & 1;
  if ((C & 3) === 3) {
    t2 = 2;
    t1 = c(4);
    t0 = (c(3) << 1) | (c(2) & (c(3) ^ 1));
  } else if (((C >> 2) & 3) === 3) {
    t2 = 2;
    t1 = 2;
    t0 = C & 3;
  } else {
    t2 = c(4);
    t1 = (C >> 2) & 3;
    t0 = (c(1) << 1) | (c(0) & (c(1) ^ 1));
  }
  return [t0, t1, t2, t3, t4];
}

function decodeQuints(Q: number): number[] {
  const q = (i: number) => (Q >> i) & 1;
  let q0: number;
  let q1: number;
  let q2: number;
  if (((Q >> 1) & 3) === 3 && ((Q >> 5) & 3) === 0) {
    q2 = (q(0) << 2) | ((q(4) & (q(0) ^ 1)) << 1) | (q(3) & (q(0) ^ 1));
    q1 = 4;
    q0 = 4;
  } else {
    let C: number;
    if (((Q >> 1) & 3) === 3) {
      q2 = 4;
      C = (((Q >> 3) & 3) << 3) | ((~(Q >> 5) & 3) << 1) | q(0);
    } else {
      q2 = (Q >> 5) & 3;
      C = Q & 0x1f;
    }
    if ((C & 7) === 5) {
      q1 = 4;
      q0 = (C >> 3) & 3;
    } else {
      q1 = (C >> 3) & 3;
      q0 = C & 7;
    }
  }
  return [q0, q1, q2];
}

/** Decodes `count` ISE values; returns [bitsPart, digit] pairs. */
function decodeIse(readRaw: (start: number, len: number) => number, start: number, count: number, r: Range): { m: number; d: number }[] {
  // A truncated final trit/quint group reads its missing bits as zero.
  const end = start + iseBits(count, r);
  const read = (at: number, len: number) => {
    if (at >= end) return 0;
    const n = Math.min(len, end - at);
    return readRaw(at, n);
  };
  const out: { m: number; d: number }[] = [];
  let pos = start;
  const nb = r.bits;
  if (r.trits) {
    for (let i = 0; i < count; i += 5) {
      const m: number[] = [];
      let T = 0;
      const take = (len: number) => {
        const v = read(pos, len);
        pos += len;
        return v;
      };
      m[0] = take(nb);
      T |= take(2);
      m[1] = take(nb);
      T |= take(2) << 2;
      m[2] = take(nb);
      T |= take(1) << 4;
      m[3] = take(nb);
      T |= take(2) << 5;
      m[4] = take(nb);
      T |= take(1) << 7;
      const t = decodeTrits(T);
      for (let j = 0; j < 5 && i + j < count; j++) out.push({ m: m[j], d: t[j] });
    }
  } else if (r.quints) {
    for (let i = 0; i < count; i += 3) {
      const m: number[] = [];
      let Q = 0;
      const take = (len: number) => {
        const v = read(pos, len);
        pos += len;
        return v;
      };
      m[0] = take(nb);
      Q |= take(3);
      m[1] = take(nb);
      Q |= take(2) << 3;
      m[2] = take(nb);
      Q |= take(2) << 5;
      const q = decodeQuints(Q);
      for (let j = 0; j < 3 && i + j < count; j++) out.push({ m: m[j], d: q[j] });
    }
  } else {
    for (let i = 0; i < count; i++) {
      out.push({ m: read(pos, nb), d: 0 });
      pos += nb;
    }
  }
  return out;
}

/* ------------------------------ unquantisation ------------------------------ */

function replicate(v: number, from: number, to: number): number {
  if (from === 0) return 0;
  let out = 0;
  let have = 0;
  while (have < to) {
    const take = Math.min(from, to - have);
    out = (out << take) | (v >> (from - take));
    have += take;
  }
  return out;
}

function unquantColor(v: { m: number; d: number }, r: Range): number {
  const nb = r.bits;
  if (!r.trits && !r.quints) return replicate(v.m, nb, 8);
  const a = v.m & 1 ? 0x1ff : 0;
  const bit = (i: number) => (v.m >> i) & 1;
  let B = 0;
  let C = 0;
  if (r.trits) {
    switch (nb) {
      case 1:
        C = 204;
        break;
      case 2: {
        const b = bit(1);
        B = (b << 8) | (b << 4) | (b << 2) | (b << 1);
        C = 93;
        break;
      }
      case 3: {
        const b = bit(1);
        const c = bit(2);
        B = (c << 8) | (b << 7) | (c << 3) | (b << 2) | (c << 1) | b;
        C = 44;
        break;
      }
      case 4: {
        const b = bit(1);
        const c = bit(2);
        const d = bit(3);
        B = (d << 8) | (c << 7) | (b << 6) | (d << 2) | (c << 1) | b;
        C = 22;
        break;
      }
      case 5: {
        const b = bit(1);
        const c = bit(2);
        const d = bit(3);
        const e = bit(4);
        B = (e << 8) | (d << 7) | (c << 6) | (b << 5) | (e << 1) | d;
        C = 11;
        break;
      }
      case 6: {
        const b = bit(1);
        const c = bit(2);
        const d = bit(3);
        const e = bit(4);
        const f = bit(5);
        B = (f << 8) | (e << 7) | (d << 6) | (c << 5) | (b << 4) | f;
        C = 5;
        break;
      }
    }
  } else {
    switch (nb) {
      case 1:
        C = 113;
        break;
      case 2: {
        const b = bit(1);
        B = (b << 8) | (b << 3) | (b << 2);
        C = 54;
        break;
      }
      case 3: {
        const b = bit(1);
        const c = bit(2);
        B = (c << 8) | (b << 7) | (c << 2) | (b << 1) | c;
        C = 26;
        break;
      }
      case 4: {
        const b = bit(1);
        const c = bit(2);
        const d = bit(3);
        B = (d << 8) | (c << 7) | (b << 6) | (d << 1) | c;
        C = 13;
        break;
      }
      case 5: {
        const b = bit(1);
        const c = bit(2);
        const d = bit(3);
        const e = bit(4);
        B = (e << 8) | (d << 7) | (c << 6) | (b << 5) | e;
        C = 6;
        break;
      }
    }
  }
  let t = v.d * C + B;
  t ^= a;
  return (a & 0x80) | (t >> 2);
}

function unquantWeight(v: { m: number; d: number }, r: Range): number {
  const nb = r.bits;
  let w: number;
  if (!r.trits && !r.quints) {
    w = replicate(v.m, nb, 6);
  } else if (nb === 0) {
    w = r.trits ? [0, 32, 63][v.d] : [0, 16, 32, 47, 63][v.d];
  } else {
    const a = v.m & 1 ? 0x7f : 0;
    const b = (v.m >> 1) & 1;
    const c = (v.m >> 2) & 1;
    let B = 0;
    let C = 0;
    if (r.trits) {
      if (nb === 1) C = 50;
      else if (nb === 2) {
        B = (b << 6) | (b << 2) | b;
        C = 23;
      } else {
        B = (c << 6) | (b << 5) | (c << 1) | b;
        C = 11;
      }
    } else if (nb === 1) C = 28;
    else {
      B = (b << 6) | (b << 1);
      C = 13;
    }
    let t = v.d * C + B;
    t ^= a;
    w = (a & 0x20) | (t >> 2);
  }
  return w > 32 ? w + 1 : w;
}

/* -------------------------------- partitions -------------------------------- */

function hash52(p: number): number {
  p >>>= 0;
  p ^= p >>> 15;
  p = (p - (p << 17)) >>> 0;
  p = (p + (p << 7)) >>> 0;
  p = (p + (p << 4)) >>> 0;
  p ^= p >>> 5;
  p = (p + (p << 16)) >>> 0;
  p ^= p >>> 7;
  p ^= p >>> 3;
  p = (p ^ (p << 6)) >>> 0;
  p ^= p >>> 17;
  return p >>> 0;
}

function selectPartition(seed: number, x: number, y: number, count: number, small: boolean): number {
  if (small) {
    x <<= 1;
    y <<= 1;
  }
  seed += (count - 1) * 1024;
  const rnum = hash52(seed);
  const s = [
    rnum & 0xf,
    (rnum >>> 4) & 0xf,
    (rnum >>> 8) & 0xf,
    (rnum >>> 12) & 0xf,
    (rnum >>> 16) & 0xf,
    (rnum >>> 20) & 0xf,
    (rnum >>> 24) & 0xf,
    (rnum >>> 28) & 0xf,
    (rnum >>> 18) & 0xf,
    (rnum >>> 22) & 0xf,
    (rnum >>> 26) & 0xf,
    ((rnum >>> 30) | (rnum << 2)) & 0xf,
  ].map((v) => v * v);
  let sh1: number;
  let sh2: number;
  if (seed & 1) {
    sh1 = seed & 2 ? 4 : 5;
    sh2 = count === 3 ? 6 : 5;
  } else {
    sh1 = count === 3 ? 6 : 5;
    sh2 = seed & 2 ? 4 : 5;
  }
  const sh3 = seed & 0x10 ? sh1 : sh2;
  const shifts = [sh1, sh2, sh1, sh2, sh1, sh2, sh1, sh2, sh3, sh3, sh3, sh3];
  for (let i = 0; i < 12; i++) s[i] >>= shifts[i];
  const z = 0;
  let a = (s[0] * x + s[1] * y + s[10] * z + (rnum >>> 14)) & 0x3f;
  let b = (s[2] * x + s[3] * y + s[11] * z + (rnum >>> 10)) & 0x3f;
  let c = (s[4] * x + s[5] * y + s[8] * z + (rnum >>> 6)) & 0x3f;
  let d = (s[6] * x + s[7] * y + s[9] * z + (rnum >>> 2)) & 0x3f;
  if (count < 4) d = 0;
  if (count < 3) c = 0;
  if (a >= b && a >= c && a >= d) return 0;
  if (b >= c && b >= d) return 1;
  if (c >= d) return 2;
  void a;
  void b;
  return 3;
}

/* --------------------------------- endpoints -------------------------------- */

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

function bitTransferSigned(a: number, b: number): [number, number] {
  b >>= 1;
  b |= a & 0x80;
  a >>= 1;
  a &= 0x3f;
  if (a & 0x20) a -= 0x40;
  return [a, b];
}

const blueContract = (r: number, g: number, b: number, a: number): number[] => [(r + b) >> 1, (g + b) >> 1, b, a];

function endpoints(mode: number, v: number[]): [number[], number[]] | null {
  switch (mode) {
    case 0:
      return [[v[0], v[0], v[0], 255], [v[1], v[1], v[1], 255]];
    case 1: {
      const l0 = (v[0] >> 2) | (v[1] & 0xc0);
      const l1 = Math.min(255, l0 + (v[1] & 0x3f));
      return [[l0, l0, l0, 255], [l1, l1, l1, 255]];
    }
    case 4:
      return [[v[0], v[0], v[0], v[2]], [v[1], v[1], v[1], v[3]]];
    case 5: {
      const [o1, b0] = bitTransferSigned(v[1], v[0]);
      const [o3, b2] = bitTransferSigned(v[3], v[2]);
      const l = clamp(b0 + o1);
      return [[b0, b0, b0, b2], [l, l, l, clamp(b2 + o3)]];
    }
    case 6:
      return [
        [(v[0] * v[3]) >> 8, (v[1] * v[3]) >> 8, (v[2] * v[3]) >> 8, 255],
        [v[0], v[1], v[2], 255],
      ];
    case 8:
    case 12: {
      const a0 = mode === 12 ? v[6] : 255;
      const a1 = mode === 12 ? v[7] : 255;
      const s0 = v[0] + v[2] + v[4];
      const s1 = v[1] + v[3] + v[5];
      if (s1 >= s0) return [[v[0], v[2], v[4], a0], [v[1], v[3], v[5], a1]];
      return [blueContract(v[1], v[3], v[5], a1), blueContract(v[0], v[2], v[4], a0)];
    }
    case 9:
    case 13: {
      const [o1, b0] = bitTransferSigned(v[1], v[0]);
      const [o3, b2] = bitTransferSigned(v[3], v[2]);
      const [o5, b4] = bitTransferSigned(v[5], v[4]);
      let b6 = 255;
      let o7 = 0;
      if (mode === 13) [o7, b6] = bitTransferSigned(v[7], v[6]);
      if (o1 + o3 + o5 >= 0) {
        return [
          [b0, b2, b4, b6],
          [clamp(b0 + o1), clamp(b2 + o3), clamp(b4 + o5), clamp(b6 + o7)],
        ];
      }
      const e0 = blueContract(b0 + o1, b2 + o3, b4 + o5, b6 + o7).map(clamp);
      const e1 = blueContract(b0, b2, b4, b6).map(clamp);
      return [e0, e1];
    }
    case 10:
      return [
        [(v[0] * v[3]) >> 8, (v[1] * v[3]) >> 8, (v[2] * v[3]) >> 8, v[4]],
        [v[0], v[1], v[2], v[5]],
      ];
    default:
      return null; // HDR
  }
}

/* --------------------------------- block mode -------------------------------- */

interface BlockMode {
  w: number;
  h: number;
  dual: boolean;
  range: Range;
}

function blockMode(mode: number): BlockMode | null {
  let w: number;
  let h: number;
  let r: number;
  let hp = (mode >> 9) & 1;
  let dual = (mode >> 10) & 1;
  const A = (mode >> 5) & 3;
  if (mode & 3) {
    r = ((mode >> 4) & 1) | ((mode & 3) << 1);
    const B = (mode >> 7) & 3;
    switch ((mode >> 2) & 3) {
      case 0:
        w = B + 4;
        h = A + 2;
        break;
      case 1:
        w = B + 8;
        h = A + 2;
        break;
      case 2:
        w = A + 2;
        h = B + 8;
        break;
      default:
        if (mode & 0x100) {
          w = ((mode >> 7) & 1) + 2;
          h = A + 2;
        } else {
          w = A + 2;
          h = ((mode >> 7) & 1) + 6;
        }
    }
  } else {
    r = ((mode >> 4) & 1) | (((mode >> 2) & 3) << 1);
    if ((mode & 0xf) === 0) return null;
    switch ((mode >> 7) & 3) {
      case 0:
        w = 12;
        h = A + 2;
        break;
      case 1:
        w = A + 2;
        h = 12;
        break;
      case 2:
        w = A + 6;
        h = ((mode >> 9) & 3) + 6;
        hp = 0;
        dual = 0;
        break;
      default:
        if (A === 0) {
          w = 6;
          h = 10;
        } else if (A === 1) {
          w = 10;
          h = 6;
        } else return null;
    }
  }
  if (r < 2) return null;
  const maxes = hp ? [9, 11, 15, 19, 23, 31] : [1, 2, 3, 4, 5, 7];
  return { w, h, dual: dual === 1, range: rangeFor(maxes[r - 2]) };
}

/* ---------------------------------- block ---------------------------------- */

/** Decodes one 16-byte ASTC block at `o` into `out` (bw*bh*4 RGBA8). */
export function decodeAstcBlock(b: Uint8Array, o: number, bw: number, bh: number, out: Uint8ClampedArray) {
  const texels = bw * bh;
  const fill = (c: readonly number[]) => {
    for (let i = 0; i < texels; i++) out.set(c, i * 4);
  };
  const read = (start: number, len: number) => bits(b, o, start, len);
  const mode = read(0, 11);

  // Void extent: one constant colour.
  if ((mode & 0x1ff) === 0x1fc) {
    if (mode & 0x200) return fill(ERROR); // HDR
    fill([read(64, 16) >> 8, read(80, 16) >> 8, read(96, 16) >> 8, read(112, 16) >> 8]);
    return;
  }
  const bm = blockMode(mode);
  if (!bm) return fill(ERROR);
  const weightCount = bm.w * bm.h * (bm.dual ? 2 : 1);
  const weightBits = iseBits(weightCount, bm.range);
  if (bm.w > bw || bm.h > bh || weightCount > 64 || weightBits < 24 || weightBits > 96) return fill(ERROR);

  const parts = read(11, 2) + 1;
  if (parts === 4 && bm.dual) return fill(ERROR);

  // Colour endpoint modes.
  const cems: number[] = [];
  let configEnd: number;
  let extraCemBits = 0;
  if (parts === 1) {
    cems.push(read(13, 4));
    configEnd = 17;
  } else {
    configEnd = 29;
    const cemField = read(23, 6);
    if ((cemField & 3) === 0) {
      for (let i = 0; i < parts; i++) cems.push(cemField >> 2);
    } else {
      extraCemBits = 3 * parts - 4;
      const extra = read(128 - weightBits - extraCemBits, extraCemBits);
      const all = cemField | (extra << 6);
      const base = (all & 3) - 1;
      for (let i = 0; i < parts; i++) {
        const c = (all >> (2 + i)) & 1;
        const m = (all >> (2 + parts + 2 * i)) & 3;
        cems.push(((base + c) << 2) | m);
      }
    }
  }
  const planeSelBits = bm.dual ? 2 : 0;
  const plane2Comp = bm.dual ? read(128 - weightBits - extraCemBits - 2, 2) : -1;

  // Colour values.
  const colorCount = cems.reduce((s, c) => s + ((c >> 2) + 1) * 2, 0);
  if (colorCount > 18) return fill(ERROR);
  const colorBitsAvail = 128 - weightBits - extraCemBits - planeSelBits - configEnd;
  let colorRange: Range | null = null;
  for (let i = COLOR_MAXES.length - 1; i >= 0; i--) {
    const r = rangeFor(COLOR_MAXES[i]);
    if (iseBits(colorCount, r) <= colorBitsAvail) {
      colorRange = r;
      break;
    }
  }
  if (!colorRange) return fill(ERROR);
  const colorVals = decodeIse(read, configEnd, colorCount, colorRange).map((v) => unquantColor(v, colorRange!));
  const eps: [number[], number[]][] = [];
  let ci = 0;
  for (const cem of cems) {
    const n = ((cem >> 2) + 1) * 2;
    const e = endpoints(cem, colorVals.slice(ci, ci + n));
    ci += n;
    if (!e) return fill(ERROR);
    eps.push(e);
  }

  // Weights: stored bit-reversed from the top of the block.
  const rev = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    let x = b[o + 15 - i];
    x = ((x & 0xf0) >> 4) | ((x & 0x0f) << 4);
    x = ((x & 0xcc) >> 2) | ((x & 0x33) << 2);
    x = ((x & 0xaa) >> 1) | ((x & 0x55) << 1);
    rev[i] = x;
  }
  const readRev = (start: number, len: number) => bits(rev, 0, start, len);
  const weights = decodeIse(readRev, 0, weightCount, bm.range).map((v) => unquantWeight(v, bm.range));

  // Infill weights onto the texel grid.
  const planes = bm.dual ? 2 : 1;
  const ds = Math.floor((1024 + (bw >> 1)) / (bw - 1));
  const dt = Math.floor((1024 + (bh >> 1)) / (bh - 1));
  const partSeed = parts > 1 ? read(13, 10) : 0;
  const small = texels < 31;
  for (let t = 0; t < bh; t++) {
    for (let s = 0; s < bw; s++) {
      const gs = (ds * s * (bm.w - 1) + 32) >> 6;
      const gt = (dt * t * (bm.h - 1) + 32) >> 6;
      const js = gs >> 4;
      const fs = gs & 15;
      const jt = gt >> 4;
      const ft = gt & 15;
      const w11 = (fs * ft + 8) >> 4;
      const w10 = ft - w11;
      const w01 = fs - w11;
      const w00 = 16 - fs - ft + w11;
      const tw = [0, 0];
      for (let p = 0; p < planes; p++) {
        const at = (x: number, y: number) => (x < bm.w && y < bm.h ? weights[(y * bm.w + x) * planes + p] : 0);
        tw[p] = (at(js, jt) * w00 + at(js + 1, jt) * w01 + at(js, jt + 1) * w10 + at(js + 1, jt + 1) * w11 + 8) >> 4;
      }
      const part = parts > 1 ? selectPartition(partSeed, s, t, parts, small) : 0;
      const [e0, e1] = eps[part];
      const i = (t * bw + s) * 4;
      for (let c = 0; c < 4; c++) {
        const w = c === plane2Comp ? tw[1] : tw[0];
        const c0 = e0[c] * 257;
        const c1 = e1[c] * 257;
        out[i + c] = ((c0 * (64 - w) + c1 * w + 32) >> 6) >> 8;
      }
    }
  }
}
