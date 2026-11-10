import { describe, expect, it } from 'vitest';
import { drawOrderOf, findPanePatch, setDrawOrder, setMaterialColors, setPaneFields, setUsd, toLayoutColor, type LayoutPatch } from '../src/lib/layout/patch';
import { parseLayoutColor } from '../src/lib/layout/textures';

const F = 'blyt/RdtBase.bflyt';

describe('style editing', () => {
  it('writes colours in layout.json order (AABBGGRR)', () => {
    expect(toLayoutColor([255, 0, 0, 255])).toBe('FF0000FF');
    expect(parseLayoutColor(toLayoutColor([10, 20, 30, 40]))).toEqual([10, 20, 30, 40]);
  });

  it('sets and clears raw pane fields, dropping empty patches and files', () => {
    let l: LayoutPatch = {};
    l = setPaneFields(l, F, 'P_Bg', { ColorTL: 'FF0000FF', ColorTR: 'FF0000FF' });
    expect(findPanePatch(l, F, 'P_Bg')).toEqual({ PaneName: 'P_Bg', ColorTL: 'FF0000FF', ColorTR: 'FF0000FF' });
    l = setPaneFields(l, F, 'P_Bg', { ColorTL: undefined, ColorTR: undefined });
    expect(l.Files).toEqual([]);
  });

  it('replaces one user-data property and removes it again', () => {
    let l = setUsd({}, F, 'P_Bg', 'C_W', [42, 0, 0, 0], 1);
    l = setUsd(l, F, 'P_Bg', 'S_RoundRadius', [12], 2);
    l = setUsd(l, F, 'P_Bg', 'C_W', [18, 0, 0, 0], 1);
    expect(findPanePatch(l, F, 'P_Bg')?.UsdPatches).toEqual([
      { PropName: 'S_RoundRadius', PropValues: ['12'], type: 2 },
      { PropName: 'C_W', PropValues: ['18', '0', '0', '0'], type: 1 },
    ]);
    l = setUsd(setUsd(l, F, 'P_Bg', 'C_W', null, 1), F, 'P_Bg', 'S_RoundRadius', null, 1);
    expect(findPanePatch(l, F, 'P_Bg')).toBeUndefined();
  });

  it('edits material colours', () => {
    let l = setMaterialColors({}, F, 'P_Bg', { BackgroundColor: 'FF00FF00' });
    expect(l.Files?.[0].Materials).toEqual([{ MaterialName: 'P_Bg', BackgroundColor: 'FF00FF00' }]);
    l = setMaterialColors(l, F, 'P_Bg', { BackgroundColor: null });
    expect(l.Files).toEqual([]);
  });

  it('maps draw order to the installer names (PushBack = on top)', () => {
    let l = setDrawOrder({}, F, 'N_Icon', 'front');
    expect(l.Files?.[0].PushBackPanes).toEqual(['N_Icon']);
    expect(drawOrderOf(l, F, 'N_Icon')).toBe('front');
    l = setDrawOrder(l, F, 'N_Icon', 'back');
    expect(l.Files?.[0].PullFrontPanes).toEqual(['N_Icon']);
    expect(l.Files?.[0].PushBackPanes).toBeUndefined();
    expect(drawOrderOf(setDrawOrder(l, F, 'N_Icon', null), F, 'N_Icon')).toBeNull();
  });
});
