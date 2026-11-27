// 새 인물 도트 32x48 (docs/도트기준.md)
// 한 칸: 32x48, 발끝은 45줄(아래에서 2칸 위), 머리 3~19줄, 몸 20~32줄, 다리 33~45줄
// 부위(망토, 뒷머리, 다리, 몸, 팔, 머리, 앞머리, 얼굴)를 따로 그려 외곽선을 넣은 뒤 겹친다
import { RAMPS } from '../palette.mjs';
import { Layer, darker } from './layer.mjs';
import { CAST } from './cast.mjs';
import { FACES, drawFaceMap } from './face.mjs';

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
    cape: [R.navy[2], R.navy[2], R.navy[3], R.navy[3], R.navy[4]], // 어두운 남색 망토 (외곽선 #1d2735)
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
    drop: 3, // 레온보다 3px 작게
  },
};
// 나머지 인물 설정 (hd/cast.mjs)
Object.assign(PEOPLE, CAST);
// like: 다른 인물 설정을 바탕으로 몇 가지만 바꿈
for (const [id, p] of Object.entries(PEOPLE)) if (p.like) { const { like, ...rest } = p; PEOPLE[id] = { ...PEOPLE[like], ...rest }; }
// 엑스트라 얼굴 돌려쓰기: faces: [얼굴 지도...], hairs: [머리 색...], cloths: [옷 색...], helds: [든 물건...] → {id}_v2, {id}_v3 ... (엔진이 차례로 골라 옆 사람과 겹치지 않게)
export const FACE_SETS = {};
for (const [id, p] of Object.entries({ ...PEOPLE })) {
  if (!p.faces) continue;
  p.face = p.faces[0];
  if (p.hairs) p.hair = p.hairs[0];
  if (p.cloths) p.cloth = p.cloths[0];
  if (p.helds) p.held = p.helds[0];
  FACE_SETS[id] = [id];
  p.faces.slice(1).forEach((f, i) => {
    const vid = `${id}_v${i + 2}`;
    PEOPLE[vid] = { ...p, face: f, hair: p.hairs?.[i + 1] ?? p.hair, cloth: p.cloths?.[i + 1] ?? p.cloth, held: p.helds?.[i + 1] ?? p.held, variantOf: id };
    FACE_SETS[id].push(vid);
  });
}
// 두건·투구로 머리를 다 가린 인물: 머리카락 없음 (속눈썹·눈썹 색만 씀)
for (const p of Object.values(PEOPLE)) if (!p.hair) Object.assign(p, { hair: R.hair, hairStyle: 'bald' });

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
function drawHairBack(p, view, dy, sway = 0) {
  const L = new Layer();
  const h = p.hair;
  if (p.hairStyle === 'braid') {
    // 길게 땋은 머리 하나 (앞 보기는 어깨 앞으로 넘김: drawHairOver)
    if (view === 'up') braid(L, h, 16, 12 + dy, (p.hairLen ?? 38) + dy, sway);
    else if (view === 'right') braid(L, h, 10, 14 + dy, (p.hairLen ?? 38) + dy - 4, -Math.abs(sway));
    return L.outline();
  }
  if (p.hairStyle === 'braids') {
    // 두 갈래로 땋은 머리: 뒤 보기
    if (view === 'up') for (const x of [10, 21]) braid(L, h, x, 14 + dy, 30 + dy, sway);
    return L.outline();
  }
  if (p.hairStyle !== 'long' && p.hairStyle !== 'curly') return L;
  // 바닥까지 끌리는 긴 머리 (hairLen: 머리끝 줄)
  const bottom = p.hairLen ? p.hairLen + dy : 44;
  const curly = p.hairStyle === 'curly';
  // 곱슬머리 결: 짧게 끊기는 고리
  const curl = (x, y, t) => ((x * 2 + y) % 5 === 0 ? h[2] : (x * 2 + y) % 5 === 2 && t < 0.55 ? h[0] : t > 0.8 ? h[2] : h[1]);
  if (view === 'down') {
    L.trap(10 + dy, bottom, 7, 24, 5 + sway, 26 + sway, curly ? curl : (x, y, t) => (t < 0.18 ? h[2] : t > 0.82 ? h[3] : x % 3 === 0 ? h[2] : x % 3 === 1 && y > 30 && y < 36 ? h[0] : h[1]));
  } else if (view === 'up') {
    L.trap(5 + dy, bottom, 8, 23, 6 + sway, 25 + sway, curly ? curl : (x, y, t, k) => {
      // 머리카락 결 (세로 줄)과 반짝임 띠
      if (x % 3 === 0 && y > 14) return t > 0.6 ? h[3] : h[2];
      if (x % 3 === 1 && y > 24 && y < 29 && t < 0.6) return h[0];
      return t < 0.2 ? h[1] : t > 0.75 ? h[2] : h[1];
    });
    // 끝이 살짝 갈라짐
    for (const x of [6, 11, 16, 21, 25]) L.clear(x, bottom);
  } else {
    L.trap(9 + dy, bottom - Math.abs(sway), 8, 17, 6 - Math.abs(sway) * 2, 17 - Math.abs(sway), curly ? curl : (x, y, t) => (t < 0.3 ? h[2] : (x + Math.floor(y / 4)) % 4 === 0 ? h[2] : h[1]));
  }
  if (curly) bumpy(L, bottom);
  L.outline();
  return L;
}

/** 곱슬머리 가장자리를 울퉁불퉁하게 */
function bumpy(L, bottom) {
  for (let y = 0; y < L.lh; y++) {
    const xs = [...Array(L.lw).keys()].filter((x) => L.get(x, y));
    if (!xs.length) continue;
    if (y % 3 === 0) {
      L.clear(xs[0], y);
      L.clear(xs[xs.length - 1], y);
    }
    if (y === Math.round(bottom)) for (const x of xs) if (x % 2) L.clear(x, y);
  }
}

/** 땋은 머리 한 가닥: 위(top)에서 아래(bottom)로, 마디마다 비스듬한 결, 끝에 묶은 끈 */
function braid(L, h, x, top, bottom, sway = 0) {
  for (let y = top; y <= bottom; y++) {
    const k = (y - top) / Math.max(1, bottom - top);
    const cx = Math.round(x + sway * k);
    const m = (y - top) % 3;
    L.set(cx - 1, y, m === 0 ? h[2] : h[1]);
    L.set(cx, y, m === 1 ? h[0] : h[1]);
    L.set(cx + 1, y, m === 2 ? h[2] : h[1]);
  }
  const cx = Math.round(x + sway);
  L.set(cx, bottom + 1, R.gold[1]);
  L.set(cx, bottom + 2, h[2]);
}

/** 어깨 앞으로 넘긴 땋은 머리 (앞·옆 보기) */
function drawHairOver(p, view, dy) {
  const L = new Layer();
  const h = p.hair;
  if (p.hairStyle === 'braid' && view === 'down') braid(L, h, 21, 18 + dy, (p.hairLen ?? 38) + dy - 6, 1);
  if (p.hairStyle === 'braids') {
    if (view === 'down') for (const x of [8, 23]) braid(L, h, x, 15 + dy, 29 + dy, 0);
    else if (view === 'right') braid(L, h, 13, 16 + dy, 29 + dy, 0);
  }
  return L.outline();
}

