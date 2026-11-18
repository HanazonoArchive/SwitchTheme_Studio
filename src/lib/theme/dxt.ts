/**
 * DXT1/DXT5 (BC1/BC3) block compression: a line-for-line port of stb_dxt.h v1.12 (public domain,
 * Fabian "ryg" Giesen and Sean Barrett), the encoder NXThemes Installer runs on the console
 * (ImageConversion::ToDDS, mode STB_DXT_DITHER | STB_DXT_HIGHQUAL; dither does nothing in 1.12).
 *
 * The console turns image.jpg into DXT1 and the icon PNGs into DXT5 with it, so encoding the same
 * pixels here gives the texture the console draws. Floats are rounded to 32 bits (Math.fround)
 * where the C code uses float; the only possible difference is the compiler fusing a multiply-add
 * in the colour-axis estimate, which can rarely pick a different but equally good endpoint pair.
 */

const f = Math.fround;

// stb__OMatch5/6: optimal single-colour endpoints, [value*2] = max, [value*2+1] = min.
const OMATCH5 = new Uint8Array([0,0,0,0,0,1,0,1,1,0,1,0,1,0,1,1,1,1,1,1,1,2,0,4,2,1,2,1,2,1,2,2,2,2,2,2,2,3,1,5,3,2,3,2,4,0,3,3,3,3,3,3,3,4,3,4,3,4,3,5,4,3,4,3,5,2,4,4,4,4,4,5,4,5,5,4,5,4,5,4,6,3,5,5,5,5,5,6,4,8,6,5,6,5,6,5,6,6,6,6,6,6,6,7,5,9,7,6,7,6,8,4,7,7,7,7,7,7,7,8,7,8,7,8,7,9,8,7,8,7,9,6,8,8,8,8,8,9,8,9,9,8,9,8,9,8,10,7,9,9,9,9,9,10,8,12,10,9,10,9,10,9,10,10,10,10,10,10,10,11,9,13,11,10,11,10,12,8,11,11,11,11,11,11,11,12,11,12,11,12,11,13,12,11,12,11,13,10,12,12,12,12,12,13,12,13,13,12,13,12,13,12,14,11,13,13,13,13,13,14,12,16,14,13,14,13,14,13,14,14,14,14,14,14,14,15,13,17,15,14,15,14,16,12,15,15,15,15,15,15,15,16,15,16,15,16,15,17,16,15,16,15,17,14,16,16,16,16,16,17,16,17,17,16,17,16,17,16,18,15,17,17,17,17,17,18,16,20,18,17,18,17,18,17,18,18,18,18,18,18,18,19,17,21,19,18,19,18,20,16,19,19,19,19,19,19,19,20,19,20,19,20,19,21,20,19,20,19,21,18,20,20,20,20,20,21,20,21,21,20,21,20,21,20,22,19,21,21,21,21,21,22,20,24,22,21,22,21,22,21,22,22,22,22,22,22,22,23,21,25,23,22,23,22,24,20,23,23,23,23,23,23,23,24,23,24,23,24,23,25,24,23,24,23,25,22,24,24,24,24,24,25,24,25,25,24,25,24,25,24,26,23,25,25,25,25,25,26,24,28,26,25,26,25,26,25,26,26,26,26,26,26,26,27,25,29,27,26,27,26,28,24,27,27,27,27,27,27,27,28,27,28,27,28,27,29,28,27,28,27,29,26,28,28,28,28,28,29,28,29,29,28,29,28,29,28,30,27,29,29,29,29,29,30,29,30,30,29,30,29,30,29,30,30,30,30,30,30,30,31,30,31,31,30,31,30,31,30,31,31,31,31]);
const OMATCH6 = new Uint8Array([0,0,0,1,1,0,1,1,1,1,1,2,2,1,2,2,2,2,2,3,3,2,3,3,3,3,3,4,4,3,4,4,4,4,4,5,5,4,5,5,5,5,5,6,6,5,6,6,6,6,6,7,7,6,7,7,7,7,7,8,8,7,8,8,8,8,8,9,9,8,9,9,9,9,9,10,10,9,10,10,10,10,10,11,11,10,8,16,11,11,11,12,12,11,9,17,12,12,12,13,13,12,11,16,13,13,13,14,14,13,12,17,14,14,14,15,15,14,14,16,15,15,15,16,16,14,16,15,17,14,16,16,16,17,17,16,18,15,17,17,17,18,18,17,20,14,18,18,18,19,19,18,21,15,19,19,19,20,20,19,20,20,20,20,20,21,21,20,21,21,21,21,21,22,22,21,22,22,22,22,22,23,23,22,23,23,23,23,23,24,24,23,24,24,24,24,24,25,25,24,25,25,25,25,25,26,26,25,26,26,26,26,26,27,27,26,24,32,27,27,27,28,28,27,25,33,28,28,28,29,29,28,27,32,29,29,29,30,30,29,28,33,30,30,30,31,31,30,30,32,31,31,31,32,32,30,32,31,33,30,32,32,32,33,33,32,34,31,33,33,33,34,34,33,36,30,34,34,34,35,35,34,37,31,35,35,35,36,36,35,36,36,36,36,36,37,37,36,37,37,37,37,37,38,38,37,38,38,38,38,38,39,39,38,39,39,39,39,39,40,40,39,40,40,40,40,40,41,41,40,41,41,41,41,41,42,42,41,42,42,42,42,42,43,43,42,40,48,43,43,43,44,44,43,41,49,44,44,44,45,45,44,43,48,45,45,45,46,46,45,44,49,46,46,46,47,47,46,46,48,47,47,47,48,48,46,48,47,49,46,48,48,48,49,49,48,50,47,49,49,49,50,50,49,52,46,50,50,50,51,51,50,53,47,51,51,51,52,52,51,52,52,52,52,52,53,53,52,53,53,53,53,53,54,54,53,54,54,54,54,54,55,55,54,55,55,55,55,55,56,56,55,56,56,56,56,56,57,57,56,57,57,57,57,57,58,58,57,58,58,58,58,58,59,59,58,59,59,59,59,59,60,60,59,60,60,60,60,60,61,61,60,61,61,61,61,61,62,62,61,62,62,62,62,62,63,63,62,63,63,63,63]);
const MID5 = new Float32Array([0.015686,0.047059,0.078431,0.111765,0.145098,0.176471,0.207843,0.241176,0.274510,0.305882,0.337255,0.370588,0.403922,0.435294,0.466667,0.5,0.533333,0.564706,0.596078,0.629412,0.662745,0.694118,0.725490,0.758824,0.792157,0.823529,0.854902,0.888235,0.921569,0.952941,0.984314,1.0]);
const MID6 = new Float32Array([0.007843,0.023529,0.039216,0.054902,0.070588,0.086275,0.101961,0.117647,0.133333,0.149020,0.164706,0.180392,0.196078,0.211765,0.227451,0.245098,0.262745,0.278431,0.294118,0.309804,0.325490,0.341176,0.356863,0.372549,0.388235,0.403922,0.419608,0.435294,0.450980,0.466667,0.482353,0.500000,0.517647,0.533333,0.549020,0.564706,0.580392,0.596078,0.611765,0.627451,0.643137,0.658824,0.674510,0.690196,0.705882,0.721569,0.737255,0.754902,0.772549,0.788235,0.803922,0.819608,0.835294,0.850980,0.866667,0.882353,0.898039,0.913725,0.929412,0.945098,0.960784,0.976471,0.992157,1.0]);

