// 새 인물 도트 32x48 (docs/도트기준.md)
// 한 칸: 32x48, 발끝은 45줄(아래에서 2칸 위), 머리 3~19줄, 몸 20~32줄, 다리 33~45줄
// 부위(망토, 뒷머리, 다리, 몸, 팔, 머리, 앞머리, 얼굴)를 따로 그려 외곽선을 넣은 뒤 겹친다
import { RAMPS } from '../palette.mjs';
import { Layer, darker } from './layer.mjs';

const R = RAMPS;
export const FOOT = 45; // 발끝 줄
export const FRAME = { w: 32, h: 48 };

/** 가로 위치 t(0~1)로 명암: 왼쪽 위가 밝다. r = [밝음, 기본, 그늘, ...] */
const sh = (r, t, hi = 0.25, lo = 0.68) => (t < hi ? r[0] : t > lo ? r[2] : r[1]);
/** 둥근 면의 명암 (nx, ny: -1~1) */
const shN = (r, nx, ny, bias = 0) => {
  const l = -(nx * 0.55 + ny * 0.75) + bias;
  return l > 0.5 ? r[0] : l > -0.3 ? r[1] : r[2];
};

// =====================================================================
// 인물 설정
// =====================================================================
export const PEOPLE = {
  leon: {
    skin: R.skin,
    hair: R.hair,
    hairStyle: 'short',
    eye: [R.sky[2], R.sky[3], R.hair[4]], // 회청색 [밝음, 기본, 어둠]
    brow: 'sharp',
    cloth: R.navy, // 남색 제복
    cape: [R.navy[3], R.navy[3], R.navy[4], R.navy[4], R.black[3]], // 어두운 남색 망토
    pants: R.black,
    shoes: R.black,
    glove: R.white,
    coat: 39, // 코트 아랫단 줄 (무릎 아래)
    weapon: 'sword',
    // 장식
    collar: true,
    plate: true, // 은색 가슴판
    pauldron: true, // 왼쪽 어깨 은색 갑옷
    belt: R.white,
    trim: R.silver, // 코트 아랫단 은색 자수
    buttons: R.gold,
  },
  serena: {
    skin: R.skin,
    hair: R.plat,
    hairStyle: 'long',
    eye: [R.red[1], R.red[2], R.red[3]], // 붉은 눈
    brow: 'soft',
    blush: true,
    cloth: R.white, // 흰 드레스
    dress: true,
    capelet: true, // 짧은 흰 케이프
    accent: R.red, // 진홍 테두리, 세로선
    gold: R.gold,
    pants: R.white,
    shoes: R.white,
    glove: R.skin,
    weapon: 'dagger',
    handsTogether: true,
  },
};

// =====================================================================
// 부위
// =====================================================================

/** 머리 둘레 (보기마다) */
function headGeom(view) {
  return view === 'right' ? { cx: 16.6, cy: 11.6, rx: 7.6, ry: 8.1 } : { cx: 16, cy: 11.6, rx: 7.9, ry: 8.1 };
}

// 머리 모양 (SD): 줄마다 가운데에서의 반폭. 볼이 통통하고 턱은 짧게
const HEAD_ROWS = { 3: 4, 4: 6, 5: 7, 6: 7.5, 7: 8, 8: 8, 9: 8, 10: 8, 11: 8, 12: 8, 13: 8, 14: 8, 15: 8, 16: 7.6, 17: 7, 18: 6, 19: 4.5 };
function drawHead(p, view, dy) {
  const L = new Layer();
  const sk = p.skin;
  const side = view === 'right';
  const cx = side ? 16.5 : 15.5;
  for (const [row, hw] of Object.entries(HEAD_ROWS)) {
    const y = +row + dy;
    // 옆모습은 얼굴 쪽(오른쪽)으로 턱이 나옴
    const l = Math.round(cx - hw + 0.5 + (side && +row > 15 ? (+row - 15) * 0.8 : 0));
    const r = Math.round(cx + hw - 0.5 + (side && +row > 15 ? 0.6 : 0));
    for (let x = l; x <= r; x++) {
      const nx = (x + 0.5 - cx) / 8;
      const ny = (+row - 11) / 8.5;
      L.set(x, y, shN(sk.slice(0, 3), nx, ny, 0.25));
    }
  }
  if (side) L.set(25, 15 + dy, sk[1]); // 코 끝
  L.outline();
  return L;
}

