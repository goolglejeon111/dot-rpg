// 글자 격자 캔버스 (gen-battle.mjs, gen-palace.mjs가 같이 씀)
// ---------------------------------------------------------------------
// 글자 격자 캔버스
// ---------------------------------------------------------------------
export class Cv {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = Array.from({ length: h }, () => Array(w).fill('.'));
  }
  static from(rows) {
    const c = new Cv(rows[0].length, rows.length);
    c.d = rows.map((r) => [...r]);
    return c;
  }
  set(x, y, ch) {
    x = Math.round(x);
    y = Math.round(y);
    if (ch && ch !== '.' && x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y][x] = ch;
  }
  get(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y][x] : '.';
  }
  clone() {
    const c = new Cv(this.w, this.h);
    c.d = this.d.map((r) => [...r]);
    return c;
  }
  /** 다른 캔버스를 (ox, oy)에 겹친다 */
  blit(src, ox, oy, o = {}) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        let ch = src.d[y][o.flipX ? src.w - 1 - x : x];
        if (o.remap && o.remap[ch]) ch = o.remap[ch];
        if (ch === '.') continue;
        if (o.under && this.get(ox + x, oy + y) !== '.') continue;
        this.set(ox + x, oy + y, ch);
      }
    return this;
  }
  flipX() {
    const c = this.clone();
    c.d = c.d.map((r) => r.reverse());
    return c;
  }
  /** 시계 방향 90도 */
  rot90() {
    const c = new Cv(this.h, this.w);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) c.d[x][this.h - 1 - y] = this.d[y][x];
    return c;
  }
  /** 바깥 윤곽선: 채워진 칸과 맞닿은 빈칸을 ch로 */
  outline(ch, diag = false) {
    const src = this.d.map((r) => [...r]);
    const n = diag
      ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (src[y][x] !== '.') continue;
        if (n.some(([dx, dy]) => (src[y + dy]?.[x + dx] ?? '.') !== '.')) this.d[y][x] = ch;
      }
    return this;
  }
  /** 가장자리 칸을 윤곽 색으로 (인물 그림과 같은 방식) */
  edge(ch) {
    const src = this.d.map((r) => [...r]);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (src[y][x] === '.') continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (src[y + dy]?.[x + dx] ?? '.') === '.')) this.d[y][x] = ch;
      }
    return this;
  }
  /** 모든 칸에 함수 적용 */
  map(fn) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.d[y][x] = fn(this.d[y][x], x, y) ?? this.d[y][x];
    return this;
  }
  text() {
    return this.d.map((r) => r.join('')).join('\n');
  }
  // ---- 도형 ----
  disc(cx, cy, r, c) {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r) this.set(x, y, typeof c === 'function' ? c(d / Math.max(r, 0.01), x, y) : c);
      }
    return this;
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
        if (d <= 1) this.set(x, y, typeof c === 'function' ? c(d, x, y) : c);
      }
    return this;
  }
  /** 고리 띠: 반지름 r0~r1, 각도 a0~a1 (라디안, 0=오른쪽, 시계 방향). c(tr, ta) tr=안→밖, ta=a0→a1 */
  band(cx, cy, r0, r1, a0, a1, c, sy = 1) {
    const R = r1 + 1;
    for (let y = Math.floor(cy - R * sy); y <= Math.ceil(cy + R * sy); y++)
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
        const dx = x - cx;
        const dy = (y - cy) / sy;
        const d = Math.hypot(dx, dy);
        if (d < r0 || d > r1) continue;
        let a = Math.atan2(dy, dx);
        const lo = Math.min(a0, a1);
        const hi = Math.max(a0, a1);
        while (a < lo) a += Math.PI * 2;
        while (a > lo + Math.PI * 2) a -= Math.PI * 2;
        if (a > hi) continue;
        const tr = r1 === r0 ? 0.5 : (d - r0) / (r1 - r0);
        const ta = (a - a0) / (a1 - a0 || 1);
        this.set(x, y, typeof c === 'function' ? c(tr, ta, x, y) : c);
      }
    return this;
  }
  line(x0, y0, x1, y1, c, w = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (w <= 1) this.set(x, y, typeof c === 'function' ? c(t) : c);
      else this.disc(x, y, (w - 1) / 2, typeof c === 'function' ? c(t) : c);
    }
    return this;
  }
  rect(x0, y0, x1, y1, c) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, typeof c === 'function' ? c(x, y) : c);
    return this;
  }
  /** 별 모양 섬광: 가운데 원 + 광선 */
  star(cx, cy, r, rays, ramp, rot = 0, core = 0.35) {
    for (let i = 0; i < rays; i++) {
      const a = rot + (i * Math.PI * 2) / rays;
      const len = i % 2 ? r * 0.6 : r;
      this.line(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len, (t) => (t < 0.4 ? ramp[0] : t < 0.75 ? ramp[1] : ramp[2]));
    }
    this.disc(cx, cy, r * core, (t) => (t < 0.6 ? ramp[0] : ramp[1]));
    return this;
  }
}

/** 같은 값이 나오는 난수 (그림이 실행할 때마다 바뀌지 않게) */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