const mul8bit = (a: number, b: number) => {
  const t = a * b + 128;
  return (t + (t >> 8)) >> 8;
};

function from16(out: Int32Array, o: number, v: number) {
  const rv = (v & 0xf800) >> 11;
  const gv = (v & 0x07e0) >> 5;
  const bv = v & 0x001f;
  out[o] = (rv * 33) >> 2;
  out[o + 1] = (gv * 65) >> 4;
  out[o + 2] = (bv * 33) >> 2;
  out[o + 3] = 0;
}

const as16 = (r: number, g: number, b: number) => (mul8bit(r, 31) << 11) + (mul8bit(g, 63) << 5) + mul8bit(b, 31);

// Without rounding bias (STB_DXT_USE_ROUNDING_BIAS is off): (2a + b) / 3, C integer division.
const lerp13 = (a: number, b: number) => Math.trunc((2 * a + b) / 3);

function evalColors(color: Int32Array, c0: number, c1: number) {
  from16(color, 0, c0);
  from16(color, 4, c1);
  for (let i = 0; i < 3; i++) {
    color[8 + i] = lerp13(color[i], color[4 + i]);
    color[12 + i] = lerp13(color[4 + i], color[i]);
  }
}

function matchColors(block: Uint8Array, color: Int32Array): number {
  const dirr = color[0] - color[4];
  const dirg = color[1] - color[5];
  const dirb = color[2] - color[6];
  const dots = new Int32Array(16);
  for (let i = 0; i < 16; i++) dots[i] = block[i * 4] * dirr + block[i * 4 + 1] * dirg + block[i * 4 + 2] * dirb;
  const stops = [0, 1, 2, 3].map((i) => color[i * 4] * dirr + color[i * 4 + 1] * dirg + color[i * 4 + 2] * dirb);
  const c0Point = stops[1] + stops[3];
  const halfPoint = stops[3] + stops[2];
  const c3Point = stops[2] + stops[0];
  let mask = 0;
  for (let i = 15; i >= 0; i--) {
    const dot = dots[i] * 2;
    mask = (mask << 2) >>> 0;
    if (dot < halfPoint) mask |= dot < c0Point ? 1 : 3;
    else mask |= dot < c3Point ? 2 : 0;
  }
  return mask >>> 0;
}

