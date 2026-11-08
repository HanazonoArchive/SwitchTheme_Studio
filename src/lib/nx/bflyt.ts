import { BinaryReader } from './binary';

/**
 * BFLYT reader. Only reads what a theme editor needs: the pane tree with each pane's
 * transform, size, origins, visibility, vertex colors and (for text panes) the text.
 * Layout follows SwitchThemesCommon/Bflyt in exelix11/SwitchThemeInjector.
 */

export type PaneKind = 'pan1' | 'pic1' | 'txt1' | 'wnd1' | 'bnd1' | 'prt1';

/** 0 = center, 1 = left/top, 2 = right/bottom (same encoding as layout.json OriginX/OriginY). */
export type Origin = 0 | 1 | 2;

export interface Vec2 {
  X: number;
  Y: number;
}
export interface Vec3 {
  X: number;
  Y: number;
  Z: number;
}

export interface BflytPane {
  kind: PaneKind;
  name: string;
  visible: boolean;
  alpha: number;
  influenceAlpha: boolean;
  originX: Origin;
  originY: Origin;
  parentOriginX: Origin;
  parentOriginY: Origin;
  position: Vec3;
  rotation: Vec3;
  scale: Vec2;
  size: Vec2;
  /** pic1: vertex colors as "AABBGGRR" hex strings (layout.json format). */
  colors?: { TL: string; TR: string; BL: string; BR: string };
  /** txt1 */
  text?: string;
  fontColor?: string;
  fontSize?: Vec2;
  textAlignX?: Origin;
  /** prt1: name of the layout this part instantiates (without blyt/ and extension). */
  partName?: string;
  partScale?: Vec2;
  children: BflytPane[];
}

export interface BflytFile {
  version: number;
  width: number;
  height: number;
  root: BflytPane | null;
  groups: { name: string; panes: string[] }[];
  textures: string[];
  /** Every pane by name (first wins on duplicates, as in the injector's FindPane). */
  byName: Map<string, BflytPane>;
}

const PANE_KINDS = new Set(['pan1', 'pic1', 'txt1', 'wnd1', 'bnd1', 'prt1']);

/** RGBA bytes -> layout.json color string (little-endian uint as 8 hex digits, i.e. AABBGGRR). */
function colorString(r: BinaryReader) {
  const R = r.u8();
  const G = r.u8();
  const B = r.u8();
  const A = r.u8();
  const n = (R | (G << 8) | (B << 16) | (A << 24)) >>> 0;
  return n.toString(16).toUpperCase().padStart(8, '0');
}

function readPane(r: BinaryReader, kind: PaneKind, sectionStart: number, sectionEnd: number, version: number): BflytPane {
  const d = sectionStart + 8;
  r.seek(d);
  const flag1 = r.u8();
  const flag2 = r.u8();
  const alpha = r.u8();
  r.u8();
  const name = r.fixedString(0x18);
  r.fixedString(0x08); // user info
  const position = { X: r.f32(), Y: r.f32(), Z: r.f32() };
  const rotation = { X: r.f32(), Y: r.f32(), Z: r.f32() };
  const scale = { X: r.f32(), Y: r.f32() };
  const size = { X: r.f32(), Y: r.f32() };

  const pane: BflytPane = {
    kind,
    name,
    visible: (flag1 & 1) === 1,
    influenceAlpha: (flag1 & 2) === 2,
    alpha,
    originX: ((flag2 >> 6) & 3) as Origin,
    originY: ((flag2 >> 4) & 3) as Origin,
    parentOriginX: ((flag2 >> 2) & 3) as Origin,
    parentOriginY: (flag2 & 3) as Origin,
    position,
    rotation,
    scale,
    size,
    children: [],
  };

  try {
    if (kind === 'pic1') {
      r.seek(sectionStart + 0x54);
      pane.colors = { TL: colorString(r), TR: colorString(r), BL: colorString(r), BR: colorString(r) };
    } else if (kind === 'txt1') {
      r.seek(sectionStart + 0x54);
      const textLength = r.u16();
      r.u16(); // restricted length
      r.u16(); // material
      r.u16(); // font
      const align = r.u8();
      pane.textAlignX = ((align >> 2) & 3) as Origin;
      r.u8();
      r.u8();
      r.u8();
      r.f32(); // italic
      const textOffset = r.u32();
      pane.fontColor = colorString(r);
      colorString(r);
      pane.fontSize = { X: r.f32(), Y: r.f32() };
      if (textOffset !== 0 && textLength > 0 && sectionStart + textOffset + textLength <= sectionEnd) {
        const bytes = r.slice(sectionStart + textOffset, sectionStart + textOffset + textLength);
        pane.text = new TextDecoder(r.littleEndian ? 'utf-16le' : 'utf-16be').decode(bytes).replace(/\0+$/, '');
      }
    } else if (kind === 'prt1') {
      r.seek(sectionStart + 0x54);
      const count = r.u32();
      pane.partScale = { X: r.f32(), Y: r.f32() };
      r.pos += count * (24 + 4 + 12);
      if (version >= 0x08000000 && r.pos + 24 <= sectionEnd) pane.partName = r.fixedString(24);
    }
  } catch {
    // Pane-specific data is best effort; the base transform is what matters.
  }
  return pane;
}

