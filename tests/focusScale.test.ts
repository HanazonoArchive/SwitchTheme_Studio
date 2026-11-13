import { describe, expect, it } from 'vitest';
import { readIconScale, writeIconScale, ICON_FILE } from '../src/lib/layout/focusScale';
import { bflanToJson } from '../src/lib/nx/bflanJson';
import type { LayoutPatch } from '../src/lib/layout/patch';

const anim = (name: string, pane: string, keys: [number, number][]) => ({
  FileName: `anim/RdtBtnIconGame_${name}.bflan`,
  AnimJson: JSON.stringify({
    LittleEndian: true,
    Version: 0x09000000,
    pat1: { AnimationOrder: 12, Name: name, ChildBinding: 0, Groups: ['X_G'], Unk_StartOfFile: 0, Unk_EndOfFile: 0, Unk_EndOfHeader: '' },
    pai1: {
      FrameSize: 12,
      Flags: 0,
      Textures: [],
      Entries: [
        {
          Name: pane,
          Target: 0,
          Tags: [
            {
              Unknown: 0,
              TagType: 'FLPA',
              Entries: [6, 7].map((t) => ({ Index: 0, AnimationTarget: t, DataType: 2, KeyFrames: keys.map(([Frame, Value]) => ({ Frame, Value, Blend: 0 })), FLEUUnknownInt: 0, FLEUEntryName: '' })),
            },
          ],
          UnkwnownData: '',
        },
      ],
    },
  }),
});

describe('game icon size and focus zoom', () => {
  it('is console size with no zoom on a stock layout', () => {
    expect(readIconScale({})).toEqual({ normal: 1, focused: 1, pane: 'N_Root', source: 'stock' });
  });

  it('reads Purple Skies-style animations (N_Root 1 → 1.8 under RootPane 0.5)', () => {
    const layout: LayoutPatch = {
      Files: [{ FileName: ICON_FILE, Patches: [{ PaneName: 'RootPane', Scale: { X: 0.5, Y: 0.5 } }], AddGroups: [{ GroupName: 'X_G', Panes: ['N_Root'] }] }],
      Anims: [anim('Active', 'N_Root', [[0, 1], [12, 1.8]]), anim('Inactive', 'N_Root', [[0, 1], [12, 1]])],
    };
    const s = readIconScale(layout);
    expect(s.normal).toBeCloseTo(0.5);
    expect(s.focused).toBeCloseTo(0.9);
    // Editing keeps the pane and the theme's own group.
    const out = writeIconScale(layout, null, 0.5, 0.625);
    expect(readIconScale(out).focused).toBeCloseTo(0.625);
    expect(out.Files![0].AddGroups).toEqual([{ GroupName: 'X_G', Panes: ['N_Root'] }]);
  });

  it('writes a plain scale patch when there is no zoom', () => {
    const out = writeIconScale({}, null, 0.8, 0.8);
    expect(out.Anims).toBeUndefined();
    expect(out.Files![0].Patches![0]).toEqual({ PaneName: 'N_Root', Scale: { X: 0.8, Y: 0.8 } });
    expect(readIconScale(out)).toMatchObject({ normal: 0.8, focused: 0.8, source: 'patch' });
  });

  it('creates Active/Inactive animations from the stock ones, keeping the cursor fade', () => {
    const out = writeIconScale({}, null, 1, 1.3);
    const active = JSON.parse(out.Anims!.find((a) => a.FileName.endsWith('_Active.bflan'))!.AnimJson);
    expect(active.pai1.Entries.map((e: { Name: string }) => e.Name).sort()).toEqual(['N_Root', 'P_InnerCursor']);
    // The stock group can't take N_Root: a theme group with both panes replaces it.
    expect(active.pat1.Groups).toEqual(['STS_G_Focus']);
    expect(out.Files![0].AddGroups).toEqual([{ GroupName: 'STS_G_Focus', Panes: ['P_InnerCursor', 'N_Root'] }]);
    expect(readIconScale(out)).toMatchObject({ normal: 1, focused: 1.3, source: 'animation' });
  });
});

describe('BFLAN to layout.json form', () => {
  it('rejects files that are not BFLAN', () => {
    expect(() => bflanToJson(new Uint8Array(32))).toThrow();
  });
});
