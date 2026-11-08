import React, { useMemo, useRef } from 'react';
import type { BflytPane } from '../../lib/nx/bflyt';
import type { LayoutPatch } from '../../lib/layout/patch';
import { applyLayoutToBflyt, findFilePatch, findPanePatch, paneKey } from '../../lib/layout/patch';
import { resolvePartLayout, type SystemLayout } from '../../lib/layout/systemLayouts';
import type { MockSystemState } from '../../types/simulation';
import { layoutColorToCss } from '../../lib/theme/stock';

/**
 * Renders the console's real pane tree (from the user's dumped SZS) with the theme's
 * layout.json applied using the injector's rules. Every pane is a DOM node nested like the
 * BFLYT hierarchy, so parent translation/rotation/scale compose exactly as on the console.
 *
 * Coordinate rules (nn::ui2d): Y is up, a child is placed relative to its parent's pivot,
 * offset by ParentOrigin (half the parent's size); the pane's own Origin decides which point
 * of its rectangle sits on that pivot. Transform order is translate, rotate, scale.
 *
 * What it does NOT draw yet: textures and materials (needs BNTX decoding), so picture panes
 * show as outlines with mock content in the slots we recognise.
 */

interface Props {
  system: SystemLayout;
  layout: LayoutPatch;
  mockState: MockSystemState;
  interactive: boolean;
  selectedKey: string | null;
  showAllOutlines: boolean;
  /** Canvas scale, so drag deltas convert to layout units. */
  viewScale: number;
  onSelect: (key: string | null) => void;
  onDragPane: (key: string, dx: number, dy: number, phase: 'start' | 'move' | 'end') => void;
}

const MAX_PART_DEPTH = 6;
const ICON_LAYOUT = 'blyt/RdtBtnIconGame.bflyt';

/** Applet icon panes, from TextureReplacement.ResidentMenu in SwitchThemesCommon. */
const APPLET_ICON_PANES = new Set([
  'blyt/RdtBtnPvr.bflyt::P_Pict_00',
  'blyt/RdtBtnNtf.bflyt::P_PictNtf_00',
  'blyt/RdtBtnShop.bflyt::P_Pict',
  'blyt/RdtBtnCtrl.bflyt::P_Form',
  'blyt/RdtBtnSet.bflyt::P_Pict',
  'blyt/RdtBtnPow.bflyt::P_Pict_00',
  'blyt/RdtBtnLR.bflyt::P_LR_00',
  'blyt/RdtBtnVgc.bflyt::P_Pict_00',
  'blyt/RdtBtnSplay.bflyt::P_Pict_00',
]);
const APPLET_COLORS: Record<string, string> = {
  'blyt/RdtBtnNtf.bflyt': '#e60012',
  'blyt/RdtBtnShop.bflyt': '#ff7d00',
  'blyt/RdtBtnPvr.bflyt': '#00a2e8',
  'blyt/RdtBtnLR.bflyt': '#e60012',
  'blyt/RdtBtnVgc.bflyt': '#8b5cf6',
  'blyt/RdtBtnSplay.bflyt': '#10b981',
};

const anchor = (o: number, size: number) => (o === 1 ? -size / 2 : o === 2 ? size / 2 : 0);
/** Offset of the rect's left/top edge from the pivot, in CSS (Y down) space. */
const rectX = (o: number, w: number) => (o === 1 ? 0 : o === 2 ? -w : -w / 2);
const rectY = (o: number, h: number) => (o === 1 ? 0 : o === 2 ? -h : -h / 2);

interface Ctx {
  file: string;
  depth: number;
  iconIndex: number | null;
  accountIndex: number | null;
  worldScale: { x: number; y: number };
}

