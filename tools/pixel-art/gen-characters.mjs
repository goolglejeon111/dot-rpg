// 인물 도트 생성기: 인물별 설정(CHARS) → art/characters.txt (글자 격자)
// 실행: npm run art:chars  (그다음 npm run art 로 PNG를 만든다)
// 주의: 다시 실행하면 art/characters.txt를 덮어쓴다. 손으로 고친 격자는 따로 복사해 둘 것.
//
// 몸통 32x35 (머리 1~17줄, 몸 18~34줄). 다리는 레온 다리(leon.txt)를 색만 바꿔 30줄부터 깐다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---- 색 묶음: [밝음, 기본, 그늘, 윤곽] (palette.json 글자) ----
const R = {
  skin: ['e', 's', 'S', 'O'],
  navy: ['b', 'n', 'N', 'B'],
  silver: ['l', 'm', 'M', 'L'],
  white: ['v', 'v', 'V', 'T'],
  gold: ['y', 'Y', 'O', 'P'],
  red: ['x', 'X', 'Z', 'Z'],
  purple: ['i', 'u', 'I', 'k'],
  black: ['R', 'K', 'k', 'k'],
  grey: ['r', 't', 'T', 'R'],
  leather: ['p', 'o', 'O', 'P'],
  tan: ['c', 'd', 'D', 'C'],
  green: ['q', 'g', 'G', 'Q'],
  sky: ['w', 'a', 'A', 'W'],
  brown: ['j', 'h', 'H', 'J'],
  // 회청색 (추격 기사 갑옷)
  slate: ['t', 'A', 'W', 'B'],
};

// 윤곽선: 각 글자를 그 색 묶음의 가장 어두운 색으로
const OUTLINE = {};
for (const r of Object.values(R)) for (const ch of r) OUTLINE[ch] ??= r[3];
Object.assign(OUTLINE, { v: 'T', V: 'T', e: 'O', s: 'O', S: 'O', l: 'L', w: 'W' });

class Grid {
  constructor(w = 32, h = 35) {
    this.w = w;
    this.h = h;
    this.d = Array.from({ length: h }, () => Array(w).fill('.'));
  }
  set(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y][x] = c;
  }
  get(x, y) {
    x = Math.round(x);
    y = Math.round(y);
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y][x] : '.';
  }
  rect(x0, y0, x1, y1, c) {
    for (let y = Math.round(y0); y <= Math.round(y1); y++)
      for (let x = Math.round(x0); x <= Math.round(x1); x++) this.set(x, y, typeof c === 'function' ? c(x, y) : c);
  }
  /** 위아래 폭이 바뀌는 사다리꼴. c(x, y, t) t=0(왼쪽)~1(오른쪽) */
  trap(y0, y1, l0, r0, l1, r1, c) {
    for (let y = y0; y <= y1; y++) {
      const k = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
      const l = Math.round(l0 + (l1 - l0) * k);
      const r = Math.round(r0 + (r1 - r0) * k);
      for (let x = l; x <= r; x++) this.set(x, y, typeof c === 'function' ? c(x, y, r === l ? 0.5 : (x - l) / (r - l)) : c);
    }
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.set(x, y, typeof c === 'function' ? c(x, y, nx, ny) : c);
      }
  }
  line(x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
  /** 가장자리 픽셀을 그 색의 가장 어두운 색으로 */
  outline() {
    const src = this.d.map((r) => [...r]);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = src[y][x];
        if (c === '.') continue;
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const xx = x + dx;
          const yy = y + dy;
          return xx < 0 || yy < 0 || xx >= this.w || yy >= this.h || src[yy][xx] === '.';
        });
        if (edge) this.d[y][x] = OUTLINE[c] ?? c;
      }
    return this;
  }
  flipX() {
    this.d = this.d.map((r) => [...r].reverse());
    return this;
  }
  text() {
    return this.d.map((r) => r.join('')).join('\n');
  }
}

/** 가로 위치 t(0~1)로 명암: 왼쪽 위가 밝다 */
const shadeT = (ramp, t, hi = 0.22, lo = 0.72) => (t < hi ? ramp[0] : t > lo ? ramp[2] : ramp[1]);
const shadeN = (ramp, bias = 0) => (x, y, nx, ny) => {
  const l = -(nx * 0.6 + ny * 0.8) + bias;
  return l > 0.45 ? ramp[0] : l > -0.35 ? ramp[1] : ramp[2];
};
const bob = (r) => (x, y, t) => shadeT(r, t);

// =====================================================================
// 부위별 그리기. v = 'down' | 'up' | 'right'
// =====================================================================

const HEAD = { cx: 15.5, cy: 9.5, rx: 8.4, ry: 8.2 };

function hairBack(g, c, v) {
  const h = c.hair;
  if (!h || !h.long) return;
  const r = h.ramp;
  const bottom = h.long;
  if (v === 'right') {
    g.trap(8, bottom, 7, 15, 6, 13, (x, y, t) => shadeT(r, t, 0.2, 0.6));
  } else {
    const wide = h.wide ?? 0;
    g.trap(8, bottom, 7, 24, 7 - wide, 24 + wide, (x, y, t) => (v === 'up' ? (t < 0.2 ? r[0] : t > 0.75 ? r[2] : r[1]) : t < 0.5 ? r[1] : r[2]));
    if (v === 'up') for (let y = 12; y <= bottom; y += 3) g.set(15 + ((y / 3) % 2), y, r[2]);
  }
}

