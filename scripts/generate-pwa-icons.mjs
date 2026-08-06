import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";

const outputDir = path.resolve("public/icons");
const background = [30, 58, 95, 255];
const foreground = [247, 244, 238, 255];

function makeCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
}

const crcTable = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const projection = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared),
  );
  const nearestX = ax + projection * dx;
  const nearestY = ay + projection * dy;
  return Math.hypot(px - nearestX, py - nearestY);
}

function createIcon(size) {
  const stride = size * 4 + 1;
  const pixels = Buffer.alloc(stride * size);

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * stride;
    pixels[rowOffset] = 0;
    for (let x = 0; x < size; x += 1) {
      const normalizedX = (x + 0.5) / size;
      const normalizedY = (y + 0.5) / size;
      const leftArm = distanceToSegment(
        normalizedX,
        normalizedY,
        0.33,
        0.32,
        0.5,
        0.7,
      );
      const rightArm = distanceToSegment(
        normalizedX,
        normalizedY,
        0.67,
        0.32,
        0.5,
        0.7,
      );
      const color = Math.min(leftArm, rightArm) <= 0.047 ? foreground : background;
      const pixelOffset = rowOffset + 1 + x * 4;
      pixels.set(color, pixelOffset);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels, { level: 9 })),
    pngChunk("IEND"),
  ]);
}

const targets = [
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-maskable-512.png", 512],
];

await mkdir(outputDir, { recursive: true });
await Promise.all(
  targets.map(([name, size]) => writeFile(path.join(outputDir, name), createIcon(size))),
);

console.log(`Generated ${targets.length} PWA icons in ${outputDir}`);
