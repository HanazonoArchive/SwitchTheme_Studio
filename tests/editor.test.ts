import { describe, expect, it } from 'vitest';
import { paneNotes, fieldNote } from '../src/lib/layout/limits';
import { blockedBy, changedKeysOf, explodeScene, unionBox } from '../src/features/canvas/geometry';
import { marksOf, markKey, setMark } from '../src/lib/editor/marks';
import type { Scene, SceneNode } from '../src/lib/render/scene';
import { IDENTITY, type Mat } from '../src/lib/render/matrix';

const node = (id: string, over: Partial<SceneNode> = {}): SceneNode => ({
  id,
  key: `blyt/A.bflyt::${id.split('/').pop()}`,
  name: id.split('/').pop()!,
  kind: 'pic1',
  file: 'blyt/A.bflyt',
  editable: true,
  hidden: false,
  hiddenOnConsole: false,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  alpha: 1,
  opacity: 1,
  rect: { x: 0, y: 0, w: 10, h: 10 },
  content: null,
  children: [],
  childOffsetX: 0,
  world: IDENTITY,
  parentWorld: IDENTITY,
  posScale: { x: 1, y: 1 },
  sizeScale: { x: 1, y: 1 },
  gameIndex: null,
  ...over,
});

describe('console limits', () => {
  it('warns that the console lays out the HUD row X', () => {
    const notes = paneNotes({ file: 'blyt/Hud.bflyt', pane: 'N_Time', kind: 'pan1' });
    expect(fieldNote(notes, 'position.x')?.level).toBe('warn');
    expect(fieldNote(notes, 'position.y')).toBeUndefined();
  });
  it('marks patches to missing panes as not supported', () => {
    const notes = paneNotes({ file: 'blyt/RdtBase.bflyt', pane: 'N_Nope', kind: null, missing: true });
    expect(notes[0].level).toBe('error');
  });
  it('flags part RootPane transforms and code slot sizes', () => {
    expect(fieldNote(paneNotes({ file: 'blyt/X.bflyt', pane: 'RootPane', kind: 'pan1', partRoot: true }), 'position')).toBeDefined();
    expect(fieldNote(paneNotes({ file: 'blyt/RdtBase.bflyt', pane: 'N_Icon_00', kind: null, codeSlot: true }), 'size')?.level).toBe('info');
  });
});

describe('editor geometry', () => {
  it('hides and locks through ancestors', () => {
    const set = new Set(['a/b']);
    expect(blockedBy('a/b/c', set)).toBe(true);
    expect(blockedBy('a/bc', set)).toBe(false);
    expect(blockedBy('a', set)).toBe(false);
  });
  it('lists the panes a layout changes, including draw order', () => {
    const keys = changedKeysOf({ Files: [{ FileName: 'blyt/A.bflyt', Patches: [{ PaneName: 'P_Bg' }], PushBackPanes: ['N_Top'] }] });
    expect([...keys].sort()).toEqual(['blyt/A.bflyt::N_Top', 'blyt/A.bflyt::P_Bg']);
  });
  it('unions boxes', () => {
    expect(unionBox([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: -5, w: 5, h: 5 }])).toEqual({ x: 0, y: -5, w: 25, h: 15 });
    expect(unionBox([])).toBeNull();
  });
  it('lays a component out as tiles that keep ids and show hidden layers', () => {
    const shift: Mat = [1, 0, 0, 1, 100, 100];
    const a = node('r/c/a', { content: { type: 'color' } as never, world: shift, parentWorld: shift });
    const b = node('r/c/b', { content: { type: 'color' } as never, alpha: 0, opacity: 0, hidden: true, world: shift, parentWorld: shift });
    const comp = node('r/c', { kind: 'prt1', children: [a, b] });
    const scene: Scene = { width: 1280, height: 720, root: node('r', { children: [comp] }), flat: [] };
    const ex = explodeScene(scene, comp);
    expect(ex.tiles.map((t) => t.id)).toEqual(['r/c/a', 'r/c/b']);
    expect(ex.tiles[1].note).toBe('not shown right now');
    const tiles = ex.scene.root.children;
    expect(tiles.every((t) => !t.hidden && t.opacity === 1 && t.matrix)).toBe(true);
    // Tiles don't overlap.
    const [ta, tb] = ex.tiles.map((t) => t.box);
    expect(ta.x + ta.w <= tb.x || tb.x + tb.w <= ta.x || ta.y + ta.h <= tb.y || tb.y + tb.h <= ta.y).toBe(true);
  });
});

describe('layer marks', () => {
  it('sets, clears and scopes marks per screen', () => {
    let m = setMark(undefined, markKey('home', 'a/b'), { fav: true });
    m = setMark(m, markKey('home', 'a/b'), { color: 'red' });
    m = setMark(m, markKey('lock', 'a/b'), { color: 'blue' });
    expect(marksOf(m, 'home').get('a/b')).toEqual({ fav: true, color: 'red' });
    m = setMark(m, markKey('home', 'a/b'), { fav: false, color: undefined });
    expect(marksOf(m, 'home').size).toBe(0);
    expect(marksOf(m, 'lock').get('a/b')?.color).toBe('blue');
  });
});