function optimizeColors(block: Uint8Array): [number, number] {
  const mu = [0, 0, 0];
  const min = [0, 0, 0];
  const max = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    let muv = block[ch];
    let minv = muv;
    let maxv = muv;
    for (let i = 4; i < 64; i += 4) {
      const v = block[i + ch];
      muv += v;
      if (v < minv) minv = v;
      else if (v > maxv) maxv = v;
    }
    mu[ch] = (muv + 8) >> 4;
    min[ch] = minv;
    max[ch] = maxv;
  }
  const cov = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 16; i++) {
    const r = block[i * 4] - mu[0];
    const g = block[i * 4 + 1] - mu[1];
    const b = block[i * 4 + 2] - mu[2];
    cov[0] += r * r;
    cov[1] += r * g;
    cov[2] += r * b;
    cov[3] += g * g;
    cov[4] += g * b;
    cov[5] += b * b;
  }
  const covf = cov.map((c) => f(c / 255));
  let vfr = f(max[0] - min[0]);
  let vfg = f(max[1] - min[1]);
  let vfb = f(max[2] - min[2]);
  for (let iter = 0; iter < 4; iter++) {
    const r = f(f(f(vfr * covf[0]) + f(vfg * covf[1])) + f(vfb * covf[2]));
    const g = f(f(f(vfr * covf[1]) + f(vfg * covf[3])) + f(vfb * covf[4]));
    const b = f(f(f(vfr * covf[2]) + f(vfg * covf[4])) + f(vfb * covf[5]));
    vfr = r;
    vfg = g;
    vfb = b;
  }
  let magn = Math.max(Math.abs(vfr), Math.abs(vfg), Math.abs(vfb));
  let vr: number, vg: number, vb: number;
  if (magn < 4) {
    // Too small: luminance (JPEG YCbCr luma weights, x1000).
    vr = 299;
    vg = 587;
    vb = 114;
  } else {
    magn = 512 / magn;
    vr = Math.trunc(vfr * magn);
    vg = Math.trunc(vfg * magn);
    vb = Math.trunc(vfb * magn);
  }
  let minp = 0;
  let maxp = 0;
  let mind = block[0] * vr + block[1] * vg + block[2] * vb;
  let maxd = mind;
  for (let i = 1; i < 16; i++) {
    const dot = block[i * 4] * vr + block[i * 4 + 1] * vg + block[i * 4 + 2] * vb;
    if (dot < mind) {
      mind = dot;
      minp = i * 4;
    }
    if (dot > maxd) {
      maxd = dot;
      maxp = i * 4;
    }
  }
  return [as16(block[maxp], block[maxp + 1], block[maxp + 2]), as16(block[minp], block[minp + 1], block[minp + 2])];
}

