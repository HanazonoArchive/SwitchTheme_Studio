import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildScene, buildSource, type SceneNode } from '../src/lib/render/scene';
import { systemLayoutFromStock } from '../src/lib/stock/stockPack';
import { composePreset, type LayoutPreset } from '../src/lib/layout/presets';
import { DEFAULT_MOCK_GAMES, DEFAULT_MOCK_USERS } from '../src/constants/switchPanes';
import type { MockSystemState } from '../src/types/simulation';
import type { ScreenTarget } from '../src/types/theme';

/**
 * How qlaunch lays out Themezer layouts, checked against Themezer's layout previews
 * (github.com/ThemezerNX/Layouts overlay-dark.png). Uses the built-in stock pack (no Nintendo
 * pixels) and the bundled presets.
 */

// The renderer measures text and decodes textures with a canvas; numbers are all these tests need.
const stub: unknown = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 10 : k === 'width' ? 10 : stub),
  apply: () => stub,
});
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => stub }) };
(globalThis as { ImageData?: unknown }).ImageData ??= class {
  constructor(
    public data: unknown,
    public width: number,
    public height: number,
  ) {}
};

const STOCK: Record<string, string> = { home: 'ResidentMenu', apps: 'Flaunch', set: 'Set', news: 'Notification', user: 'MyPage', lock: 'Entrance', psl: 'Psl' };
const mock = { time: '12:00', users: DEFAULT_MOCK_USERS, games: DEFAULT_MOCK_GAMES, selectedGameIndex: 0, isDarkTheme: true, wireframeMode: false, canvasZoom: 1 } as MockSystemState;

function scene(target: ScreenTarget, presetId?: string) {
  const sys = systemLayoutFromStock(JSON.parse(readFileSync(`public/stock/${STOCK[target]}.json`, 'utf8')));
  const presets: LayoutPreset[] = JSON.parse(readFileSync(`public/presets/${target}.json`, 'utf8')).layouts;
  const preset = presetId ? presets.find((p) => p.id === presetId) : undefined;
  if (presetId && !preset) throw new Error(`no preset ${presetId}`);
  const layout = preset ? composePreset(preset, {}).layout : {};
  const s = buildScene({ system: sys, main: buildSource(sys, layout, true, false), common: null, hasWallpaper: false, mock, selectedKey: null })!;
  const all: SceneNode[] = [];
  const walk = (n: SceneNode) => (all.push(n), n.children.forEach(walk));
  walk(s.root);
  return all.filter((n) => !n.hidden);
}
const byId = (nodes: SceneNode[], re: RegExp) => nodes.filter((n) => re.test(n.id));

describe('Themezer layouts render like their previews', () => {
  it('sizes HOME game icons by the icon RootPane, not the N_Icon_XX slot scale', () => {
    // Left Aligned Rounded: RootPane 0.5, N_Icon 0.5, N_GameRoot 1.19 -> 152 px icons on Themezer.
    const nodes = scene('home', 'left-aligned-rounded');
    const icon = byId(nodes, /N_Icon_01\/.*\/P_IconGame$/)[0];
    expect(icon.world[0]).toBeCloseTo(0.595, 2);
    const slot = byId(nodes, /\/N_Icon_01$/)[0];
    expect(slot.scaleX).toBe(1);
  });

  it('lays out All Software rows in code: their X from the layout is ignored too', () => {
    // Right Rounded moves rows 50 px left; its preview's second tile is centred at x = 636.
    const tile = byId(scene('apps', 'right-rounded'), /L_BtnIconGame_00\/RootPane\/N_00\/N_BtnIconGame_01$/)[0];
    expect(tile.world[4]).toBeCloseTo(636, 0);
  });

  it('labels the All Software header buttons, Groups left of Sort/Filter', () => {
    const nodes = scene('apps');
    const grp = byId(nodes, /L_BtnGrp\/RootPane\/N_Root\/NH_Root$/)[0];
    const sort = byId(nodes, /L_BtnSort\/RootPane\/N_Root\/NH_Root$/)[0];
    expect(grp.content).toBeTruthy();
    expect(sort.content).toBeTruthy();
    expect(grp.content!.x + grp.content!.w).toBeLessThan(sort.content!.x);
  });

  it('shows News cards at full size (list mode, ModeFilter frame 0)', () => {
    const wrap = byId(scene('news'), /L_Btn_01\/RootPane\/N_Root\/N_BtnCnt\/N_CntWrp$/)[0];
    expect(wrap.world[0]).toBeCloseTo(1, 3);
  });

  it('draws the Settings menu over its N_NavPos background', () => {
    const nodes = scene('set', '2simple');
    const navPos = byId(nodes, /\/N_NavPos$/)[0];
    const kids = navPos.children.map((c) => c.id.split('/').pop());
    expect(kids.indexOf('L_NavBg')).toBeLessThan(kids.length - 1);
    expect(kids.indexOf('L_NavBg')).toBeGreaterThanOrEqual(0);
  });

  it('names HOME applets in their balloons (layouts that keep them open, e.g. Careful Layout)', () => {
    const labels = byId(scene('home', 'careful-layout'), /RdtBalloonSystemApplet.*|L_Balloon\/.*T_Main$/)
      .map((n) => n.content && 'sig' in n.content ? n.content.sig : '')
      .join(' ');
    expect(labels).toContain('News');
    expect(labels).toContain('Nintendo eShop');
  });
});
