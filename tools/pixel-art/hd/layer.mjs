// 새 도트용 그림판: 칸마다 색(hex) 또는 null. 부위마다 한 장씩 그린 뒤 외곽선을 넣고 겹친다
//
// 고해상도(docs/도트기준.md 0절): 그림판은 논리 크기(32x48 인물, 32x32 타일)로 다루지만
// 실제 칸은 K배(2배)로 둔다. 도형(사각형·사다리꼴·타원·선)은 K배 해상도로 매끄럽게 칠하고,
// 외곽선은 고해상도 한 칸 굵기로 가늘게 들어간다. set()은 논리 한 칸(KxK)을, setHi()는 고해상도 한 칸을 칠한다.
// 색을 정하는 함수 c(x, y, ...)에는 논리 좌표(정수)가 들어간다.
// d, w, h는 고해상도 칸(그림 파일과 같은 크기), lw, lh는 논리 크기.
import { RAMPS } from '../palette.mjs';

export const K = 2;

// 색 → (묶음, 번호). 외곽선 = 같은 묶음에서 두 단계 어두운 색 (docs/도트기준.md)
const WHERE = new Map();
for (const [name, r] of Object.entries(RAMPS)) r.forEach((c, i) => WHERE.has(c) || WHERE.set(c, [name, i]));
export function darker(c, steps = 2) {
  const w = WHERE.get(c);
  if (!w) return c;
  const r = RAMPS[w[0]];
  return r[Math.min(r.length - 1, w[1] + steps)];
}
export function lighter(c, steps = 1) {
  const w = WHERE.get(c);
  if (!w) return c;
  return RAMPS[w[0]][Math.max(0, w[1] - steps)];
}

const call = (c, ...a) => (typeof c === 'function' ? c(...a) : c);

