import { describe, expect, it } from 'vitest';
import { asConsoleStores, ddsFile, decodeDxt, encodeDxt } from '../src/lib/theme/dxt';
import { readDdsInfo } from '../src/lib/theme/images';

// A 16×8 test card; the expected bytes come from stb_dxt.h 1.12 compiled with gcc
// (stb_compress_dxt_block, STB_DXT_DITHER | STB_DXT_HIGHQUAL), as NXThemes Installer runs it.
const W = 16;
const H = 8;
const card = () => {
  const px = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) px.set([(x * 13 + y * 7) % 256, (x * 5 + 40) % 256, (200 - y * 9) % 256, (x * 16 + y * 3) % 256], (y * W + x) * 4);
  return px;
};
const hex = (b: Uint8Array) => Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');

describe('DXT encoder (stb_dxt port)', () => {
  it('produces the same DXT1 blocks as the installer', () => {
    expect(hex(encodeDxt(card(), W, H, false))).toBe(
      'd6395801bdad2f0b756af839b5ad2f0b15a3986ab5bd2f2b96cb389bbd2d2b0ad1515321b5ad2f0b718af351b5ad2f2bf1ba9382bdad2f0b91eb33bbb5ad2f0b',
    );
  });

  it('produces the same DXT5 blocks (with alpha) as the installer', () => {
    expect(hex(encodeDxt(card(), W, H, true))).toBe(
      '3900311553eff00ed6395801bdad2f0b7940311553eff00e756af839b5ad2f0bb980311553eff00e15a3986ab5bd2f2bf9c0311553eff00e96cb389bbd2d2b0a450c311553eff00ed1515321b5ad2f0b854c311553eff00e718af351b5ad2f2bc58c311553eff00ef1ba9382bdad2f0bff0292200112222191eb33bbb5ad2f0b',
    );
  });

  it('round-trips flat colours closely and keeps alpha', () => {
    const px = new Uint8Array(8 * 4 * 4);
    for (let i = 0; i < px.length; i += 4) px.set([200, 30, 90, i < 64 ? 255 : 0], i);
    const out = asConsoleStores(new Uint8ClampedArray(px), 8, 4, true);
    for (let i = 0; i < px.length; i += 4) {
      for (let c = 0; c < 3; c++) expect(Math.abs(out[i + c] - px[i + c])).toBeLessThanOrEqual(4);
      expect(out[i + 3]).toBe(px[i + 3]);
    }
  });

  it('writes the installer’s DDS header', () => {
    const blocks = encodeDxt(card(), W, H, false);
    const dds = ddsFile(blocks, W, H, false);
    expect(readDdsInfo(dds)).toEqual({ width: W, height: H, fourCC: 'DXT1' });
    expect(decodeDxt(dds.subarray(128), W, H, false)).toHaveLength(W * H * 4);
  });
});

describe('gradient detection', () => {
  const make = (fn: (x: number, y: number) => [number, number, number]) => {
    const px = new Uint8ClampedArray(256 * 128 * 4);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) px.set([...fn(x, y), 255], (y * 256 + x) * 4);
    return px;
  };
  it('finds smooth gradients, and not flat colour or busy detail', async () => {
    const { gradientShare } = await import('../src/lib/theme/consoleView');
    expect(gradientShare(make((x, y) => [20 + x / 8, 10 + y / 8, 60 + x / 4]), 256, 128)).toBeGreaterThan(0.8);
    expect(gradientShare(make(() => [40, 40, 90]), 256, 128)).toBe(0);
    expect(gradientShare(make((x, y) => [((x * 37) ^ (y * 91)) & 255, (x * y) & 255, (x * 7) & 255]), 256, 128)).toBeLessThan(0.05);
  });
});
