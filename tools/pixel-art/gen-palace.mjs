// 프롤로그 도트 맵 그림 생성기: 바닥·벽 타일(32x32)과 물건(기둥, 횃불, 침대, 쇠창살 등)
// 실행: npm run art:palace  (이 파일을 실행한 뒤 build.mjs로 PNG를 만든다)
//
// 만드는 파일
//   art/palace.txt          글자 격자 (다시 실행하면 덮어씀)
//   palace-outputs.json     build.mjs가 읽는 출력 목록 (outputs.mjs가 불러옴)
//   src/data/explore/sprites.json  게임이 읽는 그림 목록 (타일 이름 순서, 물건 크기·프레임 수)
//
// 타일 순서 = 타일 번호. 맵 생성기(tools/maps/gen-maps.mjs)는 이름으로 찾으므로 순서를 바꿔도 된다.
// 색은 palette.json 글자만 쓴다.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cv, rng } from './cv.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

// ---------------------------------------------------------------------
// 타일 32x32
// ---------------------------------------------------------------------
const TILES = []; // { key, cv, solid, note }
const tile = (key, draw, o = {}) => {
  const c = new Cv(32, 32);
  draw(c);
  TILES.push({ key, cv: c, solid: !!o.solid, note: o.note ?? '' });
};

/** 대리석 바닥: 16x16 판 네 장, 판마다 밝기 다르게, 가는 줄눈과 결 */
function marble(c, seed) {
  const rnd = rng(seed);
  for (let by = 0; by < 2; by++)
    for (let bx = 0; bx < 2; bx++) {
      const light = (bx + by) % 2 === 0;
      c.rect(bx * 16, by * 16, bx * 16 + 15, by * 16 + 15, light ? 'r' : 't');
      const x0 = bx * 16 + Math.floor(rnd() * 10);
      for (let k = 0; k < 9; k++) c.set(x0 + k * 0.7, by * 16 + 3 + k, light ? 't' : 'T');
      c.rect(bx * 16, by * 16, bx * 16 + 15, by * 16, light ? 'v' : 'r');
      c.rect(bx * 16, by * 16 + 15, bx * 16 + 15, by * 16 + 15, 'T');
      c.rect(bx * 16 + 15, by * 16, bx * 16 + 15, by * 16 + 15, 'T');
    }
}
tile('floor', (c) => marble(c, 11), { note: '대리석 바닥' });
tile('floor2', (c) => marble(c, 29), { note: '대리석 바닥 (결이 다른 것)' });