/** 머리카락: 뒤(몸 뒤로 늘어지는 것)와 앞(정수리·앞머리) */
function drawHairBack(p, view, dy) {
  const L = new Layer();
  const h = p.hair;
  if (p.hairStyle !== 'long') return L;
  // 바닥까지 끌리는 긴 머리
  const bottom = 44;
  if (view === 'down') {
    L.trap(10 + dy, bottom, 7, 24, 5, 26, (x, y, t) => (t < 0.18 ? h[1] : t > 0.82 ? h[3] : (x + Math.floor(y / 5)) % 5 === 0 ? h[2] : h[1]));
  } else if (view === 'up') {
    L.trap(5 + dy, bottom, 8, 23, 6, 25, (x, y, t, k) => {
      if ((x === 11 || x === 16 || x === 20) && y > 20) return h[2];
      return t < 0.2 ? h[1] : t > 0.8 ? h[3] : h[1];
    });
    // 끝이 살짝 갈라짐
    for (const x of [6, 11, 16, 21, 25]) L.clear(x, bottom);
  } else {
    L.trap(9 + dy, bottom, 8, 17, 6, 17, (x, y, t) => (t < 0.3 ? h[2] : (x + Math.floor(y / 4)) % 4 === 0 ? h[2] : h[1]));
  }
  L.outline();
  return L;
}

function drawHairFront(p, view, dy) {
  const L = new Layer();
  const h = p.hair;
  const g = headGeom(view);
  const cy = g.cy + dy;
  const long = p.hairStyle === 'long';
  if (view === 'up') {
    // 뒤통수 전체
    L.ellipse(g.cx, cy - 0.4, g.rx + 0.9, g.ry + 0.6, (x, y, nx, ny) => shN(h.slice(1, 4), nx, ny, 0.25));
    if (!long) L.rect(Math.round(g.cx - 6), Math.round(cy + 5), Math.round(g.cx + 5), Math.round(cy + 7), (x) => (x < g.cx ? h[2] : h[3]));
    // 반짝임 띠
    for (const [x, y] of [[11, 7], [12, 6], [13, 6], [14, 5]]) L.set(x, y + dy, h[0]);
    L.outline();
    return L;
  }
  // 정수리: 8줄까지 덮고, 앞머리는 9~11줄 (끝이 12줄까지)
  const Y = (n) => n + dy;
  const top = (x, y, nx, ny) => shN(h.slice(1, 4), nx, ny, 0.35);
  // 정수리 덮개: 머리 모양을 따라 한 칸 크게 (10줄까지)
  const cxx = view === 'right' ? 16.5 : 15.5;
  for (let r = 2; r <= 10; r++) {
    const hw = (HEAD_ROWS[r] ?? 3) + 1;
    for (let x = Math.round(cxx - hw + 0.5); x <= Math.round(cxx + hw - 0.5); x++) L.set(x, Y(r), top(x, Y(r), (x + 0.5 - cxx) / 9, (r - 10) / 9));
  }
  if (view === 'down') {
    L.ellipse(g.cx, cy - 0.6, g.rx + 1, g.ry + 0.4, (x, y, nx, ny) => (y <= Y(10) ? top(x, y, nx, ny) : null));
    if (long) {
      // 일자 앞머리 (12줄까지), 양옆 긴 옆머리
      L.rect(8, Y(9), 23, Y(12), (x, y) => (y === Y(12) ? h[2] : x < 12 ? h[0 + 1] : x > 19 ? h[2] : h[1]));
      for (const x of [10, 13, 18, 21]) L.set(x, Y(12), h[3]);
      L.rect(6, Y(10), 8, Y(29), (x) => (x === 6 ? h[2] : x === 7 ? h[1] : h[2]));
      L.rect(23, Y(10), 25, Y(29), (x) => (x === 25 ? h[3] : x === 24 ? h[2] : h[3]));
      for (const x of [7, 24]) L.set(x, Y(30), h[2]);
    } else {
      // 짧은 앞머리: 이마를 살짝 덮는 뾰족한 끝
      L.rect(8, Y(9), 23, Y(10), (x) => (x < 13 ? h[1] : x > 19 ? h[3] : h[2]));
      const tips = [[8, 3], [9, 2], [11, 1], [12, 2], [13, 1], [15, 1], [16, 2], [18, 1], [19, 2], [21, 1], [22, 2], [23, 3]];
      for (const [x, n] of tips) for (let k = 0; k < n; k++) L.set(x, Y(11) + k, k === n - 1 ? h[3] : x < 16 ? h[1] : h[2]);
      // 옆머리 (구레나룻)
      L.rect(8, Y(11), 8, Y(15), h[2]);
      L.rect(23, Y(11), 23, Y(15), h[3]);
      // 정수리 삐침
      L.set(17, Y(2), h[1]);
      L.set(18, Y(2), h[2]);
      L.set(18, Y(1), h[2]);
    }
    // 머리카락 결 (그늘 줄)
    for (const [x, y] of [[12, 7], [13, 8], [19, 6], [20, 7], [17, 8]]) L.paint(x, Y(y), h[3]);
    // 반짝임 (머리카락 하이라이트 점)
    for (const [x, y] of [[10, 6], [11, 5], [12, 4], [13, 4], [14, 4]]) L.set(x, Y(y), h[0]);
  } else {
    // 옆모습: 뒤통수 쪽(왼쪽)을 아래까지 덮고, 앞머리는 이마 앞으로
    L.ellipse(g.cx - 0.3, cy - 0.6, g.rx + 0.5, g.ry + 0.4, (x, y, nx, ny) => (y <= Y(10) || (x <= 14 && y <= Y(long ? 30 : 16)) ? top(x, y, nx, ny) : null));
    if (long) {
      L.rect(17, Y(9), 24, Y(12), (x, y) => (y === Y(12) ? h[2] : h[1]));
      for (const x of [19, 22]) L.set(x, Y(12), h[3]);
      L.rect(13, Y(12), 16, Y(28), (x) => (x === 13 ? h[2] : x === 16 ? h[2] : h[1]));
    } else {
      L.rect(17, Y(9), 24, Y(10), h[2]);
      for (const [x, n] of [[17, 1], [18, 2], [20, 1], [21, 2], [23, 2], [24, 1]]) for (let k = 0; k < n; k++) L.set(x, Y(11) + k, k === n - 1 ? h[3] : h[1]);
      L.set(14, Y(2), h[1]);
      L.set(13, Y(1), h[2]);
    }
    for (const [x, y] of [[11, 8], [12, 9], [16, 6], [17, 7]]) L.paint(x, Y(y), h[3]);
    for (const [x, y] of [[13, 5], [14, 4], [15, 4], [16, 4], [12, 6]]) L.set(x, Y(y), h[0]);
  }
  L.outline();
  return L;
}

