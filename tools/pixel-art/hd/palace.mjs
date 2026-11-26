// 새 도트 황궁 타일·물건 (32x32 타일). 기준: docs/도트기준.md
// 타일 이름·순서는 예전 그대로(src/data/explore/sprites.json). 바닥만 무늬 갈래를 더 붙인다.
// 물건은 예전과 같은 크기·같은 내용(기둥, 횃불, 깃발, 꽃병, 갑옷)을 새 기준으로 다시 그림.
import { RAMPS } from '../palette.mjs';
import { Layer } from './layer.mjs';

const R = RAMPS;
/** 칸마다 정해진 난수 (그릴 때마다 같은 그림) */
const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---------------------------------------------------------------------
// 바닥: 대리석 16x16 판 네 장. 판마다 위·왼쪽 1px 밝게, 줄눈 앞 1px 어둡게
// ---------------------------------------------------------------------
function marble(seed, extra) {
  const L = new Layer(32, 32);
  L.rect(0, 0, 31, 31, (x, y) => {
    const u = x % 16;
    const v = y % 16;
    if (u === 15 || v === 15) return R.stone[3];
    if (u === 0 || v === 0) return R.stone[0];
    if (u === 14 || v === 14) return R.stone[2];
    return hash(x, y, seed) < 0.025 ? R.stone[2] : R.stone[1];
  });
  extra?.(L);
  return L;
}
/** 대리석 결 (짧게 꺾이는 선) */
const vein = (L, pts, c = R.stone[2]) => {
  for (let i = 0; i + 1 < pts.length; i++) L.line(...pts[i], ...pts[i + 1], c);
};

export const FLOOR = {
  floor: marble(1, (L) => vein(L, [[2, 4], [5, 6], [7, 6], [11, 10], [13, 11]])),
  floor_b: marble(2, (L) => {
    vein(L, [[18, 28], [21, 25], [24, 25], [28, 20]]);
    vein(L, [[4, 20], [6, 22]], R.stone[3]);
  }),
  floor_c: marble(3, (L) => {
    vein(L, [[17, 3], [20, 5], [22, 9], [26, 11], [29, 11]]);
    L.set(9, 25, R.stone[3]);
    L.set(10, 25, R.stone[3]);
    L.set(10, 24, R.stone[2]);
  }),
};
// 결이 다른 바닥: 판 가운데 금 상감
const floor2 = marble(4, (L) => {
  vein(L, [[2, 26], [5, 23], [8, 22]]);
  vein(L, [[20, 2], [23, 5], [27, 6]]);
  L.rect(14, 14, 16, 16, R.gold[2]);
  L.set(15, 13, R.gold[2]);
  L.set(15, 17, R.gold[2]);
  L.set(13, 15, R.gold[2]);
  L.set(17, 15, R.gold[2]);
  L.set(15, 15, R.gold[0]);
  L.set(15, 14, R.gold[1]);
  L.set(14, 15, R.gold[1]);
});

// ---------------------------------------------------------------------
// 카펫 (가로로 깔림): 위·아래 금테, 가운데 마름모
// ---------------------------------------------------------------------
function carpet(part) {
  const L = new Layer(32, 32);
  L.rect(0, 0, 31, 31, (x, y) => ((x + y * 3) % 11 === 0 && y % 4 === 1 ? R.red[3] : R.red[2]));
  const band = (rows) => rows.forEach(([y, c]) => L.rect(0, y, 31, y, c));
  if (part === 'top') {
    band([[0, R.red[3]], [1, R.gold[0]], [2, R.gold[1]], [3, R.gold[2]], [4, R.red[3]], [5, R.red[1]]]);
    for (let x = 3; x < 32; x += 8) L.rect(x, 9, x + 1, 9, R.gold[2]);
  } else if (part === 'bot') {
    band([[26, R.red[3]], [27, R.red[3]], [28, R.gold[1]], [29, R.gold[1]], [30, R.gold[2]], [31, R.red[3]]]);
    for (let x = 3; x < 32; x += 8) L.rect(x, 22, x + 1, 22, R.gold[2]);
  } else {
    // 마름모 (가운데 금, 테두리 진홍)
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const d = Math.abs(x - 15.5) + Math.abs(y - 15.5);
        if (d >= 10 && d < 11) L.set(x, y, R.gold[3]);
        else if (d >= 7 && d < 10) L.set(x, y, R.red[1]);
        else if (d < 3) L.set(x, y, d < 1.5 ? R.gold[1] : R.gold[2]);
      }
  }
  return L;
}

