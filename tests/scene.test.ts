import { describe, expect, it } from 'vitest';
import type { BflytFile, BflytPane } from '../src/lib/nx/bflyt';
import type { SystemLayout } from '../src/lib/layout/systemLayouts';
import { buildScene, buildSource } from '../src/lib/render/scene';
import { applyLayoutToBflyt, applyMaterialPatches, applyUsdPatches } from '../src/lib/layout/patch';
import { bounds, quad } from '../src/lib/render/matrix';
import { classifyTexture, systemLayoutFromStock, toStockArchive } from '../src/lib/stock/stockPack';
import { DEFAULT_MOCK_GAMES, DEFAULT_MOCK_USERS } from '../src/constants/switchPanes';
import type { MockSystemState } from '../src/types/simulation';

const pane = (name: string, o: Partial<BflytPane> = {}, children: BflytPane[] = []): BflytPane => ({
  kind: 'pan1',
  name,
  visible: true,
  alpha: 255,
  influenceAlpha: false,
  originX: 0,
  originY: 0,
  parentOriginX: 0,
  parentOriginY: 0,
  position: { X: 0, Y: 0, Z: 0 },
  rotation: { X: 0, Y: 0, Z: 0 },
  scale: { X: 1, Y: 1 },
  size: { X: 10, Y: 10 },
  children,
  ...o,
});

const file = (root: BflytPane): BflytFile => {
  const byName = new Map<string, BflytPane>();
  const walk = (p: BflytPane) => (byName.set(p.name, p), p.children.forEach(walk));
  walk(root);
  return { version: 0x08000000, width: 1280, height: 720, root, groups: [], textures: [], materials: [], byName };
};

const mock: MockSystemState = {
  time: '12:00',
  users: DEFAULT_MOCK_USERS,
  games: DEFAULT_MOCK_GAMES,
  selectedGameIndex: 0,
  isDarkTheme: false,
  wireframeMode: false,
  canvasZoom: 1,
};

const system = (root: BflytPane): SystemLayout => ({
  target: 'lock',
  szsName: 'Entrance.szs',
  layouts: new Map([['blyt/EntMain.bflyt', file(root)]]),
  mainLayout: 'blyt/EntMain.bflyt',
  firmware: 0,
  firmwareHint: '',
  fileNames: new Set(),
  animations: new Map(),
  textures: new Map(),
  loadedAt: 0,
});

describe('scene', () => {
  it('places panes like nn::ui2d (Y up, parent pivots, scale) in screen space', () => {
    // Parent at (100, 50) scaled 2x; child 20 px right of it, 40×20.
    const child = pane('P_Child', { position: { X: 20, Y: 0, Z: 0 }, size: { X: 40, Y: 20 } });
    const parent = pane('N_Parent', { position: { X: 100, Y: 50, Z: 0 }, scale: { X: 2, Y: 2 } }, [child]);
    const root = pane('RootPane', { size: { X: 1280, Y: 720 } }, [parent]);
    const sys = system(root);
    const scene = buildScene({ system: sys, main: buildSource(sys, {}, false, true), common: null, hasWallpaper: false, mock, selectedKey: null })!;
    const n = scene.flat.find((x) => x.name === 'P_Child')!;
    const b = bounds(quad(n.world, n.rect));
    // centre: 640 + 100 + 2*20 = 780; 360 - 50 = 310; size doubled
    expect(b.x + b.w / 2).toBeCloseTo(780);
    expect(b.y + b.h / 2).toBeCloseTo(310);
    expect(b.w).toBeCloseTo(80);
    expect(b.h).toBeCloseTo(40);
    expect(n.key).toBe('blyt/EntMain.bflyt::P_Child');
  });

  it('keeps hidden panes (for the layers panel) without drawing them', () => {
    const hidden = pane('N_Hidden', { visible: false }, [pane('P_Inside')]);
    const sys = system(pane('RootPane', { size: { X: 1280, Y: 720 } }, [hidden]));
    const scene = buildScene({ system: sys, main: buildSource(sys, {}, false, true), common: null, hasWallpaper: false, mock, selectedKey: null })!;
    const h = scene.flat.find((x) => x.name === 'N_Hidden')!;
    expect(h.hidden).toBe(true);
    expect(h.hiddenOnConsole).toBe(true);
    expect(scene.flat.find((x) => x.name === 'P_Inside')?.hidden).toBe(true);
  });
});

