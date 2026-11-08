import { flattenExtremeScales, realAnchors } from '../../lib/layout/geometry';
import React, { useMemo, useRef } from 'react';
import type { BflytMaterial, BflytPane } from '../../lib/nx/bflyt';
import type { LayoutPatch } from '../../lib/layout/patch';
import { applyLayoutToBflyt, findPanePatch, paneKey } from '../../lib/layout/patch';
import { fileLayers } from '../../lib/layout/paneModel';
import { applyRestingState, type MaterialOverride } from '../../lib/layout/animState';
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
const INJECT: { file: string; pane: RegExp; layout: string; icon?: boolean }[] = [
  { file: 'blyt/RdtBase.bflyt', pane: /^N_Icon_(\d+)$/, layout: ICON_LAYOUT, icon: true },
  { file: 'blyt/FlcBtnIconGameBlock.bflyt', pane: /^N_BtnIconGame_(\d+)$/, layout: 'blyt/FlcBtnIconGame.bflyt', icon: true },
  { file: 'blyt/BaseTop.bflyt', pane: /^N_NavPos$/, layout: 'blyt/SetBaseNav.bflyt' },
  { file: 'blyt/BaseTop.bflyt', pane: /^N_CntPosCurrent$/, layout: 'blyt/SetCntTheme.bflyt' },
];

/** Strings qlaunch sets at runtime, for text panes whose layout text is a dev placeholder. */
const TEXT_MOCK: Record<string, string> = {
  'blyt/EntBtnLock.bflyt::T_00': 'Press the same button three times.',
  'blyt/EntBtnCenter.bflyt::T_00': 'Continue',
  'blyt/EntBtnCenterNtf.bflyt::T_00': 'Featured News',
  'blyt/FlcCntMain.bflyt::T_01': 'By Most Recently Played',
};

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

/** One .szs worth of patched, idle-state pane trees. */
interface Source {
  sys: SystemLayout;
  trees: Map<string, BflytPane | null>;
  mats: Map<string, Map<string, MaterialOverride>>;
  layout: LayoutPatch;
  /** Panes from this source can be selected and edited (the screen's own layout.json). */
  editable: boolean;
}

function buildSource(sys: SystemLayout, layout: LayoutPatch, restingState: boolean, editable: boolean): Source {
  const trees = new Map<string, BflytPane | null>();
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
  return { sys, trees, mats, layout, editable };
}

interface Ctx {
  src: Source;
  file: string;
  depth: number;
  iconIndex: number | null;
  rowIndex: number | null;
  accountIndex: number | null;
  worldScale: { x: number; y: number };
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

      const file = ctx.src.sys.layouts.get(ctx.file);
      const mat = file?.materials[pane.materialIndex ?? -1];
      const v = paneVisual(pane, mat ? withOverride(mat, ctx.src.mats.get(ctx.file)?.get(mat.name)) : undefined, ctx.src.sys.textures, w, h, isDark);
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
          }}
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
      if (game)
        return (
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none" style={{ fontSize: 24, color: CURSOR, fontFamily: FONT }}>
            {game.title}
          </div>
        );
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
      const text = TEXT_MOCK[`${ctx.file}::${pane.name}`];
      if (!text || BUTTON_GLYPH[ctx.file]) return null;
      return (
        <div
          className="absolute inset-0 flex items-center whitespace-pre overflow-visible pointer-events-none leading-none"
          style={{ ...textStyle(pane, Math.min(h, 24)), justifyContent: pane.textAlignX === 1 ? 'flex-start' : pane.textAlignX === 2 ? 'flex-end' : 'center' }}
        >
          {text}
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
    const accountVisible =
      accountMatch === null ? null : parseInt(accountMatch[1], 10) < mockState.users.length && findPanePatch(ctx.src.layout, ctx.file, pane.name)?.Visible !== false;
    const hidden = (accountVisible ?? pane.visible) === false || pane.scale.X === 0 || pane.scale.Y === 0;
    // Hidden panes are skipped, except the selected one, which shows as an outline only.
    if (hidden && key !== selectedKey) return null;

    const w = pane.size.X;
    const h = pane.size.Y;
    const editable = ctx.src.editable;
    const isSelected = editable && key === selectedKey;
    const injection = INJECT.find((i) => i.file === ctx.file && i.pane.test(pane.name));
    const slot = injection?.icon ? parseInt(injection.pane.exec(pane.name)![1], 10) : null;
    const rowMatch = ctx.file === 'blyt/FlcCntMain.bflyt' ? /^L_BtnIconGame_(\d+)$/.exec(pane.name) : null;
    const childCtx: Ctx = {
      ...ctx,
      rowIndex: rowMatch ? parseInt(rowMatch[1], 10) : ctx.rowIndex,
      iconIndex: slot !== null ? (ctx.file === 'blyt/FlcBtnIconGameBlock.bflyt' ? (ctx.rowIndex ?? 0) * APPS_PER_ROW + slot : slot) : ctx.iconIndex,
      accountIndex: accountMatch ? parseInt(accountMatch[1], 10) : ctx.accountIndex,
      worldScale: { x: ctx.worldScale.x * pane.scale.X, y: ctx.worldScale.y * pane.scale.Y },
    };

    let partChildren: React.ReactNode = null;
    if (!hidden && pane.kind === 'prt1' && ctx.depth < MAX_PART_DEPTH) {
      const partFile = resolvePartLayout(ctx.src.sys, pane);
      const partRoot = partFile ? ctx.src.trees.get(partFile) : null;
      if (partFile && partRoot) {
        const ps = pane.partScale ?? { X: 1, Y: 1 };
        const partCtx: Ctx = {
          ...childCtx,
          file: partFile,
          depth: ctx.depth + 1,
          worldScale: { x: childCtx.worldScale.x * ps.X, y: childCtx.worldScale.y * ps.Y },
        };
        partChildren = (
          <div className="absolute left-0 top-0" style={{ transform: `scale(${ps.X}, ${ps.Y})`, transformOrigin: '0 0' }}>
            {renderPane(partRoot, w, h, partCtx)}
          </div>
        );
      }
    }

    // Layouts the console creates by code (game icons, settings pages) go into their placeholder panes.
    if (!hidden && injection && ctx.depth < MAX_PART_DEPTH && !pane.children.some((c) => c.kind === 'prt1')) {
      const maxIcons = ctx.file === 'blyt/RdtBase.bflyt' ? 12 : Infinity;
      const wanted = !injection.icon || childCtx.iconIndex! < Math.min(maxIcons, mockState.games.length);
      const injRoot = wanted ? ctx.src.trees.get(injection.layout) : null;
      if (injRoot) partChildren = renderPane(injRoot, w, h, { ...childCtx, file: injection.layout, depth: ctx.depth + 1 });
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
          left: anchor(a.parentX, parentW),
          top: -anchor(a.parentY, parentH),
          width: 0,
          height: 0,
          transform: `translate(${pane.position.X}px, ${-pane.position.Y}px) rotate(${-pane.rotation.Z}deg) scale(${pane.scale.X}, ${pane.scale.Y})`,
          transformOrigin: '0 0',
          opacity: pane.alpha / 255,
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
          {partChildren}
          {!hidden && !replacesChildren(pane, ctx) && pane.children.map((c) => renderPane(c, w, h, childCtx))}
        </div>
      </div>
    );
  };

  const baseCtx = (src: Source, file: string): Ctx => ({ src, file, depth: 0, iconIndex: null, rowIndex: null, accountIndex: null, worldScale: { x: 1, y: 1 } });
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
