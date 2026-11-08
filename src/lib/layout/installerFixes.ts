import type { ScreenTarget } from '../../types/theme';
import { hasLayoutChanges, type LayoutPatch } from './patch';
import Fix11NoMoveApplets from './compat/11_NoMoveApplets.json';
import Fix11NoOnlineButton from './compat/11_NoOnlineButton.json';
import Fix20CarefulLayout from './compat/20_CarefulLayout.json';
import Fix20DowngradeTo19 from './compat/20_DowngradeTo19.json';
import Fix20FlowLayout from './compat/20_FlowLayout.json';
import Fix20LegacyAppletButtons from './compat/20_LegacyAppletButtons.json';
import FixLegacyClearLock from './compat/Legacy_ClearLock.json';
import FixLegacyCompact from './compat/Legacy_Compact.json';
import FixLegacyDiamond from './compat/Legacy_Diamond.json';
import FixLegacyDogeLayout from './compat/Legacy_DogeLayout.json';

/**
 * What NXThemes Installer does to a layout before installing it, ported from
 * SwitchThemesCommon (FirmwareDetection.cs, NewFirmFixes.cs, SzsPatcher.PatchLayouts).
 * The preview stacks the same patches so it shows what the console will display.
 */

/** ConsoleFirmware enum values (A_B_C as an int: 11.0.0 -> 1100). */
export const FW = { Invariant: 0, Fw5_0: 500, Fw6_0: 600, Fw8_0: 800, Fw9_0: 900, Fw11_0: 1100, Fw20_0: 2000 } as const;

export const firmwareLabel = (fw: number) => (fw === 0 ? 'unknown' : `${Math.floor(fw / 100)}.${Math.floor(fw / 10) % 10}+`);

const RULES: Partial<Record<ScreenTarget, { version: number; must?: string[]; mustNot?: string[] }[]>> = {
  home: [
    { version: FW.Fw20_0, must: ['blyt/RdtBtnSplay.bflyt'], mustNot: ['anim/RdtBase_SystemAppletPos.bflan'] },
    { version: FW.Fw11_0, must: ['blyt/RdtBtnLR.bflyt'] },
    { version: FW.Fw8_0, must: ['blyt/IconError.bflyt', 'blyt/RdtIconPromotion.bflyt'], mustNot: ['anim/RdtBtnShop_LimitB.bflan'] },
    { version: FW.Fw6_0, must: ['blyt/IconError.bflyt'], mustNot: ['anim/RdtBtnShop_LimitB.bflan'] },
    { version: FW.Fw5_0, must: ['anim/RdtBtnShop_LimitB.bflan', 'blyt/IconError.bflyt'] },
  ],
  lock: [{ version: FW.Fw9_0, must: ['blyt/PageindicatorAlarm.bflyt', 'blyt/EntBtnResumeSystemApplet.bflyt'] }],
};

/** FirmwareDetection.Detect: the highest firmware whose marker files match. */
export function detectFirmware(target: ScreenTarget, files: Set<string>): number {
  const matches = (RULES[target] ?? []).filter(
    (r) => (r.must ?? []).every((f) => files.has(f)) && (r.mustNot ?? []).every((f) => !files.has(f)),
  );
  return matches.length ? Math.max(...matches.map((m) => m.version)) : FW.Invariant;
}

export interface FixLayer {
  name: string;
  patch: LayoutPatch;
  why: string;
}

const fix = (name: string, json: unknown, why: string): FixLayer => ({ name, patch: json as LayoutPatch, why });

/** The theme's TargetFirmware; the injector assumes 11.0 when it's missing. */
export const themeTargetFirmware = (l: LayoutPatch) => l.TargetFirmware ?? FW.Fw11_0;

const themezerId = (layoutId: string, id: string) => layoutId === id || layoutId.startsWith(`${id}|`);

/**
 * Returns the patches the installer applies before and after the theme's own layout.json,
 * for a console on firmware `fw`. Mirrors SzsPatcher.PatchLayouts with default options.
 */
