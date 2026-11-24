// 황궁 이동 맵 도트 생성기: 바닥·벽 타일, 살펴볼 수 있는 물건(초상화, 깃발, 갑옷 등)
// 실행: npm run art:palace  (이 파일을 실행한 뒤 build.mjs로 PNG를 만든다)
//
// 만드는 파일
//   art/palace.txt          글자 격자 (다시 실행하면 덮어씀)
//   palace-outputs.json     build.mjs가 읽는 출력 목록 (outputs.mjs가 불러옴)
//   src/data/explore/sprites.json  게임이 읽는 그림 목록 (크기, 프레임 수)
//
// 색은 palette.json 글자만 쓴다.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cv, rng } from './cv.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

// ---------------------------------------------------------------------
// 타일 32x32 (순서 = 타일 번호. 맵 데이터 src/data/explore/maps.json의 글자와 맞출 것)
// ---------------------------------------------------------------------
const TILES = []; // { key, cv }
const tile = (key, draw) => {
  const c = new Cv(32, 32);
  draw(c);
  TILES.push({ key, cv: c });
};

/** 대리석 바닥: 16x16 판 네 장, 판마다 밝기 다르게, 가는 줄눈과 결 */
function marble(c, seed) {
  const rnd = rng(seed);
  for (let by = 0; by < 2; by++)
    for (let bx = 0; bx < 2; bx++) {
      const light = (bx + by) % 2 === 0;
      c.rect(bx * 16, by * 16, bx * 16 + 15, by * 16 + 15, light ? 'r' : 't');
      // 결 (대각선으로 흐르는 가는 줄)
      const x0 = bx * 16 + Math.floor(rnd() * 10);
      for (let k = 0; k < 9; k++) c.set(x0 + k * 0.7, by * 16 + 3 + k, light ? 't' : 'T');
      // 판 위쪽·왼쪽 밝은 모서리, 아래·오른쪽 줄눈
      c.rect(bx * 16, by * 16, bx * 16 + 15, by * 16, light ? 'v' : 'r');
      c.rect(bx * 16, by * 16 + 15, bx * 16 + 15, by * 16 + 15, 'T');
      c.rect(bx * 16 + 15, by * 16, bx * 16 + 15, by * 16 + 15, 'T');
    }
}
tile('floor', (c) => marble(c, 11));
tile('floor2', (c) => marble(c, 29));

/** 붉은 융단 (가로로 깐 것): 위·가운데·아래 */
function carpet(c, edgeTop, edgeBot) {
  c.rect(0, 0, 31, 31, 'X');
  // 무늬: 작은 마름모 줄
  for (let x = 4; x < 32; x += 8) {
    c.set(x, 15, 'x');
    c.set(x - 1, 16, 'x');
    c.set(x + 1, 16, 'x');
    c.set(x, 17, 'x');
  }
  for (let x = 0; x < 32; x += 2) c.set(x + ((x / 2) % 2), 6, 'Z');
  for (let x = 0; x < 32; x += 2) c.set(x + ((x / 2) % 2), 25, 'Z');
  if (edgeTop) {
    c.rect(0, 0, 31, 1, 'Z');
    c.rect(0, 2, 31, 3, 'Y');
    c.rect(0, 2, 31, 2, 'y');
  }
  if (edgeBot) {
    c.rect(0, 28, 31, 29, 'Y');
    c.rect(0, 28, 31, 28, 'y');
    c.rect(0, 30, 31, 31, 'Z');
  }
}
tile('carpet_top', (c) => carpet(c, true, false));
tile('carpet_mid', (c) => carpet(c, false, false));
tile('carpet_bot', (c) => carpet(c, false, true));

/** 벽 윗면 (위에서 본 벽 두께) */
tile('wall_top', (c) => {
  c.rect(0, 0, 31, 31, 'K');
  for (let y = 7; y < 32; y += 8) c.rect(0, y, 31, y, 'k');
  for (let y = 0; y < 32; y += 8) {
    const off = (y / 8) % 2 ? 0 : 8;
    for (let x = off; x < 32; x += 16) c.rect(x, y, x, y + 6, 'k');
  }
  c.rect(0, 0, 31, 0, 'R');
});

