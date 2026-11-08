import { BinaryReader } from './binary';

/**
 * BNTX texture container (timg/__Combined.bntx inside each .szs).
 * Header layout follows SwitchThemesCommon/Bntx (QuickBntx, Texture). Pixel data is stored in the
 * Tegra X1 "block linear" layout and decoded here for previewing.
 */
export interface BntxTexture {
  name: string;
  format: number;
  width: number;
  height: number;
  blockHeightLog2: number;
  /** Channel sources for R, G, B, A: 0 zero, 1 one, 2 red, 3 green, 4 blue, 5 alpha. */
  channels: [number, number, number, number];
  data: Uint8Array;
}

export function parseBntx(bytes: Uint8Array): Map<string, BntxTexture> {
  const r = new BinaryReader(bytes, true);
  if (r.magic() !== 'BNTX') throw new Error('Not a BNTX file');
  r.seek(0x20);
  if (r.magic() !== 'NX  ') throw new Error('Unsupported BNTX platform');
  const count = r.u32();
  const infoPtrs = Number(r.view.getBigUint64(0x28, true));
  const out = new Map<string, BntxTexture>();
  for (let i = 0; i < count; i++) {
    const at = Number(r.view.getBigUint64(infoPtrs + i * 8, true));
    r.seek(at);
    if (r.magic() !== 'BRTI') continue;
    const format = r.view.getUint32(at + 0x1c, true);
    const width = r.view.getUint32(at + 0x24, true);
    const height = r.view.getUint32(at + 0x28, true);
    const blockHeightLog2 = r.view.getUint32(at + 0x34, true);
    const dataLength = r.view.getUint32(at + 0x50, true);
    const channels = [bytes[at + 0x58], bytes[at + 0x59], bytes[at + 0x5a], bytes[at + 0x5b]] as [number, number, number, number];
    const nameAddr = Number(r.view.getBigUint64(at + 0x60, true));
    const ptrs = Number(r.view.getBigUint64(at + 0x70, true));
    const nameLen = r.view.getUint16(nameAddr, true);
    const name = new TextDecoder().decode(bytes.subarray(nameAddr + 2, nameAddr + 2 + nameLen));
    const dataAt = Number(r.view.getBigUint64(ptrs, true));
    out.set(name, { name, format, width, height, blockHeightLog2, channels, data: bytes.subarray(dataAt, dataAt + dataLength) });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Formats                                                                     */
/* -------------------------------------------------------------------------- */

interface FormatInfo {
  /** bytes per block (or per pixel for uncompressed formats) */
  bpp: number;
  bw: number;
  bh: number;
  name: string;
}

const FORMATS: Record<number, FormatInfo> = {
  0x02: { bpp: 1, bw: 1, bh: 1, name: 'R8' },
  0x07: { bpp: 2, bw: 1, bh: 1, name: 'R5G6B5' },
  0x09: { bpp: 2, bw: 1, bh: 1, name: 'R8G8' },
  0x0b: { bpp: 4, bw: 1, bh: 1, name: 'R8G8B8A8' },
  0x0c: { bpp: 4, bw: 1, bh: 1, name: 'B8G8R8A8' },
  0x1a: { bpp: 8, bw: 4, bh: 4, name: 'BC1' },
  0x1b: { bpp: 16, bw: 4, bh: 4, name: 'BC2' },
  0x1c: { bpp: 16, bw: 4, bh: 4, name: 'BC3' },
  0x1d: { bpp: 8, bw: 4, bh: 4, name: 'BC4' },
  0x1e: { bpp: 16, bw: 4, bh: 4, name: 'BC5' },
  0x2d: { bpp: 16, bw: 4, bh: 4, name: 'ASTC 4x4' },
  0x2e: { bpp: 16, bw: 5, bh: 4, name: 'ASTC 5x4' },
  0x2f: { bpp: 16, bw: 5, bh: 5, name: 'ASTC 5x5' },
  0x30: { bpp: 16, bw: 6, bh: 5, name: 'ASTC 6x5' },
  0x31: { bpp: 16, bw: 6, bh: 6, name: 'ASTC 6x6' },
  0x32: { bpp: 16, bw: 8, bh: 5, name: 'ASTC 8x5' },
  0x33: { bpp: 16, bw: 8, bh: 6, name: 'ASTC 8x6' },
  0x34: { bpp: 16, bw: 8, bh: 8, name: 'ASTC 8x8' },
};

export const formatName = (format: number) => FORMATS[format >> 8]?.name ?? `0x${format.toString(16)}`;
export const isAstc = (format: number) => (format >> 8) >= 0x2d && (format >> 8) <= 0x3a;

/** Tegra X1 block-linear to linear. Works in "blocks" (4×4 for BC, pixels otherwise). */
export function deswizzle(src: Uint8Array, wBlocks: number, hBlocks: number, bpp: number, blockHeightLog2: number): Uint8Array {
  const out = new Uint8Array(wBlocks * hBlocks * bpp);
  const blockHeight = 1 << blockHeightLog2;
  const gobsX = Math.ceil((wBlocks * bpp) / 64);
  for (let y = 0; y < hBlocks; y++) {
    for (let x = 0; x < wBlocks; x++) {
      const xb = x * bpp;
      const gob =
        Math.floor(y / (8 * blockHeight)) * 512 * blockHeight * gobsX +
        Math.floor(xb / 64) * 512 * blockHeight +
        Math.floor((y % (8 * blockHeight)) / 8) * 512;
      const addr = gob + Math.floor((xb % 64) / 32) * 256 + Math.floor((y % 8) / 2) * 64 + Math.floor((xb % 32) / 16) * 32 + (y % 2) * 16 + (xb % 16);
      const dst = (y * wBlocks + x) * bpp;
      for (let i = 0; i < bpp; i++) out[dst + i] = src[addr + i] ?? 0;
    }
  }
  return out;
}

/* ---------------------------- block decoders ---------------------------- */

function rgb565(c: number): [number, number, number] {
  return [(((c >> 11) & 31) * 255) / 31, (((c >> 5) & 63) * 255) / 63, ((c & 31) * 255) / 31];
}

/** BC1 color block into rgba (16 texels). `forceOpaque` for the color part of BC2/BC3. */
function bc1Block(b: Uint8Array, o: number, out: Uint8ClampedArray, forceOpaque: boolean) {
  const c0 = b[o] | (b[o + 1] << 8);
  const c1 = b[o + 2] | (b[o + 3] << 8);
  const bits = (b[o + 4] | (b[o + 5] << 8) | (b[o + 6] << 16) | (b[o + 7] << 24)) >>> 0;
  const a = rgb565(c0);
  const d = rgb565(c1);
  const p: number[][] =
    c0 > c1 || forceOpaque
      ? [[...a, 255], [...d, 255], [...a.map((x, i) => (2 * x + d[i]) / 3), 255], [...a.map((x, i) => (x + 2 * d[i]) / 3), 255]]
      : [[...a, 255], [...d, 255], [...a.map((x, i) => (x + d[i]) / 2), 255], [0, 0, 0, 0]];
  for (let i = 0; i < 16; i++) out.set(p[(bits >>> (2 * i)) & 3], i * 4);
}

/** BC4 single-channel block (also BC3 alpha / BC5 channels) into `out[i*stride + ch]`. */
function bc4Block(b: Uint8Array, o: number, out: Uint8ClampedArray, ch: number) {
  const r0 = b[o];
  const r1 = b[o + 1];
  const pal = [r0, r1];
  if (r0 > r1) for (let i = 1; i < 7; i++) pal.push(((7 - i) * r0 + i * r1) / 7);
  else {
    for (let i = 1; i < 5; i++) pal.push(((5 - i) * r0 + i * r1) / 5);
    pal.push(0, 255);
  }
  // 48 bits of 3-bit indices
  let lo = (b[o + 2] | (b[o + 3] << 8) | (b[o + 4] << 16)) >>> 0;
  let hi = (b[o + 5] | (b[o + 6] << 8) | (b[o + 7] << 16)) >>> 0;
  for (let i = 0; i < 16; i++) {
    let idx: number;
    if (i < 8) {
      idx = lo & 7;
      lo >>>= 3;
    } else {
      idx = hi & 7;
      hi >>>= 3;
    }
    out[i * 4 + ch] = pal[idx];
  }
}

/**
 * Decodes a texture's first mip to RGBA8 with the texture's channel mapping applied.
 * Returns null for formats the preview can't decode yet (ASTC).
 */
export function decodeTexture(t: BntxTexture): ImageDataLike | null {
  const fmt = FORMATS[t.format >> 8];
  if (!fmt || isAstc(t.format)) return null;
  const wB = Math.ceil(t.width / fmt.bw);
  const hB = Math.ceil(t.height / fmt.bh);
  const lin = deswizzle(t.data, wB, hB, fmt.bpp, t.blockHeightLog2);
  const raw = new Uint8ClampedArray(t.width * t.height * 4);
  const block = new Uint8ClampedArray(64);

  const put = (bx: number, by: number) => {
    for (let py = 0; py < fmt.bh; py++) {
      const y = by * fmt.bh + py;
      if (y >= t.height) break;
      for (let px = 0; px < fmt.bw; px++) {
        const x = bx * fmt.bw + px;
        if (x >= t.width) break;
        raw.set(block.subarray((py * 4 + px) * 4, (py * 4 + px) * 4 + 4), (y * t.width + x) * 4);
      }
    }
  };

  const kind = t.format >> 8;
  for (let by = 0; by < hB; by++) {
    for (let bx = 0; bx < wB; bx++) {
      const o = (by * wB + bx) * fmt.bpp;
      if (fmt.bw === 1) {
        const p = (by * t.width + bx) * 4;
        if (kind === 0x02) raw.set([lin[o], 0, 0, 255], p);
        else if (kind === 0x09) raw.set([lin[o], lin[o + 1], 0, 255], p);
        else if (kind === 0x07) raw.set([...rgb565(lin[o] | (lin[o + 1] << 8)), 255], p);
        else if (kind === 0x0b) raw.set(lin.subarray(o, o + 4), p);
        else if (kind === 0x0c) raw.set([lin[o + 2], lin[o + 1], lin[o], lin[o + 3]], p);
        continue;
      }
      block.fill(0);
      if (kind === 0x1a) bc1Block(lin, o, block, false);
      else if (kind === 0x1b) {
        bc1Block(lin, o + 8, block, true);
        for (let i = 0; i < 16; i++) block[i * 4 + 3] = ((lin[o + (i >> 1)] >> ((i & 1) * 4)) & 15) * 17;
      } else if (kind === 0x1c) {
        bc1Block(lin, o + 8, block, true);
        bc4Block(lin, o, block, 3);
      } else if (kind === 0x1d) {
        bc4Block(lin, o, block, 0);
        for (let i = 0; i < 16; i++) block[i * 4 + 3] = 255;
      } else if (kind === 0x1e) {
        bc4Block(lin, o, block, 0);
        bc4Block(lin, o + 8, block, 1);
        for (let i = 0; i < 16; i++) block[i * 4 + 3] = 255;
      }
      put(bx, by);
    }
  }

  // Apply the texture's channel mapping (e.g. BC4 masks are stored as R and read as alpha).
  const out = new Uint8ClampedArray(raw.length);
  const src = (sel: number, i: number) => (sel === 0 ? 0 : sel === 1 ? 255 : raw[i + sel - 2]);
  const [cr, cg, cb, ca] = t.channels;
  for (let i = 0; i < raw.length; i += 4) {
    out[i] = src(cr, i);
    out[i + 1] = src(cg, i);
    out[i + 2] = src(cb, i);
    out[i + 3] = src(ca, i);
  }
  return { width: t.width, height: t.height, data: out };
}

export interface ImageDataLike {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
