// 3등신 고해상도 인물 (docs/도트기준.md 2절)
// 그림 칸 64x96 (= 논리 32x48의 2배)에 고해상도 칸 하나하나로 바로 그린다. 발끝 91줄
//
// 비율 (레퍼런스 그림을 잰 값을 따름, tools/pixel-art/check-tall.mjs 로 늘 검사)
//   키: 머리카락 꼭대기(약 4줄) ~ 발끝(91줄) = 약 87칸, 머리(머리카락 꼭대기 ~ 턱 31줄) 약 27칸 → 3.2~3.4등신
//   얼굴 폭 21칸, 머리카락은 얼굴 가장자리에서 바깥으로 2칸까지 (머리 폭 약 25칸)
//   어깨 폭(팔 포함) = 머리 폭의 1.0~1.25배 (덩치 큰 인물이 큼)
//   머리카락은 얼굴 표(HEAD_M/HEAD_F, SIDE)를 기준으로 붙인다 → 머리와 머리카락이 어긋나지 않음
//   머리·머리카락·몸통·든 물건은 한 덩어리로 같이 움직인다(oy). 걸을 때 따로 움직이는 건 다리·팔·치맛단뿐
// 옷·색·소품은 스탠딩 일러스트(public/assets/portraits/{id}_body.png)를 따름
// 지금은 TALL 표에 있는 인물(파티)만 이 방식. 나머지 인물은 hd/people.mjs
import { RAMPS } from '../palette.mjs';
import { Layer } from './layer.mjs';
import { PEOPLE } from './people.mjs';
import { castSpec, headwear, beard, outfitGeneric } from './tall_cast.mjs';
import { stampBig } from './bigface.mjs';

const R = RAMPS;
const W = 64;
const H = 96;
export const FOOT_T = 91;
const CX = 31.5;
const lay = () => new Layer(W, H, 1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** 가로 -1(왼쪽, 밝음) ~ 1(오른쪽, 그늘) */
const sh = (r, s, a = -0.4, b = 0.45) => (s < a ? r[0] : s > b ? r[2] : r[1]);

// ---------------------------------------------------------------------
// 그리기 도구 (고해상도 한 칸 단위)
// ---------------------------------------------------------------------
/** 줄마다 [왼쪽, 오른쪽]을 주는 모양. col(x, y, t) t: 0(왼)~1(오른) */
function spans(L, y0, y1, f, col) {
  if (L.tf) {
    const T = L.tf;
    const [Y0, Y1] = L.rows(Math.round(y0), Math.round(y1));
    for (let Y = Y0; Y <= Y1; Y++) {
      const yf = snap(T.iy(Y));
      const s = f(yf);
      if (!s) continue;
      const yr = Math.round(yf);
      const l = Math.round(T.fx(s[0], yf));
      const r = Math.round(T.fx(s[1], yf));
      for (let X = l; X <= r; X++) {
        const c = col(Math.round(T.ix(X, yf)), yr, r === l ? 0.5 : (X - l) / (r - l));
        if (c) L.setHi(X, Y, c);
      }
    }
    return L;
  }
  for (let y = Math.round(y0); y <= Math.round(y1); y++) {
    const s = f(y);
    if (!s) continue;
    const l = Math.round(s[0]);
    const r = Math.round(s[1]);
    for (let x = l; x <= r; x++) {
      const c = col(x, y, r === l ? 0.5 : (x - l) / (r - l));
      if (c) L.set(x, y, c);
    }
  }
  return L;
}
/** 팔·다리: a에서 b로 굵기 r0→r1. col(s, t, x, y) s: 가로 -1~1(오른쪽·아래가 그늘), t: 0~1 */
function limb(L, ax, ay, bx, by, r0, r1, col) {
  if (L.tf) {
    const T = L.tf;
    const P = lay();
    const q = T.sx(ay);
    limb(P, T.fx(ax, ay), T.fy(ay), T.fx(bx, by), T.fy(by), r0 * q, r1 * q, (s2, t, x, y) => {
      const hy = Math.round(T.iy(y));
      return col(s2, t, Math.round(T.ix(x, hy)), hy);
    });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (P.d[y][x]) L.setHi(x, y, P.d[y][x]);
    return L;
  }
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const len = Math.sqrt(len2);
  let nx = -dy / len;
  let ny = dx / len;
  if (nx < 0 || (nx === 0 && ny < 0)) { nx = -nx; ny = -ny; }
  const m = Math.max(r0, r1) + 1;
  for (let y = Math.floor(Math.min(ay, by) - m); y <= Math.ceil(Math.max(ay, by) + m); y++)
    for (let x = Math.floor(Math.min(ax, bx) - m); x <= Math.ceil(Math.max(ax, bx) + m); x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
      const r = r0 + (r1 - r0) * t;
      const d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
      if (d > r) continue;
      const c = col(((px - ax - dx * t) * nx + (py - ay - dy * t) * ny) / r, t, x, y);
      if (c) L.set(x, y, c);
    }
  return L;
}
/** 뾰족한 조각(머리 갈래): 밑변 (x0~x1, y0) → 끝 (tx, ty). col(x, y, t, k) */
function lock(L, x0, x1, y0, tx, ty, col) {
  if (L.tf) {
    const T = L.tf;
    const [Y0, Y1] = L.rows(Math.min(y0, ty), Math.max(y0, ty));
    for (let Y = Y0; Y <= Y1; Y++) {
      const y = T.iy(Y);
      const k = Math.max(0, Math.min(1, ty === y0 ? 0 : (y - y0) / (ty - y0)));
      const l = Math.round(T.fx(x0 + (tx - x0) * k, y));
      const r = Math.round(T.fx(x1 + (tx - x1) * k, y));
      for (let X = l; X <= r; X++) {
        const c = col(Math.round(T.ix(X, y)), Math.round(y), r === l ? 0.5 : (X - l) / (r - l), k);
        if (c) L.setHi(X, Y, c);
      }
    }
    return L;
  }
  const n = Math.max(1, Math.abs(ty - y0));
  const dir = ty >= y0 ? 1 : -1;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const y = y0 + i * dir;
    const l = Math.round(x0 + (tx - x0) * k);
    const r = Math.round(x1 + (tx - x1) * k);
    for (let x = l; x <= r; x++) {
      const c = col(x, y, r === l ? 0.5 : (x - l) / (r - l), k);
      if (c) L.set(x, y, c);
    }
  }
  return L;
}
const ell = (L, cx, cy, rx, ry, col) => L.ellipse(cx, cy, rx, ry, col);
/** 글자 그림 찍기 (mirror면 좌우 뒤집어) */
function stamp(L, x, y, rows, map, mirror = false) {
  rows.forEach((r, j) => [...r].forEach((ch, i) => {
    const c = map[ch];
    if (c) L.set(mirror ? x + r.length - 1 - i : x + i, y + j, c);
  }));
}
/** 이미 칠한 칸만 다시 칠함 (띠·허리띠를 몸 폭에 맞춤) */
function band(L, y0, y1, col) {
  for (let y = y0; y <= y1; y++) {
    const xs = [];
    for (let x = 0; x < W; x++) if (L.getHi(x, y)) xs.push(x);
    if (!xs.length) continue;
    const l = xs[0];
    const r = xs[xs.length - 1];
    for (const x of xs) {
      const c = col(x, y, r === l ? 0.5 : (x - l) / (r - l), x === l || x === r);
      if (c) L.set(x, y, c);
    }
  }
}
const out = (L, o = {}) => L.outline(o);

// ---------------------------------------------------------------------
// 큰 머리 (docs/도트기준.md 2절): 머리 그림은 예전 표(턱 31줄) 그대로 그리고, 그릴 때 좌표를 키워 찍는다.
// 키운 좌표에서 모양을 바로 칠하므로(가장자리 매끄러움) 외곽선도 한 칸 굵기 그대로.
// 몸은 BODY_DOWN칸 내려가고 다리가 그만큼 짧아짐(발끝 91줄은 그대로)
// ---------------------------------------------------------------------
export const HEAD_K = 1.08;
export const BODY_DOWN = 1;
const FACE_K0 = 1.3; // 얼굴 지도(faces/{id}.mjs big)를 그린 때의 머리 배율
const KX_LOW = Math.min(1.12, HEAD_K + 0.04); // 턱 아래(긴 머리)의 가로 배율
function headWarp(oy, kk = HEAD_K) {
  const A = 31.5 + oy; // 턱 아래 경계(예전 좌표)
  const A2 = A + BODY_DOWN;
  const k = kk;
  const kb = (FOOT_T - 3 - A2) / (FOOT_T - 3 - A);
  const kx = (y) => (y <= A ? k : Math.max(KX_LOW, k - (y - A) * 0.03));
  return {
    k,
    fy: (y) => (y <= A ? A2 + (y - A) * k : A2 + (y - A) * kb),
    iy: (Y) => (Y <= A2 ? A + (Y - A2) / k : A + (Y - A2) / kb),
    fx: (x, y) => CX + (x - CX) * kx(y),
    ix: (X, y) => CX + (X - CX) / kx(y),
    sy: (y) => (y <= A ? k : kb),
    sx: kx,
  };
}
const snap = (v) => (Math.abs(v - Math.round(v)) < 0.3 ? Math.round(v) : v);
class WLayer extends Layer {
  constructor(tf) {
    super(W, H, 1);
    this.tf = tf;
  }
  rows(y0, y1) {
    const T = this.tf;
    const a = Math.round(T.fy(y0 - 0.5));
    const b = Math.max(a, Math.round(T.fy(y1 + 0.5)) - 1);
    return [a, b];
  }
  cols(x0, x1, y) {
    const T = this.tf;
    const a = Math.round(T.fx(x0 - 0.5, y));
    const b = Math.max(a, Math.round(T.fx(x1 + 0.5, y)) - 1);
    return [a, b];
  }
  block(x, y, fn) {
    x = Math.round(x);
    y = Math.round(y);
    const [Y0, Y1] = this.rows(y, y);
    const [X0, X1] = this.cols(x, x, y);
    for (let Y = Y0; Y <= Y1; Y++) for (let X = X0; X <= X1; X++) fn(X, Y);
  }
  set(x, y, c) {
    if (c) this.block(x, y, (X, Y) => this.setHi(X, Y, c));
  }
  clear(x, y) {
    this.block(x, y, (X, Y) => { if (X >= 0 && Y >= 0 && X < this.w && Y < this.h) this.d[Y][X] = null; });
  }
  getHi(x, y) {
    const T = this.tf;
    const X = Math.round(T.fx(x, y));
    const Y = Math.round(T.fy(y));
    return X >= 0 && Y >= 0 && X < this.w && Y < this.h ? this.d[Y][X] : null;
  }
  under(o) {
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) if (o.d[y][x] && !this.d[y][x]) this.d[y][x] = o.d[y][x];
    return this;
  }
  rect(x0, y0, x1, y1, c) {
    const T = this.tf;
    const [Y0, Y1] = this.rows(Math.round(y0), Math.round(y1));
    for (let Y = Y0; Y <= Y1; Y++) {
      const y = Math.round(T.iy(Y));
      const [X0, X1] = this.cols(Math.round(x0), Math.round(x1), y);
      for (let X = X0; X <= X1; X++) {
        const col = typeof c === 'function' ? c(Math.round(T.ix(X, y)), y) : c;
        if (col) this.setHi(X, Y, col);
      }
    }
    return this;
  }
  ellipse(cx, cy, rx, ry, c) {
    const T = this.tf;
    // 타원 가운데는 칸 가장자리 좌표(칸 x의 가운데 = x + 0.5)
    const X = T.fx(cx - 0.5, cy) + 0.5;
    const Y = T.fy(cy - 0.5) + 0.5;
    return super.ellipse(X, Y, rx * T.sx(cy), ry * T.sy(cy), (x, y, nx, ny) => {
      const hy = Math.round(T.iy(y));
      return typeof c === 'function' ? c(Math.round(T.ix(x, hy)), hy, nx, ny) : c;
    });
  }
  clone() {
    const l = new Layer(W, H, 1);
    l.d = this.d.map((r) => [...r]);
    return l;
  }
}
/** 머리 쪽 그림판 (c.warp가 있으면 키워 찍음) */
const wl = (c) => (c.warp ? new WLayer(c.warp) : lay());

// ---------------------------------------------------------------------
// 인물 표
// ---------------------------------------------------------------------
// build: [어깨 반폭, 허리 반폭, 엉덩이 반폭, 팔 굵기(반지름)], drop: 키 차이(고해상도 칸), girl: 턱이 좁음
export const TALL = {
  leon: { hair: 'messy', build: [12.5, 8.5, 9, 2.5], eyes: 'sharp', brow: 'sharp', darkHair: true },
  leon_blade: { as: 'leon' },
  leon_hood: { as: 'leon', hood: true },
  serena: { hair: 'straight', build: [10.5, 6.5, 7.5, 2.1], girl: true, skirt: true, eyes: 'round', brow: 'soft', drop: 3 },
  serena_hood: { as: 'serena', hood: true },
  elysia: { hair: 'wavy', build: [10.5, 7, 8, 2.3], girl: true, skirt: true, eyes: 'calm', brow: 'thin', drop: 2 },
  karg: { hair: 'wild', build: [13.5, 9, 9.5, 3], eyes: 'fierce', brow: 'heavy', ears: true, boot: 77, thick: true },
  adrian: { hair: 'slick', build: [13, 9.5, 9.5, 2.6], eyes: 'sharp', brow: 'plain', boot: 81, knee: true },
  galia: { hair: 'short', side: 21, build: [11.5, 7.5, 8.5, 2.3], girl: true, skirt: true, eyes: 'sharp', brow: 'sharp', drop: 1 },
};
export function specOf(id) {
  const s = TALL[id];
  if (!s) return castSpec(id, PEOPLE[id]);
  return s?.as ? { ...TALL[s.as], ...s, look: s.as } : { ...s, look: id };
}

