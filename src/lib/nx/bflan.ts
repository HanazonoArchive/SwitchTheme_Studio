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
/**
 * A curve's value at a frame: Hermite between keys (Blend is the slope per frame), held before
 * the first key and after the last. `step` curves (visibility, texture pattern) jump at keys.
 */
export function sampleCurve(c: Curve, frame: number, step = false): number | undefined {
  if (!c.keys.length) return undefined;
  const k = [...c.keys].sort((a, b) => a.frame - b.frame);
  if (frame <= k[0].frame) return k[0].value;
  const last = k[k.length - 1];
  if (frame >= last.frame) return last.value;
  let i = 0;
  while (i < k.length - 2 && k[i + 1].frame <= frame) i++;
  const a = k[i];
  const b = k[i + 1];
  if (step) return a.value;
  const d = b.frame - a.frame;
  if (d <= 0) return b.value;
  const t = (frame - a.frame) / d;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a.value + (t3 - 2 * t2 + t) * d * a.blend + (-2 * t3 + 3 * t2) * b.value + (t3 - t2) * d * b.blend;
}

/**
 * Where an animation rests: its first frame, or its last one. An animation stops at its frame
 * count even when keys go further (Gengar's Inactive is 6 frames long with a key at 12: the
 * unfocused icons stop halfway, 60 px up, as on the console).
 */
export function curveValue(c: Curve, at: 'start' | 'end', frameSize?: number, step = false): number | undefined {
  if (!c.keys.length) return undefined;
  if (at === 'start') return sampleCurve(c, 0, step) ?? undefined;
  if (frameSize === undefined || frameSize <= 0) return [...c.keys].sort((a, b) => a.frame - b.frame).pop()!.value;
  return sampleCurve(c, frameSize, step);
}
