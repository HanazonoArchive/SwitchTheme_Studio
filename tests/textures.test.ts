import { describe, expect, it } from 'vitest';
import { decodeTexture, deswizzle, type BntxTexture } from '../src/lib/nx/bntx';
import { animationFromJson, curveValue } from '../src/lib/nx/bflan';
import { applyRestingState, restingAnimations } from '../src/lib/layout/animState';
import { themeColor } from '../src/lib/layout/textures';
import type { BflytPane } from '../src/lib/nx/bflyt';
import type { SystemLayout } from '../src/lib/layout/systemLayouts';

/** Inverse of deswizzle for tests: linear -> Tegra block linear. */
function swizzle(lin: Uint8Array, w: number, h: number, bpp: number, bhLog2: number) {
  const bh = 1 << bhLog2;
  const gobsX = Math.ceil((w * bpp) / 64);
  const gobsY = Math.ceil(h / (8 * bh)) * bh;
  const out = new Uint8Array(gobsX * gobsY * 512);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const xb = x * bpp;
      const gob = Math.floor(y / (8 * bh)) * 512 * bh * gobsX + Math.floor(xb / 64) * 512 * bh + Math.floor((y % (8 * bh)) / 8) * 512;
      const addr = gob + Math.floor((xb % 64) / 32) * 256 + Math.floor((y % 8) / 2) * 64 + Math.floor((xb % 32) / 16) * 32 + (y % 2) * 16 + (xb % 16);
      for (let i = 0; i < bpp; i++) out[addr + i] = lin[(y * w + x) * bpp + i];
    }
  return out;
}

const tex = (format: number, w: number, h: number, data: Uint8Array, channels: BntxTexture['channels'] = [2, 3, 4, 5], bhLog2 = 0): BntxTexture => ({
  name: 't',
  format,
  width: w,
  height: h,
  blockHeightLog2: bhLog2,
  channels,
  data,
});

describe('BNTX decoding', () => {
  it('deswizzles block-linear data for several block heights', () => {
    for (const [w, h, bpp, bh] of [[40, 20, 1, 0], [33, 70, 4, 2], [8, 8, 16, 1]]) {
      const lin = Uint8Array.from({ length: w * h * bpp }, (_, i) => (i * 7 + 3) & 255);
      expect(deswizzle(swizzle(lin, w, h, bpp, bh), w, h, bpp, bh)).toEqual(lin);
    }
  });

  it('decodes R8 with a channel mapping (mask in alpha, white RGB)', () => {
    const img = decodeTexture(tex(0x0201, 2, 1, swizzle(Uint8Array.from([0, 200]), 2, 1, 1, 0), [1, 1, 1, 2]))!;
    expect([...img.data]).toEqual([255, 255, 255, 0, 255, 255, 255, 200]);
  });

  it('decodes BC4 blocks (8-value and 6-value palettes)', () => {
    // endpoints 255,0 (8-value mode); all indices 1 -> value 0
    const block = Uint8Array.from([255, 0, 0b01001001, 0b10010010, 0b00100100, 0b01001001, 0b10010010, 0b00100100]);
    const img = decodeTexture(tex(0x1d01, 4, 4, swizzle(block, 1, 1, 8, 0)))!;
    expect(img.data[0]).toBe(0);
    expect(img.data[3]).toBe(255);
    // all indices 0 -> endpoint 0 = 255
    const block2 = Uint8Array.from([255, 0, 0, 0, 0, 0, 0, 0]);
    expect(decodeTexture(tex(0x1d01, 4, 4, swizzle(block2, 1, 1, 8, 0)))!.data[0]).toBe(255);
  });

  it('decodes BC1 color endpoints', () => {
    // c0 = pure red (0xF800), c1 = black, indices 0 -> red
    const block = Uint8Array.from([0x00, 0xf8, 0x00, 0x00, 0, 0, 0, 0]);
    const img = decodeTexture(tex(0x1a01, 4, 4, swizzle(block, 1, 1, 8, 0)))!;
    expect([...img.data.slice(0, 4)]).toEqual([255, 0, 0, 255]);
  });

  it('skips ASTC instead of drawing garbage', () => {
    expect(decodeTexture(tex(0x2d01, 4, 4, new Uint8Array(16)))).toBeNull();
  });
});

describe('animations and idle state', () => {
  const anim = (entries: object[]) => JSON.stringify({ pai1: { FrameSize: 10, Entries: entries } });
  const fade = (name: string, from: number, to: number) => ({
    Name: name,
    Target: 0,
    Tags: [{ TagType: 'FLVC', Entries: [{ AnimationTarget: 16, KeyFrames: [{ Frame: 0, Value: from, Blend: 0 }, { Frame: 10, Value: to, Blend: 0 }] }] }],
  });

  it('reads layout.json animation JSON', () => {
    const a = animationFromJson(anim([fade('N_Root', 0, 255)]));
    expect(a.entries[0].tags[0].type).toBe('FLVC');
    expect(curveValue(a.entries[0].tags[0].curves[0], 'start')).toBe(0);
    expect(curveValue(a.entries[0].tags[0].curves[0], 'end')).toBe(255);
  });

  const pane = (name: string, children: BflytPane[] = []): BflytPane => ({
    kind: 'pan1',
    name,
    visible: true,
    alpha: 255,
    influenceAlpha: false,
    originX: 0,
    originY: 0,
    parentOriginX: 0,
    parentOriginY: 0,
    position: { X: 0, Y: 0, Z: 0 },
    rotation: { X: 0, Y: 0, Z: 0 },
    scale: { X: 1, Y: 1 },
    size: { X: 10, Y: 10 },
    children,
  });

  // A home menu with only the animations we need; theme Anims stand in for stock .bflan files.
  const sys = {
    target: 'home',
    animations: new Map([
      ['anim/RdtBase_Enter.bflan', new Uint8Array()],
      ['anim/RdtBase_GameIn.bflan', new Uint8Array()],
      ['anim/RdtBalloonCtrl_Out.bflan', new Uint8Array()],
    ]),
  } as unknown as SystemLayout;

  it('idle recipe uses Enter and never the "game launching" fade', () => {
    expect(restingAnimations(sys, 'blyt/RdtBase.bflyt').map((s) => s.name)).toEqual(['anim/RdtBase_Enter.bflan']);
    expect(restingAnimations(sys, 'blyt/RdtBalloonCtrl.bflyt').map((s) => s.name)).toEqual(['anim/RdtBalloonCtrl_Out.bflan']);
  });

  it('applies the end state and hides runtime-only panes', () => {
    const root = pane('RootPane', [pane('N_Root'), pane('L_ChildLock')]);
    root.children[0].alpha = 0;
    const layout = { Anims: [{ FileName: 'anim/RdtBase_Enter.bflan', AnimJson: anim([fade('N_Root', 0, 255)]) }] };
    applyRestingState(root, sys, layout, 'blyt/RdtBase.bflyt', new Map());
    expect(root.children[0].alpha).toBe(255);
    expect(root.children[1].visible).toBe(false);
  });

  it('Basic Black recolours neutral UI but keeps accents', () => {
    expect(themeColor([0, 0, 0, 255], true)).toEqual([235, 235, 235, 255]);
    expect(themeColor([255, 255, 255, 255], true)).toEqual([70, 70, 70, 255]);
    expect(themeColor([230, 0, 18, 255], true)).toEqual([230, 0, 18, 255]);
    expect(themeColor([0, 0, 0, 255], false)).toEqual([0, 0, 0, 255]);
  });
});
