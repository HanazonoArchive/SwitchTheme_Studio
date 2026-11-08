import { describe, expect, it } from 'vitest';
import { detectFirmware, FW, installerFixes, stampFirmware } from '../src/lib/layout/installerFixes';
import { checkCompatibility, layoutForAnimation } from '../src/lib/layout/compatibility';
import { getPaneInfo } from '../src/lib/layout/paneModel';
import { parseSystemSzs } from '../src/lib/layout/systemLayouts';
import { buildSarc } from '../src/lib/nx/sarc';
import { buildBflyt } from './helpers';
import type { LayoutPatch } from '../src/lib/layout/patch';

const withPatch = (extra: Partial<LayoutPatch>): LayoutPatch => ({
  Files: [{ FileName: 'blyt/RdtBase.bflyt', Patches: [{ PaneName: 'N_MyPage', Visible: false }] }],
  ...extra,
});
const names = (r: ReturnType<typeof installerFixes>) => [...r.before, ...r.after].map((f) => f.name);

describe('firmware detection (FirmwareDetection.cs)', () => {
  it('picks the highest matching home firmware', () => {
    expect(detectFirmware('home', new Set(['blyt/RdtBtnSplay.bflyt', 'blyt/RdtBtnLR.bflyt']))).toBe(FW.Fw20_0);
    expect(detectFirmware('home', new Set(['blyt/RdtBtnSplay.bflyt', 'blyt/RdtBtnLR.bflyt', 'anim/RdtBase_SystemAppletPos.bflan']))).toBe(FW.Fw11_0);
    expect(detectFirmware('apps', new Set(['blyt/RdtBtnSplay.bflyt']))).toBe(FW.Invariant);
  });
});

describe('installer fixes (NewFirmFixes / SzsPatcher.PatchLayouts)', () => {
  it('11.0 theme that hides the online button on a 20+ console gets both fixes', () => {
    expect(names(installerFixes(withPatch({ TargetFirmware: 1100, HideOnlineBtn: true }), 'home', FW.Fw20_0))).toEqual(['20_DowngradeTo19', '20_LegacyAppletButtons']);
  });

  it('11.0 theme keeping the online button still gets the applet downgrade', () => {
    expect(names(installerFixes(withPatch({ TargetFirmware: 1100, HideOnlineBtn: false }), 'home', FW.Fw20_0))).toEqual(['20_DowngradeTo19']);
  });

  it('a 20.0 theme with HideOnlineBtn false gets nothing', () => {
    expect(names(installerFixes(withPatch({ TargetFirmware: 2000, HideOnlineBtn: false }), 'home', FW.Fw20_0))).toEqual([]);
  });

  it('unset HideOnlineBtn counts as true and unset TargetFirmware as 11.0', () => {
    expect(names(installerFixes(withPatch({}), 'home', FW.Fw20_0))).toEqual(['20_DowngradeTo19', '20_LegacyAppletButtons']);
  });

  it('themes without layout changes are never touched', () => {
    expect(names(installerFixes({ HideOnlineBtn: true }, 'home', FW.Fw20_0))).toEqual([]);
  });

  it('known layouts by ID get their post-fix', () => {
    expect(names(installerFixes(withPatch({ ID: 'Themezer:5|variant', HideOnlineBtn: false }), 'home', FW.Fw20_0))).toEqual(['20_DowngradeTo19', '20_FlowLayout']);
    expect(names(installerFixes(withPatch({ ID: 'builtin_ClearLock' }), 'lock', FW.Fw9_0))).toEqual(['Legacy_ClearLock']);
  });

  it('11.x consoles get the animation-only fixes', () => {
    expect(names(installerFixes(withPatch({ HideOnlineBtn: true }), 'home', FW.Fw11_0))).toEqual(['11_NoMoveApplets', '11_NoOnlineButton']);
  });

  it('stamping targets the console and keeps the modern applet row', () => {
    const l = stampFirmware(withPatch({}), 'home', FW.Fw20_0);
    expect([l.TargetFirmware, l.HideOnlineBtn]).toEqual([2000, false]);
    expect(names(installerFixes(l, 'home', FW.Fw20_0))).toEqual([]);
  });
});

describe('preview includes installer fixes', () => {
  const base = buildBflyt({
    kind: 'pan1',
    name: 'RootPane',
    size: [1280, 720],
    children: [
      { kind: 'pan1', name: 'N_System', pos: [-54, -184], children: [{ kind: 'prt1', name: 'L_BtnLR', partName: 'RdtBtnLR' }] },
      { kind: 'pan1', name: 'N_MyPage', pos: [-303, 295] },
    ],
  });
  const sys = parseSystemSzs('ResidentMenu.szs', buildSarc({ 'blyt/RdtBase.bflyt': base, 'blyt/RdtBtnLR.bflyt': base, 'blyt/RdtBtnSplay.bflyt': base }));

  it('stock values include fixes applied before the theme', () => {
    expect(sys.firmware).toBe(FW.Fw20_0);
    const info = getPaneInfo(withPatch({ TargetFirmware: 1100, HideOnlineBtn: true }), sys, 'blyt/RdtBase.bflyt::L_BtnLR');
    expect(info.current.visible).toBe(false);
    expect(info.fixes.map((f) => f.name)).toEqual(['20_DowngradeTo19', '20_LegacyAppletButtons']);
    // 20_DowngradeTo19 writes {X:54,Y:-186}, then 20_LegacyAppletButtons writes {Y:-186} (X becomes 0).
    expect(getPaneInfo(withPatch({ TargetFirmware: 1100, HideOnlineBtn: true }), sys, 'blyt/RdtBase.bflyt::N_System').stock?.position).toEqual({ X: 0, Y: -186, Z: 0 });
  });

  it('flags animations that would be dropped', () => {
    const anim = { pat1: { Groups: ['G_Missing'] }, pai1: { Entries: [{ Name: 'N_Nope', Target: 0 }, { Name: 'N_MyPage', Target: 0 }] } };
    const layout: LayoutPatch = { Anims: [{ FileName: 'anim/RdtBase_In.bflan', AnimJson: JSON.stringify(anim) }] };
    const sysWithAnim = parseSystemSzs('ResidentMenu.szs', buildSarc({ 'blyt/RdtBase.bflyt': base, 'anim/RdtBase_In.bflan': new Uint8Array(4) }));
    const issues = checkCompatibility(layout, sysWithAnim);
    expect(issues.map((i) => `${i.type}:${i.item}:${i.severity}`)).toEqual(['MissingGroup:G_Missing:critical', 'MissingPane:N_Nope:critical']);
    expect(layoutForAnimation('anim/RdtBtnIconGame_Active.bflan')).toBe('blyt/RdtBtnIconGame.bflyt');
  });
});
