// 작은 그림 새로 그리기: 나무, 집, 상자, 표지판, 말풍선 표시 (예전엔 글자 격자 art/objects.txt)
// 크기·발 자리는 예전과 같다(나무 64, 집 96, 상자·표지판 32, 말풍선 12). 고해상도 캔버스(hicv.mjs)로 그림
import { HiCv, rng } from './hicv.mjs';

/** 둥근 잎 뭉치: 왼쪽 위가 밝고 오른쪽 아래가 어두움, 가장자리에 잎 톱니 */
function leafClump(c, cx, cy, r, seed) {
  const rnd = rng(seed);
  c.disc(cx, cy, r, (d, x, y) => {
    const lx = (x - cx) / r;
    const ly = (y - cy) / r;
    const light = -lx * 0.6 - ly * 0.8;
    if (d > 0.82 && rnd() < 0.35) return 'G';
    return light > 0.45 ? 'q' : light > -0.25 ? 'g' : 'G';
  });
  // 잎 결: 밝은 쪽에 짧은 잎맥 두세 개
  for (let k = 0; k < 3; k++) {
    const a = -2.3 + rnd() * 1.2;
    const x0 = cx + Math.cos(a) * r * 0.45;
    const y0 = cy + Math.sin(a) * r * 0.45;
    c.line(x0, y0, x0 + 1.5, y0 + 1, 'g');
  }
}

export function tree() {
  const c = new HiCv(64, 64);
  // 줄기와 뿌리
  c.rect(27, 40, 36, 57, (x) => (x < 29.5 ? 'p' : x > 34 ? 'O' : 'o'));
  for (const [x0, x1] of [[27, 21], [36, 43]]) c.line(x0, 55, x1, 59, 'o', 3);
  c.rect(21, 58, 43, 59, 'O');
  for (let y = 43; y < 56; y += 4) c.line(31, y, 32, y + 2, 'O');
  // 잎: 뒤쪽 어두운 뭉치 → 앞쪽 밝은 뭉치
  const clumps = [[20, 30, 10], [44, 30, 10], [32, 34, 12], [16, 20, 9], [48, 20, 9], [26, 13, 10], [40, 13, 10], [32, 22, 11]];
  clumps.forEach(([x, y, r], i) => leafClump(c, x, y, r, 7 + i * 13));
  c.outline('Q');
  return c;
}

export function house() {
  const c = new HiCv(96, 96);
  // 벽 (회벽 + 나무 기둥)
  c.rect(14, 46, 81, 88, (x, y) => (y < 48 ? 'V' : 'v'));
  const rnd = rng(5);
  for (let k = 0; k < 70; k++) c.set(15 + rnd() * 65, 66 + rnd() * 21, 'V');
  for (const x of [14, 47, 80]) c.rect(x, 46, x + 1, 88, 'o');
  c.rect(14, 63, 81, 64, 'o');
  // 창문 둘 (덧창 테두리, 유리 반사, 화분)
  for (const x of [22, 62]) {
    c.rect(x, 50, x + 13, 60, 'O');
    c.rect(x + 1, 51, x + 12, 59, (X, Y) => (Y < 54 ? 'w' : 'a'));
    c.rect(x + 6, 51, x + 7, 59, 'O');
    c.rect(x + 1, 55, x + 12, 55.5, 'O');
    c.line(x + 2, 58, x + 4, 52, 'w');
    c.rect(x - 1, 61, x + 14, 62, 'o');
    for (let i = 0; i < 7; i++) c.disc(x + 1 + i * 2, 60.5, 0.8, ['G', 'y', 'g', 'X'][i % 4]);
  }
  // 문
  c.rect(40, 64, 54, 88, (x) => ((x - 40) % 4 < 0.6 ? 'O' : x < 43 ? 'p' : 'o'));
  c.rect(40, 64, 54, 65, 'O');
  c.disc(51.5, 77, 0.9, 'y');
  // 주춧돌
  c.rect(11, 87, 84, 91, (x, y) => (y < 88 ? 'r' : (Math.floor(x / 5) + Math.floor(y)) % 2 ? 't' : 'T'));
  // 지붕 (위로 좁아지는 사다리꼴, 기와 줄)
  for (let y = 12; y <= 45; y++) {
    const t = (y - 12) / 33;
    const x0 = 26 - t * 17;
    const x1 = 69 + t * 17;
    c.rect(x0, y, x1, y, (x) => {
      const row = Math.floor((y - 12) / 4);
      const off = row % 2 ? 3 : 0;
      const u = (x - x0 + off) % 6;
      const v = (y - 12) % 4;
      if (v >= 3) return 'Z';
      if (u < 0.6) return 'Z';
      return v < 1 ? 'x' : 'X';
    });
  }
  c.rect(9, 44, 86, 46, 'Z');
  // 굴뚝
  c.rect(61, 2, 70, 14, (x) => (x < 63 ? 'r' : x > 68 ? 'T' : 't'));
  c.rect(60, 1, 71, 3, 'r');
  c.outline('R');
  return c;
}