function quantize(x: number, bits: 31 | 63, mids: Float32Array) {
  x = x < 0 ? 0 : x > 1 ? 1 : x;
  let q = Math.trunc(f(x * bits));
  if (x > mids[q]) q++;
  return q;
}

const W1 = [3, 0, 2, 1];
const PRODS = [0x090000, 0x000900, 0x040102, 0x010402];

/** Least-squares endpoint refinement. Returns [max16, min16, changed]. */
function refine(block: Uint8Array, max16: number, min16: number, mask: number): [number, number, boolean] {
  let nmax: number;
  let nmin: number;
  if (((mask ^ (mask << 2)) >>> 0) < 4) {
    // Every pixel has the same index: best single-colour match on the average colour.
    let r = 8;
    let g = 8;
    let b = 8;
    for (let i = 0; i < 16; i++) {
      r += block[i * 4];
      g += block[i * 4 + 1];
      b += block[i * 4 + 2];
    }
    r >>= 4;
    g >>= 4;
    b >>= 4;
    nmax = (OMATCH5[r * 2] << 11) | (OMATCH6[g * 2] << 5) | OMATCH5[b * 2];
    nmin = (OMATCH5[r * 2 + 1] << 11) | (OMATCH6[g * 2 + 1] << 5) | OMATCH5[b * 2 + 1];
  } else {
    let akku = 0;
    let a1r = 0, a1g = 0, a1b = 0, a2r = 0, a2g = 0, a2b = 0;
    let cm = mask;
    for (let i = 0; i < 16; i++, cm >>>= 2) {
      const step = cm & 3;
      const w1 = W1[step];
      const r = block[i * 4];
      const g = block[i * 4 + 1];
      const b = block[i * 4 + 2];
      akku += PRODS[step];
      a1r += w1 * r;
      a1g += w1 * g;
      a1b += w1 * b;
      a2r += r;
      a2g += g;
      a2b += b;
    }
    a2r = 3 * a2r - a1r;
    a2g = 3 * a2g - a1g;
    a2b = 3 * a2b - a1b;
    const xx = akku >> 16;
    const yy = (akku >> 8) & 0xff;
    const xy = akku & 0xff;
    const fac = f(f(3 / 255) / (xx * yy - xy * xy));
    const q = (v: number) => f(v * fac);
    nmax = (quantize(q(a1r * yy - a2r * xy), 31, MID5) << 11) | (quantize(q(a1g * yy - a2g * xy), 63, MID6) << 5) | quantize(q(a1b * yy - a2b * xy), 31, MID5);
    nmin = (quantize(q(a2r * xx - a1r * xy), 31, MID5) << 11) | (quantize(q(a2g * xx - a1g * xy), 63, MID6) << 5) | quantize(q(a2b * xx - a1b * xy), 31, MID5);
  }
  return [nmax, nmin, min16 !== nmin || max16 !== nmax];
}

