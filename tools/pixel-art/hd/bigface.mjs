// 큰 머리용 얼굴 지도 (docs/도트기준.md 2절 "얼굴")
// 얼굴은 인물마다 tools/pixel-art/hd/faces/{id}.mjs 의 big 에 고해상도 글자 격자로 둔다(1글자 = 그림 한 칸).
//   big: { down: { at: [x, y], rows: [...] }, right: { at: [x, y], rows: [...] } }
//   at: 격자 왼쪽 위 (64x96 그림 칸, 키 차이 drop·출렁임 oy를 더해 찍음). '.'는 그대로(피부)
// 글자는 hd/face.mjs 와 같다: L 속눈썹 W 반짝임 w 흰자 E/F/G 눈동자(밝음·기본·어둠) B 눈썹 m 입 n 벌린 입 t 이·송곳니
//   r 볼 홍조 a 피부 밝음 b 피부 c 피부 그늘 d 깊은 그늘(코·입 끝) o 가장 어두운 칸
// big 이 없는 얼굴은 여기 make()로 만든 기본 얼굴을 쓴다. tools/pixel-art/dump-faces.mjs 가 이 기본 얼굴을 파일에 적어 두면
// 그 뒤로는 파일을 손으로 고친다.
import { FACES, palette } from './face.mjs';

// 왼쪽 눈(그림 왼쪽, 바깥이 왼쪽). 오른쪽 눈은 좌우를 뒤집되 반짝임 W는 같은 쪽(왼쪽 위)에 둔다
export const EYE_SET = {
  // 날카로운 눈: 위 눈꺼풀이 바깥으로 길게, 눈동자 위가 눈꺼풀에 덮임
  sharp: ['LLLLLL.', '.LGGWL.', '..FFEw.', '...LL..'],
  // 둥근 큰 눈
  round: ['.LLLLL.', 'LLGGWGL', '.GFFWF.', '.FFEEF.', '..EEE..'],
  // 처진 눈(부드러움): 바깥 끝이 아래로
  calm: ['..LLLL.', '.LLLLLL', 'LLGWFG.', '.wFEEF.', '..EEE..'],
  // 작은 눈
  small: ['.LLLL.', '.LGWG.', '..FEF.'],
  // 가늘게 뜬 눈
  narrow: ['LLLLLL', '.LLGWL', '...LL.'],
  // 치켜뜬 사나운 눈(카르크): 바깥 끝이 위로
  fierce: ['LL....', '.LLLLL', '..GWGL', '..FEF.'],
};
// 눈썹 (왼쪽, 바깥이 왼쪽)
export const BROW_SET = {
  sharp: ['BB....', '..BBBB'], // 안쪽으로 내려오는 진지한 눈썹
  flat: ['BBBBBB'], // 일자
  heavy: ['BBBBBB', '.BBBBB'],
  soft: ['..BBB.', 'BB....'], // 바깥으로 처짐
  thin: ['.BBBB.'],
  fierce: ['BB.....', '.BBB...', '...BBB.'],
  plain: ['.BBBBB'],
};
const MOUTH = {
  line: ['mmmm'],
  small: ['mm'],
  smile: ['m..m', '.mm.'],
  grin: ['mmmmm', '.ttt.'],
  fang: ['mmmm', 't...'],
  frown: ['.mm.', 'm..m'],
  smirk: ['...m', 'mmm.'],
};

const mirror = (rows) => rows.map((r) => [...r].reverse().join(''));

/** 기본 얼굴 (인물 설정의 눈·눈썹·입 갈래로 만듦) */
export function make(o) {
  const W = 28;
  const H = 18;
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  const put = (x, y, rows, keepW = false) => rows.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch === '.' || x + i < 0 || x + i >= W || y + j < 0 || y + j >= H) return;
    g[y + j][x + i] = ch;
  }));
  const eye = EYE_SET[o.eyes] ?? EYE_SET.sharp;
  const ew = eye[0].length;
  const gap = o.gap ?? 6;
  // 격자 왼쪽 = 그림 18칸. 얼굴 가운데 31.5 → 격자 13.5
  const lx = Math.round(13.5 - gap / 2 - ew + 0.5);
  const rx = Math.round(13.5 + gap / 2 + 0.5);
  const ey = o.eyeY ?? 5;
  put(lx, ey, eye);
  put(rx, ey, mirror(eye).map((r) => r));
  const brow = BROW_SET[o.brow] ?? BROW_SET.flat;
  const by = ey - 1 - brow.length - (o.browUp ?? 0);
  put(lx + ew - brow[0].length, by, brow);
  put(rx, by, mirror(brow));
  // 코: 그늘 한두 칸
  g[ey + 6][14] = 'c';
  if (!o.girl) g[ey + 7][13] = 'c';
  // 입
  const m = MOUTH[o.mouth ?? 'line'];
  put(Math.round(13.5 - m[0].length / 2 + 0.5), ey + 9 + (o.mouthDown ?? 0), m);
  if (o.blush) for (const x of [lx + 1, lx + 2, rx + ew - 3, rx + ew - 2]) g[ey + 5][x] = 'r';
  if (o.freckles) for (const [x, y] of [[lx + 1, 6], [lx + 3, 7], [lx + 5, 6], [rx + 1, 6], [rx + 3, 7], [rx + 5, 6]]) g[ey + y - 1][x] = 'd';
  if (o.scar) for (const [x, y] of [[rx + 4, 5], [rx + 3, 6], [rx + 2, 7], [rx + 1, 8]]) g[ey + y][x] = 'd';
  if (o.wrinkle) for (const x of [lx + ew - 1, rx]) g[ey + 4][x] = 'c';
  return { at: [18, 15], rows: g.map((r) => r.join('')) };
}
/** 옆 얼굴 기본 */
export function makeSide(o) {
  const W = 12;
  const H = 18;
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  const put = (x, y, rows) => rows.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch !== '.' && x + i >= 0 && x + i < W && y + j >= 0 && y + j < H) g[y + j][x + i] = ch;
  }));
  const eye = (EYE_SET[o.eyes] ?? EYE_SET.sharp).map((r) => r.slice(-4).replace(/^L/, 'L'));
  const ey = o.eyeY ?? 5;
  // 옆 보기 눈: 앞쪽(오른쪽) 반만, 얼굴 앞선에서 3~4칸 안쪽
  const side = eye.map((r) => mirror([r])[0].slice(0, 4));
  put(3, ey, side);
  const brow = (BROW_SET[o.brow] ?? BROW_SET.flat).map((r) => r.slice(-5));
  put(2, ey - 1 - brow.length - (o.browUp ?? 0), mirror(brow));
  g[ey + 6][9] = 'c';
  const m = o.mouth === 'smile' || o.mouth === 'grin' ? ['m.', '.m'] : o.mouth === 'fang' ? ['mm', 't.'] : ['mm'];
  put(6, ey + 9 + (o.mouthDown ?? 0), m);
  if (o.blush) for (const x of [3, 4]) g[ey + 5][x] = 'r';
  if (o.freckles) for (const x of [3, 5]) g[ey + 5][x] = 'd';
  return { at: [34, 15], rows: g.map((r) => r.join('')) };
}