function drawHairFront(p, view, dy) {
  const L = new Layer();
  const h = p.hair;
  if (!h || p.hairStyle === 'bald') return L;
  const st = p.hairStyle;
  if (st === 'slick' || st === 'curly') return drawHairStyled(p, view, dy);
  const g = headGeom(view);
  const cy = g.cy + dy;
  const long = st === 'long' || st === 'braid';
  const sideLen = st === 'braid' ? 17 : p.sideLen ?? 29;
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
      L.rect(6, Y(10), 8, Y(sideLen), (x) => (x === 6 ? h[2] : x === 7 ? h[1] : h[2]));
      L.rect(23, Y(10), 25, Y(sideLen), (x) => (x === 25 ? h[3] : x === 24 ? h[2] : h[3]));
      for (const x of [7, 24]) L.set(x, Y(sideLen + 1), h[2]);
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
      L.rect(13, Y(12), 16, Y(sideLen - 1), (x) => (x === 13 ? h[2] : x === 16 ? h[2] : h[1]));
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
  // 그 밖의 얼굴 표시
  const Y = (n) => n + dy;
  const hb = p.browColor ?? p.hair?.[3] ?? sk[4];
  if (view === 'down') {
    if (p.brow === 'heavy') for (const x of [10, 11, 12, 13, 18, 19, 20, 21]) L.set(x, Y(12), hb);
    if (p.brow === 'plain') for (const x of [11, 12, 19, 20]) L.set(x, Y(12), hb);
    if (p.smile) {
      for (const [x, y] of [[14, 17], [15, 18], [16, 18], [17, 17]]) L.set(x, Y(y), sk[3]);
    }
    if (p.scar) for (const [x, y] of [[21, 16], [21, 17], [22, 18]]) L.set(x, Y(y), sk[3]);
    if (p.freckles) for (const [x, y] of [[10, 17], [12, 17], [19, 17], [21, 17]]) L.set(x, Y(y), sk[2]);
  } else {
    if (p.brow === 'heavy') for (const x of [19, 20, 21, 22]) L.set(x, Y(12), hb);
    if (p.brow === 'plain') for (const x of [20, 21]) L.set(x, Y(12), hb);
    if (p.smile) for (const [x, y] of [[21, 17], [22, 18]]) L.set(x, Y(y), sk[3]);
    if (p.freckles) for (const [x, y] of [[19, 17], [21, 17]]) L.set(x, Y(y), sk[2]);
  }
}

/** 망토 (몸 뒤) */
function drawCape(p, view, dy, sway = 0, flare = 0) {
  const L = new Layer();
  if (!p.cape) return L;
  const c = p.cape;
  if (view === 'down') {
    L.trap(21 + dy, 41, 8, 23, 6 + sway, 25 + sway, (x, y, t) => (t < 0.5 ? c[1] : c[2]));
  } else if (view === 'up') {
    L.trap(20 + dy, 41, 9, 22, 6 + sway, 25 + sway, (x, y, t) => {
      if ((x === 12 || x === 19) && y > 26) return c[2];
      return t < 0.3 ? R.navy[2] : t > 0.75 ? c[2] : c[1];
    });
  } else {
    // 걸을 때 뒤로 날림 (flare)
    L.trap(21 + dy, 41 - flare, 11, 16, 7 - flare * 2, 14 - flare, (x, y, t) => (t < 0.4 ? c[2] : c[1]));
  }
  L.outline();
  // 아랫단: 금 테두리(capeTrim) 또는 넝마처럼 찢어진 끝(ragged)
  for (let x = 0; x < 32; x++) {
    let b = -1;
    for (let y = 47; y >= 0; y--) if (L.get(x, y)) { b = y; break; }
    if (b < 0) continue;
    if (p.capeTrim) L.set(x, b - 1, p.capeTrim[1]);
    if (p.ragged && (x * 7) % 5 < 2) { L.clear(x, b); L.set(x, b - 1, c[4] ?? c[3]); }
  }
  return L;
}

/**
 * 다리. step: 없음(서기) | 'a'·'b'(걸음 벌림, 발 닿음) | 'pa'·'pb'(한 발을 들고 지나감)
 * lift: 다리를 위로 당김(점프). 아래·위 보기는 앞으로 나온 발이 1px 아래, 든 발은 3px 위
 */
function drawLegs(p, view, o) {
  const L = new Layer();
  const pa = p.pants;
  const so = p.shoes;
  const lift = o.lift ?? 0;
  const st = o.step;
  const F = FOOT - lift;
  if (p.dress) {
    // 드레스: 치맛단 아래로 발끝만
    const f = (x0, up, far) => L.rect(x0, F - 1 - up, x0 + 2, F - up, (x) => (far ? so[1] : x === x0 ? so[0] : so[1]));
    if (view === 'right') {
      if (st === 'a' || st === 'b') { f(11, 0, true); f(19, 0); } else if (st) { f(16, 2, true); f(15, 0); } else f(15, 0);
    } else {
      const [l, r] = { a: [-1, 1], b: [1, -1], pa: [0, 3], pb: [3, 0] }[st] ?? [0, 0];
      f(12, l);
      f(17, r);
    }
    L.outline();
    return L;
  }
  const top = 33 + (o.drop ?? 0);
  // 앞뒤 보기: 곧은 다리
  const leg = (x0, bottom) => {
    const P = new Layer();
    P.rect(x0, top, x0 + 2, bottom - 2, (x) => (x === x0 ? pa[0] : x === x0 + 2 ? pa[2] : pa[1]));
    P.rect(x0, bottom - 1, x0 + 3, bottom, (x, y) => (y === bottom - 1 && x === x0 ? so[0] : so[1]));
    return P.outline();
  };
  // 옆 보기: 엉덩이(15, top)에서 발목까지 비스듬한 다리, 구두는 앞(오른쪽)으로
  const sideLeg = (fx, bottom, far) => {
    const P = new Layer();
    P.line(15, top, fx, bottom - 2, far ? pa[2] : pa[1], 3);
    if (!far) P.line(14, top, fx - 1, bottom - 2, pa[0], 1);
    P.rect(fx - 1, bottom - 1, fx + 2, bottom, (x, y) => (far ? so[2] : y === bottom - 1 && x === fx - 1 ? so[0] : so[1]));
    return P.outline();
  };
  if (view === 'right') {
    if (st === 'a' || st === 'b') {
      // 큰 걸음: 뒤 발 10, 앞 발 20 (a는 가까운 다리가 앞, b는 뒤)
      const [nearX, farX] = st === 'a' ? [20, 10] : [10, 20];
      L.over(sideLeg(farX, F, true)).over(sideLeg(nearX, F, false));
    } else if (st) {
      // 지나감: 한 다리는 곧게, 다른 다리는 무릎을 들어 앞으로
      const lifted = st === 'pa';
      L.over(sideLeg(lifted ? 15 : 17, lifted ? F : F - 3, true)).over(sideLeg(lifted ? 17 : 15, lifted ? F - 3 : F, false));
    } else L.over(sideLeg(15, F, false));
    return L;
  }
  const [l, r] = { a: [1, -1], b: [-1, 1], pa: [0, -3], pb: [-3, 0] }[st] ?? [0, 0];
  // 뒤로 간 다리를 먼저 (앞으로 나온 다리가 위에)
  const W = p.wide ?? 0;
  const legs = [[12 - W, F + l], [17 + W, F + r]].sort((a, b) => a[1] - b[1]);
  for (const [x, b] of legs) L.over(leg(x, b));
  return L;
}