/** 얼굴: 눈 2x3, 눈썹, 입. 머리 그림 위에 바로 찍음 */
function drawFace(p, view, dy, L) {
  if (view === 'up') return;
  // 홍채 [밝음, 기본, 어둠]. 눈 2x3: 속눈썹 / 하이라이트+어둠 / 기본+밝음
  const [eL, eM, eD] = p.eye;
  const lash = p.hair[4];
  const sk = p.skin;
  const y0 = 14 + dy;
  const eye = (x) => {
    L.set(x, y0, lash);
    L.set(x + 1, y0, lash);
    L.set(x, y0 + 1, R.white[0]);
    L.set(x + 1, y0 + 1, eD);
    L.set(x, y0 + 2, eM);
    L.set(x + 1, y0 + 2, eL);
  };
  if (view === 'down') {
    eye(11);
    eye(19);
    L.set(10, y0, lash); // 바깥 눈꼬리
    L.set(21, y0, lash);
    if (p.brow === 'sharp') {
      // 날카로운 눈썹: 바깥이 높고 안쪽이 낮음
      for (const [x, y] of [[10, 12], [11, 12], [12, 13], [21, 12], [20, 12], [19, 13]]) L.set(x, y + dy, p.hair[3]);
    }
    if (p.brow === 'sharp') {
      L.set(15, 18 + dy, sk[3]);
      L.set(16, 18 + dy, sk[3]);
    } else L.set(15, 18 + dy, sk[3]);
    if (p.blush) for (const x of [10, 21]) L.set(x, 17 + dy, sk[2]);
  } else {
    eye(20);
    L.set(22, y0, lash);
    if (p.brow === 'sharp') for (const [x, y] of [[20, 12], [21, 12], [22, 12], [19, 13]]) L.set(x, y + dy, p.hair[3]);
    L.set(22, 18 + dy, sk[3]);
    if (p.blush) L.set(21, 17 + dy, sk[2]);
  }
}