// ---------------------------------------------------------------------
// 머리 (얼굴 살) — 모든 머리카락은 이 표를 기준으로 붙는다
// ---------------------------------------------------------------------
// 6줄(정수리)부터 31줄(턱)까지 반폭
const HEAD_M = [5, 7.3, 8.6, 9.4, 10, 10.3, 10.5, 10.5, 10.5, 10.5, 10.5, 10.5, 10.5, 10.5, 10.5, 10.5, 10.5, 10.4, 10.1, 9.7, 9.1, 8.4, 7.5, 6.3, 4.8, 3];
const HEAD_F = [5, 7.3, 8.6, 9.4, 10, 10.3, 10.5, 10.5, 10.5, 10.5, 10.5, 10.5, 10.5, 10.5, 10.5, 10.5, 10.4, 10.2, 9.8, 9.2, 8.4, 7.4, 6.2, 4.8, 3.2];
/** 얼굴 반폭 (r: 6~31) */
export const faceHW = (girl, r) => (girl ? HEAD_F : HEAD_M)[Math.round(r) - 6] ?? 0;
/** 머리카락 덮개 반폭: 정수리는 얼굴보다 2칸 크게, 위는 둥글게 */
// 정수리 모서리에서 머리 살이 삐져나오지 않게 얼굴 표보다 늘 1.5칸 크게
const capHW = (r) => (r < 5 ? 0 : Math.max(12.6 * Math.sqrt(Math.max(0, 1 - ((r - 16.8) / 11.8) ** 2)), r < 17 ? (HEAD_M[Math.round(r) - 6] ?? 0) + 1.5 : 0));
// 옆 보기 얼굴 [뒤, 앞] (6줄부터 31줄). 앞: 이마 40.8, 코끝 42.3(23줄), 턱 35(31줄)
const SIDE = [
  [26, 35], [23.5, 37.5], [22, 39], [21, 40], [20.4, 40.5], [20, 40.8], [20, 40.8], [20, 40.8], [20, 40.8], [20, 40.8],
  [20, 40.8], [20, 40.8], [20, 40.8], [20.2, 40.6], [20.4, 40.6], [20.8, 41], [21.2, 41.8], [21.6, 42.3], [22.2, 41.4], [23, 40.6],
  [24, 40.4], [25, 40.4], [26.5, 40], [28, 39], [30, 37.5], [32, 35],
];
export const sideAt = (r) => SIDE[Math.round(r) - 6];
const SIDE_CX = 30.5; // 옆 보기 머리 가운데(귀 조금 앞)

function drawHead(c) {
  const L = wl(c);
  const sk = c.p.skin;
  const { oy, v, s } = c;
  if (v === 'right') {
    spans(L, 6 + oy, 31 + oy, (y) => sideAt(y - oy), (x, y, t) => {
      const r = y - oy;
      if (r >= 28 && t > 0.5) return sk[2];
      return r > 14 && r < 25 && t > 0.62 && t < 0.82 ? sk[0] : sk[1];
    });
    ell(L, 28.5, 21.5 + oy, 2, 2.8, (x, y, nx) => (nx < 0 ? sk[1] : sk[2])); // 귀
    out(L);
    L.set(28, 21 + oy, sk[3]);
    L.set(29, 22 + oy, sk[3]);
    return L;
  }
  spans(L, 6 + oy, 31 + oy, (y) => {
    const hw = faceHW(s.girl, y - oy);
    return hw ? [CX - hw + 0.5, CX + hw - 0.5] : null;
  }, (x, y, t) => {
    const r = y - oy;
    if (v === 'up') return t > 0.75 ? sk[2] : sk[1];
    if (t > 0.88 || (r >= 27 && t > 0.62)) return sk[2];
    if (t < 0.12 && r > 13 && r < 26) return sk[0];
    return sk[1];
  });
  if (v === 'down') for (const ex of [20.5, 42.5]) ell(L, ex, 21.5 + oy, 1.5, 2.5, (x) => (x < 31 ? sk[1] : sk[2])); // 귀
  out(L);
  if (v === 'down') { L.set(21, 21 + oy, sk[3]); L.set(42, 21 + oy, sk[3]); }
  return L;
}

/** 큰 얼굴: 인물마다 얼굴 지도(faces/{id}.mjs 의 big)를 찍음. 없으면 설정으로 만든 기본 얼굴 */
function drawFaceBig(c, L) {
  const { p, s, oy, v, id } = c;
  if (v === 'up') return;
  const browOf = { sharp: 'sharp', heavy: 'heavy', plain: 'flat', soft: 'soft', thin: 'thin' };
  const fb = {
    eyes: s.eyes ?? 'small', brow: browOf[s.brow] ?? 'flat', girl: !!s.girl,
    mouth: p.smile ? 'smile' : s.girl ? 'small' : 'line', blush: !!p.blush, freckles: !!p.freckles, scar: !!p.scar,
  };
  // 얼굴 지도는 머리 배율 FACE_K0(드워프는 설정 headK), 몸 내림 5칸일 때 그렸음 → 지금 배율로 맞춰 찍음
  const k0 = s.headK ?? FACE_K0;
  const fit = { r: c.warp.k / k0, ao: 31.5 + oy + 5, an: 31.5 + oy + BODY_DOWN, cx: CX, oy };
  stampBig(L, p, p.face ?? s.faceId ?? id.replace(/_vd$/, ''), v, oy, fb, fit);
}

/** 목 (몸 쪽 좌표) */
function drawNeck(c) {
  const L = lay();
  const sk = c.p.skin;
  const { oy, v } = c;
  if (v === 'right') L.rect(27, 29 + oy, 33, 35 + oy, (x, y) => (x > 31 || y < 31 + oy ? sk[2] : sk[1]));
  else L.rect(28, 29 + oy, 35, 35 + oy, (x, y) => (y < 32 + oy || x > 33 ? sk[2] : sk[1]));
  return out(L);
}

// ---------------------------------------------------------------------
// 얼굴. 글자: L 속눈썹 G 눈동자 어둠 F 눈동자 E 눈동자 밝음 W 반짝임 w 흰자
// 왼쪽 눈 그림(바깥쪽이 왼쪽). 오른쪽 눈은 뒤집어 찍음. 눈은 19줄부터, 왼쪽 눈 24~28칸, 오른쪽 35~39칸
// ---------------------------------------------------------------------
const EYES = {
  sharp: { down: ['LLLLL', '.wGWG', '..FEF'], right: ['LLL', 'GW.', 'FE.'] },
  round: { down: ['.LLLL', 'LGGWw', '.FGFw', '.EFE.'], right: ['LLL', 'GWw', 'FGw', 'EE.'] },
  calm: { down: ['LLLL.', 'LLLLL', '.GWFw', '.EFE.'], right: ['LLLL', 'GWF.', 'EF..'] },
  small: { down: ['LLLL', '.GWG', '.FEF'], right: ['LL.', 'GW.', 'FE.'] },
  narrow: { down: ['LLLLL', '.LGWG'], right: ['LLL', 'LGW'] },
};
function drawFace(c, L) {
  const { p, s, oy, v } = c;
  if (v === 'up') return;
  const sk = p.skin;
  const e = p.eye;
  const map = { L: R.slate[3], G: e[2], F: e[1], E: e[0], W: R.white[0], w: R.white[2] };
  const T = EYES[s.eyes] ?? EYES.sharp;
  const brow = p.browColor ?? p.hair[3];
  const ey = 19 + oy;
  if (v === 'down') {
    // 둥근 눈(세레나·엘리시아)은 두 눈을 한 칸씩 안쪽으로 (눈 사이 4칸)
    const ei = s.eyes === 'round' || s.eyes === 'calm' ? 1 : 0;
    const ew = T.down[0].length;
    stamp(L, 29 - ew + ei, ey, T.down, map);
    stamp(L, 35 - ei, ey, T.down, map, true);
    const bw = s.brow === 'heavy' ? 2 : 1;
    const by = ey - (s.brow === 'soft' ? 3 : 2);
    const BROW = {
      sharp: [[24, 1], [25, 1], [26, 0], [27, 0], [28, 0]],
      heavy: [[24, 1], [25, 0], [26, 0], [27, 0], [28, 1]],
      plain: [[24, 1], [25, 0], [26, 0], [27, 0], [28, 0]],
      soft: [[25, 0], [26, 0], [27, 0]],
      thin: [[24, 1], [25, 0], [26, 0], [27, 0]],
    }[s.brow] ?? [];
    for (const [x, d] of BROW) for (let k = 0; k < bw; k++) { L.set(x + ei, by + d + k, brow); L.set(63 - x - ei, by + d + k, brow); }
    L.set(32, 24 + oy, sk[2]);
    L.set(31, 25 + oy, sk[2]);
    if (s.girl) { L.set(31, 27 + oy, sk[3]); L.set(32, 27 + oy, sk[3]); } else if (p.smile) { L.set(29, 26 + oy, sk[3]); L.rect(30, 27 + oy, 33, 27 + oy, sk[3]); L.set(34, 26 + oy, sk[3]); } else L.rect(30, 27 + oy, 33, 27 + oy, sk[3]);
    if (p.freckles) for (const x of [25, 27, 36, 38]) L.set(x, 23 + oy, R.fire[2]);
    if (p.blush) for (const x of [24, 25, 38, 39]) L.set(x + (x < 31 ? ei : -ei), 24 + oy, R.red[0]);
    if (p.scar) for (const [x, y] of [[38, 23], [37, 24], [36, 25]]) L.set(x, y + oy, sk[3]);
    return;
  }
  stamp(L, 36, ey, T.right, map);
  const by = ey - (s.brow === 'soft' ? 3 : 2);
  for (let x = 35; x <= 39; x++) L.set(x, by + (x === 35 && s.brow !== 'soft' ? 1 : 0), brow);
  if (s.brow === 'heavy') for (let x = 35; x <= 39; x++) L.set(x, by + 1, brow);
  L.set(41, 24 + oy, sk[2]);
  L.set(39, 27 + oy, sk[3]);
  if (!s.girl) L.set(38, 27 + oy, sk[3]);
  if (p.blush) for (const x of [36, 37]) L.set(x, 24 + oy, R.red[0]);
  if (p.scar) for (const [x, y] of [[36, 23], [35, 24], [34, 25]]) L.set(x, y + oy, sk[3]);
}

// ---------------------------------------------------------------------
// 머리카락 (얼굴 표에 붙임)
// ---------------------------------------------------------------------
// 스타일: 이마 선(hl), 옆머리 끝(side), 옆머리 굵기(th), 뒷목(nape), 긴 머리 끝(long)
const STYLE = {
  messy: { hl: 12, side: 21, th: 2, nape: 27 },
  wild: { hl: 12, side: 22, th: 2.5, nape: 28 },
  slick: { hl: 10, side: 18, th: 1.5, nape: 26 },
  bob: { hl: 12, side: 29, th: 3, nape: 29 },
  straight: { hl: 12, side: 50, th: 3, nape: 31, long: 88 },
  wavy: { hl: 12, side: 46, th: 3, nape: 31, long: 66 },
  short: { hl: 12, side: 20, th: 1.5, nape: 26 },
  curly: { hl: 11, side: 24, th: 3, nape: 28 },
  curlylong: { hl: 11, side: 40, th: 3.5, nape: 31, long: 48 },
  long: { hl: 11, side: 40, th: 2.5, nape: 31, long: 56 },
  bald: { none: true, hl: 12, side: 0, th: 0, nape: 0 },
};
/** 인물 설정의 길이(조연: long·side)를 덮어쓴 머리 모양 */
const styleOf = (s) => ({ ...STYLE[s.hair], ...(s.long ? { long: s.long } : {}), ...(s.side ? { side: s.side } : {}) });
/** 둥근 면 명암 (nx, ny: -1~1, 왼쪽 위가 밝음) */
const roundShade = (h, nx, ny) => {
  const l = -(nx * 0.55 + ny * 0.8);
  return l > 0.6 ? h[0] : l > -0.05 ? h[1] : l > -0.6 ? h[2] : h[3];
};
const lockShade = (h, dark = false) => (x, y, t) => (t > 0.66 ? h[dark ? 3 : 2] : h[dark ? 2 : 1]);

/** 몸 뒤로 늘어지는 긴 머리. 폭은 머리 폭(덮개)을 넘지 않게 */
function drawHairBack(cB) {
  const c = cB.H ?? cB;
  const L = wl(c);
  const { s, p, oy, v, sway } = c;
  const h = p.hair;
  const st = styleOf(s);
  if (s.braid && !s.hood) {
    // 한 갈래로 땋아 등 뒤로 (뒤 보기·옆 보기에서 보임)
    const bx = v === 'right' ? 21 : CX;
    for (let y = 26 + oy; y <= s.braid + oy; y++) {
      const k = Math.floor((y - oy) / 3) % 2;
      const w = y > s.braid + oy - 3 ? 1 : 2;
      for (let dx = -w; dx <= w; dx++) L.set(Math.round(bx + sway * 0.5) + dx + k - 1, y, dx < 0 ? h[1] : h[2]);
    }
    return out(L);
  }
  if (s.hood || st.none || !st.long) return L;
  const wavy = s.hair === 'wavy' || s.hair === 'curlylong';
  const curls = s.hair === 'curlylong';
  const bot = wavy || s.generic ? st.long + oy : st.long;
  const wave = (y) => (curls ? Math.abs(Math.sin((y - oy) / 2.2)) * 1.6 : wavy ? Math.sin((y - oy) / 5) * 1 : 0);
  if (v === 'right') {
    // 뒤통수(20칸)에서 등 뒤로
    spans(L, 14 + oy, bot, (y) => {
      const k = (y - 14 - oy) / (bot - 14 - oy);
      return [20.5 - k * (1.5 + c.flare * 1.5) + wave(y), 29];
    }, (x, y, t) => ((x * 2 + Math.floor((y - oy) / 5)) % 7 === 0 ? h[2] : t < 0.3 ? h[1] : t > 0.75 ? h[3] : h[2]));
  } else {
    spans(L, (v === 'up' ? 5 : 12) + oy, bot, (y) => {
      const r = y - oy;
      const k = clamp((y - 34 - oy) / (bot - 34 - oy), 0, 1);
      const hw = (r < 16 ? capHW(r) : 12.4) + k * (wavy ? 0.6 : 1.2) + wave(y);
      return [CX - hw + 0.5 + sway * k, CX + hw - 0.5 + sway * k];
    }, (x, y, t) => {
      if (v === 'up') {
        // 머리 결: 굵은 다발 4개(경계 3줄). 다발마다 왼쪽은 밝고 오른쪽 끝은 그늘, 정수리 아래에 빛 띠
        const r = y - oy;
        const bend = Math.sin(r / 9) * 0.025 * (wavy ? 1.6 : 1);
        const tt = t + bend * (1 - Math.abs(t - 0.5) * 2);
        const B = [0, 0.27, 0.5, 0.73, 1];
        let i = 0;
        while (i < 3 && tt > B[i + 1]) i++;
        const u = (tt - B[i]) / (B[i + 1] - B[i]);
        if (r > 15 && u > 0.86) return h[3];
        if (r > 15 && u > 0.6) return h[2];
        if (r >= 11 && r <= 13 && u > 0.15 && u < 0.6) return h[0];
        if (t > 0.9) return h[2];
        return t < 0.08 || (u < 0.25 && r > 15 && r < bot - oy - 8) ? h[0] : h[1];
      }
      return t < 0.2 ? h[2] : t > 0.8 ? h[3] : h[2];
    });
    for (let x = 20; x < 44; x += 3) L.clear(x + Math.round(sway), bot);
  }
  return out(L);
}

