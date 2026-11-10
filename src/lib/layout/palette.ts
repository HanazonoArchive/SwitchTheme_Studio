import type { Rgba } from './textures';

/**
 * qlaunch doesn't store most UI colours in the layouts. Panes carry user data C_W / C_B (white /
 * black colour) holding an index into a system palette that's resolved per theme at runtime.
 * The palette itself isn't in the .szs files, so these values are calibrated from real console
 * screenshots (Basic White) and Basic Black; the roles come from where each index is used in the
 * 23.0.1 layouts. Unknown indices fall back to the material's own colours.
 */
type Pair = { light: Rgba; dark: Rgba };
const c = (hex: string, a = 255): Rgba => [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), a];
const same = (hex: string, a = 255): Pair => ({ light: c(hex, a), dark: c(hex, a) });

export const PALETTE: Record<number, Pair> = {
  0: same('000000', 0), // transparent black (default C_B)
  1: { light: c('d2d2d2'), dark: c('4b4b4b') }, // lock news tile base
  2: same('000000'), // shadows
  3: same('ffffff'), // indicator on
  4: same('ffffff'), // text on dark pills ("Playing", suspend)
  5: { light: c('ebebeb'), dark: c('2d2d2d') }, // screen background
  6: { light: c('e1e1e1'), dark: c('323232') }, // card back / settings nav
  9: { light: c('2d2d2d'), dark: c('ffffff') }, // primary text, clock digits, footer
  12: { light: c('2d2d2d'), dark: c('ffffff') }, // divider lines
  18: same('00c3e3'), // selected accents
  20: same('ffffff'),
  31: { light: c('ffffff'), dark: c('505050') }, // applet / account plates
  32: same('e60012'), // Switch Online plate
  34: { light: c('5a5a5a'), dark: c('ffffff') }, // neutral applet glyphs (controllers, settings, power)
  36: { light: c('222222'), dark: c('1b1b1b') }, // lock screen left panel
  40: same('00c3e3'),
  41: same('00c3e3', 80),
  42: same('00c3e3'), // "Change User", balloon accent
  43: same('00c3e3'),
  44: { light: c('ffffff'), dark: c('383838') }, // plates
  52: { light: c('ebebeb'), dark: c('2d2d2d') }, // inside the battery outline (screen background)
  58: { light: c('2d2d2d'), dark: c('ffffff') },
  63: same('00c3e3'), // cursor
  65: same('00c3e3'),
  71: { light: c('2d2d2d'), dark: c('ffffff') }, // text
  74: { light: c('8c8c8c'), dark: c('a0a0a0') }, // secondary text
  75: same('ffffff'), // text on lock news tiles
  77: same('00c3e3'),
  83: { light: c('ffffff'), dark: c('464646') }, // dialog buttons
  88: same('e60012'), // News
  90: same('f39800'), // Nintendo eShop
  92: same('1e7ae6'), // Album
  // Custom applet icons (SwitchThemesCommon sets C_W 100): white-ish on Basic Black.
  100: { light: c('3c3c3c'), dark: c('ffffff') },
  101: same('ff6400'),
  110: same('00b26b'), // GameShare
};

export function paletteColor(index: number | undefined, dark: boolean): Rgba | undefined {
  if (index === undefined) return undefined;
  const p = PALETTE[index];
  return p ? (dark ? p.dark : p.light) : undefined;
}