function head(g, c, v) {
  const h = c.hair ?? { ramp: R.brown, style: 'short' };
  const r = h.ramp;
  const sk = c.skin ?? R.skin;
  // 머리통(머리카락)
  if (c.hood) {
    hood(g, c, v);
    return;
  }
  if (h.style === 'curly') {
    for (const [dx, dy] of [[-8, 2], [8, 2], [-7, 6], [7, 6], [-6, -5], [6, -5], [0, -7.5], [-4, -7], [4, -7]]) g.ellipse(HEAD.cx + dx, HEAD.cy + dy, 2.6, 2.6, r[1]);
  }
  g.ellipse(HEAD.cx, HEAD.cy, HEAD.rx, HEAD.ry, shadeN(r, 0.1));
  if (c.ears) wolfEars(g, c, v);

  if (v === 'up') {
    // 뒤통수: 가르마와 머리끝
    g.rect(15, 3, 15, 8, r[2]);
    if (h.tail) g.rect(14, 15, 17, 22, (x) => (x < 16 ? r[1] : r[2]));
    if (h.style === 'slick') for (let y = 4; y <= 14; y += 2) g.set(11 + (y % 4), y, r[0]);
    if (h.sides) g.rect(8, 11, 22, 15, (x, y) => (g.get(x, y) === '.' ? '.' : x < 11 || x > 20 ? h.sides : g.get(x, y)));
    if (h.style === 'curly') for (const x of [8, 11, 14, 17, 20, 23]) g.set(x, 16, r[2]);
    return;
  }

  // 얼굴
  const face = v === 'right' ? { l: 15, r: 23 } : { l: 10, r: 21 };
  if (v === 'right') {
    g.rect(15, 10, 22, 16, (x) => (x === 15 ? sk[2] : sk[1]));
    g.rect(16, 17, 21, 17, sk[2]);
    g.set(23, 13, sk[1]); // 코
    g.set(23, 12, sk[1]);
  } else {
    g.rect(10, 10, 21, 15, (x) => (x >= 20 ? sk[2] : x === 10 ? sk[0] : sk[1]));
    g.rect(11, 16, 20, 16, (x) => (x >= 19 ? sk[2] : sk[1]));
    g.rect(12, 17, 19, 17, sk[2]);
  }

  // 앞머리
  const style = h.style;
  if (v === 'right') {
    g.rect(8, 3, 19, 9, shadeN(r, 0.2));
    if (style === 'slick') g.rect(16, 8, 21, 8, r[1]);
    else g.rect(15, 9, 22, 9, (x) => (x % 2 ? r[1] : r[2]));
    if (style === 'straight' || style === 'short' || style === 'curly') g.rect(16, 10, 21, 10, (x) => (x % 3 === 0 ? sk[1] : r[2]));
    g.rect(8, 9, 15, 16, (x) => (x > 13 ? r[2] : r[1])); // 옆·뒷머리
    if (h.sides) g.rect(13, 11, 14, 14, h.sides);
    if (style === 'curly') g.rect(8, 16, 14, 19, (x, y) => ((x + y) % 2 ? r[1] : r[2]));
  } else {
    if (style === 'straight') {
      g.rect(9, 9, 22, 10, (x, y) => (y === 10 ? r[2] : r[1]));
    } else if (style === 'slick') {
      g.rect(10, 8, 21, 8, (x) => (x % 3 ? r[1] : r[0]));
      g.rect(11, 9, 20, 9, (x) => (x === 15 || x === 16 ? sk[1] : x % 2 ? sk[1] : sk[1]));
    } else {
      // 'short', 'curly': 들쭉날쭉한 앞머리
      g.rect(9, 9, 22, 9, r[1]);
      for (let x = 10; x <= 21; x++) if (x % 3 !== 1) g.set(x, 10, r[2]);
    }
    // 옆머리
    const sideC = h.sides ?? r[1];
    g.rect(9, 10, 9, h.long ? 18 : 14, sideC);
    g.rect(22, 10, 22, h.long ? 18 : 14, h.sides ?? r[2]);
    if (h.long) {
      g.rect(8, 11, 8, 18, r[1]);
      g.rect(23, 11, 23, 18, r[2]);
    }
    if (style === 'curly') for (const [x, y] of [[8, 15], [23, 15], [8, 17], [23, 17], [7, 18], [24, 18]]) g.set(x, y, r[2]);
  }

  // 눈
  const eye = c.eye ?? 'k';
  if (v === 'right') {
    g.set(20, 12, 'k');
    g.set(21, 12, 'k');
    g.set(20, 13, eye);
    g.set(21, 13, 'k');
    if (c.brow) g.rect(19, 11, 21, 11, c.brow);
  } else {
    for (const ex of [11, 18]) {
      g.set(ex, 12, 'k');
      g.set(ex + 1, 12, 'k');
      g.set(ex, 13, eye);
      g.set(ex + 1, 13, 'k');
    }
    if (c.brow) {
      g.rect(11, 11, 12, 11, c.brow);
      g.rect(18, 11, 19, 11, c.brow);
    }
    if (c.scar) g.set(12, 15, sk[3]);
    if (c.smile) g.rect(15, 15, 16, 15, sk[2]);
  }
  if (c.beard) beard(g, c, v);
  if (c.moustache) {
    if (v === 'right') g.rect(20, 15, 22, 15, c.moustache);
    else g.rect(13, 15, 18, 15, c.moustache);
  }
  if (c.mitre) mitre(g, c, v);
  if (c.laurel) laurel(g, v);
  if (c.circlet) {
    if (v === 'right') g.rect(13, 8, 21, 8, 'k');
    else {
      g.rect(9, 8, 22, 8, 'k');
      for (const x of [12, 15, 16, 19]) g.set(x, 7, 'k');
    }
  }
}

function hood(g, c, v) {
  const r = c.hood;
  g.ellipse(15.5, 9.6, 9, 9.2, shadeN(r, 0.1));
  g.set(15, 0, r[1]);
  g.set(16, 0, r[1]);
  if (v === 'up') {
    g.rect(15, 2, 15, 17, r[2]);
    return;
  }
  if (v === 'right') {
    g.rect(16, 7, 23, 17, (x, y) => (x <= 17 ? r[2] : 'k'));
    g.rect(19, 11, 23, 17, (x, y) => (y >= 14 && x >= 20 ? c.skin?.[2] ?? 'S' : 'k'));
    g.set(21, 12, c.eye ?? 'T');
    return;
  }
  // 앞: 그림자 진 얼굴
  g.ellipse(15.5, 12.5, 5.6, 5.4, 'k');
  g.rect(11, 14, 20, 17, (x, y) => (y >= 15 && x >= 12 && x <= 19 ? (x >= 18 ? 'S' : 's') : 'k'));
  g.rect(12, 14, 19, 14, 'k');
  g.set(13, 13, c.eye ?? 'T');
  g.set(18, 13, c.eye ?? 'T');
  // 목을 감싼 천
  g.rect(10, 17, 21, 19, (x) => (x < 13 ? r[1] : r[2]));
}

function wolfEars(g, c, v) {
  const r = c.hair.ramp;
  const ears = v === 'right' ? [[10, 1], [13, 0]] : [[9, 2], [22, 2]];
  for (const [ex, ey] of ears) {
    g.trap(ey - 1, ey + 4, ex + 1.5, ex + 1.5, ex - 1, ex + 4, (x, y, t) => (t > 0.3 && t < 0.7 && y > ey ? 's' : r[1]));
  }
}

function beard(g, c, v) {
  const r = c.beard;
  if (v === 'right') {
    g.trap(14, 19 + (c.beardLen ?? 0), 17, 23, 18, 21, (x, y, t) => (t > 0.7 ? r[2] : r[1]));
    return;
  }
  g.rect(12, 14, 19, 14, r[1]);
  g.trap(15, 20 + (c.beardLen ?? 0), 10, 21, 13, 18, (x, y, t) => (t > 0.7 ? r[2] : t < 0.2 ? r[0] : r[1]));
  g.rect(15, 15, 16, 15, 'S');
}

function mitre(g, c, v) {
  const W = R.white;
  if (v === 'right') {
    g.trap(-1, 7, 14, 17, 10, 20, (x, y, t) => (t > 0.7 ? W[2] : W[0]));
    g.rect(10, 7, 20, 8, (x) => (x % 2 ? 'Y' : 'y'));
    return;
  }
  g.trap(-1, 7, 14, 17, 10, 21, (x, y, t) => (t > 0.75 ? W[2] : W[0]));
  g.rect(9, 7, 22, 8, (x, y) => (y === 7 ? 'y' : 'Y'));
  if (v === 'down') {
    g.rect(15, 1, 16, 5, 'Y');
    g.rect(14, 3, 17, 3, 'Y');
  }
}

// ---- 몸통 ----