/** 정수리·앞머리·옆머리 (얼굴 위) */
function drawHairFront(c) {
  const L = wl(c);
  const { s, p, oy, v } = c;
  const h = p.hair;
  if (s.hood || s.helmet) return L;
  const name = s.hair;
  const st = styleOf(s);
  if (st.none) return L;
  const Y = (n) => n + oy;
  const sh2 = lockShade(h);
  if (v === 'up') {
    // 뒤통수: 덮개, 뒷목에서 목 폭으로 좁아짐
    const nape = st.long ? 30 : st.nape;
    spans(L, Y(4), Y(nape), (y) => {
      const r = y - oy;
      const hw = r < 16 ? capHW(r) : r < 23 ? 12.4 : 12.4 - ((r - 23) / Math.max(1, nape - 23)) * (st.long ? 0 : name === 'bob' ? 1.5 : 4.5);
      return [CX - hw + 0.5, CX + hw - 0.5];
    }, (x, y, t) => {
      const r = y - oy;
      const nx = t * 2 - 1;
      const ny = (r - 16) / 13;
      if ((x + 1) % 4 === 0 && r > 9) return h[2];
      return roundShade(h, nx, ny * 0.6 - 0.3);
    });
    if (name === 'messy' || name === 'wild') for (const [x, n] of [[25, 2], [29, 3], [33, 2], [37, 3]]) lock(L, x - 1, x + 1, Y(st.nape), x, Y(st.nape + n), sh2);
    for (const [x, y] of [[26, 8], [27, 7], [28, 7], [29, 6]]) L.set(x, Y(y), h[0]);
    return out(L);
  }
  if (v === 'down') {
    // 덮개: 4줄 ~ 이마 선. 얼굴보다 2칸 크게
    spans(L, Y(4), Y(st.hl), (y) => {
      const hw = capHW(y - oy);
      return hw ? [CX - hw + 0.5, CX + hw - 0.5] : null;
    }, (x, y, t) => roundShade(h, t * 2 - 1, (y - oy - 16) / 12.6));
    // 옆머리: 얼굴 가장자리에 한 칸 겹치고 바깥으로 th칸 (턱선을 따라 붙음)
    for (const side of [-1, 1]) {
      spans(L, Y(st.hl - 2), Y(st.side), (y) => {
        const r = y - oy;
        const f = r <= 31 ? Math.max(faceHW(s.girl, r), r < 16 ? 10.5 : 0) : 8;
        const inner = (r <= 31 ? f - 1 : 8);
        const outer = (r < 16.8 ? (capHW(r) * (f + st.th)) / 12.6 : f + st.th) // 덮개 둥근 선을 따름 (관자놀이에서 각지게 튀어나오지 않게)
           + (name === 'wavy' ? Math.sin(r / 4) * 0.7 : name === 'curlylong' ? Math.abs(Math.sin(r / 2.2)) * 1.5 : 0);
        const a = CX + side * inner;
        const b = CX + side * outer;
        return side < 0 ? [b + 0.5, a + 0.5] : [a - 0.5, b - 0.5];
      }, (x, y, t) => (side < 0 ? (t < 0.35 ? h[1] : h[2]) : t > 0.6 ? h[3] : h[2]));
      // 끝을 뾰족하게
      if (st.side < 32) lock(L, side < 0 ? 20 : 41, side < 0 ? 22 : 43, Y(st.side), side < 0 ? 21 : 42, Y(st.side + 2), lockShade(h, side > 0));
      else L.clear(side < 0 ? 19 : 44, Y(st.side));
    }
    // 앞머리 (이마 선 아래로)
    const hl = st.hl;
    if (name === 'messy') {
      for (const [x0, x1, tx, ty] of [[21, 25, 21, 17], [24, 29, 25, 16], [28, 32, 29, 14], [31, 35, 33, 16], [34, 38, 37, 17], [37, 42, 42, 18]]) lock(L, x0, x1, Y(hl - 1), tx, Y(ty), sh2);
      lock(L, 30, 33, Y(7), 34, Y(5), sh2);
      lock(L, 34, 36, Y(8), 38, Y(6), sh2);
    } else if (name === 'wild') {
      for (const [x0, x1, tx, ty] of [[20, 24, 20, 18], [23, 28, 24, 17], [27, 31, 27, 15], [30, 34, 31, 17], [33, 38, 36, 16], [37, 42, 43, 18]]) lock(L, x0, x1, Y(hl - 1), tx, Y(ty), sh2);
      for (const [x0, x1, tx, ty] of [[27, 31, 27, 5], [31, 35, 35, 5], [20, 23, 17, 9], [40, 43, 46, 10]]) lock(L, x0, x1, Y(7), tx, Y(ty), sh2);
    } else if (name === 'slick') {
      // 뒤로 넘긴 머리: 결이 뒤로 비스듬히
      for (const x of [24, 28, 32, 36]) for (let k = 0; k < 6; k++) if (L.getHi(x + (k >> 1), Y(5 + k))) L.set(x + (k >> 1), Y(5 + k), h[2]);
      lock(L, 33, 36, Y(9), 36, Y(13), sh2);
    } else if (name === 'bob') {
      for (const [x0, x1, tx, ty] of [[21, 27, 21, 18], [26, 33, 24, 16], [32, 36, 30, 14]]) lock(L, x0, x1, Y(hl - 1), tx, Y(ty), sh2);
      lock(L, 37, 42, Y(hl - 1), 42, Y(17), lockShade(h, true));
    } else if (name === 'straight') {
      // 눈썹을 덮는 일자 앞머리 (얼굴 폭)
      spans(L, Y(10), Y(17), () => [21.5, 41.5], (x, y, t) => {
        if (y === Y(17) && x % 3 === 1) return null;
        if (x % 3 === 0) return h[2];
        if (y === Y(12) || y === Y(13)) return t < 0.7 ? h[0] : h[1];
        return t > 0.8 ? h[2] : h[1];
      });
    } else if (name === 'wavy') {
      for (const [x0, x1, tx, ty] of [[21, 26, 21, 19], [25, 32, 24, 17], [31, 37, 29, 16]]) lock(L, x0, x1, Y(hl - 1), tx, Y(ty), sh2);
      lock(L, 37, 42, Y(hl - 1), 42, Y(19), lockShade(h, true));
    } else if (name === 'short') {
      for (const [x0, x1, tx, ty] of [[21, 26, 22, 16], [25, 31, 27, 15], [30, 35, 32, 14], [34, 40, 39, 15], [39, 42, 42, 16]]) lock(L, x0, x1, Y(hl - 1), tx, Y(ty), sh2);
    } else if (name === 'curly' || name === 'curlylong') {
      for (const x of [22, 26.5, 31.5, 36.5, 41]) ell(L, x, Y(hl + 0.5), 2.6, 2.4, (xx, yy, nx, ny) => roundShade(h, nx, ny));
      for (const x of [21, 42]) ell(L, x, Y(hl + 5), 2.2, 2.6, (xx, yy, nx, ny) => roundShade(h, nx, ny));
    } else if (name === 'long') {
      for (const [x0, x1, tx, ty] of [[21, 27, 21, 18], [26, 32, 25, 16]]) lock(L, x0, x1, Y(hl - 1), tx, Y(ty), sh2);
      for (const [x0, x1, tx, ty] of [[32, 37, 37, 16], [36, 42, 42, 18]]) lock(L, x0, x1, Y(hl - 1), tx, Y(ty), lockShade(h, true));
    }
    for (const [x, y] of [[25, 7], [26, 6], [27, 6], [28, 5], [29, 5]]) if (L.getHi(x, Y(y))) L.set(x, Y(y), h[0]);
    return out(L);
  }
  // 옆 보기: 덮개는 얼굴 옆 표를 2칸 키운 것. 이마 선 앞쪽은 비우고, 귀(27~30칸) 뒤로는 뒷목까지
  const nape = st.long ? 30 : st.nape;
  spans(L, Y(4), Y(nape), (y) => {
    const r = y - oy;
    const f = sideAt(r) ?? [20, 33];
    // 머리 덮개: 옆 보기 두개골을 2칸 키운 타원 (가운데 30.5, 16.5)
    const ry = (r - 16.8) / 11.8;
    const w = ry > -1 && ry < 1 ? 12.3 * Math.sqrt(1 - ry * ry) : 0;
    let back = r < 16.5 ? 30.5 - w : Math.min(f[0] - 2, 30.5 - Math.max(w, 9));
    if (!st.long && r > nape - 4) back += (r - (nape - 4)) * 1.3; // 뒷목으로 둥글게 모아짐
    let front;
    if (r <= st.hl) front = Math.min(30.5 + w, f[1] + 1);
    else front = r <= st.side ? 33 : name === 'bob' ? 31 : 26;
    if (r > 24 && !st.long && name !== 'bob') front = Math.min(front, 26 - (r - 25) * 0.5);
    if (front <= back) return null;
    return [back + 0.5, front - 0.5];
  }, (x, y, t) => roundShade(h, t * 2 - 1, (y - oy - 16) / 12.6));
  if (name === 'messy' || name === 'wild') {
    for (const [x0, x1, tx, ty] of [[34, 38, 37, 17], [37, 40, 41, 15], [31, 34, 32, 19]]) lock(L, x0, x1, Y(11), tx, Y(ty), sh2);
  } else if (name === 'slick') {
    for (const x of [28, 32, 36]) for (let k = 0; k < 6; k++) if (L.getHi(x - k, Y(5 + k))) L.set(x - k, Y(5 + k), h[2]);
  } else if (name === 'bob') {
    for (const [x0, x1, tx, ty] of [[33, 39, 40, 16], [30, 34, 33, 19]]) lock(L, x0, x1, Y(11), tx, Y(ty), sh2);
  } else if (name === 'straight') {
    spans(L, Y(10), Y(17), () => [33, 41.5], (x, y) => (y === Y(17) && x % 3 === 0 ? null : x % 3 === 0 ? h[2] : y === Y(12) ? h[0] : h[1]));
    spans(L, Y(14), Y(46), () => [29, 33], (x, y, t) => (t > 0.7 ? h[3] : x % 3 === 0 ? h[2] : h[1]));
  } else if (name === 'short' || name === 'curly' || name === 'curlylong') {
    for (const [x0, x1, tx, ty] of [[34, 38, 38, 16], [37, 40, 41, 14]]) lock(L, x0, x1, Y(10), tx, Y(ty), sh2);
  } else if (name === 'long') {
    for (const [x0, x1, tx, ty] of [[33, 39, 40, 17], [30, 34, 33, 19]]) lock(L, x0, x1, Y(10), tx, Y(ty), sh2);
    spans(L, Y(14), Y(Math.min(st.side, 40)), () => [29, 33], (x, y, t) => (t > 0.7 ? h[3] : h[1]));
  } else if (name === 'wavy') {
    for (const [x0, x1, tx, ty] of [[33, 39, 40, 18], [30, 34, 34, 20]]) lock(L, x0, x1, Y(11), tx, Y(ty), sh2);
    spans(L, Y(14), Y(36), (y) => [29 + Math.sin((y - oy) / 4) * 0.8, 33 + Math.sin((y - oy) / 4) * 0.8], (x, y, t) => (t > 0.7 ? h[3] : h[1]));
  }
  for (const [x, y] of [[24, 7], [25, 6], [26, 6], [27, 5]]) if (L.getHi(x, Y(y))) L.set(x, Y(y), h[0]);
  return out(L);
}

