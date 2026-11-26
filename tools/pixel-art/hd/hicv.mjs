// 고해상도 글자 캔버스: 예전 그림 코드(gen-palace.mjs 타일·물건, creatures.mjs 생물)를 2배 해상도에서 다시 그린다.
// 기준: docs/도트기준.md 3절 "다시 그린 타일·물건·생물"
//
// 예전 Cv와 쓰는 법은 같다(좌표·크기는 예전 논리 칸). 다른 점
//   - 도형(원·타원·띠·선)은 고해상도 칸마다 다시 계산한다 → 가장자리가 2배 매끄럽고, 작은 점도 둥글다
//   - 외곽선(outline·edge)은 고해상도 한 칸 굵기
//   - 색을 정하는 함수에 들어가는 좌표는 예전처럼 논리 칸(정수). 거리 d는 고해상도로 계산
// 다 그린 뒤 finish()가 새 팔레트로 바꾸면서
//   - 빛(왼쪽 위)을 받는 가장자리 한 칸을 한 단계 밝게
//   - 넓게 같은 색인 곳에 고해상도 결(한 단계 밝음·어둠 점)을 성기게 넣는다 (자리로 정해지는 무늬라 실행마다 같음)
// 옛 그림을 2배로 늘리고 색만 옮기는 방식(remap.mjs)은 더 이상 쓰지 않는다.
import { readFileSync } from 'node:fs';
import { RAMPS } from '../palette.mjs';
import { Layer, darker, lighter } from './layer.mjs';
import { nearest } from './remap.mjs';
export { rng } from '../cv.mjs';

const S = 2; // 해상도 배수