/** 몸 아랫단 모양: 'coat'(트임), 'robe'(넓게 퍼짐), 'tunic'(짧음), 'skirt' */
/** 금 월계관: 이마 위로 두르고, 잎을 위로 비스듬히 세움 (알드릭 황제) */
function laurel(g, v) {
  if (v === 'right') {
    g.rect(9, 7, 21, 7, 'Y');
    for (const x of [10, 13, 16, 19]) {
      g.set(x, 6, 'y');
      g.set(x + 1, 5, 'Y');
    }
    g.set(21, 6, 'y');
    return;
  }
  if (v === 'up') {
    g.rect(8, 8, 23, 8, 'Y');
    for (const x of [9, 12, 15, 18, 21]) g.set(x, 7, 'y');
    g.rect(14, 9, 17, 9, 'Y'); // 뒤에서 묶은 매듭
    return;
  }
  g.rect(8, 8, 23, 8, 'Y');
  for (const x of [8, 11, 14, 17, 20, 23]) {
    g.set(x, 7, 'y');
    g.set(x + (x < 16 ? -1 : 1), 6, 'Y');
  }
  g.set(15, 5, 'y');
  g.set(16, 5, 'y');
}

function torso(g, c, v) {
  const o = c.outfit;
  const r = o.ramp;
  const right = v === 'right';
  const L = right ? 10 : 8;
  const Rr = right ? 21 : 23;
  // 어깨~허리
  g.trap(18, 27, L, Rr, L, Rr, (x, y, t) => shadeT(r, right ? 1 - t : t, 0.15, 0.78));
  g.rect(right ? 11 : 9, 17, right ? 20 : 22, 18, (x) => shadeT(r, 0.5));
  // 아랫단
  const end = o.lower === 'tunic' ? 31 : 34;
  const flare = o.lower === 'robe' ? 3 : o.lower === 'skirt' ? 2 : 1;
  const lr = o.lowerRamp ?? r;
  g.trap(28, end, L, Rr, L - flare, Rr + flare, (x, y, t) => shadeT(lr, right ? 1 - t : t, 0.15, 0.75));
  if (o.lower === 'coat' && v === 'down') g.rect(15, 29, 16, end, 'K'); // 코트 트임 (바지가 보임)
  if (o.lower === 'robe' || o.lower === 'skirt') {
    // 주름
    for (let y = 29; y <= end; y++) for (const x of right ? [14, 18] : [12, 16, 20]) if ((y + x) % 2 === 0) g.set(x, y, lr[2]);
  }
  // 깃
  if (o.collar) {
    if (right) g.rect(16, 16, 20, 18, o.collar);
    else {
      g.rect(12, 16, 19, 18, (x) => (x === 15 || x === 16 ? (v === 'up' ? o.collar : c.skin?.[2] ?? 'S') : o.collar));
    }
  }
  // 허리띠
  if (o.belt) {
    const [b0, b1] = o.belt;
    if (right) g.rect(L, 27, Rr, 27, b0);
    else g.rect(L, 27, Rr, 27, (x) => (x === 15 || x === 16 ? b1 : b0));
  }
  // 앞 장식선(가운데 단추 줄)
  if (o.trim && v !== 'up') {
    if (right) g.rect(19, 19, 19, end, o.trim);
    else {
      for (let y = 19; y <= 26; y += 2) g.set(15, y, o.trim);
      if (o.lower !== 'robe') {
        g.rect(14, 28, 14, end, o.trim);
        g.rect(17, 28, 17, end, o.trim);
      }
    }
  }
  if (o.hem && v !== 'right') g.rect(L - flare, end, Rr + flare, end, o.hem);
  if (o.hem && v === 'right') g.rect(L - flare, end, Rr + flare, end, o.hem);
}

function arms(g, c, v) {
  const o = c.outfit;
  const r = o.sleeve ?? o.ramp;
  const hand = c.gloves ?? (c.skin ?? R.skin)[1];
  if (v === 'right') {
    g.rect(14, 19, 17, 26, (x) => (x === 14 ? r[0] : x === 17 ? r[2] : r[1]));
    if (o.cuff) g.rect(14, 26, 17, 26, o.cuff);
    g.rect(14, 27, 17, 28, hand);
    return;
  }
  if (c.pose === 'clasp') {
    // 두 손을 모음 (세레나)
    g.rect(6, 19, 8, 25, (x) => (x === 6 ? r[0] : r[1]));
    g.rect(23, 19, 25, 25, (x) => (x === 25 ? r[2] : r[1]));
    g.rect(9, 24, 13, 25, r[1]);
    g.rect(18, 24, 22, 25, r[2]);
    if (o.cuff) {
      g.rect(12, 24, 13, 25, o.cuff);
      g.rect(18, 24, 19, 25, o.cuff);
    }
    if (v === 'down') g.rect(14, 23, 17, 25, (x) => (x > 15 ? (c.skin ?? R.skin)[2] : hand));
    return;
  }
  if (c.pose === 'cross') {
    // 팔짱 (카르크, 브람)
    g.rect(6, 19, 8, 24, r[1]);
    g.rect(23, 19, 25, 24, r[2]);
    if (v === 'down') {
      g.rect(7, 23, 24, 25, (x, y) => (y === 23 ? r[0] : y === 25 ? r[2] : r[1]));
      g.rect(9, 23, 10, 24, hand);
      g.rect(21, 24, 22, 25, hand);
      if (o.cuff) g.rect(11, 23, 12, 25, o.cuff);
    } else {
      g.rect(6, 25, 8, 25, r[2]);
      g.rect(23, 25, 25, 25, r[2]);
    }
    return;
  }
  g.rect(5, 19, 7, 26, (x) => (x === 5 ? r[0] : r[1]));
  g.rect(24, 19, 26, 26, (x) => (x === 26 ? r[2] : r[1]));
  if (o.cuff) {
    g.rect(5, 26, 7, 26, o.cuff);
    g.rect(24, 26, 26, 26, o.cuff);
  }
  g.rect(5, 27, 7, 28, hand);
  g.rect(24, 27, 26, 28, hand);
}

function cape(g, c, v, front) {
  const r = c.cape;
  if (!r) return;
  if (v === 'up' && front) {
    g.trap(17, 34, 8, 23, 5, 26, (x, y, t) => shadeT(r, t, 0.12, 0.7));
    for (let y = 22; y <= 34; y += 1) if (y % 3 === 0) g.set(12 + (y % 2), y, r[2]);
    if (c.capeTrim) g.rect(5, 34, 26, 34, c.capeTrim);
    return;
  }
  if (front) return;
  if (v === 'right') g.trap(17, 34, 9, 12, 6, 11, (x, y, t) => shadeT(r, t, 0.3, 0.8));
  else {
    g.trap(18, 34, 5, 26, 3, 28, (x, y, t) => shadeT(r, t, 0.1, 0.85));
    if (c.capeTrim) {
      g.rect(3, 34, 5, 34, c.capeTrim);
      g.rect(26, 34, 28, 34, c.capeTrim);
    }
  }
}