/** 늑대 귀 (카르크): 머리 덮개 위 */
function drawEars(c) {
  const L = wl(c);
  if (!c.s.ears) return L;
  const h = c.p.hair;
  const { oy, v } = c;
  const ear = (bx0, bx1, tx, ty, inner) => {
    lock(L, bx0, bx1, 9 + oy, tx, ty + oy, (x, y, t) => (t > 0.6 ? h[2] : h[1]));
    if (inner) lock(L, bx0 + 2, bx1 - 2, 8 + oy, tx + (tx < CX ? 1.5 : -1.5), ty + 4 + oy, () => h[3]);
  };
  if (v === 'right') ear(23, 29, 24, 1, true);
  else {
    ear(20, 26, 20, 1, v === 'down');
    ear(37, 43, 43, 1, v === 'down');
  }
  return out(L);
}
/** 늑대 꼬리: 엉덩이에서 처졌다가 끝이 올라감 */
function drawTail(c) {
  const L = lay();
  const h = c.p.hair;
  const { v, sway, flare, oy } = c;
  const fur = (s2, t) => (t > 0.82 ? h[3] : s2 > 0.35 ? h[2] : s2 < -0.35 ? h[0] : h[1]);
  const pts = v === 'right'
    ? [[25, 57], [19 - flare, 63], [14 - flare * 1.5, 71], [11 - flare * 2, 78], [12 - flare * 2, 83]]
    : v === 'up'
      ? [[CX, 57], [CX + 3 + sway, 65], [CX + 6 + sway * 1.5, 73], [CX + 8 + sway * 2, 80], [CX + 11 + sway * 2, 83]]
      : [[CX + 8, 59], [CX + 13 + sway, 65], [CX + 16 + sway * 1.5, 72], [CX + 18 + sway * 2, 79], [CX + 21 + sway * 2, 82]];
  const wid = [2.5, 4.5, 5.5, 4.5, 2];
  for (let i = 0; i < pts.length - 1; i++) limb(L, pts[i][0], pts[i][1] + oy, pts[i + 1][0], pts[i + 1][1] + oy, wid[i], wid[i + 1], (s2, t) => fur(s2, (i + t) / (pts.length - 1)));
  const src = L.d.map((r) => [...r]);
  for (let y = 0; y < H; y++) for (let x = 1; x < W - 1; x++) if (src[y][x] && (!src[y][x - 1] || !src[y][x + 1]) && (x * 3 + y * 5) % 4 === 0) L.clear(x, y);
  return out(L);
}

// ---------------------------------------------------------------------
// 몸
// ---------------------------------------------------------------------
/** 몸통 반폭 (r = y - oy, 32줄 목 아래 ~ 57줄 엉덩이) */
function torsoHW(b, r) {
  const [s, w, hp] = b;
  if (r < 32 || r > 57) return null;
  if (r === 32) return 5;
  if (r === 33) return s - 2.5;
  if (r === 34) return s - 0.8;
  if (r <= 38) return s;
  if (r <= 50) return s + (w - s) * ((r - 38) / 12);
  return w + (hp - w) * ((r - 50) / 7);
}
/** 옆 보기 몸통 [뒤, 앞] */
function torsoSide(b, r) {
  if (r < 32 || r > 57) return null;
  const k = b[0] / 11;
  const chest = (r < 46 ? 6.5 : 5.5) * k;
  const back = (r < 34 ? 4.5 : r < 50 ? 5.5 : 6) * k;
  return [31 - back, 31 + chest - (r < 34 ? 1.5 : 0)];
}
const isSkirt = (look) => ['serena', 'elysia', 'galia'].includes(look);

/** 다리 (치마는 신발 끝만). 엉덩이 56줄(+oy)에서 발끝 91줄 */
function drawLegs(c) {
  const L = lay();
  const { p, s, oy, v } = c;
  const pa = p.pants;
  const so = p.shoes;
  const F = FOOT_T - (c.lift ?? 0) * 2;
  const hipY = 55 + oy;
  const st = c.step;
  const boot = s.boot ?? 85;
  const legCol = (ramp) => (sx, t, x, y) => {
    if (y >= boot + (F - FOOT_T)) return sx < -0.3 ? so[0] : sx > 0.5 ? so[2] : so[1];
    if (s.knee && Math.abs(y - (73 + (F - FOOT_T) / 2)) <= 1) return sx < 0 ? ramp[0] : ramp[1];
    return sh(ramp, sx);
  };
  const thick = s.thick ? [4.8, 4, 3] : s.girl ? [3.4, 2.6, 2.2] : [3.8, 3, 2.4];
  const leg = (hx, fx, fy, ramp, far) => {
    const P = lay();
    const ky = (hipY + fy) / 2 + 1;
    const kx = (hx + fx) / 2;
    limb(P, hx, hipY, kx, ky, thick[0], thick[1], legCol(ramp));
    limb(P, kx, ky, fx, fy - 3, thick[1], thick[2], legCol(ramp));
    const toe = v === 'right' ? 3 : 0;
    spans(P, fy - 3, fy, (y) => (v === 'right' ? [fx - 2.5, fx + 2 + toe - (y === fy - 3 ? 2 : 0)] : [fx - 3, fx + 3 - (y === fy - 3 ? 1 : 0)]), (x, y, t) => (far ? so[2] : y === fy - 3 && t < 0.5 ? so[0] : t > 0.8 ? so[2] : so[1]));
    if (s.look === 'karg' && !far) for (let y = boot + 2; y < fy - 3; y += 2) P.set(Math.round(fx) - 1, y, R.ash[0]);
    return out(P);
  };
  const dim = (ramp) => [ramp[1], ramp[2], ramp[3] ?? ramp[2]];
  if (s.skirt) {
    const foot = (fx, up, far) => {
      const P = lay();
      spans(P, F - 3 - up, F - up, () => (v === 'right' ? [fx - 3, fx + 3] : [fx - 3, fx + 3]), (x, y, t) => (far ? so[2] : y === F - 3 - up && t < 0.5 ? so[0] : so[1]));
      return out(P);
    };
    if (v === 'right') {
      // 1열(a)은 가까운 발이 앞, 3열(b)은 먼 발이 앞으로 나와 발끝이 번갈아 보임 (움직임_피드백 1절)
      if (st === 'a') L.over(foot(24, 0, true)).over(foot(39, 0));
      else if (st === 'b') L.over(foot(38, 0, true)).over(foot(24, 0));
      else if (st === 'pa') L.over(foot(30, 0, true)).over(foot(33, 3));
      else if (st === 'pb') L.over(foot(33, 3, true)).over(foot(30, 0));
      else L.over(foot(31, 0));
    } else {
      const [l, r] = { a: [0, 2], b: [2, 0], pa: [0, 4], pb: [4, 0] }[st] ?? [0, 0];
      L.over(foot(27.5, l)).over(foot(35.5, r));
    }
    return L;
  }
  if (v === 'right') {
    if (st === 'a' || st === 'b') L.over(leg(31, 25, F, dim(pa), true)).over(leg(31, 37, F, pa));
    else if (st) L.over(leg(31, 29, F, dim(pa), true)).over(leg(32, 34, F - 4, pa));
    else L.over(leg(30, 30, F, dim(pa), true)).over(leg(32, 32, F, pa));
    return L;
  }
  const [l, r] = { a: [0, 3], b: [3, 0], pa: [0, 5], pb: [5, 0] }[st] ?? [0, 0];
  const gap = s.thick ? 4.8 : 4;
  const legs = [[CX - gap, l], [CX + gap, r]].sort((a, b) => b[1] - a[1]);
  for (const [x, up] of legs) L.over(leg(x, x, F - up, pa));
  return L;
}

/** 팔: 어깨 → 팔꿈치 → 손 */
function arm(sx, sy, ex, ey, hx, hy, sleeve, hand, r = 2.5, cuff = null) {
  const L = lay();
  limb(L, sx, sy, ex, ey, r + 0.3, r, (s2) => sh(sleeve, s2));
  limb(L, ex, ey, hx, hy, r, r - 0.2, (s2) => sh(sleeve, s2));
  out(L);
  const Hd = lay();
  const ang = Math.atan2(hy - ey, hx - ex);
  ell(Hd, hx + Math.cos(ang) * 2, hy + Math.sin(ang) * 2, Math.max(1.6, r - 0.4), Math.max(1.8, r - 0.1), (x, y, nx) => (nx < -0.3 ? hand[0] : nx > 0.4 ? hand[2] : hand[1]));
  out(Hd);
  L.over(Hd);
  if (cuff) limb(L, hx - Math.cos(ang) * 1.6, hy - Math.sin(ang) * 1.6, hx - Math.cos(ang) * 0.4, hy - Math.sin(ang) * 0.4, r + 0.3, r + 0.3, (s2) => sh(cuff, s2));
  L.isArm = true;
  L.style = [sleeve, hand, r];
  return L;
}

const N = R.navy;
const S = R.white;
const M = [R.white[0], R.white[1], R.white[2], R.white[3]]; // 금속: 반짝임, 밝음, 기본, 그늘
const metal = (nx, ny) => (ny < -0.35 && nx < 0.2 ? M[0] : nx < -0.2 ? M[1] : nx > 0.45 || ny > 0.5 ? M[3] : M[2]);
const glove = [R.white[0], R.white[1], R.white[2]];

/** 망토 (등 뒤). 앞 보기에서는 어깨·팔 바깥으로 조금 보임 */
function capeBack(c, ramp, len, extra = 4) {
  const L = lay();
  const { oy, v, sway, flare, s } = c;
  const top = 33 + oy;
  if (v === 'right') {
    spans(L, top, len, (y) => {
      const k = (y - top) / (len - top);
      return [25 - k * (4 + flare * 2.5), 30];
    }, (x, y, t) => (t < 0.25 ? ramp[2] : (x + y) % 9 === 0 ? ramp[3] : ramp[1]));
  } else {
    const w0 = s.build[0] + 1;
    spans(L, top, len, (y) => {
      const k = (y - top) / (len - top);
      const hw = w0 + k * extra;
      return [CX - hw + 0.5 + sway * k, CX + hw - 0.5 + sway * k];
    }, (x, y, t) => {
      if (v === 'up') return (Math.round(x - CX) % 5 === 0 && y > 40 + oy) ? ramp[2] : t < 0.2 ? ramp[0] : t > 0.8 ? ramp[2] : ramp[1];
      return t < 0.15 || t > 0.85 ? ramp[2] : ramp[3];
    });
    for (let x = 12; x < 52; x += 4) L.clear(x + Math.round(sway), len);
  }
  return out(L);
}

function torso(c, col) {
  const L = lay();
  const { oy, v, s } = c;
  if (v === 'right') spans(L, 32 + oy, 57 + oy, (y) => torsoSide(s.build, y - oy), (x, y, t) => col(x, y, t, y - oy));
  else spans(L, 32 + oy, 57 + oy, (y) => { const hw = torsoHW(s.build, y - oy); return hw ? [CX - hw + 0.5, CX + hw - 0.5] : null; }, (x, y, t) => col(x, y, t, y - oy));
  return L;
}
/** 치마·코트 자락: top~bot 줄(top은 oy를 더함, bot은 그대로), 반폭 w0→w1 */
function skirtL(c, top, bot, w0, w1, col, gap = null) {
  const L = lay();
  const { oy, v, sway, flare, step } = c;
  const T0 = top + oy;
  if (v === 'right') {
    // 옆 걷기: 걸음마다 치맛단 앞뒤가 2~3px(고해상도 4~5칸) 번갈아 나오고, 걷는 칸은 단이 살짝 들려 발끝이 보임 (점검_피드백2 4-1)
    const [fwd, bk] = { a: [5, -1], b: [1, -5], pa: [-1, 1], pb: [-1, 1] }[step] ?? [0, 0];
    const b2 = step && bot >= FOOT_T - 4 ? bot - 2 : bot;
    spans(L, T0, b2, (y) => {
      const k = (y - T0) / Math.max(1, b2 - T0);
      const sw = sway * k * 0.6;
      return [31 - w0 * 0.62 - k * (w1 - w0) * 0.7 - flare * k * 1.2 + bk * k * k + sw, 31 + w0 * 0.62 + k * (w1 - w0) * 0.5 + fwd * k * k + sw];
    }, (x, y, t) => col(x, y, t, y - oy));
  } else {
    spans(L, T0, bot, (y) => {
      const k = (y - T0) / Math.max(1, bot - T0);
      const hw = w0 + (w1 - w0) * k;
      return [CX - hw + 0.5 + sway * k, CX + hw - 0.5 + sway * k];
    }, (x, y, t) => {
      if (gap && v === 'down') {
        const k = (y - T0) / Math.max(1, bot - T0);
        if (Math.abs(x + 0.5 - CX - sway * k) < gap[0] + (gap[1] - gap[0]) * k) return null;
      }
      return col(x, y, t, y - oy);
    });
  }
  return L;
}
/** 높은 깃 */
function collar(c, y0, y1, hw, col) {
  const L = lay();
  const { oy, v } = c;
  spans(L, y0 + oy, y1 + oy, () => (v === 'right' ? [27, 34] : [CX - hw + 0.5, CX + hw - 0.5]), (x, y, t) => col(x, y, t, y - oy));
  return out(L);
}
/** 어깨 갑옷 (x0: 가운데) */
function pauldron(x0, y0, rx, ry, col) {
  const P = lay();
  ell(P, x0, y0, rx, ry, col);
  return out(P);
}

// 레온 깃 윗줄 (보기마다). 예전 27줄은 턱과 입을 덮었다
const LEON_COLLAR = { down: 31, right: 30, up: 28 };
/**
 * 평소 몸에 지닌 무기 (움직임_피드백 3절): 칼집에 든 검(허리), 쌍단검(허리 양쪽).
 * side: -1 = 인물의 왼쪽 허리(앞 보기에서 그림 오른쪽), 1 = 오른쪽 허리, 0 = 양쪽
 * 전투 칸에서도 칼집('scabbard')은 남기고, 쌍단검('daggers')은 손에 든 그림으로 바뀜
 */