export class HiCv {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.W = w * S;
    this.H = h * S;
    this.d = Array.from({ length: this.H }, () => Array(this.W).fill('.'));
  }
  // 고해상도 칸 하나
  hset(X, Y, ch) {
    if (ch && ch !== '.' && X >= 0 && Y >= 0 && X < this.W && Y < this.H) this.d[Y][X] = ch;
  }
  // 고해상도 칸 가운데의 논리 좌표
  static lx(X) {
    return (X + 0.5) / S - 0.5;
  }
  set(x, y, ch) {
    const X = Math.round(x * S);
    const Y = Math.round(y * S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) this.hset(X + i, Y + j, ch);
  }
  get(x, y) {
    const X = Math.round(x * S);
    const Y = Math.round(y * S);
    return X >= 0 && Y >= 0 && X < this.W && Y < this.H ? this.d[Y][X] : '.';
  }
  clone() {
    const c = new HiCv(this.w, this.h);
    c.d = this.d.map((r) => [...r]);
    return c;
  }
  blit(src, ox, oy, o = {}) {
    const OX = Math.round(ox * S);
    const OY = Math.round(oy * S);
    for (let y = 0; y < src.H; y++)
      for (let x = 0; x < src.W; x++) {
        let ch = src.d[y][o.flipX ? src.W - 1 - x : x];
        if (o.remap && o.remap[ch]) ch = o.remap[ch];
        if (ch === '.') continue;
        const X = OX + x;
        const Y = OY + y;
        if (o.under && X >= 0 && Y >= 0 && X < this.W && Y < this.H && this.d[Y][X] !== '.') continue;
        this.hset(X, Y, ch);
      }
    return this;
  }
  flipX() {
    const c = this.clone();
    c.d = c.d.map((r) => r.reverse());
    return c;
  }
  rot90() {
    const c = new HiCv(this.h, this.w);
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) c.d[x][this.H - 1 - y] = this.d[y][x];
    return c;
  }
  outline(ch, diag = false) {
    const src = this.d.map((r) => [...r]);
    const n = diag
      ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let y = 0; y < this.H; y++)
      for (let x = 0; x < this.W; x++) {
        if (src[y][x] !== '.') continue;
        if (n.some(([dx, dy]) => (src[y + dy]?.[x + dx] ?? '.') !== '.')) this.d[y][x] = ch;
      }
    return this;
  }
  edge(ch) {
    const src = this.d.map((r) => [...r]);
    for (let y = 0; y < this.H; y++)
      for (let x = 0; x < this.W; x++) {
        if (src[y][x] === '.') continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (src[y + dy]?.[x + dx] ?? '.') === '.')) this.d[y][x] = ch;
      }
    return this;
  }
  map(fn) {
    for (let y = 0; y < this.H; y++)
      for (let x = 0; x < this.W; x++) this.d[y][x] = fn(this.d[y][x], Math.floor(x / S), Math.floor(y / S)) ?? this.d[y][x];
    return this;
  }
  // ---- 도형 (고해상도 칸마다 계산) ----
  _area(x0, y0, x1, y1, f) {
    for (let Y = Math.floor(y0 * S) - 1; Y <= Math.ceil(y1 * S) + S; Y++)
      for (let X = Math.floor(x0 * S) - 1; X <= Math.ceil(x1 * S) + S; X++) f(X, Y, HiCv.lx(X), HiCv.lx(Y), Math.floor(X / S), Math.floor(Y / S));
  }
  disc(cx, cy, r, c) {
    this._area(cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, (X, Y, x, y, ix, iy) => {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r + 0.25) this.hset(X, Y, typeof c === 'function' ? c(Math.min(1, d / Math.max(r, 0.01)), ix, iy) : c);
    });
    return this;
  }
  ellipse(cx, cy, rx, ry, c) {
    this._area(cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1, (X, Y, x, y, ix, iy) => {
      const d = Math.hypot((x - cx) / (rx + 0.25), (y - cy) / (ry + 0.25));
      if (d <= 1) this.hset(X, Y, typeof c === 'function' ? c(d, ix, iy) : c);
    });
    return this;
  }
  band(cx, cy, r0, r1, a0, a1, c, sy = 1) {
    const R = r1 + 1;
    this._area(cx - R, cy - R * sy, cx + R, cy + R * sy, (X, Y, x, y, ix, iy) => {
      const dx = x - cx;
      const dy = (y - cy) / sy;
      const d = Math.hypot(dx, dy);
      if (d < r0 - 0.25 || d > r1 + 0.25) return;
      let a = Math.atan2(dy, dx);
      const lo = Math.min(a0, a1);
      const hi = Math.max(a0, a1);
      while (a < lo) a += Math.PI * 2;
      while (a > lo + Math.PI * 2) a -= Math.PI * 2;
      if (a > hi) return;
      const tr = r1 === r0 ? 0.5 : Math.max(0, Math.min(1, (d - r0) / (r1 - r0)));
      const ta = (a - a0) / (a1 - a0 || 1);
      this.hset(X, Y, typeof c === 'function' ? c(tr, ta, ix, iy) : c);
    });
    return this;
  }
  line(x0, y0, x1, y1, c, w = 1) {
    // 굵기 1 = 고해상도 2칸. 고해상도로 한 칸씩 나아가 계단이 잘다
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * S;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const ch = typeof c === 'function' ? c(t) : c;
      if (w <= 1) this.set(x, y, ch);
      else this.disc(x, y, (w - 1) / 2, ch);
    }
    return this;
  }
  rect(x0, y0, x1, y1, c) {
    for (let Y = Math.round(y0 * S); Y < Math.round((y1 + 1) * S); Y++)
      for (let X = Math.round(x0 * S); X < Math.round((x1 + 1) * S); X++)
        this.hset(X, Y, typeof c === 'function' ? c(Math.floor(X / S), Math.floor(Y / S)) : c);
    return this;
  }
  star(cx, cy, r, rays, ramp, rot = 0, core = 0.35) {
    for (let i = 0; i < rays; i++) {
      const a = rot + (i * Math.PI * 2) / rays;
      const len = i % 2 ? r * 0.6 : r;
      this.line(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len, (t) => (t < 0.4 ? ramp[0] : t < 0.75 ? ramp[1] : ramp[2]));
    }
    this.disc(cx, cy, r * core, (t) => (t < 0.6 ? ramp[0] : ramp[1]));
    return this;
  }
  text() {
    return this.d.map((r) => r.join('')).join('\n');
  }
}