/** 얼굴 지도 → 그림판에 찍기 (L: 64x96 그림판, oy: 키 차이·출렁임) */
export function stampBig(L, p, faceId, view, oy, fallback, fit) {
  const F = FACES[faceId] ?? {};
  const map = F.big?.[view] ?? (view === 'down' ? make(fallback) : makeSide(fallback));
  const col = palette(p, F.colors);
  const { rs, cs } = fitShift(map, fit);
  map.rows.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch === '.' || ch === ' ') return;
    const c = col[ch];
    if (!c) throw new Error(`큰 얼굴 ${faceId}.${view} ${j + 1}줄 ${i + 1}칸: 모르는 글자 "${ch}"`);
    const X = map.at[0] + i + cs[i];
    const Y = map.at[1] + j + oy + rs[j];
    if (L.getHi === undefined) return;
    if (X >= 0 && Y >= 0 && X < L.w && Y < L.h && L.d[Y][X]) L.d[Y][X] = c; // 머리(피부) 위에만
  }));
}

/**
 * 머리 배율이 얼굴 지도를 그린 때(fit.k0)와 다르면 얼굴 덩어리(눈썹·눈·코·입)는 크기 그대로 두고
 * 덩어리 사이 빈칸만 줄이거나 늘려 자리를 옮긴다. 세로는 턱 기준(fit.ao → fit.an), 가로는 얼굴 가운데(fit.cx) 기준.
 * 원래 떨어져 있던 덩어리는 적어도 한 칸 떨어진 채로 둔다
 */
function fitShift(map, fit) {
  const H = map.rows.length;
  const Wd = Math.max(...map.rows.map((r) => r.length));
  const rs = new Array(H).fill(0);
  const cs = new Array(Wd).fill(0);
  if (!fit || fit.r === 1 && fit.ao === fit.an) return { rs, cs };
  const ink = (ch) => ch && ch !== '.' && ch !== ' ';
  const rowOn = map.rows.map((r) => [...r].some(ink));
  const colOn = [...Array(Wd)].map((_, i) => map.rows.some((r) => ink(r[i])));
  const blocks = (on) => {
    const b = [];
    on.forEach((v, i) => { if (v && (i === 0 || !on[i - 1])) b.push([i, i]); else if (v) b[b.length - 1][1] = i; });
    return b;
  };
  // 세로: 위에서 아래로, 이상 자리(턱 기준 배율)에 두되 앞 덩어리와 겹치지 않게
  let prevEnd = -1e9, prevOrigEnd = -1e9;
  for (const [a, b] of blocks(rowOn)) {
    const Y0 = map.at[1] + a + (fit.oy ?? 0);
    const Yc = Y0 + (b - a) / 2;
    const want = fit.an + (Yc - fit.ao) * fit.r - (b - a) / 2;
    const gap = a - prevOrigEnd - 1;
    let ns = Math.round(want);
    if (gap >= 1) ns = Math.max(ns, prevEnd + 2);
    else ns = Math.max(ns, prevEnd + 1);
    const d = ns - Y0;
    for (let j = a; j <= b; j++) rs[j] = d;
    for (let j = b + 1; j < H; j++) rs[j] = d; // 빈 줄은 앞 덩어리를 따라감
    prevEnd = ns + (b - a);
    prevOrigEnd = b;
  }
  // 가로: 가운데를 품은 덩어리는 그대로, 바깥 덩어리는 좌우 대칭으로 안쪽(또는 바깥)으로
  const cb = blocks(colOn);
  const X = (i) => map.at[0] + i;
  for (let k = 0; k < cb.length; k++) {
    const [a, b] = cb[k];
    const Xc = (X(a) + X(b)) / 2 - fit.cx;
    if (X(a) <= fit.cx + 0.5 && X(b) >= fit.cx - 0.5) continue;
    let d = Math.sign(Xc) * Math.round(Math.abs(Xc) * (fit.r - 1));
    // 안쪽 이웃과 한 칸은 떼어 둠
    if (d < 0 && Xc > 0 && k > 0) d = Math.max(d, -(a - cb[k - 1][1] - 2));
    if (d > 0 && Xc < 0 && k + 1 < cb.length) d = Math.min(d, cb[k + 1][0] - b - 2);
    for (let i = a; i <= b; i++) cs[i] = d;
  }
  return { rs, cs };
}