export class Layer {
  constructor(w = 32, h = 48, k = K) {
    this.lw = w;
    this.lh = h;
    this.k = k;
    this.w = w * k;
    this.h = h * k;
    this.d = Array.from({ length: this.h }, () => Array(this.w).fill(null));
  }
  /** 고해상도 한 칸 */
  getHi(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y][x] : null;
  }
  setHi(x, y, c) {
    if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y][x] = c;
  }
  /** 논리 한 칸 (가운데 고해상도 칸을 봄) */
  get(x, y) {
    const k = this.k;
    return this.getHi(Math.round(x) * k + (k >> 1), Math.round(y) * k + (k >> 1));
  }
  set(x, y, c) {
    if (!c) return;
    const k = this.k;
    const X = Math.round(x) * k;
    const Y = Math.round(y) * k;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) this.setHi(X + i, Y + j, c);
  }
  /** 논리 위치(소수)에 논리 한 칸 크기를 매끄럽게 (선·점용) */
  dot(x, y, c, size = 1) {
    const k = this.k;
    const s = Math.max(1, Math.round(size * k));
    const X = Math.round((x + 0.5) * k - s / 2);
    const Y = Math.round((y + 0.5) * k - s / 2);
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) this.setHi(X + i, Y + j, c);
  }
  clear(x, y) {
    const k = this.k;
    const X = Math.round(x) * k;
    const Y = Math.round(y) * k;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) if (X + i >= 0 && Y + j >= 0 && X + i < this.w && Y + j < this.h) this.d[Y + j][X + i] = null;
  }
  /** 이미 칠한 칸만 다시 칠함 */
  paint(x, y, c) {
    const k = this.k;
    const X = Math.round(x) * k;
    const Y = Math.round(y) * k;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) if (this.getHi(X + i, Y + j)) this.setHi(X + i, Y + j, c);
  }
  rect(x0, y0, x1, y1, c) {
    const k = this.k;
    for (let y = Math.round(y0); y <= Math.round(y1); y++)
      for (let x = Math.round(x0); x <= Math.round(x1); x++) {
        const col = call(c, x, y);
        if (!col) continue;
        for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) this.setHi(x * k + i, y * k + j, col);
      }
    return this;
  }
  /** 줄마다 왼쪽·오른쪽 끝이 바뀌는 모양. c(x, y, t, k) t: 0(왼쪽)~1(오른쪽), k: 0(위)~1(아래). 가장자리는 고해상도로 매끄럽게 */
  trap(y0, y1, l0, r0, l1, r1, c) {
    const k = this.k;
    for (let Y = y0 * k; Y < (y1 + 1) * k; Y++) {
      const ly = (Y + 0.5) / k - 0.5;
      const kk = y1 === y0 ? 0 : Math.max(0, Math.min(1, (ly - y0) / (y1 - y0)));
      const l = l0 + (l1 - l0) * kk;
      const r = r0 + (r1 - r0) * kk;
      const L0 = Math.round(l * k);
      const R0 = Math.round(r * k) + k - 1;
      const y = Math.floor(Y / k);
      for (let X = L0; X <= R0; X++) {
        const x = Math.floor(X / k);
        const t = Math.round(r) === Math.round(l) ? 0.5 : Math.max(0, Math.min(1, (x - Math.round(l)) / (Math.round(r) - Math.round(l))));
        this.setHi(X, Y, call(c, x, y, t, y1 === y0 ? 0 : Math.max(0, Math.min(1, (y - y0) / (y1 - y0)))));
      }
    }
    return this;
  }
  ellipse(cx, cy, rx, ry, c) {
    const k = this.k;
    for (let Y = Math.floor((cy - ry - 1) * k); Y <= Math.ceil((cy + ry + 1) * k); Y++)
      for (let X = Math.floor((cx - rx - 1) * k); X <= Math.ceil((cx + rx + 1) * k); X++) {
        const nx = ((X + 0.5) / k - cx) / rx;
        const ny = ((Y + 0.5) / k - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.setHi(X, Y, call(c, Math.floor(X / k), Math.floor(Y / k), nx, ny));
      }
    return this;
  }
  /** 굵기 w(논리 칸)인 선. c(t) t: 0(시작)~1(끝). 고해상도로 이어 그려 계단이 덜 진다 */
  line(x0, y0, x1, y1, c, w = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2 * this.k;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      this.dot(x, y, call(c, t), w);
    }
    return this;
  }
  /** 가장자리(바깥과 닿은 칸)를 그 색보다 두 단계 어두운 색으로 (고해상도 한 칸 굵기). skipBottom: 아래쪽 가장자리는 두지 않음 */
  outline(o = {}) {
    const src = this.d.map((r) => [...r]);
    const empty = (x, y) => x < 0 || y < 0 || x >= this.w || y >= this.h || !src[y][x];
    const sides = [[1, 0], [-1, 0], [0, -1]];
    if (!o.skipBottom) sides.push([0, 1]);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = src[y][x];
        if (!c) continue;
        if (sides.some(([dx, dy]) => empty(x + dx, y + dy))) this.d[y][x] = o.color ?? darker(c, o.steps ?? 2);
      }
    return this;
  }
  /** 다른 판을 위에 얹음 (dx, dy: 논리 칸) */
  over(o, dx = 0, dy = 0) {
    const DX = Math.round(dx * this.k);
    const DY = Math.round(dy * this.k);
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) if (o.d[y][x]) this.setHi(x + DX, y + DY, o.d[y][x]);
    return this;
  }
  /** 아래에 깖 (빈 칸만) */
  under(o, dx = 0, dy = 0) {
    const DX = Math.round(dx * this.k);
    const DY = Math.round(dy * this.k);
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) if (o.d[y][x] && !this.getHi(x + DX, y + DY)) this.setHi(x + DX, y + DY, o.d[y][x]);
    return this;
  }
  clone() {
    const l = new Layer(this.lw, this.lh, this.k);
    l.d = this.d.map((r) => [...r]);
    return l;
  }
  flipX() {
    const l = this.clone();
    l.d = l.d.map((r) => r.reverse());
    return l;
  }
  rot90() {
    const l = new Layer(this.lh, this.lw, this.k);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) l.d[x][this.h - 1 - y] = this.d[y][x];
    return l;
  }
  /** 칠한 칸의 범위 (논리 칸) */
  bounds() {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.d[y][x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const k = this.k;
    return { x0: Math.floor(x0 / k), y0: Math.floor(y0 / k), x1: Math.floor(x1 / k), y1: Math.floor(y1 / k) };
  }
  /** 예전 크기(1배) 그림을 K배로 키워 받음 (Scale2x로 대각선을 매끄럽게). src: 1배 Layer 또는 2차원 색 배열 */
  static fromLow(rows, k = K) {
    const h = rows.length;
    const w = rows[0].length;
    const L = new Layer(w, h, k);
    const up = scale2x(rows);
    for (let y = 0; y < h * 2; y++) for (let x = 0; x < w * 2; x++) if (up[y][x]) for (let j = 0; j < k / 2; j++) for (let i = 0; i < k / 2; i++) L.d[y * (k / 2) + j][x * (k / 2) + i] = up[y][x];
    return L;
  }
}

/** Scale2x(EPX): 2배로 키우되 계단 모서리를 둥글게. 글자 격자에도 쓸 수 있음(값을 ===로 비교) */
export function scale2x(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : rows[y][x] ?? null);
  const out = Array.from({ length: h * 2 }, () => Array(w * 2).fill(null));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const P = at(x, y);
      const A = at(x, y - 1);
      const B = at(x + 1, y);
      const C = at(x - 1, y);
      const D = at(x, y + 1);
      let e0 = P, e1 = P, e2 = P, e3 = P;
      if (C === A && C !== D && A !== B) e0 = A;
      if (A === B && A !== C && B !== D) e1 = B;
      if (D === C && D !== B && C !== A) e2 = C;
      if (B === D && B !== A && D !== C) e3 = D;
      out[y * 2][x * 2] = e0;
      out[y * 2][x * 2 + 1] = e1;
      out[y * 2 + 1][x * 2] = e2;
      out[y * 2 + 1][x * 2 + 1] = e3;
    }
  return out;
}
