// 예전 도트와 새 도트를 나란히 놓은 비교 그림 → docs/도트_샘플.png
// 실행: node tools/pixel-art/sample-hd.mjs (npm run art:hd 뒤에)
// 세 갈래: 예전(public/assets/_old/), 1차 샘플(커밋 151ce2e), 수정본(지금 파일)
//   왼쪽 띠 색: 회색 = 예전, 금색 = 1차, 하늘색 = 수정본. 3배로 키움
//   1. 맵 조각(벽·창·바닥·카펫 + 인물)  2. 인물 4방향과 걷기  3. 타일  4. 물건
import { writeFileSync, mkdtempSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPNG } from './png-read.mjs';
import { encodePNG } from './png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FIRST = '151ce2e'; // 1차 샘플 커밋
const TMP = mkdtempSync(join(tmpdir(), 'dot-sample-'));
let n = 0;
const fromGit = (rel) => {
  const f = join(TMP, `${n++}.png`);
  writeFileSync(f, execSync(`git show ${FIRST}:${rel}`, { cwd: ROOT, maxBuffer: 1 << 26 }));
  return readPNG(f);
};
// 판(version)마다 그림 읽기
const V = {
  old: { bar: [0x80, 0x84, 0x9a], img: (rel) => readPNG(join(ROOT, rel.replace('public/assets/', 'public/assets/_old/'))), h: 40, foot: 0, floors: [0, 0, 1, 0, 0, 0], mids: [3, 3, 3, 3, 3, 3] },
  first: { bar: [0xe8, 0xb8, 0x50], img: fromGit, h: 48, foot: 2, floors: [0, 80, 1, 0, 81, 0], mids: [3, 3, 3, 3, 3, 3] },
  now: { bar: [0x70, 0xa8, 0xe0], img: (rel) => readPNG(join(ROOT, rel)), h: 48, foot: 2, floors: [0, 82, 1, 80, 83, 0], mids: [3, 84, 3, 84, 3, 84] },
};
const ORDER = ['old', 'first', 'now'];

const W = 620;
const H = 900;
const d = new Uint8Array(W * H * 4);
const fill = (x0, y0, w, h, [r, g, b]) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) d.set([r, g, b, 255], (y * W + x) * 4);
};
const blit = (im, sx, sy, w, h, dx, dy) => {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (sx + x >= im.w || sy + y >= im.h) continue;
      const i = ((sy + y) * im.w + sx + x) * 4;
      const a = im.data[i + 3] / 255;
      if (!a || dx + x < 0 || dy + y < 0 || dx + x >= W || dy + y >= H) continue;
      const o = ((dy + y) * W + dx + x) * 4;
      for (let k = 0; k < 3; k++) d[o + k] = im.data[i + k] * a + d[o + k] * (1 - a);
    }
};
const shade = (x0, y0, w, h, a) => {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const o = (y * W + x) * 4;
      d[o] = d[o] * (1 - a) + 0x2a * a;
      d[o + 1] = d[o + 1] * (1 - a) + 0x1a * a;
      d[o + 2] = d[o + 2] * (1 - a) + 0x48 * a;
    }
};
const ellipse = (cx, cy, rx, ry, a) => {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) shade(x, y, 1, 1, a);
};
fill(0, 0, W, H, [0x3a, 0x40, 0x4e]);
const bar = (x, y, h, ver) => fill(x, y, 3, h, V[ver].bar);
const tile = (im, n, dx, dy) => blit(im, (n % 8) * 32, Math.floor(n / 8) * 32, 32, 32, dx, dy);

// 1. 맵 조각 (가로 6칸 x 세로 5칸), 세 판을 가로로
function scene(x0, y0, ver) {
  const v = V[ver];
  const T = v.img('public/assets/explore/palace_tiles.png');
  for (let c = 0; c < 6; c++) {
    const win = c === 3;
    tile(T, win ? 8 : 6, x0 + c * 32, y0);
    tile(T, win ? 9 : 7, x0 + c * 32, y0 + 32);
    tile(T, v.floors[c], x0 + c * 32, y0 + 64);
    tile(T, 2, x0 + c * 32, y0 + 96);
    tile(T, v.mids[c], x0 + c * 32, y0 + 128);
  }
  if (ver !== 'old') {
    shade(x0, y0 + 64, 192, 4, 0.35);
    shade(x0, y0 + 68, 192, 4, 0.18);
  }
  blit(v.img('public/assets/explore/pillar.png'), 0, 0, 32, 96, x0 + 8, y0 + 6);
  blit(v.img('public/assets/explore/torch.png'), 0, 0, 12, 22, x0 + 74, y0 + 20);
  const fy = y0 + 150;
  for (const [id, fx, frame] of [['leon', x0 + 120, 10], ['serena', x0 + 150, 5]]) {
    const sp = v.img(`public/assets/sprites/${id}.png`);
    ellipse(fx, fy, ver === 'old' ? 8 : 9, 3, ver === 'old' ? 0.4 : 0.35);
    blit(sp, (frame % 5) * 32, Math.floor(frame / 5) * v.h, 32, v.h, fx - 16, fy - v.h + v.foot);
  }
}
ORDER.forEach((ver, i) => {
  bar(4 + i * 204, 4, 160, ver);
  scene(9 + i * 204, 4, ver);
});