function scabbard(c, kind, side) {
  const { oy, v, s } = c;
  const L = lay();
  const waist = s.build[1];
  const sheath = [R.wood[1], R.wood[2]];
  const draw = (x0, y0, x1, y1) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const dx = (x0 - x1) / len;
    const dy = (y0 - y1) / len;
    limb(L, x0, y0, x1, y1, 1.3, 1.1, (s2) => (s2 < 0 ? sheath[0] : sheath[1]));
    L.set(Math.round(x1), Math.round(y1), R.white[2]);
    // 칼코등이와 손잡이 (칼집 위 끝에서 바깥으로)
    limb(L, x0 - dy * 2.6, y0 + dx * 2.6, x0 + dy * 2.6, y0 - dx * 2.6, 0.8, 0.8, () => R.gold[1]);
    limb(L, x0, y0, x0 + dx * 5, y0 + dy * 5, 0.9, 0.9, () => R.wood[2]);
  };
  if (kind === 'sword') {
    if (v === 'right') {
      if (side < 0) draw(27, 53 + oy, 17, 70 + oy); // 먼 쪽 허리: 칼끝이 뒤로
      else draw(29, 54 + oy, 19, 71 + oy);
    } else {
      // 앞 보기: 인물의 왼쪽 = 그림 오른쪽. 뒤 보기는 반대
      const sx = v === 'down' ? -side : side;
      const x0 = CX + sx * (waist + 1);
      draw(x0, 52 + oy, x0 + sx * 5, 72 + oy);
    }
  } else {
    const one = (x0, y0, x1, y1) => {
      limb(L, x0, y0, x1, y1, 1.1, 0.9, (s2) => (s2 < 0 ? R.wood[1] : R.wood[2]));
      limb(L, x0, y0, x0 + (x0 - x1) * 0.4, y0 + (y0 - y1) * 0.4, 0.8, 0.8, () => R.slate[1]);
    };
    if (v === 'right') one(29, 54 + oy, 24, 66 + oy);
    else for (const sx of [-1, 1]) one(CX + sx * (waist + 1), 54 + oy, CX + sx * (waist + 4), 66 + oy);
  }
  out(L);
  L.isHeld = kind === 'sword' ? 'scabbard' : 'daggers';
  return L;
}

/** 사람마다 옷 → { back, body, front } */
function outfit(c) {
  const { p, s, oy, v } = c;
  const look = s.look;
  const sk = p.skin;
  const back = [];
  const body = [];
  const front = [];
  const swing = c.swing ?? 0;
  const [shw, waist, hip, ar] = s.build;
  const ax = shw - 0.7; // 어깨 관절 (몸통 가장자리 바로 안쪽)
  /** 늘어뜨린 팔 (옆 보기는 앞 팔 하나) */
  const hang = (sleeve, hand, r = ar, cuff = null, skip = 0) => {
    const res = [];
    if (v === 'right') res.push(arm(31, 36 + oy, 31 + swing * 1.5, 45 + oy, 32 + swing * 3.5, 53 + oy, sleeve, hand, r, cuff));
    else for (const side of [-1, 1]) {
      if (skip === side) continue;
      const sw = side * swing * (v === 'up' ? -1 : 1);
      const x0 = CX + side * ax;
      res.push(arm(x0, 36 + oy, x0 + side * 2.8, 45 + oy, x0 + side * 3.6, 52 + oy + sw * 0.5, sleeve, hand, r, cuff));
    }
    return res;
  };
  /** 허리에 짚은 손 (팔꿈치를 밖으로) */
  const hips = (side, sleeve, hand, r = ar) => {
    const x0 = CX + side * ax;
    return arm(x0, 36 + oy, x0 + side * 4.5, 45 + oy, CX + side * (waist + 0.5), 50 + oy, sleeve, hand, r);
  };
  const shoulderX = (side) => CX + side * (ax + 0.3);

  if (look === 'leon') {
    const coat = (x, y, t) => (v === 'right' ? (t > 0.75 || t < 0.2 ? N[2] : N[1]) : t < 0.18 ? N[0] : t > 0.82 ? N[2] : N[1]);
    back.push(capeBack(c, [N[1], N[2], N[3], N[3]], 84, 5));
    const hem = (x, y, t, r) => (r >= 76 ? (r === 77 ? S[1] : S[2]) : v === 'down' && (t < 0.1 || t > 0.9) ? N[2] : coat(x, y, t));
    const sk1 = out(skirtL(c, 55, 78 + oy, hip, hip + 3, hem, v === 'down' ? [1.5, 4] : null));
    if (v === 'down') for (const [x, y] of [[23, 72], [24, 71], [25, 72], [24, 73], [39, 72], [38, 71], [37, 72], [38, 73]]) sk1.set(x, y + oy, S[1]);
    body.push(sk1);
    const T = out(torso(c, coat));
    if (v === 'down') {
      for (let y = 38 + oy; y <= 54 + oy; y++) T.set(32, y, N[2]);
      // 은 가슴판 (오른쪽 가슴 = 그림 왼쪽)
      spans(T, 35 + oy, 48 + oy, (y) => { const r = y - oy; return [CX - shw + 1.5 + (r > 44 ? (r - 44) * 0.8 : 0), CX - 1]; }, (x, y, t) => (t < 0.3 && y < 41 + oy ? M[0] : t > 0.75 ? M[3] : t < 0.5 ? M[1] : M[2]));
      for (const y of [38, 42, 46]) for (const x of [35, 38]) T.set(x, y + oy, R.gold[1]);
      for (const [x, y] of [[33, 34], [34, 35], [35, 36], [36, 36], [37, 37], [38, 37], [39, 36], [40, 35], [36, 38], [37, 39], [38, 39]]) T.set(x, y + oy, R.gold[x % 2]);
      band(T, 51 + oy, 52 + oy, (x, y, t) => (t < 0.25 ? S[0] : S[1]));
      T.rect(30, 50 + oy, 33, 53 + oy, (x, y) => (y === 50 + oy ? S[0] : S[2]));
    } else if (v === 'right') {
      for (const y of [38, 42, 46]) T.set(35, y + oy, R.gold[1]);
      band(T, 51 + oy, 52 + oy, () => S[1]);
    } else band(T, 51 + oy, 52 + oy, () => S[2]);
    body.push(T);
    // 깃은 턱 아래로 내려 입과 턱선이 보이게 (움직임_피드백 1절)
    front.push(collar(c, LEON_COLLAR[v], 33, v === 'up' ? 7 : 6, (x, y, t, r) => (v === 'down' && r < 32 && Math.abs(x + 0.5 - CX) < 3.5 ? null : r === 32 && v === 'down' ? S[1] : t < 0.3 ? N[0] : N[2])));
    (v === 'up' ? back : front).push(scabbard(c, 'sword', -1));
    front.push(...hang(N, glove));
    if (v !== 'right') front.push(pauldron(shoulderX(v === 'down' ? -1 : 1), 35 + oy, 4.4, 3.6, (x, y, nx, ny) => metal(v === 'down' ? nx : -nx, ny)));
    if (s.hood) front.push(hoodFront(c, [R.wood[0], R.wood[1], R.wood[2], R.wood[3]]));
  } else if (look === 'serena') {
    const A = R.red;
    const dress = (x, y, t, r) => {
      if (v === 'right') return t > 0.8 ? S[2] : S[1];
      const k = Math.abs(x + 0.5 - CX);
      if (v === 'down' && r > 52 && Math.abs(k - 4 - (r - 52) * 0.12) < 0.8) return A[1];
      if (r >= FOOT_T - 6 - oy) return r === FOOT_T - 5 - oy || r === FOOT_T - 3 - oy ? A[1] : S[1];
      return t < 0.15 ? S[0] : t > 0.85 ? S[2] : S[1];
    };
    back.push(drawHairBack(c));
    body.push(out(skirtL(c, 50, FOOT_T - 3, waist + 0.5, 13, dress)));
    const T = out(torso(c, dress));
    if (v === 'down') {
      for (const [x, y] of [[31, 38], [32, 38], [31, 39], [32, 40]]) T.set(x, y + oy, R.gold[1]);
      for (let i = 0; i < 4; i++) { T.set(27 + i, 34 + i + oy, A[1]); T.set(36 - i, 34 + i + oy, A[1]); }
    }
    body.push(T);
    if (!s.hood) {
      // 짧은 케이프: 어깨를 덮고 팔꿈치까지, 붉은 두 줄 테
      const cp = lay();
      const capeRow = (r) => (r >= 43 ? A[1] : r === 42 ? S[1] : r === 41 ? A[1] : null);
      if (v === 'right') spans(cp, 31 + oy, 44 + oy, (y) => [25.5 - (y - oy - 31) * 0.2, 35.5 - (y < 34 + oy ? 2 : 0)], (x, y, t) => capeRow(y - oy) ?? (t > 0.7 ? S[2] : S[1]));
      else {
        spans(cp, 31 + oy, 44 + oy, (y) => { const r = y - oy; const hw = r < 34 ? 6 + (r - 31) * 1.6 : shw + ar + 1 + (r - 34) * 0.15; return [CX - hw + 0.5, CX + hw - 0.5]; }, (x, y, t) => {
          const r = y - oy;
          if (v === 'down' && r > 33 && Math.abs(x + 0.5 - CX) < 4.5) return null;
          return capeRow(r) ?? (t < 0.2 ? S[0] : t > 0.8 ? S[2] : S[1]);
        });
        if (v === 'down') for (let y = 34; y < 41; y++) { cp.set(27, y + oy, A[1]); cp.set(36, y + oy, A[1]); }
        if (v === 'down') for (const [x, y] of [[22, 36], [23, 37], [24, 36], [41, 36], [40, 37], [39, 36]]) cp.set(x, y + oy, R.gold[1]);
      }
      front.push(out(cp));
    }
    front.push(collar(c, 28, 32, 3.5, (x, y, t, r) => (r === 28 ? A[1] : S[1])));
    if (v === 'down') {
      // 두 손을 가슴 아래에서 모음
      const a1 = arm(CX - ax, 37 + oy, CX - ax - 0.5, 45 + oy, CX - 2.5, 48 + oy, S, sk, ar);
      const a2 = arm(CX + ax, 37 + oy, CX + ax + 0.5, 45 + oy, CX + 2.5, 48 + oy, S, sk, ar);
      front.push(a1, a2);
    } else if (v === 'right') front.push(arm(31, 37 + oy, 32, 45 + oy, 36, 48 + oy, S, sk, ar));
    else front.push(...hang(S, sk));
    if (s.hood) front.push(hoodFront(c, [R.wood[0], R.wood[1], R.wood[2], R.wood[3]]));
  } else if (look === 'elysia') {
    const V = [R.violet[1], R.violet[2], R.violet[3], R.violet[4]];
    const robe = (x, y, t, r) => {
      if (v === 'right') return t > 0.75 ? V[2] : V[1];
      if (r > 58 && Math.round(x - CX + (r - 58) * (x < CX ? 0.15 : -0.15)) % 5 === 0) return V[2];
      return t < 0.15 ? V[0] : t > 0.82 ? V[2] : V[1];
    };
    back.push(drawHairBack(c));
    body.push(out(skirtL(c, 50, FOOT_T - 2, hip, 13, robe)));
    const T = out(torso(c, robe));
    if (v === 'down') {
      stamp(T, 25, 37 + oy, ['..s.s..', '.sSSSs.', 'sS.s.Ss', '.sSSSs.', '..s.s..'], { s: R.sky[1], S: R.sky[0] });
      band(T, 50 + oy, 52 + oy, (x, y) => (y === 50 + oy ? R.wood[0] : R.wood[1]));
      T.rect(29, 49 + oy, 32, 53 + oy, (x, y) => (x === 29 || x === 32 || y === 49 + oy || y === 53 + oy ? R.wood[2] : null));
    } else band(T, 50 + oy, 52 + oy, () => R.wood[v === 'up' ? 2 : 1]);
    body.push(T);
    if (v === 'down') {
      const ex = lay();
      ex.rect(29, 53 + oy, 30, 66 + oy, (x) => (x === 29 ? R.wood[1] : R.wood[2]));
      spans(ex, 52 + oy, 58 + oy, () => [36, 40], (x, y, t) => (y === 52 + oy ? R.wood[0] : t > 0.7 ? R.wood[2] : R.wood[1]));
      body.push(out(ex));
    }
    if (v !== 'up') front.push(collar(c, 29, 32, 3.5, () => R.slate[1]));
    const cuff = [R.sky[0], R.sky[1], R.sky[2]];
    // 지팡이 (왼손 = 그림 오른쪽). 한 덩어리로 그려 몸과 같이 움직임
    const stf = lay();
    stf.isHeld = 'staff';
    const sx0 = Math.round(v === 'right' ? 40 : CX + shw + 4);
    const su = Math.round(c.staffUp ?? 0); // 전투 시전: 지팡이를 들어 올림 (움직임_피드백 3절)
    const top = (v === 'right' ? 28 : 22) + oy - su;
    if (v !== 'up') {
      for (let y = top; y <= FOOT_T - 2 - su; y++) {
        const x = sx0 + Math.round(Math.sin((y - top) / 3) * 0.8);
        stf.set(x, y, (y - top) % 4 === 1 ? R.violet[1] : R.violet[3]);
        stf.set(x + 1, y, R.violet[4]);
      }
      // 꼭대기: 갈고리 모양, 그 품 안에 뜬 구슬
      lock(stf, sx0 - 1, sx0 + 2, top, sx0 + 5, top - 8, () => R.violet[3]);
      lock(stf, sx0 + 3, sx0 + 5, top - 7, sx0 + 1, top - 11, () => R.violet[2]);
      out(stf);
      ell(stf, sx0 + 0.5, top - 5, 1.8, 1.8, (x, y, nx, ny) => (nx < 0 && ny < 0 ? R.violet[0] : R.violet[2]));
      stf.set(sx0, top - 6, R.white[0]);
      body.push(stf);
      if (v === 'down') front.push(hips(-1, V, sk));
      front.push(arm(CX + ax, 36 + oy, sx0 - 2, 45 + oy - su / 2, sx0 - 1, 51 + oy - su, V, sk, ar, cuff));
    } else {
      for (let y = top; y <= FOOT_T - 2 - su; y++) stf.set(Math.round(CX - shw - 4), y, R.violet[3]);
      out(stf);
      back.push(stf);
      front.push(...hang(V, sk));
    }
  } else if (look === 'karg') {
    const Tn = [sk[0], sk[1], sk[2], sk[3]];
    back.push(drawTail(c));
    const T = out(torso(c, (x, y, t) => (v === 'right' ? (t > 0.7 || t < 0.25 ? Tn[2] : Tn[1]) : t < 0.12 ? Tn[0] : t > 0.86 ? Tn[2] : Tn[1])));
    if (v === 'down') {
      for (let x = 24; x <= 30; x++) T.set(x, 42 + oy - (x < 26 ? 1 : 0), Tn[2]);
      for (let x = 33; x <= 39; x++) T.set(x, 42 + oy - (x > 37 ? 1 : 0), Tn[2]);
      for (let y = 37; y <= 50; y++) T.set(y % 2 ? 31 : 32, y + oy, Tn[2]);
      for (const y of [45, 48]) for (const x of [28, 29, 34, 35]) T.set(x, y + oy, Tn[2]);
    }
    band(T, 52 + oy, 54 + oy, (x, y) => (y === 52 + oy ? R.slate[1] : R.slate[2]));
    body.push(T);
    (v === 'up' ? back : front).push(scabbard(c, 'daggers', 0));
    // 앞치마 (모래색, 무늬 띠, 술)
    const ap = lay();
    const sand = R.sand;
    if (v === 'down') {
      spans(ap, 55 + oy, 72 + oy, () => [CX - 7, CX + 7], (x, y, t) => {
        const r = y - oy;
        if (r === 72) return x % 2 ? null : sand[1];
        if (r >= 66 && r <= 68) return (x + r) % 3 === 0 ? R.wood[2] : sand[1];
        return t < 0.2 ? sand[0] : t > 0.8 ? sand[2] : sand[1];
      });
      ap.rect(28, 54 + oy, 28, 64 + oy, R.slate[2]);
    } else if (v === 'right') spans(ap, 55 + oy, 71 + oy, () => [32, 37], (x, y, t) => (y === 71 + oy && x % 2 ? null : t > 0.7 ? sand[2] : sand[1]));
    else spans(ap, 55 + oy, 66 + oy, () => [CX - 7, CX + 7], (x, y, t) => (t > 0.8 ? sand[2] : sand[1]));
    front.push(out(ap));
    // 목에 두른 회색 두건, 이빨 목걸이
    const sc = lay();
    const G = [R.white[2], R.ash[0], R.ash[1], R.ash[2]];
    if (v === 'right') spans(sc, 29 + oy, 36 + oy, (y) => [25, 35 - (y < 31 + oy ? 3 : 0)], (x, y, t) => (t > 0.7 ? G[2] : G[1]));
    else spans(sc, 30 + oy, 36 + oy, (y) => { const r = y - oy; const hw = r < 33 ? 5.5 + (r - 30) * 0.9 : 8.2 - (r - 33) * 0.5; return [CX - hw + 0.5, CX + hw - 0.5]; }, (x, y, t) => (t < 0.25 ? G[0] : t > 0.75 ? G[2] : G[1]));
    out(sc);
    if (v === 'down') for (const [x, y] of [[26, 37], [28, 38], [30, 39], [33, 39], [35, 38], [37, 37]]) { sc.set(x, y + oy, R.white[0]); sc.set(x, y + 1 + oy, R.white[1]); }
    front.push(sc);
    const armsL = hang(Tn, Tn, ar, [R.slate[0], R.slate[1], R.slate[2]]);
    for (const a of armsL) {
      for (let y = 40 + oy; y <= 41 + oy; y++) for (let x = 0; x < W; x++) if (Tn.includes(a.getHi(x, y))) a.set(x, y, R.wood[2]);
      for (let y = 47 + oy; y <= 51 + oy; y++) for (let x = 0; x < W; x++) if (Tn.includes(a.getHi(x, y))) a.set(x, y, y === 47 + oy ? R.slate[0] : R.slate[1]);
    }
    front.push(...armsL);
    if (v !== 'right') {
      const pd = pauldron(shoulderX(v === 'down' ? 1 : -1), 35 + oy, 4.6, 3.8, (x, y, nx, ny) => (ny < -0.3 && nx < 0 ? R.slate[0] : R.slate[1]));
      if (v === 'down') { const px = Math.round(shoulderX(1)); pd.set(px, 35 + oy, R.violet[0]); pd.set(px - 1, 36 + oy, R.violet[0]); }
      front.push(pd);
    }
  } else if (look === 'adrian') {
    back.push(capeBack(c, [S[1], S[2], S[3], S[3]], 86, 5));
    const armor = (x, y, t) => (v === 'right' ? (t > 0.7 ? M[3] : t > 0.4 ? M[2] : M[1]) : t < 0.12 ? M[0] : t < 0.35 ? M[1] : t > 0.8 ? M[3] : M[2]);
    body.push(out(skirtL(c, 53, 61 + oy, hip, hip + 1.5, armor)));
    const T = out(torso(c, armor));
    if (v === 'down') {
      T.rect(30, 36 + oy, 33, 47 + oy, (x) => (x < 32 ? N[0] : N[1]));
      T.rect(26, 39 + oy, 37, 42 + oy, (x, y) => (y < 41 + oy ? N[0] : N[1]));
      T.set(31, 40 + oy, R.gold[0]); T.set(32, 40 + oy, R.gold[1]);
      band(T, 48 + oy, 48 + oy, () => M[3]);
      band(T, 51 + oy, 52 + oy, (x) => (x === 31 || x === 32 ? S[0] : R.wood[2]));
    } else if (v === 'right') {
      T.rect(35, 39 + oy, 37, 42 + oy, N[1]);
      band(T, 51 + oy, 52 + oy, () => R.wood[2]);
    } else band(T, 51 + oy, 52 + oy, () => R.wood[2]);
    body.push(T);
    const tab = lay();
    if (v === 'down') spans(tab, 53 + oy, 76 + oy, () => [CX - 5, CX + 5], (x, y, t) => (t < 0.25 ? S[0] : t > 0.75 ? S[2] : S[1]));
    else if (v === 'right') spans(tab, 53 + oy, 74 + oy, () => [33, 37], (x, y, t) => (t > 0.6 ? S[2] : S[1]));
    body.push(out(tab));
    front.push(collar(c, 28, 33, 5.5, (x, y, t) => (t < 0.3 ? M[1] : t > 0.75 ? M[3] : M[2])));
    front.push(...hang([M[1], M[2], M[3]], glove));
    for (const side of v === 'right' ? [0] : [-1, 1]) front.push(pauldron(side ? shoulderX(side) : 31, 35 + oy, 4.8, 4, (x, y, nx, ny) => (ny > 0.45 ? N[1] : metal(nx, ny))));
    (v === 'right' ? back : body).push(scabbard(c, 'sword', 1));
    if (v !== 'up') {
      // 큰 방패 (왼팔 = 그림 오른쪽): 흰 바탕, 파란 테, 금 해
      const sd = lay();
      sd.isHeld = 'shield';
      const x0 = v === 'right' ? 33 : Math.round(CX + shw - 1);
      const x1 = x0 + (v === 'right' ? 9 : 13);
      spans(sd, 42 + oy, 82, (y) => {
        const k = (y - 42 - oy) / (82 - 42 - oy);
        return k < 0.6 ? [x0, x1] : [x0 + (k - 0.6) * 11, x1 - (k - 0.6) * 11];
      }, (x, y, t) => (t < 0.14 || t > 0.86 || y < 44 + oy ? N[1] : t > 0.6 ? S[2] : S[1]));
      out(sd, { color: N[3] });
      if (v === 'down') {
        const mx = Math.round((x0 + x1) / 2);
        ell(sd, mx + 0.5, 56 + oy, 2.3, 2.3, (x, y, nx, ny) => (nx < 0 && ny < 0 ? R.gold[0] : R.gold[1]));
        for (const [dx, dy] of [[0, -4], [0, 4], [-4, 0], [4, 0], [3, 3], [-3, -3], [3, -3], [-3, 3]]) sd.set(mx + dx, 56 + oy + dy, R.gold[1]);
      }
      front.push(sd);
    }
  } else if (look === 'galia') {
    back.push(capeBack(c, [N[1], N[2], N[3], N[3]], 80, 4));
    // 등의 큰 검: 오른쪽 어깨 위로 손잡이, 왼쪽 아래로 칼날
    const gs = lay();
    gs.isHeld = 'greatswordBack';
    if (v !== 'right') {
      const sx = v === 'down' ? 1 : -1;
      const a = [CX - sx * 15, 6 + oy];
      const b = [CX + sx * 13, 86];
      limb(gs, a[0], a[1], b[0], b[1], 1.5, 2.1, (s2, t) => (t < 0.22 ? (s2 < 0 ? N[1] : N[3]) : s2 < 0 ? S[0] : S[2]));
      out(gs);
      const g = [a[0] + (b[0] - a[0]) * 0.22, a[1] + (b[1] - a[1]) * 0.22];
      limb(gs, g[0] - 4, g[1] + 3, g[0] + 4, g[1] - 3, 1.1, 1.1, () => R.gold[1]);
      gs.set(Math.round(a[0]), Math.round(a[1]), R.gold[0]);
    } else {
      limb(gs, 22, 8 + oy, 26, 86, 1.5, 2.1, (s2, t) => (t < 0.22 ? N[3] : s2 < 0 ? S[0] : S[2]));
      out(gs);
    }
    back.push(gs);
    if (v === 'up') {
      // 뒷모습: 망토 위로 진홍 어깨띠·허리띠와 띠 끝 (움직임_피드백 3절)
      const sa = lay();
      limb(sa, CX - shw + 1, 35 + oy, CX + waist + 3, 52 + oy, 1.7, 1.7, (s2) => (s2 < 0 ? R.red[0] : R.red[1]));
      spans(sa, 51 + oy, 54 + oy, () => [CX - waist - 4.5, CX + waist + 4.5], (x, y) => (y === 51 + oy ? R.red[0] : R.red[1]));
      sa.rect(Math.round(CX + 4), 55 + oy, Math.round(CX + 6), 68 + oy, (x, y) => (y >= 65 + oy && (y - oy) % 2 === 1 ? R.white[1] : x === Math.round(CX + 4) ? R.red[0] : R.red[1]));
      back.splice(back.indexOf(gs), 0, out(sa)); // 등의 대검이 띠 위에
    }
    const skirtC = (x, y, t) => (v === 'right' ? (t > 0.7 ? N[3] : N[2]) : Math.round(x - CX) % 3 === 0 ? N[3] : t < 0.15 ? N[1] : t > 0.85 ? N[3] : N[2]);
    body.push(out(skirtL(c, 52, FOOT_T - 3, hip, 12, skirtC)));
    const T = out(torso(c, (x, y, t, r) => (r > 52 ? N[2] : v === 'up' ? (t > 0.75 ? N[3] : N[2]) : v === 'right' ? (t > 0.7 ? M[3] : M[2]) : t < 0.12 ? M[0] : t < 0.35 ? M[1] : t > 0.8 ? M[3] : M[2])));
    if (v === 'down') {
      limb(T, CX + shw - 2, 35 + oy, CX - waist + 1, 50 + oy, 1.7, 1.7, (s2) => (s2 < 0 ? R.red[0] : R.red[1]));
      band(T, 50 + oy, 53 + oy, (x, y) => (y === 50 + oy ? R.red[0] : R.red[1]));
      T.set(27, 38 + oy, R.red[1]); T.set(28, 38 + oy, R.red[1]); T.set(27, 37 + oy, R.red[1]);
    } else if (v === 'right') band(T, 50 + oy, 53 + oy, () => R.red[1]);
    body.push(T);
    if (v === 'down') {
      const tail = lay();
      tail.rect(35, 53 + oy, 37, 68 + oy, (x, y) => (y >= 64 + oy && (y - 64 - oy) % 2 === 0 && x > 35 ? R.white[1] : x === 35 ? R.red[0] : R.red[1]));
      front.push(out(tail));
    }
    front.push(collar(c, 28, 33, 5, (x, y, t, r) => (r === 28 || t === 0 || t === 1 ? R.gold[1] : v === 'down' && (x === 31 || x === 32) ? R.red[0] : N[1])));
    const sleeve = [M[1], M[2], M[3]];
    if (v === 'down') {
      front.push(hips(-1, sleeve, glove));
      front.push(...hang(sleeve, glove, ar, null, -1));
    } else front.push(...hang(sleeve, glove));
    for (const side of v === 'right' ? [0] : [-1, 1]) front.push(pauldron(side ? shoulderX(side) : 31, 35 + oy, 4.6, 3.8, (x, y, nx, ny) => metal(nx, ny)));
  }
  return { back, body, front };
}

