import { flattenExtremeScales, realAnchors } from '../../lib/layout/geometry';
import { FOCUS_PANES, FOCUSED_PART, TEXT_MOCK } from './runtimeText';
import { analyseMasks, type MaskInfo, type MaskLayer } from '../../lib/layout/blend';
import React, { useMemo, useRef } from 'react';
import type { BflytMaterial, BflytPane } from '../../lib/nx/bflyt';
import type { LayoutPatch } from '../../lib/layout/patch';
import { applyLayoutToBflyt, findPanePatch, paneKey } from '../../lib/layout/patch';
import { fileLayers } from '../../lib/layout/paneModel';
import { applyRestingState, type InstanceState, type MaterialOverride } from '../../lib/layout/animState';
import { resolvePartLayout, type SystemLayout } from '../../lib/layout/systemLayouts';
import type { MockSystemState } from '../../types/simulation';
import { paneVisual, parseLayoutColor, toCss } from '../../lib/layout/textures';
import { paletteColor } from '../../lib/layout/palette';

/**
 * Renders the console's real pane tree (from the user's dumped SZS) with the theme's
 * layout.json applied using the injector's rules. Every pane is a DOM node nested like the
 * BFLYT hierarchy, so parent translation/rotation/scale compose exactly as on the console.
 *
 * Coordinate rules (nn::ui2d): Y is up, a child is placed relative to its parent's pivot,
 * offset by ParentOrigin (half the parent's size); the pane's own Origin decides which point
 * of its rectangle sits on that pivot. Transform order is translate, rotate, scale.
 *
 * Pictures are drawn from the console's own textures, materials and system palette.
 * Not simulated yet: ASTC textures, animation playback, parts property overrides.
 */

interface Props {
  system: SystemLayout;
  layout: LayoutPatch;
  /** common.szs from the same console, for the footer (and the theme's common.json). */
  common?: SystemLayout;
  commonLayout?: LayoutPatch | null;
  /** The theme ships an image: the installer replaces the stock background panes with it. */
  hasWallpaper: boolean;
  mockState: MockSystemState;
  interactive: boolean;
  selectedKey: string | null;
  showAllOutlines: boolean;
  /** Canvas scale, so drag deltas convert to layout units. */
  viewScale: number;
  onSelect: (key: string | null) => void;
  onDragPane: (key: string, dx: number, dy: number, phase: 'start' | 'move' | 'end') => void;
  onUpdateMockState: (updates: Partial<MockSystemState>) => void;
  /** Apply the console's idle animations (hides popups etc.). Off shows the raw layout. */
  restingState?: boolean;
}

const MAX_PART_DEPTH = 6;
const ICON_LAYOUT = 'blyt/RdtBtnIconGame.bflyt';
const APPS_PER_ROW = 6;
/** All Software rows are laid out by code; measured on console. */
const APPS_ROW_STEP = 184;

/** Layouts qlaunch instantiates by code inside empty placeholder panes. `icon` slots get a game. */
/**
 * Layouts qlaunch instantiates by code, and where. The first entry whose layout exists in the
 * loaded .szs wins (BaseTop is shared by Settings, News and the User Page). `after` draws the
 * layout above the slot's own children.
 */
const INJECT: { file: string; pane: RegExp; layout: string; icon?: boolean; after?: boolean; clip?: boolean }[] = [
  { file: 'blyt/RdtBase.bflyt', pane: /^N_Icon_(\d+)$/, layout: ICON_LAYOUT, icon: true },
  { file: 'blyt/FlcBtnIconGameBlock.bflyt', pane: /^N_BtnIconGame_(\d+)$/, layout: 'blyt/FlcBtnIconGame.bflyt', icon: true },
  { file: 'blyt/BaseTop.bflyt', pane: /^N_NavPos$/, layout: 'blyt/SetBaseNav.bflyt', clip: true },
  { file: 'blyt/BaseTop.bflyt', pane: /^N_CntPosCurrent$/, layout: 'blyt/SetCntFlightMode.bflyt', clip: true },
  { file: 'blyt/BaseTop.bflyt', pane: /^N_HeaderPos$/, layout: 'blyt/SetBaseHeader.bflyt' },
  // User Page
  { file: 'blyt/BaseTop.bflyt', pane: /^N_NavPos$/, layout: 'blyt/MypNav.bflyt', clip: true },
  { file: 'blyt/BaseTop.bflyt', pane: /^N_CntPosCurrent$/, layout: 'blyt/MypMyStatus.bflyt', clip: true },
  { file: 'blyt/BaseTop.bflyt', pane: /^N_HeaderPos$/, layout: 'blyt/MypHeader.bflyt' },
  // News: the article list over the background, under nothing else.
  { file: 'blyt/NtfBase.bflyt', pane: /^N_Root$/, layout: 'blyt/NtfCntList.bflyt', after: true },
];

/** Header and footer lines: the scroll area between them. */
const SCROLL_TOP = 88;
const SCROLL_BOTTOM = 648;

const HEADER_FILES = new Set(['blyt/TextH1.bflyt', 'blyt/TextH1Ex.bflyt', 'blyt/TextH1Ntf.bflyt']);

/** Trailing number of a part instance name (L_BtnLogList_03 -> 3). */
const partIndex = (part: string | null) => parseInt(/(\d+)$/.exec(part ?? '')?.[1] ?? '0', 10);

/** Stable pick from a list by a string key (each news card gets its own picture). */
function pickBy<T>(items: T[], key: string): T | undefined {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return items.length ? items[h % items.length] : undefined;
}

