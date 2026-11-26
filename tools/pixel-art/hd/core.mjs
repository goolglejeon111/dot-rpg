// 새 도트(32x48) 공통 도구: 글자 격자 → 색, 반쪽 그림 좌우 대칭, 겹치기, PNG
import { RAMPS, ALPHA } from '../palette.mjs';
import { encodePNG } from '../png.mjs';

/**
 * 인물 글자 → 팔레트 칸. 인물마다 remap으로 색 묶음을 바꿔 끼운다
 * (예: 'hair' → 세레나는 'plat', 'cloth' → 세레나는 'white')
 */
export const LEGEND = {
  // 피부
  e: 'skin.0', s: 'skin.1', S: 'skin.2', u: 'skin.3', O: 'skin.4',
  // 머리카락 (j 반짝임)
  j: 'hair.0', h: 'hair.1', H: 'hair.2', J: 'hair.3', K: 'hair.4',
  // 눈: w 하이라이트, i 홍채 밝음, I 홍채, k 속눈썹·눈동자
  w: 'white.0', i: 'eye.0', I: 'eye.1', k: 'eye.2',
  // 주 옷감 (레온 남색, 세레나 흰색)
  a: 'cloth.0', n: 'cloth.1', N: 'cloth.2', B: 'cloth.3', X: 'cloth.4',
  // 둘째 옷감 (레온 망토, 세레나 진홍 테두리)
  c: 'cloth2.0', C: 'cloth2.1', Q: 'cloth2.2', Z: 'cloth2.3',
  // 은 (W 반짝임)
  W: 'silver.0', l: 'silver.1', m: 'silver.2', M: 'silver.3', L: 'silver.4',
  // 금
  y: 'gold.0', Y: 'gold.1', G: 'gold.2', P: 'gold.3',
  // 흰 천 (장갑, 허리띠)
  v: 'white.1', V: 'white.2', T: 'white.3', U: 'white.4',
  // 바지·구두
  b: 'black.0', p: 'black.1', q: 'black.2', R: 'black.3',
};

/** 인물 색 바꾸기: 묶음 이름 → 실제 팔레트 묶음 */
export function resolver(remap = {}) {
  const m = { eye: 'sky', cloth: 'navy', cloth2: 'navy', ...remap };
  const cache = {};
  return (ch) => {
    if (ch === '.' || ch === ' ') return null;
    if (cache[ch] !== undefined) return cache[ch];
    const name = LEGEND[ch];
    if (!name) throw new Error(`모르는 글자: ${ch}`);
    const [r, i] = name.split('.');
    const ramp = RAMPS[m[r] ?? r];
    if (!ramp) throw new Error(`팔레트에 없는 묶음: ${m[r] ?? r}`);
    // 묶음 길이가 다르면 끝(외곽선)에 맞춘다
    const k = Math.min(Number(i), ramp.length - 1);
    return (cache[ch] = ramp[k]);
  };
}

/** 글자 격자 */
export class G {
  constructor(w, h, fill = '.') {
    this.w = w;
    this.h = h;
    this.d = Array.from({ length: h }, () => Array(w).fill(fill));
  }
  static rows(rows, w) {
    const g = new G(w ?? Math.max(...rows.map((r) => r.length)), rows.length);
    rows.forEach((r, y) => [...r].forEach((c, x) => (g.d[y][x] = c)));
    return g;
  }
  /**
   * 왼쪽 반쪽(w/2)만 그린 격자를 좌우 대칭으로. 오른쪽(그늘 쪽)은 shade로 한 단계 어둡게
   * over: { y: '전체 한 줄' } 로 비대칭 줄을 덮어씀
   */
  static half(rows, shade = {}, over = {}) {
    const w = rows[0].length * 2;
    const g = new G(w, rows.length);
    rows.forEach((r, y) => {
      if (r.length !== w / 2) throw new Error(`반쪽 길이 ${r.length} (줄 ${y}): ${r}`);
      [...r].forEach((c, x) => {
        g.d[y][x] = c;
        g.d[y][w - 1 - x] = shade[c] ?? c;
      });
    });
    for (const [y, line] of Object.entries(over)) {
      [...line].forEach((c, x) => c !== '_' && (g.d[+y][x] = c));
    }
    return g;
  }
  clone() {
    const g = new G(this.w, this.h);
    g.d = this.d.map((r) => [...r]);
    return g;
  }
  get(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y][x] : '.';
  }
  set(x, y, c) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y][x] = c;
  }
  /** 다른 격자를 (dx, dy)에 얹음. '.'은 투명 */
  blit(o, dx = 0, dy = 0, under = false) {
    for (let y = 0; y < o.h; y++)
      for (let x = 0; x < o.w; x++) {
        const c = o.d[y][x];
        if (c === '.') continue;
        if (under && this.get(x + dx, y + dy) !== '.') continue;
        this.set(x + dx, y + dy, c);
      }
    return this;
  }
  flipX() {
    const g = this.clone();
    g.d = g.d.map((r) => r.reverse());
    return g;
  }
  /** y0~y1 줄을 dy만큼 옮김 (걷기 출렁임) */
  shiftRows(y0, y1, dy) {
    const src = this.clone();
    for (let y = y0; y <= y1; y++) for (let x = 0; x < this.w; x++) this.d[y][x] = '.';
    for (let y = y0; y <= y1; y++) for (let x = 0; x < this.w; x++) if (src.d[y][x] !== '.') this.set(x, y + dy, src.d[y][x]);
    return this;
  }
  /** 가로세로 90도 (쓰러짐) */
  rot90() {
    const g = new G(this.h, this.w);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) g.d[x][this.h - 1 - y] = this.d[y][x];
    return g;
  }
  map(fn) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.d[y][x] = fn(this.d[y][x], x, y);
    return this;
  }
}

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** 여러 칸을 한 장으로: cells = [{ g, res }], 칸 크기 cw x ch, cols 열 */
export function sheet(cells, cw, ch, cols, scale = 1, bg = null) {
  const rows = Math.ceil(cells.length / cols);
  const W = cw * cols * scale;
  const H = ch * rows * scale;
  const d = new Uint8Array(W * H * 4);
  if (bg) {
    const [r, g, b] = hexRgb(bg);
    for (let i = 0; i < W * H; i++) d.set([r, g, b, 255], i * 4);
  }
  cells.forEach((cell, n) => {
    if (!cell) return;
    const ox = (n % cols) * cw;
    const oy = Math.floor(n / cols) * ch;
    const { g, res } = cell;
    for (let y = 0; y < Math.min(g.h, ch); y++)
      for (let x = 0; x < Math.min(g.w, cw); x++) {
        const hex = res(g.d[y][x]);
        if (!hex) continue;
        const [r, gg, b] = hexRgb(hex);
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) d.set([r, gg, b, 255], (((oy + y) * scale + sy) * W + (ox + x) * scale + sx) * 4);
      }
  });
  return { w: W, h: H, data: d, png: () => encodePNG(W, H, d) };
}

/** 발밑 그림자 (엔진이 깔도록 따로 그린 것): 반투명 타원 */
export function shadowPNG(w = 20, h = 8) {
  const [hex, a] = ALPHA.shadow;
  const [r, g, b] = hexRgb(hex);
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5 - w / 2) / (w / 2);
      const ny = (y + 0.5 - h / 2) / (h / 2);
      const t = nx * nx + ny * ny;
      if (t <= 1) d.set([r, g, b, Math.round(255 * a * (t < 0.5 ? 1 : 0.7))], (y * w + x) * 4);
    }
  return encodePNG(w, h, d);
}
