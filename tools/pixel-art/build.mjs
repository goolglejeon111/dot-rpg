// 글자 격자(art/*.txt) + 팔레트(palette.json) → PNG
// 실행: npm run art
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG } from './png.mjs';
import { OUTPUTS } from './outputs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

// ---------- 팔레트 ----------
const paletteJson = JSON.parse(readFileSync(join(HERE, 'palette.json'), 'utf8'));
const palette = {};
for (const [ch, def] of Object.entries(paletteJson)) {
  if (ch.startsWith('_')) continue;
  if (ch.length !== 1) throw new Error(`팔레트 키는 한 글자여야 합니다: "${ch}"`);
  const hex = def.color.replace('#', '');
  palette[ch] = [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
    Math.round((def.alpha ?? 1) * 255),
  ];
}
if (Object.keys(palette).length > 48) throw new Error('팔레트는 48색 이내여야 합니다.');

// ---------- 그림 파일 읽기 ----------
/** art/*.txt 에서 [이름] 아래 격자들을 읽는다 */
function loadArt() {
  const art = {};
  const dir = join(HERE, 'art');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.txt'))) {
    const lines = readFileSync(join(dir, file), 'utf8').split(/\r?\n/);
    let name = null;
    let rows = [];
    const flush = () => {
      if (name) {
        if (art[name]) throw new Error(`그림 이름 중복: [${name}] (${file})`);
        const w = rows[0]?.length ?? 0;
        rows.forEach((r, i) => {
          if (r.length !== w) throw new Error(`[${name}] ${i + 1}번째 줄 길이가 ${r.length}입니다 (첫 줄은 ${w}) (${file})`);
          [...r].forEach((ch, x) => {
            if (ch !== '.' && !palette[ch]) throw new Error(`[${name}] ${i + 1}번째 줄 ${x + 1}번째 글자 "${ch}"는 팔레트에 없습니다 (${file})`);
          });
        });
        art[name] = rows;
      }
      name = null;
      rows = [];
    };
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (line.startsWith('#')) continue;
      const m = line.match(/^\[(.+)\]$/);
      if (m) {
        flush();
        name = m[1].trim();
      } else if (line === '') {
        if (rows.length) flush();
      } else if (name) {
        rows.push(line.trim());
      }
    }
    flush();
  }
  return art;
}

// ---------- 그리기 ----------
function blank(w, h) {
  return { w, h, px: new Uint8Array(w * h * 4) };
}

function drawLayer(img, art, layer, ox, oy) {
  const rows = art[layer.art];
  if (!rows) throw new Error(`없는 그림 이름: [${layer.art}]`);
  const lw = rows[0].length;
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < lw; x++) {
      let ch = rows[y][layer.flipX ? lw - 1 - x : x];
      if (layer.remap && layer.remap[ch]) ch = layer.remap[ch];
      if (ch === '.') continue;
      const tx = ox + (layer.x ?? 0) + x;
      const ty = oy + (layer.y ?? 0) + y;
      if (tx < 0 || ty < 0 || tx >= img.w || ty >= img.h) continue;
      const [r, g, b, a] = palette[ch];
      const i = (ty * img.w + tx) * 4;
      // 반투명 색은 아래 색 위에 섞는다
      const sa = a / 255;
      const da = img.px[i + 3] / 255;
      const oa = sa + da * (1 - sa);
      const mix = (s, d) => Math.round((s * sa + d * da * (1 - sa)) / (oa || 1));
      img.px[i] = mix(r, img.px[i]);
      img.px[i + 1] = mix(g, img.px[i + 1]);
      img.px[i + 2] = mix(b, img.px[i + 2]);
      img.px[i + 3] = Math.round(oa * 255);
    }
  }
}

/** 프레임 = 그림 이름 문자열, 또는 { layers: [...] } */
function normalize(frame) {
  if (typeof frame === 'string') return { layers: [{ art: frame }] };
  return frame;
}

function build(art, out) {
  const [cw, ch] = out.cell;
  const frames = out.frames.map(normalize);
  const cols = out.columns ?? frames.length;
  const rowsN = Math.ceil(frames.length / cols);
  const img = blank(cw * cols, ch * rowsN);
  frames.forEach((f, i) => {
    if (!f) return;
    const ox = (i % cols) * cw;
    const oy = Math.floor(i / cols) * ch;
    for (const layer of f.layers) drawLayer(img, art, { ...layer, flipX: layer.flipX ?? f.flipX }, ox, oy);
  });
  const path = join(ROOT, out.file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePNG(img.w, img.h, img.px));
  console.log(`  ${out.file}  (${img.w}x${img.h}, ${frames.length}칸)`);
  if (PREVIEW_DIR) writePreview(img, join(PREVIEW_DIR, out.file.split('/').pop()));
}

// --preview <폴더>: 확대 미리보기(체크무늬 배경)를 따로 저장
const pi = process.argv.indexOf('--preview');
const PREVIEW_DIR = pi > 0 ? resolve(process.argv[pi + 1]) : null;
function writePreview(img, path) {
  const s = Math.max(2, Math.min(8, Math.floor(640 / Math.max(img.w, img.h))));
  const w = img.w * s, h = img.h * s;
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (Math.floor(y / s) * img.w + Math.floor(x / s)) * 4;
    const bg = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 200 : 230;
    const a = img.px[si + 3] / 255;
    const o = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) px[o + c] = Math.round(img.px[si + c] * a + bg * (1 - a));
    px[o + 3] = 255;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePNG(w, h, px));
}

const art = loadArt();
console.log(`그림 ${Object.keys(art).length}개, 팔레트 ${Object.keys(palette).length}색`);
for (const out of OUTPUTS) build(art, out);
console.log('완료');
