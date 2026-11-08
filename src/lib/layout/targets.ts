import type { ScreenTarget } from '../../types/theme';

/** Theme parts as defined in SwitchThemesCommon/SwitchThemesCommon.cs (CommonInfo.Parts). */
export interface TargetInfo {
  target: ScreenTarget;
  szs: string;
  label: string;
  /** The layout that holds the screen's visible root, used as the preview entry point. */
  mainLayout: string;
  /** Whether a common.json (common.szs patch) is allowed for this part. */
  allowCommon: boolean;
}

export const TARGETS: TargetInfo[] = [
  { target: 'home', szs: 'ResidentMenu.szs', label: 'Home Menu', mainLayout: 'blyt/RdtBase.bflyt', allowCommon: true },
  { target: 'lock', szs: 'Entrance.szs', label: 'Lock Screen', mainLayout: 'blyt/EntMain.bflyt', allowCommon: false },
  { target: 'apps', szs: 'Flaunch.szs', label: 'All Software', mainLayout: 'blyt/FlcCntMain.bflyt', allowCommon: false },
  { target: 'set', szs: 'Set.szs', label: 'System Settings', mainLayout: 'blyt/BaseTop.bflyt', allowCommon: false },
  { target: 'news', szs: 'Notification.szs', label: 'News', mainLayout: 'blyt/NtfBase.bflyt', allowCommon: false },
  { target: 'user', szs: 'MyPage.szs', label: 'User Page', mainLayout: 'blyt/BaseTop.bflyt', allowCommon: true },
  { target: 'psl', szs: 'Psl.szs', label: 'Player Select', mainLayout: 'blyt/PslSelectSinglePlayer.bflyt', allowCommon: true },
];

export const TARGET_ORDER: ScreenTarget[] = TARGETS.map((t) => t.target);

export function targetInfo(target: ScreenTarget): TargetInfo {
  return TARGETS.find((t) => t.target === target) ?? TARGETS[0];
}

export function targetFromSzsName(name: string): ScreenTarget | null {
  const base = name.split(/[\\/]/).pop()!.toLowerCase();
  return TARGETS.find((t) => t.szs.toLowerCase() === base)?.target ?? null;
}

/** Normalises the info.json Target field (some tools write "Home", "ResidentMenu", etc.). */
export function normaliseTarget(raw: string | undefined, fileName: string): ScreenTarget {
  const t = (raw ?? '').toLowerCase();
  const direct = TARGETS.find((x) => x.target === t);
  if (direct) return direct.target;
  const bySzs = TARGETS.find((x) => x.szs.toLowerCase().startsWith(t) && t.length > 2);
  if (bySzs) return bySzs.target;
  const f = fileName.toLowerCase();
  if (f.includes('lock')) return 'lock';
  if (f.includes('all apps') || f.includes('allapps')) return 'apps';
  if (f.includes('settings')) return 'set';
  if (f.includes('news')) return 'news';
  if (f.includes('user page')) return 'user';
  if (f.includes('player select')) return 'psl';
  return 'home';
}