// ---------------------------------------------------------------------
// 글자 → 새 팔레트, 마무리 손질
// ---------------------------------------------------------------------
const OLD = JSON.parse(readFileSync(new URL('../palette.json', import.meta.url), 'utf8'));
const hex2 = (n) => n.toString(16).padStart(2, '0');
const LETTER = {};
const ALPHA_LETTER = {};
for (const [k, v] of Object.entries(OLD)) {
  if (k.length !== 1 || !v.color) continue;
  if (v.alpha !== undefined && v.alpha < 1) {
    ALPHA_LETTER[k] = [v.color, v.alpha];
    continue;
  }
  const rgb = [1, 3, 5].map((i) => parseInt(v.color.slice(i, i + 2), 16));
  LETTER[k] = '#' + nearest(...rgb).map(hex2).join('');
}
const lum = (c) => {
  const v = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  return 0.3 * v[0] + 0.59 * v[1] + 0.11 * v[2];
};
const ramp = new Map();
for (const r of Object.values(RAMPS)) r.forEach((c, i) => ramp.has(c) || ramp.set(c, [r.length, i]));
// 자리로 정해지는 난수 (0~1)
const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** 흩뿌린 점: 칸 (x, y)가 대략 1/n 확률로 뽑힘 (key마다 다른 무늬) */
export function scatter(x, y, n, key = '') {
  let s = 0;
  for (const ch of key) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return hash(Math.round(x), Math.round(y), s) < 0.6 / n;
}

/**
 * 다 그린 캔버스 → Layer (고해상도 칸마다 새 팔레트 색). 반투명 글자는 Layer.alpha 에 따로 둔다.
 * o.rim: 왼쪽 위 가장자리 밝힘 (기본 켬), o.grain: 결 점 밀도 (기본 0.05, 0이면 끔), o.seed
 */
export function finish(cv, o = {}) {
  const W = cv.W;
  const H = cv.H;
  const L = new Layer(cv.w, cv.h);
  const src = cv.d.map((r) => r.map((ch) => (ch === '.' ? null : LETTER[ch] ?? null)));
  const rim = o.rim ?? true;
  const grain = o.grain ?? 0.03;
  const seed = o.seed ?? 1;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? (o.wrap ? src[(y + H) % H][(x + W) % W] : null) : src[y][x]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let c = src[y][x];
      if (!c) continue;
      const l = lum(c);
      const r = ramp.get(c);
      const up = at(x, y - 1);
      const left = at(x - 1, y);
      const edgeUp = !up || lum(up) < l * 0.6;
      const edgeLeft = !left || lum(left) < l * 0.6;
      // 가장 어두운 칸(외곽선)은 손대지 않음
      const isLine = r && r[1] >= r[0] - 1 && l < 70;
      if (!isLine && rim && (edgeUp || edgeLeft) && r && r[1] > 0) c = lighter(c, 1);
      else if (!isLine && grain > 0) {
        const same = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => at(x + dx, y + dy) === src[y][x]);
        if (same) {
          const h = hash(x, y, seed);
          if (h < grain * 0.6) c = darker(c, 1);
          else if (h > 1 - grain * 0.4 && r && r[1] > 0) c = lighter(c, 1);
        }
      }
      L.d[y][x] = c;
    }
  // 반투명 칸 (그림자 등)
  const alpha = [];
  cv.d.forEach((r, y) => r.forEach((ch, x) => ALPHA_LETTER[ch] && alpha.push([x, y, ...ALPHA_LETTER[ch]])));
  if (alpha.length) L.alpha = alpha;
  return L;
}

/** Layer(+alpha) → RGBA 바이트를 큰 판 data(너비 PW)의 (ox, oy)에 */
export function putRGBA(data, PW, L, ox, oy) {
  for (let y = 0; y < L.h; y++)
    for (let x = 0; x < L.w; x++) {
      const c = L.d[y][x];
      if (!c) continue;
      data.set([1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).concat(255), ((oy + y) * PW + ox + x) * 4);
    }
  for (const [x, y, c, a] of L.alpha ?? []) {
    const i = ((oy + y) * PW + ox + x) * 4;
    if (data[i + 3]) continue;
    data.set([1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16)).concat(Math.round(a * 255)), i);
  }
}
