import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { yaz0Decompress, yaz0StoreOnly } from '../src/lib/nx/yaz0';
import { buildSarc, parseSarc } from '../src/lib/nx/sarc';
import { flattenPanes, parseBflyt } from '../src/lib/nx/bflyt';
import { buildBflyt } from './helpers';

const enc = new TextEncoder();

describe('yaz0', () => {
  it('round-trips store-only streams', () => {
    const data = enc.encode('hello hello hello switch themes!');
    expect(yaz0Decompress(yaz0StoreOnly(data))).toEqual(data);
  });

  it('decodes back-references (short and long form)', () => {
    // "abc" literal, then copy 6 bytes from distance 3 => "abcabcabc"
    const short = new Uint8Array([0x59, 0x61, 0x7a, 0x30, 0, 0, 0, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0b11100000, 0x61, 0x62, 0x63, 0x40, 0x02]);
    expect(new TextDecoder().decode(yaz0Decompress(short))).toBe('abcabcabc');
    // "a" literal, then long form: count = 0x12 + 2 = 20 bytes from distance 1
    const long = new Uint8Array([0x59, 0x61, 0x7a, 0x30, 0, 0, 0, 21, 0, 0, 0, 0, 0, 0, 0, 0, 0b10000000, 0x61, 0x00, 0x00, 0x02]);
    expect(new TextDecoder().decode(yaz0Decompress(long))).toBe('a'.repeat(21));
  });
});

describe('sarc', () => {
  it('reads archives it wrote, compressed or not', () => {
    const files = { 'blyt/A.bflyt': enc.encode('one'), 'timg/__Combined.bntx': enc.encode('two two') };
    const sarc = buildSarc(files);
    for (const input of [sarc, yaz0StoreOnly(sarc)]) {
      const parsed = parseSarc(input);
      expect([...parsed.keys()].sort()).toEqual(Object.keys(files).sort());
      expect(new TextDecoder().decode(parsed.get('timg/__Combined.bntx'))).toBe('two two');
    }
  });
});

describe('bflyt', () => {
  it('parses the injector test layout', () => {
    const f = parseBflyt(readFileSync('tests/fixtures/bginjection.bflyt'));
    expect(f.version).toBe(0x09000000);
    expect(f.root?.name).toBe('RootPane');
    expect(f.root?.children.map((c) => c.name)).toEqual(['P_Bg_00']);
    const bg = f.byName.get('P_Bg_00')!;
    expect(bg.kind).toBe('pic1');
    expect(bg.size).toEqual({ X: 100, Y: 100 });
    expect(bg.colors).toBeDefined();
  });

  it('builds nested trees, origins and parts', () => {
    const data = buildBflyt({
      kind: 'pan1',
      name: 'RootPane',
      size: [1280, 720],
      children: [
        { kind: 'pan1', name: 'N_Group', pos: [10, -20], flag2: (1 << 6) | (2 << 4) | (2 << 2) | 1, children: [{ kind: 'pic1', name: 'P_Card' }] },
        { kind: 'prt1', name: 'L_Hud', partName: 'Hud', visible: false },
        // Real 23.x files: name longer than 24 chars, section ends right after it.
        { kind: 'prt1', name: 'L_Long', partName: 'RdtCloudBackupBtnSelectUser' },
      ],
    });
    const f = parseBflyt(data);
    expect(f.width).toBe(1280);
    const flat = flattenPanes(f.root).map((x) => `${x.depth}:${x.pane.name}`);
    expect(flat).toEqual(['0:RootPane', '1:N_Group', '2:P_Card', '1:L_Hud', '1:L_Long']);
    const g = f.byName.get('N_Group')!;
    expect(g.position).toEqual({ X: 10, Y: -20, Z: 0 });
    expect([g.originX, g.originY, g.parentOriginX, g.parentOriginY]).toEqual([1, 2, 2, 1]);
    expect(f.byName.get('P_Card')!.colors!.TL).toBe('FF0000FF');
    const hud = f.byName.get('L_Hud')!;
    expect(hud.visible).toBe(false);
    expect(hud.partName).toBe('Hud');
    expect(f.byName.get('L_Long')!.partName).toBe('RdtCloudBackupBtnSelectUser');
  });
});

