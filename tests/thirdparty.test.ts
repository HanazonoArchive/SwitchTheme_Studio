import { describe, expect, it } from 'vitest';
import { analyseMasks } from '../src/lib/layout/blend';
import { APPLET_ICON_SLOTS } from '../src/lib/layout/appletIcons';
import { paneVisual } from '../src/lib/layout/textures';
import type { BflytMaterial, BflytPane } from '../src/lib/nx/bflyt';

const pane = (name: string, kind: BflytPane['kind'], materialIndex?: number, children: BflytPane[] = []): BflytPane =>
  ({
    kind,
    name,
    visible: true,
    alpha: 255,
    position: { X: 0, Y: 0, Z: 0 },
    rotation: { X: 0, Y: 0, Z: 0 },
    scale: { X: 1, Y: 1 },
    size: { X: 100, Y: 40 },
    originX: 0,
    originY: 0,
    parentOriginX: 0,
    parentOriginY: 0,
    materialIndex,
    children,
  }) as unknown as BflytPane;

const mat = (over: Partial<BflytMaterial>): BflytMaterial => ({ name: 'm', black: '00000000', white: 'FFFFFFFF', textures: [], ...over }) as BflytMaterial;

describe('third-party theme fixes', () => {
  it('lets consecutive text alpha writers mask one colour pane together', () => {
    // Title balloon: reset, two text runs write alpha, a colour plate draws through dst alpha.
    const materials = [
      mat({ blend: { op: 1, src: 0, dst: 1 }, blendAlpha: { op: 1, src: 0, dst: 0 } }),
      mat({ blend: { op: 1, src: 0, dst: 1 }, blendAlpha: { op: 1, src: 1, dst: 0 } }),
      mat({ blend: { op: 1, src: 6, dst: 7 } }),
    ] as BflytMaterial[];
    const root = pane('RootPane', 'pan1', undefined, [pane('P_Reset', 'pic1', 0), pane('T_Main', 'txt1', 1), pane('T_Sub', 'txt1', 1), pane('P_Color', 'pic1', 2)]);
    const info = analyseMasks(root, materials);
    expect(info.textTint.get('T_Main')).toBe('P_Color');
    expect(info.textTint.get('T_Sub')).toBe('P_Color');
    expect(info.hiddenTargets.has('P_Color')).toBe(true);
  });

  it('treats scroll fade windows as alpha-only', () => {
    const root = pane('RootPane', 'pan1', undefined, [pane('W_Fade', 'wnd1', 0)]);
    expect(analyseMasks(root, [mat({})]).alphaOnly.has('W_Fade')).toBe(true);
  });

  it('reads palette index 0 as "no palette colour"', () => {
    const p = pane('P_Color', 'pic1', 0);
    (p as { userData?: Record<string, number[]> }).userData = { C_W: [0, 0, 0, 1] };
    const v = paneVisual(p, mat({ white: 'FF20C0FF' }), new Map(), 10, 10, false);
    // The material's own colour, not a palette entry or transparent black.
    expect(v?.color).toBe(paneVisual(pane('P_Plain', 'pic1', 0), mat({ white: 'FF20C0FF' }), new Map(), 10, 10, false)?.color);
    expect(v?.color).toBeDefined();
  });

  it('defines a layout patch for every custom icon on its own pane', () => {
    for (const s of APPLET_ICON_SLOTS) {
      expect(s.patch.FileName).toBe(s.file);
      expect(s.patch.Patches.some((p) => p.PaneName === s.pane && p.Size)).toBe(true);
    }
    expect(APPLET_ICON_SLOTS.filter((s) => !s.mono).map((s) => s.name)).toEqual(['lock']);
  });
});
