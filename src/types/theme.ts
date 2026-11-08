export type ScreenTarget = 'home' | 'lock' | 'apps' | 'user' | 'set' | 'news';

export interface PaneNode {
  id: string;
  name: string;
  type: 'picture' | 'text' | 'group' | 'window' | 'parts';
  x: number;
  y: number;
  z?: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  visible: boolean;
  colorTL?: string;
  colorTR?: string;
  colorBL?: string;
  colorBR?: string;
}

export interface ThemeScreen {
  id: string;
  name: string;
  target: ScreenTarget;
  szsFileName: string;
  bflytName: string;

  // Background layer (Layer 1 in SwitchThemesNX)
  wallpaperUrl: string | null; // null if Layout-Only (uses stock Switch background)
  wallpaperFileName: string;
  previewUrl: string | null;   // Reference screenshot preview if available
  brightness: number;
  contrast: number;
  dimOverlay: number;

  // Layout layer (Layer 2 in SwitchThemesNX)
  layoutPatchName: string;     // e.g. "Vertical-OEM (Home Menu)", "Default by Nintendo", "FairTech Animated"
  layoutAuthor: string;        // e.g. "autoDiff", "Nintendo", "FairTech"
  isCustomLayout: boolean;     // true if layout has patches, false if stock Nintendo
  isVerticalIcons: boolean;    // true if P_IconGame is portrait (256x384)
  hideOnlineBtn: boolean;      // true if HideOnlineBtn is set

  layoutJson: Record<string, any>;
  infoJson?: Record<string, any>;
  panes: PaneNode[];
}

export interface ThemeProject {
  id: string;
  name: string;
  author: string;
  version: string;
  layoutInfo?: string;
  themeType?: 'layout_only' | 'wallpaper_only' | 'full';
  screens: ThemeScreen[];
  activeScreenId: string;
}
