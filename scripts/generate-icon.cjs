/**
 * Gera o ícone do app (a forma de "pulso" da marca) em PNG, sem dependências:
 * rasteriza a polilinha por distância a segmentos (cantos/pontas arredondados
 * saem de graça) e codifica o PNG com o zlib nativo do Node.
 *
 * Saídas:
 *   assets/icon.png          (1024)      — mestre p/ @capacitor/assets (Android)
 *   assets/splash.png        (2732)      — splash claro (fundo da marca)
 *   assets/splash-dark.png   (2732)      — splash escuro (mesmo visual)
 *   build/icon.png           (1024)      — electron-builder lê daqui (Windows)
 *
 * Uso: node scripts/generate-icon.cjs
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 1024;
const BG = [0x0f, 0x0f, 0x14]; // fundo escuro da marca
const FG = [0xff, 0xd2, 0x3f]; // amarelo de destaque
const STROKE = 70; // largura do traço no espaço 1024
const HALF = STROKE / 2;

// forma do pulso (coords no espaço 1024) — flat, pico, vale fundo, pico alto, dip, flat
const PTS = [
  [190, 512],
  [360, 512],
  [445, 340],
  [540, 760],
  [650, 250],
  [730, 620],
  [775, 512],
  [834, 512],
];

/** distância do ponto (px,py) ao segmento a-b */
function distSeg(px, py, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = px - a[0];
  const wy = py - a[1];
  const len2 = vx * vx + vy * vy || 1;
  let t = (wx * vx + wy * vy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (a[0] + t * vx);
  const dy = py - (a[1] + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Cobertura do traço no ponto (px,py) do espaço 1024, com o pulso reposicionado
 * por `frac` (fração da largura que o pulso ocupa) centrado no quadro.
 */
function coverageAt(px, py, frac) {
  const s = frac; // escala do desenho (1 = ícone cheio)
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const half = HALF * s;
  let d = Infinity;
  for (let i = 1; i < PTS.length; i++) {
    const a = [cx + (PTS[i - 1][0] - cx) * s, cy + (PTS[i - 1][1] - cy) * s];
    const b = [cx + (PTS[i][0] - cx) * s, cy + (PTS[i][1] - cy) * s];
    d = Math.min(d, distSeg(px, py, a, b));
  }
  return Math.max(0, Math.min(1, half - d + 0.5));
}

function render(size, frac) {
  const scale = size / SIZE;
  const raw = Buffer.alloc((size * 4 + 1) * size); // RGBA + 1 byte de filtro/linha
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filtro None
    for (let x = 0; x < size; x++) {
      const cov = coverageAt((x + 0.5) / scale, (y + 0.5) / scale, frac);
      const o = rowStart + 1 + x * 4;
      raw[o] = Math.round(BG[0] + (FG[0] - BG[0]) * cov);
      raw[o + 1] = Math.round(BG[1] + (FG[1] - BG[1]) * cov);
      raw[o + 2] = Math.round(BG[2] + (FG[2] - BG[2]) * cov);
      raw[o + 3] = 255; // opaco
    }
  }
  return encodePng(raw, size, size);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

function encodePng(raw, w, h) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const root = path.join(__dirname, '..');
function write(rel, buf) {
  const dest = path.join(root, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  console.log(`escrito ${rel} (${buf.length} bytes)`);
}

const icon = render(SIZE, 1); // pulso cheio no ícone
write('assets/icon.png', icon);
write('build/icon.png', icon);

// splash: pulso pequeno centrado (~34% da largura) sobre o fundo da marca
const splash = render(2732, 0.34);
write('assets/splash.png', splash);
write('assets/splash-dark.png', splash);
