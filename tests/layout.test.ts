import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  applyLayoutToBflyt,
  applyPanePatch,
  editPane,
  findImplicitZeroVectors,
  findPanePatch,
  revertPane,
  UNKNOWN_STOCK,
  type LayoutPatch,
  type PaneState,
} from '../src/lib/layout/patch';
import { getPaneInfo } from '../src/lib/layout/paneModel';
import { parseBflyt } from '../src/lib/nx/bflyt';
import { buildSarc } from '../src/lib/nx/sarc';
import { yaz0StoreOnly } from '../src/lib/nx/yaz0';
import { parseSystemSzs, resolvePartLayout } from '../src/lib/layout/systemLayouts';
import { buildBflyt } from './helpers';

const stock: PaneState = { ...UNKNOWN_STOCK, position: { X: -500, Y: 300, Z: 0 }, scale: { X: 1, Y: 1 }, size: { X: 200, Y: 50 } };

describe('patch semantics (match the injector)', () => {
  it('a vector with a missing axis sets that axis to 0, not "unchanged"', () => {
    const s = applyPanePatch(stock, { PaneName: 'N_System', Position: { Y: -219 } });
    expect(s.position).toEqual({ X: 0, Y: -219, Z: 0 });
  });

  it('missing properties keep stock values', () => {
    const s = applyPanePatch(stock, { PaneName: 'N_System', Visible: false });
    expect(s.position).toEqual(stock.position);
    expect(s.visible).toBe(false);
  });

  it('edits write full vectors so the injector rule cannot zero an axis', () => {
    const layout = editPane({}, 'blyt/RdtBase.bflyt', 'N_MyPage', stock, { position: { Y: 280 } });
    expect(findPanePatch(layout, 'blyt/RdtBase.bflyt', 'N_MyPage')).toEqual({ PaneName: 'N_MyPage', Position: { X: -500, Y: 280, Z: 0 } });
  });

  it('edits only write the fields that changed (no fake Size/Scale)', () => {
    const layout = editPane({}, 'blyt/RdtBase.bflyt', 'N_MyPage', stock, { visible: false });
    expect(findPanePatch(layout, 'blyt/RdtBase.bflyt', 'N_MyPage')).toEqual({ PaneName: 'N_MyPage', Visible: false });
  });

  it('keeps panes with the same name in different files apart', () => {
    let layout: LayoutPatch = editPane({}, 'blyt/RdtBtnPvr.bflyt', 'N_Tip', stock, { visible: false });
    layout = editPane(layout, 'blyt/RdtBtnIconGame.bflyt', 'N_Tip', stock, { scale: { X: 2 } });
    expect(findPanePatch(layout, 'blyt/RdtBtnPvr.bflyt', 'N_Tip')).toEqual({ PaneName: 'N_Tip', Visible: false });
    expect(findPanePatch(layout, 'blyt/RdtBtnIconGame.bflyt', 'N_Tip')).toEqual({ PaneName: 'N_Tip', Scale: { X: 2, Y: 1 } });
  });

  it('does not mutate the input layout', () => {
    const original = JSON.parse(readFileSync('tests/fixtures/vertical-oem-home.layout.json', 'utf8')) as LayoutPatch;
    const snapshot = JSON.stringify(original);
    editPane(original, 'blyt/RdtBase.bflyt', 'N_MyPage', stock, { position: { X: 1 } });
    revertPane(original, 'blyt/RdtBase.bflyt', 'N_MyPage');
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('reverts a field, then the whole pane, and drops empty files', () => {
    let layout = editPane({}, 'blyt/Hud.bflyt', 'N_Time', stock, { position: { X: 1 }, visible: false });
    layout = revertPane(layout, 'blyt/Hud.bflyt', 'N_Time', 'Position');
    expect(findPanePatch(layout, 'blyt/Hud.bflyt', 'N_Time')).toEqual({ PaneName: 'N_Time', Visible: false });
    layout = revertPane(layout, 'blyt/Hud.bflyt', 'N_Time');
    expect(layout.Files).toEqual([]);
  });

  it('flags implicit zero axes in real themes', () => {
    const layout = JSON.parse(readFileSync('tests/fixtures/vertical-oem-home.layout.json', 'utf8')) as LayoutPatch;
    const issues = findImplicitZeroVectors(layout);
    expect(issues.some((i) => i.pane === 'N_System' && i.field === 'Position' && i.missing.includes('X'))).toBe(true);
  });
});

describe('system layouts', () => {
  const base = buildBflyt({
    kind: 'pan1',
    name: 'RootPane',
    size: [1280, 720],
    children: [
      { kind: 'pan1', name: 'N_MyPage', pos: [-560, 300] },
      { kind: 'prt1', name: 'L_Hud', partName: 'Hud', pos: [500, 300] },
    ],
  });
  const hud = buildBflyt({ kind: 'pan1', name: 'RootPane', children: [{ kind: 'pan1', name: 'N_Time', pos: [-100, 0] }] });
  const szs = yaz0StoreOnly(buildSarc({ 'blyt/RdtBase.bflyt': base, 'blyt/Hud.bflyt': hud, 'blyt/RdtBtnLR.bflyt': hud }));

  it('loads a dumped ResidentMenu.szs and finds the screen root and parts', () => {
    const sys = parseSystemSzs('ResidentMenu.szs', szs);
    expect(sys.target).toBe('home');
    expect(sys.mainLayout).toBe('blyt/RdtBase.bflyt');
    expect(sys.firmware).toBe(1100);
    expect(resolvePartLayout(sys, sys.layouts.get('blyt/RdtBase.bflyt')!.byName.get('L_Hud')!)).toBe('blyt/Hud.bflyt');
  });

  it('gives real stock values and the patched result', () => {
    const sys = parseSystemSzs('ResidentMenu.szs', szs);
    const layout: LayoutPatch = { Files: [{ FileName: 'blyt/RdtBase.bflyt', Patches: [{ PaneName: 'N_MyPage', Position: { Y: 280 } }] }] };
    const info = getPaneInfo(layout, sys, 'blyt/RdtBase.bflyt::N_MyPage');
    expect(info.stock?.position).toEqual({ X: -560, Y: 300, Z: 0 });
    expect(info.current.position).toEqual({ X: 0, Y: 280, Z: 0 });
    expect(info.missingInStock).toBe(false);
    expect(getPaneInfo(layout, sys, 'blyt/RdtBase.bflyt::N_Nope').missingInStock).toBe(true);
  });

  it('applies a file patch to a copy of the tree', () => {
    const f = parseBflyt(base);
    const root = applyLayoutToBflyt(f, { FileName: 'blyt/RdtBase.bflyt', Patches: [{ PaneName: 'N_MyPage', Visible: false, Scale: { X: 2, Y: 2 } }] })!;
    const pane = root.children.find((c) => c.name === 'N_MyPage')!;
    expect(pane.visible).toBe(false);
    expect(pane.scale).toEqual({ X: 2, Y: 2 });
    expect(f.byName.get('N_MyPage')!.visible).toBe(true);
  });

  it('rejects files that are not theme targets', () => {
    expect(() => parseSystemSzs('Banner.szs', szs)).toThrow(/isn't a known theme target/);
  });
});