export function crate() {
  const c = new HiCv(32, 32);
  c.rect(4, 8, 27, 29, (x, y) => ((y - 8) % 5 < 0.6 ? 'O' : x < 6 ? 'p' : 'o'));
  c.rect(4, 8, 27, 11, (x) => (x % 6 < 0.6 ? 'o' : 'p')); // 윗면
  c.line(6, 13, 25, 27, 'O', 1);
  for (const x of [4, 26]) c.rect(x, 8, x + 1, 29, 'O');
  for (const [x, y] of [[4.5, 12], [26.5, 12], [4.5, 27], [26.5, 27]]) {
    c.rect(x - 0.5, y - 1, x + 0.5, y + 1, 'M');
    c.set(x, y - 1, 'l');
  }
  c.outline('P');
  return c;
}

export function sign() {
  const c = new HiCv(32, 32);
  c.rect(14, 16, 17, 30, (x) => (x < 15 ? 'p' : x > 16 ? 'O' : 'o'));
  c.rect(4, 4, 27, 17, (x, y) => (y < 5 ? 'p' : (y - 4) % 4.5 < 0.5 ? 'O' : 'o'));
  for (const [y, w] of [[7.5, 16], [10.5, 12], [13.5, 14]]) c.rect(8, y, 8 + w, y, 'P');
  c.disc(5.5, 5.5, 0.6, 'M');
  c.disc(26, 5.5, 0.6, 'M');
  c.outline('P');
  return c;
}

export function talkIcon() {
  const c = new HiCv(12, 12);
  c.ellipse(5.5, 4.5, 5, 3.6, 'v');
  c.line(3, 7, 2, 10, 'v', 1);
  for (const x of [3, 5.5, 8]) c.disc(x, 4.5, 0.6, 'T');
  c.outline('R');
  return c;
}

export const SMALLS = { tree, house, crate, sign, talk_icon: talkIcon };