// ---- 장식 ----
const DECOR = {
  /** 한쪽 어깨 갑옷 (레온 스타일) */
  pauldrons(g, c, v) {
    const S = R.silver;
    const at = v === 'right' ? [15.5] : [7, 24];
    for (const cx of at) {
      g.ellipse(cx, 20, 3.6, 2.8, S[3]);
      g.ellipse(cx, 19.8, 2.7, 2, shadeN(S));
    }
  },
  /** 은색 술 견장 */
  epaulettes(g, c, v) {
    const at = v === 'right' ? [15.5] : [7, 24];
    for (const cx of at) {
      g.rect(cx - 3, 18, cx + 3, 19, (x) => (x < cx ? 'l' : 'm'));
      for (let x = Math.round(cx - 3); x <= cx + 3; x++) g.set(x, 20 + (x % 2), 'M');
    }
  },
  chestplate(g, c, v) {
    if (v === 'up') return;
    const S = R.silver;
    if (v === 'right') g.rect(17, 19, 21, 25, (x) => (x === 21 ? S[2] : x === 20 ? S[1] : S[0]));
    else {
      g.trap(19, 26, 10, 21, 11, 20, (x, y, t) => shadeT(S, t, 0.3, 0.75));
      if (c.wings) {
        g.rect(12, 21, 14, 21, 'M');
        g.rect(17, 21, 19, 21, 'M');
        g.rect(15, 20, 16, 22, 'M');
      }
    }
  },
  /** 은 판금 갑옷 전신 (아드리안, 성기사단) */
  armor(g, c, v) {
    const S = R.silver;
    if (v === 'right') {
      g.rect(10, 18, 21, 27, (x) => shadeT(S, 1 - (x - 10) / 11));
      return;
    }
    g.trap(18, 27, 8, 23, 9, 22, (x, y, t) => shadeT(S, t, 0.25, 0.75));
    g.rect(11, 17, 20, 18, (x) => (x < 15 ? 'l' : 'm'));
    if (v === 'down') g.rect(10, 26, 21, 26, 'M');
  },
  /** 갈리아의 진홍 어깨띠 + 허리띠 */
  sash(g, c, v) {
    if (v === 'right') {
      g.rect(10, 25, 21, 26, (x) => (x < 14 ? 'x' : 'X'));
      g.rect(19, 27, 20, 31, 'X');
      return;
    }
    for (let i = 0; i <= 8; i++) {
      g.set(10 + i, 19 + i, 'x');
      g.set(11 + i, 19 + i, 'X');
    }
    g.rect(8, 25, 23, 26, (x) => (x < 12 ? 'x' : x > 19 ? 'Z' : 'X'));
    if (v === 'down') g.rect(19, 27, 20, 31, (x) => (x === 19 ? 'X' : 'Z'));
  },
  /** 브람: 금 장식 끈, 훈장 */
  goldTrim(g, c, v) {
    if (v === 'up') {
      g.rect(9, 17, 22, 17, 'Y');
      return;
    }
    if (v === 'right') {
      g.rect(16, 21, 20, 21, 'Y');
      g.set(20, 22, 'x');
      return;
    }
    for (let x = 11; x <= 20; x++) g.set(x, 21 + (x > 12 && x < 19 ? 1 : 0), 'y');
    for (const y of [20, 23, 25]) {
      g.set(13, y, 'Y');
      g.set(18, y, 'Y');
    }
    g.set(20, 20, 'x');
    g.set(20, 21, 'Z');
    g.rect(9, 17, 22, 17, 'Y');
  },
  /** 엘리시아: 가슴 룬, 소매 룬 */
  runes(g, c, v) {
    if (v === 'up') return;
    if (v === 'right') {
      g.rect(14, 25, 17, 25, 'w');
      return;
    }
    g.rect(14, 20, 17, 22, (x, y) => ((x + y) % 2 ? 'w' : 'a'));
    g.set(13, 21, 'a');
    g.set(18, 21, 'a');
    g.rect(5, 25, 7, 25, 'w');
    g.rect(24, 25, 26, 25, 'w');
  },
  pouch(g, c, v) {
    if (v === 'up') return;
    const x = v === 'right' ? 17 : 20;
    g.rect(x, 28, x + 2, 30, (xx) => (xx === x ? 'p' : 'o'));
    if (v === 'down') g.rect(12, 28, 13, 32, 'o');
  },
  /** 카르크: 이빨 목걸이, 후드 스카프, 어깨 가죽 */
  wolfGear(g, c, v) {
    if (v === 'up') {
      g.rect(10, 17, 21, 19, (x) => (x < 14 ? 'r' : 't'));
      g.rect(22, 19, 25, 21, 'K');
      return;
    }
    if (v === 'right') {
      g.rect(14, 17, 20, 18, 'r');
      g.set(19, 20, 'v');
      return;
    }
    g.rect(10, 17, 21, 18, (x) => (x < 14 ? 'r' : 't'));
    for (const x of [12, 14, 17, 19]) g.set(x, 20, 'v');
    g.rect(11, 19, 20, 19, 'k');
    g.ellipse(24.5, 19.5, 2.5, 1.8, 'K'); // 어깨 가죽
    g.set(24, 19, 'i');
    g.rect(5, 24, 7, 24, 'O'); // 문신
  },
  /** 헤르만: 흰 털 깃, 금 목걸이 */
  fur(g, c, v) {
    const W = R.white;
    if (v === 'right') {
      g.ellipse(14, 18, 4, 2.6, (x, y) => ((x + y) % 3 ? W[0] : W[2]));
      return;
    }
    g.ellipse(9.5, 18, 4.2, 2.8, (x, y) => ((x + y) % 3 ? W[0] : W[2]));
    g.ellipse(21.5, 18, 4.2, 2.8, (x, y) => ((x + y) % 3 ? W[1] : W[2]));
    if (v === 'down') {
      g.rect(14, 18, 17, 30, 'K');
      g.rect(13, 21, 18, 21, 'Y');
      g.rect(8, 27, 9, 34, 'Y');
      g.rect(22, 27, 23, 34, 'Y');
    }
  },
  /** 가슴 십자 (색은 c.crossColor) */
  cross(g, c, v) {
    if (v !== 'down') return;
    const k = c.crossColor ?? 'Y';
    g.rect(15, 19, 16, 25, k);
    g.rect(13, 21, 18, 21, k);
  },
  /** 아드리안 흰 망토 앞자락, 성기사 흰 겉옷 */
  tabard(g, c, v) {
    if (v === 'up') return;
    const W = R.white;
    if (v === 'right') g.rect(15, 27, 19, 33, (x) => (x === 19 ? W[2] : W[0]));
    else g.rect(12, 27, 19, 33, (x) => (x >= 18 ? W[2] : W[0]));
    g.rect(v === 'right' ? 10 : 9, 27, v === 'right' ? 21 : 22, 27, 'o');
  },
  /** 카시우스: 은 줄무늬, 보라 별 */
  starRobe(g, c, v) {
    if (v === 'right') {
      g.rect(18, 28, 18, 34, 'M');
      return;
    }
    for (const x of [11, 14, 17, 20]) g.rect(x, 27, x, 34, 'M');
    if (v === 'down') {
      g.rect(15, 20, 16, 23, 'i');
      g.rect(14, 21, 17, 22, 'u');
      g.set(15, 19, 'i');
      g.set(15, 24, 'u');
    }
    g.rect(5, 25, 7, 25, 'M');
    g.rect(24, 25, 26, 25, 'M');
  },
  /** 사제복: 회색 앞판, 검은 십자가 (마르키온) */
  priest(g, c, v) {
    if (v === 'up') return;
    if (v === 'right') {
      g.rect(18, 18, 20, 26, 't');
      return;
    }
    g.trap(18, 27, 13, 18, 14, 17, (x) => (x < 15 ? 'r' : 't'));
    g.rect(15, 21, 16, 26, 'k');
    g.rect(14, 22, 17, 22, 'k');
  },
  /** 눈 모양 펜던트 (그노시스회) */
  eyePendant(g, c, v) {
    if (v !== 'down') return;
    g.rect(14, 22, 17, 23, 'm');
    g.set(15, 22, 'l');
    g.set(16, 23, 'a');
  },
  /** 빛나는 손 */
  glowHand(g, c, v) {
    const at = v === 'right' ? [17, 28] : [25.5, 28];
    g.ellipse(at[0], at[1], 2.6, 2.4, 'w');
    g.ellipse(at[0], at[1], 1.6, 1.4, 'v');
    if (c.id === 'marcion' && v !== 'up') g.rect(v === 'right' ? 14 : 24, 19, v === 'right' ? 17 : 26, 26, (x) => (x % 2 ? 'l' : 'w'));
  },
};

