// 새 도트용 그림판: 칸마다 색(hex) 또는 null. 부위마다 한 장씩 그린 뒤 외곽선을 넣고 겹친다
import { RAMPS } from '../palette.mjs';

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

export class Layer {
  constructor(w = 32, h = 48) {
    this.w = w;
    this.h = h;
    this.d = Array.from({ length: h }, () => Array(w).fill(null));
  }
  get(x, y) {
    x = Math.round(x);
    y = Math.round(y);
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y][x] : null;
  }
  set(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y][x] = c;
  }
  clear(x, y) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y][x] = null;
  }
  /** 이미 칠한 칸만 다시 칠함 */
  paint(x, y, c) {
    if (this.get(x, y)) this.set(x, y, c);
  }
  rect(x0, y0, x1, y1, c) {
    for (let y = Math.round(y0); y <= Math.round(y1); y++)
      for (let x = Math.round(x0); x <= Math.round(x1); x++) this.set(x, y, typeof c === 'function' ? c(x, y) : c);
    return this;
  }
  /** 줄마다 왼쪽·오른쪽 끝이 바뀌는 모양. c(x, y, t) t: 0(왼쪽)~1(오른쪽), k: 0(위)~1(아래) */
  trap(y0, y1, l0, r0, l1, r1, c) {
    for (let y = y0; y <= y1; y++) {
      const k = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
      const l = Math.round(l0 + (l1 - l0) * k);
      const r = Math.round(r0 + (r1 - r0) * k);
      for (let x = l; x <= r; x++) this.set(x, y, typeof c === 'function' ? c(x, y, r === l ? 0.5 : (x - l) / (r - l), k) : c);
    }
    return this;
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.set(x, y, typeof c === 'function' ? c(x, y, nx, ny) : c);
      }
    return this;
  }
  /** 굵기 w인 선. c(t) t: 0(시작)~1(끝) */
  line(x0, y0, x1, y1, c, w = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const col = typeof c === 'function' ? c(t) : c;
      if (w <= 1) this.set(x, y, col);
      else {
        const r = (w - 1) / 2;
        for (let yy = Math.round(y - r); yy <= Math.round(y + r); yy++) for (let xx = Math.round(x - r); xx <= Math.round(x + r); xx++) this.set(xx, yy, col);
      }
    }
    return this;
  }
  /** 가장자리(바깥과 닿은 칸)를 그 색보다 두 단계 어두운 색으로. skipBottom: 아래쪽 가장자리는 두지 않음 */
  outline(o = {}) {
    const src = this.d.map((r) => [...r]);
    const empty = (x, y) => x < 0 || y < 0 || x >= this.w || y >= this.h || !src[y][x];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = src[y][x];
        if (!c) continue;
        const sides = [[1, 0], [-1, 0], [0, -1]];
        if (!o.skipBottom) sides.push([0, 1]);
        if (sides.some(([dx, dy]) => empty(x + dx, y + dy))) this.d[y][x] = o.color ?? darker(c, o.steps ?? 2);
      }
    return this;
  }
  /** 다른 판을 위에 얹음 */
  over(o, dx = 0, dy = 0) {
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) if (o.d[y][x]) this.set(x + dx, y + dy, o.d[y][x]);
    return this;
  }
  /** 아래에 깖 (빈 칸만) */
  under(o, dx = 0, dy = 0) {
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) if (o.d[y][x] && !this.get(x + dx, y + dy)) this.set(x + dx, y + dy, o.d[y][x]);
    return this;
  }
  clone() {
    const l = new Layer(this.w, this.h);
    l.d = this.d.map((r) => [...r]);
    return l;
  }
  flipX() {
    const l = this.clone();
    l.d = l.d.map((r) => r.reverse());
    return l;
  }
  rot90() {
    const l = new Layer(this.h, this.w);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) l.d[x][this.h - 1 - y] = this.d[y][x];
    return l;
  }
  /** 칠한 칸의 범위 */
  bounds() {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.d[y][x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { x0, y0, x1, y1 };
  }
}