function compressColor(dest: Uint8Array, o: number, block: Uint8Array, highQual: boolean) {
  const refineCount = highQual ? 2 : 1;
  const color = new Int32Array(16);
  let mask: number;
  let max16: number;
  let min16: number;
  let constant = true;
  for (let i = 1; i < 16 && constant; i++) {
    for (let c = 0; c < 4; c++) if (block[i * 4 + c] !== block[c]) constant = false;
  }
  if (constant) {
    const r = block[0], g = block[1], b = block[2];
    mask = 0xaaaaaaaa;
    max16 = (OMATCH5[r * 2] << 11) | (OMATCH6[g * 2] << 5) | OMATCH5[b * 2];
    min16 = (OMATCH5[r * 2 + 1] << 11) | (OMATCH6[g * 2 + 1] << 5) | OMATCH5[b * 2 + 1];
  } else {
    [max16, min16] = optimizeColors(block);
    if (max16 !== min16) {
      evalColors(color, max16, min16);
      mask = matchColors(block, color);
    } else mask = 0;
    for (let i = 0; i < refineCount; i++) {
      const last = mask;
      let changed: boolean;
      [max16, min16, changed] = refine(block, max16, min16, mask);
      if (changed) {
        if (max16 !== min16) {
          evalColors(color, max16, min16);
          mask = matchColors(block, color);
        } else {
          mask = 0;
          break;
        }
      }
      if (mask === last) break;
    }
  }
  if (max16 < min16) {
    [max16, min16] = [min16, max16];
    mask = (mask ^ 0x55555555) >>> 0;
  }
  dest[o] = max16 & 0xff;
  dest[o + 1] = max16 >> 8;
  dest[o + 2] = min16 & 0xff;
  dest[o + 3] = min16 >> 8;
  dest[o + 4] = mask & 0xff;
  dest[o + 5] = (mask >>> 8) & 0xff;
  dest[o + 6] = (mask >>> 16) & 0xff;
  dest[o + 7] = (mask >>> 24) & 0xff;
}

function compressAlpha(dest: Uint8Array, o: number, src: Uint8Array) {
  let mn = src[3];
  let mx = mn;
  for (let i = 1; i < 16; i++) {
    const a = src[i * 4 + 3];
    if (a < mn) mn = a;
    else if (a > mx) mx = a;
  }
  dest[o] = mx;
  dest[o + 1] = mn;
  let d = o + 2;
  const dist = mx - mn;
  const dist4 = dist * 4;
  const dist2 = dist * 2;
  let bias = dist < 8 ? dist - 1 : Math.trunc(dist / 2) + 2;
  bias -= mn * 7;
  let bits = 0;
  let mask = 0;
  for (let i = 0; i < 16; i++) {
    let a = src[i * 4 + 3] * 7 + bias;
    let t = a >= dist4 ? -1 : 0;
    let ind = t & 4;
    a -= dist4 & t;
    t = a >= dist2 ? -1 : 0;
    ind += t & 2;
    a -= dist2 & t;
    ind += a >= dist ? 1 : 0;
    ind = -ind & 7;
    ind ^= 2 > ind ? 1 : 0;
    mask |= ind << bits;
    if ((bits += 3) >= 8) {
      dest[d++] = mask & 0xff;
      mask >>= 8;
      bits -= 8;
    }
  }
}

/** stb_compress_dxt_block: 16 RGBA pixels (row by row) to 8 bytes (DXT1) or 16 bytes (DXT5). */
export function compressDxtBlock(dest: Uint8Array, o: number, src: Uint8Array, alpha: boolean, highQual = true) {
  if (alpha) {
    compressAlpha(dest, o, src);
    o += 8;
    const opaque = new Uint8Array(src);
    for (let i = 0; i < 16; i++) opaque[i * 4 + 3] = 255;
    src = opaque;
  }
  compressColor(dest, o, src, highQual);
}

/** Compresses RGBA pixels (width and height multiples of 4) the way ImageConversion::ToDDS does. */
export function encodeDxt(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, alpha: boolean): Uint8Array {
  const per = alpha ? 16 : 8;
  const out = new Uint8Array((width / 4) * (height / 4) * per);
  const block = new Uint8Array(64);
  let o = 0;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      for (let j = 0; j < 4; j++) block.set(rgba.subarray(((y + j) * width + x) * 4, ((y + j) * width + x + 4) * 4), j * 16);
      compressDxtBlock(out, o, block, alpha);
      o += per;
    }
  }
  return out;
}