// ---- 들고 있는 것 ----
const PROPS = {
  /** 뒤틀린 지팡이 + 떠 있는 구슬 (엘리시아) */
  twistedStaff(g, c, v, front) {
    if (v === 'up' ? front : !front) return;
    const x0 = v === 'right' ? 22 : 27;
    for (let y = 4; y <= 34; y++) g.set(x0 + (Math.floor(y / 4) % 2), y, y % 3 ? 'I' : 'u');
    g.rect(x0 - 2, 3, x0 + 2, 4, 'I');
    g.set(x0 - 2, 2, 'I');
    g.set(x0 + 2, 1, 'I');
    g.ellipse(x0 + 0.5, 0.8, 1.3, 1.3, 'i');
  },
  /** 초승달 지팡이 (카시우스) */
  moonStaff(g, c, v, front) {
    if (v === 'up' ? front : !front) return;
    const x0 = v === 'right' ? 22 : 4;
    g.rect(x0, 5, x0 + 1, 34, (x) => (x === x0 ? 'R' : 'k'));
    g.ellipse(x0 + 0.5, 3, 3, 3, 'I');
    g.ellipse(x0 + 1.5, 2.6, 1.8, 2, '.');
    g.set(x0 + 0.5, 3, 'i');
    g.set(x0 + 1, 2, 'l');
  },
  /** 황제의 홀: 긴 금 막대, 꼭대기에 독수리 (알드릭) */
  scepter(g, c, v, front) {
    if (v === 'up' ? front : !front) return;
    const x0 = v === 'right' ? 23 : 4;
    g.rect(x0, 4, x0, 34, (x, y) => (y % 5 === 0 ? 'y' : 'Y'));
    g.rect(x0 - 1, 2, x0 + 1, 3, 'y'); // 독수리 날개
    g.set(x0 - 2, 1, 'Y');
    g.set(x0 + 2, 1, 'Y');
    g.set(x0, 1, 'y');
    g.set(x0, 0, 'Y');
  },
  /** 금 지팡이 + 십자 (이그나티우스) */
  goldStaff(g, c, v, front) {
    if (v === 'up' ? front : !front) return;
    const x0 = v === 'right' ? 22 : 27;
    g.rect(x0, 6, x0, 34, 'Y');
    g.ellipse(x0, 4, 2.2, 2.2, 'Y');
    g.set(x0, 4, 'y');
    g.rect(x0, 0, x0, 2, 'y');
    g.rect(x0 - 1, 1, x0 + 1, 1, 'y');
  },
  /** 등의 큰 검 (갈리아) */
  bigSword(g, c, v, front) {
    if (v === 'up') {
      if (!front) return;
      g.line(6, 3, 24, 33, 'm');
      g.line(7, 3, 25, 33, 'M');
      g.rect(8, 6, 11, 7, 'Y');
      g.line(4, 0, 7, 4, 'k');
      return;
    }
    if (front) return;
    if (v === 'right') {
      g.line(8, 2, 9, 34, 'M');
      g.rect(6, 7, 11, 8, 'Y');
      g.rect(8, 0, 9, 6, 'k');
      return;
    }
    g.rect(4, 1, 5, 9, 'k');
    g.rect(2, 9, 8, 10, 'Y');
    g.set(4, 0, 'Y');
    g.rect(26, 27, 27, 34, (x) => (x === 26 ? 'm' : 'M'));
  },
  /** 태양 방패 (아드리안) */
  shield(g, c, v, front) {
    if (v === 'up') {
      if (!front) return;
      g.trap(19, 30, 9, 22, 12, 19, (x, y, t) => (t < 0.1 || t > 0.9 ? 'n' : 'm'));
      return;
    }
    if (v === 'right') {
      if (front) return;
      g.trap(18, 32, 6, 9, 7, 9, (x, y, t) => (t > 0.6 ? 'n' : 'v'));
      return;
    }
    if (!front) return;
    g.trap(18, 33, 21, 29, 23, 27, (x, y, t) => (t < 0.15 || t > 0.85 ? 'n' : t > 0.6 ? 'V' : 'v'));
    g.ellipse(25, 23, 1.6, 1.6, 'y');
    for (const [x, y] of [[25, 20], [25, 26], [22.5, 23], [27.5, 23]]) g.set(x, y, 'Y');
  },
  /** 장검 허리 (브람, 오스발트) */
  sword(g, c, v, front) {
    if (v === 'up' || !front) return;
    if (v === 'right') {
      g.line(12, 27, 8, 33, 'K');
      g.rect(12, 26, 13, 26, 'Y');
      return;
    }
    if (c.swordDiagonal) {
      for (let i = 0; i <= 14; i++) g.set(9 + i, 18 + i, i < 3 ? 'Y' : 'k');
      g.rect(10, 20, 12, 20, 'y');
      return;
    }
    g.line(22, 27, 27, 33, 'K');
    g.rect(20, 26, 22, 26, 'Y');
  },
  /** 창 (근위기사, 성기사단 병사) */
  spear(g, c, v, front) {
    if (v === 'up' ? front : !front) return;
    const sx = v === 'right' ? 21 : v === 'up' ? 5 : 26;
    for (let y = 4; y <= 34; y++) {
      g.set(sx, y, 'o');
      g.set(sx + 1, y, 'O');
    }
    g.set(sx, 0, 'l');
    g.set(sx + 1, 0, 'm');
    g.rect(sx - 1, 1, sx + 2, 2, (x) => (x <= sx ? 'l' : 'M'));
    g.rect(sx, 3, sx + 1, 3, 'M');
  },
  /** 활과 화살통 (제국 궁병) */
  bow(g, c, v, front) {
    if (v === 'up') {
      if (!front) return;
      g.rect(20, 17, 22, 27, (x) => (x === 20 ? 'o' : 'O')); // 화살통
      g.rect(20, 15, 22, 16, 'v');
      return;
    }
    if (!front) {
      if (v !== 'right') g.rect(7, 16, 8, 24, (x) => (x === 7 ? 'o' : 'O'));
      return;
    }
    const x0 = v === 'right' ? 22 : 26;
    for (let y = 12; y <= 32; y++) {
      const bend = Math.round(2.6 * Math.sin(((y - 12) / 20) * Math.PI));
      g.set(x0 + bend, y, y < 15 || y > 29 ? 'O' : 'o');
    }
    for (let y = 13; y <= 31; y++) g.set(x0, y, 'V');
  },
  /** 회청색 연 모양 방패 (추격 기사 방패병) */
  kiteShield(g, c, v, front) {
    const S = R.slate;
    if (v === 'up') {
      if (!front) return;
      g.trap(18, 31, 9, 22, 13, 18, (x, y, t) => (t < 0.1 || t > 0.9 ? S[3] : S[2]));
      return;
    }
    if (v === 'right') {
      if (!front) return;
      g.trap(17, 33, 19, 25, 21, 23, (x, y, t) => (t < 0.15 || t > 0.85 ? S[3] : t < 0.5 ? S[0] : S[1]));
      g.rect(21, 22, 23, 22, 'm');
      return;
    }
    if (!front) return;
    g.trap(17, 33, 19, 29, 23, 25, (x, y, t) => (t < 0.12 || t > 0.88 ? S[3] : t < 0.45 ? S[0] : S[1]));
    g.rect(23, 19, 25, 30, 'm');
    g.rect(20, 23, 28, 24, 'm');
  },
  /** 짧은 칼 (하수인) */
  dagger(g, c, v, front) {
    if (v === 'up' || !front) return;
    const x = v === 'right' ? 18 : 26;
    g.rect(x, 29, x, 32, 'l');
    g.set(x, 28, 'k');
  },
  /** 바구니 (시민) */
  basket(g, c, v, front) {
    if (v === 'up' || !front) return;
    const x = v === 'right' ? 15 : 23;
    g.rect(x, 26, x + 4, 29, (xx, y) => ((xx + y) % 2 ? 'p' : 'o'));
    g.rect(x + 1, 25, x + 3, 25, 'q');
  },
  /** 꼬리 (카르크) */
  tail(g, c, v, front) {
    const r = c.hair.ramp;
    if (v === 'up') {
      if (!front) return;
      g.ellipse(17, 31, 3, 4.2, shadeN(r));
      g.set(17, 34, 'h');
      return;
    }
    if (front) return;
    const cx = v === 'right' ? 8 : 25;
    g.ellipse(cx, 29, 3.2, 4.4, shadeN(r));
    g.set(cx + (v === 'right' ? -2 : 2), 32, 'h');
  },
};

