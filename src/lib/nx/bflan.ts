import { BinaryReader } from './binary';

/**
 * BFLAN animation reader (only what's needed to evaluate pane/material states).
 * Layout follows SwitchThemesCommon/Bflan/Bflan.cs; the JSON form used in layout.json
 * "Anims" (BflanSerializer) maps onto the same structure.
 */
export interface Keyframe {
  frame: number;
  value: number;
  blend: number;
}
export interface Curve {
  /** Which value inside the tag (e.g. FLPA 0=transX … 9=sizeY). */
  target: number;
  keys: Keyframe[];
}
export interface AnimTag {
  /** FLPA pane SRT, FLVI visibility, FLVC vertex colors/alpha, FLMC material colors, FLTP texture pattern … */
  type: string;
  curves: Curve[];
}
export interface AnimEntry {
  name: string;
  /** 0 pane, 1 material, 2 user data */
  target: number;
  tags: AnimTag[];
}
export interface Animation {
  frameSize: number;
  textures: string[];
  entries: AnimEntry[];
}

export function parseBflan(bytes: Uint8Array): Animation {
  const r = new BinaryReader(bytes, true);
  if (r.magic() !== 'FLAN') throw new Error('Not a BFLAN file');
  r.littleEndian = bytes[4] === 0xff;
  r.seek(0x10);
  const sectionCount = r.u16();
  let off = 0x14;
  const anim: Animation = { frameSize: 0, textures: [], entries: [] };
  for (let s = 0; s < sectionCount && off + 8 <= bytes.length; s++) {
    r.seek(off);
    const magic = r.magic();
    const len = r.u32();
    if (magic === 'pai1') readPai1(r, off, anim);
    off += len;
  }
  return anim;
}

function readPai1(r: BinaryReader, sec: number, anim: Animation) {
  r.seek(sec + 8);
  anim.frameSize = r.u16();
  r.u8();
  r.u8();
  const texCount = r.u16();
  const entryCount = r.u16();
  const entryTable = r.u32();
  const texTable = r.pos;
  const texOffsets = Array.from({ length: texCount }, () => r.u32());
  anim.textures = texOffsets.map((o) => {
    r.seek(texTable + o);
    return r.cString();
  });
  for (let i = 0; i < entryCount; i++) {
    r.seek(sec + entryTable + i * 4);
    const entryAt = sec + r.u32();
    r.seek(entryAt);
    const name = r.fixedString(28);
    const tagCount = r.u8();
    const target = r.u8();
    r.u16();
    const tagOffsets = Array.from({ length: tagCount }, () => r.u32());
    const tags: AnimTag[] = [];
    for (const to of tagOffsets) {
      let tagAt = entryAt + to;
      if (target === 2) tagAt += 4; // user-data tags have an extra leading u32
      r.seek(tagAt);
      const type = r.magic();
      const curveCount = r.u32();
      const curveOffsets = Array.from({ length: curveCount }, () => r.u32());
      const curves: Curve[] = [];
      for (const co of curveOffsets) {
        const cAt = tagAt + co;
        r.seek(cAt);
        r.u8(); // index
        const ctarget = r.u8();
        const dataType = r.u16();
        const keyCount = r.u16();
        r.u16();
        const keysAt = cAt + r.u32();
        r.seek(keysAt);
        const keys: Keyframe[] = [];
        for (let k = 0; k < keyCount; k++) {
          const frame = r.f32();
          if (dataType === 2) keys.push({ frame, value: r.f32(), blend: r.f32() });
          else keys.push({ frame, value: r.i16(), blend: r.i16() });
        }
        curves.push({ target: ctarget, keys });
      }
      tags.push({ type, curves });
    }
    anim.entries.push({ name, target, tags });
  }
}

/** layout.json "AnimJson" (BflanSerializer output) into the same structure. */
export function animationFromJson(json: string): Animation {
  const j = JSON.parse(json) as {
    pai1?: {
      FrameSize?: number;
      Textures?: string[];
      Entries?: { Name: string; Target: number; Tags?: { TagType: string; Entries?: { AnimationTarget: number; KeyFrames?: { Frame: number; Value: number; Blend: number }[] }[] }[] }[];
    };
  };
  const p = j.pai1 ?? {};
  return {
    frameSize: p.FrameSize ?? 0,
    textures: p.Textures ?? [],
    entries: (p.Entries ?? []).map((e) => ({
      name: e.Name,
      target: e.Target,
      tags: (e.Tags ?? []).map((t) => ({
        type: t.TagType,
        curves: (t.Entries ?? []).map((c) => ({ target: c.AnimationTarget, keys: (c.KeyFrames ?? []).map((k) => ({ frame: k.Frame, value: k.Value, blend: k.Blend })) })),
      })),
    })),
  };
}

/** Value of a curve at its start or end (resting states only need the extremes). */
export function curveValue(c: Curve, at: 'start' | 'end'): number | undefined {
  if (!c.keys.length) return undefined;
  const sorted = [...c.keys].sort((a, b) => a.frame - b.frame);
  return at === 'start' ? sorted[0].value : sorted[sorted.length - 1].value;
}