/** 붉은 카펫 (가로로 깐 것): 위·가운데·아래 */
function carpet(c, edgeTop, edgeBot) {
  c.rect(0, 0, 31, 31, 'X');
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
tile('carpet_top', (c) => carpet(c, true, false), { note: '붉은 카펫 위 가장자리' });
tile('carpet_mid', (c) => carpet(c, false, false), { note: '붉은 카펫 가운데' });
tile('carpet_bot', (c) => carpet(c, false, true), { note: '붉은 카펫 아래 가장자리' });

/** 벽 윗면 (위에서 본 벽 두께) */
tile('wall_top', (c) => {
  c.rect(0, 0, 31, 31, 'K');
  for (let y = 7; y < 32; y += 8) c.rect(0, y, 31, y, 'k');
  for (let y = 0; y < 32; y += 8) {
    const off = (y / 8) % 2 ? 0 : 8;
    for (let x = off; x < 32; x += 16) c.rect(x, y, x, y + 6, 'k');
  }
  c.rect(0, 0, 31, 0, 'R');
}, { solid: true, note: '벽 윗면' });

/** 벽 앞면 위쪽: 돌 쌓기, 아래 끝에 금색 몰딩 */
function wallUp(c) {
  c.rect(0, 0, 31, 31, 't');
  for (let y = 7; y < 28; y += 8) c.rect(0, y, 31, y, 'T');
  for (let y = 0; y < 28; y += 8) {
    const off = (y / 8) % 2 ? 4 : 12;
    for (let x = off; x < 32; x += 16) c.rect(x, y, x, Math.min(y + 6, 27), 'T');
  }
  c.rect(0, 0, 31, 1, 'r');
  c.rect(0, 2, 31, 2, 'R');
  c.rect(0, 28, 31, 28, 'y');
  c.rect(0, 29, 31, 30, 'Y');
  c.rect(0, 31, 31, 31, 'P');
}
tile('wall_up', wallUp, { solid: true, note: '벽 앞면 위 (돌)' });

/** 벽 앞면 아래쪽: 나무 징두리판 */
function wallLow(c) {
  c.rect(0, 0, 31, 31, 'o');
  c.rect(0, 0, 31, 0, 'p');
  c.rect(3, 4, 28, 4, 'O');
  c.rect(3, 4, 3, 25, 'O');
  c.rect(28, 4, 28, 25, 'p');
  c.rect(3, 25, 28, 25, 'p');
  c.rect(6, 8, 25, 21, 'O');
  c.rect(7, 9, 24, 20, 'o');
  c.rect(0, 28, 31, 29, 'O');
  c.rect(0, 30, 31, 31, 'P');
}
tile('wall_low', wallLow, { solid: true, note: '벽 앞면 아래 (나무 징두리판)' });

/** 큰 아치 창문 (2칸 높이): 위·아래. 유리는 밤하늘, 눈은 게임에서 뿌린다 */
const GLASS = { x0: 7, x1: 24 };
tile('window_up', (c) => {
  wallUp(c);
  const g = new Cv(32, 32);
  g.rect(GLASS.x0, 10, GLASS.x1, 31, (x, y) => (y < 18 ? 'B' : 'N'));
  g.disc(15.5, 10, 8.5, (d, x, y) => (y <= 10 ? 'B' : '.'));
  for (const [x, y] of [[11, 8], [19, 12], [13, 20], [21, 24], [10, 27]]) g.set(x, y, 'b');
  g.outline('R');
  c.rect(5, 4, 26, 31, (x, y) => (Math.hypot(x - 15.5, y - 10) <= 10.5 || y > 10 ? 'r' : c.get(x, y)));
  c.blit(g, 0, 0);
  c.rect(15, 2, 16, 31, 'R'); // 가운데 살
  c.rect(GLASS.x0, 20, GLASS.x1, 20, 'R');
  c.rect(15, 1, 16, 1, 'y');
}, { solid: true, note: '큰 창문 위 (아치)' });
tile('window_low', (c) => {
  wallLow(c);
  c.rect(5, 0, 26, 24, 'r');
  c.rect(GLASS.x0, 0, GLASS.x1, 21, (x, y) => (y < 10 ? 'N' : 'n'));
  for (const [x, y] of [[10, 4], [20, 9], [12, 15], [22, 18]]) c.set(x, y, 'b');
  c.rect(15, 0, 16, 21, 'R');
  c.rect(GLASS.x0, 11, GLASS.x1, 11, 'R');
  // 창턱 (눈이 조금 쌓임)
  c.rect(4, 22, 27, 24, 'r');
  c.rect(4, 25, 27, 25, 'T');
  c.rect(6, 21, 25, 21, 'v');
}, { solid: true, note: '큰 창문 아래 (창턱)' });

/** 침소로 가는 어두운 회랑의 판석 */
function flag(c, seed) {
  const rnd = rng(seed);
  c.rect(0, 0, 31, 31, 'T');
  const rows = [[0, 10], [11, 21], [22, 31]];
  rows.forEach(([y0, y1], i) => {
    let x = i % 2 ? -6 : 0;
    while (x < 32) {
      const w = 10 + Math.floor(rnd() * 8);
      c.rect(Math.max(0, x), y0, Math.min(31, x + w - 1), y1, rnd() < 0.4 ? 't' : 'T');
      c.rect(Math.max(0, x), y0, Math.min(31, x + w - 1), y0, 't');
      c.rect(x + w - 1, y0, x + w - 1, y1, 'R');
      x += w;
    }
    c.rect(0, y1, 31, y1, 'R');
  });
  for (let k = 0; k < 4; k++) c.set(rnd() * 31, rnd() * 31, 'r');
}
tile('stone', (c) => flag(c, 5), { note: '어두운 판석 바닥' });
tile('stone2', (c) => flag(c, 17), { note: '어두운 판석 바닥 (다른 무늬)' });

/** 침소의 나무 마루 */
tile('wood', (c) => {
  for (let y = 0; y < 32; y += 8) {
    c.rect(0, y, 31, y + 7, (y / 8) % 2 ? 'O' : 'o');
    c.rect(0, y, 31, y, 'p');
    c.rect(0, y + 7, 31, y + 7, 'P');
    const j = (y / 8) % 2 ? 9 : 23;
    c.rect(j, y, j, y + 7, 'P');
    c.set(j + 4, y + 3, 'O');
  }
}, { note: '침소 나무 마루' });

/** 피 웅덩이 (별도 레이어 blood에만 쓰는 투명 배경 타일) */
function blood(c, seed, n) {
  const rnd = rng(seed);
  for (let i = 0; i < n; i++) {
    const cx = 6 + rnd() * 20;
    const cy = 6 + rnd() * 20;
    const rx = 3 + rnd() * 7;
    const ry = rx * (0.5 + rnd() * 0.3);
    c.ellipse(cx, cy, rx, ry, (d) => (d < 0.75 ? 'X' : 'Z'));
  }
  c.map((ch, x, y) => (ch === 'X' && c.get(x, y - 1) === '.' ? 'Z' : ch));
  c.map((ch, x, y) => (ch === 'X' && rnd() < 0.05 ? 'x' : ch));
}
tile('blood1', (c) => blood(c, 3, 3), { note: '피 웅덩이 1 (blood 레이어)' });
tile('blood2', (c) => blood(c, 8, 2), { note: '피 웅덩이 2 (blood 레이어)' });
tile('blood3', (c) => {
  blood(c, 21, 1);
  for (let k = 0; k < 4; k++) c.set(4 + k * 7, 26 + (k % 2) * 3, 'Z');
}, { note: '피 방울 (blood 레이어)' });

/** 해자의 성벽 */
function bigStones(c, seed) {
  const rnd = rng(seed);
  c.rect(0, 0, 31, 31, 'T');
  for (let row = 0; row < 3; row++) {
    const y0 = row * 11;
    const y1 = Math.min(31, y0 + 10);
    let x = row % 2 ? -8 : 0;
    while (x < 32) {
      const w = 14 + Math.floor(rnd() * 6);
      c.rect(Math.max(0, x), y0, Math.min(31, x + w - 1), y0, 't');
      c.rect(x + w - 1, y0, x + w - 1, y1, 'R');
      if (rnd() < 0.3) c.rect(Math.max(0, x + 2), y0 + 2, Math.min(31, x + 5), y0 + 3, 'R');
      x += w;
    }
    c.rect(0, y1, 31, y1, 'R');
  }
}
tile('castle_top', (c) => {
  c.rect(0, 0, 31, 31, 'R');
  c.rect(0, 0, 31, 19, 'T');
  for (let x = 0; x < 32; x += 8) c.rect(x, 0, x, 19, 'R');
  c.rect(0, 0, 31, 0, 't');
  // 흉벽 (톱니)
  for (let x = 0; x < 32; x += 16) {
    c.rect(x, 20, x + 9, 31, 't');
    c.rect(x, 20, x + 9, 20, 'r');
    c.rect(x + 9, 20, x + 9, 31, 'R');
  }
}, { solid: true, note: '성벽 꼭대기 (흉벽)' });
tile('castle_wall', (c) => bigStones(c, 4), { solid: true, note: '높은 성벽' });
tile('castle_moss', (c) => {
  bigStones(c, 9);
  const rnd = rng(2);
  for (let i = 0; i < 26; i++) c.set(rnd() * 31, 18 + rnd() * 13, rnd() < 0.5 ? 'G' : 'Q');
}, { solid: true, note: '이끼 낀 성벽' });
tile('castle_base', (c) => {
  bigStones(c, 13);
  c.map((ch, x, y) => (y > 18 ? (ch === 't' ? 'T' : ch === 'T' ? 'R' : ch) : ch));
  c.rect(0, 28, 31, 31, 'W');
  for (let x = 1; x < 32; x += 6) c.rect(x, 28, x + 2, 28, 'a');
}, { solid: true, note: '물에 잠긴 성벽 밑동' });

/** 밤의 해자 물 */
function water(c, seed) {
  const rnd = rng(seed);
  c.rect(0, 0, 31, 31, 'W');
  for (let i = 0; i < 9; i++) {
    const x = rnd() * 26;
    const y = 2 + rnd() * 28;
    c.rect(x, y, x + 3 + rnd() * 4, y, 'A');
  }
  for (let i = 0; i < 3; i++) c.set(rnd() * 31, rnd() * 31, 'a');
}
tile('water', (c) => water(c, 6), { solid: true, note: '해자 물' });
tile('water2', (c) => water(c, 15), { solid: true, note: '해자 물 (다른 물결)' });

/** 건너편 둑 */
function cobble(c, seed) {
  const rnd = rng(seed);
  c.rect(0, 0, 31, 31, 'R');
  for (let y = 1; y < 32; y += 6)
    for (let x = (y / 6) % 2 ? -2 : 1; x < 32; x += 6) {
      c.ellipse(x + 2, y + 2, 2.4, 2, (d) => (d < 0.5 && rnd() < 0.7 ? 't' : 'T'));
    }
}
tile('quay', (c) => {
  cobble(c, 3);
  c.rect(0, 0, 31, 3, 't');
  c.rect(0, 0, 31, 0, 'r');
  c.rect(0, 4, 31, 4, 'R');
}, { note: '둑 가장자리 (물 아래쪽)' });
tile('cobble', (c) => cobble(c, 7), { note: '둑 자갈길' });

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

prop('pillar', 32, 96, 1, (c) => {
  const p = new Cv(32, 96);
  // 받침
  p.rect(2, 86, 29, 95, 'r');
  p.rect(2, 86, 29, 86, 'v');
  p.rect(2, 93, 29, 95, 'T');
  p.rect(5, 81, 26, 85, 'r');
  p.rect(5, 81, 26, 81, 'v');
  // 기둥 몸 (세로 홈)
  p.rect(7, 16, 24, 80, (x) => (x < 10 ? 'v' : x < 19 ? 'r' : x < 22 ? 't' : 'T'));
  for (const x of [11, 15, 19]) p.rect(x, 18, x, 78, x < 19 ? 't' : 'T');
  // 머리
  p.rect(4, 8, 27, 15, 'r');
  p.rect(4, 8, 27, 8, 'v');
  p.rect(4, 12, 27, 13, 'Y');
  p.rect(4, 12, 27, 12, 'y');
  p.rect(2, 2, 29, 7, 'r');
  p.rect(2, 2, 29, 2, 'v');
  p.rect(2, 7, 29, 7, 'T');
  p.edge('R');
  c.blit(p, 0, 0);
}, { note: '대리석 기둥' });

prop('torch', 12, 22, 2, (c, i) => {
  c.rect(4, 13, 7, 21, 'T');
  c.rect(4, 13, 4, 21, 'r');
  c.rect(2, 12, 9, 13, 'R');
  c.rect(3, 11, 8, 11, 'Y');
  const f = new Cv(12, 22);
  const sway = i ? 1 : -0.5;
  f.ellipse(5.5 + sway * 0.6, 7 + i * 0.5, 3.2, 5 - i * 0.6, (d) => (d < 0.45 ? 'l' : d < 0.8 ? 'y' : 'x'));
  f.set(5 + sway, 1 + i, 'y');
  f.set(6 + sway, i ? 0 : 2, 'x');
  f.outline('Z');
  c.blit(f, 0, 0, { under: true });
}, { rate: 5, note: '벽 횃불 (2프레임)' });

prop('banner', 16, 44, 1, (c) => {
  c.rect(0, 0, 15, 1, 'Y');
  c.rect(0, 0, 15, 0, 'y');
  const cloth = new Cv(16, 44);
  cloth.rect(2, 2, 13, 36, 'n');
  cloth.rect(2, 2, 4, 36, 'b');
  cloth.rect(11, 2, 13, 36, 'N');
  for (let k = 0; k < 6; k++) {
    cloth.rect(2 + k, 37 + k, 2 + k, 37 + k, k < 2 ? 'b' : 'n');
    cloth.rect(13 - k, 37 + k, 13 - k, 37 + k, 'N');
  }
  cloth.rect(3, 37, 12, 38, 'n');
  // 금빛 문장: 해 모양
  cloth.disc(7.5, 14, 3, 'y');
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    cloth.set(7.5 + Math.cos(a) * 5, 14 + Math.sin(a) * 5, 'Y');
  }
  cloth.rect(4, 24, 11, 24, 'Y');
  cloth.rect(4, 30, 11, 30, 'Y');
  cloth.edge('B');
  c.blit(cloth, 0, 0);
}, { note: '남색 깃발' });