/** 두건 (1막 망토): 머리를 덮고 어깨까지. 머리 덮개보다 1칸 크게 */
function hoodFront(cB, h, shade = false) {
  const c = cB.H ?? cB;
  const L = wl(c);
  const { oy, v } = c;
  // 천으로 보이게 (점검_피드백2 4-2): 얼굴 둘레 접힌 테(밝음)와 그 안쪽 그늘 줄, 이마에 드리운 그늘,
  // 정수리의 뾰족한 끝, 옆·어깨로 흘러내리는 주름. 머리카락처럼 한 덩어리로 보이지 않게
  const deep = h[3] ?? h[2];
  if (v === 'right') {
    spans(L, 1 + oy, 32 + oy, (y) => {
      const r = y - oy;
      const ry = (r - 16.8) / 13.2;
      const w = ry > -1 && ry < 1 ? 13.5 * Math.sqrt(1 - ry * ry) : 0;
      if (r < 16.8 && w < 1) return null;
      const f = sideAt(r) ?? [20, 33];
      // 뒤통수 아래는 목 쪽으로 오므라들었다가 어깨에서 다시 벌어짐 (단발처럼 곧게 떨어지지 않게)
      const back = r < 16.8 ? SIDE_CX - w : r < 26 ? 17 + (r - 16.8) * 0.45 : 21.1 - (r - 26) * 0.7;
      // 이마 위로 챙처럼 1~2px 튀어나온 두건 앞자락
      const fr = r < 5 ? SIDE_CX + w : r < 12 ? Math.max(Math.min(SIDE_CX + w + 1.5, f[1] + 2.5), f[1] + 1) : 34;
      return [back, fr];
    }, (x, y, t) => {
      const r = y - oy;
      if (r >= 5 && r < 12 && t > 0.9) return h[0]; // 이마 위 챙 끝(밝음)
      if (r >= 9 && t > 0.88) return h[0]; // 얼굴 둘레 접힌 테
      if (r >= 9 && t > 0.8) return deep; // 테 안쪽 그늘
      if (r > 17 && r < 29 && Math.abs(t - (0.18 + (r - 17) * 0.02)) < 0.05) return deep; // 목 뒤 접힘
      // 곧게 비스듬히 흘러내리는 천 주름 두 줄 (물결치면 머리카락처럼 보여서 곧은 선으로)
      if (r > 8 && Math.abs(t - (0.5 - (r - 8) * 0.008)) < 0.04) return h[2];
      if (r > 18 && Math.abs(t - (0.32 - (r - 18) * 0.006)) < 0.04) return h[2];
      if (t < 0.1) return deep;
      return r < 8 && t < 0.6 ? h[0] : h[1];
    });
  } else {
    spans(L, 1 + oy, 32 + oy, (y) => {
      const r = y - oy;
      const hw = r < 16 ? capHW(r) + 1 : 13.5;
      return hw > 2 ? [CX - hw + 0.5, CX + hw - 0.5] : null;
    }, (x, y, t) => {
      const r = y - oy;
      const fx = Math.abs(x + 0.5 - CX);
      const hole = v === 'down' && r > 9 ? Math.min(10.5, faceHW(false, r) + 0.5) : -1;
      if (hole > 0 && fx < hole) {
        if (shade && r <= 17) return h[2];
        // 이마에 드리운 두건 그늘 (위 2줄)
        return r <= 11 ? deep : null;
      }
      if (hole > 0 && fx < hole + 1.6) return h[0]; // 얼굴 둘레 접힌 테
      if (hole > 0 && fx < hole + 2.6) return deep; // 테 바깥 그늘 줄
      if (v === 'down' && r > 13 && Math.abs(fx - (hole + 5.5 + (r - 13) * 0.12)) < 0.7) return h[2]; // 볼 옆 주름
      if (v === 'up' && r > 6 && Math.abs(x + 0.5 - CX) < 0.6) return h[2]; // 뒤 솔기
      if (v === 'up' && r > 14 && Math.abs(fx - 6 - (r - 14) * 0.25) < 0.6) return h[2];
      if (r < 7 && x + 0.5 < CX) return h[0];
      return t < 0.1 || t > 0.9 ? h[2] : h[1];
    });
  }
  // 어깨에 걸친 자락: 가운데는 목, 주름 두 줄
  spans(L, 30 + oy, 38 + oy, (y) => (v === 'right' ? [22 - (y - oy - 30) * 0.4, 36] : [CX - 12.5 - (y - oy - 30) * 0.3, CX + 12.5 + (y - oy - 30) * 0.3]), (x, y, t) => {
    if (v === 'down' && Math.abs(x + 0.5 - CX) < 4 && y < 32 + oy) return null;
    if (v !== 'right' && (Math.abs(t - 0.25) < 0.03 || Math.abs(t - 0.75) < 0.03)) return h[2];
    if (v === 'right' && Math.abs(t - 0.45) < 0.04) return h[2];
    return t > 0.85 ? h[2] : h[1];
  });
  const o = out(L);
  if (o) o.isHood = true;
  return o;
}

