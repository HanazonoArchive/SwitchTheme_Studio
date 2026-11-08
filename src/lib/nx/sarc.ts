import { BinaryReader } from './binary';
import { isYaz0, yaz0Decompress } from './yaz0';

/** A SARC archive: file path -> bytes. SZS = Yaz0(SARC). */
export type SarcFiles = Map<string, Uint8Array>;

export function parseSarc(input: Uint8Array): SarcFiles {
  const data = isYaz0(input) ? yaz0Decompress(input) : input;
  const r = new BinaryReader(data, true);
  if (r.magic() !== 'SARC') throw new Error('Not a SARC/SZS archive');

  r.u16(); // header size
  const bom = r.view.getUint16(6, false);
  r.littleEndian = bom === 0xfffe;
  r.seek(0x0c);
  const dataStart = r.u32();
  r.u32(); // version + reserved

  if (r.magic() !== 'SFAT') throw new Error('Missing SFAT section');
  r.u16(); // header size
  const nodeCount = r.u16();
  r.u32(); // hash key

  const nodes: { nameOff: number | null; start: number; end: number; hash: number }[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const hash = r.u32();
    const attr = r.u32();
    const start = r.u32();
    const end = r.u32();
    const hasName = (attr >>> 24) === 1;
    nodes.push({ hash, nameOff: hasName ? (attr & 0xffff) * 4 : null, start, end });
  }

  if (r.magic() !== 'SFNT') throw new Error('Missing SFNT section');
  r.u16();
  r.u16();
  const namesStart = r.pos;

  const files: SarcFiles = new Map();
  for (const n of nodes) {
    let name: string;
    if (n.nameOff !== null) {
      r.seek(namesStart + n.nameOff);
      name = r.cString();
    } else {
      name = n.hash.toString(16).toUpperCase().padStart(8, '0') + '.bin';
    }
    files.set(name, data.subarray(dataStart + n.start, dataStart + n.end));
  }
  return files;
}

/** Writes a little-endian SARC with names (used by tests to build fixtures). */
export function buildSarc(files: Record<string, Uint8Array>): Uint8Array {
  const hashKey = 0x65;
  const nameHash = (name: string) => {
    let h = 0;
    for (const ch of new TextEncoder().encode(name)) h = (Math.imul(h, hashKey) + ch) >>> 0;
    return h;
  };
  const names = Object.keys(files).sort((a, b) => nameHash(a) - nameHash(b));
  const enc = new TextEncoder();

  const nameTable: number[] = [];
  const nameOffsets: number[] = [];
  for (const n of names) {
    nameOffsets.push(nameTable.length);
    nameTable.push(...enc.encode(n), 0);
    while (nameTable.length % 4) nameTable.push(0);
  }

  const headerSize = 0x14 + 0x0c + names.length * 16 + 8 + nameTable.length;
  const dataStart = Math.ceil(headerSize / 0x80) * 0x80;
  const ranges: [number, number][] = [];
  let cursor = 0;
  for (const n of names) {
    cursor = Math.ceil(cursor / 0x80) * 0x80;
    ranges.push([cursor, cursor + files[n].length]);
    cursor += files[n].length;
  }

  const out = new Uint8Array(dataStart + cursor);
  const v = new DataView(out.buffer);
  out.set(enc.encode('SARC'), 0);
  v.setUint16(4, 0x14, true);
  v.setUint16(6, 0xfeff, true);
  v.setUint32(8, out.length, true);
  v.setUint32(0x0c, dataStart, true);
  v.setUint32(0x10, 0x0100, true);
  let p = 0x14;
  out.set(enc.encode('SFAT'), p);
  v.setUint16(p + 4, 0x0c, true);
  v.setUint16(p + 6, names.length, true);
  v.setUint32(p + 8, hashKey, true);
  p += 0x0c;
  names.forEach((n, i) => {
    v.setUint32(p, nameHash(n), true);
    v.setUint32(p + 4, (0x01 << 24) | (nameOffsets[i] / 4), true);
    v.setUint32(p + 8, ranges[i][0], true);
    v.setUint32(p + 12, ranges[i][1], true);
    p += 16;
  });
  out.set(enc.encode('SFNT'), p);
  v.setUint16(p + 4, 8, true);
  p += 8;
  out.set(nameTable, p);
  names.forEach((n, i) => out.set(files[n], dataStart + ranges[i][0]));
  return out;
}