// 2. 인물: 4방향 서기 + 아래·옆 걷기 4프레임
function people(y, ver) {
  const v = V[ver];
  bar(4, y, 48, ver);
  let x = 10;
  for (const id of ['leon', 'serena']) {
    const sp = v.img(`public/assets/sprites/${id}.png`);
    for (let r = 0; r < 4; r++) {
      blit(sp, 0, r * v.h, 32, v.h, x, y + 48 - v.h);
      x += 26;
    }
    for (const row of [0, 2])
      for (let f = 1; f <= 4; f++) {
        blit(sp, f * 32, row * v.h, 32, v.h, x, y + 48 - v.h);
        x += 22;
      }
    x += 14;
  }
}
ORDER.forEach((ver, i) => people(176 + i * 54, ver));

// 3. 타일
function tiles(y, ver) {
  const v = V[ver];
  bar(4, y, 32, ver);
  const T = v.img('public/assets/explore/palace_tiles.png');
  const ids = { old: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], first: [0, 80, 81, 1, 2, 3, 4, 5, 6, 7, 8, 9], now: [0, 80, 81, 82, 83, 1, 2, 3, 84, 4, 5, 6, 7, 8, 9] }[ver];
  ids.forEach((n, i) => tile(T, n, 10 + i * 34, y));
}
ORDER.forEach((ver, i) => tiles(346 + i * 38, ver));

// 4. 물건 (세 판을 가로로)
function props(x0, y, ver) {
  const v = V[ver];
  bar(x0 - 6, y, 96, ver);
  let x = x0;
  for (const [name, w, h, frames] of [['pillar', 32, 96, 1], ['torch', 12, 22, 2], ['banner', 16, 44, 1], ['vase', 16, 28, 1], ['armor', 22, 40, 1]]) {
    const im = v.img(`public/assets/explore/${name}.png`);
    for (let f = 0; f < frames; f++) {
      blit(im, f * w, 0, w, h, x, y + 96 - h);
      x += w + 5;
    }
  }
}
ORDER.forEach((ver, i) => props(10 + i * 204, 466, ver));

// 5. 수정본 맵 조각을 크게 (가로 12칸, 레온·세레나 걷기)
{
  const v = V.now;
  const T = v.img('public/assets/explore/palace_tiles.png');
  const y0 = 574;
  bar(4, y0, 160, 'now');
  for (let c = 0; c < 18; c++) {
    const win = c % 6 === 3;
    tile(T, win ? 8 : 6, 9 + c * 32, y0);
    tile(T, win ? 9 : 7, 9 + c * 32, y0 + 32);
    tile(T, [0, 82, 1, 80, 83, 0, 81, 0, 82, 1, 0, 83, 80, 0, 1, 82, 0, 81][c], 9 + c * 32, y0 + 64);
    tile(T, 2, 9 + c * 32, y0 + 96);
    tile(T, c % 2 ? 84 : 3, 9 + c * 32, y0 + 128);
  }
  shade(9, y0 + 64, 576, 4, 0.35);
  shade(9, y0 + 68, 576, 4, 0.18);
  for (const px of [40, 232, 424]) blit(v.img('public/assets/explore/pillar.png'), 0, 0, 32, 96, 9 + px, y0 + 6);
  for (const px of [140, 332, 524]) blit(v.img('public/assets/explore/torch.png'), 0, 0, 12, 22, 9 + px, y0 + 20);
  const fy = y0 + 150;
  for (const [id, fx, frame] of [['serena', 250, 13], ['leon', 290, 11]]) {
    const sp = v.img(`public/assets/sprites/${id}.png`);
    ellipse(fx, fy, 9, 3, 0.35);
    blit(sp, (frame % 5) * 32, Math.floor(frame / 5) * 48, 32, 48, fx - 16, fy - 48 + 2);
  }
}

const S = 3;
const crop = 742;
const out = new Uint8Array(W * S * crop * S * 4);
for (let y = 0; y < crop * S; y++)
  for (let x = 0; x < W * S; x++) {
    const i = ((y / S | 0) * W + (x / S | 0)) * 4;
    out.set(d.subarray(i, i + 4), (y * W * S + x) * 4);
  }
writeFileSync(join(ROOT, 'docs/도트_샘플.png'), encodePNG(W * S, crop * S, out));
console.log('만듦 docs/도트_샘플.png');