// ---------------------------------------------------------------------
// 한 칸
// ---------------------------------------------------------------------
/** o: { dy(논리 칸), step, swing, sway, flare, lift, arms(전투 팔), battle(손에 든 것 숨김) } */
export function drawTall(id, view, o = {}) {
  const p = PEOPLE[id];
  const s = specOf(id);
  const flip = view === 'left';
  const v = flip ? 'right' : view;
  const oy = (o.dy ?? 0) * 2 + (s.drop ?? 0);
  const pp = s.darkHair ? { ...p, hair: [p.hair[1], p.hair[2], p.hair[3], p.hair[4], p.hair[4]] } : p;
  const base = { id, p: pp, s, v, step: o.step, swing: o.swing ?? 0, sway: o.sway ?? 0, flare: o.flare ?? 0, lift: o.lift ?? 0, staffUp: o.staffUp ?? 0 };
  const cH = { ...base, oy, warp: headWarp(oy, s.headK ?? HEAD_K) };
  const c = { ...base, oy: oy + BODY_DOWN, H: cH };
  const HH = { ...HELP, lay: () => wl(cH) };
  let { back, body, front } = TALL[s.look] ? outfit(c) : outfitGeneric(c, HELP);
  if (!TALL[s.look]) back.unshift(drawHairBack(c)); // 조연의 긴 머리·땋은 머리
  if (o.battle) {
    const keep = (l) => !l?.isHeld || ['shield', 'kiteShield', 'quiver', 'scabbard', ...(o.keep ?? [])].includes(l.isHeld);
    back = back.filter(keep);
    body = body.filter(keep);
    front = front.filter(keep);
  }
  if (o.arms) {
    const old = front.find((l) => l?.isArm);
    const [sleeve, hand, r] = old?.style ?? [p.cloth, p.skin, 2.5];
    front = front.filter((l) => !l?.isArm);
    for (const a of o.arms) {
      const [fx, fy] = a.from;
      const [tx, ty] = a.to;
      front.push(arm(fx, fy + c.oy, (fx + tx) / 2 + (a.bend ?? 0), (fy + ty) / 2 + 2 + c.oy, tx, ty + c.oy, sleeve, hand, r));
    }
  }
  const parts = [];
  const head = drawHead(cH);
  if (v === 'up') {
    const hood = front.filter((l) => l?.isHood);
    parts.push(drawLegs(c), ...body, ...front.filter((l) => !l?.isHood), drawNeck(c), head, drawHairFront(cH), drawEars(cH), headwear(cH, HH), ...back, ...hood);
  } else {
    beard(cH, head, HH);
    drawFaceBig(cH, head);
    parts.push(...back, drawLegs(c), ...body, drawNeck(c), head, drawHairFront(cH), drawEars(cH), headwear(cH, HH), ...front);
  }
  const res = lay();
  for (const l of parts) if (l) res.over(l);
  if (s.squash) squashBody(res, 36 + oy, s.squash);
  if (s.stoop) stoopBody(res, v, oy);
  const fin = flip ? res.flipX() : res;
  const L2 = new Layer(32, 48);
  L2.d = fin.d;
  return L2;
}
export const isTall = (id) => !!PEOPLE[id];

/** 드워프: 턱 아래 몸을 q줄 줄이고 위(머리)는 q줄 내림. 신발 4줄은 그대로 */
function squashBody(L, ys, q) {
  const src = L.d.map((r) => [...r]);
  const f = (FOOT_T - 4 - ys) / (FOOT_T - 4 - ys - q);
  for (let Y = 0; Y <= FOOT_T; Y++) {
    let y;
    if (Y < ys + q) y = Y - q;
    else if (Y > FOOT_T - 4) y = Y;
    else y = Math.round(FOOT_T - 4 - (FOOT_T - 4 - Y) * f);
    L.d[Y] = y >= 0 && y < H ? [...src[y]] : Array(W).fill(null);
  }
}
/** 굽은 허리: 옆 보기는 허리 위를 앞으로 기울이고, 앞뒤 보기는 머리를 3줄 내림 */
function stoopBody(L, v, oy) {
  const src = L.d.map((r) => [...r]);
  const hip = 60 + oy;
  if (v === 'right') {
    for (let Y = 0; Y < hip; Y++) {
      const dx = Math.round((hip - Y) * 0.11);
      L.d[Y] = Array(W).fill(null);
      for (let X = 0; X < W; X++) if (src[Y][X] && X + dx < W) L.d[Y][X + dx] = src[Y][X];
    }
  } else {
    const ys = 37 + oy;
    for (let Y = ys + 2; Y >= 0; Y--) for (let X = 0; X < W; X++) {
      const c = Y - 3 >= 0 ? src[Y - 3][X] : null;
      if (Y < 3) L.d[Y][X] = null;
      else if (c) L.d[Y][X] = c;
      else if (Y < ys) L.d[Y][X] = null;
    }
  }
}