/** Wraps encoded blocks in the same DDS header the installer writes. */
export function ddsFile(blocks: Uint8Array, width: number, height: number, alpha: boolean): Uint8Array {
  const out = new Uint8Array(128 + blocks.length);
  const v = new DataView(out.buffer);
  out.set([0x44, 0x44, 0x53, 0x20]);
  v.setUint32(4, 0x7c, true);
  v.setUint32(8, 0xa1007, true);
  v.setUint32(12, height, true);
  v.setUint32(16, width, true);
  v.setUint32(20, blocks.length, true);
  v.setUint32(76, 0x20, true);
  v.setUint32(80, 0x4, true);
  out.set(new TextEncoder().encode(alpha ? 'DXT5' : 'DXT1'), 84);
  v.setUint32(108, 0x401008, true);
  out.set(blocks, 128);
  return out;
}

// Decoding, as the GPU does: 5/6-bit channels expanded by bit replication, 1/3 and 2/3 blends.
const ex5 = (v: number) => (v << 3) | (v >> 2);
const ex6 = (v: number) => (v << 2) | (v >> 4);

/** Decodes DXT1/DXT5 blocks to RGBA. */
export function decodeDxt(blocks: Uint8Array, width: number, height: number, alpha: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const pal = new Int32Array(16);
  const apal = new Int32Array(8);
  let o = 0;
  for (let by = 0; by < height; by += 4) {
    for (let bx = 0; bx < width; bx += 4) {
      let alphaBits = 0n;
      if (alpha) {
        const a0 = blocks[o];
        const a1 = blocks[o + 1];
        apal[0] = a0;
        apal[1] = a1;
        if (a0 > a1) for (let i = 1; i < 7; i++) apal[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7);
        else {
          for (let i = 1; i < 5; i++) apal[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5);
          apal[6] = 0;
          apal[7] = 255;
        }
        for (let i = 7; i >= 2; i--) alphaBits = (alphaBits << 8n) | BigInt(blocks[o + i]);
        o += 8;
      }
      const c0 = blocks[o] | (blocks[o + 1] << 8);
      const c1 = blocks[o + 2] | (blocks[o + 3] << 8);
      const bits = (blocks[o + 4] | (blocks[o + 5] << 8) | (blocks[o + 6] << 16) | (blocks[o + 7] << 24)) >>> 0;
      o += 8;
      pal[0] = ex5(c0 >> 11);
      pal[1] = ex6((c0 >> 5) & 63);
      pal[2] = ex5(c0 & 31);
      pal[4] = ex5(c1 >> 11);
      pal[5] = ex6((c1 >> 5) & 63);
      pal[6] = ex5(c1 & 31);
      const four = alpha || c0 > c1;
      for (let i = 0; i < 3; i++) {
        if (four) {
          pal[8 + i] = Math.round((2 * pal[i] + pal[4 + i]) / 3);
          pal[12 + i] = Math.round((pal[i] + 2 * pal[4 + i]) / 3);
        } else {
          pal[8 + i] = Math.round((pal[i] + pal[4 + i]) / 2);
          pal[12 + i] = 0;
        }
      }
      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 4; i++) {
          const k = j * 4 + i;
          const idx = (bits >>> (2 * k)) & 3;
          const p = ((by + j) * width + bx + i) * 4;
          out[p] = pal[idx * 4];
          out[p + 1] = pal[idx * 4 + 1];
          out[p + 2] = pal[idx * 4 + 2];
          out[p + 3] = alpha ? apal[Number((alphaBits >> BigInt(3 * k)) & 7n)] : !four && idx === 3 ? 0 : 255;
        }
      }
    }
  }
  return out;
}

/** The pixels the console ends up drawing: encode with the installer's encoder, then decode. */
export function asConsoleStores(rgba: Uint8ClampedArray, width: number, height: number, alpha: boolean): Uint8ClampedArray {
  return decodeDxt(encodeDxt(rgba, width, height, alpha), width, height, alpha);
}