/** 망토 (몸 뒤) */
function drawCape(p, view, dy) {
  const L = new Layer();
  if (!p.cape) return L;
  const c = p.cape;
  if (view === 'down') {
    L.trap(21 + dy, 41, 8, 23, 6, 25, (x, y, t) => (t < 0.5 ? c[1] : c[2]));
  } else if (view === 'up') {
    L.trap(20 + dy, 41, 9, 22, 6, 25, (x, y, t) => {
      if ((x === 12 || x === 19) && y > 26) return c[2];
      return t < 0.3 ? R.navy[2] : t > 0.75 ? c[2] : c[1];
    });
  } else {
    L.trap(21 + dy, 41, 11, 16, 7, 14, (x, y, t) => (t < 0.4 ? c[2] : c[1]));
  }
  L.outline();
  return L;
}

/** 다리. step: 'stand' | 'a' | 'b' (걷기 다리 벌림), lift: 다리를 위로 당김(점프) */
function drawLegs(p, view, o) {
  const L = new Layer();
  const pa = p.pants;
  const so = p.shoes;
  const lift = o.lift ?? 0;
  if (p.dress) {
    // 드레스: 발끝만 살짝
    const f = (x0, up) => L.rect(x0, FOOT - 1 - up - lift, x0 + 2, FOOT - up - lift, (x) => (x === x0 ? so[0] : so[1]));
    if (view === 'right') {
      if (o.step === 'a') { f(17, 0); f(12, 0); } else if (o.step === 'b') { f(16, 0); f(13, 1); } else f(15, 0);
    } else {
      f(12, o.step === 'a' ? 1 : 0);
      f(17, o.step === 'b' ? 1 : 0);
    }
    L.outline();
    return L;
  }
  const leg = (x0, top, bottom, front) => {
    L.rect(x0, top, x0 + 2, bottom - 2, (x) => (x === x0 ? pa[0] : x === x0 + 2 ? pa[2] : pa[1]));
    // 구두
    L.rect(x0 - (front ? 0 : 0), bottom - 1, x0 + 3, bottom, (x, y) => (y === bottom - 1 && x === x0 ? so[0] : so[1]));
  };
  const top = 33;
  if (view === 'right') {
    if (o.step === 'a') {
      leg(12, top, FOOT - lift, false);
      leg(17, top, FOOT - lift, true);
    } else if (o.step === 'b') {
      leg(13, top, FOOT - lift, false);
      leg(16, top, FOOT - 1 - lift, true);
    } else leg(15, top, FOOT - lift, true);
  } else {
    leg(12, top, FOOT - lift - (o.step === 'a' ? 1 : 0), true);
    leg(17, top, FOOT - lift - (o.step === 'b' ? 1 : 0), true);
  }
  L.outline();
  return L;
}

