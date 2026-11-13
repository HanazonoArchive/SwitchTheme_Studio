import type { LayoutPatch } from './patch';
import { findPanePatch, setPaneFields } from './patch';
import type { SystemLayout } from './systemLayouts';
import { bflanToJson, type BflanCurveJson, type BflanEntryJson, type BflanJson } from '../nx/bflanJson';

/**
 * Game icon size on the Home menu, and how much the focused game grows.
 *
 * What the console does (from its own RdtBtnIconGame animations, 20.0+ and older):
 * - Every game icon is the same layout (RdtBtnIconGame) used once per slot, so a size change
 *   applies to all of them at once.
 * - Stock, focusing a game doesn't change its size: FocusKey/Active only fade the cursor frame in
 *   (P_InnerCursor). Pressing it bounces it to 94% for 8 frames (DecideKey).
 * - There's no console setting for an enlarged focused game. Themes do it by adding scale keys
 *   (FLPA scale X/Y) to RdtBtnIconGame_Active (grow when focused) and _Inactive (back to normal),
 *   on N_Root (Purple Skies: 100% → 180%) or RootPane (Gengar: 47% → 75%), with a group that
 *   contains that pane.
 *
 * Here: read those values, and write them back (editing the theme's animations, or creating them
 * from the console's own animation files so their stock keys stay).
 */

export const ICON_FILE = 'blyt/RdtBtnIconGame.bflyt';
const ACTIVE = 'anim/RdtBtnIconGame_Active.bflan';
const INACTIVE = 'anim/RdtBtnIconGame_Inactive.bflan';
const GROUP = 'STS_G_Focus';
/** Frames the focused icon takes to grow. */
const GROW_FRAMES = 8;

export interface IconScale {
  /** Unfocused size, 1 = console size. */
  normal: number;
  /** Focused size, 1 = console size. */
  focused: number;
  /** Pane the theme scales (animations), or the one we'd use. */
  pane: string;
  /** Where the values come from. */
  source: 'animation' | 'patch' | 'stock';
}

const parse = (json: string | undefined): BflanJson | null => {
  if (!json) return null;
  try {
    return JSON.parse(json) as BflanJson;
  } catch {
    return null;
  }
};
const animOf = (layout: LayoutPatch, file: string) => parse(layout.Anims?.find((a) => a.FileName === file)?.AnimJson);

/** The pane and scale X curve an animation sets (FLPA target 6), if any. */
function scaleCurve(a: BflanJson | null): { pane: string; curve: BflanCurveJson } | null {
  for (const e of a?.pai1.Entries ?? []) {
    if (e.Target !== 0) continue;
    for (const t of e.Tags) {
      if (t.TagType !== 'FLPA') continue;
      const c = t.Entries.find((x) => x.AnimationTarget === 6);
      if (c?.KeyFrames.length) return { pane: e.Name, curve: c };
    }
  }
  return null;
}
const lastValue = (c: BflanCurveJson) => [...c.KeyFrames].sort((a, b) => a.Frame - b.Frame).pop()!.Value;
const firstValue = (c: BflanCurveJson) => [...c.KeyFrames].sort((a, b) => a.Frame - b.Frame)[0].Value;
/** Static scale of a pane from the theme's patches (1 if none). */
const patchScale = (layout: LayoutPatch, pane: string) => findPanePatch(layout, ICON_FILE, pane)?.Scale?.X ?? 1;

export function readIconScale(layout: LayoutPatch): IconScale {
  const act = scaleCurve(animOf(layout, ACTIVE));
  const ina = scaleCurve(animOf(layout, INACTIVE));
  const pane = act?.pane ?? ina?.pane ?? 'N_Root';
  // Other static scales above the animated pane (RootPane when N_Root is animated) multiply.
  const outer = pane === 'RootPane' ? 1 : patchScale(layout, 'RootPane');
  if (act || ina) {
    const normal = ina ? lastValue(ina.curve) : act ? firstValue(act.curve) : patchScale(layout, pane);
    const focused = act ? lastValue(act.curve) : normal;
    return { normal: outer * normal, focused: outer * focused, pane, source: 'animation' };
  }
  const s = outer * patchScale(layout, pane);
  const patched = !!findPanePatch(layout, ICON_FILE, 'RootPane')?.Scale || !!findPanePatch(layout, ICON_FILE, pane)?.Scale;
  return { normal: s, focused: s, pane, source: patched ? 'patch' : 'stock' };
}