prop('portrait', 30, 38, 1, (c) => {
  c.rect(0, 0, 29, 37, 'Y');
  c.rect(1, 1, 28, 36, 'y');
  c.rect(3, 3, 26, 34, 'Y');
  c.rect(4, 4, 25, 33, 'I');
  c.rect(4, 4, 25, 12, 'u');
  // 갑옷 입은 상반신과 붉은 망토
  c.ellipse(14.5, 32, 10, 7, 'X');
  c.ellipse(14.5, 31, 7, 5, 'M');
  c.rect(11, 27, 18, 33, 'm');
  c.rect(14, 26, 15, 33, 'l');
  // 얼굴 (매서운 눈), 금관, 검은 수염
  c.rect(10, 12, 19, 22, 's');
  c.rect(11, 12, 18, 18, 'e');
  c.rect(10, 9, 19, 11, 'Y');
  for (const x of [10, 13, 16, 19]) c.set(x, 8, 'y');
  c.rect(11, 15, 13, 15, 'K');
  c.rect(16, 15, 18, 15, 'K');
  c.set(12, 14, 'H');
  c.set(17, 14, 'H');
  c.rect(10, 19, 19, 23, 'H');
  c.rect(12, 20, 17, 20, 'J');
  c.rect(9, 10, 9, 20, 'H');
  c.rect(20, 10, 20, 20, 'H');
  c.edge('P');
}, { note: '시황제의 초상화' });

prop('board', 30, 30, 1, (c) => {
  const b = new Cv(30, 30);
  b.rect(0, 0, 29, 29, 'O');
  b.rect(2, 2, 27, 27, 'd');
  b.rect(2, 2, 27, 2, 'D');
  // 붙은 종이들
  b.rect(4, 5, 12, 15, 'V');
  b.rect(4, 5, 12, 5, 'v');
  for (const y of [8, 10, 12]) b.rect(5, y, 11, y, 'T');
  b.rect(15, 4, 25, 21, 'v'); // 청원서 (크게)
  for (const y of [7, 9, 11, 13, 15]) b.rect(16, y, 24, y, 'T');
  b.disc(22, 18, 2, 'X'); // 접수 도장
  b.set(22, 18, 'x');
  b.rect(5, 18, 12, 25, 'V');
  for (const y of [20, 22]) b.rect(6, y, 11, y, 'T');
  for (const [x, y] of [[8, 5], [20, 4], [8, 18]]) b.set(x, y, 'X');
  b.edge('P');
  c.blit(b, 0, 0);
}, { note: '게시판 (아르덴 사절의 청원서)' });

prop('honor', 50, 36, 1, (c) => {
  const h = new Cv(50, 36);
  h.rect(0, 0, 49, 35, 'r');
  h.rect(0, 0, 49, 0, 'v');
  h.rect(2, 2, 47, 33, 't');
  h.rect(3, 3, 46, 32, 'r');
  h.rect(5, 4, 44, 7, 'Y');
  h.rect(5, 4, 44, 4, 'y');
  for (let k = 0; k < 6; k++) {
    const y = 11 + k * 3.5;
    h.rect(8, y, 22 + (k * 5) % 9, y, 'T');
    h.rect(27, y, 41 - (k * 3) % 7, y, 'T');
  }
  h.rect(17, 30, 32, 30, 'y'); // 가장 아래 새 글자 (갈리아)
  h.edge('R');
  c.blit(h, 0, 0);
}, { note: '근위기사단 명예의 벽' });

prop('prayer', 20, 36, 2, (c, i) => {
  const p = new Cv(20, 36);
  p.rect(4, 32, 15, 35, 'M');
  p.rect(4, 32, 15, 32, 'm');
  p.rect(8, 16, 11, 31, 'm');
  p.rect(8, 16, 8, 31, 'l');
  p.rect(1, 13, 18, 16, 'm');
  p.rect(1, 13, 18, 13, 'l');
  p.rect(1, 16, 18, 16, 'M');
  // 초 세 자루
  for (const x of [4, 9, 14]) {
    p.rect(x, 7, x + 1, 12, 'v');
    p.set(x + 1, 12, 'V');
  }
  p.edge('L');
  for (const [k, x] of [4, 9, 14].entries()) {
    const up = (k + i) % 2;
    p.set(x, 5 - up, 'y');
    p.set(x, 6 - up, 'l');
    p.set(x + 1, 6, 'y');
  }
  c.blit(p, 0, 0);
}, { rate: 4, note: '루멘 신성국의 은제 기도대 (2프레임)' });

prop('sanctum', 40, 60, 1, (c) => {
  const d = new Cv(40, 60);
  d.rect(0, 10, 39, 59, 'R');
  d.disc(19.5, 14, 19.5, 'R');
  d.rect(3, 13, 36, 59, 'L');
  d.disc(19.5, 15, 16.5, 'L');
  d.map((ch, x, y) => (ch === 'L' && y > 12 ? ((x + y) % 7 === 0 ? 'M' : 'L') : ch));
  // 쇠 띠와 징
  for (const y of [24, 38, 52]) {
    d.rect(4, y, 35, y + 1, 'M');
    for (let x = 6; x < 35; x += 6) d.set(x, y, 'm');
  }
  // 문틈의 차가운 빛
  d.rect(19, 6, 20, 59, 'v');
  d.rect(19, 30, 20, 34, 'l');
  d.rect(0, 59, 39, 59, 'k');
  d.rect(16, 59, 23, 59, 'l');
  d.map((ch, x, y) => (y < 14 && Math.hypot(x - 19.5, y - 14) > 19.5 ? '.' : ch));
  c.blit(d, 0, 0);
}, { note: '지하 성소의 문 (문틈 빛)' });