/** 투구 (근위기사, 성기사단): 얼굴이 보이는 은 투구 + 장식 */
function helmet(g, c, v) {
  const S = R.silver;
  g.ellipse(15.5, 10, 8.6, 8.4, shadeN(S, 0.1));
  const plume = c.helmet.plume;
  if (plume) {
    g.ellipse(v === 'right' ? 13.5 : 15.5, 1.8, 3.2, 2.2, (x, y, nx, ny) => (nx + ny < -0.4 ? plume[0] : nx + ny > 0.6 ? plume[2] : plume[1]));
  }
  if (v === 'up') {
    g.rect(15, 3, 16, 16, (x) => (x === 15 ? 'l' : 'M'));
    return;
  }
  const sk = R.skin;
  if (v === 'right') {
    g.rect(18, 11, 23, 17, (x) => (x === 18 ? sk[2] : sk[1]));
    g.rect(13, 9, 24, 10, (x, y) => (g.get(x, y) === '.' ? '.' : y === 9 ? 'l' : 'M'));
    g.rect(16, 11, 17, 17, 'M');
    g.set(21, 12, 'k');
    g.set(21, 13, 'k');
    return;
  }
  g.rect(11, 11, 20, 17, (x) => (x >= 19 ? sk[2] : sk[1]));
  g.rect(9, 9, 22, 10, (x, y) => (g.get(x, y) === '.' ? '.' : y === 9 ? 'l' : 'M'));
  g.rect(15, 9, 16, 14, (x) => (x === 15 ? 'm' : 'M'));
  g.rect(9, 11, 10, 17, 'm');
  g.rect(21, 11, 22, 17, 'M');
  for (const ex of [12, 18]) {
    g.set(ex, 12, 'k');
    g.set(ex + 1, 13, 'k');
    g.set(ex + 1, 12, 'k');
  }
}

// =====================================================================
// 한 방향 그리기
// =====================================================================
function draw(c, v) {
  const g = new Grid();
  const props = c.props ?? [];
  // 뒤쪽
  cape(g, c, v, false);
  for (const p of props) PROPS[p](g, c, v, false);
  if (v !== 'up') hairBack(g, c, v);
  // 몸
  torso(g, c, v);
  if (c.decorUnder) for (const d of c.decorUnder) DECOR[d](g, c, v);
  arms(g, c, v);
  for (const d of c.decor ?? []) DECOR[d](g, c, v);
  // 머리
  if (c.helmet) helmet(g, c, v);
  else head(g, c, v);
  // 뒷모습: 망토, 긴 머리가 몸을 덮음
  if (v === 'up') {
    cape(g, c, v, true);
    if (c.hair?.long && !c.hood) hairBack(g, c, v);
  }
  for (const p of props) PROPS[p](g, c, v, true);
  return g.outline();
}

// =====================================================================
// 인물 설정. 대표색이 겹치지 않게: 각 줄 끝 주석 = 작게 봐도 구분되는 특징
// =====================================================================
const navyCoat = { ramp: R.navy, lower: 'coat', collar: 'N', belt: ['v', 'Y'], trim: 'Y', cuff: 'Y' };

