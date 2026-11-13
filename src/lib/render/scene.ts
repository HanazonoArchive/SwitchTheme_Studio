import type { BflytMaterial, BflytPane, PaneKind } from '../nx/bflyt';
import type { LayoutPatch } from '../layout/patch';
import { applyLayoutToBflyt, applyMaterialPatches, findPanePatch, paneKey, type LayoutFilePatch } from '../layout/patch';
import type { AppletIcon } from '../layout/appletIcons';
import { fileLayers } from '../layout/paneModel';
import { applyRestingState, type InstanceState, type MaterialOverride } from '../layout/animState';
import { resolvePartLayout, type SystemLayout } from '../layout/systemLayouts';
import { flattenExtremeScales, realAnchors } from '../layout/geometry';
import { analyseMasks, type MaskInfo } from '../layout/blend';
import { alphaOnlyTexture, paneVisual, parseLayoutColor, toCss, type PaneVisual } from '../layout/textures';
import { paletteColor } from '../layout/palette';
import type { MockSystemState } from '../../types/simulation';
import { FOCUS_PANES, FOCUSED_PART, HUD_BATTERY, TEXT_MOCK } from './runtimeText';
import * as draw from './mockDraw';
import { mul, type Mat } from './matrix';

/**
 * Builds the screen as a scene: the console's pane trees (with the installer's fixes, the
 * theme's layout.json and the idle animations applied), parts and code-created layouts expanded
 * in place, and the runtime content qlaunch fills in (games, users, clock, strings) mocked.
 *
 * Every node carries its local transform (for drawing) and world matrix (for hit testing,
 * outlines and snapping). Coordinates are screen pixels, Y down; layouts are Y up, so positions
 * flip on the way in. Placement follows nn::ui2d: a child sits at its parent's pivot, offset by
 * its parent anchor (half the parent's size); its own origin decides which point of its rect
 * is on that pivot; transforms are translate, rotate, scale.
 */

export type Content =
  | { type: 'visual'; v: PaneVisual; radius?: number; shadow?: boolean; border?: Border; masks?: { v: PaneVisual | null; x: number; y: number; w: number; h: number }[] }
  | { type: 'image'; url: string; x: number; y: number; w: number; h: number; radius?: number; border?: Border; tint?: string; fit?: 'cover' | 'fill' }
  | { type: 'canvas'; sig: string; x: number; y: number; w: number; h: number; draw: (c: CanvasRenderingContext2D) => void };

/** Outline drawn by qlaunch's shader from the pane's user data (S_Border*), inside the pane. */
export interface Border {
  size: number;
  color: string;
}

export interface SceneNode {
  /** Unique per instance (a layout used 12 times has 12 subtrees). */
  id: string;
  /** Patch target, `file::pane`. Empty for synthetic group nodes. */
  key: string;
  name: string;
  kind: PaneKind | 'group';
  file: string;
  editable: boolean;
  /** Not drawn: hidden on console, zero scale, or not shown in the current state. */
  hidden: boolean;
  /** Pane is hidden by its layout data (shown dimmed in the layers panel). */
  hiddenOnConsole: boolean;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  /** Alpha including all ancestors: ~0 means invisible (not pickable). */
  opacity: number;
  /** Pane rect in node space. */
  rect: { x: number; y: number; w: number; h: number };
  content: Content | null;
  children: SceneNode[];
  /** Extra offset applied to the children (home row scroll). */
  childOffsetX: number;
  /** Vertical scroll of the children (All Software list), in local units. */
  childOffsetY?: number;
  /** Clip to this vertical band (node space): scrolling pages. */
  clip?: { top: number; bottom: number };
  /** Node space -> screen. */
  world: Mat;
  /** Draw with this matrix instead of x/y/rotation/scale (views that rearrange layers). */
  matrix?: Mat;
  /** Parent's child space -> screen (to turn screen drags into position changes). */
  parentWorld: Mat;
  /** Layout position units -> node translation (parts magnify). */
  posScale: { x: number; y: number };
  /** Layout size units -> rect size. */
  sizeScale: { x: number; y: number };
  /** Game shown in this subtree (clicking focuses it in preview). */
  gameIndex: number | null;
}

/**
 * A component instance: a part (prt1), or a slot qlaunch fills with a layout in code (a game
 * icon's N_Icon_00 holds an RdtBtnIconGame, a settings row holds its page). Its own children
 * come from another layout file.
 */
export const isComponent = (n: SceneNode) =>
  n.kind === 'prt1' || (n.kind !== 'group' && n.children.some((c) => (c.kind === 'group' ? c.children : [c]).some((g) => g.name === 'RootPane' && g.file !== n.file)));


export interface Scene {
  width: number;
  height: number;
  root: SceneNode;
  /** Every node in draw order (for hit testing: last = top). */
  flat: SceneNode[];
}

const MAX_PART_DEPTH = 6;
const ICON_LAYOUT = 'blyt/RdtBtnIconGame.bflyt';
const APPS_PER_ROW = 6;
/** All Software: gap between the N_Top spacer and the first row (measured on console). */
const APPS_LIST_TOP = 20;
/** Space kept under the focused row when the list scrolls down to it. */
const APPS_SCROLL_MARGIN = 24;
/** Header and footer lines: the scroll area between them. */
const SCROLL_TOP = 88;
const SCROLL_BOTTOM = 648;
export const CURSOR = '#00c3e3';
/** The game shown as suspended ("Playing"). */
/** The suspended game (the first one), when the console has one. */
const SUSPENDED_GAME = 0;

/**
 * Layouts qlaunch instantiates by code, and where. The first entry whose layout exists in the
 * archive wins (BaseTop is shared by Settings, News and the User Page). `after` draws the layout
 * above the slot's own children; `clip` scissors it to the scroll area.
 */
const INJECT: { file: string; pane: RegExp; layout: string; icon?: boolean; after?: boolean; clip?: boolean }[] = [
  { file: 'blyt/RdtBase.bflyt', pane: /^N_Icon_(\d+)$/, layout: ICON_LAYOUT, icon: true },
  { file: 'blyt/FlcBtnIconGameBlock.bflyt', pane: /^N_BtnIconGame_(\d+)$/, layout: 'blyt/FlcBtnIconGame.bflyt', icon: true },
  { file: 'blyt/BaseTop.bflyt', pane: /^N_NavPos$/, layout: 'blyt/SetBaseNav.bflyt', clip: true },
  { file: 'blyt/BaseTop.bflyt', pane: /^N_CntPosCurrent$/, layout: 'blyt/SetCntFlightMode.bflyt', clip: true },
  { file: 'blyt/BaseTop.bflyt', pane: /^N_HeaderPos$/, layout: 'blyt/SetBaseHeader.bflyt' },
  { file: 'blyt/BaseTop.bflyt', pane: /^N_NavPos$/, layout: 'blyt/MypNav.bflyt', clip: true },
  { file: 'blyt/BaseTop.bflyt', pane: /^N_CntPosCurrent$/, layout: 'blyt/MypMyStatus.bflyt', clip: true },
  { file: 'blyt/BaseTop.bflyt', pane: /^N_HeaderPos$/, layout: 'blyt/MypHeader.bflyt' },
  { file: 'blyt/NtfBase.bflyt', pane: /^N_Root$/, layout: 'blyt/NtfCntList.bflyt', after: true },
];