prop('door_gold', 44, 62, 1, (c) => {
  const d = new Cv(44, 62);
  d.rect(0, 12, 43, 61, 'Y');
  d.disc(21.5, 16, 21.5, 'Y');
  d.rect(3, 15, 40, 61, 'O');
  d.disc(21.5, 17, 18.5, 'O');
  d.rect(5, 18, 19, 60, 'o');
  d.rect(24, 18, 38, 60, 'o');
  // 금장식: 문짝마다 테두리와 꽃무늬
  for (const x0 of [6, 25]) {
    d.rect(x0, 22, x0 + 12, 22, 'y');
    d.rect(x0, 54, x0 + 12, 54, 'y');
    d.rect(x0, 22, x0, 54, 'Y');
    d.rect(x0 + 12, 22, x0 + 12, 54, 'Y');
    d.disc(x0 + 6, 38, 3, 'y');
    d.set(x0 + 6, 38, 'Y');
  }
  d.disc(21.5, 9, 4, 'y');
  d.set(21.5, 9, 'X');
  d.rect(17, 36, 18, 40, 'y');
  d.rect(25, 36, 26, 40, 'y');
  // 문틈에서 새어 나오는 흰빛
  d.rect(20, 8, 23, 61, 'v');
  d.rect(21, 14, 22, 61, 'l');
  d.rect(2, 61, 41, 61, 'l');
  d.map((ch, x, y) => (y < 16 && Math.hypot(x - 21.5, y - 16) > 21.5 ? '.' : ch));
  c.blit(d, 0, 0);
}, { note: '금장식 침소 문 (문틈 흰빛)' });

prop('bed', 64, 66, 1, (c) => {
  const b = new Cv(64, 66);
  // 머리판
  b.rect(2, 0, 61, 16, 'O');
  b.rect(2, 0, 61, 1, 'Y');
  b.rect(6, 4, 57, 13, 'o');
  b.disc(31.5, 8, 4, 'Y');
  b.rect(0, 0, 3, 18, 'P');
  b.rect(60, 0, 63, 18, 'P');
  // 매트리스와 시트
  b.rect(3, 14, 60, 60, 'V');
  b.rect(3, 14, 60, 15, 'v');
  b.rect(10, 16, 26, 23, 'v'); // 베개
  b.rect(37, 16, 53, 23, 'v');
  // 누운 황제: 짙은 갈색 짧은 머리, 금 월계관, 창백한 얼굴
  b.ellipse(18, 20, 5.5, 4.5, 'H');
  b.ellipse(18, 19, 4.5, 3, 'h');
  for (const x of [12, 14, 16, 18, 20, 22, 24]) b.set(x, 17 + (x % 4 ? 0 : 1), 'y');
  b.rect(13, 18, 23, 18, 'Y');
  b.ellipse(18, 23, 3.5, 3, 's');
  b.rect(16, 23, 17, 23, 'S');
  b.set(16, 22, 'k');
  b.set(20, 22, 'k');
  // 흰 담비털 깃 (검은 점)과 흰 비단옷
  b.rect(8, 26, 30, 29, (x, y) => ((x * 3 + y * 5) % 7 === 0 ? 'k' : 'v'));
  b.rect(15, 26, 21, 27, 'v');
  // 붉은 대관 망토를 이불처럼 덮음 (몸이 누운 모양으로 불룩), 금 자수
  b.rect(3, 30, 60, 58, 'X');
  b.rect(3, 30, 60, 31, 'x');
  b.ellipse(24, 42, 10, 9, (d) => (d < 0.5 ? 'x' : 'X'));
  for (let x = 6; x <= 58; x += 4) b.set(x, 54 + (x % 8 ? 0 : 1), 'Y');
  b.rect(3, 56, 60, 58, 'Z');
  // 흰 침구에 번진 피, 늘어진 손
  b.ellipse(34, 26, 6, 3, 'X');
  b.ellipse(13, 30, 4, 2, 'X');
  b.rect(60, 34, 62, 44, 'S');
  b.rect(61, 44, 62, 47, 's');
  // 다리
  b.rect(1, 58, 5, 65, 'P');
  b.rect(58, 58, 62, 65, 'P');
  b.rect(3, 59, 60, 61, 'O');
  b.edge('P');
  c.blit(b, 0, 0);
}, { note: '황제의 큰 침대' });

prop('curtain', 18, 66, 1, (c) => {
  const d = new Cv(18, 66);
  d.rect(0, 0, 17, 2, 'Y');
  d.rect(0, 0, 17, 0, 'y');
  d.rect(1, 3, 16, 65, 'X');
  for (const x of [4, 9, 13]) d.rect(x, 3, x, 65, 'Z');
  for (const x of [2, 7, 11]) d.rect(x, 3, x, 65, 'x');
  // 묶은 끈 (허리가 잘록)
  d.rect(0, 36, 17, 38, 'y');
  d.map((ch, x, y) => (y > 30 && y < 44 && (x < 2 + (6 - Math.abs(y - 37)) * 0.5 || x > 15 - (6 - Math.abs(y - 37)) * 0.5) ? '.' : ch));
  d.edge('Z');
  c.blit(d, 0, 0);
}, { note: '짙은 붉은 커튼' });

prop('candle', 12, 32, 2, (c, i) => {
  const d = new Cv(12, 32);
  d.rect(2, 29, 9, 31, 'Y');
  d.rect(2, 29, 9, 29, 'y');
  d.rect(5, 12, 6, 28, 'Y');
  d.rect(5, 12, 5, 28, 'y');
  d.rect(1, 11, 10, 12, 'Y');
  d.rect(4, 5, 7, 10, 'v');
  d.rect(7, 5, 7, 10, 'V');
  d.edge('O');
  const up = i;
  d.set(5, 3 - up, 'y');
  d.set(6, 2 - up, 'y');
  d.set(5, 4, 'l');
  d.set(6, 4, 'l');
  d.set(i ? 4 : 7, 3, 'x');
  c.blit(d, 0, 0);
}, { rate: 4, note: '촛대 (2프레임)' });

prop('pendant', 12, 12, 2, (c, i) => {
  // 바닥에 떨어진 눈 모양 펜던트 (끊어진 은 사슬, 가운데에 새겨진 빛). 2프레임 반짝임
  const d = new Cv(12, 12);
  for (const [x, y] of [[1, 2], [2, 3], [3, 3], [4, 4], [9, 1], [10, 2]]) d.set(x, y, 'M');
  d.ellipse(6, 7.5, 4.5, 2.6, 'm');
  d.ellipse(6, 7.5, 3.4, 1.6, 'l');
  d.ellipse(6, 7.5, 1.4, 1.4, 'Y');
  d.set(6, 7, 'v');
  d.edge('L');
  if (i) {
    d.set(8, 4, 'v');
    d.set(8, 3, 'l');
    d.set(7, 4, 'l');
    d.set(9, 4, 'l');
  }
  c.blit(d, 0, 0);
}, { rate: 3, note: '침입자가 떨어뜨린 눈 모양 펜던트 (2프레임 반짝임)' });

