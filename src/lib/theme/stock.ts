/** Console background when a theme has no image.jpg (Basic Black / Basic White system themes). */
export const STOCK_BG = { dark: '#2d2d2d', light: '#ebebeb' };

/** layout.json color (AABBGGRR hex, as written by the injector) -> css rgba() */
export function layoutColorToCss(hex?: string) {
  if (!hex) return 'transparent';
  const n = parseInt(hex, 16) >>> 0;
  const a = (n >>> 24) & 255;
  const b = (n >>> 16) & 255;
  const g = (n >>> 8) & 255;
  const r = n & 255;
  return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
}
