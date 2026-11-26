// 인물 얼굴 픽셀 지도 (docs/도트기준.md 1-1)
// 얼굴은 수치로 조합하지 않고, 인물마다 tools/pixel-art/hd/faces/{id}.mjs 에 글자 격자로 직접 둔다.
//   export default { at: [x, y], down: [...], right: [...], up: [...], colors: { 글자: 색 }, hi: {...} }
//   at: 격자 왼쪽 위가 놓일 칸 (32x48 인물 칸 기준, 기본 [5, 0])
//   down: 정면, right: 옆(오른쪽을 봄, 왼쪽은 뒤집음), up: 뒤통수
//   줄 길이는 달라도 된다(오른쪽은 빈칸으로 채움). '.'는 빈칸
//   지도는 1배 격자로 쓰고 고해상도(K배)로 키운다: Scale2x로 대각선을 둥글게, 외곽선은 바깥 한 칸만.
//   hi: 눈·눈썹을 고해상도 격자로 직접 둠 → { down: { at: [x, y], rows: [...] }, right: {...} }
//       at은 키운 격자 안의 고해상도 칸. hi가 있는 보기에서는 1배 지도의 눈·눈썹 글자를 피부로 덮는다
//
// 글자 (색은 인물 설정에서 옴)
//   머리카락  1 반짝임  2 기본  3 그늘  4 어둠  5 외곽선
//   피부      a 밝은 면  b 기본  c 그늘  d 깊은 그늘(입·콧날)  e 외곽선
//   눈        W 반짝임(흰색)  w 흰자 그늘  E 눈동자 밝음  F 눈동자 기본  G 눈동자 어둠  L 속눈썹·눈매 선
//   그 밖     B 눈썹  m 입  n 벌린 입 안  t 이·송곳니  r 볼 홍조  k 귀 안쪽(피부 그늘)  o 가장 어두운 칸(#1d2735)
//   colors로 글자를 더하거나 바꿀 수 있다: '#rrggbb' | '묶음.번호'(팔레트) | 'hair.2' 'skin.1' 'eye.0'(인물 색)
import { readdirSync } from 'node:fs';
import { RAMPS as R } from '../palette.mjs';
import { Layer, scale2x } from './layer.mjs';

const DIR = new URL('./faces/', import.meta.url);
export const FACES = {};
for (const f of readdirSync(DIR).sort()) {
  if (!f.endsWith('.mjs')) continue;
  FACES[f.slice(0, -4)] = (await import(new URL(f, DIR))).default;
}

export function palette(p, extra = {}) {
  const h = p.hair ?? R.hair;
  const s = p.skin;
  const e = p.eye ?? [R.wood[1], R.wood[2], R.hair[4]];
  const map = {
    1: h[0], 2: h[1], 3: h[2], 4: h[3], 5: h[4] ?? h[3],
    a: s[0], b: s[1], c: s[2], d: s[3], e: s[4] ?? s[3],
    W: R.white[0], w: R.white[2], E: e[0], F: e[1], G: e[2],
    L: p.lash ?? R.slate[3],
    B: p.browColor ?? h[3],
    m: s[3], n: R.red[2], t: R.white[0], r: R.red[0], k: s[2], o: R.slate[3],
  };
  const own = { hair: h, skin: s, eye: e };
  for (const [ch, v] of Object.entries({ ...(p.faceColors ?? {}), ...extra })) {
    if (v.startsWith('#')) map[ch] = v;
    else {
      const [r, i] = v.split('.');
      map[ch] = (own[r] ?? R[r])?.[Number(i)];
      if (!map[ch]) throw new Error(`얼굴 색 없음: ${ch} = ${v}`);
    }
  }
  return map;
}

const OUTLINE = new Set(['5', 'e', 'o']);
const EYE = new Set(['W', 'w', 'E', 'F', 'G', 'L', 'B']);

/** 1배 글자 격자 → 고해상도 글자 격자: Scale2x로 키우고, 두 칸이 된 외곽선은 바깥쪽 한 칸만 남김 */
function upGrid(rows, hideEyes) {
  const w = Math.max(...rows.map((r) => r.length));
  const g = rows.map((r) => [...r.padEnd(w, '.')].map((ch) => (ch === ' ' || ch === '.' ? null : hideEyes && EYE.has(ch) ? 'b' : ch)));
  const up = scale2x(g);
  const H = up.length;
  const W = up[0].length;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? null : up[y][x]);
  const out = up.map((r) => [...r]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = up[y][x];
      if (!OUTLINE.has(c)) continue;
      const n = [at(x + 1, y), at(x - 1, y), at(x, y - 1), at(x, y + 1)];
      if (n.some((v) => v === null)) continue;
      const inner = n.find((v) => !OUTLINE.has(v));
      if (inner) out[y][x] = inner;
    }
  return out;
}

/** 얼굴 지도 한 장 (view: down | right | up). dy: 몸 출렁임·키 차이(논리 칸) */
export function drawFaceMap(p, id, view, dy) {
  const F = FACES[id];
  if (!F) throw new Error(`얼굴 지도 없음: ${id}`);
  const rows = F[view];
  if (!rows) throw new Error(`얼굴 지도 ${id}에 ${view} 없음`);
  const [ax, ay] = F.at ?? [5, 0];
  const col = palette(p, F.colors);
  const L = new Layer();
  const k = L.k;
  const hi = k > 1 ? F.hi?.[view] : null;
  const grid = k === 1 ? rows.map((r) => [...r].map((c) => (c === '.' || c === ' ' ? null : c))) : upGrid(rows, !!hi);
  const ox = ax * k;
  const oy = (ay + dy) * k;
  const put = (ch, X, Y, where) => {
    if (!ch || ch === '.' || ch === ' ') return;
    const c = col[ch];
    if (!c) throw new Error(`얼굴 지도 ${id}.${view} ${where}: 모르는 글자 "${ch}"`);
    L.setHi(ox + X, oy + Y, c);
  };
  grid.forEach((r, y) => r.forEach((ch, x) => put(ch, x, y, `${Math.floor(y / k) + 1}줄 ${Math.floor(x / k) + 1}칸`)));
  if (hi) hi.rows.forEach((r, y) => [...r].forEach((ch, x) => put(ch, hi.at[0] + x, hi.at[1] + y, `고해상도 눈 ${y + 1}줄 ${x + 1}칸`)));
  return L;
}