const HEADER_FILES = new Set(['blyt/TextH1.bflyt', 'blyt/TextH1Ex.bflyt', 'blyt/TextH1Ntf.bflyt']);

/** Controller-button glyph slots: the glyph is drawn with the label (from message files) instead. */
const BUTTON_GLYPH: Record<string, string> = {
  'blyt/EntBtnCenter.bflyt': 'A',
  'blyt/EntBtnCenterNtf.bflyt': 'Y',
};

/** Footer button hints per screen (qlaunch builds them from FooterBtn at runtime). */
const FOOTER_HINTS: Partial<Record<string, [string, string][]>> = {
  home: [['+', 'Options'], ['A', 'Start']],
  apps: [['+', 'Options'], ['B', 'Back'], ['A', 'Start']],
  set: [['B', 'Back'], ['A', 'OK']],
};

/** Panes the installer replaces with the theme background (only when the theme has one). */
const BACKGROUND_PANES = new Set([
  'blyt/BgNml.bflyt::P_Bg_00',
  'blyt/EntMain.bflyt::P_BgL',
  'blyt/EntMain.bflyt::P_BgR',
  'blyt/BaseTop.bflyt::L_AreaNav',
  'blyt/BaseTop.bflyt::L_AreaMain',
]);

/** Panes that only show while something is focused/pressed/animating. */
const STATE_PANE = /(Touch|Decide|Effect|Cursor|Focus|Grow|Glow|Press|Hover|Flash|Blink|Hilight|Highlight|InnerCursor)/;

const INSTANCE_LAYOUTS = new Set([ICON_LAYOUT, 'blyt/FlcBtnIconGame.bflyt']);
/** Title balloons of the game icons: open ('#f') on the focused game, closed elsewhere. */
const BALLOON_LAYOUTS = new Set(['blyt/RdtBalloon.bflyt', 'blyt/FlcBalloon.bflyt']);
/** Panes of a title balloon that qlaunch sizes to the title's width. */
const BALLOON_SIZED = new Set(['N_Size', 'N_Scissor', 'N_Offset', 'P_Reset', 'N_Scroll', 'T_Main', 'W_Fade', 'P_Color', 'P_Line']);
/** Room around the title on a balloon's plate (measured on All Software). */
const BALLOON_PAD = 40;
const INSTANCE_VARIANTS: [string, InstanceState][] = [
  ['#f', { focused: true }],
  ['#r', { running: true }],
  ['#fr', { focused: true, running: true }],
];

/** Clock glyph slots (24 h): tens of hours (hidden under 10), hours, tens of minutes, minutes. */
function clockDigits(time: string): (string | undefined)[] {
  const [h, m] = time.split(':').map((x) => parseInt(x, 10));
  const hh = Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : 12;
  const mm = Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : 0;
  return [hh >= 10 ? String(Math.floor(hh / 10)) : undefined, String(hh % 10), String(Math.floor(mm / 10)), String(mm % 10)];
}
/** Battery glyph slots: hundreds, tens, ones (leading ones hidden). */
function batteryDigits(n: number): (string | undefined)[] {
  return [n >= 100 ? '1' : undefined, n >= 10 ? String(Math.floor(n / 10) % 10) : undefined, String(n % 10)];
}

const partIndex = (part: string | null) => parseInt(/(\d+)$/.exec(part ?? '')?.[1] ?? '0', 10);

function pickBy<T>(items: T[], key: string): T | undefined {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return items.length ? items[h % items.length] : undefined;
}

const PSL_STEP = 164;
const pslSlotX = (i: number, users: number) => i * PSL_STEP - ((users - 1) * PSL_STEP + 120) / 2;

const findChild = (p: BflytPane, name: string): BflytPane | undefined => (p.name === name ? p : p.children.map((c) => findChild(c, name)).find(Boolean));

function withOverride(mat: BflytMaterial, o: MaterialOverride | undefined): BflytMaterial {
  if (!o) return mat;
  const apply = (hex: string, ch?: (number | undefined)[]) => {
    if (!ch) return hex;
    const c = parseLayoutColor(hex).map((v, i) => Math.round(ch[i] ?? v));
    return ((c[0] | (c[1] << 8) | (c[2] << 16) | (c[3] << 24)) >>> 0).toString(16).toUpperCase().padStart(8, '0');
  };
  const t0 = mat.transforms[0];
  const transforms =
    o.srt && t0
      ? [{ ...t0, x: o.srt[0] ?? t0.x, y: o.srt[1] ?? t0.y, rotation: o.srt[2] ?? t0.rotation, scaleX: o.srt[3] ?? t0.scaleX, scaleY: o.srt[4] ?? t0.scaleY }, ...mat.transforms.slice(1)]
      : mat.transforms;
  return { ...mat, black: apply(mat.black, o.black), white: apply(mat.white, o.white), transforms };
}

const anchor = (o: number, size: number) => (o === 1 ? -size / 2 : o === 2 ? size / 2 : 0);
const rectX = (o: number, w: number) => (o === 1 ? 0 : o === 2 ? -w : -w / 2);
const rectY = (o: number, h: number) => (o === 1 ? 0 : o === 2 ? -h : -h / 2);

/* -------------------------------------------------------------------------- */
/* Sources: patched, idle-state pane trees for one archive                     */
/* -------------------------------------------------------------------------- */

export interface Source {
  sys: SystemLayout;
  trees: Map<string, BflytPane | null>;
  mats: Map<string, Map<string, MaterialOverride>>;
  /** Materials per file after the theme's material patches. */
  materials: Map<string, BflytMaterial[]>;
  textures: SystemLayout['textures'];
  layout: LayoutPatch;
  editable: boolean;
  masks: Map<string, MaskInfo>;
  /** The theme's custom applet / lock icons. */
  icons: AppletIcon[];
}

/** Per-file cache so a drag only re-patches the file being edited. */
const fileCache = new WeakMap<
  SystemLayout,
  Map<string, { sig: string; tree: BflytPane | null; mats: Map<string, MaterialOverride>; materials: BflytMaterial[]; masks: MaskInfo | null }>
>();