/* --------------------------------- writing --------------------------------- */

/**
 * The console's own Active/Inactive animations as a starting point. From the console's file
 * when it's loaded; otherwise the same structure (only the cursor fade, as in 20.0–23.0).
 */
function stockAnim(sys: SystemLayout | null | undefined, file: string): BflanJson {
  const raw = sys?.animations.get(file);
  if (raw instanceof Uint8Array) return bflanToJson(raw);
  const active = file === ACTIVE;
  return {
    LittleEndian: true,
    Version: 0x09000000,
    pat1: {
      AnimationOrder: active ? 12 : 13,
      Name: active ? 'Active' : 'Inactive',
      ChildBinding: 0,
      Groups: ['G_Active'],
      Unk_StartOfFile: 0,
      Unk_EndOfFile: 0,
      Unk_EndOfHeader: active ? 'ALUAAAAAAA==' : 'AWEBAAAAAA==',
    },
    pai1: {
      FrameSize: active ? 1 : 3,
      Flags: 0,
      Textures: [],
      Entries: [
        {
          Name: 'P_InnerCursor',
          Target: 0,
          Tags: [
            {
              Unknown: 0,
              TagType: 'FLVC',
              Entries: [
                {
                  Index: 0,
                  AnimationTarget: 16,
                  DataType: 2,
                  KeyFrames: active
                    ? [
                        { Frame: 0, Value: 0, Blend: 255 },
                        { Frame: 1, Value: 255, Blend: 0 },
                      ]
                    : [
                        { Frame: 0, Value: 255, Blend: -85 },
                        { Frame: 3, Value: 0, Blend: 0 },
                      ],
                  FLEUUnknownInt: 0,
                  FLEUEntryName: '',
                },
              ],
            },
          ],
          UnkwnownData: '',
        },
      ],
    },
  };
}

const curve = (target: number, keys: [number, number][]): BflanCurveJson => ({
  Index: 0,
  AnimationTarget: target,
  DataType: 2,
  KeyFrames: keys.map(([Frame, Value]) => ({ Frame, Value, Blend: 0 })),
  FLEUUnknownInt: 0,
  FLEUEntryName: '',
});

/** Replaces (or adds) the pane's scale X/Y keys, leaving its other keys alone. */
function withScale(a: BflanJson, pane: string, keys: [number, number][]): BflanJson {
  const entries = a.pai1.Entries.map((e) => ({ ...e, Tags: e.Tags.map((t) => ({ ...t, Entries: [...t.Entries] })) }));
  let e = entries.find((x) => x.Name === pane && x.Target === 0);
  if (!e) {
    e = { Name: pane, Target: 0, Tags: [], UnkwnownData: '' } as BflanEntryJson;
    entries.unshift(e);
  }
  let tag = e.Tags.find((t) => t.TagType === 'FLPA');
  if (!tag) {
    tag = { Unknown: 0, TagType: 'FLPA', Entries: [] };
    e.Tags.push(tag);
  }
  tag.Entries = [...tag.Entries.filter((c) => c.AnimationTarget !== 6 && c.AnimationTarget !== 7), curve(6, keys), curve(7, keys)];
  const end = Math.max(...keys.map(([f]) => f));
  return { ...a, pai1: { ...a.pai1, FrameSize: Math.max(a.pai1.FrameSize, end), Entries: entries } };
}

/**
 * Makes sure the animations' group includes the scaled pane. A stock group can't be changed, so
 * a theme group is added with the stock group's panes plus this one (AddGroups).
 */