// ---------------------------------------------------------------------
// 전투 시트 (48x48 칸 = 그림 96x96, 인물은 고해상도 (16, 4)에)
// 열: 0 공격1 준비, 1 공격1, 2 공격2 준비, 3 공격2, 4 공격3 준비, 5 공격3,
//     6 막기, 7 피격, 8~9 시전(서기), 10 무릎 꿇음, 11 쓰러짐 (gen-hd.mjs 전투 시트와 같은 배치)
// ---------------------------------------------------------------------
const BOX = 96;
const PX = 16;
const PY = 4;
export function weaponHi(kind, hx, hy, ang) {
  const L = new Layer(BOX, BOX, 1);
  const blade = [R.white[0], R.white[1], R.white[2], R.white[3]];
  const Wd = {
    sword: { len: 30, w: 1.4, blade, hilt: R.gold, guard: 5 },
    dagger: { len: 15, w: 1.2, blade, hilt: R.wood, guard: 3 },
    greatsword: { len: 42, w: 2.4, blade, hilt: R.gold, guard: 7 },
    runesword: { len: 32, w: 1.5, blade, hilt: R.gold, guard: 5, rune: R.sky[0] },
    darkdagger: { len: 15, w: 1.2, blade: [R.violet[0], R.violet[1], R.violet[2], R.violet[3]], hilt: R.slate, guard: 3 },
  }[kind] ?? { len: 30, w: 1.4, blade, hilt: R.gold, guard: 5 };
  const a = (ang * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  limb(L, hx + ca * 4, hy + sa * 4, hx + ca * Wd.len, hy + sa * Wd.len, Wd.w, 0.6, (s2) => (s2 < -0.2 ? Wd.blade[0] : s2 > 0.4 ? Wd.blade[2] : Wd.blade[1]));
  limb(L, hx - ca * 3, hy - sa * 3, hx + ca * 2, hy + sa * 2, 1, 1, () => (Wd.hilt === R.gold ? R.wood[2] : Wd.hilt[2]));
  limb(L, hx + ca * 3 - sa * Wd.guard, hy + sa * 3 + ca * Wd.guard, hx + ca * 3 + sa * Wd.guard, hy + sa * 3 - ca * Wd.guard, 1, 1, (s2) => (s2 < 0 ? Wd.hilt[0] : Wd.hilt[1]));
  L.outline();
  L.set(Math.round(hx - ca * 4), Math.round(hy - sa * 4), Wd.hilt[1]);
  if (Wd.rune) for (const i of [9, 15, 21]) L.set(Math.round(hx + ca * i), Math.round(hy + sa * i), Wd.rune);
  L.set(Math.round(hx + ca * (Wd.len - 6)), Math.round(hy + sa * (Wd.len - 6)), R.white[0]);
  const o = new Layer(48, 48);
  o.d = L.d;
  return o;
}
// 손 위치(인물 64x96 기준)와 칼 각도
const POSES_T = {
  down: {
    a1w: { h: [48, 26], ang: -60 }, a1s: { h: [40, 56], ang: 120 },
    a2w: { h: [14, 28], ang: -120 }, a2s: { h: [24, 56], ang: 60 },
    a3w: { h: [33, 20], ang: -90, dy: -1 }, a3s: { h: [32, 58], ang: 90, dy: 2 },
    guard: { h: [18, 46], ang: -15 },
  },
  right: {
    a1w: { h: [24, 26], ang: -130 }, a1s: { h: [46, 48], ang: 15 },
    a2w: { h: [24, 54], ang: 150 }, a2s: { h: [46, 38], ang: -25 },
    a3w: { h: [33, 20], ang: -100, dx: -1 }, a3s: { h: [48, 50], ang: 5, dx: 2 },
    guard: { h: [42, 56], ang: -90 },
  },
  up: {
    a1w: { h: [48, 40], ang: -30, behind: true }, a1s: { h: [24, 28], ang: -120 },
    a2w: { h: [14, 40], ang: -150, behind: true }, a2s: { h: [40, 28], ang: -60 },
    a3w: { h: [32, 22], ang: -90 }, a3s: { h: [32, 14], ang: -90, dy: -2 },
    guard: { h: [14, 44], ang: 0, behind: true },
  },
};
const hash01 = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
function orbT(cell, cx, cy, r, ramp) {
  const O = new Layer(BOX, BOX, 1);
  O.ellipse(cx, cy, r, r, (x, y, nx, ny) => (nx * nx + ny * ny < 0.25 ? ramp[0] : ny < 0 ? ramp[1] : ramp[2]));
  O.outline();
  O.set(Math.round(cx - r * 0.4), Math.round(cy - r * 0.4), R.white[0]);
  for (let y = 0; y < BOX; y++) for (let x = 0; x < BOX; x++) if (O.d[y][x]) cell.d[y][x] = O.d[y][x];
}
// 무기마다 다른 동작 (docs/전투.md): 대검은 두 손으로 크게, 단검(세레나)은 찌르기
const POSES_GREAT = {
  down: {
    a1w: { h: [50, 20], ang: -45 }, a1s: { h: [18, 60], ang: 150, dy: 1 },
    a2w: { h: [12, 24], ang: -140 }, a2s: { h: [46, 62], ang: 35, dy: 1 },
    a3w: { h: [33, 16], ang: -90, dy: -1 }, a3s: { h: [32, 62], ang: 90, dy: 2 },
    guard: { h: [32, 50], ang: -90 },
  },
  right: {
    a1w: { h: [20, 22], ang: -145 }, a1s: { h: [50, 54], ang: 30, dy: 1 },
    a2w: { h: [22, 58], ang: 165 }, a2s: { h: [48, 30], ang: -45, dy: 1 },
    a3w: { h: [30, 16], ang: -100, dx: -1 }, a3s: { h: [50, 54], ang: 15, dx: 2, dy: 1 },
    guard: { h: [42, 52], ang: -80 },
  },
  up: {
    a1w: { h: [50, 44], ang: -15, behind: true }, a1s: { h: [18, 24], ang: -140 },
    a2w: { h: [12, 44], ang: -165, behind: true }, a2s: { h: [46, 24], ang: -40 },
    a3w: { h: [32, 30], ang: -90, behind: true }, a3s: { h: [32, 12], ang: -90, dy: -2 },
    guard: { h: [32, 46], ang: -90, behind: true },
  },
};
const POSES_THRUST = {
  down: {
    a1w: { h: [42, 46], ang: 80 }, a1s: { h: [36, 66], ang: 90 },
    a2w: { h: [24, 44], ang: 100 }, a2s: { h: [30, 64], ang: 90 },
    a3w: { h: [33, 40], ang: 90, dy: -1 }, a3s: { h: [33, 68], ang: 90, dy: 1 },
    guard: { h: [20, 46], ang: -20 },
  },
  right: {
    a1w: { h: [30, 48], ang: 5 }, a1s: { h: [54, 46], ang: 0 },
    a2w: { h: [30, 42], ang: -5 }, a2s: { h: [56, 40], ang: -5 },
    a3w: { h: [28, 46], ang: 0, dx: -1 }, a3s: { h: [58, 44], ang: 0, dx: 2 },
    guard: { h: [42, 54], ang: -80 },
  },
  up: {
    a1w: { h: [40, 46], ang: -90, behind: true }, a1s: { h: [36, 22], ang: -90 },
    a2w: { h: [24, 46], ang: -90, behind: true }, a2s: { h: [28, 22], ang: -90 },
    a3w: { h: [32, 44], ang: -90, behind: true }, a3s: { h: [32, 18], ang: -90, dy: -1 },
    guard: { h: [14, 44], ang: 0, behind: true },
  },
};
// 카르그 셋째 타 (아래로 휘두름): 전투 자세 시트 12~13열
const POSES_LOW = {
  down: { w: { h: [48, 60], ang: 30 }, s: { h: [16, 62], ang: 160, dy: 1 } },
  right: { w: { h: [26, 60], ang: 160 }, s: { h: [52, 58], ang: 10, dy: 1 } },
  up: { w: { h: [48, 50], ang: -20, behind: true }, s: { h: [16, 40], ang: -160 } },
};
// 전투 자세 (적이 가까울 때): 무기를 앞으로 겨눔
const READY = {
  sword: { down: { h: [42, 52], ang: -55 }, right: { h: [44, 50], ang: -40 }, up: { h: [22, 50], ang: -125, behind: true } },
  great: { down: { h: [42, 56], ang: -40 }, right: { h: [42, 52], ang: -55 }, up: { h: [30, 52], ang: -100, behind: true } },
  thrust: { down: { h: [40, 52], ang: 40 }, right: { h: [46, 50], ang: -10 }, up: { h: [26, 50], ang: -110, behind: true } },
};
const fightStyle = (cfg) => (cfg.cast ? 'cast' : cfg.lunge ? 'lunge' : cfg.weapon === 'greatsword' ? 'great' : cfg.dual ? 'dual' : cfg.weapon === 'dagger' ? 'thrust' : 'sword');
const posesOf = (st) => (st === 'great' ? POSES_GREAT : st === 'thrust' ? POSES_THRUST : POSES_T);
const angDiff = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;
const KEYS = ['a1w', 'a1s', 'a2w', 'a2s', 'a3w', 'a3s', 'guard'];

/**
 * 무기를 든 한 칸: pz(손 위치·칼 각도), o: 몸 옮김(bx, by 논리 px), 걷기(step 등), ghost(잔상 자세)
 */
function armedCell(id, view, pz, o = {}) {
  const p = PEOPLE[id];
  const cfg = p.battle ?? { weapon: p.weapon };
  const st = fightStyle(cfg);
  const v = view === 'left' ? 'right' : view;
  const cell = new Layer(48, 48);
  const s = specOf(id);
  const drop = s.drop ?? 0;
  const ax = s.build[0] - 0.7;
  const bx = (o.bx ?? 0) + (pz.dx ?? 0);
  const by = o.by ?? 0;
  const dy = (pz.dy ?? 0) + (o.dy ?? 0);
  const [hx, hy] = pz.h;
  const shoulders = v === 'right' ? [[31, 36]] : [[CX - ax, 36], [CX + ax, 36]];
  const sh0 = shoulders.reduce((a, b) => (Math.abs(b[0] - hx) < Math.abs(a[0] - hx) ? b : a));
  const a = (pz.ang * Math.PI) / 180;
  const arms = [];
  if (v !== 'right') {
    const other = shoulders.find((q) => q !== sh0);
    const side = other[0] < CX ? -1 : 1;
    // 대검: 두 손으로 손잡이를 쥠 (뒷손은 칼자루 아래쪽)
    if (st === 'great') arms.push({ from: other, to: [hx - Math.cos(a) * 4, hy - Math.sin(a) * 4 - drop] });
    else arms.push({ from: other, to: [other[0] + side * 3.6, 52], bend: side * 2.2 });
  } else if (st === 'great') arms.push({ from: [29, 36], to: [hx - Math.cos(a) * 4, hy - Math.sin(a) * 4 - drop] });
  arms.push({ from: sh0, to: [hx, hy - drop] });
  const body = drawTall(id, v, { battle: true, arms, dy, step: o.step, swing: o.swing, sway: o.sway, flare: o.flare });
  const wx = PX + hx + bx * 2;
  const wy = PY + hy + BODY_DOWN + dy * 2 + by * 2;
  const wp = weaponHi(cfg.weapon, wx, wy, pz.ang);
  if (o.ghost) {
    // 잔상: 휘두른 길의 칼을 밝은 색 성긴 점으로 (칼보다 뒤에)
    const g = o.ghost;
    const gw = weaponHi(cfg.weapon, PX + g.h[0] + bx * 2, PY + g.h[1] + BODY_DOWN + dy * 2 + by * 2, g.ang);
    for (let y = 0; y < gw.d.length; y++) for (let x = 0; x < gw.d[y].length; x++) if (gw.d[y][x]) gw.d[y][x] = (x + y) % 2 ? null : R.white[0];
    cell.over(gw);
  }
  const putB = () => cell.over(body, PX / 2 + bx, PY / 2 + by);
  if (pz.behind) { cell.over(wp); putB(); } else { putB(); cell.over(wp); }
  if (st === 'dual' && !o.noDual) cell.under(weaponHi(cfg.weapon, PX + (v === 'right' ? hx - 12 : 64 - hx) + bx * 2, wy + 4, 180 - pz.ang));
  return view === 'left' ? cell.flipX() : cell;
}

function battleFrameT(id, view, col) {
  const p = PEOPLE[id];
  const cfg = p.battle ?? { weapon: p.weapon };
  const st = fightStyle(cfg);
  const v = view === 'left' ? 'right' : view;
  const cell = new Layer(48, 48);
  const fwd = { down: [0, 1], right: [1, 0], up: [0, -1] }[v];
  const put = (b, dx = 0, dy = 0) => cell.over(b, PX / 2 + dx, PY / 2 + dy);
  const hide = !cfg.lunge && !cfg.cast;
  const P = (vv, o = {}) => drawTall(id, vv, { battle: hide, ...o });
  const s = specOf(id);
  const drop = s.drop ?? 0;
  // 시전 손: 엘리시아는 지팡이 쥔 손 위
  const castHand = { down: [CX + s.build[0] + 4, 44 + BODY_DOWN], right: [44, 46 + BODY_DOWN], up: [CX - s.build[0] - 4, 44 + BODY_DOWN] }[v];
  if (col === 11) {
    cell.over(P('down').rot90(), 0, 48 - 32);
  } else if (col === 10) {
    put(P(v, { dy: 5 }));
  } else if (col === 7) {
    put(P(v), -fwd[0] * 2, -fwd[1] * 2 + 1);
  } else if (col >= 8) {
    // 시전: 9열은 지팡이를 높이 듦
    put(P(v, { dy: col === 9 ? -1 : 0, staffUp: col === 9 ? 6 : 2 }));
    if (cfg.cast) orbT(cell, PX + castHand[0], PY + castHand[1] + drop - (col === 9 ? 8 : 2) - 10, col === 8 ? 3 : 5, cfg.cast);
  } else if (cfg.cast) {
    const k = col % 2;
    // 준비는 한 칸 물러서며 지팡이를 들고, 쏠 때 앞으로 내밈
    put(P(v, { staffUp: k ? 6 : 3 }), fwd[0] * (k ? 2 : -1), fwd[1] * (k ? 2 : -1));
    if (k === 1 || col === 6) orbT(cell, PX + castHand[0] + fwd[0] * (8 + 2 * k), PY + castHand[1] - 10 - (k ? 6 : 0) + drop + fwd[1] * (8 + 2 * k), 4, cfg.cast);
  } else if (cfg.lunge) {
    const d = col % 2 === 1 ? 3 : -1;
    put(P(v), fwd[0] * d, fwd[1] * d);
  } else {
    const pz = posesOf(st)[v][KEYS[col]];
    // 몸 움직임: 준비는 1px 뒤로, 휘두름은 앞으로 (셋째 타·대검은 2px, 무릎을 굽힘)
    const heavy = col === 5 || st === 'great';
    const k = col === 6 ? 0 : col % 2 ? (heavy ? 2 : 1) : -1;
    return armedCell(id, view, pz, { bx: fwd[0] * k, by: fwd[1] * k });
  }
  return view === 'left' ? cell.flipX() : cell;
}
export function tallBattleSheet(id) {
  const frames = [];
  for (const v of ['down', 'left', 'right', 'up']) for (let col = 0; col < 12; col++) frames.push(battleFrameT(id, v, col));
  return frames;
}

/**
 * 전투 자세 시트 (움직임_피드백 3절): 48x48 칸, 16열 x 4행(아래·왼·오른·위)
 * 0~1 전투 자세 서기(숨쉬기), 2~5 전투 자세 걷기, 6~8 공격 1·2·3 뒤따름(잔상), 9~11 공격 1·2·3 거둠,
 * 12~13 카르그 셋째 타(아래로 휘두름: 준비, 휘두름), 14~15 여분(서기와 같음)
 */
export const STANCE_COLS = 16;
function stanceFrame(id, view, col) {
  const p = PEOPLE[id];
  const cfg = p.battle ?? { weapon: p.weapon };
  const st = fightStyle(cfg);
  const v = view === 'left' ? 'right' : view;
  const fwd = { down: [0, 1], right: [1, 0], up: [0, -1] }[v];
  const walk = [
    { step: 'a', dy: 1, swing: 2, sway: -1, flare: 2 },
    { step: 'pa', swing: 0, flare: 1 },
    { step: 'b', dy: 1, swing: -2, sway: 1, flare: 2 },
    { step: 'pb', swing: 0, flare: 1 },
  ];
  if (st === 'cast' || st === 'lunge') {
    const cell = new Layer(48, 48);
    const put = (b, dx = 0, dy = 0) => cell.over(b, PX / 2 + dx, PY / 2 + dy);
    const hide = !cfg.lunge && !cfg.cast;
    const P = (o = {}) => drawTall(id, v, { battle: hide, ...o });
    if (col <= 1) put(P({ dy: col ? 1 : 0.5, staffUp: 3, sway: col ? 1 : 0 }));
    else if (col <= 5) put(P({ ...walk[col - 2], staffUp: 3 }));
    else if (col <= 8) put(P({ staffUp: 6 }), fwd[0] * 2, fwd[1] * 2);
    else if (col <= 11) put(P({ staffUp: 4 }), fwd[0], fwd[1]);
    else put(P({ dy: 0.5, staffUp: 3 }));
    return view === 'left' ? cell.flipX() : cell;
  }
  const ready = READY[st === 'dual' ? 'sword' : st][v];
  const poses = posesOf(st)[v];
  if (col <= 1) return armedCell(id, view, ready, { dy: col ? 1 : 0.5, sway: col ? 1 : 0 });
  if (col <= 5) return armedCell(id, view, ready, walk[col - 2]);
  if (col <= 11) {
    const n = (col - 6) % 3;
    const w = poses[KEYS[n * 2]];
    const sw = poses[KEYS[n * 2 + 1]];
    const turn = Math.sign(angDiff(w.ang, sw.ang)) || 1;
    const heavy = n === 2 || st === 'great';
    if (col <= 8) {
      // 뒤따름: 휘두른 방향으로 더 돌고 손이 조금 더 나감. 휘두른 칼 자리에 잔상
      const thr = st === 'thrust';
      const ft = { h: [sw.h[0] + fwd[0] * (thr ? 2 : 3) - (thr ? 0 : turn * 2), sw.h[1] + fwd[1] * (thr ? 2 : 3) + (thr ? 0 : 2)], ang: sw.ang + (thr ? 0 : turn * 30), behind: sw.behind, dy: sw.dy };
      const k = heavy ? 2 : 1;
      return armedCell(id, view, ft, { bx: fwd[0] * k, by: fwd[1] * k, ghost: thr ? null : sw });
    }
    // 거둠: 뒤따름과 전투 자세 사이
    const ft = { h: [sw.h[0], sw.h[1]], ang: sw.ang + turn * 30 };
    const rc = { h: [(ft.h[0] + ready.h[0]) / 2, (ft.h[1] + ready.h[1]) / 2], ang: ft.ang + angDiff(ft.ang, ready.ang) / 2, behind: ready.behind && sw.behind };
    return armedCell(id, view, rc, { dy: 0.5 });
  }
  if (col <= 13) {
    const lp = POSES_LOW[v][col === 12 ? 'w' : 's'];
    const k = col === 12 ? -1 : 2;
    return armedCell(id, view, lp, { bx: fwd[0] * k, by: fwd[1] * k, noDual: col === 13 });
  }
  return armedCell(id, view, ready, { dy: 0.5 });
}
export function tallStanceSheet(id) {
  const frames = [];
  for (const v of ['down', 'left', 'right', 'up']) for (let col = 0; col < STANCE_COLS; col++) frames.push(stanceFrame(id, v, col));
  return frames;
}
void hash01;

// 조연 그리기(hd/tall_cast.mjs)에 넘기는 도구
const HELP = { wl, BODY_DOWN, spans, limb, lock, ell, stamp, band, out, lay, CX, FOOT_T, faceHW, capHW, sideAt, SIDE_CX, roundShade, torso, skirtL, collar, pauldron, arm, capeBack, hoodFront, drawTail };