prop('window_open', 36, 64, 1, (c) => {
  const d = new Cv(36, 64);
  d.rect(0, 4, 35, 63, 'R');
  d.disc(17.5, 14, 17.5, 'R');
  d.rect(4, 12, 31, 54, 'B');
  d.disc(17.5, 14, 13.5, 'B');
  for (const [x, y] of [[9, 10], [24, 14], [14, 30], [27, 38], [8, 46], [20, 22]]) d.set(x, y, 'b');
  // 열어젖힌 덧창 (안쪽으로)
  d.rect(0, 14, 5, 54, 'o');
  d.rect(0, 14, 1, 54, 'p');
  d.rect(30, 14, 35, 54, 'O');
  d.rect(34, 14, 35, 54, 'P');
  for (const y of [22, 34, 46]) {
    d.rect(0, y, 5, y, 'P');
    d.rect(30, y, 35, y, 'P');
  }
  // 창턱과 들이친 눈
  d.rect(0, 55, 35, 59, 'r');
  d.rect(0, 60, 35, 63, 'T');
  d.rect(2, 53, 33, 55, 'v');
  d.rect(6, 52, 14, 52, 'v');
  d.rect(22, 52, 30, 52, 'v');
  d.map((ch, x, y) => (y < 14 && Math.hypot(x - 17.5, y - 14) > 17.5 ? '.' : ch));
  c.blit(d, 0, 0);
}, { note: '눈이 들이치는 열린 창' });

prop('table', 32, 28, 1, (c) => {
  const t = new Cv(32, 28);
  t.rect(1, 12, 30, 17, 'p');
  t.rect(1, 12, 30, 13, 'c');
  t.rect(1, 17, 30, 18, 'O');
  t.rect(3, 18, 5, 27, 'o');
  t.rect(26, 18, 28, 27, 'o');
  // 펼친 경전 (밑줄이 빼곡)
  t.rect(5, 8, 21, 13, 'v');
  t.rect(13, 8, 13, 13, 'V');
  for (const y of [9, 10, 11, 12]) {
    t.rect(6, y, 12, y, y % 2 ? 'T' : 'X');
    t.rect(14, y, 20, y, 'T');
  }
  t.rect(13, 13, 13, 16, 'X'); // 책갈피 끈
  // 촛대와 초
  t.rect(24, 10, 27, 11, 'Y');
  t.rect(25, 4, 26, 9, 'v');
  t.set(25, 2, 'y');
  t.set(25, 3, 'l');
  t.set(26, 3, 'y');
  t.edge('P');
  c.blit(t, 0, 0);
}, { note: '경전이 펼쳐진 탁자' });

prop('belltower', 56, 140, 1, (c) => {
  const d = new Cv(56, 140);
  // 뾰족 지붕
  for (let y = 0; y < 40; y++) {
    const half = 2 + (y / 40) * 24;
    d.rect(28 - half, y, 27 + half, y, y < 2 ? 'Y' : 'I');
    d.set(28 - half, y, 'B');
  }
  // 종루 (종이 보인다)
  d.rect(6, 40, 49, 70, 'R');
  d.rect(12, 44, 43, 66, 'k');
  d.disc(27.5, 54, 8, (q) => (q < 0.5 ? 'y' : 'Y'));
  d.rect(19, 58, 36, 62, 'Y');
  d.rect(27, 44, 28, 46, 'Y');
  d.rect(4, 70, 51, 73, 'T');
  // 탑 몸통과 불 켜진 창
  d.rect(8, 74, 47, 139, 'R');
  for (let y = 78; y < 140; y += 10) d.rect(8, y, 47, y, 'K');
  for (const [x, y] of [[16, 90], [36, 104], [22, 120]]) {
    d.rect(x, y, x + 3, y + 6, 'y');
    d.rect(x, y, x + 3, y, 'Y');
  }
  d.edge('k');
  c.blit(d, 0, 0);
}, { note: '멀리 보이는 종탑' });

prop('grate', 36, 34, 1, (c) => {
  const d = new Cv(36, 34);
  d.rect(0, 8, 35, 33, 'T');
  d.disc(17.5, 12, 17.5, 'T');
  d.rect(4, 12, 31, 33, 'k');
  d.disc(17.5, 13, 13.5, 'k');
  // 쇠창살 (하나가 부러져 있다)
  for (const x of [8, 13, 18, 23, 28]) {
    if (x === 18) {
      d.rect(x, 2, x + 1, 13, 'M');
      d.set(x + 2, 14, 'm');
      d.rect(x, 29, x + 1, 33, 'M');
      d.set(x - 1, 28, 'm');
    } else d.rect(x, 1, x + 1, 33, 'M');
    d.rect(x, 1, x, 33, 'L');
  }
  d.rect(4, 12, 31, 13, 'L');
  d.rect(4, 22, 31, 22, 'L');
  d.rect(4, 30, 31, 33, 'W'); // 빨려 들어가는 물
  d.rect(6, 31, 10, 31, 'a');
  d.rect(22, 31, 27, 31, 'a');
  d.map((ch, x, y) => (y < 12 && Math.hypot(x - 17.5, y - 12) > 17.5 ? '.' : ch));
  d.edge('R');
  c.blit(d, 0, 0);
}, { note: '지하 수로로 이어지는 부서진 쇠창살' });

prop('torchpost', 12, 40, 2, (c, i) => {
  c.rect(5, 14, 6, 39, 'O');
  c.rect(5, 14, 5, 39, 'o');
  c.rect(3, 11, 8, 14, 'R');
  c.rect(3, 11, 8, 11, 'T');
  const f = new Cv(12, 40);
  const sway = i ? 1 : -0.5;
  f.ellipse(5.5 + sway * 0.6, 6 + i * 0.5, 3.2, 5 - i * 0.6, (d) => (d < 0.45 ? 'l' : d < 0.8 ? 'y' : 'x'));
  f.set(5 + sway, i ? 1 : 0, 'y');
  f.outline('Z');
  c.blit(f, 0, 0, { under: true });
}, { rate: 5, note: '둑의 횃불 기둥 (2프레임)' });

prop('armor', 22, 40, 1, (c) => {
  const a = new Cv(22, 40);
  a.rect(4, 36, 17, 39, 'o');
  a.rect(4, 36, 17, 36, 'p');
  a.rect(10, 28, 11, 36, 'O');
  a.ellipse(10.5, 21, 7, 8, (d, x) => (x < 9 ? 'l' : d < 0.7 ? 'm' : 'M'));
  a.rect(4, 14, 17, 16, 'm');
  a.ellipse(3.5, 15, 2.5, 2.5, 'M');
  a.ellipse(17.5, 15, 2.5, 2.5, 'M');
  a.rect(7, 22, 14, 23, 'Y');
  a.ellipse(10.5, 7, 5, 6, (d, x) => (x < 9 ? 'l' : 'm'));
  a.rect(7, 7, 14, 8, 'K');
  a.rect(10, 0, 11, 2, 'X');
  a.rect(9, 0, 12, 0, 'x');
  a.edge('L');
  c.blit(a, 0, 0);
}, { note: '의례용 갑옷 (장식)' });