function ensureGroup(layout: LayoutPatch, sys: SystemLayout | null | undefined, anims: BflanJson[], pane: string): { layout: LayoutPatch; anims: BflanJson[] } {
  type G = { GroupName: string; Panes: string[] };
  const files = [...(layout.Files ?? [])];
  let fi = files.findIndex((f) => f.FileName === ICON_FILE);
  if (fi < 0) {
    files.push({ FileName: ICON_FILE, Patches: [] });
    fi = files.length - 1;
  }
  const added = [...((files[fi].AddGroups ?? []) as G[])];
  const stockGroups = sys?.layouts.get(ICON_FILE)?.groups ?? [];
  const panesOf = (name: string) => added.find((g) => g.GroupName === name)?.Panes ?? stockGroups.find((g) => g.name === name)?.panes ?? (name === 'G_Active' ? ['P_InnerCursor'] : []);
  const outAnims = anims.map((a) => {
    const group = a.pat1.Groups[0];
    if (panesOf(group).includes(pane)) return a;
    const own = added.findIndex((g) => g.GroupName === group);
    if (own >= 0) {
      // The theme's own group: add the pane to it.
      added[own] = { ...added[own], Panes: [...added[own].Panes, pane] };
      return a;
    }
    let mine = added.findIndex((g) => g.GroupName === GROUP);
    if (mine < 0) {
      added.push({ GroupName: GROUP, Panes: [] });
      mine = added.length - 1;
    }
    added[mine] = { ...added[mine], Panes: [...new Set([...added[mine].Panes, ...panesOf(group), pane])] };
    return { ...a, pat1: { ...a.pat1, Groups: [GROUP] } };
  });
  files[fi] = { ...files[fi], AddGroups: added };
  return { layout: { ...layout, Files: files }, anims: outAnims };
}

/**
 * Sets the unfocused and focused game icon sizes (1 = console size). Equal sizes with no theme
 * animations are a plain scale patch; otherwise the Active/Inactive animations carry them.
 */
export function writeIconScale(layout: LayoutPatch, sys: SystemLayout | null | undefined, normal: number, focused: number): LayoutPatch {
  const cur = readIconScale(layout);
  const round = (v: number) => Math.round(v * 10000) / 10000;
  const hasAnims = cur.source === 'animation';
  if (!hasAnims && Math.abs(normal - focused) < 1e-4) {
    // No enlargement: a static scale on N_Root (or whatever pane already carries it).
    const pane = findPanePatch(layout, ICON_FILE, 'RootPane')?.Scale && !findPanePatch(layout, ICON_FILE, cur.pane)?.Scale ? 'RootPane' : cur.pane;
    const outer = pane === 'RootPane' ? 1 : patchScale(layout, 'RootPane');
    const s = round(normal / outer);
    return setPaneFields(layout, ICON_FILE, pane, { Scale: Math.abs(s - 1) < 1e-4 && pane !== 'RootPane' ? undefined : { X: s, Y: s } });
  }
  const pane = cur.pane;
  const outer = pane === 'RootPane' ? 1 : patchScale(layout, 'RootPane');
  const n = round(normal / outer);
  const f = round(focused / outer);
  let active = withScale(animOf(layout, ACTIVE) ?? stockAnim(sys, ACTIVE), pane, [
    [0, n],
    [GROW_FRAMES, f],
  ]);
  let inactive = withScale(animOf(layout, INACTIVE) ?? stockAnim(sys, INACTIVE), pane, [
    [0, n],
    [GROW_FRAMES, n],
  ]);
  const g = ensureGroup(layout, sys, [active, inactive], pane);
  [active, inactive] = g.anims;
  // The static scale matches the unfocused size (what shows before any animation plays).
  let out = setPaneFields(g.layout, ICON_FILE, pane, { Scale: { X: n, Y: n } });
  const anims = (out.Anims ?? []).filter((a) => a.FileName !== ACTIVE && a.FileName !== INACTIVE);
  anims.push({ FileName: ACTIVE, AnimJson: JSON.stringify(active) }, { FileName: INACTIVE, AnimJson: JSON.stringify(inactive) });
  out = { ...out, Anims: anims };
  return out;
}
