/** Minimal little/big-endian binary reader used by the SARC, Yaz0 and BFLYT parsers. */
export class BinaryReader {
  readonly view: DataView;
  readonly bytes: Uint8Array;
  pos = 0;
  littleEndian: boolean;

  constructor(data: Uint8Array, littleEndian = true) {
    this.bytes = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.littleEndian = littleEndian;
  }

  get length() {
    return this.bytes.byteLength;
  }

  seek(pos: number) {
    this.pos = pos;
    return this;
  }

  u8() {
    return this.view.getUint8(this.pos++);
  }
  u16() {
    const v = this.view.getUint16(this.pos, this.littleEndian);
    this.pos += 2;
    return v;
  }
  i16() {
    const v = this.view.getInt16(this.pos, this.littleEndian);
    this.pos += 2;
    return v;
  }
  u32() {
    const v = this.view.getUint32(this.pos, this.littleEndian);
    this.pos += 4;
    return v;
  }
  i32() {
    const v = this.view.getInt32(this.pos, this.littleEndian);
    this.pos += 4;
    return v;
  }
  f32() {
    const v = this.view.getFloat32(this.pos, this.littleEndian);
    this.pos += 4;
    return v;
  }

  /** Reads `len` bytes as ASCII, stopping at the first NUL but always advancing `len` bytes. */
  fixedString(len: number) {
    const start = this.pos;
    this.pos += len;
    let s = '';
    for (let i = start; i < start + len; i++) {
      const c = this.bytes[i];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }

  /** Reads a NUL-terminated ASCII/UTF-8 string from the current position. */
  cString() {
    const start = this.pos;
    while (this.pos < this.bytes.length && this.bytes[this.pos] !== 0) this.pos++;
    const s = new TextDecoder().decode(this.bytes.subarray(start, this.pos));
    this.pos++; // skip NUL
    return s;
  }

  magic() {
    return this.fixedString(4);
  }

  slice(start: number, end: number) {
    return this.bytes.subarray(start, end);
  }
}
