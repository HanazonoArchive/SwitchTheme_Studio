import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { composePreset, mergeLayoutPatch, type LayoutPreset } from '../src/lib/layout/presets';

const preset: LayoutPreset = {
  id: 'p',
  name: 'P',
  description: '',
  author: 'a',
  layout: {
    Files: [
      { FileName: 'blyt/A.bflyt', Patches: [{ PaneName: 'X', Position: { X: 1, Y: 2 }, UsdPatches: [{ PropName: 'S_RoundRadius', PropValues: ['9'], type: 2 }] }] },
      { FileName: 'blyt/Gone.bflyt', Patches: [{ PaneName: 'Y', Visible: false }] },
    ],
    Anims: [{ FileName: 'anim/A_In.bflan', AnimJson: '{}' }],
  },
  options: [
    { name: 'Move', type: 'toggle', priority: 1, global: false, patch: { Files: [{ FileName: 'blyt/A.bflyt', Patches: [{ PaneName: 'X', Position: { X: 5, Y: 6 } }] }] } },
    {
      name: 'Corners',
      type: 'select',
      priority: 2,
      global: true,
      choices: [
        // Themezer's delete marker: "__self": null removes the entry it names.
        { name: 'Square', patch: { Files: [{ FileName: 'blyt/A.bflyt', Patches: [{ PaneName: 'X', UsdPatches: [{ PropName: 'S_RoundRadius', __self: null } as never] }, { PaneName: 'New', UsdPatches: [{ PropName: 'S_RoundRadius', __self: null } as never] }] }, { FileName: 'blyt/Gone.bflyt', __self: null } as never], Anims: [{ FileName: 'anim/A_In.bflan', __self: null } as never] } },
      ],
    },
  ],
};

describe('layout presets', () => {
  it('without options is the layout as designed', () => {
    expect(composePreset(preset, {}).layout).toEqual(preset.layout);
  });

  it('merges a toggle by file and pane name, keeping the other fields', () => {
    const p = composePreset(preset, { Move: true }).layout.Files![0].Patches![0];
    expect(p.Position).toEqual({ X: 5, Y: 6 });
    expect(p.UsdPatches).toHaveLength(1);
  });

  it('applies delete markers and drops the ones with nothing to delete', () => {
    const l = composePreset(preset, { Corners: 'Square' }).layout;
    expect(l.Files!.map((f) => f.FileName)).toEqual(['blyt/A.bflyt']);
    expect(l.Files![0].Patches![0].UsdPatches).toEqual([]);
    expect(l.Files![0].Patches![1]).toEqual({ PaneName: 'New', UsdPatches: [] });
    expect(l.Anims).toEqual([]);
    expect(JSON.stringify(l)).not.toContain('__self');
  });

  it('merging never changes the inputs', () => {
    const before = JSON.stringify(preset);
    mergeLayoutPatch(preset.layout, preset.options[0].patch!);
    composePreset(preset, { Move: true, Corners: 'Square' });
    expect(JSON.stringify(preset)).toBe(before);
  });

  it('ships presets for every screen, each with a layout', () => {
    for (const t of ['home', 'lock', 'apps', 'set', 'news', 'user', 'psl']) {
      const { layouts } = JSON.parse(readFileSync(`public/presets/${t}.json`, 'utf8')) as { layouts: LayoutPreset[] };
      expect(layouts.length).toBeGreaterThan(0);
      for (const p of layouts) expect(p.layout.Files?.length || p.layout.Anims?.length).toBeTruthy();
    }
  });
});
