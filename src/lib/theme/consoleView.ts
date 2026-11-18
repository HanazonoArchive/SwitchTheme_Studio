import { useSyncExternalStore } from 'react';
import { asConsoleStores } from './dxt';

/**
 * "Console compression": the preview shows images the way the console stores them. NXThemes
 * Installer converts image.jpg to DXT1 (and icon PNGs to DXT5) on the console, which loses colour
 * precision; smooth gradients get visible bands. With this on (the default) the preview runs the
 * same encoder (see dxt.ts), so what you see is what the console draws.
 */

const KEY = 'sts.consoleCompression';
const listeners = new Set<() => void>();
let enabled = (() => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
})();

export const consoleCompression = () => enabled;
export function setConsoleCompression(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* private mode: not remembered */
  }
  listeners.forEach((l) => l());
}
export const useConsoleCompression = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => enabled,
  );

/**
 * How much of an image is smooth gradient (0–1), the part DXT1 shows as bands or blotches: 4×4
 * blocks that are nearly flat inside (every channel within 8 levels) but step slightly (0.3–6
 * levels) to their neighbours.
 */
export function gradientShare(px: Uint8ClampedArray, width: number, height: number): number {
  const bw = Math.floor(width / 4);
  const bh = Math.floor(height / 4);
  const mean = new Float32Array(bw * bh * 3);
  const range = new Uint8Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const k = by * bw + bx;
      let lo0 = 255, lo1 = 255, lo2 = 255, hi0 = 0, hi1 = 0, hi2 = 0, s0 = 0, s1 = 0, s2 = 0;
      for (let j = 0; j < 4; j++) {
        let p = ((by * 4 + j) * width + bx * 4) * 4;
        for (let i = 0; i < 4; i++, p += 4) {
          const r = px[p], g = px[p + 1], b = px[p + 2];
          s0 += r; s1 += g; s2 += b;
          if (r < lo0) lo0 = r; if (r > hi0) hi0 = r;
          if (g < lo1) lo1 = g; if (g > hi1) hi1 = g;
          if (b < lo2) lo2 = b; if (b > hi2) hi2 = b;
        }
      }
      mean[k * 3] = s0 / 16;
      mean[k * 3 + 1] = s1 / 16;
      mean[k * 3 + 2] = s2 / 16;
      range[k] = Math.max(hi0 - lo0, hi1 - lo1, hi2 - lo2);
    }
  }
  const step = (a: number, b: number) => Math.max(Math.abs(mean[a * 3] - mean[b * 3]), Math.abs(mean[a * 3 + 1] - mean[b * 3 + 1]), Math.abs(mean[a * 3 + 2] - mean[b * 3 + 2]));
  let n = 0;
  for (let by = 0; by < bh - 1; by++) {
    for (let bx = 0; bx < bw - 1; bx++) {
      const k = by * bw + bx;
      if (range[k] > 8 || range[k + 1] > 8 || range[k + bw] > 8) continue;
      const d = Math.max(step(k, k + 1), step(k, k + bw));
      if (d > 0.3 && d < 6) n++;
    }
  }
  return n / (bw * bh);
}

/** Compresses a canvas in place as the console would (DXT1, or DXT5 with `alpha`). */
export function compressCanvas(canvas: HTMLCanvasElement, alpha = false) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const w = canvas.width - (canvas.width % 4);
  const h = canvas.height - (canvas.height % 4);
  const img = ctx.getImageData(0, 0, w, h);
  img.data.set(asConsoleStores(img.data, w, h, alpha));
  ctx.putImageData(img, 0, 0);
}