/** 몸통 (제복·드레스) */
function drawBody(p, view, dy, sway = 0, flare = 0, step = undefined) {
  const L = new Layer();
  const c = p.cloth;
  const y0 = 20 + dy;
  if (p.dress) {
    // 흰 드레스: 몸통 + 바닥까지 퍼지는 치마
    if (view === 'right') {
      L.trap(y0, 31 + dy, 13, 19, 12, 19, (x, y, t) => sh(c, t, 0.3, 0.75));
      // 옆 걷기: 치맛단 앞뒤가 걸음마다 2px 번갈아 나오고, 걷는 칸은 단이 1줄 들려 발끝이 보임 (점검_피드백2 4-1)
      const [fwd, bk] = { a: [2, 0], b: [0, 2], pa: [-1, 0], pb: [-1, 0] }[step] ?? [0, 0];
      L.trap(31 + dy, FOOT - 1 - (step ? 1 : 0), 12, 19, 10 - flare - bk, 21 - Math.min(flare, 1) + fwd, (x, y, t) => sh(c, t, 0.3, 0.72));
    } else {
      L.trap(y0, 31 + dy, 11, 20, 11, 20, (x, y, t) => sh(c, t));
      const sw = p.skirtW ?? 3;
      L.trap(31 + dy, FOOT - 1, 11, 20, 11 - sw + sway, 20 + sw + sway, (x, y, t, k) => ((x + y) % 7 === 0 && t > 0.6 ? c[2] : sh(c, t)));
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
    decorate(p, view, dy, L, FOOT - 1);
    // 금색 자수 점
    if (view !== 'up' && p.gold) for (const [x, y] of view === 'right' ? [[18, 41], [14, 36], [12, 41], [16, 33]] : [[15, 41], [16, 41], [12, 34], [19, 34], [10 + sway, 39], [21 + sway, 39], [13, 42], [18, 42]]) if (L.get(x, y)) L.set(x, y, p.gold[1]);
    return L;
  }
  // 제복 상의
  const W = p.wide ?? 0;
  if (view === 'right') {
    L.trap(y0, 32 + dy, 12 - W, 19 + W, 13 - W, 19 + W, (x, y, t) => sh(c, t, 0.3, 0.75));
  } else {
    L.trap(y0, y0 + 1, 11 - W, 20 + W, 10 - W, 21 + W, (x, y, t) => sh(c, t));
    L.trap(y0 + 2, 32 + dy, 10 - W, 21 + W, 11 - W, 20 + W, (x, y, t) => sh(c, t));
  }
  // 무릎 아래까지 오는 코트 자락 (lower: 'coat' 앞이 트인 코트, 'tunic' 막힌 웃옷 자락, 'none' 없음)
  const hem = (p.coat ?? 32) + (p.drop ?? 0);
  const lc = p.lowerRamp ?? c;
  const lower = p.lower ?? 'coat';
  if (lower === 'none') {
    // 자락 없음
  } else if (view === 'right') L.trap(31 + dy, hem, 12 - W, 19 + W, 10 - W, 20 + W, (x, y, t) => sh(lc, t, 0.3, 0.7));
  else if (view === 'up' || lower === 'tunic') L.trap(31 + dy, hem, 11 - W, 20 + W, 9 - W, 22 + W, (x, y, t) => sh(lc, t));
  else {
    // 앞이 트인 코트: 가운데로 바지가 보임
    L.trap(31 + dy, hem, 10, 15, 9, 13, (x, y, t) => sh(c, t * 0.6));
    L.trap(31 + dy, hem, 16, 21, 18, 22, (x, y, t) => sh(c, 0.4 + t * 0.6));
  }
  L.outline();
  decorate(p, view, dy, L, hem);
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
    else L.rect(13, y0 - 1, 18, y0, (x, y) => (y === y0 ? (p.buttons ?? R.gold)[1] : x < 16 ? c[1] : c[2]));
  }
  if (p.plate) {
    // 은색 가슴판
    const pl = R.silver;
    if (view === 'right') {
      L.rect(17, y0 + 2, 19, y0 + 6, (x, y) => (y === y0 + 2 ? pl[1] : x === 19 ? pl[3] : pl[2]));
      L.set(17, y0 + 3, pl[0]);
    } else {
      L.trap(y0 + 3, y0 + 7, 13, 17, 13, 17, (x, y, t, k) => (k > 0.8 ? pl[3] : t < 0.35 ? pl[1] : t > 0.7 ? pl[3] : pl[2]));
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
    else L.rect(11 - W, 30 + dy, 20 + W, 31 + dy, (x, y) => (y === 30 + dy ? (x < 15 ? b[0] : b[1]) : b[2]));
    if (view === 'down') {
      L.set(15, 30 + dy, (p.buckle ?? p.buttons ?? R.gold)[0]);
      L.set(16, 30 + dy, (p.buckle ?? p.buttons ?? R.gold)[1]);
      L.set(15, 31 + dy, (p.buckle ?? p.buttons ?? R.gold)[1]);
      L.set(16, 31 + dy, (p.buckle ?? p.buttons ?? R.gold)[2]);
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
 * 기본(걷기)은 몸 옆에 내림, swing으로 앞뒤 흔들기. via: 팔꿈치(굽힌 팔)
 */
function drawArm(p, from, to, front = true, via = null) {
  const L = new Layer();
  const c = p.sleeve ?? p.cloth;
  const segs = via ? [[from, via], [via, to]] : [[from, to]];
  for (const [a, b] of segs) {
    L.line(a[0], a[1], b[0], b[1], (t) => (t < 0.15 && a === from ? c[0] : c[1]), 3);
    // 소매 그늘
    L.line(a[0] + 1, a[1] + 1, b[0] + 1, b[1], c[2], 1);
  }
  L.outline();
  const last = segs[segs.length - 1];
  // 팔 문양 (빛나는 문신)·팔 보호대
  if (p.armMark) for (let t = 0.45; t <= 0.9; t += 0.15) L.paint(last[0][0] + (last[1][0] - last[0][0]) * t, last[0][1] + (last[1][1] - last[0][1]) * t, t * 100 % 30 < 15 ? p.armMark[0] : p.armMark[1]);
  if (p.bracer) for (let t = 0.6; t <= 0.95; t += 0.1) for (const k of [-1, 0, 1]) L.paint(last[0][0] + (last[1][0] - last[0][0]) * t + k, last[0][1] + (last[1][1] - last[0][1]) * t, k < 0 ? p.bracer[0] : p.bracer[1]);
  // 소매 끝 (cuff)
  if (p.cuff) for (const k of [-1, 0, 1]) L.paint(to[0] + k, to[1] - 1, k < 0 ? p.cuff[0] : p.cuff[1]);
  // 손 (2x2)
  const g = p.glove;
  const hx = Math.round(to[0]);
  const hy = Math.round(to[1]);
  const H = new Layer();
  H.rect(hx - 1, hy, hx + 1, hy + 2, (x, y) => (x === hx - 1 && y === hy ? g[0] : g[1]));
  H.outline(p.glow ? { color: p.glow } : {});
  L.over(H);
  return L;
}

function standArms(p, view, dy, swing = 0) {
  const y = 21 + dy;
  const W = p.wide ?? 0;
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
  if (p.pose === 'cross' && view === 'down') {
    // 팔짱: 팔뚝을 가슴 앞에서 겹침
    return [drawArm(p, [22 + W, y + 1], [11, 27 + dy], true, [23 + W, 27 + dy]), drawArm(p, [9 - W, y + 1], [20, 26 + dy], true, [8 - W, 26 + dy])];
  }
  if (p.pose === 'hips' && view === 'down') {
    // 손을 허리에
    return [drawArm(p, [9, y + 1], [11, 30 + dy], true, [6, 26 + dy]), drawArm(p, [22, y + 1], [20, 30 + dy], true, [25, 26 + dy])];
  }
  if (view === 'down' || view === 'up') {
    return [drawArm(p, [9 - W, y + 1], [8 - W, 30 + dy + swing]), drawArm(p, [22 + W, y + 1], [23 + W, 30 + dy - swing])];
  }
  // 옆모습: 가까운 팔 하나 (앞뒤로 흔듦)
  if (p.handsTogether || p.pose === 'cross') return [drawArm(p, [16, y + 1], [19, 29 + dy])];
  return [drawArm(p, [15, y + 1], [15 + swing * 2, 30 + dy])];
}

/** 어깨 갑옷 (레온: 왼쪽 어깨 = 정면에서 오른쪽). pauldron: true(왼쪽 하나) | 'both' */
function drawPauldron(p, view, dy) {
  const L = new Layer();
  if (!p.pauldron) return L;
  const pl = p.pauldronRamp ?? R.silver;
  const y = 20 + dy;
  const W = p.wide ?? 0;
  const xs = view === 'down' ? [22.5 + W] : view === 'up' ? [9.5 - W] : [];
  if (p.pauldron === 'both' && view !== 'right') xs.push(view === 'down' ? 9.5 - W : 22.5 + W);
  if (!xs.length) return L; // 오른쪽을 보면 왼쪽 어깨는 안 보임 (왼쪽 보기는 뒤집어서 보임)
  for (const cx of xs) L.ellipse(cx, y + 2.5, 3.4, 2.8, (x, yy, nx, ny) => shN(pl.slice(1, 4), nx, ny, view === 'up' ? 0.1 : 0.3));
  L.outline();
  for (const cx of xs) {
    const sx = Math.round(cx - 1.5);
    L.set(sx, y + 1, pl[0]); // 반짝임
    L.set(sx + 1, y + 1, pl[0]);
    if (p.pauldronTrim) for (let x = Math.round(cx - 2); x <= Math.round(cx + 2); x++) L.paint(x, y + 4, p.pauldronTrim[1]);
  }
  return L;
}

function drawPauldronSide(p, dy) {
  // 왼쪽을 볼 때 보이는 왼쪽 어깨 (오른쪽 보기 그림에 그려 두고 뒤집지 않은 쪽은 지움)
  const L = new Layer();
  if (!p.pauldron) return L;
  const pl = p.pauldronRamp ?? R.silver;
  L.ellipse(15.5, 22.5 + dy, 3.2, 2.8, (x, yy, nx, ny) => shN(pl.slice(1, 4), nx, ny, 0.3));
  L.outline();
  L.set(14, 21 + dy, pl[0]);
  if (p.pauldronTrim) for (let x = 13; x <= 18; x++) L.paint(x, 24 + dy, p.pauldronTrim[1]);
  return L;
}

// =====================================================================
// 머리 모양 (넘긴 머리, 곱슬머리)
// =====================================================================
function drawHairStyled(p, view, dy) {
  const L = new Layer();
  const h = p.hair;
  const g = headGeom(view);
  const cy = g.cy + dy;
  const Y = (n) => n + dy;
  const top = (x, y, nx, ny) => shN(h.slice(1, 4), nx, ny, 0.35);
  const curly = p.hairStyle === 'curly';
  if (view === 'up') {
    L.ellipse(g.cx, cy - 0.4, g.rx + 0.9 + (curly ? 0.8 : 0), g.ry + 0.6, (x, y, nx, ny) => shN(h.slice(1, 4), nx, ny, 0.25));
    for (const [x, y] of [[11, 7], [12, 6], [13, 6], [14, 5]]) L.set(x, Y(y), h[0]);
    if (curly) bumpy(L, -1);
    return L.outline();
  }
  const cxx = view === 'right' ? 16.5 : 15.5;
  const extra = curly ? 1.6 : 1;
  for (let r = 2; r <= 10; r++) {
    const hw = (HEAD_ROWS[r] ?? 3) + extra;
    for (let x = Math.round(cxx - hw + 0.5); x <= Math.round(cxx + hw - 0.5); x++) {
      // 넘긴 머리: 이마 가운데는 9줄부터 드러남
      if (!curly && r >= 9 && (view === 'down' ? x >= 11 && x <= 20 : x >= 18)) continue;
      L.set(x, Y(r), top(x, Y(r), (x + 0.5 - cxx) / 9, (r - 10) / 9));
    }
  }
  if (view === 'down') {
    if (curly) {
      // 곱슬 앞머리와 귀 옆으로 늘어진 곱슬 옆머리
      for (const [x, n] of [[9, 2], [10, 3], [12, 2], [13, 3], [15, 2], [17, 3], [18, 2], [20, 3], [21, 2], [22, 2]]) for (let k = 0; k < n; k++) L.set(x, Y(11) + k, k === n - 1 ? h[3] : x < 16 ? h[1] : h[2]);
      const side = p.sideLen ?? 22;
      for (const x0 of [6, 23]) L.rect(x0, Y(10), x0 + 2, Y(side), (x, y) => ((x + y) % 3 === 0 ? h[2] : (x + y) % 3 === 1 && x0 === 6 ? h[0] : h[1]));
      for (const [x, y] of [[11, 1], [15, 1], [20, 1]]) L.set(x, Y(y), h[1]);
    } else {
      // 넘긴 머리: 결을 따라 뒤로 빗은 줄, 짧은 구레나룻
      L.rect(8, Y(11), 8, Y(13), h[2]);
      L.rect(23, Y(11), 23, Y(13), h[3]);
      if (p.sideGrey) for (const x of [8, 23]) L.set(x, Y(12), p.sideGrey);
      for (const [x, y] of [[12, 5], [13, 6], [18, 5], [19, 6], [16, 7]]) L.paint(x, Y(y), h[3]);
    }
    for (const [x, y] of [[10, 6], [11, 5], [12, 4], [13, 4], [14, 4], [15, 3]]) L.set(x, Y(y), h[0]);
  } else {
    L.ellipse(g.cx - 0.3, cy - 0.6, g.rx + 0.5 + (curly ? 0.8 : 0), g.ry + 0.4, (x, y, nx, ny) => (y <= Y(10) || (x <= 14 && y <= Y(curly ? (p.sideLen ?? 22) : 15)) ? top(x, y, nx, ny) : null));
    if (curly) for (const [x, n] of [[18, 2], [20, 3], [22, 2], [24, 1]]) for (let k = 0; k < n; k++) L.set(x, Y(11) + k, k === n - 1 ? h[3] : h[1]);
    else if (p.sideGrey) L.set(14, Y(13), p.sideGrey);
    for (const [x, y] of [[11, 8], [12, 9], [16, 6], [17, 7]]) L.paint(x, Y(y), h[3]);
    for (const [x, y] of [[13, 5], [14, 4], [15, 4], [16, 4], [12, 6]]) L.set(x, Y(y), h[0]);
  }
  if (curly) bumpy(L, -1);
  return L.outline();
}

// =====================================================================
// 머리에 쓰는 것: 두건(hood), 투구(helmet), 관(crown, mitre, circlet), 보호 안경, 가면, 복면
// =====================================================================
function drawHeadwear(p, view, dy) {
  const L = new Layer();
  const Y = (n) => n + dy;
  const side = view === 'right';
  if (p.hood) {
    const c = p.hood;
    const H = new Layer();
    if (view === 'up') {
      H.ellipse(15.5, Y(11), 10, 10.2, (x, y, nx, ny) => shN(c, nx, ny, 0.1));
      H.trap(Y(19), Y(26), 7, 24, 5, 26, (x, y, t) => sh(c, t));
      H.rect(15, Y(27), 16, Y(28), c[2]);
    } else if (side) {
      H.ellipse(15, Y(11), 9.6, 10.2, (x, y, nx, ny) => (x >= 18 && y >= Y(10) && y <= Y(21) ? null : shN(c, nx, ny, 0.25)));
      H.trap(Y(19), Y(25), 8, 18, 7, 20, (x, y, t) => sh(c, t, 0.3, 0.75));
    } else {
      H.ellipse(15.5, Y(11), 10, 10.2, (x, y, nx, ny) => (y >= Y(10) && x >= 9 && x <= 22 ? null : shN(c, nx, ny, 0.25)));
      H.trap(Y(20), Y(25), 7, 24, 5, 26, (x, y, t) => sh(c, t));
    }
    H.outline();
    if (view !== 'up') {
      // 두건 테두리 안쪽 그늘 (이마 위)
      const xs = side ? [18, 19, 20, 21, 22, 23, 24] : [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
      for (const x of xs) H.set(x, Y(10), c[2]);
      if (p.hoodShade) {
        // 그림자 진 얼굴: 어둡게 덮고 눈만 희미하게 빛남
        const face = side ? [[18, 24]] : [[9, 22]];
        for (let y = Y(11); y <= Y(19); y++)
          for (let x = face[0][0]; x <= face[0][1]; x++) {
            const r = HEAD_ROWS[y - dy];
            const cx = side ? 16.5 : 15.5;
            if (r && Math.abs(x + 0.5 - cx) <= r) H.set(x, y, y <= Y(13) ? R.slate[3] : R.slate[2]);
          }
        const eyes = side ? [[21, 15]] : [[12, 15], [19, 15]];
        for (const [x, y] of eyes) {
          H.set(x, Y(y), p.eyeGlow?.[0] ?? R.white[0]);
          H.set(x + 1, Y(y), p.eyeGlow?.[1] ?? R.sky[1]);
        }
      }
    }
    L.over(H);
  }
  if (p.mask && view !== 'up') {
    // 흰 가면 (눈구멍만)
    const M = new Layer();
    const m = R.white;
    if (side) M.ellipse(20, Y(15), 4.4, 5, (x, y, nx, ny) => (x < 17 ? null : shN(m.slice(1, 4), nx, ny, 0.3)));
    else M.ellipse(15.5, Y(15), 5.8, 5.2, (x, y, nx, ny) => shN(m.slice(1, 4), nx, ny, 0.3));
    M.outline({ color: m[3] });
    for (const [x, y] of side ? [[21, 14]] : [[12, 14], [18, 14]]) {
      M.set(x, Y(y), R.slate[2]);
      M.set(x + 1, Y(y), R.slate[2]);
      M.set(x + (side ? 1 : x < 16 ? 1 : 0), Y(y), R.sky[0]);
    }
    L.over(M);
  }
  if (p.faceCloth && view !== 'up') {
    // 코 아래를 가린 복면
    const c = p.faceCloth;
    const F = new Layer();
    if (side) F.rect(17, Y(16), 25, Y(19), (x, y) => (y === Y(16) ? c[0] : c[1]));
    else F.trap(Y(16), Y(20), 9, 22, 10, 21, (x, y, t) => (y === Y(16) ? c[0] : sh(c, t)));
    F.outline();
    L.over(F);
  }
  if (p.helmet) {
    const m = p.helmet.ramp ?? R.silver;
    const pl = p.helmet.plume;
    const H = new Layer();
    if (view === 'up') {
      H.ellipse(15.5, Y(10.5), 8.8, 8.6, (x, y, nx, ny) => shN(m.slice(1, 4), nx, ny, 0.1));
    } else {
      const cx = side ? 16 : 15.5;
      H.ellipse(cx, Y(10), 8.8, 7.6, (x, y, nx, ny) => (y <= Y(11) ? shN(m.slice(1, 4), nx, ny, 0.3) : null));
      // 뺨 가리개, 코 가리개
      if (side) {
        H.rect(10, Y(11), 13, Y(16), (x) => (x === 10 ? m[3] : m[2]));
        if (p.helmet.nose) H.rect(23, Y(11), 24, Y(15), m[1]);
      } else {
        H.rect(7, Y(11), 8, Y(16), m[2]);
        H.rect(23, Y(11), 24, Y(16), m[3]);
        if (p.helmet.nose) H.rect(15, Y(11), 16, Y(15), (x) => (x === 15 ? m[1] : m[2]));
      }
    }
    H.outline();
    // 이마 띠, 반짝임
    if (view !== 'up') for (let x = 0; x < 32; x++) H.paint(x, Y(11), m[2]);
    for (const [x, y] of side ? [[13, 4], [14, 3], [15, 3]] : [[10, 6], [11, 5], [12, 4]]) H.paint(x, Y(y), m[0]);
    if (pl) {
      // 깃털 장식 (투구 꼭대기에서 뒤로)
      const P = new Layer();
      if (view === 'up') P.rect(14, Y(1), 17, Y(14), (x, y) => (x === 14 ? pl[0] : x === 17 ? pl[2] : pl[1]));
      else if (side) P.trap(Y(0), Y(5), 12, 17, 9, 13, (x, y, t) => (t < 0.3 ? pl[0] : t > 0.7 ? pl[2] : pl[1]));
      else P.rect(14, Y(0), 17, Y(4), (x, y) => (x === 14 || y === Y(0) ? pl[0] : x === 17 ? pl[2] : pl[1]));
      P.outline();
      H.over(P);
    }
    L.over(H);
  }
  if (p.crown) {
    // 금관과 붉은 보석
    const g = R.gold;
    const C = new Layer();
    const [l, r] = side ? [10, 22] : [9, 22];
    C.rect(l, Y(4), r, Y(6), (x, y) => (y === Y(4) ? g[0] : x > 18 ? g[2] : g[1]));
    for (const x of side ? [11, 15, 19, 22] : [9, 12, 15, 16, 19, 22]) C.rect(x, Y(2), x, Y(3), g[1]);
    C.outline();
    for (const x of side ? [20] : [15, 16]) C.set(x, Y(5), R.red[1]);
    L.over(C);
  }
  if (p.mitre) {
    // 높은 흰 관 (대주교), 가운데 금 띠
    const w = R.white;
    const C = new Layer();
    if (side) C.trap(0, Y(8), 14, 17, 10, 21, (x, y, t) => (t < 0.3 ? w[0] : t > 0.75 ? w[2] : w[1]));
    else C.trap(0, Y(8), 13, 18, 9, 22, (x, y, t) => (t < 0.3 ? w[0] : t > 0.75 ? w[2] : w[1]));
    C.outline();
    for (let y = 1; y <= Y(8); y++) C.paint(side ? 17 : 15, y, R.gold[1]), C.paint(side ? 18 : 16, y, R.gold[2]);
    for (let x = 0; x < 32; x++) C.paint(x, Y(8), R.gold[1]);
    L.over(C);
  }
  if (p.circlet && view !== 'up') {
    // 이마의 검은 장식 관과 보라 보석
    for (let x = side ? 13 : 8; x <= 23; x++) L.set(x, Y(8), R.slate[1]);
    for (const x of side ? [22] : [15, 16]) L.set(x, Y(8), R.violet[0]);
  }
  if (p.goggles) {
    // 이마에 올린 보호 안경
    const G = new Layer();
    for (let x = side ? 11 : 8; x <= 23; x++) G.set(x, Y(7), R.wood[2]);
    for (const cx of side ? [20] : [12, 19]) {
      G.rect(cx - 1, Y(6), cx + 1, Y(8), R.gold[2]);
      G.set(cx, Y(7), R.sky[0]);
      G.set(cx - 1, Y(6), R.gold[1]);
    }
    if (view !== 'up') L.over(G);
  }
  return L;
}

/** 수염·콧수염 */
function drawBeard(p, view, dy) {
  const L = new Layer();
  if (view === 'up') return L;
  const Y = (n) => n + dy;
  const side = view === 'right';
  if (p.beard) {
    const b = p.beard;
    const len = p.beardLen ?? 2;
    if (side) L.trap(Y(15), Y(19 + len), 17, 24, 18, 22, (x, y, t) => ((x + y) % 4 === 0 ? b[2] : t < 0.3 ? b[0] : b[1]));
    else L.trap(Y(15), Y(19 + len), 9, 22, 12, 19, (x, y, t) => ((x + y) % 4 === 0 ? b[2] : t < 0.2 ? b[0] : t > 0.8 ? b[2] : b[1]));
    // 입 자리 (수염 사이로 보이는 입)
    if (!side) for (let x = 11; x <= 20; x++) for (let y = Y(15); y <= Y(16); y++) if (x > 10 && x < 21) L.clear(x, y);
    L.outline();
    if (!side) L.set(15, Y(18), p.skin[3]), L.set(16, Y(18), p.skin[3]);
  }
  if (p.moustache) {
    const m = p.moustache;
    const M = new Layer();
    if (side) M.rect(20, Y(17), 24, Y(17), m[1]);
    else {
      M.rect(12, Y(17), 19, Y(17), (x) => (x < 16 ? m[0] : m[1]));
      M.set(12, Y(18), m[1]);
      M.set(19, Y(18), m[1]);
    }
    M.outline({ steps: 1 });
    L.over(M);
  }
  return L;
}

/** 늑대 귀 */
function drawEars(p, view, dy) {
  const L = new Layer();
  if (!p.ears) return L;
  const h = p.earRamp ?? p.hair;
  const Y = (n) => n + dy;
  const tri = (cx, tip, base, hw, c) => {
    for (let y = tip; y <= base; y++) {
      const w = ((y - tip) / Math.max(1, base - tip)) * hw;
      L.rect(Math.round(cx - w), y, Math.round(cx + w), y, typeof c === 'function' ? (x) => c(x, y) : c);
    }
  };
  const xs = view === 'right' ? [12.5] : [9.5, 21.5];
  for (const cx of xs) tri(cx, Y(-1), Y(6), 2.6, (x) => (x < cx ? h[1] : h[2]));
  L.outline();
  if (view !== 'up') for (const cx of xs) tri(cx + (view === 'right' ? 0.5 : 0), Y(2), Y(5), 0.9, p.skin[2]);
  return L;
}

/** 꼬리 (앞 보기: 몸 옆으로, 뒤 보기: 몸 앞으로) */
function drawTail(p, view, dy, sway = 0) {
  const L = new Layer();
  if (!p.tail) return L;
  const h = p.earRamp ?? p.hair;
  const Y = (n) => n + dy;
  const fur = (x, y, nx, ny) => (ny > 0.55 ? h[0] : shN(h.slice(0, 3), nx, ny, 0.2));
  if (view === 'up') {
    L.ellipse(16, Y(33), 2.6, 3, fur);
    L.ellipse(16 + sway, Y(38), 3.6, 5, fur);
  } else if (view === 'right') {
    L.ellipse(10, Y(33), 3, 2.4, fur);
    L.ellipse(6 - Math.abs(sway), Y(35), 3.4, 3, fur);
  } else {
    L.ellipse(23.5, Y(33), 2.4, 3, fur);
    L.ellipse(25.5 + sway, Y(37.5), 3, 4, fur);
  }
  return L.outline();
}

// =====================================================================
// 손에 든 물건 (필드): 창, 지팡이, 망치, 활, 방패, 바구니, 칼(허리·등), 단검
// 오른손 물건은 앞 보기에서 화면 왼쪽, 왼손 물건(방패, 활)은 화면 오른쪽
// back: 몸 뒤에 그릴 것, front: 몸 앞에 그릴 것
// =====================================================================
function pole(L, x, top, bottom, ramp) {
  for (let y = top; y <= bottom; y++) {
    L.set(x, y, ramp[1]);
    L.set(x + 1, y, ramp[2]);
  }
}
function drawHeld(p, view, dy, battle = false) {
  const back = new Layer();
  const front = new Layer();
  const Y = (n) => n + dy;
  const side = view === 'right';
  const up = view === 'up';
  const W = p.wide ?? 0;
  // 오른손 위치 (앞: 화면 왼쪽, 뒤: 화면 오른쪽, 옆: 가까운 손)
  const rx = side ? 15 : up ? 23 + W : 8 - W;
  const lx = side ? 13 : up ? 8 - W : 23 + W;
  const hy = Y(30);
  const hand = (L, x) => {
    const H = new Layer();
    H.rect(x - 1, hy, x + 1, hy + 2, (xx, yy) => (xx === x - 1 && yy === hy ? p.glove[0] : p.glove[1]));
    H.outline(p.glow ? { color: p.glow } : {});
    L.over(H);
  };
  for (const kind of p.held ?? []) {
    if (battle && !['shield', 'kiteShield', 'quiver'].includes(kind)) continue;
    const T = new Layer();
    let into = front;
    if (kind === 'spear' || kind.startsWith('staff')) {
      const x = side ? 18 : rx - (up ? 0 : 1);
      const ramp = { spear: R.wood, staff_wood: R.wood, staff_gold: R.gold, staff_twisted: R.violet.slice(1), staff_moon: R.slate, staff_scepter: R.gold }[kind];
      const topY = kind === 'spear' ? Y(4) : Y(8);
      if (kind === 'staff_twisted') {
        // 뒤틀린 지팡이: 흔들리는 줄기, 끝에 떠 있는 보라 구슬
        for (let y = topY; y <= FOOT - 1; y++) {
          const xx = x + ((y >> 2) % 2);
          T.set(xx, y, ramp[1]);
          T.set(xx + 1, y, ramp[2]);
        }
        T.rect(x - 1, topY, x + 2, topY + 1, ramp[1]);
        T.outline();
        T.ellipse(x + 1, topY - 4, 2.4, 2.4, (xx, yy, nx, ny) => shN([R.violet[0], R.violet[1], R.violet[2]], nx, ny, 0.3));
        T.set(x, topY - 5, R.white[0]);
      } else {
        pole(T, x, topY, FOOT - 1, ramp);
        if (kind === 'spear') {
          // 은 창날
          T.trap(Y(-1), Y(4), x, x + 1, x - 1, x + 2, (xx, yy, t) => (t < 0.5 ? R.silver[0] : R.silver[2]));
          T.set(x - 1, Y(5), R.red[1]);
          T.set(x + 2, Y(5), R.red[1]);
        }
        if (kind === 'staff_gold') {
          // 금 십자 머리
          T.rect(x - 2, topY - 3, x + 3, topY - 2, R.gold[1]);
          T.rect(x, topY - 6, x + 1, topY, R.gold[1]);
        }
        if (kind === 'staff_wood') {
          // 굽은 머리와 뼈 장식
          T.rect(x - 2, topY - 2, x + 1, topY - 1, R.wood[1]);
          T.rect(x - 2, topY, x - 2, topY + 1, R.wood[2]);
          T.rect(x + 2, topY + 2, x + 2, topY + 5, R.ivory[1]);
        }
        if (kind === 'staff_moon') {
          // 초승달과 별
          for (const [xx, yy] of [[x - 2, -5], [x - 2, -4], [x - 1, -6], [x - 1, -3], [x, -7], [x, -2], [x + 1, -7]]) T.set(xx, topY + yy, R.gold[1]);
          T.set(x + 2, topY - 4, R.white[0]);
        }
        if (kind === 'staff_scepter') {
          T.ellipse(x + 1, topY - 2, 2.2, 2.2, (xx, yy, nx, ny) => shN(R.red, nx, ny, 0.3));
          T.rect(x - 1, topY, x + 2, topY, R.gold[1]);
        }
        T.outline();
      }
      // 옆 보기: 긴 막대는 얼굴을 가리지 않게 머리·몸 뒤로 (손만 앞에)
      if (side) {
        back.over(T);
        hand(front, 18);
        continue;
      }
      hand(T, rx);
    } else if (kind === 'hammer' || kind === 'runeHammer') {
      const x = side ? 16 : rx;
      pole(T, x, hy + 1, hy + 7, R.wood);
      T.rect(x - 3, hy + 7, x + 4, hy + 10, (xx, yy) => (yy === hy + 7 ? R.ash[0] : R.ash[1]));
      T.outline();
      if (kind === 'runeHammer') for (const xx of [x - 2, x, x + 2]) T.set(xx, hy + 9, R.sky[0]);
      hand(T, x);
    } else if (kind === 'bow') {
      // 활은 왼손. 옆 보기는 몸 뒤
      const x = side ? 12 : lx + (up ? -2 : 2);
      const dir = up ? 1 : side ? -1 : 1;
      for (let y = Y(17); y <= Y(41); y++) {
        const k = (y - Y(17)) / 24;
        T.set(x + dir * Math.round(3 * Math.sin(Math.PI * k)), y, k < 0.5 ? R.wood[1] : R.wood[2]);
      }
      T.outline();
      for (let y = Y(18); y <= Y(40); y++) T.set(x, y, R.sand[0]);
      if (side) into = back;
      else hand(T, lx);
    } else if (kind === 'quiver') {
      // 화살통 (등)
      const x = up ? 18 : side ? 10 : 18;
      T.rect(x, Y(20), x + 3, Y(31), (xx) => (xx === x ? R.wood[0] : R.wood[1]));
      for (const xx of [x, x + 2]) T.rect(xx, Y(17), xx + 1, Y(19), R.white[1]);
      T.outline();
      into = up ? front : back;
    } else if (kind === 'shield' || kind === 'kiteShield') {
      const kite = kind === 'kiteShield';
      const face = kite ? [R.ash[0], R.slate[0], R.slate[1]] : [R.white[0], R.white[1], R.white[2]];
      if (side) {
        // 옆: 몸 뒤에 방패 가장자리
        T.rect(9, Y(21), 12, Y(38), (xx) => (xx === 9 ? R.gold[2] : face[2]));
        into = back;
      } else {
        const cx = lx + (up ? -1 : 1);
        if (kite) T.trap(Y(21), Y(38), cx - 5, cx + 5, cx, cx, (xx, yy, t, k) => (k < 0.55 ? (t < 0.3 ? face[0] : face[1]) : t < 0.5 ? face[1] : face[2]));
        else T.ellipse(cx, Y(29.5), 5.6, 8, (xx, yy, nx, ny) => shN(face, nx, ny, 0.3));
        T.outline({ color: kite ? R.white[3] : R.gold[3] });
        if (!up) {
          if (kite) {
            T.rect(cx, Y(23), cx, Y(34), R.white[1]);
            T.rect(cx - 3, Y(26), cx + 3, Y(26), R.white[1]);
          } else {
            // 금빛 태양 문양
            T.ellipse(cx, Y(29.5), 2.2, 2.2, R.gold[1]);
            for (const [ddx, ddy] of [[0, -4], [0, 4], [-4, 0], [4, 0], [-3, -3], [3, 3], [3, -3], [-3, 3]]) T.set(cx + ddx, Y(29.5) + ddy, R.gold[2]);
            T.set(cx - 1, Y(28.5), R.gold[0]);
          }
        }
        into = front;
      }
    } else if (kind === 'basket') {
      const x = side ? 16 : rx;
      T.rect(x - 4, hy + 1, x + 3, hy + 5, (xx, yy) => ((xx + yy) % 2 ? R.wood[1] : R.wood[0]));
      T.rect(x - 3, hy - 2, x + 2, hy - 2, R.wood[2]);
      T.set(x - 4, hy - 1, R.wood[2]);
      T.set(x + 3, hy - 1, R.wood[2]);
      T.rect(x - 2, hy, x + 1, hy, R.white[1]);
      T.outline();
      hand(T, x);
    } else if (kind === 'dagger' || kind === 'darkdagger') {
      const x = side ? 16 : rx;
      const b = kind === 'dagger' ? R.silver : R.violet;
      T.rect(x, hy + 3, x, hy + 7, b[0]);
      T.rect(x + 1, hy + 3, x + 1, hy + 6, b[2]);
      T.rect(x - 1, hy + 2, x + 2, hy + 2, R.wood[2]);
      T.outline();
      hand(T, x);
    } else if (kind === 'swordHip') {
      // 허리에 찬 칼 (왼쪽 허리)
      const [a, b, hx2] = side ? [[14, Y(31)], [8, Y(38)], 15] : up ? [[10, Y(31)], [6, Y(40)], 11] : [[21, Y(31)], [25, Y(40)], 20];
      T.line(a[0], a[1], b[0], b[1], R.slate[1], 2);
      T.outline();
      T.rect(hx2, Y(29), hx2 + 1, Y(30), R.gold[1]);
      into = side ? back : front;
    } else if (kind === 'swordBack' || kind === 'greatswordBack') {
      // 등에 멘 칼: 앞 보기는 어깨 위로 손잡이만, 뒤 보기는 칼 전체
      const big = kind === 'greatswordBack';
      const blade = big ? [R.silver[0], R.silver[1], R.silver[2]] : [R.slate[0], R.slate[1], R.slate[2]];
      const [a, b] = up ? [[7, Y(7)], [24, Y(big ? 42 : 38)]] : side ? [[10, Y(6)], [12, Y(big ? 42 : 38)]] : [[24, Y(7)], [7, Y(big ? 42 : 38)]];
      T.line(a[0], a[1] + 4, b[0], b[1], (t) => (t < 0.5 ? blade[0] : blade[1]), big ? 3 : 2);
      T.line(a[0], a[1], a[0] + (b[0] - a[0]) * 0.1, a[1] + 4, R.wood[1], 2);
      T.outline();
      const gx = a[0] + (b[0] - a[0]) * 0.13;
      T.line(gx - 2, a[1] + 5, gx + 2, a[1] + 4, R.gold[1], 1);
      into = up ? front : back;
    }
    into.over(T);
  }
  return { back, front };
}

/** 옷 위 장식 (몸통 그림 L 위에). hem: 자락 아랫줄 */
function decorate(p, view, dy, L, hem) {
  const y0 = 20 + dy;
  const side = view === 'right';
  const up = view === 'up';
  const down = view === 'down';
  const inside = (x, y) => L.get(x, y) && L.get(x - 1, y) && L.get(x + 1, y);
  const P = (x, y, c) => inside(x, y) && L.set(x, y, c);
  const W = p.wide ?? 0;
  const c = p.cloth;
  if (p.armor) {
    // 판금: 가로 이음매, 가운데 밝은 줄
    for (let x = 0; x < 32; x++) for (const y of [y0 + 5, y0 + 9]) P(x, y, c[2]);
    if (!side) for (let y = y0 + 2; y <= y0 + 9; y++) P(15, y, c[0]);
  }
  if (p.apron && !up) {
    const a = p.apron;
    const [l, r] = side ? [18, 20] : [11 - W, 20 + W];
    const bottom = 40 + dy;
    L.rect(l, y0 + 4, r, bottom, (x, y) => (x === l || x === r || y === bottom ? a[3] : x === l + 1 ? a[0] : y === y0 + 9 ? a[2] : a[1]));
    if (!side) for (const x of [12, 19]) L.rect(x, y0, x, y0 + 3, a[2]);
    if (p.apronRunes) for (const [x, y] of side ? [[19, 8], [19, 13]] : [[13, 8], [17, 11], [15, 14]]) L.set(x, y0 + y, R.sky[0]);
  }
  if (p.outer && !up) {
    // 겹쳐 입은 겉옷 (앞이 트임): 양옆을 겉옷 색으로
    const o = p.outer;
    for (let y = y0; y <= hem; y++) for (let x = 0; x < 32; x++) if (L.get(x, y) && (side ? x <= 14 : x <= 12 || x >= 19)) L.set(x, y, (side ? x === 14 : x === 12 || x === 19) ? o[2] : o[1]);
  }
  if (p.tabard) {
    const t = p.tabard;
    const [l, r] = side ? [17, 19] : [13, 18];
    for (let y = y0 + 2; y <= hem - 1; y++) for (let x = l; x <= r; x++) if (L.get(x, y)) L.set(x, y, x === l ? t[0] : x === r ? t[2] : t[1]);
    if (down && p.crossColor) {
      L.rect(15, y0 + 4, 16, y0 + 11, (x) => (x === 15 ? p.crossColor[0] : p.crossColor[1]));
      L.rect(13, y0 + 6, 18, y0 + 6, p.crossColor[1]);
    }
  } else if (p.crossColor && down) {
    // 가슴의 십자 문양
    L.rect(15, y0 + 3, 16, y0 + 9, (x) => (x === 15 ? p.crossColor[0] : p.crossColor[1]));
    L.rect(13, y0 + 5, 18, y0 + 5, p.crossColor[1]);
  } else if (p.crossColor && side) L.rect(18, y0 + 3, 18, y0 + 8, p.crossColor[1]);
  if (p.fur) {
    // 흰 털 깃
    const f = R.white;
    const [l, r] = side ? [13, 20] : [9, 22];
    for (let x = l; x <= r; x++) for (let y = y0 - 1; y <= y0 + (x % 2 ? 2 : 1); y++) L.set(x, y, y === y0 - 1 ? f[0] : (x + y) % 3 === 0 ? f[2] : f[1]);
  }
  if (p.scarf && !up) {
    const s = p.scarf;
    const [l, r] = side ? [14, 20] : [10, 21];
    for (let x = l; x <= r; x++) for (let y = y0 - 1; y <= y0 + 1; y++) L.set(x, y, y === y0 - 1 ? s[0] : x % 3 === 0 ? s[2] : s[1]);
    if (down) L.rect(11, y0 + 2, 12, y0 + 6, (x) => (x === 11 ? s[1] : s[2]));
  }
  if (p.sash) {
    const s = p.sash;
    const [a, b] = side ? [[14, y0 + 1], [19, y0 + 8]] : up ? [[21, y0 + 1], [10, y0 + 11]] : [[10, y0 + 1], [21, y0 + 11]];
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const x = a[0] + ((b[0] - a[0]) * i) / n;
      const y = a[1] + ((b[1] - a[1]) * i) / n;
      if (L.get(x, y)) L.set(x, y, s[1]);
      if (L.get(x, y + 1)) L.set(x, y + 1, s[2]);
    }
  }
  if (p.stole && !up) for (let y = y0; y <= hem - 1; y++) for (const x of side ? [18] : [12, 19]) if (L.get(x, y)) L.set(x, y, y % 4 === 0 ? R.gold[0] : R.gold[1]);
  if (p.royalBand && !up) {
    for (let y = y0 + 2; y <= hem - 1; y++) for (const x of side ? [18, 19] : [14, 15, 16, 17]) if (L.get(x, y)) L.set(x, y, side ? R.gold[1] : x === 14 ? R.gold[0] : x === 17 ? R.gold[2] : (y + x) % 4 === 0 ? R.red[1] : R.gold[1]);
  }
  if (p.starRobe) for (let y = y0 + 2; y <= hem - 1; y++) for (const x of side ? [14] : [11, 20]) if (L.get(x, y)) L.set(x, y, y % 4 === 0 ? R.white[1] : R.white[3]);
  if (p.star && down) {
    for (const [x, y] of [[15, 3], [16, 3], [14, 4], [15, 4], [16, 4], [17, 4], [15, 5], [16, 5], [14, 6], [17, 6]]) L.set(x, y0 + y, y === 3 ? R.violet[0] : R.violet[1]);
  }
  if (p.runes && !up) for (const [x, y] of side ? [[18, 4], [17, 8], [18, 12]] : [[12, 4], [19, 4], [13, 7], [18, 7], [15, 10], [16, 10]]) if (L.get(x, y0 + y)) L.set(x, y0 + y, (x + y) % 2 ? p.runes[0] : p.runes[1]);
  if (p.chains) {
    const ch = p.chains;
    const lines = side ? [[[12, y0 + 2], [19, y0 + 10]]] : [[[9, y0 + 2], [22, y0 + 12]], [[22, y0 + 3], [9, y0 + 13]]];
    for (const [a, b] of lines)
      for (let i = 0; i <= 20; i++) {
        const x = a[0] + ((b[0] - a[0]) * i) / 20;
        const y = a[1] + ((b[1] - a[1]) * i) / 20;
        if (L.get(x, y)) L.set(x, y, i % 3 === 0 ? ch[0] : i % 3 === 1 ? ch[1] : ch[2]);
      }
  }
  if (p.necklace && !up) {
    const kind = p.necklace;
    for (let x = side ? 16 : 11; x <= (side ? 19 : 20); x++) {
      const y = side ? y0 + 2 + (x - 16) * 0.5 : y0 + 1 + Math.round(2 * Math.sin((Math.PI * (x - 11)) / 9));
      const col = kind === 'teeth' ? (x % 2 ? R.ivory[0] : R.wood[2]) : kind === 'beads' ? (x % 2 ? R.red[1] : R.sand[0]) : R.gold[x % 2];
      L.set(x, y, col);
      if (kind === 'teeth' && x % 2) L.set(x, y + 1, R.ivory[2]);
    }
  }
  if (p.eyePendant && down) {
    L.set(14, y0 + 2, R.gold[2]);
    L.set(17, y0 + 2, R.gold[2]);
    L.rect(15, y0 + 3, 16, y0 + 4, (x, y) => (y === y0 + 3 ? R.white[0] : R.sky[1]));
  }
  if (p.goldTrim && !up) {
    // 장식 끈, 훈장, 아랫단 금 테두리
    if (down) {
      L.line(21, y0 + 1, 17, y0 + 5, R.gold[1]);
      L.line(21, y0 + 2, 18, y0 + 7, R.gold[2]);
      L.set(12, y0 + 4, R.gold[0]);
      L.set(12, y0 + 5, R.red[1]);
    }
    for (let x = 0; x < 32; x++) if (L.get(x, hem - 1) && L.get(x, hem - 2)) L.set(x, hem - 1, R.gold[1]);
  }
  if (p.epaulettes) {
    const e = R.silver;
    for (const [l, r] of side ? [[14, 18]] : [[7 - W, 11 - W], [20 + W, 24 + W]]) {
      L.rect(l, y0, r, y0 + 1, (x, y) => (y === y0 ? e[0] : e[1]));
      for (let x = l; x <= r; x += 2) L.set(x, y0 + 2, e[2]);
    }
  }
  if (p.ropes) for (const y of [y0 + 3, y0 + 7]) for (let x = 0; x < 32; x++) if (L.get(x, y)) L.set(x, y, x % 3 ? R.sand[1] : R.sand[3]);
  if (p.hemTrim) for (let x = 0; x < 32; x++) if (L.get(x, hem) && L.get(x, hem - 1)) L.set(x, hem, p.hemTrim[1]);
  if (p.belt && p.dress) {
    const b = p.belt;
    for (let x = 0; x < 32; x++) for (const y of [30 + dy, 31 + dy]) if (L.get(x, y) && L.get(x, y - 2)) L.set(x, y, y === 30 + dy ? b[1] : b[2]);
    if (p.pouch && !up) L.rect(side ? 13 : 18, 31 + dy, side ? 15 : 20, 34 + dy, (x, y) => (y === 31 + dy ? R.wood[0] : R.wood[1]));
  }
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
    // 갈리아의 큰 검: 길고 넓은 날
    greatsword: { len: 22, wide: true, blade: [R.silver[0], R.silver[1], R.silver[2]], hilt: R.gold },
    // 4막 레온 각인 무기: 날에 하늘색 룬
    runesword: { len: 17, blade: [R.silver[0], R.silver[1], R.silver[2]], hilt: R.gold, rune: R.sky[0] },
    // 그노시스회 하수인: 검보라 단검
    darkdagger: { len: 8, blade: [R.violet[0], R.violet[1], R.violet[2]], hilt: R.slate },
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
    if (W.wide && i < W.len - 1) L.set(x + sa * 0.9, y - ca * 0.9, W.blade[1]);
  }
  // 십자 날밑, 손잡이
  const gw = W.wide ? 3 : 2;
  for (let k = -gw; k <= gw; k++) L.set(hx + ca * 2 - sa * k, hy + sa * 2 + ca * k, k === 0 ? W.hilt[0] : W.hilt[1]);
  L.set(hx, hy, W.hilt[2]);
  L.set(hx - ca, hy - sa, W.hilt[1]);
  L.outline();
  // 칼끝 반짝임, 룬
  L.set(hx + ca * (W.len - 4), hy + sa * (W.len - 4), W.blade[0]);
  if (W.rune) for (const i of [5, 8, 11]) L.set(hx + ca * i, hy + sa * i, W.rune);
  return L;
}

// =====================================================================
// 한 칸 그리기
// =====================================================================
/**
 * o: { dy(몸 출렁임), step, swing, lift(다리 당김), arms(전투 팔: [{from,to}]), battle(손에 든 물건 숨김) }
 * view: 'down' | 'up' | 'right' | 'left'
 */
export function drawPerson(id, view, o = {}) {
  const p = PEOPLE[id];
  const flip = view === 'left';
  const v = flip ? 'right' : view;
  const drop = p.drop ?? 0; // 키 차이: 머리·몸을 이만큼 내림
  const dy = (o.dy ?? 0) + drop;
  const sway = o.sway ?? 0;
  const flare = o.flare ?? 0;
  const out = new Layer();
  const parts = [];

  const held = drawHeld(p, v, dy, !!o.battle);
  parts.push(held.back);
  if (v !== 'up') parts.push(drawTail(p, v, dy, v === 'right' ? flare : sway));
  parts.push(drawCape(p, v, dy, sway, flare));
  parts.push(drawHairBack(p, v, dy, v === 'right' ? flare : sway));
  // 옆·뒤 보기: 몸 뒤쪽 팔
  parts.push(drawLegs(p, v, { step: o.step, lift: o.lift, drop }));
  const body = drawBody(p, v, dy, sway, flare, o.step);
  const arms = o.arms ? o.arms.map((a) => drawArm(p, [a.from[0], a.from[1] + drop], [a.to[0], a.to[1] + drop])) : standArms(p, v, dy, o.swing ?? 0);
  if (v === 'up') {
    parts.push(...arms);
    parts.push(body);
  } else {
    parts.push(body);
  }
  parts.push(drawCapelet(p, v, dy));
  if (v === 'up' && p.hairStyle === 'long' && !p.hood) parts.push(drawHairBack(p, v, dy, sway));
  if (v === 'up') parts.push(drawPauldron(p, v, dy));
  // 얼굴·머리: 인물마다 손으로 정한 얼굴 지도 (hd/faces/{id}.mjs, 수염·늑대 귀 포함)
  const faceId = p.face ?? (FACES[id] ? id : null);
  if (faceId) parts.push(drawFaceMap(p, faceId, v, dy));
  else {
    const head = drawHead(p, v, dy);
    drawFace(p, v, dy, head);
    parts.push(head);
    parts.push(drawBeard(p, v, dy));
    parts.push(drawHairFront(p, v, dy));
    parts.push(drawEars(p, v, dy));
  }
  parts.push(drawHeadwear(p, v, dy));
  parts.push(drawHairOver(p, v, dy));
  if (v !== 'up') {
    parts.push(...arms.filter((a) => a));
    parts.push(drawPauldron(p, v, dy));
  }
  parts.push(held.front);
  if (v === 'up') parts.push(drawTail(p, v, dy, sway));
  if (o.weapon) parts.push(o.weapon);
  for (const l of parts) out.over(l);
  let res = flip ? out.flipX() : out;
  if (p.pauldron && (flip || (p.pauldron === 'both' && v === 'right'))) {
    // 왼쪽을 보면 왼쪽 어깨(은 갑옷)가 앞에 보임. 양쪽 어깨 갑옷은 오른쪽 보기에도
    res.over(flip ? drawPauldronSide(p, dy).flipX() : drawPauldronSide(p, dy));
  }
  return res;
}

export { R as RAMPS_USED, darker };