function patchedFile(sys: SystemLayout, layout: LayoutPatch, name: string, editable: boolean, resting: boolean, variant: InstanceState | null, iconLayers: LayoutFilePatch[] = []) {
  const f = sys.layouts.get(name)!;
  // Custom icons' patches go first: the installer applies them before the theme's layout.
  const ownIcons = iconLayers.filter((l) => l.FileName === name);
  const themeLayers = editable ? fileLayers(layout, sys, name) : layout.Files?.filter((x) => x.FileName === name);
  const layers = ownIcons.length ? [...ownIcons, ...(themeLayers ?? [])] : themeLayers;
  const anims = layout.Anims?.filter((a) => a.FileName.includes(name.replace(/^blyt\//, '').replace(/\.bflyt$/, '')));
  const sig = JSON.stringify([layers, anims, resting, variant, editable, layout.HideOnlineBtn, layout.TargetFirmware]);
  let cache = fileCache.get(sys);
  if (!cache) fileCache.set(sys, (cache = new Map()));
  const ck = name + (variant ? JSON.stringify(variant) : '');
  const hit = cache.get(ck);
  if (hit && hit.sig === sig) return hit;
  const tree = applyLayoutToBflyt(f, layers);
  const materials = applyMaterialPatches(f.materials, layers ?? []);
  const mats = new Map<string, MaterialOverride>();
  if (tree && resting) applyRestingState(tree, sys, layout, name, mats, variant ?? {});
  if (tree) flattenExtremeScales(tree);
  const entry = { sig, tree, mats, materials, masks: tree ? analyseMasks(tree, materials) : null };
  cache.set(ck, entry);
  return entry;
}

/** Home applet icons PatchAppletColorAttrib redirects to their alpha channel (as the installer does). */
const APPLET_ICON_TEXTURES = ['RdtIcoPvr_00^s', 'RdtIcoNews_00^s', 'RdtIcoNews_01^s', 'RdtIcoNews_00_Home^s', 'RdtIcoNews_01_Home^s', 'RdtIcoSet^s', 'RdtIcoShop^s', 'RdtIcoCtrl_00^s', 'RdtIcoCtrl_01^s', 'RdtIcoCtrl_02^s', 'RdtIcoLR_00^s', 'RdtIcoPwrForm^s'];
const appletCache = new WeakMap<SystemLayout, SystemLayout['textures']>();
function appletTextures(sys: SystemLayout, layout: LayoutPatch): SystemLayout['textures'] {
  if (!layout.PatchAppletColorAttrib || !sys.layouts.has('blyt/RdtBase.bflyt')) return sys.textures;
  let t = appletCache.get(sys);
  if (!t) {
    t = new Map(sys.textures);
    for (const n of APPLET_ICON_TEXTURES) {
      const tex = sys.textures.get(n);
      if (tex) t.set(n, alphaOnlyTexture(tex));
    }
    appletCache.set(sys, t);
  }
  return t;
}

/**
 * The HUD is laid out by code from right to left: battery icon, battery percentage (as wide as its
 * digits), a margin, the Wi-Fi icon, a margin, the clock. Each pane's X is its right edge; the
 * layout's own values assume a 52 px wide percentage. The battery gauge fills to the charge level.
 */
function layoutHud(trees: Map<string, BflytPane | null>, layout: LayoutPatch) {
  const hud = trees.get('blyt/Hud.bflyt');
  const num = trees.get('blyt/HudBatteryNum.bflyt');
  if (hud && num) {
    const digits = batteryDigits(HUD_BATTERY);
    let width = 0;
    for (let i = 0; i < 3; i++) {
      const slot = findChild(num, `L_GTNum_0${i}`);
      if (slot && digits[i] !== undefined) width = Math.max(width, -(slot.position.X - (slot.size.X * slot.scale.X) / 2));
    }
    const chain = ['N_BatteryNum', 'N_Margin_00', 'N_Signal', 'N_Margin_01', 'N_Time'].map((n) => findChild(hud, n));
    if (width > 0 && chain.every(Boolean)) {
      let x = chain[0]!.position.X - width;
      for (let i = 1; i < chain.length; i++) {
        const p = chain[i]!;
        // qlaunch lays the row out itself: a theme's X for a pane that stays in the row is
        // overwritten (Project Clean and the injector's Legacy_Diamond set N_Time to X 10 and the
        // clock still sits left of the Wi-Fi icon). A pane the theme lifts out of the row with
        // its own X keeps its position (Purple Skies: X -140, Y 640, clock in its top bar); one
        // lifted with X 0 still gets the row's X (Gengar: X 0, Y 631, clock at the far left of
        // its top edge, above the battery). All three from the packs' console screenshots.
        const moved = findPanePatch(layout, 'blyt/Hud.bflyt', p.name)?.Position;
        if (!moved || (moved.Y ?? 0) === 0 || !moved.X) p.position = { ...p.position, X: x };
        x = p.position.X - p.size.X;
      }
    }
  }
  const bat = trees.get('blyt/BatteryConsole.bflyt');
  const gauge = bat && findChild(bat, 'P_GaugeNml');
  if (gauge && !findPanePatch(layout, 'blyt/BatteryConsole.bflyt', 'P_GaugeNml')?.Size) gauge.size = { ...gauge.size, X: (gauge.size.X * HUD_BATTERY) / 100 };
}

export function buildSource(
  sys: SystemLayout,
  layout: LayoutPatch,
  resting: boolean,
  editable: boolean,
  icons: AppletIcon[] = [],
  opts: { lockCentred?: boolean } = {},
): Source {
  const iconLayers = icons.map((i) => i.slot.patch);
  const trees = new Map<string, BflytPane | null>();
  const masks = new Map<string, MaskInfo>();
  const mats = new Map<string, Map<string, MaterialOverride>>();
  const materials = new Map<string, BflytMaterial[]>();
  for (const name of sys.layouts.keys()) {
    const e = patchedFile(sys, layout, name, editable, resting, name === 'blyt/EntMain.bflyt' && opts.lockCentred ? { lockCentred: true } : null, iconLayers);
    trees.set(name, e.tree);
    mats.set(name, e.mats);
    materials.set(name, e.materials);
    if (e.masks) masks.set(name, e.masks);
    if (resting && BALLOON_LAYOUTS.has(name)) {
      const v = patchedFile(sys, layout, name, editable, resting, { focused: true }, iconLayers);
      trees.set(name + '#f', v.tree);
      mats.set(name + '#f', v.mats);
    }
    if (resting && INSTANCE_LAYOUTS.has(name)) {
      for (const [suffix, state] of INSTANCE_VARIANTS) {
        const v = patchedFile(sys, layout, name, editable, resting, state, iconLayers);
        trees.set(name + suffix, v.tree);
        mats.set(name + suffix, v.mats);
      }
    }
  }
  // The User page navigation is a list stacked by code too: each section starts where the one
  // above it ends (N_Top, then N_Account, N_FrdList...), so a theme's Y for a section is replaced.
  // Lava Lamp moves N_Account to Y -340, and the console still shows "Profile" at the top.
  const nav = trees.get('blyt/MypNav.bflyt');
  const navRoot = nav && findChild(nav, 'N_Root');
  if (navRoot) {
    let y = 0;
    for (const c of navRoot.children) {
      if (c.kind !== 'pan1' || c.name === 'N_Btm' || !c.visible) continue;
      c.position = { ...c.position, Y: y };
      y -= c.size.Y * c.scale.Y;
    }
  }
  // All Software is a list laid out by code: the rows stack below the N_Top spacer, each as tall
  // as its own Size.Y (themes with taller tiles set it), so the layout's row positions are
  // ignored, as on the console. Measured: the first row starts 20 px below N_Top's height
  // (182 px from the top of the screen with the stock 162 px spacer).
  const flc = trees.get('blyt/FlcCntMain.bflyt');
  if (flc) {
    const rows: BflytPane[] = [];
    const walk = (p: BflytPane) => {
      if (/^L_BtnIconGame_\d+$/.test(p.name)) rows.push(p);
      p.children.forEach(walk);
    };
    walk(flc);
    rows.sort((a, b) => a.name.localeCompare(b.name));
    let top = APPS_LIST_TOP + (findChild(flc, 'N_Top')?.size.Y ?? 162);
    for (const r of rows) {
      r.position = { ...r.position, Y: -(top + r.size.Y / 2) };
      top += r.size.Y;
    }
    // Sort label: with no group filter only the sort order shows, at the right edge. It goes with
    // the sort button (themes hide L_BtnSort to remove both).
    const sort = findChild(flc, 'N_Sort');
    if (sort && findChild(flc, 'L_BtnSort')?.visible === false) sort.visible = false;
    if (sort) {
      for (const n of ['T_00', 'N_Padding_00', 'P_Mark', 'N_Padding_01']) {
        const p = findChild(sort, n);
        if (p) p.visible = false;
      }
      const t = findChild(sort, 'T_01');
      if (t && !findPanePatch(layout, 'blyt/FlcCntMain.bflyt', 'T_01')?.Position) t.position = { ...t.position, X: 0 };
    }
  }
  layoutHud(trees, layout);
  return { sys, trees, mats, materials, textures: appletTextures(sys, layout), layout, editable, masks, icons };
}

/* -------------------------------------------------------------------------- */
/* Scene                                                                       */
/* -------------------------------------------------------------------------- */

interface Ctx {
  src: Source;
  file: string;
  depth: number;
  iconIndex: number | null;
  rowIndex: number | null;
  accountIndex: number | null;
  part: string | null;
  magnify: { x: number; y: number };
  variant: string;
  path: string;
  world: Mat;
}

export interface SceneInput {
  system: SystemLayout;
  main: Source;
  common: Source | null;
  hasWallpaper: boolean;
  mock: MockSystemState;
  /** Keep the selected pane in the scene even when hidden (its outline shows). */
  selectedKey: string | null;
}

export function buildScene({ system, main, common, hasWallpaper, mock, selectedKey }: SceneInput): Scene | null {
  const mainFile = system.layouts.get(system.mainLayout);
  const root = main.trees.get(system.mainLayout);
  if (!mainFile || !root) return null;
  const dark = mock.isDarkTheme;
  const ink = toCss(paletteColor(9, dark)!);
  const selectedGame = mock.selectedGameIndex;
  const runningGame = mock.gameSuspended === false ? -1 : SUSPENDED_GAME;
  const target = system.target;
  // Focus cursor colour from Cursor3's P_Main (its palette colour, or the material's white colour
  // when a theme sets C_W to 0, e.g. the white cursors of Zhi's themes).
  const cursor = (() => {
    for (const src of [main, common]) {
      const tree = src?.trees.get('blyt/Cursor3.bflyt');
      const p = tree && findChild(tree, 'P_Main');
      if (!src || !p) continue;
      const cw = p.userData?.C_W?.[0];
      if (cw) return paletteColor(cw, dark) ? toCss(paletteColor(cw, dark)!) : CURSOR;
      const mat = src.materials.get('blyt/Cursor3.bflyt')?.[p.materialIndex ?? -1];
      return mat ? toCss(parseLayoutColor(mat.white)) : CURSOR;
    }
    return CURSOR;
  })();
  const flat: SceneNode[] = [];

  // Home row scrolling: keep the cursor inside the visible window like qlaunch does.
  const gameScroll = (() => {
    const t = main.trees.get('blyt/RdtBase.bflyt');
    if (!t) return 0;
    const i0 = findChild(t, 'N_Icon_00');
    const i1 = findChild(t, 'N_Icon_01');
    const win = findChild(t, 'N_ScrollWindow');
    if (!i0 || !i1 || !win) return 0;
    const step = i1.position.X - i0.position.X;
    if (step <= 0) return 0;
    const visible = Math.max(1, Math.floor(win.size.X / step));
    return Math.max(0, Math.min(selectedGame, Math.min(12, mock.games.length) - 1) - (visible - 1)) * step;
  })();

  /** All Software: scroll the list so the focused game's row is inside the visible area. */
  const appsScroll = (cnt: BflytPane, world: Mat) => {
    const row = findChild(cnt, `L_BtnIconGame_${String(Math.floor(selectedGame / APPS_PER_ROW)).padStart(2, '0')}`);
    if (!row || !world[3]) return 0;
    const bottom = world[5] + (-row.position.Y + row.size.Y / 2) * world[3];
    return bottom > SCROLL_BOTTOM ? (bottom - SCROLL_BOTTOM + APPS_SCROLL_MARGIN) / world[3] : 0;
  };

  const textColor = (pane: BflytPane) => {
    // A colour set by the theme wins over the system palette.
    if (pane.fontColorPatched && pane.fontColor) return toCss(parseLayoutColor(pane.fontColor));
    const c = pane.userData?.C_W?.[0] ? paletteColor(pane.userData.C_W[0], dark) : undefined;
    if (c) return toCss(c);
    // No palette colour: white or coloured text keeps its own colour (e.g. titles on a dark scrim);
    // neutral dark text follows the theme's ink.
    const own = pane.fontColor ? parseLayoutColor(pane.fontColor) : null;
    if (own && (Math.min(own[0], own[1], own[2]) > 230 || Math.max(own[0], own[1], own[2]) - Math.min(own[0], own[1], own[2]) > 40)) return toCss(own);
    return ink;
  };
  const borderOf = (pane: BflytPane): Border | undefined => {
    const u = pane.userData;
    if (!u || u.S_BorderDrawMode?.[0] !== 1) return undefined;
    const size = u.S_BorderSize?.[0] ?? 0;
    const volume = u.S_BorderVolume?.[0] ?? 0;
    if (size <= 0 || volume <= 0) return undefined;
    // Colour select 0 = the custom S_BorderColor0 (floats); otherwise a system palette index.
    const sel = u.S_BorderColorSelect0?.[0] ?? 0;
    const pal = sel ? paletteColor(sel, dark) : undefined;
    const f = u.S_BorderColor0 ?? [1, 1, 1, 1];
    const c = pal ?? ([f[0] * 255, f[1] * 255, f[2] * 255, (f[3] ?? 1) * 255] as const);
    return { size, color: toCss([c[0], c[1], c[2], c[3] * Math.min(1, volume)]) };
  };
  const avatar = (pane: BflytPane, url: string, w: number, h: number, round: boolean): Extract<Content, { type: 'image' }> => ({
    type: 'image',
    url,
    x: 0,
    y: 0,
    w,
    h,
    radius: round ? Math.min(w, h) / 2 : (pane.userData?.S_RoundRadius?.[0] ?? 0) || undefined,
    border: borderOf(pane),
  });
  /** An open title balloon is as wide as the focused game's title (plus room on its plate). */
  const balloonWidth = (pane: BflytPane, ctx: Ctx): number | undefined => {
    if (!BALLOON_LAYOUTS.has(ctx.file) || ctx.variant !== '#f' || !BALLOON_SIZED.has(pane.name)) return undefined;
    const title = mock.games[selectedGame]?.title;
    const t = ctx.src.trees.get(ctx.file + ctx.variant);
    const tm = t && findChild(t, 'T_Main');
    if (!title || !tm) return undefined;
    const tw = Math.ceil(draw.measure(title, balloonFont(tm))) + 4;
    return pane.name === 'P_Line' ? tw + BALLOON_PAD : tw;
  };
  /** Balloon titles: the glyph width (fontSize.X) sets the size; matches console screenshots. */
  const balloonFont = (pane: BflytPane) => (pane.fontSize?.X ?? 24) * 0.9;
  const fontSize = (pane: BflytPane, fallback: number) => (pane.fontSize?.Y ?? fallback) * 0.85;

  const dynamicText = (ctx: Ctx, name: string): string | undefined => {
    if ((ctx.file === 'blyt/NtfBtnSquareList.bflyt' || ctx.file === 'blyt/EntBtnNtf.bflyt') && name === 'T_Title') return pickBy(mock.games, ctx.path)?.title;
    if (ctx.file === 'blyt/MypBtnGame.bflyt' && name === 'T_Game_00') return mock.games[partIndex(ctx.part) % Math.max(1, mock.games.length)]?.title;
    if (ctx.file === 'blyt/PslBtnCardPlayer.bflyt' && name === 'T_PlayerName') return mock.users[partIndex(ctx.part)]?.name;
    if (target === 'user' && ctx.file === 'blyt/TextH1.bflyt' && name === 'T_00') return mock.users[0]?.name;
    if (ctx.file === 'blyt/MypBtnEditName.bflyt' && name === 'T_Name') return mock.users[0]?.name;
    if (ctx.file === 'blyt/MypBtnPresence.bflyt' && name === 'T_Game_00') return mock.games[selectedGame]?.title;
    if (BALLOON_LAYOUTS.has(ctx.file) && ctx.variant === '#f') return name === 'T_Main' ? mock.games[selectedGame]?.title : name === 'T_Sub' ? '' : undefined;
    return undefined;
  };
  const textFor = (ctx: Ctx, name: string): string | undefined =>
    (ctx.part ? (TEXT_MOCK[`${ctx.part}>${ctx.file}::${name}`] ?? TEXT_MOCK[`${target}:${ctx.part}>${ctx.file}::${name}`]) : undefined) ??
    TEXT_MOCK[`${target}:${ctx.file}::${name}`] ??
    TEXT_MOCK[`${ctx.file}::${name}`];

  /** HUD digits: the clock and battery are rows of one-digit glyph parts (L_GTNum_xx) that qlaunch shows or hides. */
  const hudDigit = (ctx: Ctx, pane: BflytPane): string | null | undefined => {
    const m = pane.kind === 'prt1' ? /^L_GTNum_(\d\d)$/.exec(pane.name) : null;
    if (!m) return undefined;
    const slot = parseInt(m[1], 10);
    if (ctx.file === 'blyt/HudTime.bflyt') return clockDigits(mock.time)[slot] ?? null;
    if (ctx.file === 'blyt/HudBatteryNum.bflyt') return batteryDigits(HUD_BATTERY)[slot] ?? null;
    return undefined;
  };

  const image = (url: string, w: number, h: number, radius?: number): Content => ({ type: 'image', url, x: 0, y: 0, w, h, radius });
  const canvasContent = (sig: string, x: number, y: number, w: number, h: number, fn: (c: CanvasRenderingContext2D) => void): Content => ({ type: 'canvas', sig, x, y, w, h, draw: fn });

  /** What a pane draws (in rect space: 0,0 = rect top-left). */
  const contentFor = (pane: BflytPane, ctx: Ctx, w: number, h: number): Content | null => {
    const radius = pane.userData?.S_RoundRadius?.[0];
    const rr = radius !== undefined && radius > 0 && radius < 2000 ? radius : undefined;
    const game = (i: number | null | undefined) => (i !== null && i !== undefined ? mock.games[i] : undefined);

    if (pane.kind === 'pic1' || pane.kind === 'wnd1') {
      // A custom icon from the theme replaces the texture (UVs reset to the whole picture).
      const icon = ctx.src.icons.find((i) => i.slot.file === ctx.file && i.slot.pane === pane.name);
      if (icon) {
        const c = icon.slot.mono ? toCss(paletteColor(pane.userData?.C_W?.[0], dark) ?? paletteColor(100, dark)!) : undefined;
        return { type: 'image', url: icon.url, x: 0, y: 0, w, h, tint: c, fit: 'fill' };
      }
      if ((pane.name === 'P_IconGame' || pane.name === 'P_Icon') && ctx.iconIndex !== null) {
        const g = game(ctx.iconIndex);
        if (g) return image(g.coverUrl, w, h, rr);
      }
      // Player select "add user" button: qlaunch sets a plus icon on the icon-only button.
      if (pane.name === 'P_Image' && ctx.file === 'blyt/BtnLineIconOnly.bflyt') {
        // Other icon-only buttons get their icon from code too; without it the dummy texture would show.
        if (ctx.part !== 'L_BtnAdd') return null;
        const col = textColor(pane);
        return canvasContent(`plus${col}`, 0, 0, w, h, (c) => {
          c.strokeStyle = col;
          c.lineWidth = Math.max(2, w / 14);
          c.lineCap = 'round';
          c.beginPath();
          c.arc(w / 2, h / 2, w * 0.36, 0, Math.PI * 2);
          c.moveTo(w / 2, h * 0.32);
          c.lineTo(w / 2, h * 0.68);
          c.moveTo(w * 0.32, h / 2);
          c.lineTo(w * 0.68, h / 2);
          c.stroke();
        });
      }
      if (pane.name === 'P_Pict' && ctx.file === 'blyt/RdtBtnChangeUser.bflyt') {
        return canvasContent('changeuser', w / 2 - 14, h / 2 - 14, 160, 28, (c) => draw.glyphLabel(c, 0, 14, 'Y', 'Change User', 18, 20, CURSOR, '#fff', CURSOR));
      }
      if (pane.name === 'P_Pict' && BUTTON_GLYPH[ctx.file]) return null;
      // "Playing" badge: the users playing the suspended game (User_00 shows the first slot).
      const playing = /^P_Account_0(\d)$/.exec(pane.name);
      if (playing && (ctx.file === ICON_LAYOUT || ctx.file === 'blyt/FlcBtnIconGame.bflyt' || ctx.file === 'blyt/EntBtnResumeGame.bflyt')) {
        const u = mock.users[parseInt(playing[1], 10)];
        if (u) return avatar(pane, u.avatarUrl, w, h, true);
      }
      if (pane.name === 'P_CtrlDummy' && ctx.file === 'blyt/FooterCtrl.bflyt') {
        const col = textColor(pane);
        return canvasContent(`ctrl|${col}|${w}x${h}`, 0, 0, w, h, (c) => draw.handheldIcon(c, w, h, col));
      }
      if (pane.name === 'P_Icon' && (ctx.file === 'blyt/TextH1Ex.bflyt' || ctx.file === 'blyt/TextH1.bflyt')) {
        const u = mock.users[0];
        if (target === 'user' && u) return avatar(pane, u.avatarUrl, w, h, true);
        if (target === 'set') return canvasContent(`gear|${ink}|${w}`, 0, 0, w, h, (c) => draw.gearIcon(c, w, h, ink));
        return null;
      }
      if (pane.name === 'P_Image' && (ctx.file === 'blyt/NtfBtnSquareList.bflyt' || ctx.file === 'blyt/EntBtnNtf.bflyt')) {
        const g = pickBy(mock.games, ctx.path);
        if (g) return image(g.coverUrl, w, h);
      }
      if (pane.name === 'P_Icon' && ctx.file === 'blyt/MypBtnGame.bflyt') {
        const g = mock.games[partIndex(ctx.part) % Math.max(1, mock.games.length)];
        if (g) return image(g.coverUrl, w, h);
      }
      if (pane.name === 'P_Icon' && ctx.file === 'blyt/MypBtnPresence.bflyt') {
        const g = game(selectedGame);
        if (g) return image(g.coverUrl, w, h);
      }
      if (pane.name === 'P_Image' && ctx.file === 'blyt/MypBtnUserIcon.bflyt' && mock.users[0]) {
        return avatar(pane, mock.users[0].avatarUrl, w, h, false);
      }
      if (pane.name === 'P_PlayerImage' && ctx.file === 'blyt/PslBtnCardPlayer.bflyt') {
        const u = mock.users[partIndex(ctx.part)];
        if (u) return avatar(pane, u.avatarUrl, w, h, false);
      }
      if (pane.name === 'P_Image' && ctx.file === 'blyt/EntBtnResumeGame.bflyt') {
        const g = game(selectedGame);
        if (g) return image(g.coverUrl, w, h);
      }
      if (pane.name === 'P_PictBase' && ctx.accountIndex !== null) {
        const u = mock.users[ctx.accountIndex];
        // Account buttons: the picture with qlaunch's white ring.
        if (u) return { ...avatar(pane, u.avatarUrl, w, h, true), border: borderOf(pane) ?? { size: 3, color: 'rgba(255,255,255,1)' } };
      }
      // Clock colon and battery percent sign (font glyph textures on the console).
      if (pane.name === 'P_Colon' && ctx.file === 'blyt/HudTime.bflyt') return canvasContent(`colon|${ink}|${w}x${h}`, 0, 0, w, h, (c) => draw.hudGlyph(c, ':', w, h, ink));
      if (pane.name === 'P_Per' && ctx.file === 'blyt/HudBatteryNum.bflyt') return canvasContent(`per|${ink}|${w}x${h}`, 0, 0, w, h, (c) => draw.hudGlyph(c, '%', w, h, ink));
      if (STATE_PANE.test(pane.name)) return null;
      const mi = ctx.src.masks.get(ctx.file);
      if (mi && (mi.alphaOnly.has(pane.name) || mi.hiddenTargets.has(pane.name))) return null;
      const fileMats = ctx.src.materials.get(ctx.file);
      const mat = fileMats?.[pane.materialIndex ?? -1];
      const v = paneVisual(pane, mat ? withOverride(mat, ctx.src.mats.get(ctx.file + ctx.variant)?.get(mat.name)) : undefined, ctx.src.textures, w, h, dark);
      if (!v || v.unsupported) return null;
      const layers = mi?.masked.get(pane.name)?.map((l) => {
        const lw = l.pane.size.X * l.pane.scale.X;
        const lh = l.pane.size.Y * l.pane.scale.Y;
        const lm = fileMats?.[l.pane.materialIndex ?? -1];
        return { v: lm ? paneVisual(l.pane, lm, ctx.src.textures, lw, lh, dark) : null, x: l.dx, y: l.dy, w: lw, h: lh };
      });
      return { type: 'visual', v, radius: rr, shadow: pane.userData?.S_DropShadowDrawMode?.[0] === 1 && !dark, border: borderOf(pane), masks: layers };
    }

    // Focused screen element (settings entry) or the focused game icon (its FocusKey variant).
    if (pane.name === 'N_BtnFocusKey' && (FOCUSED_PART[target] === ctx.part || ctx.variant.includes('f'))) {
      // The cursor follows the rounded corners of what it frames (a theme rounding the icons).
      const framed = ['P_IconGame', 'P_PictBase'].map((n) => ctx.src.trees.get(ctx.file + ctx.variant) && findChild(ctx.src.trees.get(ctx.file + ctx.variant)!, n)).find(Boolean);
      const r = Math.min(framed?.userData?.S_RoundRadius?.[0] ?? 0, Math.min(w, h) / 2);
      return canvasContent(`cursor|${w}x${h}|${r}|${cursor}`, -14, -14, w + 28, h + 28, (c) => draw.cursor(c, 14, 14, w, h, cursor, r));
    }

    const digit = hudDigit(ctx, pane);
    if (digit) return canvasContent(`digit|${digit}|${ink}|${w}x${h}`, 0, 0, w, h, (c) => draw.hudGlyph(c, digit, w, h, ink));

    // The "All Software" title belongs to L_Header (themes hide it there).
    if (pane.name === 'N_Header' && ctx.file === 'blyt/FlcCntMain.bflyt' && findChild(pane, 'L_Header')?.visible !== false) {
      return canvasContent(`appsheader|${ink}`, -640 + 34, 52 - 24, 300, 48, (c) => draw.gridTitle(c, 'All Software', 28, ink));
    }

    if (pane.name === 'N_BtnCnt' && BUTTON_GLYPH[ctx.file]) {
      const label = findChild(pane, 'T_00');
      const text = TEXT_MOCK[`${ctx.file}::T_00`];
      if (!label || !text) return null;
      const size = fontSize(label, 24) * 0.8;
      const col = textColor(label);
      const gs = size * 1.15;
      const tw = gs + 12 + draw.measure(text, size);
      return canvasContent(`btncnt|${text}|${col}|${size}`, w / 2 - tw / 2, h / 2 - gs / 2 - 4, tw, gs + 8, (c) =>
        draw.glyphLabel(c, 0, gs / 2 + 4, BUTTON_GLYPH[ctx.file], text, size, gs, col, col === ink ? toCss(paletteColor(5, dark)!) : 'rgba(0,0,0,0.75)', col),
      );
    }

    if (pane.name === 'N_BtnWrp' && ctx.file === 'blyt/FooterAll.bflyt') {
      const hints = FOOTER_HINTS[target];
      if (!hints) return null;
      const bg = toCss(paletteColor(5, dark)!);
      const tw = draw.hintsWidth(hints, 24, 26);
      return canvasContent(`hints|${target}|${ink}`, w - tw, h / 2 - 16, tw, 32, (c) => draw.hints(c, hints, 24, 26, ink, bg));
    }

    if (pane.kind === 'txt1') {
      const dyn = dynamicText(ctx, pane.name);
      const text = dyn ?? textFor(ctx, pane.name);
      if (!text || BUTTON_GLYPH[ctx.file]) return null;
      const mi = ctx.src.masks.get(ctx.file);
      const tintFrom = mi?.textTint.get(pane.name);
      if (mi?.alphaOnly.has(pane.name) && !tintFrom) return null;
      let color = textColor(pane);
      if (tintFrom) {
        // The theme's version of the tint pane (its palette colour may be patched).
        const tree = ctx.src.trees.get(ctx.file + ctx.variant) ?? ctx.src.trees.get(ctx.file);
        const tp = tree ? findChild(tree, tintFrom) : undefined;
        const mat = tp && ctx.src.materials.get(ctx.file)?.[tp.materialIndex ?? -1];
        // Palette colours follow the system theme; a plain material colour is used as authored.
        const v = tp && mat ? paneVisual(tp, mat, ctx.src.textures, 1, 1, dark && !!tp.userData?.C_W?.[0]) : null;
        if (v?.color) color = v.color;
      }
      const paragraph = text.length > 60;
      const size = BALLOON_LAYOUTS.has(ctx.file) ? balloonFont(pane) : fontSize(pane, Math.min(h, 24)) * (paragraph ? 0.8 : 1);
      const padLeft = pane.name === 'T_00' && HEADER_FILES.has(ctx.file) && (target === 'set' || target === 'user' || target === 'news') ? 62 : 0;
      const layout = draw.layoutText(text, size, w - padLeft, h, pane.textAlignX ?? 0, pane.textAlignY ?? 0, paragraph, Boolean(dyn));
      return canvasContent(`txt|${text}|${size}|${color}|${w}x${h}|${pane.textAlignX}|${pane.textAlignY}|${paragraph}|${dyn ? 1 : 0}|${padLeft}`, layout.x + padLeft, layout.y, layout.w, layout.h, (c) =>
        draw.textBlock(c, layout, color),
      );
    }
    return null;
  };

  const node = (pane: BflytPane, parentW: number, parentH: number, ctx: Ctx, parentWorld: Mat, idPrefix: string): SceneNode | null => {
    const key = paneKey(ctx.file, pane.name);
    if (hasWallpaper && BACKGROUND_PANES.has(key) && (ctx.file !== 'blyt/BaseTop.bflyt' || target === 'user')) return null;
    const accountMatch = /^L_BtnAccount_(\d+)$/.exec(pane.name);
    const pslMatch = ctx.file === 'blyt/PslSelectSinglePlayer.bflyt' ? /^N_BtnData_(\d+)$/.exec(pane.name) : null;
    // Lock screen: the suspended game's Resume button, or the HOME button when nothing is suspended.
    const lockResume =
      ctx.file === 'blyt/EntMain.bflyt' && (pane.name === 'N_Game' || pane.name === 'N_SystemApplet')
        ? (pane.name === 'N_Game') === (runningGame >= 0) && findPanePatch(ctx.src.layout, ctx.file, pane.name)?.Visible !== false
        : null;
    const runtimeVisible =
      lockResume !== null
        ? lockResume
        : accountMatch !== null
        ? parseInt(accountMatch[1], 10) < mock.users.length && findPanePatch(ctx.src.layout, ctx.file, pane.name)?.Visible !== false
        : pslMatch !== null
          ? parseInt(pslMatch[1], 10) < mock.users.length
          : hudDigit(ctx, pane) !== undefined
            ? hudDigit(ctx, pane) !== null
            : null;
    const pslX = pslMatch
      ? pslSlotX(parseInt(pslMatch[1], 10), mock.users.length)
      : ctx.file === 'blyt/PslSelectSinglePlayer.bflyt' && pane.name === 'N_BtnAdd'
        ? pslSlotX(mock.users.length, mock.users.length) - 30
        : null;
    const posX = pslX ?? pane.position.X;
    const hiddenOnConsole = pane.visible === false;
    const hidden = (runtimeVisible ?? pane.visible) === false || pane.scale.X === 0 || pane.scale.Y === 0;

    const m = ctx.magnify;
    const sizeX = balloonWidth(pane, ctx) ?? pane.size.X;
    const w = pane.partsMagnify === 'ignore' ? sizeX : sizeX * m.x;
    const h = pane.partsMagnify === 'ignore' ? pane.size.Y : pane.size.Y * m.y;
    // An open title balloon is centred on its icon by code (qlaunch scrolls long titles inside it).
    const centred = sizeX !== pane.size.X;
    const a = centred ? { ...realAnchors(pane), originX: 0, parentX: 0 } : realAnchors(pane);
    // IgnorePartsMagnify panes keep their own size and offset; the rest scale with the part.
    const pm = pane.partsMagnify === 'ignore' ? { x: 1, y: 1 } : m;
    const x = anchor(a.parentX, parentW) * m.x + (centred ? 0 : posX) * pm.x;
    const y = anchor(a.parentY, parentH) * m.y - pane.position.Y * pm.y;
    const rotation = -pane.rotation.Z;
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const local: Mat = [cos * pane.scale.X, sin * pane.scale.X, -sin * pane.scale.Y, cos * pane.scale.Y, x, y];
    const world = mul(parentWorld, local);
    const childOffsetX = pane.name === 'N_Game' ? -gameScroll : 0;
    const childOffsetY = ctx.file === 'blyt/FlcCntMain.bflyt' && pane.name === 'N_Cnt' ? -appsScroll(pane, world) : 0;
    const childWorld = childOffsetX || childOffsetY ? mul(world, [1, 0, 0, 1, childOffsetX, childOffsetY]) : world;
    const id = `${idPrefix}/${pane.name}`;

    const injection = INJECT.find((i) => i.file === ctx.file && i.pane.test(pane.name) && ctx.src.trees.get(i.layout));
    const slot = injection?.icon ? parseInt(injection.pane.exec(pane.name)![1], 10) : null;
    const rowMatch = ctx.file === 'blyt/FlcCntMain.bflyt' ? /^L_BtnIconGame_(\d+)$/.exec(pane.name) : null;
    const childCtx: Ctx = {
      ...ctx,
      rowIndex: rowMatch ? parseInt(rowMatch[1], 10) : ctx.rowIndex,
      iconIndex: slot !== null ? (ctx.file === 'blyt/FlcBtnIconGameBlock.bflyt' ? (ctx.rowIndex ?? 0) * APPS_PER_ROW + slot : slot) : ctx.iconIndex,
      accountIndex: accountMatch ? parseInt(accountMatch[1], 10) : ctx.accountIndex,
      world: childWorld,
    };

    const self: SceneNode = {
      id,
      key,
      name: pane.name,
      kind: pane.kind,
      file: ctx.file,
      editable: ctx.src.editable,
      hidden: hidden && key !== selectedKey,
      hiddenOnConsole,
      x,
      y,
      rotation,
      scaleX: pane.scale.X,
      scaleY: pane.scale.Y,
      alpha: FOCUSED_PART[target] === ctx.part && FOCUS_PANES.has(pane.name) ? 1 : pane.alpha / 255,
      opacity: 1,
      rect: { x: rectX(a.originX, w), y: rectY(a.originY, h), w, h },
      content: null,
      children: [],
      childOffsetX,
      childOffsetY,
      world,
      parentWorld,
      posScale: { x: pm.x, y: pm.y },
      sizeScale: pane.partsMagnify === 'ignore' ? { x: 1, y: 1 } : { x: m.x, y: m.y },
      gameIndex: childCtx.iconIndex,
    };
    if (!hidden) self.content = contentFor(pane, ctx, w, h);
    // The All Software list scrolls between the header and footer lines.
    if (ctx.file === 'blyt/FlcCntMain.bflyt' && pane.name === 'N_Cnt' && world[3]) self.clip = { top: (SCROLL_TOP - world[5]) / world[3], bottom: (SCROLL_BOTTOM - world[5]) / world[3] };
    if (hidden && key !== selectedKey) {
      // Keep hidden panes (and their subtree) in the scene for the layers panel, undrawn.
      self.hidden = true;
    }

    const before: SceneNode[] = [];
    const after: SceneNode[] = [];
    if (!hidden && pane.kind === 'prt1' && ctx.depth < MAX_PART_DEPTH && hudDigit(ctx, pane) === undefined) {
      const partFile = resolvePartLayout(ctx.src.sys, pane);
      // The focused game's title balloon is open.
      const partVariant = partFile && BALLOON_LAYOUTS.has(partFile) && ctx.variant.includes('f') && ctx.src.trees.get(partFile + '#f') ? '#f' : '';
      const partRoot = partFile ? ctx.src.trees.get(partFile + partVariant) : null;
      if (partFile && partRoot) {
        const ps = pane.partScale ?? { X: 1, Y: 1 };
        // A part's own RootPane is replaced by the prt1 pane: its visibility and transform (which
        // themes sometimes patch, e.g. hiding HudTime's RootPane) have no effect on the console.
        const root: BflytPane = { ...partRoot, visible: true, alpha: 255, position: { X: 0, Y: 0, Z: 0 }, rotation: { X: 0, Y: 0, Z: 0 }, scale: { X: 1, Y: 1 } };
        const n = node(
          root,
          w / ps.X,
          h / ps.Y,
          { ...childCtx, part: pane.name, path: `${ctx.path}/${pane.name}`, variant: partVariant, magnify: { x: ps.X * m.x, y: ps.Y * m.y }, file: partFile, depth: ctx.depth + 1 },
          childWorld,
          id,
        );
        if (n) before.push(n);
      }
    }

    if (!hidden && injection && ctx.depth < MAX_PART_DEPTH && !(injection.icon && pane.children.some((c) => c.kind === 'prt1'))) {
      const maxIcons = ctx.file === 'blyt/RdtBase.bflyt' ? 12 : Infinity;
      const idx = childCtx.iconIndex;
      const wanted = !injection.icon || idx! < Math.min(maxIcons, mock.games.length);
      const variant = injection.icon && idx !== null ? `${idx === selectedGame ? 'f' : ''}${idx === runningGame ? 'r' : ''}` : '';
      const usedVariant = variant && ctx.src.trees.get(`${injection.layout}#${variant}`) ? `#${variant}` : '';
      const injRoot = wanted ? ctx.src.trees.get(injection.layout + usedVariant) : null;
      if (injRoot) {
        const injCtx: Ctx = { ...childCtx, file: injection.layout, depth: ctx.depth + 1, part: pane.name, path: `${ctx.path}/${pane.name}`, variant: usedVariant };
        let n = node(injRoot, w, h, injCtx, childWorld, id);
        if (n && injection.clip) {
          // Scrolling pages are scissored between the header and footer lines; slots sit at the screen's vertical centre.
          n = group(`${id}#clip`, childWorld, [n], { top: -(360 - SCROLL_TOP), bottom: SCROLL_BOTTOM - 360 });
        }
        if (n) (injection.after ? after : before).push(n);
      }
    }

    const own = !hidden ? pane.children.map((c) => node(c, pane.size.X, pane.size.Y, childCtx, childWorld, id)).filter((n): n is SceneNode => !!n) : [];
    // Hidden panes still list their children (undrawn) so they can be found in the layers panel.
    const hiddenKids = hidden ? pane.children.map((c) => hiddenNode(c, ctx, id, childWorld)) : [];
    self.children = [...before, ...focusLast(own, pane, ctx), ...hiddenKids, ...after];
    return self;
  };

  /**
   * qlaunch draws the focused game above its neighbours (so a theme that enlarges it on focus
   * overlaps the others, not the other way round): the slot holding it goes last in its row,
   * and on All Software its row goes last among the rows.
   */
  const holdsFocus = (n: SceneNode): boolean => n.gameIndex === selectedGame || n.children.some(holdsFocus);
  const focusLast = (kids: SceneNode[], pane: BflytPane, ctx: Ctx): SceneNode[] => {
    const slot = ctx.file === 'blyt/RdtBase.bflyt' ? /^N_Icon_\d+$/ : ctx.file === 'blyt/FlcBtnIconGameBlock.bflyt' ? /^N_BtnIconGame_\d+$/ : ctx.file === 'blyt/FlcCntMain.bflyt' ? /^L_BtnIconGame_\d+$/ : null;
    if (!slot || !pane.children.length) return kids;
    const i = kids.findIndex((k) => slot.test(k.name) && holdsFocus(k));
    return i < 0 || i === kids.length - 1 ? kids : [...kids.slice(0, i), ...kids.slice(i + 1), kids[i]];
  };

  /** A hidden pane's subtree, for the layers panel only. */
  const hiddenNode = (pane: BflytPane, ctx: Ctx, idPrefix: string, parentWorld: Mat): SceneNode => {
    const id = `${idPrefix}/${pane.name}`;
    const n: SceneNode = {
      id,
      key: paneKey(ctx.file, pane.name),
      name: pane.name,
      kind: pane.kind,
      file: ctx.file,
      editable: ctx.src.editable,
      hidden: true,
      hiddenOnConsole: pane.visible === false,
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      opacity: 1,
      rect: { x: 0, y: 0, w: 0, h: 0 },
      content: null,
      children: [],
      childOffsetX: 0,
      world: parentWorld,
      parentWorld,
      posScale: { x: 1, y: 1 },
      sizeScale: { x: 1, y: 1 },
      gameIndex: null,
    };
    n.children = pane.children.map((c) => hiddenNode(c, ctx, id, parentWorld));
    return n;
  };

  const group = (id: string, world: Mat, children: SceneNode[], clip?: SceneNode['clip']): SceneNode => ({
    id,
    key: '',
    name: '',
    kind: 'group',
    file: '',
    editable: false,
    hidden: false,
    hiddenOnConsole: false,
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    alpha: 1,
    opacity: 1,
    rect: { x: 0, y: 0, w: 0, h: 0 },
    content: null,
    children,
    childOffsetX: 0,
    clip,
    world,
    parentWorld: world,
    posScale: { x: 1, y: 1 },
    sizeScale: { x: 1, y: 1 },
    gameIndex: null,
  });

  const centre: Mat = [1, 0, 0, 1, mainFile.width / 2, mainFile.height / 2];
  const base = (src: Source, file: string): Ctx => ({ src, file, depth: 0, iconIndex: null, rowIndex: null, accountIndex: null, part: null, magnify: { x: 1, y: 1 }, variant: '', path: '', world: centre });
  const kids: SceneNode[] = [];
  const mainNode = node(root, mainFile.width, mainFile.height, base(main, system.mainLayout), centre, '');
  if (mainNode) kids.push(mainNode);
  // qlaunch draws the footer through Footer.bflyt, whose L_Footer part is FooterAll.bflyt, so a
  // common.json that hides or moves L_Footer (several Themezer layouts do) shows here too.
  const footerFile = common?.trees.get('blyt/Footer.bflyt') ? 'blyt/Footer.bflyt' : 'blyt/FooterAll.bflyt';
  const footerRoot = common && FOOTER_HINTS[target] ? common.trees.get(footerFile) : null;
  if (footerRoot && common) {
    const f = node(footerRoot, 1280, 720, base(common, footerFile), centre, '/common');
    if (f) kids.push(f);
  }
  const sceneRoot = group('', centre, kids);
  sceneRoot.x = mainFile.width / 2;
  sceneRoot.y = mainFile.height / 2;
  const walk = (n: SceneNode, parentOpacity: number) => {
    n.opacity = parentOpacity * n.alpha;
    flat.push(n);
    n.children.forEach((c) => walk(c, n.opacity));
  };
  walk(sceneRoot, 1);
  return { width: mainFile.width, height: mainFile.height, root: sceneRoot, flat };
}
