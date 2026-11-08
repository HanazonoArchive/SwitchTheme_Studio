import type { LayoutPatch } from '../lib/layout/patch';

/** Theme parts, matching CommonInfo.Parts in SwitchThemesCommon. */
export type ScreenTarget = 'home' | 'lock' | 'apps' | 'set' | 'news' | 'user' | 'psl';

export type WallpaperFormat = 'jpg' | 'dds' | 'png' | 'webp' | 'other';

export interface Wallpaper {
  /** Original bytes as imported (exported untouched when already valid and unadjusted). */
  blob: Blob;
  fileName: string;
  format: WallpaperFormat;
  width: number;
  height: number;
  /** jpg only: progressive JPEGs are rejected by the installer. */
  progressive?: boolean;
  /** dds only: FourCC, only DXT1 is accepted for backgrounds. */
  ddsEncoding?: string;
  /** Something the browser can display (DDS is decoded to PNG for preview). */
  displayUrl: string;
}

export interface ImageAdjustments {
  brightness: number;
  contrast: number;
  dim: number;
}

export interface ThemeScreen {
  id: string;
  target: ScreenTarget;
  name: string;

  /**
   * Layer 1. null means the theme ships no image, so the console keeps its own
   * Basic Black / Basic White background ("layout-only" theme).
   */
  wallpaper: Wallpaper | null;
  adjustments: ImageAdjustments;

  /** Layer 2: layout.json. An empty object means "stock layout". */
  layout: LayoutPatch;
  /** common.json (patches common.szs, home/user/psl only). Kept as-is. */
  common: LayoutPatch | null;
  /** Any other files from the .nxtheme (custom applet icons etc.), passed through on export. */
  extraFiles: { name: string; blob: Blob }[];
  /** Original info.json, kept for fields we don't edit. */
  info: Record<string, unknown>;
}

export interface ThemeProject {
  id: string;
  name: string;
  author: string;
  screens: ThemeScreen[];
  activeScreenId: string;
}

export const NO_ADJUSTMENTS: ImageAdjustments = { brightness: 1, contrast: 1, dim: 0 };

export const hasAdjustments = (a: ImageAdjustments) => a.brightness !== 1 || a.contrast !== 1 || a.dim !== 0;
