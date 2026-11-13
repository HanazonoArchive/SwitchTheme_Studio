import { describe, expect, it } from "vitest";
import {
  applyRestingState,
  type MaterialOverride,
} from "../src/lib/layout/animState";
import { analyseMasks } from "../src/lib/layout/blend";
import { paneVisual } from "../src/lib/layout/textures";
import { cornerRadii } from "../src/lib/render/corners";
import type { BflytMaterial, BflytPane } from "../src/lib/nx/bflyt";
import type { SystemLayout } from "../src/lib/layout/systemLayouts";

/**
 * Gengar by rafa_c136 (Unison R Pastel Compact by petey): its top bar of pastel applet pills,
 * checked against the console screenshot shipped in the pack.
 */

const pane = (
  name: string,
  kind: BflytPane["kind"],
  materialIndex?: number,
  children: BflytPane[] = [],
): BflytPane =>
  ({
    kind,
    name,
    visible: true,
    alpha: 255,
    position: { X: 0, Y: 0, Z: 0 },
    rotation: { X: 0, Y: 0, Z: 0 },
    scale: { X: 1, Y: 1 },
    size: { X: 72, Y: 72 },
    originX: 0,
    originY: 0,
    parentOriginX: 0,
    parentOriginY: 0,
    materialIndex,
    children,
  }) as unknown as BflytPane;
const mat = (over: Partial<BflytMaterial>): BflytMaterial =>
  ({
    name: "m",
    black: "00000000",
    white: "FFFFFFFF",
    textures: [],
    ...over,
  }) as BflytMaterial;

const flvc = (name: string, rgb: [number, number, number]) =>
  JSON.stringify({
    pai1: {
      FrameSize: 12,
      Entries: [
        {
          Name: name,
          Target: 0,
          Tags: [
            {
              TagType: "FLVC",
              Entries: [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14].map((t) => ({
                AnimationTarget: t,
                KeyFrames: [
                  { Frame: 0, Value: 18, Blend: 0 },
                  { Frame: 3, Value: rgb[t & 3], Blend: 0 },
                ],
              })),
            },
          ],
        },
      ],
    },
  });

describe("Gengar top bar", () => {
  it("applies vertex colours from a theme animation at rest", () => {
    const root = pane("RootPane", "pan1", undefined, [
      pane("P_PictBase", "pic1", 0),
    ]);
    const sys = {
      animations: new Map([
        ["anim/RdtBtnCtrl_Inactive.bflan", new Uint8Array()],
      ]),
    } as unknown as SystemLayout;
    const layout = {
      Anims: [
        {
          FileName: "anim/RdtBtnCtrl_Inactive.bflan",
          AnimJson: flvc("P_PictBase", [173, 214, 195]),
        },
      ],
    };
    applyRestingState(
      root,
      sys,
      layout,
      "blyt/RdtBtnCtrl.bflyt",
      new Map<string, MaterialOverride>(),
    );
    const p = root.children[0];
    // AABBGGRR
    expect(p.colors?.TL).toBe("FFC3D6AD");
    expect(p.colors?.BR).toBe("FFC3D6AD");
  });

  it("keeps the material white when a theme sets C_W to 0, in Basic Black too", () => {
    const p = pane("P_PictBase", "pic1", 0);
    p.colors = {
      TL: "FFC3D6AD",
      TR: "FFC3D6AD",
      BL: "FFC3D6AD",
      BR: "FFC3D6AD",
    };
    (p as { userData?: Record<string, number[]> }).userData = {
      C_W: [0, 0, 0, 0],
    };
    expect(paneVisual(p, mat({}), new Map(), 10, 10, true)?.color).toBe(
      "rgba(173,214,195,1.000)",
    );
  });

  it("rounds corners after a non-uniform scale (a pill, not an ellipse)", () => {
    // 72×72 pane, radius 58, scale 2×1.3: 144×93.6 on screen, ends fully round (46.8).
    const [rx, ry] = cornerRadii(58, 72, 72, 2, 1.3);
    expect(rx * 2).toBeCloseTo(46.8);
    expect(ry * 1.3).toBeCloseTo(46.8);
    // Uniform scale: the plain clamped radius.
    expect(cornerRadii(58, 72, 72, 1.5, 1.5)).toEqual([36, 36]);
  });

  it("doesn't draw what a transparent mask writer masks (the Album fill)", () => {
    const materials = [
      mat({
        blend: { op: 1, src: 0, dst: 1 },
        blendAlpha: { op: 1, src: 4, dst: 0 },
      }),
      mat({ blend: { op: 1, src: 6, dst: 7 } }),
    ] as BflytMaterial[];
    const mask = pane("P_PictMask", "pic1", 0);
    mask.colors = {
      TL: "00FFFFFF",
      TR: "00FFFFFF",
      BL: "00FFFFFF",
      BR: "00FFFFFF",
    };
    const root = pane("RootPane", "pan1", undefined, [
      mask,
      pane("P_Color", "pic1", 1),
    ]);
    expect(analyseMasks(root, materials).hiddenTargets.has("P_Color")).toBe(
      true,
    );
    mask.colors = {
      TL: "FFFFFFFF",
      TR: "FFFFFFFF",
      BL: "FFFFFFFF",
      BR: "FFFFFFFF",
    };
    expect(analyseMasks(root, materials).hiddenTargets.has("P_Color")).toBe(
      false,
    );
  });
});

describe("animation resting frame", () => {
  it("stops at the frame count with Hermite between keys", async () => {
    const { curveValue, sampleCurve } = await import("../src/lib/nx/bflan");
    const c = {
      target: 1,
      keys: [
        { frame: 0, value: 120, blend: 0 },
        { frame: 12, value: 0, blend: 0 },
      ],
    };
    expect(curveValue(c, "end", 6)).toBeCloseTo(60);
    expect(curveValue(c, "end")).toBe(0);
    expect(curveValue(c, "start", 6)).toBe(120);
    expect(sampleCurve(c, 3)).toBeCloseTo(
      120 * (1 - (3 * 0.25 ** 2 - 2 * 0.25 ** 3)),
    );
  });
});
