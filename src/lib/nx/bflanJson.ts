import { BinaryReader } from './binary';

/**
 * A BFLAN file in the JSON form layout.json "Anims" use (SwitchThemesCommon BflanSerializer):
 * every field the installer needs to rebuild the binary. Used to start a theme animation from
 * the console's own file (so its stock keys are kept) and add to it.
 * Layout follows SwitchThemesCommon/Bflan/Bflan.cs (Pat1Section, Pai1Section).
 */

export interface BflanKeyJson {
  Frame: number;
  Value: number;
  Blend: number;
}
export interface BflanCurveJson {
  Index: number;
  AnimationTarget: number;
  DataType: number;
  KeyFrames: BflanKeyJson[];
  FLEUUnknownInt: number;
  FLEUEntryName: string;
}
export interface BflanTagJson {
  Unknown: number;
  TagType: string;
  Entries: BflanCurveJson[];
}
export interface BflanEntryJson {
  Name: string;
  Target: number;
  Tags: BflanTagJson[];
  /** Base64. */
  UnkwnownData: string;
}
export interface BflanJson {
  LittleEndian: boolean;
  Version: number;
  pat1: {
    AnimationOrder: number;
    Name: string;
    ChildBinding: number;
    Groups: string[];
    Unk_StartOfFile: number;
    Unk_EndOfFile: number;
    /** Base64. */
    Unk_EndOfHeader: string;
  };
  pai1: { FrameSize: number; Flags: number; Textures: string[]; Entries: BflanEntryJson[] };
}

const b64 = (u: Uint8Array) => {
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
};

const GROUP_NAME_LEN = 0x24;

export function bflanToJson(bytes: Uint8Array): BflanJson {
  const r = new BinaryReader(bytes, true);
  if (r.magic() !== 'FLAN') throw new Error('Not a BFLAN file');
  const little = bytes[4] === 0xff;
  r.littleEndian = little;
  r.seek(0x08);
  const version = r.u32();
  r.seek(0x10);
  const sectionCount = r.u16();
  let off = 0x14;
  const out: BflanJson = {
    LittleEndian: little,
    Version: version,
    pat1: { AnimationOrder: 0, Name: '', ChildBinding: 0, Groups: [], Unk_StartOfFile: 0, Unk_EndOfFile: 0, Unk_EndOfHeader: '' },
    pai1: { FrameSize: 0, Flags: 0, Textures: [], Entries: [] },
  };
  for (let s = 0; s < sectionCount && off + 8 <= bytes.length; s++) {
    r.seek(off);
    const magic = r.magic();
    const len = r.u32();
    const data = off + 8;
    if (magic === 'pat1') {
      r.seek(data);
      out.pat1.AnimationOrder = r.u16();
      const groupCount = r.u16();
      const nameOff = r.u32() - 8;
      const groupsOff = r.u32() - 8;
      out.pat1.Unk_StartOfFile = r.u16();
      out.pat1.Unk_EndOfFile = r.u16();
      out.pat1.ChildBinding = r.u8();
      const here = r.pos - data;
      out.pat1.Unk_EndOfHeader = b64(bytes.slice(data + here, data + nameOff));
      r.seek(data + nameOff);
      out.pat1.Name = r.cString();
      for (let g = 0; g < groupCount; g++) {
        r.seek(data + groupsOff + g * GROUP_NAME_LEN);
        out.pat1.Groups.push(r.fixedString(GROUP_NAME_LEN));
      }
    } else if (magic === 'pai1') {
      r.seek(data);
      out.pai1.FrameSize = r.u16();
      out.pai1.Flags = r.u8();
      r.u8();
      const texCount = r.u16();
      const entryCount = r.u16();
      const entryTable = r.u32() - 8;
      if (texCount) {
        const start = r.pos;
        const offs = Array.from({ length: texCount }, () => r.u32());
        for (const o of offs) {
          r.seek(start + o);
          out.pai1.Textures.push(r.cString());
        }
      }
      for (let i = 0; i < entryCount; i++) {
        r.seek(data + entryTable + i * 4);
        out.pai1.Entries.push(readEntry(r, bytes, data + r.u32() - 8));
      }
    }
    off += len;
  }
  return out;
}

function readEntry(r: BinaryReader, bytes: Uint8Array, start: number): BflanEntryJson {
  r.seek(start);
  const name = r.fixedString(28);
  const tagCount = r.u8();
  const target = r.u8();
  r.u16();
  const tagOffs = Array.from({ length: tagCount }, () => r.u32());
  const e: BflanEntryJson = { Name: name, Target: target, Tags: [], UnkwnownData: '' };
  if (!tagCount) return e;
  e.UnkwnownData = b64(bytes.slice(r.pos, start + tagOffs[0]));
  for (const o of tagOffs) {
    r.seek(start + o);
    const unknown = target === 2 ? r.u32() : 0;
    const tagStart = r.pos;
    const type = r.magic();
    const count = r.u32();
    const offs = Array.from({ length: count }, () => r.u32());
    const tag: BflanTagJson = { Unknown: unknown, TagType: type, Entries: [] };
    for (const eo of offs) {
      r.seek(tagStart + eo);
      const cs = r.pos;
      const c: BflanCurveJson = { Index: r.u8(), AnimationTarget: r.u8(), DataType: r.u16(), KeyFrames: [], FLEUUnknownInt: 0, FLEUEntryName: '' };
      const keyCount = r.u16();
      r.u16();
      r.seek(cs + r.u32());
      for (let k = 0; k < keyCount; k++) {
        const Frame = r.f32();
        if (c.DataType === 2) c.KeyFrames.push({ Frame, Value: r.f32(), Blend: r.f32() });
        else c.KeyFrames.push({ Frame, Value: r.i16(), Blend: r.i16() });
      }
      if (type === 'FLEU') {
        c.FLEUUnknownInt = r.u32();
        c.FLEUEntryName = r.cString();
      }
      tag.Entries.push(c);
    }
    e.Tags.push(tag);
  }
  return e;
}