prop('vase', 16, 28, 1, (c) => {
  const v = new Cv(16, 28);
  v.rect(3, 18, 12, 27, 't');
  v.rect(3, 18, 5, 27, 'r');
  v.rect(2, 17, 13, 18, 'r');
  v.rect(2, 26, 13, 27, 'T');
  v.ellipse(7.5, 12, 4.5, 5, (d, x) => (x < 6 ? 'b' : d < 0.7 ? 'n' : 'N'));
  v.rect(6, 5, 9, 7, 'n');
  v.rect(5, 12, 10, 12, 'y');
  for (const [x, y] of [[4, 2], [7, 0], [11, 2], [9, 3], [5, 4]]) v.disc(x, y + 1, 1, 'v');
  for (const [x, y] of [[6, 4], [8, 3], [10, 4]]) v.set(x, y, 'g');
  v.edge('R');
  c.blit(v, 0, 0);
}, { note: '꽃병 (장식)' });

/** 조사할 수 있다는 표시 (머리 위, 2프레임) */
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
}, { rate: 3, note: '조사 표시' });

// =====================================================================
// 1막 타일과 물건 (기존 번호를 지키려고 맨 뒤에 붙인다)
// =====================================================================
/** 수로의 젖은 돌길 */
function sewerFloor(c, seed) {
  const rnd = rng(seed);
  c.rect(0, 0, 31, 31, 'R');
  for (let y = 0; y < 32; y += 8)
    for (let x = (y / 8) % 2 ? -8 : 0; x < 32; x += 16) {
      c.rect(Math.max(0, x), y, Math.min(31, x + 14), y + 6, rnd() < 0.5 ? 'T' : 'R');
      c.rect(Math.max(0, x), y, Math.min(31, x + 14), y, 'T');
    }
  for (let k = 0; k < 5; k++) c.set(rnd() * 31, rnd() * 31, rnd() < 0.5 ? 'W' : 'G');
}
tile('sewer_floor', (c) => sewerFloor(c, 41), { note: '수로 돌길' });
tile('sewer_floor2', (c) => {
  sewerFloor(c, 43);
  c.ellipse(20, 20, 6, 2.5, 'W'); // 물웅덩이
  c.rect(17, 19, 20, 19, 'A');
}, { note: '수로 돌길 (물웅덩이)' });
tile('sewer_edge', (c) => {
  sewerFloor(c, 47);
  c.rect(0, 27, 31, 31, 'T');
  c.rect(0, 27, 31, 27, 't');
  c.rect(0, 31, 31, 31, 'k');
}, { note: '수로 돌길 가장자리 (아래가 물)' });
/** 탁한 수로 물 */
function sewerWater(c, seed) {
  const rnd = rng(seed);
  c.rect(0, 0, 31, 31, 'k');
  for (let i = 0; i < 8; i++) {
    const x = rnd() * 26;
    const y = 2 + rnd() * 28;
    c.rect(x, y, x + 2 + rnd() * 4, y, rnd() < 0.5 ? 'Q' : 'W');
  }
  for (let i = 0; i < 2; i++) c.set(rnd() * 31, rnd() * 31, 'G');
}
tile('sewer_water', (c) => sewerWater(c, 51), { solid: true, note: '수로 물' });
tile('sewer_water2', (c) => sewerWater(c, 53), { solid: true, note: '수로 물 (다른 물결)' });
/** 수로 벽돌 (위에서 본 벽 윗면, 앞면) */
tile('sewer_wall_top', (c) => {
  c.rect(0, 0, 31, 31, 'K');
  for (let y = 3; y < 32; y += 8) c.rect(0, y, 31, y, 'k');
  c.rect(0, 0, 31, 0, 'R');
}, { solid: true, note: '수로 벽 윗면' });
tile('sewer_wall', (c) => {
  const rnd = rng(57);
  c.rect(0, 0, 31, 31, 'R');
  for (let y = 0; y < 32; y += 6) {
    c.rect(0, y + 5, 31, y + 5, 'k');
    for (let x = (y / 6) % 2 ? 5 : 0; x < 32; x += 11) c.rect(x, y, x, y + 5, 'k');
    for (let x = 0; x < 32; x++) if (rnd() < 0.08) c.set(x, y + 1, 'T');
  }
  // 이끼와 물자국
  for (let x = 0; x < 32; x++) if (rnd() < 0.3) c.rect(x, 26 + Math.floor(rnd() * 4), x, 31, 'Q');
}, { solid: true, note: '수로 벽 앞면 (벽돌, 이끼)' });

/** 저수조 (둥근 벽 안쪽, 물은 sewer_water 그대로) */
tile('cistern_floor', (c) => {
  sewerFloor(c, 61);
  for (let x = 0; x < 32; x += 4) c.set(x, 15, 'k');
}, { note: '저수조 가장자리 돌길' });

/** 은신처: 염색 공방 지하 (흙 바닥, 회벽) */
tile('cellar_floor', (c) => {
  const rnd = rng(71);
  c.rect(0, 0, 31, 31, 'D');
  for (let k = 0; k < 14; k++) c.set(rnd() * 31, rnd() * 31, rnd() < 0.5 ? 'C' : 'd');
  for (let k = 0; k < 3; k++) c.set(rnd() * 31, rnd() * 31, 'u'); // 염료 얼룩
}, { note: '염색 공방 지하 흙바닥' });
tile('cellar_wall', (c) => {
  c.rect(0, 0, 31, 31, 'V');
  c.rect(0, 26, 31, 31, 'O');
  c.rect(0, 26, 31, 26, 'P');
  for (let y = 4; y < 26; y += 7) c.rect(0, y, 31, y, 't');
  c.ellipse(9, 14, 3, 5, 'u');
  c.ellipse(24, 9, 2, 3, 'X');
}, { solid: true, note: '공방 지하 회벽 (염료 자국)' });

/** 빈민가: 진흙 길, 녹다 만 눈, 판잣집 */
function mud(c, seed, snow) {
  const rnd = rng(seed);
  c.rect(0, 0, 31, 31, 'D');
  for (let k = 0; k < 16; k++) c.set(rnd() * 31, rnd() * 31, rnd() < 0.5 ? 'C' : 'd');
  if (snow) {
    c.ellipse(10, 9, 7, 4, (d) => (d < 0.7 ? 'v' : 'V'));
    c.ellipse(24, 24, 5, 3, (d) => (d < 0.7 ? 'v' : 'V'));
  }
}
tile('mud', (c) => mud(c, 81, false), { note: '빈민가 진흙 길' });
tile('mud_snow', (c) => mud(c, 83, true), { note: '빈민가 진흙 길 (녹다 만 눈)' });
tile('shack_wall', (c) => {
  c.rect(0, 0, 31, 31, 'o');
  for (let x = 0; x < 32; x += 6) {
    c.rect(x, 0, x, 31, 'P');
    c.rect(x + 1, 0, x + 1, 31, 'p');
  }
  c.rect(0, 12, 31, 13, 'O');
  c.rect(0, 30, 31, 31, 'P');
}, { solid: true, note: '판잣집 벽' });
tile('shack_roof', (c) => {
  c.rect(0, 0, 31, 31, 'Z');
  for (let y = 2; y < 32; y += 5) c.rect(0, y, 31, y, 'X');
  // 녹다 만 눈
  c.rect(0, 0, 31, 4, 'v');
  for (let x = 0; x < 32; x += 3) c.rect(x, 5, x, 6 + (x % 4), 'V');
}, { solid: true, note: '판잣집 지붕 (눈)' });