export function parseBflyt(data: Uint8Array): BflytFile {
  const r = new BinaryReader(data, true);
  if (r.magic() !== 'FLYT') throw new Error('Not a BFLYT file');
  r.littleEndian = r.view.getUint16(4, true) === 0xfeff;
  r.seek(6);
  const headerSize = r.u16();
  const version = r.u32();
  r.u32(); // file size
  const sectionCount = r.u16();

  const file: BflytFile = {
    version,
    width: 1280,
    height: 720,
    root: null,
    groups: [],
    textures: [],
    byName: new Map(),
  };

  const paneStack: BflytPane[] = [];
  let lastPane: BflytPane | null = null;
  let groupDepth = 0;

  let off = headerSize;
  for (let i = 0; i < sectionCount && off + 8 <= data.length; i++) {
    r.seek(off);
    const magic = r.magic();
    const len = r.u32();
    if (len < 8) break;
    const end = off + len;

    if (magic === 'lyt1') {
      r.seek(off + 8);
      r.u8();
      r.pos += 3;
      file.width = r.f32();
      file.height = r.f32();
    } else if (magic === 'txl1') {
      r.seek(off + 8);
      const count = r.u16();
      r.u16();
      const base = r.pos;
      const offsets = Array.from({ length: count }, () => r.u32());
      for (const o of offsets) {
        r.seek(base + o);
        file.textures.push(r.cString());
      }
    } else if (PANE_KINDS.has(magic)) {
      const pane = readPane(r, magic as PaneKind, off, end, version);
      if (paneStack.length === 0) {
        if (!file.root) file.root = pane;
      } else {
        paneStack[paneStack.length - 1].children.push(pane);
      }
      if (!file.byName.has(pane.name)) file.byName.set(pane.name, pane);
      lastPane = pane;
    } else if (magic === 'pas1') {
      if (lastPane) paneStack.push(lastPane);
    } else if (magic === 'pae1') {
      paneStack.pop();
      lastPane = paneStack[paneStack.length - 1] ?? null;
    } else if (magic === 'grs1') {
      groupDepth++;
    } else if (magic === 'gre1') {
      groupDepth = Math.max(0, groupDepth - 1);
    } else if (magic === 'grp1') {
      r.seek(off + 8);
      let name: string;
      let count: number;
      if (version >= 0x05020000) {
        name = r.fixedString(34);
        count = r.u16();
      } else {
        name = r.fixedString(24);
        count = r.u16();
        r.u16();
      }
      const panes: string[] = [];
      for (let p = 0; p < count && r.pos + 24 <= end; p++) panes.push(r.fixedString(24));
      file.groups.push({ name, panes });
    }

    off = end;
  }

  return file;
}

/** Depth-first list of every pane with its parent chain, for pane browsers. */
export function flattenPanes(root: BflytPane | null): { pane: BflytPane; depth: number; path: string[] }[] {
  const out: { pane: BflytPane; depth: number; path: string[] }[] = [];
  const walk = (p: BflytPane, depth: number, path: string[]) => {
    out.push({ pane: p, depth, path });
    for (const c of p.children) walk(c, depth + 1, [...path, p.name]);
  };
  if (root) walk(root, 0, []);
  return out;
}