/** Player Select: x of card slot i in a row centred with the add button. */
const PSL_STEP = 164;
const pslSlotX = (i: number, users: number) => i * PSL_STEP - ((users - 1) * PSL_STEP + 120) / 2;

const GearIcon: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" strokeLinecap="round" />
    <circle cx="12" cy="12" r="6.5" />
  </svg>
);

/**
 * Button layouts whose P_Pict is a slot for a controller-button glyph qlaunch draws from its font
 * at runtime; the texture in the file is a placeholder. The glyph is drawn with the label instead.
 */
const findChild = (p: BflytPane, name: string): BflytPane | undefined =>
  p.name === name ? p : p.children.map((c) => findChild(c, name)).find(Boolean);

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

/**
 * Panes the installer replaces with the theme background (DefaultTemplates.json targetPanels).
 * Only when the theme ships an image; otherwise they are the console's own background.
 */
const BACKGROUND_PANES = new Set([
  'blyt/BgNml.bflyt::P_Bg_00',
  'blyt/EntMain.bflyt::P_BgL',
  'blyt/EntMain.bflyt::P_BgR',
  'blyt/BaseTop.bflyt::L_AreaNav',
  'blyt/BaseTop.bflyt::L_AreaMain',
]);

/**
 * Panes that only show while something is focused/pressed/animating. Their initial state comes
 * from .bflan animations we don't play yet, so they'd otherwise cover buttons with boxes.
 */
const STATE_PANE = /(Touch|Decide|Effect|Cursor|Focus|Grow|Glow|Press|Hover|Flash|Blink|Hilight|Highlight|InnerCursor)/;

/** High-contrast editor outlines: bright colour plus a dark halo so they show on any background. */
const SELECT = '#39ff14';
const KIND_COLOR: Record<string, string> = { pic1: '#ff3df5', txt1: '#2ee6ff', prt1: '#ffd60a', wnd1: '#ff8a00', pan1: '#ffffff', bnd1: '#ffffff' };
const CURSOR = '#00c3e3';
const FONT = "'Nunito Sans', 'Poppins', 'Segoe UI', sans-serif";

/** Material colors changed by an animation (FLMC), as AABBGGRR strings like the layout uses. */
function withOverride(mat: BflytMaterial, o: MaterialOverride | undefined): BflytMaterial {
  if (!o) return mat;
  const apply = (hex: string, ch?: (number | undefined)[]) => {
    if (!ch) return hex;
    const c = parseLayoutColor(hex).map((v, i) => Math.round(ch[i] ?? v));
    return ((c[0] | (c[1] << 8) | (c[2] << 16) | (c[3] << 24)) >>> 0).toString(16).toUpperCase().padStart(8, '0');
  };
  return { ...mat, black: apply(mat.black, o.black), white: apply(mat.white, o.white) };
}

const anchor = (o: number, size: number) => (o === 1 ? -size / 2 : o === 2 ? size / 2 : 0);
/** Offset of the rect's left/top edge from the pivot, in CSS (Y down) space. */
const rectX = (o: number, w: number) => (o === 1 ? 0 : o === 2 ? -w : -w / 2);
const rectY = (o: number, h: number) => (o === 1 ? 0 : o === 2 ? -h : -h / 2);

const INSTANCE_LAYOUTS = new Set(['blyt/RdtBtnIconGame.bflyt', 'blyt/FlcBtnIconGame.bflyt']);
const INSTANCE_VARIANTS: [string, InstanceState][] = [
  ['#f', { focused: true }],
  ['#r', { running: true }],
  ['#fr', { focused: true, running: true }],
];
/** The game shown as suspended ("Playing") in the preview. */
const RUNNING_GAME = 0;

/** One .szs worth of patched, idle-state pane trees. */
interface Source {
  sys: SystemLayout;
  trees: Map<string, BflytPane | null>;
  mats: Map<string, Map<string, MaterialOverride>>;
  layout: LayoutPatch;
  /** Panes from this source can be selected and edited (the screen's own layout.json). */
  editable: boolean;
  /** Framebuffer-alpha masks per layout file. */
  masks: Map<string, MaskInfo>;
}

function buildSource(sys: SystemLayout, layout: LayoutPatch, restingState: boolean, editable: boolean): Source {
  const trees = new Map<string, BflytPane | null>();
  const masks = new Map<string, MaskInfo>();
  const mats = new Map<string, Map<string, MaterialOverride>>();
  for (const [name, f] of sys.layouts) {
    // Same order as the installer: its firmware fixes, the theme, then fixes for known layouts.
    const tree = applyLayoutToBflyt(f, editable ? fileLayers(layout, sys, name) : layout.Files?.filter((x) => x.FileName === name));
    // Then the state qlaunch's own animations leave the screen in when it's idle.
    const fileMats = new Map<string, MaterialOverride>();
    if (tree && restingState) applyRestingState(tree, sys, layout, name, fileMats);
    if (tree) flattenExtremeScales(tree);
    trees.set(name, tree);
    mats.set(name, fileMats);
    if (tree) masks.set(name, analyseMasks(tree, f.materials));
    // Focused / running variants of the game icon layouts.
    if (restingState && INSTANCE_LAYOUTS.has(name)) {
      for (const [suffix, state] of INSTANCE_VARIANTS) {
        const v = applyLayoutToBflyt(f, editable ? fileLayers(layout, sys, name) : layout.Files?.filter((x) => x.FileName === name));
        if (!v) continue;
        const vMats = new Map<string, MaterialOverride>();
        applyRestingState(v, sys, layout, name, vMats, state);
        flattenExtremeScales(v);
        trees.set(name + suffix, v);
        mats.set(name + suffix, vMats);
      }
    }
  }
  // All Software rows are positioned by code: one per 184 px, unless the theme sets them.
  const flc = trees.get('blyt/FlcCntMain.bflyt');
  if (flc) {
    const rows: BflytPane[] = [];
    const walk = (p: BflytPane) => {
      if (/^L_BtnIconGame_\d+$/.test(p.name)) rows.push(p);
      p.children.forEach(walk);
    };
    walk(flc);
    const first = rows.find((r) => r.name === 'L_BtnIconGame_00');
    for (const r of rows) {
      const n = parseInt(r.name.slice(-2), 10);
      if (first && !findPanePatch(layout, 'blyt/FlcCntMain.bflyt', r.name)?.Position) r.position = { ...r.position, Y: first.position.Y - n * APPS_ROW_STEP };
    }
  }
  return { sys, trees, mats, layout, editable, masks };
}