/** 몸통 (제복·드레스) */
function drawBody(p, view, dy) {
  const L = new Layer();
  const c = p.cloth;
  const y0 = 20 + dy;
  if (p.dress) {
    // 흰 드레스: 몸통 + 바닥까지 퍼지는 치마
    if (view === 'right') {
      L.trap(y0, 31 + dy, 13, 19, 12, 19, (x, y, t) => sh(c, t, 0.3, 0.75));
      L.trap(31 + dy, FOOT - 1, 12, 19, 10, 21, (x, y, t) => sh(c, t, 0.3, 0.72));
    } else {
      L.trap(y0, 31 + dy, 11, 20, 11, 20, (x, y, t) => sh(c, t));
      L.trap(31 + dy, FOOT - 1, 11, 20, 8, 23, (x, y, t, k) => ((x + y) % 7 === 0 && t > 0.6 ? c[2] : sh(c, t)));
      // 치마 주름
      for (const x of [11, 20]) for (let y = 35 + dy; y < FOOT - 1; y++) if (L.get(x, y)) L.set(x, y, c[2]);
    }
    if (view !== 'up' && p.accent) {
      // 진홍 세로선, 치맛단 테두리
      const a = p.accent;
      const cx = view === 'right' ? 18 : 15;
      for (let y = 28 + dy; y < FOOT - 1; y++) {
        L.set(cx, y, a[1]);
        if (view !== 'right') L.set(cx + 1, y, a[2]);
      }
    }
    if (p.accent) for (let x = 0; x < 32; x++) if (L.get(x, FOOT - 1)) L.set(x, FOOT - 1, p.accent[1]);
    L.outline({ skipBottom: false });
    // 금색 자수 점
    if (view !== 'up' && p.gold) for (const [x, y] of view === 'right' ? [[18, 41]] : [[15, 41], [16, 41], [12, 42], [19, 42]]) L.set(x, y, p.gold[1]);
    return L;
  }
  // 제복 상의
  if (view === 'right') {
    L.trap(y0, 32 + dy, 12, 19, 13, 19, (x, y, t) => sh(c, t, 0.3, 0.75));
  } else {
    L.trap(y0, y0 + 1, 11, 20, 10, 21, (x, y, t) => sh(c, t));
    L.trap(y0 + 2, 32 + dy, 10, 21, 11, 20, (x, y, t) => sh(c, t));
  }
  // 무릎 아래까지 오는 코트 자락
  const hem = p.coat ?? 32;
  if (view === 'right') L.trap(31 + dy, hem, 12, 19, 10, 20, (x, y, t) => sh(c, t, 0.3, 0.7));
  else if (view === 'up') L.trap(31 + dy, hem, 11, 20, 9, 22, (x, y, t) => sh(c, t));
  else {
    // 앞이 트인 코트: 가운데로 바지가 보임
    L.trap(31 + dy, hem, 10, 15, 9, 13, (x, y, t) => sh(c, t * 0.6));
    L.trap(31 + dy, hem, 16, 21, 18, 22, (x, y, t) => sh(c, 0.4 + t * 0.6));
  }
  L.outline();
  const tr = p.trim;
  if (tr) {
    // 아랫단 은색 자수 점
    const xs = view === 'right' ? [11, 14, 17, 20] : view === 'up' ? [10, 13, 16, 19, 22] : [10, 12, 19, 21];
    for (const x of xs) if (L.get(x, hem - 1)) L.set(x, hem - 1, tr[1]);
  }
  if (view === 'up') return L;
  if (p.collar) {
    // 높은 깃 (금색 테두리)
    if (view === 'right') L.rect(16, y0 - 1, 19, y0, (x) => (x === 19 ? c[3] : c[1]));
    else L.rect(13, y0 - 1, 18, y0, (x, y) => (y === y0 ? p.buttons[1] : x < 16 ? c[1] : c[2]));
  }
  if (p.plate) {
    // 은색 가슴판
    const pl = R.silver;
    if (view === 'right') {
      L.rect(17, y0 + 2, 19, y0 + 6, (x, y) => (y === y0 + 2 ? pl[1] : x === 19 ? pl[3] : pl[2]));
      L.set(17, y0 + 3, pl[0]);
    } else {
      L.trap(y0 + 2, y0 + 7, 12, 19, 13, 18, (x, y, t, k) => (k > 0.8 ? pl[3] : t < 0.35 ? pl[1] : t > 0.7 ? pl[3] : pl[2]));
      L.set(13, y0 + 3, pl[0]);
      L.set(14, y0 + 3, pl[0]);
    }
  }
  if (p.buttons && view === 'down') {
    // 금색 단추, 장식 끈
    for (const y of [y0 + 9, y0 + 11]) L.set(15, y, p.buttons[1]);
    L.set(16, y0 + 9, p.buttons[2]);
    L.set(11, y0 + 3, p.buttons[1]);
    L.set(11, y0 + 4, p.buttons[2]);
  }
  if (p.belt) {
    const b = p.belt;
    if (view === 'right') L.rect(12, 30 + dy, 19, 31 + dy, (x, y) => (y === 30 + dy ? b[1] : b[2]));
    else L.rect(11, 30 + dy, 20, 31 + dy, (x, y) => (y === 30 + dy ? (x < 15 ? b[0] : b[1]) : b[2]));
    if (view === 'down') {
      L.set(15, 30 + dy, p.buttons[0]);
      L.set(16, 30 + dy, p.buttons[1]);
      L.set(15, 31 + dy, p.buttons[1]);
      L.set(16, 31 + dy, p.buttons[2]);
    }
  }
  return L;
}