/** 벽 앞면: 위는 돌, 금색 몰딩, 아래는 나무 징두리판 */
function wallFront(c) {
  c.rect(0, 0, 31, 31, 't');
  for (let y = 5; y < 17; y += 6) c.rect(0, y, 31, y, 'T');
  for (let y = 0; y < 17; y += 6) {
    const off = (y / 6) % 2 ? 4 : 12;
    for (let x = off; x < 32; x += 16) c.rect(x, y, x, Math.min(y + 4, 16), 'T');
  }
  c.rect(0, 0, 31, 0, 'r');
  c.rect(0, 17, 31, 17, 'y');
  c.rect(0, 18, 31, 18, 'Y');
  c.rect(0, 19, 31, 31, 'o');
  c.rect(0, 19, 31, 19, 'p');
  // 판 테두리
  c.rect(3, 22, 28, 22, 'O');
  c.rect(3, 22, 3, 29, 'O');
  c.rect(28, 22, 28, 29, 'p');
  c.rect(3, 29, 28, 29, 'p');
  c.rect(0, 31, 31, 31, 'P');
}
tile('wall_front', wallFront);

/** 벽 앞면 + 아치 창문 (밤하늘, 눈송이) */
tile('wall_window', (c) => {
  wallFront(c);
  const glass = new Cv(32, 32);
  glass.rect(9, 6, 22, 17, 'A');
  glass.disc(15.5, 6, 6.5, 'A');
  glass.map((ch, x, y) => (ch === 'A' && y < 10 && x > 15 ? 'a' : ch));
  for (const [x, y] of [[11, 4], [18, 8], [13, 12], [20, 14], [16, 2], [10, 15]]) glass.set(x, y, 'v');
  glass.rect(15, 0, 16, 17, '.');
  glass.rect(9, 11, 22, 11, '.');
  glass.outline('R');
  c.blit(glass, 0, 0);
  // 창틀 가운데 살
  c.rect(15, 1, 16, 17, 'R');
  c.rect(9, 11, 22, 11, 'R');
  c.rect(7, 18, 24, 18, 'r');
});

// ---------------------------------------------------------------------
// 물건. 발밑(아래 가운데)이 기준점
// ---------------------------------------------------------------------
const PROPS = []; // { key, w, h, frames: Cv[], rate?, note }
const prop = (key, w, h, n, draw, o = {}) => {
  const frames = [];
  for (let i = 0; i < n; i++) {
    const c = new Cv(w, h);
    draw(c, i);
    frames.push(c);
  }
  PROPS.push({ key, w, h, frames, rate: o.rate, note: o.note ?? '' });
};

prop('portrait', 26, 30, 1, (c) => {
  // 금 액자
  c.rect(0, 0, 25, 29, 'Y');
  c.rect(1, 1, 24, 28, 'y');
  c.rect(3, 3, 22, 26, 'Y');
  // 그림: 어두운 배경, 황제의 얼굴과 왕관, 붉은 옷
  c.rect(4, 4, 21, 25, 'I');
  c.rect(4, 4, 21, 9, 'u');
  c.ellipse(12.5, 23, 8, 5, 'X');
  c.ellipse(12.5, 22, 6, 3, 'x');
  c.rect(9, 9, 16, 17, 's');
  c.rect(10, 9, 15, 15, 'e');
  c.rect(9, 7, 16, 8, 'y');
  for (const x of [9, 12, 16]) c.set(x, 6, 'y');
  c.rect(10, 12, 11, 12, 'K');
  c.rect(14, 12, 15, 12, 'K');
  c.rect(9, 16, 16, 18, 'V'); // 흰 수염
  c.rect(11, 19, 14, 19, 'V');
  c.edge('P');
});