/** 다리, 강둑 */
tile('bridge', (c) => {
  for (let y = 0; y < 32; y += 8) {
    c.rect(0, y, 31, y + 6, 'o');
    c.rect(0, y, 31, y, 'p');
    c.rect(0, y + 7, 31, y + 7, 'P');
  }
  for (const x of [3, 28]) for (let y = 1; y < 32; y += 8) c.set(x, y + 3, 'O');
}, { note: '나무 다리 판' });
tile('grass', (c) => {
  const rnd = rng(91);
  c.rect(0, 0, 31, 31, 'g');
  for (let k = 0; k < 22; k++) {
    const x = rnd() * 31;
    const y = rnd() * 30;
    c.set(x, y, rnd() < 0.5 ? 'G' : 'q');
    c.set(x, y + 1, 'G');
  }
}, { note: '풀밭' });
tile('sand', (c) => {
  const rnd = rng(93);
  c.rect(0, 0, 31, 31, 'c');
  for (let k = 0; k < 18; k++) c.set(rnd() * 31, rnd() * 31, rnd() < 0.6 ? 'd' : 'D');
}, { note: '물가 모랫길' });
tile('river', (c) => {
  const rnd = rng(95);
  c.rect(0, 0, 31, 31, 'A');
  for (let i = 0; i < 8; i++) {
    const x = rnd() * 26;
    const y = 2 + rnd() * 28;
    c.rect(x, y, x + 3 + rnd() * 5, y, rnd() < 0.6 ? 'a' : 'W');
  }
}, { solid: true, note: '강물 (낮)' });

// ---- 1막 물건 ----
prop('scorch', 28, 30, 1, (c) => {
  // 벽에 줄지어 찍힌 하얀 손바닥 자국
  for (const [x, y] of [[4, 6], [14, 14], [22, 4]]) {
    c.ellipse(x + 2, y + 5, 2.6, 3, 'V');
    for (let f = 0; f < 4; f++) c.rect(x + f * 1.3, y, x + f * 1.3, y + 2, 'V');
    c.set(x + 2, y + 5, 'v');
  }
}, { note: '벽의 하얀 그을린 손자국 (wall)' });
prop('bones', 30, 16, 1, (c) => {
  c.line(2, 12, 16, 9, 'V', 2);
  c.disc(2, 12, 2, 'v');
  c.disc(16, 9, 2, 'v');
  c.ellipse(23, 9, 5, 4, (d) => (d < 0.6 ? 'v' : 'V'));
  c.set(21, 9, 'k');
  c.set(25, 9, 'k');
  c.line(8, 15, 26, 14, 'V');
  c.outline('T');
}, { note: '저수조 가장자리의 뼈' });
prop('coins', 18, 10, 1, (c) => {
  for (const [x, y] of [[4, 6], [9, 7], [13, 6], [7, 4], [11, 3], [9, 1]]) c.ellipse(x, y + 1, 2.4, 1.4, (d) => (d < 0.5 ? 'y' : 'Y'));
  c.outline('O');
}, { note: '옛 동전 더미 (숨겨진 장소)' });
prop('ladder', 24, 64, 1, (c) => {
  c.rect(3, 0, 5, 63, 'M');
  c.rect(18, 0, 20, 63, 'M');
  for (let y = 4; y < 64; y += 9) c.rect(3, y, 20, y + 1, 'm');
  c.edge('L');
}, { note: '벽에 붙은 쇠사다리 (저수조 출구)' });
prop('rune_float', 16, 16, 4, (c, i) => {
  const a = (i / 4) * Math.PI * 2;
  c.disc(8, 8, 6.5, (t) => (t > 0.8 ? 'I' : '.'));
  for (let k = 0; k < 3; k++) {
    const ang = a + (k * Math.PI * 2) / 3;
    c.line(8, 8, 8 + Math.cos(ang) * 5, 8 + Math.sin(ang) * 5, 'i');
  }
  c.disc(8, 8, 1.5, 'v');
}, { rate: 6, note: '물 위에서 도는 보랏빛 룬' });
prop('dye_vat', 30, 30, 1, (c) => {
  c.rect(2, 8, 27, 29, (x) => (x < 6 ? 'p' : x > 23 ? 'O' : 'o'));
  for (const y of [12, 24]) c.rect(2, y, 27, y + 1, 'L');
  c.ellipse(14.5, 8, 12.5, 4, 'o');
  c.ellipse(14.5, 8, 10.5, 3, (d) => (d < 0.6 ? 'u' : 'I'));
  c.edge('P');
}, { note: '염료 통' });
prop('rune_table', 40, 30, 1, (c) => {
  c.rect(1, 6, 38, 17, 'o');
  c.rect(1, 6, 38, 7, 'p');
  c.rect(1, 17, 38, 18, 'O');
  for (const x of [3, 34]) c.rect(x, 18, x + 2, 29, 'O');
  // 탁자에 그린 룬, 보랏빛 종이 묶음
  c.ellipse(13, 12, 7, 3.5, (d) => (d > 0.75 ? 'i' : '.'));
  c.line(9, 12, 17, 12, 'i');
  c.rect(26, 9, 33, 13, 'i');
  c.rect(26, 11, 33, 11, 'u');
  c.edge('P');
}, { note: '룬이 그려진 탁자 (보랏빛 종이)' });
prop('straw_bed', 56, 30, 1, (c) => {
  c.ellipse(28, 18, 26, 10, (d) => (d < 0.5 ? 'y' : d < 0.85 ? 'Y' : 'O'));
  const rnd = rng(7);
  for (let k = 0; k < 30; k++) {
    const x = 6 + rnd() * 44;
    const y = 12 + rnd() * 12;
    c.line(x, y, x + 3, y - 1, 'O');
  }
  c.rect(8, 14, 20, 20, 'V'); // 마른 천
  c.edge('P');
}, { note: '짚 침대' });
prop('cloth', 30, 44, 1, (c) => {
  c.rect(0, 0, 29, 1, 'P');
  for (const [x, col] of [[2, 'u'], [11, 'X'], [20, 'a']]) {
    c.rect(x, 2, x + 7, 40, col);
    for (let y = 6; y < 40; y += 5) c.set(x + 3, y, 'k');
  }
}, { note: '마른 천 (줄에 걸린 염색 천)' });
prop('measure_paper', 22, 26, 1, (c) => {
  c.rect(0, 0, 21, 25, 'v');
  for (let y = 3; y < 20; y += 2) c.rect(2, y, 19, y, 'T');
  for (let y = 20; y < 25; y += 2) c.rect(2, y, 19, y, 'X');
  c.edge('V');
}, { note: '벽에 붙은 측정 기록 (wall)' });
prop('notice', 22, 28, 1, (c) => {
  c.rect(0, 0, 21, 27, 'V');
  c.rect(3, 2, 18, 4, 'K');
  for (let y = 8; y < 24; y += 3) c.rect(3, y, 18, y, 'T');
  c.rect(0, 0, 21, 0, 'K');
  c.edge('D');
}, { note: '국상 공고문 (wall)' });
prop('wanted', 18, 22, 1, (c) => {
  c.rect(0, 0, 17, 21, 'v');
  c.rect(3, 2, 14, 3, 'X');
  c.disc(6, 10, 3, 'S');
  c.disc(12, 10, 3, 'S');
  c.rect(3, 15, 14, 15, 'T');
  c.rect(3, 18, 14, 18, 'T');
  c.edge('V');
}, { note: '벽의 수배 전단 (wall)' });
prop('palisade', 32, 44, 1, (c) => {
  for (const x of [1, 9, 17, 25]) {
    c.rect(x, 6, x + 5, 43, (xx) => (xx === x ? 'p' : xx === x + 5 ? 'O' : 'o'));
    for (let k = 0; k < 3; k++) c.rect(x + 1 + k, 5 - k * 2, x + 4 - k, 5 - k * 2 + 1, 'o');
  }
  c.rect(0, 18, 31, 20, 'O');
  c.rect(0, 34, 31, 36, 'O');
  c.edge('P');
}, { note: '검문소 목책' });
prop('reeds', 32, 40, 2, (c, i) => {
  const rnd = rng(13);
  for (let k = 0; k < 11; k++) {
    const x = 2 + rnd() * 28;
    const h = 22 + rnd() * 16;
    const sway = i === 1 ? 2 : 0;
    c.line(x, 39, x + sway + (rnd() - 0.5) * 3, 39 - h, rnd() < 0.5 ? 'd' : 'D');
    c.ellipse(x + sway, 39 - h + 2, 1.2, 3, 'O');
  }
}, { rate: 2, note: '갈대' });
prop('boat', 72, 32, 1, (c) => {
  c.ellipse(36, 14, 34, 12, (d, x, y) => (y < 12 ? '.' : d < 0.55 ? 'o' : d < 0.85 ? 'O' : 'P'));
  c.rect(4, 12, 67, 15, 'p');
  c.rect(4, 12, 67, 12, 'c');
  for (const x of [22, 46]) c.rect(x, 13, x + 3, 22, 'O'); // 앉는 판
  c.line(10, 17, 30, 8, 'O', 2); // 노
  c.edge('P');
}, { note: '버려진 작은 배' });


