// 예전 도트와 새 도트를 나란히 놓은 비교 그림 → docs/도트_샘플.png
// 실행: node tools/pixel-art/sample-hd.mjs (npm run art:hd 뒤에)
// 줄마다 위가 예전(public/assets/_old/), 아래가 새 도트. 3배로 키움
//   1. 맵 조각(벽·창·바닥·카펫 + 인물)  2. 인물 4방향(레온, 세레나)  3. 타일  4. 물건
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPNG } from './png-read.mjs';
import { encodePNG } from './png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const img = (rel) => readPNG(join(ROOT, rel));
const OLD = 'public/assets/_old/';
const NOW = 'public/assets/';

const W = 500;
const H = 470;
const d = new Uint8Array(W * H * 4);
const fill = (x0, y0, w, h, [r, g, b]) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) d.set([r, g, b, 255], (y * W + x) * 4);
};
/** 반투명까지 섞어서 얹음 */
const blit = (im, sx, sy, w, h, dx, dy) => {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = ((sy + y) * im.w + sx + x) * 4;
      const a = im.data[i + 3] / 255;
      if (!a || dx + x < 0 || dy + y < 0 || dx + x >= W || dy + y >= H) continue;
      const o = ((dy + y) * W + dx + x) * 4;
      for (let k = 0; k < 3; k++) d[o + k] = im.data[i + k] * a + d[o + k] * (1 - a);
    }
};
const shade = (x0, y0, w, h, a) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const o = (y * W + x) * 4;
    d[o] = d[o] * (1 - a) + 0x2a * a;
    d[o + 1] = d[o + 1] * (1 - a) + 0x1a * a;
    d[o + 2] = d[o + 2] * (1 - a) + 0x48 * a;
  }
};
const ellipse = (cx, cy, rx, ry, a) => {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) shade(x, y, 1, 1, a);
};

fill(0, 0, W, H, [0x3a, 0x40, 0x4e]);
// 줄 구분 띠: 예전(위)은 어두운 띠, 새(아래)는 밝은 띠
const band = (y, h, old) => fill(0, y, 4, h, old ? [0x80, 0x84, 0x9a] : [0xe8, 0xb8, 0x50]);

const tilesOld = img(`${OLD}explore/palace_tiles.png`);
const tilesNew = img(`${NOW}explore/palace_tiles.png`);
const tile = (im, n, dx, dy) => blit(im, (n % 8) * 32, Math.floor(n / 8) * 32, 32, 32, dx, dy);

// 1. 맵 조각 (가로 6칸 x 세로 5칸): 벽 위, 벽 아래, 바닥, 카펫 위, 카펫 가운데
function scene(x0, y0, hd) {
  const T = hd ? tilesNew : tilesOld;
  const cols = 6;
  for (let c = 0; c < cols; c++) {
    const win = c === 3;
    tile(T, win ? 8 : 6, x0 + c * 32, y0);
    tile(T, win ? 9 : 7, x0 + c * 32, y0 + 32);
    const fl = hd ? [0, 80, 1, 0, 81, 0][c] : [0, 0, 1, 0, 0, 0][c];
    tile(T, fl, x0 + c * 32, y0 + 64);
    tile(T, 2, x0 + c * 32, y0 + 96);
    tile(T, 3, x0 + c * 32, y0 + 128);
  }
  if (hd) {
    shade(x0, y0 + 64, cols * 32, 4, 0.35);
    shade(x0, y0 + 68, cols * 32, 4, 0.18);
  }
  // 물건: 기둥, 횃불
  const dir = hd ? NOW : OLD;
  const pil = img(`${dir}explore/pillar.png`);
  blit(pil, 0, 0, 32, 96, x0 + 8, y0 + 96 - 96 + 6);
  const tor = img(`${dir}explore/torch.png`);
  blit(tor, 0, 0, 12, 22, x0 + 74, y0 + 20);
  // 인물 (발밑이 카펫 가운데 줄)
  const fy = y0 + 150;
  const pw = hd ? 48 : 40;
  for (const [id, fx, frame] of [['leon', x0 + 120, 10], ['serena', x0 + 150, 5]]) {
    const sp = img(`${hd ? NOW : OLD}sprites/${id}.png`);
    ellipse(fx, fy, hd ? 9 : 8, 3, hd ? 0.35 : 0.4);
    const foot = hd ? 2 : 0;
    blit(sp, (frame % 5) * 32, Math.floor(frame / 5) * pw, 32, pw, fx - 16, fy - pw + foot);
  }
}
band(4, 160, true);
scene(8, 4, false);
band(4, 160, false);
fill(0, 4, 4, 160, [0x80, 0x84, 0x9a]);
fill(208, 4, 4, 160, [0xe8, 0xb8, 0x50]);
scene(216, 4, true);