/** 세레나 짧은 케이프 (어깨 위) */
function drawCapelet(p, view, dy) {
  const L = new Layer();
  if (!p.capelet) return L;
  const c = p.cloth;
  const a = p.accent;
  const y0 = 20 + dy;
  if (view === 'right') L.trap(y0, y0 + 7, 13, 19, 11, 20, (x, y, t) => sh(c, t, 0.3, 0.72));
  else L.trap(y0, y0 + 7, 11, 20, 8, 23, (x, y, t) => sh(c, t));
  // 진홍 테두리 (아랫단)
  for (let x = 0; x < 32; x++) if (L.get(x, y0 + 7)) L.set(x, y0 + 7, a[1]);
  L.outline();
  for (let x = 0; x < 32; x++) if (L.get(x, y0 + 7)) L.set(x, y0 + 7, x % 3 === 0 ? a[2] : a[1]);
  if (view === 'down') {
    // 목 아래 금색 브로치
    L.set(15, y0 + 1, p.gold[0]);
    L.set(16, y0 + 1, p.gold[1]);
    L.set(15, y0 + 2, p.gold[1]);
    L.set(16, y0 + 2, p.gold[2]);
  }
  return L;
}

/**
 * 팔. arms: [{ from: [x, y], to: [x, y] }] 어깨에서 손까지. 손은 장갑 색
 * 기본(걷기)은 몸 옆에 내림, swing으로 앞뒤 흔들기
 */
function drawArm(p, from, to, front = true) {
  const L = new Layer();
  const c = p.dress ? p.cloth : p.cloth;
  L.line(from[0], from[1], to[0], to[1], (t) => (t < 0.15 ? c[0] : c[1]), 3);
  // 소매 그늘
  L.line(from[0] + 1, from[1] + 1, to[0] + 1, to[1], c[2], 1);
  L.outline();
  // 손 (2x2)
  const g = p.glove;
  const hx = Math.round(to[0]);
  const hy = Math.round(to[1]);
  const H = new Layer();
  H.rect(hx - 1, hy, hx + 1, hy + 2, (x, y) => (x === hx - 1 && y === hy ? g[0] : g[1]));
  H.outline();
  L.over(H);
  return L;
}

function standArms(p, view, dy, swing = 0) {
  const y = 21 + dy;
  if (p.handsTogether && view === 'down') {
    // 두 손을 모은 자세
    const A = new Layer();
    A.over(drawArm(p, [10, y + 1], [14, 30 + dy]));
    A.over(drawArm(p, [21, y + 1], [17, 30 + dy]));
    // 모은 손
    A.rect(14, 29 + dy, 17, 31 + dy, (x, yy) => (yy === 29 + dy ? p.skin[0] : p.skin[1]));
    A.set(14, 31 + dy, p.skin[2]);
    A.set(17, 31 + dy, p.skin[2]);
    return [A];
  }
  if (view === 'down' || view === 'up') {
    return [drawArm(p, [9, y + 1], [8 - (view === 'up' ? 0 : 0), 30 + dy + swing]), drawArm(p, [22, y + 1], [23, 30 + dy - swing])];
  }
  // 옆모습: 가까운 팔 하나 (앞뒤로 흔듦)
  if (p.handsTogether) return [drawArm(p, [16, y + 1], [19, 29 + dy])];
  return [drawArm(p, [15, y + 1], [15 + swing * 2, 30 + dy])];
}

/** 어깨 갑옷 (레온: 왼쪽 어깨 = 정면에서 오른쪽) */
function drawPauldron(p, view, dy) {
  const L = new Layer();
  if (!p.pauldron) return L;
  const pl = R.silver;
  const y = 20 + dy;
  if (view === 'down') L.ellipse(22.5, y + 2.5, 3.4, 2.8, (x, yy, nx, ny) => shN(pl.slice(1, 4), nx, ny, 0.3));
  else if (view === 'up') L.ellipse(9.5, y + 2.5, 3.4, 2.8, (x, yy, nx, ny) => shN(pl.slice(1, 4), nx, ny, 0.1));
  else return L; // 오른쪽을 보면 왼쪽 어깨는 안 보임 (왼쪽 보기는 뒤집어서 보임)
  L.outline();
  const sx = view === 'down' ? 21 : 8;
  L.set(sx, y + 1, pl[0]); // 반짝임
  L.set(sx + 1, y + 1, pl[0]);
  return L;
}