// ---------------------------------------------------------------------
// 장식 소품 (16x16, 충돌 없음). 엔진이 맵마다 src/data/explore/decor.json 의 종류·밀도로 흩뿌림
// 칸마다 프레임 2장 (풀·꽃은 바람에 흔들림, 나머지는 같은 그림)
// ---------------------------------------------------------------------
const tuftDraw = (ramp, out) => (f) => {
  const c = new HiCv(16, 16);
  const sway = f ? 0.8 : 0;
  for (const [x, h, lean] of [[5, 7, -1.5], [7, 9, -0.5], [8.5, 10, 0.4], [10, 8, 1.2], [12, 6, 2]]) {
    c.line(x, 14, x + lean + sway, 14 - h, (t) => (t > 0.7 ? ramp[0] : t > 0.3 ? ramp[1] : ramp[2]));
  }
  c.outline(out);
  return c;
};
function flowers(f) {
  const c = new HiCv(16, 16);
  const sway = f ? 0.6 : 0;
  for (const [x, h, col] of [[5, 6, 'X'], [9, 8, 'v'], [12, 5, 'y']]) {
    c.line(x, 14, x + sway, 14 - h, 'g');
    c.disc(x + sway, 14 - h, 1.3, col);
    c.set(x + sway, 14 - h, 'y');
  }
  c.line(7, 14, 6.5, 11, 'G');
  c.outline('Q');
  return c;
}
function pebbles() {
  const c = new HiCv(16, 16);
  for (const [x, y, r] of [[6, 11, 2.2], [10.5, 12.5, 1.6], [8, 13.5, 1.1]]) c.ellipse(x, y, r, r * 0.75, (d, X, Y) => (Y < y - r * 0.2 ? 'r' : d < 0.7 ? 't' : 'T'));
  c.outline('R');
  return c;
}
function rubble() {
  const c = new HiCv(16, 16);
  c.rect(3, 11, 7, 13, (x, y) => (y < 12 ? 'r' : 't'));
  c.rect(8, 9, 12, 13, (x, y) => (y < 10 ? 'r' : x > 11 ? 'T' : 't'));
  c.line(5, 9, 6.5, 10.5, 'T');
  c.disc(13.5, 13, 0.9, 't');
  c.outline('R');
  return c;
}
function leaves() {
  const c = new HiCv(16, 16);
  for (const [x, y, col] of [[4, 11, 'x'], [8, 13, 'o'], [11, 10, 'Y'], [12.5, 13.5, 'x']]) {
    c.ellipse(x, y, 1.8, 0.9, col);
    c.set(x - 1, y, 'O');
  }
  return c;
}
function snowPile() {
  const c = new HiCv(16, 16);
  c.ellipse(8, 12.5, 6, 2.6, (d, x, y) => (y < 12 ? 'v' : d < 0.7 ? 'v' : 'V'));
  c.ellipse(6, 11, 2.5, 1.6, 'v');
  c.outline('m');
  return c;
}
function bones() {
  const c = new HiCv(16, 16);
  c.line(3, 12, 11, 10, 'v', 1);
  for (const [x, y] of [[3, 12], [11, 10]]) c.disc(x, y, 1.1, 'v');
  c.ellipse(12.5, 13, 2, 1.5, 'v');
  c.set(12, 13, 'T');
  c.outline('M');
  return c;
}
function mushrooms() {
  const c = new HiCv(16, 16);
  for (const [x, h, r] of [[6, 4, 2.6], [10.5, 3, 1.8]]) {
    c.rect(x - 0.5, 14 - h, x, 14, 'v');
    c.band(x, 14 - h, 0, r, Math.PI, Math.PI * 2, (tr) => (tr < 0.5 ? 'x' : 'X'));
    c.set(x - r * 0.4, 14 - h - r * 0.5, 'v');
  }
  c.outline('Z');
  return c;
}
function cobweb() {
  const c = new HiCv(16, 16);
  for (let k = 0; k < 5; k++) {
    const a = (k / 4) * (Math.PI / 2);
    c.line(1, 1, 1 + Math.cos(a) * 13, 1 + Math.sin(a) * 13, 'V');
  }
  for (const r of [5, 9, 12.5]) c.band(1, 1, r - 0.25, r + 0.25, 0, Math.PI / 2, 'V');
  return c;
}
function potShards() {
  const c = new HiCv(16, 16);
  c.band(7, 13, 2.5, 4, Math.PI * 1.05, Math.PI * 1.75, (tr) => (tr < 0.5 ? 'p' : 'o'), 0.8);
  c.ellipse(12, 13, 1.6, 1, 'o');
  c.ellipse(3.5, 13.5, 1.2, 0.8, 'p');
  c.outline('P');
  return c;
}
function emberRock() {
  const c = new HiCv(16, 16);
  c.ellipse(8, 12, 4.5, 3, (d, x, y) => (y < 11 ? 't' : d < 0.8 ? 'T' : 'R'));
  c.line(5.5, 12, 8, 11, 'x');
  c.line(8, 11, 10.5, 13, 'y');
  c.outline('k');
  return c;
}
function shrub(f) {
  const c = new HiCv(16, 16);
  const s = f ? 0.5 : 0;
  for (const [x, y, r] of [[5 + s, 11, 2.6], [10 + s, 11, 2.8], [7.5 + s, 8.5, 2.8]]) c.disc(x, y, r, (d, X, Y) => (Y < y - 1 ? 'c' : d < 0.7 ? 'd' : 'D'));
  c.outline('C');
  return c;
}
function puddle(f) {
  const c = new HiCv(16, 16);
  c.ellipse(8, 12.5, 5.5, 2.2, (d) => (d < 0.6 ? 'A' : 'W'));
  c.line(5.5 + f, 12, 7.5 + f, 12, 'a');
  return c;
}
const same = (d) => (f) => d(f);
export const DECOR = {
  tuft: tuftDraw(['q', 'g', 'G'], 'Q'),
  tuft_dry: tuftDraw(['c', 'd', 'D'], 'C'),
  flowers,
  pebbles: same(pebbles),
  rubble: same(rubble),
  leaves: same(leaves),
  snow_pile: same(snowPile),
  bones: same(bones),
  mushrooms: same(mushrooms),
  cobweb: same(cobweb),
  pot_shards: same(potShards),
  ember_rock: same(emberRock),
  shrub,
  puddle,
};
