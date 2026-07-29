/**
 * Minimal WebP dimension reader so the host can validate spritesheet
 * geometry without any native image dependency. Supports the three container
 * layouts: VP8X (extended), VP8L (lossless), VP8 (lossy).
 */
export function readWebpSize(buf: Uint8Array): { width: number; height: number } | null {
  if (buf.length < 30) return null;
  const ascii = (off: number, len: number) => String.fromCharCode(...buf.subarray(off, off + len));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP') return null;

  const chunk = ascii(12, 4);
  if (chunk === 'VP8X') {
    // 10-byte payload after the 8-byte chunk header: 4 bytes flags/reserved,
    // then 24-bit little-endian (canvasWidth - 1) and (canvasHeight - 1).
    const w = 1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16));
    const h = 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16));
    return { width: w, height: h };
  }
  if (chunk === 'VP8L') {
    if (buf[20] !== 0x2f) return null; // VP8L signature byte
    const b0 = buf[21]!;
    const b1 = buf[22]!;
    const b2 = buf[23]!;
    const b3 = buf[24]!;
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height };
  }
  if (chunk === 'VP8 ') {
    // Key frame starts 3 bytes into the payload with signature 9d 01 2a,
    // then 16-bit LE width/height (low 14 bits each).
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
    const width = (buf[26]! | (buf[27]! << 8)) & 0x3fff;
    const height = (buf[28]! | (buf[29]! << 8)) & 0x3fff;
    return { width, height };
  }
  return null;
}
