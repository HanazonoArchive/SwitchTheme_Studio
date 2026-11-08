const enc = new TextEncoder();

/** Minimal BFLYT writer for tests: nested pan1/pic1/prt1 panes. */
type TPane = {
  kind: 'pan1' | 'pic1' | 'prt1';
  name: string;
  pos?: [number, number];
  scale?: [number, number];
  size?: [number, number];
  flag2?: number;
  visible?: boolean;
  partName?: string;
  children?: TPane[];
};
export function buildBflyt(root: TPane): Uint8Array {
  const sections: Uint8Array[] = [];
  const section = (magic: string, body: Uint8Array) => {
    const out = new Uint8Array(8 + body.length);
    out.set(enc.encode(magic));
    new DataView(out.buffer).setUint32(4, out.length, true);
    out.set(body, 8);
    sections.push(out);
  };
  const lyt = new Uint8Array(20);
  new DataView(lyt.buffer).setFloat32(4, 1280, true);
  new DataView(lyt.buffer).setFloat32(8, 720, true);
  section('lyt1', lyt);
  const pane = (p: TPane) => {
    const nameLen = p.partName ? Math.ceil((p.partName.length + 1) / 4) * 4 : 4;
    const extra = p.kind === 'pic1' ? 0x14 : p.kind === 'prt1' ? 12 + nameLen : 0;
    const body = new Uint8Array(0x4c + extra);
    const v = new DataView(body.buffer);
    body[0] = p.visible === false ? 0 : 1;
    body[1] = p.flag2 ?? 0;
    body[2] = 255;
    body.set(enc.encode(p.name), 4);
    v.setFloat32(0x24, p.pos?.[0] ?? 0, true);
    v.setFloat32(0x28, p.pos?.[1] ?? 0, true);
    v.setFloat32(0x3c, p.scale?.[0] ?? 1, true);
    v.setFloat32(0x40, p.scale?.[1] ?? 1, true);
    v.setFloat32(0x44, p.size?.[0] ?? 100, true);
    v.setFloat32(0x48, p.size?.[1] ?? 100, true);
    if (p.kind === 'pic1') body.set([255, 0, 0, 255], 0x4c); // TL = red
    if (p.kind === 'prt1') {
      v.setUint32(0x4c, 0, true);
      v.setFloat32(0x50, 1, true);
      v.setFloat32(0x54, 1, true);
      body.set(enc.encode(p.partName ?? ''), 0x58);
    }
    section(p.kind, body);
    if (p.children?.length) {
      section('pas1', new Uint8Array(0));
      p.children.forEach(pane);
      section('pae1', new Uint8Array(0));
    }
  };
  pane(root);
  const total = 0x14 + sections.reduce((n, s) => n + s.length, 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  out.set(enc.encode('FLYT'));
  v.setUint16(4, 0xfeff, true);
  v.setUint16(6, 0x14, true);
  v.setUint32(8, 0x08000000, true);
  v.setUint32(0x0c, total, true);
  v.setUint16(0x10, sections.length, true);
  let o = 0x14;
  for (const s of sections) {
    out.set(s, o);
    o += s.length;
  }
  return out;
}