// 2. 인물 4방향 (서기 프레임)
function people(y, hd) {
  band(y, 48, !hd);
  let x = 8;
  for (const id of ['leon', 'serena']) {
    const sp = img(`${hd ? NOW : OLD}sprites/${id}.png`);
    const ph = hd ? 48 : 40;
    for (let r = 0; r < 4; r++) {
      blit(sp, 0, r * ph, 32, ph, x, y + 48 - ph);
      x += 34;
    }
    // 걷기 (아래 방향 1~4)
    for (let f = 1; f <= 4; f++) {
      blit(sp, f * 32, 0, 32, ph, x, y + 48 - ph);
      x += 24;
    }
    x += 6;
  }
}
people(176, false);
people(228, true);

// 3. 타일: 바닥, 바닥2, 카펫 셋, 벽 윗면, 벽 위, 벽 아래, 창 위, 창 아래 (+ 새 바닥 갈래 둘)
function tiles(y, hd) {
  band(y, 32, !hd);
  const ids = hd ? [0, 80, 81, 1, 2, 3, 4, 5, 6, 7, 8, 9] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  ids.forEach((n, i) => tile(hd ? tilesNew : tilesOld, n, 8 + i * 34, y));
}
tiles(288, false);
tiles(324, true);

// 4. 물건: 기둥, 횃불 둘, 깃발, 꽃병, 갑옷
function props(y, hd) {
  band(y, 96, !hd);
  let x = 8;
  const dir = hd ? NOW : OLD;
  for (const [name, w, h, frames] of [['pillar', 32, 96, 1], ['torch', 12, 22, 2], ['banner', 16, 44, 1], ['vase', 16, 28, 1], ['armor', 22, 40, 1]]) {
    const im = img(`${dir}explore/${name}.png`);
    for (let f = 0; f < frames; f++) {
      blit(im, f * w, 0, w, h, x, y + 96 - h);
      x += w + 6;
    }
  }
}
props(364, false);
// 새 물건은 같은 줄 오른쪽에
function propsRight(y) {
  fill(210, y, 4, 96, [0xe8, 0xb8, 0x50]);
  let x = 220;
  for (const [name, w, h, frames] of [['pillar', 32, 96, 1], ['torch', 12, 22, 2], ['banner', 16, 44, 1], ['vase', 16, 28, 1], ['armor', 22, 40, 1]]) {
    const im = img(`${NOW}explore/${name}.png`);
    for (let f = 0; f < frames; f++) {
      blit(im, f * w, 0, w, h, x, y + 96 - h);
      x += w + 6;
    }
  }
}
propsRight(364);

// 3배
const S = 3;
const out = new Uint8Array(W * S * H * S * 4);
for (let y = 0; y < H * S; y++) for (let x = 0; x < W * S; x++) out.set(d.subarray(((y / S | 0) * W + (x / S | 0)) * 4, ((y / S | 0) * W + (x / S | 0)) * 4 + 4), (y * W * S + x) * 4);
writeFileSync(join(ROOT, 'docs/도트_샘플.png'), encodePNG(W * S, H * S, out));
console.log('만듦 docs/도트_샘플.png');
