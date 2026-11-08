/**
 * Yaz0 decompression. SZS files on the Switch are Yaz0-compressed SARC archives.
 * Header: "Yaz0" + u32 BE uncompressed size + 8 reserved bytes, then the coded stream.
 */
export function isYaz0(data: Uint8Array) {
  return data.length >= 16 && data[0] === 0x59 && data[1] === 0x61 && data[2] === 0x7a && data[3] === 0x30;
}

export function yaz0Decompress(src: Uint8Array): Uint8Array {
  if (!isYaz0(src)) throw new Error('Not a Yaz0 stream');
  const size = ((src[4] << 24) | (src[5] << 16) | (src[6] << 8) | src[7]) >>> 0;
  const dst = new Uint8Array(size);
  let s = 16;
  let d = 0;

  while (d < size) {
    if (s >= src.length) throw new Error('Yaz0 stream ended early');
    const header = src[s++];
    for (let bit = 7; bit >= 0 && d < size; bit--) {
      if (header & (1 << bit)) {
        dst[d++] = src[s++];
      } else {
        const b1 = src[s++];
        const b2 = src[s++];
        const dist = (((b1 & 0x0f) << 8) | b2) + 1;
        let count = b1 >> 4;
        if (count === 0) count = src[s++] + 0x12;
        else count += 2;
        let from = d - dist;
        if (from < 0) throw new Error('Yaz0 back-reference out of range');
        for (let i = 0; i < count && d < size; i++) dst[d++] = dst[from++];
      }
    }
  }
  return dst;
}

/**
 * Store-only Yaz0 encoder (every byte is a literal). Valid output that any Yaz0
 * reader accepts; used by tests and as a fallback when size doesn't matter.
 */
export function yaz0StoreOnly(data: Uint8Array): Uint8Array {
  const groups = Math.ceil(data.length / 8);
  const out = new Uint8Array(16 + groups + data.length);
  out.set([0x59, 0x61, 0x7a, 0x30]);
  out[4] = (data.length >>> 24) & 0xff;
  out[5] = (data.length >>> 16) & 0xff;
  out[6] = (data.length >>> 8) & 0xff;
  out[7] = data.length & 0xff;
  let o = 16;
  for (let i = 0; i < data.length; i += 8) {
    const n = Math.min(8, data.length - i);
    out[o++] = (0xff << (8 - n)) & 0xff;
    out.set(data.subarray(i, i + n), o);
    o += n;
  }
  return out;
}
