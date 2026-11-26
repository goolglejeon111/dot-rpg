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