export const CHARS = [
  // ---- 파티원 (걷기) ----
  {
    id: 'serena', kind: 'party', legs: { K: 'v', k: 'V', L: 'T', M: 'v' }, // 흰 드레스 + 빨간 세로선, 아주 긴 백금 머리
    hair: { ramp: ['v', 'V', 't', 'T'], style: 'straight', long: 34, wide: 2 },
    eye: 'x', pose: 'clasp', smile: false,
    outfit: { ramp: R.white, lower: 'robe', collar: 'v', cuff: 'x', hem: 'x' },
    decor: ['serenaTrim'],
  },
  {
    id: 'elysia', kind: 'party', legs: { K: 'I', k: 'k', L: 'I', M: 'u' }, // 남보라 로브, 하늘색 룬, 뒤틀린 지팡이
    hair: { ramp: ['l', 'm', 'M', 'L'], style: 'short', long: 26 },
    eye: 'i',
    outfit: { ramp: R.purple, lower: 'robe', collar: 'k', belt: ['o', 'p'], cuff: 'w' },
    decor: ['runes', 'pouch'],
    props: ['twistedStaff'],
  },
  {
    id: 'karg', kind: 'party', legs: { K: 't', k: 'T', L: 'k', M: 'K' }, // 늑대 귀와 꼬리, 맨 상체, 이빨 목걸이
    hair: { ramp: ['r', 't', 'T', 'R'], style: 'short', sides: 'H' },
    ears: true, eye: 'y', pose: 'cross', brow: 'T',
    outfit: { ramp: R.skin, sleeve: R.skin, lower: 'tunic', lowerRamp: R.tan, belt: ['k', 'K'], cuff: 'K' },
    decor: ['wolfGear'],
    props: ['tail'],
  },
  {
    id: 'adrian', kind: 'party', legs: { K: 'm', k: 'M', L: 'L', M: 'l' }, // 은 갑옷 + 흰 망토, 태양 방패
    hair: { ramp: ['y', 'y', 'Y', 'O'], style: 'slick' },
    eye: 'a', gloves: 'v',
    cape: R.white,
    outfit: { ramp: R.silver, lower: 'tunic', cuff: 'v' },
    decor: ['armor', 'tabard', 'adrianCross', 'pauldronsBlue'],
    props: ['shield'],
  },
  {
    id: 'galia', kind: 'party', legs: { K: 'K', k: 'k', L: 'L', M: 'M' }, // 진홍 어깨띠, 등의 큰 검, 남색 치마
    hair: { ramp: ['h', 'H', 'J', 'k'], style: 'short' },
    eye: 'g', scar: true, gloves: 'v',
    cape: R.navy,
    outfit: { ramp: R.navy, lower: 'skirt', collar: 'Y', cuff: 'm' },
    decor: ['chestplate', 'pauldrons', 'sash'],
    props: ['bigSword'],
  },

  // ---- NPC (서기) ----
  {
    id: 'bram', kind: 'npc', legs: {}, // 곱슬곱슬한 청흑색 긴 머리, 금 장식 많은 제복
    hair: { ramp: ['A', 'W', 'B', 'k'], style: 'curly', long: 21 },
    eye: 'g', smile: true, pose: 'cross', gloves: 'v',
    cape: R.navy, capeTrim: 'Y',
    outfit: { ...navyCoat, hem: 'Y' },
    decor: ['goldTrim'],
    props: ['sword'],
  },
  {
    id: 'oswald', kind: 'npc', legs: {}, // 콧수염, 은 술 견장과 날개 가슴판
    hair: { ramp: ['R', 'K', 'k', 'k'], style: 'slick', sides: 't' },
    moustache: 'k', brow: 'k', wings: true, swordDiagonal: true, gloves: 'v',
    cape: R.navy,
    outfit: { ...navyCoat, trim: 'm', cuff: 'v', belt: ['k', 'm'] },
    decor: ['chestplate', 'epaulettes'],
    props: ['sword'],
  },
  {
    id: 'aldric', kind: 'npc', legs: { K: 'v', k: 'V', L: 'Y', M: 'y' }, // 금 월계관, 흰 비단옷과 금 자수, 담비털을 두른 붉은 망토, 독수리 홀
    hair: { ramp: ['h', 'H', 'J', 'k'], style: 'short' },
    laurel: true, eye: 'A', brow: 'J', gloves: 'v',
    cape: R.red,
    outfit: { ramp: R.white, lower: 'robe', collar: 'v', cuff: 'Y', hem: 'Y' },
    decor: ['ermine'],
    props: ['scepter'],
  },
  {
    id: 'marcion_hooded', kind: 'npc', legs: { K: 'k', k: 'k' }, // 검은 후드, 그림자 진 얼굴, 하얀 빛
    hood: R.black, eye: 'T',
    cape: R.black,
    outfit: { ramp: R.black, lower: 'robe', belt: ['k', 'k'] },
    decor: ['glowHand', 'raggedHem'],
  },
  {
    id: 'marcion', kind: 'npc', legs: { K: 'k', k: 'k' }, // 검은 후드와 망토, 회색 사제복, 빛나는 흰 의수
    hood: R.black, eye: 'T',
    cape: R.black,
    outfit: { ramp: R.black, lower: 'robe', belt: ['k', 'K'] },
    decor: ['priest', 'glowHand'],
  },
  {
    id: 'ignatius', kind: 'npc', legs: { K: 'v', k: 'V' }, // 높은 흰 관, 흰 수염, 금 지팡이
    hair: { ramp: ['v', 'l', 'm', 'M'], style: 'straight', long: 22 },
    beard: ['v', 'v', 'V'], beardLen: 3, mitre: true, eye: 'a',
    outfit: { ramp: R.white, lower: 'robe', cuff: 'Y', hem: 'Y' },
    decor: ['stole'],
    props: ['goldStaff'],
  },
  {
    id: 'herman', kind: 'npc', legs: {}, // 진홍 코트와 흰 털 깃
    hair: { ramp: ['r', 't', 'T', 'R'], style: 'slick' },
    eye: 'T', smile: true, brow: 'T',
    outfit: { ramp: R.red, lower: 'robe', cuff: 'y', hem: 'Y' },
    decor: ['fur'],
  },
  {
    id: 'cassius', kind: 'npc', legs: { K: 'k', k: 'k' }, // 검은 로브와 은발, 초승달 별 지팡이
    hair: { ramp: ['l', 'm', 'M', 'L'], style: 'straight', long: 26 },
    beard: ['l', 'm', 'M'], circlet: true, eye: 'i', brow: 'M',
    outfit: { ramp: R.black, lower: 'robe', collar: 'k', cuff: 'u' },
    decor: ['starRobe'],
    props: ['moonStaff'],
  },

  // ---- 모브 (서기) ----
  {
    id: 'mob_royal_knight', kind: 'mob', name: '근위기사', legs: {}, // 남색 제복 + 은 투구 + 창
    helmet: { plume: R.navy }, gloves: 'v',
    cape: R.navy,
    outfit: { ...navyCoat },
    decor: ['pauldrons'],
    props: ['spear'],
  },
  {
    id: 'mob_paladin', kind: 'mob', name: '성기사단 병사', legs: { K: 'm', k: 'M', L: 'L', M: 'l' }, // 은 갑옷 + 흰 겉옷의 금 십자 + 창
    helmet: { plume: ['y', 'Y', 'O'] }, gloves: 'm',
    outfit: { ramp: R.silver, lower: 'tunic', cuff: 'm' },
    decor: ['armor', 'tabard', 'cross'], crossColor: 'Y',
    props: ['spear'],
  },
  {
    id: 'mob_gnosis', kind: 'mob', name: '그노시스회 하수인', legs: { K: 'k', k: 'k' }, // 검은 옷, 복면, 눈 펜던트
    hood: R.black, eye: 'w',
    outfit: { ramp: R.black, lower: 'tunic', belt: ['k', 'R'] },
    decor: ['eyePendant'],
    props: ['dagger'],
  },
  // ---- 1막 적 (서기) ----
  {
    id: 'imperial_spear', kind: 'mob', name: '제국 창병', legs: { K: 'O', k: 'P', L: 'C', M: 'D' }, // 붉은 겉옷 + 은 투구 + 창
    helmet: { plume: R.red }, gloves: 'o',
    outfit: { ramp: R.red, lower: 'tunic', collar: 'O', belt: ['o', 'O'], cuff: 'O' },
    decor: ['chestplate'],
    props: ['spear'],
  },
  {
    id: 'imperial_archer', kind: 'mob', name: '제국 궁병', legs: { K: 'O', k: 'P', L: 'C', M: 'D' }, // 가죽 옷 + 붉은 띠 + 활
    helmet: {}, gloves: 'o',
    outfit: { ramp: R.leather, lower: 'tunic', collar: 'X', belt: ['x', 'X'], cuff: 'X' },
    props: ['bow'],
  },
  {
    id: 'pursuit_sword', kind: 'mob', name: '추격 기사', legs: { K: 'A', k: 'W', L: 'L', M: 'M' }, // 회청색 갑옷과 망토 + 검
    helmet: { plume: R.slate }, gloves: 'M',
    cape: R.slate,
    outfit: { ramp: R.slate, lower: 'tunic', collar: 'm', belt: ['k', 'm'], cuff: 'm' },
    decor: ['chestplate', 'pauldrons'],
    props: ['sword'],
  },
  {
    id: 'pursuit_shield', kind: 'mob', name: '추격 기사 방패병', legs: { K: 'A', k: 'W', L: 'L', M: 'M' }, // 회청색 갑옷 + 큰 방패
    helmet: { plume: R.slate }, gloves: 'M',
    cape: R.slate,
    outfit: { ramp: R.slate, lower: 'tunic', collar: 'm', belt: ['k', 'm'], cuff: 'm' },
    decor: ['chestplate', 'pauldrons'],
    props: ['kiteShield'],
  },
  {
    id: 'mob_citizen', kind: 'mob', name: '황도 시민', legs: { K: 'C', k: 'C', L: 'D', M: 'd' }, // 초록 웃옷, 갈색 머리, 바구니
    hair: { ramp: ['p', 'o', 'O', 'P'], style: 'short' },
    eye: 'k',
    outfit: { ramp: R.green, lower: 'tunic', collar: 'c', belt: ['o', 'p'], cuff: 'c' },
    props: ['basket'],
  },
];