export function installerFixes(layout: LayoutPatch, target: ScreenTarget, fw: number): { before: FixLayer[]; after: FixLayer[] } {
  const before: FixLayer[] = [];
  const after: FixLayer[] = [];
  // Without a layout.json the installer never calls PatchLayouts.
  if (!hasLayoutChanges(layout)) return { before, after };

  const isHome = target === 'home';
  const tfw = themeTargetFirmware(layout);
  const anims = layout.Anims ?? [];
  const usesOldFixes = layout.ID == null && !layout.Ready8X;
  const useLegacy = fw !== FW.Invariant && usesOldFixes;
  const useModern = !useLegacy && layout.ID != null;

  let appletPosition = false;
  if (isHome) {
    if (fw <= FW.Fw11_0) appletPosition = !anims.some((a) => a.FileName === 'anim/RdtBase_SystemAppletPos.bflan');
    else if (fw >= FW.Fw20_0) appletPosition = tfw < FW.Fw20_0 || (layout.HideOnlineBtn ?? true);
  }
  const onlineBtn = isHome && (layout.HideOnlineBtn ?? true);

  if (appletPosition) {
    if (fw >= FW.Fw20_0) before.push(fix('20_DowngradeTo19', Fix20DowngradeTo19, 'Theme targets an older firmware: applets moved back to the 19.x row'));
    else if (fw >= FW.Fw11_0) before.push(fix('11_NoMoveApplets', Fix11NoMoveApplets, 'Keeps the applet row from sliding (animation only)'));
  }
  if (onlineBtn) {
    if (fw >= FW.Fw20_0) before.push(fix('20_LegacyAppletButtons', Fix20LegacyAppletButtons, 'HideOnlineBtn: the Switch Online button is removed'));
    else if (fw >= FW.Fw11_0) before.push(fix('11_NoOnlineButton', Fix11NoOnlineButton, 'HideOnlineBtn: the Switch Online button is removed (animation only)'));
  }

  if (useLegacy) {
    const name = (layout.PatchName ?? '').toLowerCase();
    if (fw >= FW.Fw9_0 && target === 'lock' && name.includes('clear lockscreen')) after.push(fix('Legacy_ClearLock', FixLegacyClearLock, 'Known old layout fixed by the installer'));
    if (fw >= FW.Fw8_0 && isHome) {
      if (name.includes('dogelayout') || name.includes('clearlayout')) after.push(fix('Legacy_DogeLayout', FixLegacyDogeLayout, 'Known old layout fixed by the installer'));
      else if (name.includes('diamond layout')) after.push(fix('Legacy_Diamond', FixLegacyDiamond, 'Known old layout fixed by the installer'));
      else if (name.includes('small compact')) after.push(fix('Legacy_Compact', FixLegacyCompact, 'Known old layout fixed by the installer'));
    }
  }
  if (useModern && layout.ID) {
    if (fw >= FW.Fw9_0 && layout.ID === 'builtin_ClearLock') after.push(fix('Legacy_ClearLock', FixLegacyClearLock, 'Known old layout fixed by the installer'));
    else if (fw >= FW.Fw20_0 && tfw < FW.Fw20_0) {
      if (layout.ID === 'builtin_FlowLayout' || themezerId(layout.ID, 'Themezer:5')) after.push(fix('20_FlowLayout', Fix20FlowLayout, 'Known layout updated for 20.0 by the installer'));
      else if (layout.ID === 'builtin_CarefulLayout' || themezerId(layout.ID, 'Themezer:6')) after.push(fix('20_CarefulLayout', Fix20CarefulLayout, 'Known layout updated for 20.0 by the installer'));
    }
  }
  return { before, after };
}

/** Marks a layout as made for firmware `fw` (no downgrade fixes), keeping the modern applet row on home. */
export function stampFirmware(layout: LayoutPatch, target: ScreenTarget, fw: number): LayoutPatch {
  return { ...layout, TargetFirmware: fw, ...(target === 'home' && layout.HideOnlineBtn === undefined ? { HideOnlineBtn: false } : {}) };
}
