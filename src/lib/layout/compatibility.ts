import { findPaneBfs, type LayoutPatch } from './patch';
import type { SystemLayout } from './systemLayouts';
import { flattenPanes } from '../nx/bflyt';

/**
 * Port of SwitchThemesCommon/Layouts/LayoutCompatibility.cs.
 * - Layout patches for missing files/panes are skipped by the installer (harmless but useless).
 * - Animations that target a missing pane or group can crash the console, so the installer
 *   drops the whole animation (SzsPatcher.FilterIncompatibleAnimations).
 */
export interface CompatIssue {
  file: string;
  item: string;
  type: 'MissingFile' | 'MissingPane' | 'MissingGroup' | 'Uncertain';
  /** critical = the installer drops this animation; ignored = the patch silently does nothing */
  severity: 'critical' | 'ignored';
  info?: string;
}

/** "anim/RdtBase_SystemAppletPos.bflan" -> "blyt/RdtBase.bflyt" (LayoutNameForAnimation). */
export function layoutForAnimation(anim: string) {
  const parts = anim.split('/');
  if (parts.length < 2) return null;
  const name = parts[1].split('_')[0];
  return name ? `blyt/${name}.bflyt` : null;
}

interface AnimJson {
  pat1?: { Groups?: string[] };
  pai1?: { Entries?: { Name: string; Target: number }[] };
}

export function checkCompatibility(layout: LayoutPatch, sys: SystemLayout): CompatIssue[] {
  const res: CompatIssue[] = [];
  const paneNames = (file: string) => {
    const f = sys.layouts.get(file);
    return new Set(f ? flattenPanes(f.root).map((x) => x.pane.name) : []);
  };

  for (const fp of layout.Files ?? []) {
    if (!sys.layouts.has(fp.FileName)) {
      res.push({ file: fp.FileName, item: fp.FileName, type: 'MissingFile', severity: 'ignored' });
      continue;
    }
    const names = paneNames(fp.FileName);
    for (const p of fp.Patches ?? []) if (!names.has(p.PaneName)) res.push({ file: fp.FileName, item: p.PaneName, type: 'MissingPane', severity: 'ignored' });
    for (const g of (fp.AddGroups ?? []) as { GroupName: string; Panes: string[] }[])
      for (const p of g.Panes ?? []) if (!names.has(p)) res.push({ file: fp.FileName, item: p, type: 'MissingPane', severity: 'ignored', info: `group ${g.GroupName}` });
    for (const p of [...(fp.PullFrontPanes ?? []), ...(fp.PushBackPanes ?? [])])
      if (!names.has(p)) res.push({ file: fp.FileName, item: p, type: 'MissingPane', severity: 'ignored', info: 'pane order' });
  }

  for (const anim of layout.Anims ?? []) {
    if (!sys.fileNames.has(anim.FileName)) {
      res.push({ file: anim.FileName, item: anim.FileName, type: 'MissingFile', severity: 'ignored' });
      continue;
    }
    const bflytName = layoutForAnimation(anim.FileName);
    const bflyt = bflytName ? sys.layouts.get(bflytName) : undefined;
    if (!bflyt || !bflytName) {
      res.push({ file: anim.FileName, item: bflytName ?? '?', type: 'Uncertain', severity: 'ignored', info: 'Unknown bflyt file' });
      continue;
    }
    let parsed: AnimJson;
    try {
      parsed = JSON.parse(anim.AnimJson) as AnimJson;
    } catch {
      res.push({ file: anim.FileName, item: anim.FileName, type: 'Uncertain', severity: 'critical', info: 'AnimJson is not valid JSON' });
      continue;
    }
    const added = new Set(
      (layout.Files ?? []).filter((f) => f.FileName === bflytName).flatMap((f) => ((f.AddGroups ?? []) as { GroupName: string }[]).map((g) => g.GroupName)),
    );
    const groups = new Set(bflyt.groups.map((g) => g.name));
    for (const g of parsed.pat1?.Groups ?? []) if (!groups.has(g) && !added.has(g)) res.push({ file: anim.FileName, item: g, type: 'MissingGroup', severity: 'critical' });
    for (const e of parsed.pai1?.Entries ?? [])
      if (e.Target === 0 && !findPaneBfs(bflyt, e.Name)) res.push({ file: anim.FileName, item: e.Name, type: 'MissingPane', severity: 'critical', info: 'animation target' });
  }
  return res;
}