function drawPauldronSide(p, dy) {
  // 왼쪽을 볼 때 보이는 왼쪽 어깨 (오른쪽 보기 그림에 그려 두고 뒤집지 않은 쪽은 지움)
  const L = new Layer();
  if (!p.pauldron) return L;
  const pl = R.silver;
  L.ellipse(15.5, 22.5 + dy, 3.2, 2.8, (x, yy, nx, ny) => shN(pl.slice(1, 4), nx, ny, 0.3));
  L.outline();
  L.set(14, 21 + dy, pl[0]);
  return L;
}

// =====================================================================
// 무기 (전투)
// =====================================================================
const deg = (d) => (d * Math.PI) / 180;
export function drawWeapon(kind, hx, hy, ang, w = 48, h = 48) {
  const L = new Layer(w, h);
  const W = {
    sword: { len: 16, blade: [R.silver[0], R.silver[1], R.silver[2]], hilt: R.gold },
    dagger: { len: 8, blade: [R.silver[0], R.silver[1], R.silver[2]], hilt: R.wood },
  }[kind];
  const a = deg(ang);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  // 칼날: 가운데 밝은 줄 + 가장자리
  for (let i = 2; i <= W.len; i++) {
    const x = hx + ca * i;
    const y = hy + sa * i;
    L.set(x, y, i > W.len - 2 ? W.blade[1] : W.blade[0]);
    L.set(x - sa * 0.9, y + ca * 0.9, W.blade[2]);
  }
  // 십자 날밑, 손잡이
  for (let k = -2; k <= 2; k++) L.set(hx + ca * 2 - sa * k, hy + sa * 2 + ca * k, k === 0 ? W.hilt[0] : W.hilt[1]);
  L.set(hx, hy, W.hilt[2]);
  L.set(hx - ca, hy - sa, W.hilt[1]);
  L.outline();
  // 칼끝 반짝임
  L.set(hx + ca * (W.len - 4), hy + sa * (W.len - 4), R.silver[0]);
  return L;
}

// =====================================================================
// 한 칸 그리기
// =====================================================================
/**
 * o: { dy(몸 출렁임), step, swing, lift(다리 당김), arms(전투 팔: [{from,to}]) , noArms }
 * view: 'down' | 'up' | 'right' | 'left'
 */
export function drawPerson(id, view, o = {}) {
  const p = PEOPLE[id];
  const flip = view === 'left';
  const v = flip ? 'right' : view;
  const dy = o.dy ?? 0;
  const out = new Layer();
  const parts = [];

  parts.push(drawCape(p, v, dy));
  parts.push(drawHairBack(p, v, dy));
  // 옆·뒤 보기: 몸 뒤쪽 팔
  parts.push(drawLegs(p, v, { step: o.step, lift: o.lift }));
  const body = drawBody(p, v, dy);
  const arms = o.arms ? o.arms.map((a) => drawArm(p, a.from, a.to)) : standArms(p, v, dy, o.swing ?? 0);
  if (v === 'up') {
    parts.push(...arms);
    parts.push(body);
  } else {
    parts.push(body);
  }
  parts.push(drawCapelet(p, v, dy));
  if (v === 'up') parts.push(drawPauldron(p, v, dy));
  const head = drawHead(p, v, dy);
  drawFace(p, v, dy, head);
  parts.push(head);
  parts.push(drawHairFront(p, v, dy));
  if (v !== 'up') {
    parts.push(...arms.filter((a) => a));
    parts.push(drawPauldron(p, v, dy));
  }
  if (o.weapon) parts.push(o.weapon);
  for (const l of parts) out.over(l);
  let res = flip ? out.flipX() : out;
  if (flip && p.pauldron) {
    // 왼쪽을 보면 왼쪽 어깨(은 갑옷)가 앞에 보임
    res.over(drawPauldronSide(p, dy).flipX());
  }
  return res;
}

export { R as RAMPS_USED, darker };
