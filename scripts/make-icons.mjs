// Generates the PWA PNG icons without extra dependencies (writes raw PNG with zlib).
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

function render(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * (size * 4 + 1));
  const green = [91, 127, 74], cream = [247, 241, 232], ring = [226, 208, 182], leaf = [91, 127, 74], bg = [247, 241, 232];
  const s = size / 512;
  for (let y = 0; y < size; y++) {
    px[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const X = x / s, Y = y / s;
      let col = bg, a = 0;
      // rounded square
      const r = maskable ? 0 : 112;
      const inRect = (() => {
        const dx = Math.max(r - X, 0, X - (512 - r));
        const dy = Math.max(r - Y, 0, Y - (512 - r));
        return dx * dx + dy * dy <= r * r;
      })();
      if (inRect) { col = green; a = 255; }
      const d = Math.hypot(X - 256, Y - 268);
      if (inRect && d <= 150) col = cream;
      if (inRect && Math.abs(d - 112) <= 5) col = ring;
      // leaf: ellipse rotated -35deg
      const ang = -0.6, lx = X - 256, ly = Y - 250;
      const rx = lx * Math.cos(ang) - ly * Math.sin(ang), ry = lx * Math.sin(ang) + ly * Math.cos(ang);
      if (inRect && (rx * rx) / (78 * 78) + (ry * ry) / (34 * 34) <= 1) col = leaf;
      if (inRect && Math.abs(ry) < 3 && Math.abs(rx) < 70) col = cream;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(px)), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync('public/icons/icon-192.png', render(192));
writeFileSync('public/icons/icon-512.png', render(512, { maskable: true }));
writeFileSync('public/icons/apple-touch-icon.png', render(180, { maskable: true }));
console.log('icons written');