// ---- 이야기 화면 가운데에 크게 띄우는 아이템 그림 (public/assets/items/) ----
const ITEMS = []; // { key, cv }
function item(key, w, h, draw) {
  const c = new Cv(w, h);
  draw(c);
  ITEMS.push({ key, cv: c });
}
item('pendant', 48, 48, (c) => {
  // 끊어진 은 사슬과 눈 모양 펜던트, 가운데 새겨진 빛
  for (let i = 0; i < 9; i++) {
    c.ellipse(8 + i * 2, 4 + i * 1.6, 1.3, 1, i % 2 ? 'm' : 'M');
    if (i < 6) c.ellipse(41 - i * 2, 4 + i * 1.6, 1.3, 1, i % 2 ? 'm' : 'M');
  }
  c.ellipse(24, 28, 18, 10, (d) => (d < 0.7 ? 'm' : 'M'));
  c.ellipse(24, 28, 14, 7, (d) => (d < 0.6 ? 'l' : 'm'));
  c.disc(24, 28, 5.5, (t) => (t < 0.45 ? 'y' : 'Y'));
  c.disc(24, 28, 2, 'v');
  for (const [dx, dy] of [[0, -9], [0, 9], [-9, 0], [9, 0]]) c.line(24 + dx * 0.7, 28 + dy * 0.5, 24 + dx, 28 + dy * 0.75, 'Y');
  c.set(30, 22, 'v');
  c.set(31, 21, 'v');
  c.edge('L');
});
item('wanted_poster', 64, 84, (c) => {
  c.rect(0, 0, 63, 83, 'V');
  c.rect(2, 2, 61, 81, 'v');
  c.rect(6, 6, 57, 13, 'X'); // 붉은 제목 띠
  c.rect(6, 6, 57, 6, 'x');
  // 얼굴 둘 (레온: 갈색 머리 / 갈리아: 은빛 머리)
  const face = (x, hair) => {
    c.rect(x, 18, x + 21, 43, 'V');
    c.ellipse(x + 11, 33, 7, 8, (d) => (d < 0.7 ? 's' : 'S'));
    c.ellipse(x + 11, 26, 8, 5, (d) => (d < 0.6 ? hair[0] : hair[1]));
    c.set(x + 8, 33, 'k');
    c.set(x + 14, 33, 'k');
    c.rect(x + 9, 38, x + 13, 38, 'S');
    c.rect(x + 2, 42, x + 20, 43, hair[1]);
  };
  face(7, ['h', 'H']);
  face(35, ['m', 'M']);
  for (let y = 50; y < 74; y += 4) c.rect(8, y, 55, y + 1, 'T');
  c.disc(48, 74, 5, 'X');
  c.disc(48, 74, 3, 'x');
  c.edge('D');
});

// ---------------------------------------------------------------------
// 파일 쓰기
// ---------------------------------------------------------------------
const txt = ['# 프롤로그 맵 그림 (tools/pixel-art/gen-palace.mjs가 만든 파일. 다시 실행하면 덮어씀)', ''];
for (const t of TILES) txt.push(`[pal_${t.key}]`, t.cv.text(), '');
for (const p of PROPS) p.frames.forEach((f, i) => txt.push(`[pal_${p.key}_${i}]`, f.text(), ''));
for (const it of ITEMS) txt.push(`[item_${it.key}]`, it.cv.text(), '');
writeFileSync(join(HERE, 'art', 'palace.txt'), txt.join('\n'));

const COLS = 8;
const outputs = [];
const sprites = {
  _설명: 'tools/pixel-art/gen-palace.mjs가 만든 파일 (직접 고치지 말 것). tiles.names 순서 = 타일 번호',
  tiles: {
    file: 'assets/explore/palace_tiles.png',
    size: 32,
    columns: COLS,
    names: TILES.map((t) => t.key),
    solid: TILES.filter((t) => t.solid).map((t) => t.key),
    notes: Object.fromEntries(TILES.map((t) => [t.key, t.note])),
  },
  props: {},
};
outputs.push({ file: 'public/assets/explore/palace_tiles.png', cell: [32, 32], columns: COLS, frames: TILES.map((t) => `pal_${t.key}`) });
for (const p of PROPS) {
  const file = `public/assets/explore/${p.key}.png`;
  outputs.push({ file, cell: [p.w, p.h], frames: p.frames.map((_, i) => `pal_${p.key}_${i}`) });
  sprites.props[p.key] = { file: file.replace('public/', ''), w: p.w, h: p.h, frames: p.frames.length, rate: p.rate, note: p.note };
}
for (const it of ITEMS) outputs.push({ file: `public/assets/items/${it.key}.png`, cell: [it.cv.w, it.cv.h], frames: [`item_${it.key}`] });
// 확인용 한 장
const CELL = 144;
const pv = [
  ...TILES.map((t) => ({ layers: [{ art: `pal_${t.key}`, x: 20, y: 20 }] })),
  ...PROPS.flatMap((p) => p.frames.map((_, i) => ({ layers: [{ art: `pal_${p.key}_${i}`, x: Math.max(0, Math.floor((CELL - p.w) / 2)), y: Math.max(0, CELL - p.h) }] }))),
];
outputs.push({ file: 'tools/pixel-art/preview_palace.png', cell: [CELL, CELL], columns: 10, frames: pv, background: 'K', scale: 1 });

writeFileSync(join(HERE, 'palace-outputs.json'), JSON.stringify(outputs));
mkdirSync(join(ROOT, 'src/data/explore'), { recursive: true });
writeFileSync(join(ROOT, 'src/data/explore/sprites.json'), JSON.stringify(sprites, null, 2));
console.log(`타일 ${TILES.length}종, 물건 ${PROPS.length}종 → art/palace.txt`);