describe('injector patch features', () => {
  const tree = () => file(pane('RootPane', {}, [pane('A'), pane('B'), pane('C'), pane('T_Text', { kind: 'txt1', fontColor: 'FF323232' })]));

  it('reorders panes like PullFrontPanes / PushBackPanes (start = drawn first)', () => {
    const r = applyLayoutToBflyt(tree(), { FileName: 'x', PullFrontPanes: ['C'], PushBackPanes: ['A'] })!;
    expect(r.children.map((c) => c.name)).toEqual(['C', 'B', 'T_Text', 'A']);
  });

  it('applies ColorTL/ColorBL to text panes as font colours', () => {
    const r = applyLayoutToBflyt(tree(), { FileName: 'x', Patches: [{ PaneName: 'T_Text', ColorTL: 'FF0000FF' }] })!;
    const t = r.children.find((c) => c.name === 'T_Text')!;
    expect(t.fontColor).toBe('FF0000FF');
    expect(t.fontColorPatched).toBe(true);
  });

  it('patches user data like the injector (same type replaces, missing is added, float bits)', () => {
    const p = { userData: { S_RoundRadius: [10] }, userDataTypes: { S_RoundRadius: 2 } };
    expect(applyUsdPatches(p, [{ PropName: 'S_RoundRadius', PropValues: ['5'], type: 1 }]).userData!.S_RoundRadius).toEqual([10]);
    expect(applyUsdPatches(p, [{ PropName: 'S_RoundRadius', PropValues: ['5'], type: 2 }]).userData!.S_RoundRadius).toEqual([5]);
    // 1106247680 = 0x41F00000 = 30.0f, as Purple Skies writes S_RoundRadius.
    expect(applyUsdPatches({}, [{ PropName: 'S_RoundRadius', PropValues: ['1106247680'], type: 1 }]).userData!.S_RoundRadius).toEqual([30]);
  });

  it('applies material colours, wrap and texture transforms', () => {
    const m = { name: 'M', black: '00000000', white: 'FFFFFFFF', textures: [{ name: 'T^s', wrapS: 0, wrapT: 0 }], transforms: [{ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }] };
    const [out] = applyMaterialPatches([m], [{ FileName: 'x', Materials: [{ MaterialName: 'M', BackgroundColor: 'ff00ff00', Refs: [{ Name: 'T^s', WrapS: 1 }], Transforms: [{ Name: 'T^s', ScaleX: 2 }] }] }]);
    expect(out.white).toBe('FF00FF00');
    expect(out.black).toBe('00000000');
    expect(out.textures[0].wrapS).toBe(1);
    expect(out.transforms[0].scaleX).toBe(2);
    expect(m.white).toBe('FFFFFFFF');
  });
});

describe('built-in layout pack', () => {
  const img = (w: number, h: number, f: (x: number, y: number) => number[]) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(f(x, y), (y * w + x) * 4);
    return { width: w, height: h, data };
  };

  it('describes textures with a few numbers instead of pixels', () => {
    expect(classifyTexture(img(4, 4, () => [255, 255, 255, 128])).kind).toBe('solid');
    expect(classifyTexture(img(8, 16, (_x, y) => [255, 255, 255, y * 16])).kind).toBe('vgrad');
    const circle = classifyTexture(img(32, 32, (x, y) => [255, 255, 255, (x - 15.5) ** 2 + (y - 15.5) ** 2 < 256 ? 255 : 0]));
    expect(circle.kind).toBe('roundrect');
    expect(classifyTexture(img(16, 16, (x, y) => [255, 255, 255, (x * 7 + y * 13) % 5 ? 255 : 0])).kind).toBe('none');
  });

  it('round-trips a layout archive without any texture pixels', () => {
    const sys = system(pane('RootPane', { size: { X: 1280, Y: 720 } }, [pane('N_A')]));
    sys.textures = new Map([['White1x1^s', { name: 'White1x1^s', format: 0x0b01, width: 1, height: 1, blockHeightLog2: 0, channels: [2, 3, 4, 5], data: new Uint8Array([255, 255, 255, 255]) }]]);
    const archive = toStockArchive(sys, () => ({ frameSize: 0, entries: [] }) as never, () => img(1, 1, () => [255, 255, 255, 255]), new Set());
    const json = JSON.parse(JSON.stringify(archive));
    expect(JSON.stringify(json)).not.toContain('"data"');
    expect(json.textures['White1x1^s']).toMatchObject({ kind: 'solid', width: 1, height: 1 });
    const back = systemLayoutFromStock(json);
    expect(back.layouts.get('blyt/EntMain.bflyt')?.byName.has('N_A')).toBe(true);
    expect(back.source).toBe('stock');
  });
});
