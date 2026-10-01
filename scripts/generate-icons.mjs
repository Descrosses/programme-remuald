/**
 * Génère les icônes PWA — aucune dépendance, aucun binaire téléchargé.
 *
 *   node scripts/generate-icons.mjs
 *
 * Motif : une barre chargée, vue de face. Que des rectangles, donc rastérisable
 * à la main. Fond sombre identique à celui de l'appli (--bg) pour que l'icône
 * ne jure pas avec l'écran de démarrage.
 *
 * iOS exige du PNG pour l'icône d'écran d'accueil : c'est la raison d'être de
 * ce script plutôt qu'un simple SVG.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BG = [0x0b, 0x2a, 0x4a]; // bleu nuit — distingue l'icône de Remuald de l'appli d'origine
const BAR = [0x3e, 0xc7, 0xff]; // bleu clair
const PLATE = [0xf4, 0xf7, 0xfa]; // --ink

/** Icônes à produire : [nom, taille, marge relative]. */
const TARGETS = [
  ['icon-192.png', 192, 0.14],
  ['icon-512.png', 512, 0.14],
  // Maskable : Android rogne jusqu'à 20 % sur chaque bord, d'où la marge large.
  ['icon-maskable-512.png', 512, 0.26],
  ['apple-touch-icon.png', 180, 0.12],
];

function drawBarbell(size, margin) {
  const px = new Uint8Array(size * size * 3);

  // Fond
  for (let i = 0; i < size * size; i++) {
    px[i * 3] = BG[0];
    px[i * 3 + 1] = BG[1];
    px[i * 3 + 2] = BG[2];
  }

  const rect = (x0, y0, w, h, color) => {
    for (let y = Math.round(y0); y < Math.round(y0 + h); y++) {
      if (y < 0 || y >= size) continue;
      for (let x = Math.round(x0); x < Math.round(x0 + w); x++) {
        if (x < 0 || x >= size) continue;
        const i = (y * size + x) * 3;
        px[i] = color[0];
        px[i + 1] = color[1];
        px[i + 2] = color[2];
      }
    }
  };

  const m = size * margin;
  const inner = size - 2 * m;
  const cy = size / 2;

  // La barre
  rect(m, cy - inner * 0.05, inner, inner * 0.1, BAR);

  // Deux disques de chaque côté, le plus gros à l'intérieur
  const plateW = inner * 0.11;
  const gap = inner * 0.035;
  const heights = [0.62, 0.42];

  heights.forEach((h, i) => {
    const offset = m + inner * 0.08 + i * (plateW + gap);
    rect(offset, cy - (inner * h) / 2, plateW, inner * h, PLATE);
    rect(size - offset - plateW, cy - (inner * h) / 2, plateW, inner * h, PLATE);
  });

  return px;
}

// --- encodage PNG minimal (couleur vraie 8 bits, sans canal alpha) ----------

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 2; // couleur vraie RGB
  // 10-12 : compression, filtre, entrelacement — tous à 0

  // Une ligne = un octet de filtre (0) puis les pixels.
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const dst = y * (1 + size * 3);
    raw[dst] = 0;
    Buffer.from(rgb.buffer, y * size * 3, size * 3).copy(raw, dst + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const [name, size, margin] of TARGETS) {
  const png = encodePng(size, drawBarbell(size, margin));
  writeFileSync(join(OUT, name), png);
  console.log(`${name.padEnd(26)} ${size}×${size}  ${png.length} octets`);
}
