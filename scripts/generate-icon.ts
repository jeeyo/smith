/**
 * Writes the logo files from src/shared/logo.ts: public/logo.svg, public/icon.png (1024 px,
 * the source for `tauri icon`) and docs/images/logo.png. PNGs are encoded here directly, so
 * no browser or image library is needed.
 *
 *   npm run icons
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { LOGO_PALETTE, LOGO_PIXELS, LOGO_SIZE, logoSvg } from '../src/shared/logo.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function hexToRgba(hex: string): [number, number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

/** Scales the pixel grid up with nearest-neighbour sampling and encodes an RGBA PNG. */
function logoPng(size: number): Buffer {
  const scale = size / LOGO_SIZE;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // no filter
    const row = LOGO_PIXELS[Math.floor(y / scale)];
    for (let x = 0; x < size; x++) {
      const color = LOGO_PALETTE[row[Math.floor(x / scale)]];
      const [r, g, b, a] = color ? hexToRgba(color) : [0, 0, 0, 0];
      raw.set([r, g, b, a], rowStart + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function write(rel: string, data: string | Buffer) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, data);
  console.log(`wrote ${rel}`);
}

write('public/logo.svg', logoSvg(256));
write('public/icon.png', logoPng(1024));
write('docs/images/logo.png', logoPng(240));