export const ExactLayoutRenderer: React.FC<Props> = ({
  system,
  layout,
  mockState,
  interactive,
  selectedKey,
  showAllOutlines,
  viewScale,
  onSelect,
  onDragPane,
}) => {
  // Apply patches per layout file once; parts reuse the patched tree of their file.
  const patchedTrees = useMemo(() => {
    const m = new Map<string, BflytPane | null>();
    for (const [name, f] of system.layouts) m.set(name, applyLayoutToBflyt(f, findFilePatch(layout, name)));
    return m;
  }, [system, layout]);

  const dragRef = useRef<{ key: string; x: number; y: number; sx: number; sy: number } | null>(null);
  const main = system.layouts.get(system.mainLayout);
  const root = patchedTrees.get(system.mainLayout);
  if (!main || !root) return null;

  const isDark = mockState.isDarkTheme;
  const ink = isDark ? '#ffffff' : '#2d2d2d';

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

  /**
   * Mock content for slots qlaunch fills at runtime. Anything else stays invisible (textures
   * aren't decoded yet), so layouts' filler text and hidden popups don't clutter the preview.
   */
  const renderContent = (pane: BflytPane, ctx: Ctx, w: number): React.ReactNode => {
    const fill = (node: React.ReactNode) => node;
    if (pane.kind === 'pic1') {
      if ((pane.name === 'P_IconGame' || pane.name === 'P_Icon' || pane.name === 'P_Image') && ctx.iconIndex !== null) {
        const game = mockState.games[ctx.iconIndex];
        if (game) return fill(<img src={game.coverUrl} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />);
      }
      // Round button plate behind applet / account icons.
      if (pane.name === 'P_PictBase' && /RdtBtn(?!IconGame)/.test(ctx.file)) {
        const user = ctx.accountIndex !== null ? mockState.users[ctx.accountIndex] : null;
        return fill(
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center pointer-events-none"
            style={{
              background: user ? user.avatarBg : isDark ? '#4a4a4a' : '#ffffff',
              boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.2)',
              fontSize: w * 0.5,
            }}
          >
            {user?.avatarIcon}
          </div>,
        );
      }
      // Applet glyph slots (same panes the injector replaces with custom icons).
      if (APPLET_ICON_PANES.has(`${ctx.file}::${pane.name}`)) {
        const color = APPLET_COLORS[ctx.file] ?? ink;
        return fill(<div className="absolute rounded-md pointer-events-none" style={{ inset: '18%', background: color, opacity: 0.9 }} />);
      }
      return null;
    }
    if (pane.kind === 'pan1' && ctx.file === 'blyt/Hud.bflyt' && (pane.name === 'N_Time' || pane.name === 'N_BatteryNum')) {
      const text = pane.name === 'N_Time' ? mockState.time : `${mockState.battery}%`;
      return fill(
        <div
          className="absolute top-1/2 -translate-y-1/2 right-0 whitespace-nowrap pointer-events-none font-semibold"
          style={{ fontSize: pane.name === 'N_Time' ? 26 : 20, color: ink, fontFamily: "'Nunito Sans', 'Poppins', sans-serif" }}
        >
          {text}
        </div>,
      );
    }
    if (pane.kind === 'txt1' && ctx.iconIndex !== null && /^T_(Name|Title)/.test(pane.name)) {
      const game = mockState.games[ctx.iconIndex];
      if (!game) return null;
      return fill(
        <div className="absolute inset-0 flex items-center whitespace-nowrap pointer-events-none" style={{ fontSize: pane.fontSize?.Y ?? 24, color: layoutColorToCss(pane.fontColor) }}>
          {game.title}
        </div>,
      );
    }
    return null;
  };

  const renderPane = (pane: BflytPane, parentW: number, parentH: number, ctx: Ctx): React.ReactNode => {
    const key = paneKey(ctx.file, pane.name);
    // qlaunch shows one account button per user at runtime, unless the theme hides it.
    const accountMatch = /^L_BtnAccount_(\d+)$/.exec(pane.name);
    const runtimeShown =
      accountMatch !== null && parseInt(accountMatch[1], 10) < mockState.users.length && findPanePatch(layout, ctx.file, pane.name)?.Visible !== false;
    const hidden = (!pane.visible && !runtimeShown) || pane.scale.X === 0 || pane.scale.Y === 0;
    // The background layout is replaced by the theme image / console background layer.
    if (pane.kind === 'prt1' && (pane.partName === 'BgNml' || pane.name === 'L_BgNml')) return null;
    // Hidden panes are skipped, except the selected one, which shows as an outline only.
    if (hidden && key !== selectedKey) return null;

    const w = pane.size.X;
    const h = pane.size.Y;
    const isSelected = key === selectedKey;
    const iconMatch = /^N_Icon_(\d+)$/.exec(pane.name);
    const childCtx: Ctx = {
      ...ctx,
      iconIndex: iconMatch ? parseInt(iconMatch[1], 10) : ctx.iconIndex,
      accountIndex: accountMatch ? parseInt(accountMatch[1], 10) : ctx.accountIndex,
      worldScale: { x: ctx.worldScale.x * pane.scale.X, y: ctx.worldScale.y * pane.scale.Y },
    };

    let partChildren: React.ReactNode = null;
    if (!hidden && pane.kind === 'prt1' && ctx.depth < MAX_PART_DEPTH) {
      const partFile = resolvePartLayout(system, pane);
      const partRoot = partFile ? patchedTrees.get(partFile) : null;
      if (partFile && partRoot) {
        const ps = pane.partScale ?? { X: 1, Y: 1 };
        const partCtx: Ctx = {
          file: partFile,
          depth: ctx.depth + 1,
          iconIndex: childCtx.iconIndex,
          accountIndex: childCtx.accountIndex,
          worldScale: { x: childCtx.worldScale.x * ps.X, y: childCtx.worldScale.y * ps.Y },
        };
        partChildren = (
          <div className="absolute left-0 top-0" style={{ transform: `scale(${ps.X}, ${ps.Y})`, transformOrigin: '0 0' }}>
            {renderPane(partRoot, w, h, partCtx)}
          </div>
        );
      }
    }

    // Game icons are created by code inside the N_Icon_xx slots, not stored in RdtBase.
    if (!hidden && iconMatch && !pane.children.some((c) => c.kind === 'prt1') && childCtx.iconIndex! < Math.min(12, mockState.games.length)) {
      const iconRoot = patchedTrees.get(ICON_LAYOUT);
      if (iconRoot && ctx.depth < MAX_PART_DEPTH) {
        partChildren = renderPane(iconRoot, w, h, { ...childCtx, file: ICON_LAYOUT, depth: ctx.depth + 1 });
      }
    }

    const content = hidden ? null : renderContent(pane, ctx, w);
    const drawable = pane.kind !== 'pan1' || content !== null;
    // Only things you can see (or everything, in wireframe mode) take clicks.
    const hittable = interactive && (isSelected || content !== null || (showAllOutlines && drawable));
    const outline = isSelected
      ? '2px solid #10b981'
      : showAllOutlines && drawable
        ? `1px solid ${pane.kind === 'txt1' ? 'rgba(96,165,250,0.6)' : pane.kind === 'prt1' ? 'rgba(244,114,182,0.45)' : 'rgba(251,191,36,0.45)'}`
        : 'none';

    return (
      <div
        key={`${key}-${ctx.depth}`}
        className="absolute"
        style={{
          left: anchor(pane.parentOriginX, parentW),
          top: -anchor(pane.parentOriginY, parentH),
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
          onClick={(e) => e.stopPropagation()}
          className={`absolute ${hittable ? 'cursor-move' : 'pointer-events-none'}`}
          style={{
            left: rectX(pane.originX, w),
            top: rectY(pane.originY, h),
            width: w,
            height: h,
            outline: interactive ? outline : 'none',
            outlineOffset: -1,
            background: isSelected && interactive ? 'rgba(16,185,129,0.12)' : undefined,
            pointerEvents: hittable ? 'auto' : 'none',
          }}
        >
          {content}
          {isSelected && interactive && (
            <span className="absolute -top-5 left-0 font-mono text-[11px] px-1 rounded bg-[#10b981] text-black whitespace-nowrap">
              {pane.name}
            </span>
          )}
        </div>
        {/* Children are positioned relative to the pivot, offset by their ParentOrigin. */}
        <div className="absolute left-0 top-0">
          {partChildren}
          {!hidden && pane.children.map((c) => renderPane(c, w, h, childCtx))}
        </div>
      </div>
    );
  };

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ width: main.width, height: main.height }}>
      <div className="absolute" style={{ left: main.width / 2, top: main.height / 2 }}>
        {renderPane(root, main.width, main.height, { file: system.mainLayout, depth: 0, iconIndex: null, accountIndex: null, worldScale: { x: 1, y: 1 } })}
      </div>
    </div>
  );
};