interface Ctx {
  src: Source;
  file: string;
  depth: number;
  iconIndex: number | null;
  rowIndex: number | null;
  accountIndex: number | null;
  worldScale: { x: number; y: number };
  /** Name of the part (or injection slot) pane this layout instance sits in. */
  part: string | null;
  /** Magnify of the (nested) parts this layout instance sits in. */
  magnify: { x: number; y: number };
  /** Instance variant suffix of this layout's tree ('' or '#f', '#r', '#fr'). */
  variant: string;
  /** Chain of part instance names from the screen root, for picking per-instance mock content. */
  path: string;
}

export const ExactLayoutRenderer: React.FC<Props> = ({
  system,
  layout,
  common,
  commonLayout,
  hasWallpaper,
  mockState,
  interactive,
  selectedKey,
  showAllOutlines,
  viewScale,
  onSelect,
  onDragPane,
  onUpdateMockState,
  restingState = true,
}) => {
  const main = useMemo(() => buildSource(system, layout, restingState, true), [system, layout, restingState]);
  const commonSrc = useMemo(() => (common ? buildSource(common, commonLayout ?? {}, restingState, false) : null), [common, commonLayout, restingState]);

  const dragRef = useRef<{ key: string; x: number; y: number; sx: number; sy: number } | null>(null);
  const mainFile = system.layouts.get(system.mainLayout);
  const root = main.trees.get(system.mainLayout);
  if (!mainFile || !root) return null;

  const isDark = mockState.isDarkTheme;
  const ink = toCss(paletteColor(9, isDark)!);
  const selectedGame = mockState.selectedGameIndex;
  const target = system.target;

  const startDrag = (e: React.PointerEvent, key: string, ctx: Ctx) => {
    if (!interactive || e.button !== 0) return;
    e.stopPropagation();
    onSelect(key);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { key, x: e.clientX, y: e.clientY, sx: ctx.worldScale.x, sy: ctx.worldScale.y };
    onDragPane(key, 0, 0, 'start');
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    // Screen px -> parent layout units. Y flips because layouts are Y-up.
    const dx = (e.clientX - d.x) / (viewScale * (d.sx || 1));
    const dy = -(e.clientY - d.y) / (viewScale * (d.sy || 1));
    onDragPane(d.key, dx, dy, 'move');
  };
  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    dragRef.current = null;
    onDragPane(d.key, 0, 0, 'end');
  };

  // Home menu row scrolling: keep the cursor inside the visible window like qlaunch does.
  const gameScroll = (() => {
    const t = main.trees.get('blyt/RdtBase.bflyt');
    if (!t) return 0;
    const find = (p: BflytPane, n: string): BflytPane | undefined => (p.name === n ? p : p.children.map((c) => find(c, n)).find(Boolean));
    const i0 = find(t, 'N_Icon_00');
    const i1 = find(t, 'N_Icon_01');
    const win = find(t, 'N_ScrollWindow');
    if (!i0 || !i1 || !win) return 0;
    const step = i1.position.X - i0.position.X;
    if (step <= 0) return 0;
    const visible = Math.max(1, Math.floor(win.size.X / step));
    return Math.max(0, Math.min(selectedGame, Math.min(12, mockState.games.length) - 1) - (visible - 1)) * step;
  })();

  const textStyle = (pane: BflytPane, fallbackSize: number): React.CSSProperties => {
    const c = paletteColor(pane.userData?.C_W?.[0], isDark);
    return {
      fontSize: (pane.fontSize?.Y ?? fallbackSize) * 0.85,
      color: c ? toCss(c) : ink,
      fontFamily: FONT,
    };
  };

  const glyph = (k: string, size: number, fill: string = ink) => (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold shrink-0"
      style={{ width: size, height: size, background: fill, color: fill === ink ? toCss(paletteColor(5, isDark)!) : 'rgba(0,0,0,0.75)', fontSize: size * 0.62, lineHeight: 1 }}
    >
      {k}
    </span>
  );

  /** CSS mask equivalent of the framebuffer-alpha mask (layers intersect). */
  const maskStyle = (layers: MaskLayer[], ctx: Ctx): React.CSSProperties => {
    const file = ctx.src.sys.layouts.get(ctx.file);
    const imgs: string[] = [];
    const sizes: string[] = [];
    const pos: string[] = [];
    for (const l of layers) {
      const lw = l.pane.size.X * l.pane.scale.X;
      const lh = l.pane.size.Y * l.pane.scale.Y;
      const mat = file?.materials[l.pane.materialIndex ?? -1];
      const v = mat ? paneVisual(l.pane, mat, ctx.src.sys.textures, lw, lh, isDark) : null;
      if (v?.image) {
        imgs.push(`url(${v.image})`);
        sizes.push(v.backgroundSize ?? `${lw}px ${lh}px`);
        const [bx, by] = (v.backgroundPosition ?? '0px 0px').split(' ').map((n) => parseFloat(n));
        pos.push(`${l.dx + bx}px ${l.dy + by}px`);
      } else {
        imgs.push('linear-gradient(#000,#000)');
        sizes.push(`${lw}px ${lh}px`);
        pos.push(`${l.dx}px ${l.dy}px`);
      }
    }
    const composite = imgs.map(() => 'intersect').join(', ');
    return {
      maskImage: imgs.join(', '),
      WebkitMaskImage: imgs.join(', '),
      maskSize: sizes.join(', '),
      WebkitMaskSize: sizes.join(', '),
      maskPosition: pos.join(', '),
      WebkitMaskPosition: pos.join(', '),
      maskRepeat: 'no-repeat',
      WebkitMaskRepeat: 'no-repeat',
      maskComposite: composite,
      WebkitMaskComposite: imgs.map(() => 'source-in').join(', '),
    } as React.CSSProperties;
  };

  /** Strings that come from the mock console state (users, games). */
  const dynamicText = (ctx: Ctx, name: string): string | undefined => {
    if ((ctx.file === 'blyt/NtfBtnSquareList.bflyt' || ctx.file === 'blyt/EntBtnNtf.bflyt') && name === 'T_Title') return pickBy(mockState.games, ctx.path)?.title;
    if (ctx.file === 'blyt/MypBtnGame.bflyt' && name === 'T_Game_00') return mockState.games[partIndex(ctx.part) % Math.max(1, mockState.games.length)]?.title;
    if (ctx.file === 'blyt/PslBtnCardPlayer.bflyt' && name === 'T_PlayerName') return mockState.users[partIndex(ctx.part)]?.name;
    if (target === 'user' && ctx.file === 'blyt/TextH1.bflyt' && name === 'T_00') return mockState.users[0]?.name;
    if (ctx.file === 'blyt/MypBtnEditName.bflyt' && name === 'T_Name') return mockState.users[0]?.name;
    if (ctx.file === 'blyt/MypBtnPresence.bflyt' && name === 'T_Game_00') return mockState.games[selectedGame]?.title;
    return undefined;
  };

  const avatar = (user: { avatarBg: string; avatarIcon: string }, size: number, round = true) => (
    <div
      className={`absolute inset-0 flex items-center justify-center pointer-events-none ${round ? 'rounded-full' : 'rounded-md'}`}
      style={{ background: user.avatarBg, fontSize: size * 0.5 }}
    >
      {user.avatarIcon}
    </div>
  );

  /** Runtime string for a text pane: by part instance first, then by layout file. */
  const textFor = (ctx: Ctx, name: string): string | undefined =>
    (ctx.part ? TEXT_MOCK[`${ctx.part}>${ctx.file}::${name}`] ?? TEXT_MOCK[`${target}:${ctx.part}>${ctx.file}::${name}`] : undefined) ??
    TEXT_MOCK[`${target}:${ctx.file}::${name}`] ??
    TEXT_MOCK[`${ctx.file}::${name}`];

  /** Panes whose mock content stands in for their children (the HUD's digit glyph parts). */
  const replacesChildren = (pane: BflytPane, ctx: Ctx) =>
    ctx.file === 'blyt/Hud.bflyt' && (pane.name === 'N_Time' || pane.name === 'N_BatteryNum');

  /**
   * What a pane draws: mock content for slots qlaunch fills at runtime (game art, users, clock,
   * footer hints), otherwise the console's own texture/material, otherwise nothing.
   */
  const renderContent = (pane: BflytPane, ctx: Ctx, w: number, h: number): React.ReactNode => {
    const radius = pane.userData?.S_RoundRadius?.[0];
    const borderRadius = radius !== undefined && radius > 0 && radius < 2000 ? radius : undefined;

    if (pane.kind === 'pic1' || pane.kind === 'wnd1') {
      // Game artwork + the focus cursor on the selected game.
      if ((pane.name === 'P_IconGame' || pane.name === 'P_Icon') && ctx.iconIndex !== null) {
        const game = mockState.games[ctx.iconIndex];
        if (game)
          return (
            <>
              <img
                src={game.coverUrl}
                alt=""
                draggable={false}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                style={{ borderRadius }}
              />
              {ctx.iconIndex === selectedGame && (
                <div
                  className="absolute pointer-events-none"
                  style={{ inset: -7, borderRadius: (borderRadius ?? 0) + 7, boxShadow: `0 0 0 4px ${CURSOR}, 0 0 14px 2px ${CURSOR}66` }}
                />
              )}
            </>
          );
      }
      // "Change User" under the focused game: the glyph is a runtime button icon, the label a message.
      if (pane.name === 'P_Pict' && ctx.file === 'blyt/RdtBtnChangeUser.bflyt') {
        return (
          <div className="absolute top-1/2 left-1/2 flex items-center gap-1.5 whitespace-nowrap pointer-events-none" style={{ transform: 'translate(-14px, -50%)', color: CURSOR, fontFamily: FONT, fontSize: 18 }}>
            <span className="inline-flex items-center justify-center rounded-full font-bold" style={{ width: 20, height: 20, background: CURSOR, color: '#fff', fontSize: 13 }}>
              Y
            </span>
            Change User
          </div>
        );
      }
      if (pane.name === 'P_Pict' && BUTTON_GLYPH[ctx.file]) return null;
      if (pane.name === 'P_Account_00' && ctx.variant.includes('r') && mockState.users[0]) {
        return <div className="absolute rounded-full overflow-hidden pointer-events-none" style={{ inset: 0, boxShadow: '0 0 0 2px #fff' }}>{avatar(mockState.users[0], w)}</div>;
      }
      // Footer controller: qlaunch draws the connected controller in this placeholder.
      if (pane.name === 'P_CtrlDummy' && ctx.file === 'blyt/FooterCtrl.bflyt') {
        const c = textStyle(pane, 20).color as string;
        return (
          <svg className="absolute inset-0 pointer-events-none" width={w} height={h} viewBox="0 0 80 64" fill="none" stroke={c} strokeWidth="3">
            <rect x="6" y="18" width="68" height="30" rx="8" />
            <rect x="20" y="22" width="40" height="22" rx="1.5" />
            <path d="M20 18v30M60 18v30" />
          </svg>
        );
      }
      // Header icon (gear for Settings, the user's icon on their page).
      if (pane.name === 'P_Icon' && (ctx.file === 'blyt/TextH1Ex.bflyt' || ctx.file === 'blyt/TextH1.bflyt')) {
        const user = mockState.users[0];
        if (target === 'user' && user) return avatar(user, w);
        if (target === 'set') return <GearIcon color={ink} size={Math.min(w, h) * 0.75} />;
        return null;
      }
      // News articles: loaded images (game art stands in).
      if (pane.name === 'P_Image' && (ctx.file === 'blyt/NtfBtnSquareList.bflyt' || ctx.file === 'blyt/EntBtnNtf.bflyt')) {
        const game = pickBy(mockState.games, ctx.path);
        if (game) return <img src={game.coverUrl} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />;
      }
      // User Page: play activity icons and the user's picture.
      if (pane.name === 'P_Icon' && ctx.file === 'blyt/MypBtnGame.bflyt') {
        const game = mockState.games[partIndex(ctx.part) % Math.max(1, mockState.games.length)];
        if (game) return <img src={game.coverUrl} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />;
      }
      if (pane.name === 'P_Icon' && ctx.file === 'blyt/MypBtnPresence.bflyt') {
        const game = mockState.games[selectedGame];
        if (game) return <img src={game.coverUrl} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />;
      }
      if (pane.name === 'P_Image' && ctx.file === 'blyt/MypBtnUserIcon.bflyt' && mockState.users[0]) return avatar(mockState.users[0], w, false);
      if (pane.name === 'P_PlayerImage' && ctx.file === 'blyt/PslBtnCardPlayer.bflyt') {
        const user = mockState.users[partIndex(ctx.part)];
        if (user) return avatar(user, w, false);
      }
      // Lock screen: the suspended game's art (the selected game stands in for it).
      if (pane.name === 'P_Image' && ctx.file === 'blyt/EntBtnResumeGame.bflyt') {
        const game = mockState.games[selectedGame];
        if (game)
          return <img src={game.coverUrl} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />;
      }
      // Account buttons show the user's avatar on their round plate.
      if (pane.name === 'P_PictBase' && ctx.accountIndex !== null) {
        const user = mockState.users[ctx.accountIndex];
        if (user)
          return (
            <div
              className="absolute inset-0 rounded-full flex items-center justify-center pointer-events-none"
              style={{ background: user.avatarBg, fontSize: w * 0.5, boxShadow: '0 0 0 2px rgba(255,255,255,0.9)' }}
            >
              {user.avatarIcon}
            </div>
          );
      }
      if (STATE_PANE.test(pane.name)) return null;
      const mi = ctx.src.masks.get(ctx.file);
      if (mi && (mi.alphaOnly.has(pane.name) || mi.hiddenTargets.has(pane.name))) return null;
      const maskLayers = mi?.masked.get(pane.name);

      const file = ctx.src.sys.layouts.get(ctx.file);
      const mat = file?.materials[pane.materialIndex ?? -1];
      const v = paneVisual(pane, mat ? withOverride(mat, ctx.src.mats.get(ctx.file + ctx.variant)?.get(mat.name)) : undefined, ctx.src.sys.textures, w, h, isDark);
      if (!v) return null;
      if (v.unsupported) {
        return (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ borderRadius, background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}
            title={`${v.unsupported}: ASTC texture, not decoded yet`}
          />
        );
      }
      const shadow = pane.userData?.S_DropShadowDrawMode?.[0] === 1 && !isDark ? '0 1px 4px rgba(0,0,0,0.25)' : undefined;
      return (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius,
            boxShadow: shadow,
            backgroundColor: v.color,
            backgroundImage: v.image ? `url(${v.image})` : undefined,
            backgroundSize: v.backgroundSize,
            backgroundPosition: v.backgroundPosition,
            backgroundRepeat: v.backgroundRepeat,
            transform: v.flipX || v.flipY ? `scale(${v.flipX ? -1 : 1}, ${v.flipY ? -1 : 1})` : undefined,
            ...(maskLayers ? maskStyle(maskLayers, ctx) : null),
          }}
        />
      );
    }

    // Focus cursor: qlaunch draws it as a border shader (S_Border* user data on Cursor3).
    if (pane.name === 'N_BtnFocusKey' && FOCUSED_PART[target] === ctx.part) {
      return (
        <div
          className="absolute pointer-events-none"
          style={{ inset: -5, borderRadius: 6, border: `5px solid ${CURSOR}`, boxShadow: `0 0 10px ${CURSOR}88` }}
        />
      );
    }

    // HUD clock and battery percentage (digits are glyph parts in the real layout).
    if (pane.kind === 'pan1' && ctx.file === 'blyt/Hud.bflyt' && (pane.name === 'N_Time' || pane.name === 'N_BatteryNum')) {
      const text = pane.name === 'N_Time' ? mockState.time : `${mockState.battery}%`;
      return (
        <div
          className="absolute top-1/2 -translate-y-1/2 right-0 whitespace-nowrap pointer-events-none"
          style={{ fontSize: pane.name === 'N_Time' ? 27 : 21, color: ink, fontFamily: FONT, letterSpacing: 0.5 }}
        >
          {text}
        </div>
      );
    }

    // Selected game's title, above the icon like the console's balloon.
    if (pane.name === 'N_Tip' && (ctx.file === ICON_LAYOUT || ctx.file === 'blyt/FlcBtnIconGame.bflyt') && ctx.iconIndex === selectedGame) {
      const game = mockState.games[selectedGame];
      if (game) {
        // All Software draws it on a plate with a tip (FlcBalloon, sized to the text by code).
        const plate = ctx.file === 'blyt/FlcBtnIconGame.bflyt';
        return (
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none"
            style={{
              fontSize: plate ? 22 : 24,
              color: CURSOR,
              fontFamily: FONT,
              ...(plate ? { background: isDark ? 'rgba(70,70,70,0.94)' : 'rgba(255,255,255,0.94)', padding: '3px 12px', marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' } : null),
            }}
          >
            {game.title}
            {plate && (
              <span
                className="absolute left-1/2 -translate-x-1/2"
                style={{ bottom: -9, width: 0, height: 0, borderLeft: '9px solid transparent', borderRight: '9px solid transparent', borderTop: `9px solid ${isDark ? 'rgba(70,70,70,0.94)' : 'rgba(255,255,255,0.94)'}` }}
              />
            )}
          </div>
        );
      }
    }

    // All Software header: qlaunch builds the title into N_Header at runtime.
    if (pane.name === 'N_Header' && ctx.file === 'blyt/FlcCntMain.bflyt') {
      return (
        <div className="absolute flex items-center gap-3 whitespace-nowrap pointer-events-none" style={{ left: -640 + 34, top: 52, transform: 'translateY(-50%)', color: ink, fontFamily: FONT, fontSize: 28 }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={ink} strokeWidth="3">
            <rect x="3" y="3" width="14" height="14" />
            <rect x="23" y="3" width="14" height="14" />
            <rect x="3" y="23" width="14" height="14" />
            <rect x="23" y="23" width="14" height="14" />
          </svg>
          All Software
        </div>
      );
    }

    // Glyph + label buttons: qlaunch lays N_L / N_R out as a centred row at runtime.
    if (pane.name === 'N_BtnCnt' && BUTTON_GLYPH[ctx.file]) {
      const label = findChild(pane, 'T_00');
      const text = TEXT_MOCK[`${ctx.file}::T_00`];
      if (!label || !text) return null;
      const base = textStyle(label, 24);
      // Message-font labels render a bit smaller than the layout's font size.
      const st = { ...base, fontSize: (base.fontSize as number) * 0.8 };
      return (
        <div className="absolute inset-0 flex items-center justify-center gap-3 whitespace-nowrap pointer-events-none leading-none" style={st}>
          {glyph(BUTTON_GLYPH[ctx.file], (st.fontSize as number) * 1.15, st.color as string)}
          {text}
        </div>
      );
    }

    // Footer button hints, right-aligned like qlaunch's FooterBtn row.
    if (pane.name === 'N_BtnWrp' && ctx.file === 'blyt/FooterAll.bflyt') {
      const hints = FOOTER_HINTS[target];
      if (!hints) return null;
      return (
        <div className="absolute top-1/2 right-0 -translate-y-1/2 flex items-center gap-10 whitespace-nowrap pointer-events-none" style={{ color: ink, fontFamily: FONT, fontSize: 24 }}>
          {hints.map(([k, label]) => (
            <span key={k + label} className="flex items-center gap-2">
              {glyph(k, 26)}
              {label}
            </span>
          ))}
        </div>
      );
    }

    if (pane.kind === 'txt1') {
      // Layout text is always a developer placeholder (WWWW…, Japanese debug labels); qlaunch sets
      // the real strings from message files. Show only the ones we know.
      const dyn = dynamicText(ctx, pane.name);
      const text = dyn ?? textFor(ctx, pane.name);
      if (!text || BUTTON_GLYPH[ctx.file]) return null;
      // Paragraphs wrap inside their box; runtime names (game titles) are cut to it.
      const paragraph = text.length > 60;
      const mi = ctx.src.masks.get(ctx.file);
      const tintFrom = mi?.textTint.get(pane.name);
      if (mi?.alphaOnly.has(pane.name) && !tintFrom) return null;
      const style = textStyle(pane, Math.min(h, 24));
      // Header titles move right of the icon qlaunch shows in front of them.
      if (pane.name === 'T_00' && HEADER_FILES.has(ctx.file) && (target === 'set' || target === 'user' || target === 'news')) style.paddingLeft = 62;
      if (tintFrom) {
        // Text drawn into the alpha mask and coloured by a later pane (header titles, balloons).
        const fileData = ctx.src.sys.layouts.get(ctx.file);
        const tp = fileData?.byName.get(tintFrom);
        const mat = tp && fileData?.materials[tp.materialIndex ?? -1];
        const v = tp && mat ? paneVisual(tp, mat, ctx.src.sys.textures, 1, 1, isDark) : null;
        if (v?.color) style.color = v.color;
      }
      return (
        <div
          className={`absolute inset-0 flex items-center pointer-events-none ${paragraph ? 'whitespace-normal leading-snug' : 'whitespace-pre leading-none'} ${dyn ? 'overflow-hidden' : 'overflow-visible'}`}
          style={{
            ...style,
            ...(paragraph ? { fontSize: (style.fontSize as number) * 0.8 } : null),
            justifyContent: pane.textAlignX === 1 ? 'flex-start' : pane.textAlignX === 2 ? 'flex-end' : 'center',
            alignItems: pane.textAlignY === 1 ? 'flex-start' : pane.textAlignY === 2 ? 'flex-end' : 'center',
          }}
        >
          {dyn ? <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">{text}</span> : text}
        </div>
      );
    }
    return null;
  };

  const renderPane = (pane: BflytPane, parentW: number, parentH: number, ctx: Ctx): React.ReactNode => {
    const key = paneKey(ctx.file, pane.name);
    // The installer swaps these for the theme image; without one they're the console's background.
    if (hasWallpaper && BACKGROUND_PANES.has(key) && (ctx.file !== 'blyt/BaseTop.bflyt' || target === 'user')) return null;
    // qlaunch shows exactly one account button per user, unless the theme hides it.
    const accountMatch = /^L_BtnAccount_(\d+)$/.exec(pane.name);
    const pslMatch = ctx.file === 'blyt/PslSelectSinglePlayer.bflyt' ? /^N_BtnData_(\d+)$/.exec(pane.name) : null;
    const accountVisible =
      accountMatch !== null
        ? parseInt(accountMatch[1], 10) < mockState.users.length && findPanePatch(ctx.src.layout, ctx.file, pane.name)?.Visible !== false
        : pslMatch !== null
          ? parseInt(pslMatch[1], 10) < mockState.users.length
          : null;
    // Player Select lays the user cards (and the add button) out in a centred row at runtime.
    const pslX = pslMatch ? pslSlotX(parseInt(pslMatch[1], 10), mockState.users.length) : ctx.file === 'blyt/PslSelectSinglePlayer.bflyt' && pane.name === 'N_BtnAdd' ? pslSlotX(mockState.users.length, mockState.users.length) - 30 : null;
    const posX = pslX ?? pane.position.X;
    // The running game's badge shows its player's icon.
    const runningAvatar = pane.name === 'P_Account_00' && ctx.variant.includes('r');
    const hidden = runningAvatar ? false : (accountVisible ?? pane.visible) === false || pane.scale.X === 0 || pane.scale.Y === 0;
    // Hidden panes are skipped, except the selected one, which shows as an outline only.
    if (hidden && key !== selectedKey) return null;

    // Parts magnify (a resized part): positions and sizes inside the part are magnified, but
    // nothing is distorted, so text keeps its proportions; 'ignore' panes keep their size.
    const m = ctx.magnify;
    const sx = pane.scale.X;
    const sy = pane.scale.Y;
    const w = pane.partsMagnify === 'ignore' ? pane.size.X : pane.size.X * m.x;
    const h = pane.partsMagnify === 'ignore' ? pane.size.Y : pane.size.Y * m.y;
    const editable = ctx.src.editable;
    const isSelected = editable && key === selectedKey;
    const injection = INJECT.find((i) => i.file === ctx.file && i.pane.test(pane.name) && ctx.src.trees.get(i.layout));
    const slot = injection?.icon ? parseInt(injection.pane.exec(pane.name)![1], 10) : null;
    const rowMatch = ctx.file === 'blyt/FlcCntMain.bflyt' ? /^L_BtnIconGame_(\d+)$/.exec(pane.name) : null;
    const childCtx: Ctx = {
      ...ctx,
      rowIndex: rowMatch ? parseInt(rowMatch[1], 10) : ctx.rowIndex,
      iconIndex: slot !== null ? (ctx.file === 'blyt/FlcBtnIconGameBlock.bflyt' ? (ctx.rowIndex ?? 0) * APPS_PER_ROW + slot : slot) : ctx.iconIndex,
      accountIndex: accountMatch ? parseInt(accountMatch[1], 10) : ctx.accountIndex,
      worldScale: { x: ctx.worldScale.x * sx, y: ctx.worldScale.y * sy },
    };

    let partChildren: React.ReactNode = null;
    if (!hidden && pane.kind === 'prt1' && ctx.depth < MAX_PART_DEPTH) {
      const partFile = resolvePartLayout(ctx.src.sys, pane);
      const partRoot = partFile ? ctx.src.trees.get(partFile) : null;
      if (partFile && partRoot) {
        const ps = pane.partScale ?? { X: 1, Y: 1 };
        const partCtx: Ctx = {
          ...childCtx,
          part: pane.name,
          path: `${ctx.path}/${pane.name}`,
          variant: '',
          magnify: { x: ps.X * ctx.magnify.x, y: ps.Y * ctx.magnify.y },
          file: partFile,
          depth: ctx.depth + 1,
          worldScale: { x: childCtx.worldScale.x * ps.X, y: childCtx.worldScale.y * ps.Y },
        };
        partChildren = renderPane(partRoot, w / ps.X, h / ps.Y, partCtx);
      }
    }

    // Layouts the console creates by code (game icons, settings pages) go into their placeholder panes.
    // (Home icon slots that already hold a part, e.g. N_Icon with a theme-added part, keep it.)
    if (!hidden && injection && ctx.depth < MAX_PART_DEPTH && !(injection.icon && pane.children.some((c) => c.kind === 'prt1'))) {
      const maxIcons = ctx.file === 'blyt/RdtBase.bflyt' ? 12 : Infinity;
      const wanted = !injection.icon || childCtx.iconIndex! < Math.min(maxIcons, mockState.games.length);
      const idx = childCtx.iconIndex;
      const variant = injection.icon && idx !== null ? `${idx === selectedGame ? 'f' : ''}${idx === RUNNING_GAME ? 'r' : ''}` : '';
      const injRoot = wanted ? (variant && ctx.src.trees.get(`${injection.layout}#${variant}`)) || ctx.src.trees.get(injection.layout) : null;
      if (injRoot) {
        const usedVariant = variant && ctx.src.trees.get(`${injection.layout}#${variant}`) ? `#${variant}` : '';
        partChildren = renderPane(injRoot, w, h, { ...childCtx, file: injection.layout, depth: ctx.depth + 1, part: pane.name, path: `${ctx.path}/${pane.name}`, variant: usedVariant });
        // Scrolling pages are scissored to the area between the header and footer lines
        // (B_Scissor in the Area parts); the slots sit at the screen's vertical centre.
        if (injection.clip) partChildren = <div className="absolute left-0 top-0" style={{ clipPath: `inset(${-(360 - SCROLL_TOP)}px -4000px ${-(SCROLL_BOTTOM - 360)}px -4000px)` }}>{partChildren}</div>;
      }
    }

    const a = realAnchors(pane);
    const content = hidden ? null : renderContent(pane, ctx, w, h);
    const drawable = pane.kind !== 'pan1' || content !== null;
    // Only things you can see (or everything, in wireframe mode) take clicks.
    const hittable = interactive && editable && (isSelected || content !== null || (showAllOutlines && drawable));
    // Simulator: clicking a game focuses it.
    const gameClick = !interactive && pane.name === 'P_IconGame' && ctx.iconIndex !== null ? ctx.iconIndex : null;
    const outlined = interactive && editable && (isSelected || (showAllOutlines && drawable));
    const color = isSelected ? SELECT : KIND_COLOR[pane.kind];

    return (
      <div
        key={`${key}-${ctx.depth}`}
        className="absolute"
        style={{
          left: anchor(a.parentX, parentW) * m.x,
          top: anchor(a.parentY, parentH) * m.y,
          width: 0,
          height: 0,
          transform: `translate(${posX * m.x}px, ${-pane.position.Y * m.y}px) rotate(${-pane.rotation.Z}deg) scale(${sx}, ${sy})`,
          transformOrigin: '0 0',
          opacity: FOCUSED_PART[target] === ctx.part && FOCUS_PANES.has(pane.name) ? 1 : pane.alpha / 255,
        }}
      >
        <div
          data-pane={key}
          onPointerDown={hittable ? (e) => startDrag(e, key, ctx) : undefined}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onMouseDown={hittable ? (e) => e.stopPropagation() : undefined}
          onClick={(e) => {
            e.stopPropagation();
            if (gameClick !== null) onUpdateMockState({ selectedGameIndex: gameClick });
          }}
          className={`absolute ${hittable ? 'cursor-move' : gameClick !== null ? 'cursor-pointer' : 'pointer-events-none'}`}
          style={{
            left: rectX(a.originX, w),
            top: rectY(a.originY, h),
            width: w,
            height: h,
            outline: outlined ? `${isSelected ? 2 : 1.5}px solid ${color}` : 'none',
            outlineOffset: 0,
            boxShadow: outlined ? `0 0 0 ${isSelected ? 4 : 2.5}px rgba(0,0,0,0.85)` : undefined,
            zIndex: isSelected ? 50 : undefined,
            pointerEvents: hittable || gameClick !== null ? 'auto' : 'none',
          }}
        >
          {content}
          {isSelected && interactive && (
            <span
              className="absolute -top-6 left-0 font-mono text-[12px] font-bold px-1.5 py-0.5 rounded text-black whitespace-nowrap"
              style={{ background: SELECT, boxShadow: '0 0 0 2px rgba(0,0,0,0.85)' }}
            >
              {pane.name}
            </span>
          )}
        </div>
        {/* Children are positioned relative to the pivot, offset by their ParentOrigin. */}
        <div
          className="absolute left-0 top-0"
          style={pane.name === 'N_Game' ? { transform: `translateX(${-gameScroll}px)`, transition: 'transform 180ms ease-out' } : undefined}
        >
          {!injection?.after && partChildren}
          {!hidden && !replacesChildren(pane, ctx) && pane.children.map((c) => renderPane(c, pane.size.X, pane.size.Y, childCtx))}
          {injection?.after && partChildren}
        </div>
      </div>
    );
  };

  const baseCtx = (src: Source, file: string): Ctx => ({ src, file, depth: 0, iconIndex: null, rowIndex: null, accountIndex: null, worldScale: { x: 1, y: 1 }, part: null, path: '', variant: '', magnify: { x: 1, y: 1 } });
  const footerRoot = commonSrc && FOOTER_HINTS[target] ? commonSrc.trees.get('blyt/FooterAll.bflyt') : null;

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ width: mainFile.width, height: mainFile.height }}>
      <div className="absolute" style={{ left: mainFile.width / 2, top: mainFile.height / 2 }}>
        {renderPane(root, mainFile.width, mainFile.height, baseCtx(main, system.mainLayout))}
        {footerRoot && renderPane(footerRoot, 1280, 720, baseCtx(commonSrc!, 'blyt/FooterAll.bflyt'))}
      </div>
    </div>
  );
};