prop('banner', 16, 44, 1, (c) => {
  c.rect(0, 0, 15, 1, 'Y');
  c.rect(0, 0, 15, 0, 'y');
  const cloth = new Cv(16, 44);
  cloth.rect(2, 2, 13, 36, 'X');
  cloth.rect(2, 2, 4, 36, 'x');
  // 끝이 갈라진 깃발
  for (let k = 0; k < 6; k++) {
    cloth.rect(2 + k, 37 + k, 2 + k, 37 + k, 'X');
    cloth.rect(13 - k, 37 + k, 13 - k, 37 + k, 'X');
  }
  cloth.rect(2, 37, 13, 37, 'X');
  cloth.rect(3, 38, 12, 38, 'X');
  cloth.rect(7, 38, 8, 43, '.');
  cloth.map((ch, x, y) => (ch === '.' && y >= 38 && y <= 42 && x > 2 + (y - 37) && x < 13 - (y - 37) ? 'X' : ch));
  cloth.rect(7, 39, 8, 43, '.');
  // 금빛 문장: 해 모양
  cloth.disc(7.5, 14, 3, 'y');
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    cloth.set(7.5 + Math.cos(a) * 5, 14 + Math.sin(a) * 5, 'Y');
  }
  cloth.rect(4, 24, 11, 24, 'Y');
  cloth.rect(4, 30, 11, 30, 'Y');
  cloth.edge('Z');
  c.blit(cloth, 0, 0);
});

prop('torch', 12, 22, 3, (c, i) => {
  // 벽 받침
  c.rect(4, 13, 7, 21, 'T');
  c.rect(4, 13, 4, 21, 'r');
  c.rect(2, 12, 9, 13, 'R');
  c.rect(3, 11, 8, 11, 'Y');
  // 불꽃 (흔들림)
  const f = new Cv(12, 22);
  const sway = [0, 1, -1][i];
  f.ellipse(5.5 + sway * 0.5, 7, 3.2, 5, (d) => (d < 0.45 ? 'l' : d < 0.8 ? 'y' : 'x'));
  f.set(5 + sway, 1, 'y');
  f.set(6 + sway, 0 + (i === 2 ? 1 : 0), 'x');
  f.outline('Z');
  c.blit(f, 0, 0, { under: true });
}, { rate: 6 });

prop('armor', 22, 40, 1, (c) => {
  const a = new Cv(22, 40);
  // 받침대
  a.rect(4, 36, 17, 39, 'o');
  a.rect(4, 36, 17, 36, 'p');
  a.rect(10, 28, 11, 36, 'O');
  // 갑옷 몸통
  a.ellipse(10.5, 21, 7, 8, (d, x) => (x < 9 ? 'l' : d < 0.7 ? 'm' : 'M'));
  a.rect(4, 14, 17, 16, 'm'); // 어깨
  a.ellipse(3.5, 15, 2.5, 2.5, 'M');
  a.ellipse(17.5, 15, 2.5, 2.5, 'M');
  a.rect(7, 22, 14, 23, 'Y'); // 띠
  // 투구
  a.ellipse(10.5, 7, 5, 6, (d, x) => (x < 9 ? 'l' : 'm'));
  a.rect(7, 7, 14, 8, 'K'); // 눈틈
  a.rect(10, 0, 11, 2, 'X'); // 깃 장식
  a.rect(9, 0, 12, 0, 'x');
  a.edge('L');
  c.blit(a, 0, 0);
});

prop('vase', 16, 28, 1, (c) => {
  const v = new Cv(16, 28);
  // 받침 기둥
  v.rect(3, 18, 12, 27, 't');
  v.rect(3, 18, 5, 27, 'r');
  v.rect(2, 17, 13, 18, 'r');
  v.rect(2, 26, 13, 27, 'T');
  // 꽃병
  v.ellipse(7.5, 12, 4.5, 5, (d, x) => (x < 6 ? 'b' : d < 0.7 ? 'n' : 'N'));
  v.rect(6, 5, 9, 7, 'n');
  v.rect(5, 12, 10, 12, 'y');
  // 흰 꽃
  for (const [x, y] of [[4, 2], [7, 0], [11, 2], [9, 3], [5, 4]]) v.disc(x, y + 1, 1, 'v');
  for (const [x, y] of [[6, 4], [8, 3], [10, 4]]) v.set(x, y, 'g');
  v.edge('R');
  c.blit(v, 0, 0);
});

prop('table', 32, 28, 1, (c) => {
  const t = new Cv(32, 28);
  // 탁자
  t.rect(1, 12, 30, 17, 'p');
  t.rect(1, 12, 30, 13, 'c');
  t.rect(1, 17, 30, 18, 'O');
  t.rect(3, 18, 5, 27, 'o');
  t.rect(26, 18, 28, 27, 'o');
  // 펼친 일지
  t.rect(7, 9, 20, 13, 'v');
  t.rect(13, 9, 14, 13, 'V');
  for (const y of [10, 12]) {
    t.rect(8, y, 12, y, 'T');
    t.rect(15, y, 19, y, 'T');
  }
  // 촛대와 초
  t.rect(24, 10, 27, 11, 'Y');
  t.rect(25, 4, 26, 9, 'v');
  t.set(25, 2, 'y');
  t.set(25, 3, 'l');
  t.set(26, 3, 'y');
  t.edge('P');
  c.blit(t, 0, 0);
});