// 인물 하나만 쓰는 장식
Object.assign(DECOR, {
  serenaTrim(g, c, v) {
    if (v === 'up') return;
    const xs = v === 'right' ? [18] : [12, 19];
    for (const x of xs) g.rect(x, 26, x, 34, 'x');
    if (v === 'down') {
      g.rect(9, 19, 22, 19, 'x'); // 케이프 테두리
      g.set(15, 21, 'Y');
      g.set(16, 21, 'Y');
    }
  },
  adrianCross(g, c, v) {
    if (v !== 'down') return;
    g.rect(15, 19, 16, 25, 'n');
    g.rect(13, 21, 18, 21, 'n');
    g.set(15, 21, 'y');
  },
  pauldronsBlue(g, c, v) {
    DECOR.pauldrons(g, c, v);
    if (v === 'right') g.set(15, 19, 'n');
    else {
      g.set(7, 19, 'n');
      g.set(24, 19, 'n');
    }
  },
  stole(g, c, v) {
    if (v === 'up') return;
    if (v === 'right') {
      g.rect(18, 18, 19, 33, 'Y');
      return;
    }
    g.rect(11, 18, 12, 33, (x) => (x === 11 ? 'y' : 'Y'));
    g.rect(19, 18, 20, 33, (x) => (x === 19 ? 'Y' : 'O'));
    g.rect(14, 22, 17, 22, 'Y');
    g.rect(15, 21, 16, 25, 'Y');
  },
  /** 알드릭 황제: 흰 담비털 어깨 망토(검은 점), 붉은 대관 망토의 털 안단, 금 자수 옷자락, 가슴의 훈장 */
  ermine(g, c, v) {
    const fur = (x, y) => ((x * 3 + y * 5) % 7 === 0 ? 'k' : (x + y) % 4 === 0 ? 'V' : 'v');
    if (v === 'up') {
      g.trap(17, 21, 7, 24, 5, 26, fur);
      for (let y = 22; y <= 34; y++) {
        g.set(5 + Math.round((y - 22) * -0.15), y, fur(5, y));
      }
      g.rect(4, 33, 27, 34, fur);
      return;
    }
    if (v === 'right') {
      g.ellipse(14.5, 19, 5.5, 3, fur);
      g.rect(9, 21, 10, 34, fur); // 망토 앞자락의 털
      g.rect(12, 30, 21, 30, 'y');
      for (let x = 12; x <= 21; x += 2) g.set(x, 32, 'Y');
      return;
    }
    // 앞: 어깨를 덮는 털, 양옆으로 흘러내리는 붉은 망토와 털 안단
    g.ellipse(9.5, 19, 5, 3.2, fur);
    g.ellipse(21.5, 19, 5, 3.2, fur);
    g.rect(13, 17, 18, 18, 'v'); // 레이스 깃
    g.rect(4, 19, 5, 34, (x, y) => (x === 4 ? 'Z' : 'X'));
    g.rect(26, 19, 27, 34, (x, y) => (x === 27 ? 'Z' : 'X'));
    g.rect(6, 22, 7, 34, fur);
    g.rect(24, 22, 25, 34, fur);
    // 금 자수: 앞섶과 옷자락
    g.rect(15, 19, 16, 26, (x, y) => ((y + x) % 2 ? 'y' : 'v'));
    for (let x = 9; x <= 22; x++) {
      g.set(x, 31, x % 2 ? 'y' : 'Y');
      if (x % 3 === 0) g.set(x, 32, 'Y');
    }
    // 훈장 (붉은 끈, 은 별)
    g.set(12, 21, 'x');
    g.set(12, 22, 'm');
  },
  raggedHem(g, c, v) {
    for (let x = 4; x <= 27; x++) if (x % 3 === 0) g.set(x, 34, '.');
  },
});

// =====================================================================
// 레온 두건 망토 변형
// =====================================================================
function leonArt(name) {
  const rows = [];
  let on = false;
  for (const raw of readFileSync(join(HERE, 'art', 'leon.txt'), 'utf8').split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line === `[${name}]`) on = true;
    else if (on && (line === '' || line.startsWith('['))) break;
    else if (on && !line.startsWith('#')) rows.push(line);
  }
  return rows.map((r) => [...r]);
}

/** 머리카락 → 두건 천, 남색 옷 → 갈색 망토. 두건은 머리 둘레로 한 칸 크게, 어깨까지 늘어뜨림 */
export function leonHood(v) {
  const d = leonArt(`leon_body_${v}`);
  const H = d.length;
  const W = d[0].length;
  const HAIR = { j: 'p', h: 'o', H: 'O', J: 'P' };
  const CLOTH = { b: 'p', n: 'o', N: 'O', B: 'P' };
  // 머리 영역 (얼굴 아래 줄까지)
  const headRows = v === 'up' ? 18 : 17;
  const src = d.map((r) => [...r]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const ch = src[y][x];
      if (y < headRows && HAIR[ch]) d[y][x] = HAIR[ch];
      else if (y >= 17 && CLOTH[ch]) d[y][x] = CLOTH[ch];
    }
  // 두건 둘레를 한 칸 넓힘 (머리 영역의 바깥 빈칸 → 윤곽)
  const cur = d.map((r) => [...r]);
  for (let y = 0; y < headRows; y++)
    for (let x = 0; x < W; x++) {
      if (cur[y][x] !== '.') continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => 'pPoO'.includes(cur[y + dy]?.[x + dx] ?? '.'));
      if (near) d[y][x] = 'P';
    }
  // 어깨로 늘어진 두건 자락 (양옆 몇 줄)
  if (v !== 'up') {
    const sides = v === 'right' ? [[9, 11]] : [[7, 9], [22, 24]];
    for (const [x0, x1] of sides)
      for (let y = 12; y <= 16; y++)
        for (let x = x0; x <= x1; x++) if (d[y][x] === '.' || 'JhHj'.includes(d[y][x])) d[y][x] = x === x0 || x === x1 ? 'P' : 'O';
  }
  return d.map((r) => r.join('')).join('\n');
}

// =====================================================================
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
const out = ['# 인물 도트 (tools/pixel-art/gen-characters.mjs가 만든 파일. 다시 실행하면 덮어씀)', '# 몸통 32x35. 다리는 leon.txt의 다리를 인물별로 색만 바꿔 씀 (outputs.mjs)', ''];
for (const c of CHARS) {
  for (const v of ['down', 'up', 'right']) out.push(`[${c.id}_body_${v}]`, draw(c, v).text(), '');
}
// 레온 갈색 두건 망토 (1막): leon.txt의 몸 그림에 두건을 씌우고 남색 제복을 갈색 망토로
for (const v of ['down', 'up', 'right']) out.push(`[leon_hood_body_${v}]`, leonHood(v), '');
writeFileSync(join(HERE, 'art', 'characters.txt'), out.join('\n'));
console.log(`인물 ${CHARS.length}명 → art/characters.txt`);
}