// ---------------------------------------------------------------------
// 벽
// ---------------------------------------------------------------------
/** 벽 윗면 (위에서 본 어두운 돌판): 판마다 위·왼쪽 1px 하이라이트 */
function wallTop() {
  const L = new Layer(32, 32);
  L.rect(0, 0, 31, 31, (x, y) => {
    const u = x % 16;
    const v = y % 16;
    if (u === 15 || v === 15) return R.black[3];
    if (v === 0 || u === 0) return R.black[0];
    if (v === 14) return R.black[2];
    return hash(x, y, 9) < 0.04 ? R.black[2] : R.black[1];
  });
  return L;
}
/** 돌벽 앞면: 8px 높이 벽돌을 엇갈려 쌓고, 아래 8줄은 금 몰딩 */
function bricks(L, y0, y1) {
  for (let y = y0; y <= y1; y++)
    for (let x = 0; x < 32; x++) {
      const row = Math.floor(y / 8);
      const v = y % 8;
      const u = (x + (row % 2) * 8) % 16;
      let c;
      if (v === 7 || u === 15) c = R.stone[4];
      else if (v === 0) c = R.stone[1];
      else if (v === 6 || u === 14) c = R.stone[3];
      else c = hash(x, y, 5) < 0.05 ? R.stone[3] : R.stone[2];
      L.set(x, y, c);
    }
}
function wallUp() {
  const L = new Layer(32, 32);
  bricks(L, 0, 23);
  [[24, R.gold[3]], [25, R.gold[0]], [26, R.gold[1]], [27, R.gold[1]], [28, R.gold[2]], [29, R.gold[3]], [30, R.wood[3]], [31, R.wood[3]]].forEach(([y, c]) => L.rect(0, y, 31, y, c));
  for (let x = 4; x < 32; x += 8) L.set(x, 27, R.gold[0]);
  return L;
}
/** 나무 징두리판: 위 난간, 들어간 판(위·왼쪽 그늘, 아래·오른쪽 빛), 아래 굽도리 */
function wallLow() {
  const L = new Layer(32, 32);
  L.rect(0, 0, 31, 31, R.wood[1]);
  L.rect(0, 0, 31, 0, R.wood[0]);
  L.rect(0, 3, 31, 3, R.wood[2]);
  L.rect(4, 5, 27, 24, (x, y) => (hash(x, 0, 7) < 0.25 && hash(x, y, 8) < 0.7 ? R.wood[1] : R.wood[2]));
  L.rect(4, 5, 27, 5, R.wood[3]);
  L.rect(4, 5, 4, 24, R.wood[3]);
  L.rect(5, 24, 27, 24, R.wood[0]);
  L.rect(27, 6, 27, 24, R.wood[0]);
  [[26, R.wood[3]], [27, R.wood[0]], [28, R.wood[1]], [29, R.wood[2]], [30, R.wood[2]], [31, R.wood[3]]].forEach(([y, c]) => L.rect(0, y, 31, y, c));
  return L;
}
/** 창 유리 (밤하늘, 비스듬한 반사 줄, 금 창살) */
function glass(L, x0, y0, x1, y1, inside) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!inside(x, y)) continue;
      const k = (x - x0) + (y - y0);
      let c = y < 10 ? R.navy[3] : R.navy[2];
      if (k % 23 === 6 || k % 23 === 7) c = R.navy[1];
      if (hash(x, y, 11) < 0.015) c = R.sky[0];
      L.set(x, y, c);
    }
}
function windowUp() {
  const L = wallUp();
  const cx = 15.5;
  const cy = 14;
  const inFrame = (x, y) => (y >= cy ? x >= 5 && x <= 26 : (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= 11 ** 2);
  const inGlass = (x, y) => (y >= cy ? x >= 8 && x <= 23 : (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= 8 ** 2);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      if (!inFrame(x, y)) continue;
      const edge = !inFrame(x - 1, y) || !inFrame(x + 1, y) || !inFrame(x, y - 1);
      L.set(x, y, edge ? R.stone[4] : x < 16 ? R.stone[0] : R.stone[1]);
    }
  glass(L, 8, 0, 23, 31, inGlass);
  L.rect(15, 6, 16, 31, R.gold[2]);
  L.rect(15, 6, 15, 31, R.gold[1]);
  L.rect(8, 22, 23, 22, R.gold[2]);
  return L;
}
function windowLow() {
  const L = wallLow();
  L.rect(5, 0, 26, 17, (x) => (x < 16 ? R.stone[0] : R.stone[1]));
  L.rect(5, 0, 5, 17, R.stone[4]);
  L.rect(26, 0, 26, 17, R.stone[4]);
  glass(L, 8, 0, 23, 15, () => true);
  L.rect(15, 0, 16, 15, R.gold[2]);
  L.rect(15, 0, 15, 15, R.gold[1]);
  L.rect(8, 7, 23, 7, R.gold[2]);
  // 창턱
  [[16, R.stone[0]], [17, R.stone[1]], [18, R.stone[2]], [19, R.stone[4]]].forEach(([y, c]) => L.rect(3, y, 28, y, c));
  L.rect(3, 20, 28, 20, R.wood[3]);
  return L;
}

/** 예전 타일 이름 → 새 그림. 여기 없는 타일은 예전 그림 그대로 */
export const TILES = {
  floor: FLOOR.floor,
  floor2,
  carpet_top: carpet('top'),
  carpet_mid: carpet('mid'),
  carpet_bot: carpet('bot'),
  wall_top: wallTop(),
  wall_up: wallUp(),
  wall_low: wallLow(),
  window_up: windowUp(),
  window_low: windowLow(),
};
/** 타일 뒤에 덧붙이는 무늬 갈래 (엔진이 바닥을 칸마다 섞어 깖) */
export const VARIANTS = { floor: ['floor_b', 'floor_c'] };
export const EXTRA = { floor_b: FLOOR.floor_b, floor_c: FLOOR.floor_c };
/** 벽 아래 그림자 띠를 까는 타일 (그 아래 바닥 칸 위쪽) */
export const SHADOW_BELOW = ['wall_low', 'window_low'];

// ---------------------------------------------------------------------
// 물건 (예전과 같은 크기)
// ---------------------------------------------------------------------
/** 원기둥 명암: t 0(왼쪽)~1(오른쪽), 빛은 왼쪽 위 */
const cyl = (ramp, t) => ramp[t < 0.12 ? 2 : t < 0.38 ? 0 : t < 0.7 ? 1 : t < 0.9 ? 2 : 3];

function pillar() {
  const L = new Layer(32, 96);
  const shaft = new Layer(32, 96);
  shaft.trap(14, 83, 7, 24, 7, 24, (x, y, t) => {
    const c = cyl(R.stone, t);
    return [10, 14, 18, 22].includes(x) && y > 15 && y < 82 ? R.stone[Math.min(4, R.stone.indexOf(c) + 1)] : c;
  });
  shaft.outline();
  const cap = new Layer(32, 96);
  cap.rect(1, 0, 30, 3, (x, y) => (y === 0 ? R.stone[0] : cyl(R.stone, x / 31)));
  cap.trap(4, 9, 2, 29, 5, 26, (x, y, t) => cyl(R.stone, t));
  cap.rect(5, 10, 26, 10, R.gold[1]);
  cap.rect(5, 11, 26, 11, R.gold[2]);
  cap.trap(12, 13, 6, 25, 7, 24, (x, y, t) => cyl(R.stone, t));
  cap.outline();
  const base = new Layer(32, 96);
  base.rect(6, 84, 25, 84, R.gold[1]);
  base.rect(6, 85, 25, 85, R.gold[2]);
  base.trap(86, 89, 4, 27, 3, 28, (x, y, t) => cyl(R.stone, t));
  base.rect(1, 90, 30, 95, (x, y) => (y === 90 ? R.stone[0] : cyl(R.stone, x / 31)));
  base.outline({ skipBottom: true });
  return L.over(shaft).over(base).over(cap);
}

function torch() {
  const frame = (tip) => {
    const L = new Layer(12, 22);
    const stick = new Layer(12, 22);
    stick.rect(5, 12, 6, 21, (x) => (x === 5 ? R.wood[1] : R.wood[2]));
    stick.rect(3, 10, 8, 12, (x) => cyl(R.gold, (x - 3) / 5));
    stick.rect(4, 16, 7, 17, (x) => cyl(R.gold, (x - 4) / 3));
    stick.outline();
    const fire = new Layer(12, 22);
    fire.ellipse(5.5 + tip * 0.5, 7, 3.6, 3.6, R.fire[2]);
    fire.trap(0, 5, 5 + tip, 6 + tip, 3, 8, R.fire[2]);
    fire.ellipse(5.5, 7.5, 2.3, 2.5, R.fire[1]);
    fire.trap(2 + (tip > 0 ? 1 : 0), 6, 5, 6, 4, 7, R.fire[1]);
    fire.ellipse(5.5, 8, 1.2, 1.5, R.fire[0]);
    fire.outline({ steps: 1, skipBottom: true });
    return L.over(stick).over(fire);
  };
  return [frame(0), frame(1)];
}

function banner() {
  const L = new Layer(16, 44);
  const cloth = new Layer(16, 44);
  cloth.rect(2, 3, 13, 37, (x) => (x < 5 ? R.navy[1] : x < 11 ? R.navy[2] : R.navy[3]));
  for (let y = 38; y < 44; y++) {
    const k = y - 37;
    cloth.rect(2, y, 7 - k, y, R.navy[2]);
    cloth.rect(8 + k, y, 13, y, R.navy[3]);
  }
  cloth.rect(7, 6, 7, 34, R.navy[1]); // 주름
  // 금 해 무늬 (예전 깃발과 같은 무늬)
  cloth.ellipse(8, 14, 3, 3, R.gold[1]);
  cloth.ellipse(7.5, 13.5, 1.4, 1.4, R.gold[0]);
  for (const [dx, dy] of [[0, -5], [0, 5], [-5, 0], [5, 0]]) cloth.set(8 + dx, 14 + dy, R.gold[2]);
  for (const [dx, dy] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) cloth.set(8 + dx, 14 + dy, R.gold[2]);
  cloth.rect(4, 24, 12, 24, R.gold[2]);
  cloth.rect(4, 30, 12, 30, R.gold[2]);
  cloth.outline();
  const rod = new Layer(16, 44);
  rod.rect(0, 0, 15, 2, (x, y) => (y === 0 ? R.gold[0] : y === 1 ? R.gold[1] : R.gold[2]));
  rod.outline({ skipBottom: true });
  return L.over(cloth).over(rod);
}

function vase() {
  const L = new Layer(16, 28);
  const stand = new Layer(16, 28);
  stand.rect(3, 18, 12, 27, (x, y) => (y === 18 ? R.stone[0] : cyl(R.stone, (x - 3) / 9)));
  stand.rect(2, 18, 13, 19, (x, y) => (y === 18 ? R.stone[0] : R.stone[1]));
  stand.outline({ skipBottom: true });
  const pot = new Layer(16, 28);
  pot.ellipse(8, 13, 4.5, 4.5, (x) => cyl(R.navy, (x - 3.5) / 9));
  pot.rect(6, 6, 9, 9, (x) => cyl(R.navy, (x - 6) / 3));
  pot.rect(5, 6, 10, 6, R.navy[1]);
  pot.rect(4, 13, 11, 13, R.gold[1]);
  pot.outline();
  const flower = new Layer(16, 28);
  flower.line(7, 6, 5, 2, R.green[2]);
  flower.line(8, 6, 10, 1, R.green[2]);
  for (const [x, y] of [[5, 1], [10, 0], [8, 3]]) {
    flower.rect(x - 1, y, x + 1, y, R.white[1]);
    flower.set(x, y - 1, R.white[0]);
    flower.set(x, y + 1, R.white[2]);
  }
  flower.set(5, 1, R.gold[1]);
  flower.set(10, 0, R.gold[1]);
  flower.set(8, 3, R.gold[1]);
  return L.over(stand).over(pot).under(flower);
}

function armor() {
  const L = new Layer(22, 40);
  const stand = new Layer(22, 40);
  stand.rect(10, 28, 11, 37, (x) => (x === 10 ? R.wood[1] : R.wood[2]));
  stand.rect(4, 37, 17, 39, (x, y) => (y === 37 ? R.wood[0] : y === 38 ? R.wood[1] : R.wood[2]));
  stand.outline({ skipBottom: true });
  const body = new Layer(22, 40);
  // 투구
  const S = R.silver.slice(1);
  body.ellipse(11, 6, 4.5, 5, (x, y, nx) => cyl(S, (nx + 1) / 2));
  body.rect(8, 6, 14, 6, R.black[1]);
  body.rect(9, 7, 13, 7, R.silver[3]);
  body.rect(10, 0, 12, 0, R.red[1]);
  // 몸통·어깨
  body.trap(11, 27, 5, 16, 7, 14, (x, y, t) => cyl(S, t));
  body.ellipse(4.5, 13, 3.5, 3, (x, y, nx) => cyl(S, (nx + 1) / 2));
  body.ellipse(17.5, 13, 3.5, 3, (x, y, nx) => cyl(S, (nx + 1) / 2));
  body.rect(10, 13, 11, 19, S[3]);
  body.rect(8, 21, 13, 22, R.gold[1]);
  body.rect(8, 22, 13, 22, R.gold[2]);
  body.outline();
  return L.over(stand).over(body);
}

/** 이름 → 프레임 목록 (크기는 예전과 같음) */
export const PROPS = {
  pillar: [pillar()],
  torch: torch(),
  banner: [banner()],
  vase: [vase()],
  armor: [armor()],
};
