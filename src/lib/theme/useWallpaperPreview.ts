import { useEffect, useState } from 'react';
import type { ImageAdjustments, Wallpaper } from '../../types/theme';
import { addGrain, renderWallpaper } from './images';
import { compressCanvas, gradientShare, useConsoleCompression } from './consoleView';

/** `gradient`: share of the image (0–1) that is smooth gradient, before grain. */
export interface BandingReport {
  gradient: number;
}

const cache = new Map<string, { url: string; banding: BandingReport | null }>();
const keyOf = (w: Wallpaper, a: ImageAdjustments, console: boolean) => `${w.displayUrl}|${a.brightness}|${a.contrast}|${a.dim}|${a.grain ?? 0}|${console}`;

/**
 * Returns an object URL of the wallpaper exactly as it will be exported (cropped to 1280×720,
 * adjustments baked in), and with console compression on, as the console stores it after
 * NXThemes Installer converts it to DXT1. Uses the exporter's code path, so the viewport can't
 * drift from image.jpg. A .dds wallpaper is already DXT1, so it is shown as it is.
 */
export function useWallpaperPreview(wallpaper: Wallpaper | null, adjustments: ImageAdjustments): string | null {
  return useWallpaperPreviewInfo(wallpaper, adjustments).url;
}

export function useWallpaperPreviewInfo(wallpaper: Wallpaper | null, adjustments: ImageAdjustments): { url: string | null; banding: BandingReport | null } {
  const compress = useConsoleCompression() && wallpaper?.format !== 'dds';
  const cacheKey = wallpaper ? keyOf(wallpaper, adjustments, compress) : null;
  const [entry, setEntry] = useState(() => (cacheKey ? cache.get(cacheKey) ?? null : null));
  const [entryKey, setEntryKey] = useState(cacheKey);

  useEffect(() => {
    if (!wallpaper || !wallpaper.displayUrl || !cacheKey) return;
    const hit = cache.get(cacheKey);
    if (hit) {
      setEntry(hit);
      setEntryKey(cacheKey);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        // Measure gradients before grain (grain is the remedy, not part of the picture).
        const canvas = await renderWallpaper(wallpaper, { ...adjustments, grain: 0 });
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const banding = { gradient: gradientShare(img.data, canvas.width, canvas.height) };
        if (adjustments.grain) {
          addGrain(img.data, adjustments.grain);
          ctx.putImageData(img, 0, 0);
        }
        if (compress) compressCanvas(canvas);
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
        if (!blob || cancelled) return;
        const e = { url: URL.createObjectURL(blob), banding };
        if (cache.size > 40) {
          const first = cache.keys().next().value!;
          URL.revokeObjectURL(cache.get(first)!.url);
          cache.delete(first);
        }
        cache.set(cacheKey, e);
        setEntry(e);
        setEntryKey(cacheKey);
      } catch (err) {
        console.warn('Wallpaper preview failed', err);
      }
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  if (!wallpaper) return { url: null, banding: null };
  // While a new version renders, keep showing the last one (or the raw image) instead of nothing.
  return { url: entry?.url ?? wallpaper.displayUrl ?? null, banding: entryKey === cacheKey ? entry?.banding ?? null : null };
}
