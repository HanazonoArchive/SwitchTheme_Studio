import { useEffect, useState } from 'react';
import type { ImageAdjustments, Wallpaper } from '../../types/theme';
import { renderWallpaper } from './images';

const cache = new Map<string, string>();
const keyOf = (w: Wallpaper, a: ImageAdjustments) => `${w.displayUrl}|${a.brightness}|${a.contrast}|${a.dim}`;

/**
 * Returns an object URL of the wallpaper exactly as it will be exported (cropped to
 * 1280×720, adjustments baked in). Uses the same code path as the exporter, so what the
 * viewport shows is what ends up in image.jpg.
 */
export function useWallpaperPreview(wallpaper: Wallpaper | null, adjustments: ImageAdjustments) {
  const cacheKey = wallpaper ? keyOf(wallpaper, adjustments) : null;
  const [url, setUrl] = useState<string | null>(() => (cacheKey ? cache.get(cacheKey) ?? null : null));

  useEffect(() => {
    if (!wallpaper || !wallpaper.displayUrl || !cacheKey) {
      setUrl(null);
      return;
    }
    const hit = cache.get(cacheKey);
    if (hit) {
      setUrl(hit);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const canvas = await renderWallpaper(wallpaper, adjustments);
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
        if (!blob || cancelled) return;
        const u = URL.createObjectURL(blob);
        if (cache.size > 40) {
          const first = cache.keys().next().value!;
          URL.revokeObjectURL(cache.get(first)!);
          cache.delete(first);
        }
        cache.set(cacheKey, u);
        setUrl(u);
      } catch (e) {
        console.warn('Wallpaper preview failed', e);
      }
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  // While a new adjustment renders, keep showing the raw image instead of nothing.
  return url ?? wallpaper?.displayUrl ?? null;
}
