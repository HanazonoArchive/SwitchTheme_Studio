import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { EXPECTED_FILES, isConsoleDumpZip, readConsoleDump } from '../src/lib/layout/consoleDump';

const zipOf = async (files: Record<string, string>) => {
  const z = new JSZip();
  for (const [p, c] of Object.entries(files)) z.file(p, c);
  return new File([await z.generateAsync({ type: 'uint8array' })], 'extracted.zip');
};

describe('console dump', () => {
  it('reads the zipped "extracted" folder with ver.cfg', async () => {
    const f = await zipOf({
      'extracted/ver.cfg': '23.0.1',
      'extracted/qlaunch/lyt/ResidentMenu.szs': 'a',
      'extracted/qlaunch/lyt/common.szs': 'b',
      'extracted/mypage/lyt/MyPage.szs': 'c',
      'extracted/playerselect/lyt/psl.szs': 'd',
      '__MACOSX/extracted/._ver.cfg': 'x',
      'extracted/readme.txt': 'x',
    });
    const d = await readConsoleDump([f]);
    expect(d.version).toBe('23.0.1');
    expect(d.szs.map((s) => s.name).sort()).toEqual(['MyPage.szs', 'Psl.szs', 'ResidentMenu.szs', 'common.szs']);
    expect(d.ignored).toEqual(['extracted/readme.txt']);
    expect(await isConsoleDumpZip(f)).toBe(true);
  });

  it('tells a theme zip from a dump', async () => {
    expect(await isConsoleDumpZip(await zipOf({ 'My theme.nxtheme': 'x' }))).toBe(false);
  });

  it('expects the eight files NXThemes Installer extracts', () => {
    expect(EXPECTED_FILES.map((f) => f.file)).toHaveLength(8);
  });
});