prop('door', 32, 48, 1, (c) => {
  const d = new Cv(32, 48);
  d.rect(2, 6, 29, 47, 'O');
  d.disc(15.5, 10, 13.5, 'O');
  d.rect(4, 8, 14, 46, 'o');
  d.rect(17, 8, 27, 46, 'o');
  d.rect(15, 4, 16, 47, 'P');
  // 금 장식
  for (const x of [6, 19]) {
    d.rect(x, 14, x + 6, 14, 'Y');
    d.rect(x, 30, x + 6, 30, 'Y');
  }
  d.rect(12, 26, 13, 28, 'y');
  d.rect(18, 26, 19, 28, 'y');
  d.map((ch, x, y) => (ch !== '.' && Math.hypot(x - 15.5, y - 10) > 13.5 && y < 10 ? '.' : ch));
  d.edge('P');
  c.blit(d, 0, 0);
});

/** 살펴볼 수 있다는 반짝임 (2프레임) */
prop('look', 9, 9, 2, (c, i) => {
  if (i === 0) {
    c.rect(4, 1, 4, 7, 'y');
    c.rect(1, 4, 7, 4, 'y');
    c.set(4, 4, 'l');
    c.set(4, 0, 'Y');
    c.set(4, 8, 'Y');
    c.set(0, 4, 'Y');
    c.set(8, 4, 'Y');
  } else {
    c.rect(4, 2, 4, 6, 'y');
    c.rect(2, 4, 6, 4, 'y');
    c.set(4, 4, 'l');
  }
}, { rate: 3 });

// ---------------------------------------------------------------------
// 파일 쓰기
// ---------------------------------------------------------------------
const txt = ['# 황궁 이동 맵 (tools/pixel-art/gen-palace.mjs가 만든 파일. 다시 실행하면 덮어씀)', ''];
for (const t of TILES) txt.push(`[pal_${t.key}]`, t.cv.text(), '');
for (const p of PROPS) p.frames.forEach((f, i) => txt.push(`[pal_${p.key}_${i}]`, f.text(), ''));
writeFileSync(join(HERE, 'art', 'palace.txt'), txt.join('\n'));

const outputs = [];
const sprites = { tiles: { file: 'assets/explore/palace_tiles.png', size: 32, names: TILES.map((t) => t.key) }, props: {} };
outputs.push({ file: 'public/assets/explore/palace_tiles.png', cell: [32, 32], columns: 8, frames: TILES.map((t) => `pal_${t.key}`) });
for (const p of PROPS) {
  const file = `public/assets/explore/${p.key}.png`;
  outputs.push({ file, cell: [p.w, p.h], frames: p.frames.map((_, i) => `pal_${p.key}_${i}`) });
  sprites.props[p.key] = { file: file.replace('public/', ''), w: p.w, h: p.h, frames: p.frames.length, rate: p.rate };
}
// 확인용 한 장
const pv = [...TILES.map((t) => `pal_${t.key}`), ...PROPS.flatMap((p) => p.frames.map((_, i) => ({ layers: [{ art: `pal_${p.key}_${i}`, x: Math.floor((48 - p.w) / 2), y: 48 - p.h }] })))];
outputs.push({ file: 'tools/pixel-art/preview_palace.png', cell: [48, 48], columns: 8, frames: pv.map((f) => (typeof f === 'string' ? { layers: [{ art: f, x: 8, y: 8 }] } : f)), background: 'K', scale: 3 });

writeFileSync(join(HERE, 'palace-outputs.json'), JSON.stringify(outputs));
mkdirSync(join(ROOT, 'src/data/explore'), { recursive: true });
writeFileSync(join(ROOT, 'src/data/explore/sprites.json'), JSON.stringify(sprites, null, 2));
console.log(`타일 ${TILES.length}종, 물건 ${PROPS.length}종 → art/palace.txt`);
