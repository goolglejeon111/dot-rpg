// 새 도트 1~4막 타일 (32x32). 기준: docs/도트기준.md
// 타일 이름·순서는 예전 그대로(src/data/explore/sprites.json). 황궁 타일은 palace.mjs.
// 여기 없는 타일(무늬가 특별한 칸: 핏자국, 쇠창살, 결계, 구름 등)은 gen-hd.mjs가 예전 그림을 새 팔레트로 옮겨 칠함(remap.mjs).
import { RAMPS } from '../palette.mjs';
import { Layer } from './layer.mjs';

const R = RAMPS;
const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** 부드러운 얼룩 (칸 4px 격자 값 보간, 타일 가장자리에서 이어짐) */
function blot(x, y, s, cell = 8) {
  const n = 32 / cell;
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const sm = (t) => t * t * (3 - 2 * t);
  const fx = sm(gx - x0);
  const fy = sm(gy - y0);
  const v = (i, j) => hash(((i % n) + n) % n, ((j % n) + n) % n, s);
  const a = v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx;
  const b = v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx;
  return a * (1 - fy) + b * fy;
}

// 섞어 쓰는 색 묶음 (모두 팔레트 안의 색, 밝음 → 어둠)
const GREY = ['#c0c6d8', '#a8a4b8', '#8a90aa', '#6e6a84', '#545a78']; // 회색 돌
const DARK = ['#6e6a84', '#5a6478', '#3c4558', '#2a3142', '#1d2735']; // 어두운 돌
const ROCK = ['#d8ccc0', '#b4a09c', '#857080', '#634030', '#4a2a2a']; // 갈색 바위
const DIRT = ['#d49a5e', '#a8703e', '#7a4a30', '#634030', '#4a2a2a']; // 흙
const SAND = [...R.sand, '#634030'];
const IVORY = R.ivory;
const SNOW = ['#ffffff', '#eef0f6', '#c0c6d8', '#a8a4b8', '#8a90aa'];
const WOOD = [...R.wood, '#2e2425'];

// ---------------------------------------------------------------------
// 맨땅: 얼룩 두 단계 + 작은 돌(위·왼쪽 밝게, 아래 그늘) + 티끌
// ---------------------------------------------------------------------
function ground(ramp, o = {}) {
  const { base = 1, seed = 1, pebbles = 3, specks = 0.03, light = 0.07, dark = 0.1, extra } = o;
  const L = new Layer(32, 32);
  L.rect(0, 0, 31, 31, (x, y) => {
    const b = blot(x, y, seed, 8);
    if (b > 1 - light) return ramp[base - 1] ?? ramp[base];
    if (b < dark) return ramp[base + 1];
    return hash(x, y, seed + 50) < specks ? ramp[base + 1] : ramp[base];
  });
  for (let i = 0; i < pebbles; i++) {
    const px = Math.floor(hash(i, 1, seed) * 28) + 2;
    const py = Math.floor(hash(i, 2, seed) * 28) + 2;
    pebble(L, px, py, ramp, base, hash(i, 3, seed) < 0.5);
  }
  extra?.(L);
  return L;
}
function pebble(L, x, y, ramp, base, big) {
  if (big) {
    L.rect(x, y, x + 2, y + 1, ramp[base - 1] ?? ramp[0]);
    L.set(x, y, ramp[0]);
    L.rect(x, y + 2, x + 2, y + 2, ramp[base + 2] ?? ramp[ramp.length - 1]);
  } else {
    L.set(x, y, ramp[base - 1] ?? ramp[0]);
    L.set(x + 1, y, ramp[base]);
    L.set(x, y + 1, ramp[base + 2] ?? ramp[ramp.length - 1]);
    L.set(x + 1, y + 1, ramp[base + 2] ?? ramp[ramp.length - 1]);
  }
}

// ---------------------------------------------------------------------
// 돌판 바닥: 판 사이 줄은 바탕보다 한 단계 어두운 색, 판마다 위·왼쪽 1px 밝게
// ---------------------------------------------------------------------
function slabs(ramp, o = {}) {
  const { base = 1, w = 16, h = 16, stagger = 0, seed = 1, crack = 1, tint, extra } = o;
  const L = new Layer(32, 32);
  // 판마다 조금씩 다른 밝기
  L.rect(0, 0, 31, 31, (x, y) => {
    const row = Math.floor(y / h);
    const u = (x + row * stagger) % w;
    const v = y % h;
    const col = Math.floor((x + row * stagger) / w);
    if (u === w - 1 || v === h - 1) return ramp[base + 1];
    if (u === 0 || v === 0) return ramp[base - 1] ?? ramp[base];
    const sp = hash(x, y, seed + 7 + col * 3 + row);
    if (sp < 0.02) return ramp[base + 1];
    if (tint && sp > 0.985) return tint;
    return ramp[base];
  });
  for (let i = 0; i < crack; i++) {
    let x = Math.floor(hash(i, 9, seed) * 26) + 3;
    let y = Math.floor(hash(i, 8, seed) * 26) + 3;
    for (let k = 0; k < 5; k++) {
      L.set(x, y, ramp[base + 2]);
      x += hash(i, k, seed + 3) < 0.5 ? 1 : 0;
      y += 1;
    }
  }
  extra?.(L);
  return L;
}

// ---------------------------------------------------------------------
// 벽: 엇갈린 돌·벽돌. 돌마다 위 1줄 밝게, 아래·오른쪽 줄눈 어둡게
// ---------------------------------------------------------------------
function bricks(ramp, o = {}) {
  const { base = 1, h = 8, w = 16, seed = 1, rough = 0, moss, mortar, extra, y0 = 0, y1 = 31 } = o;
  const L = new Layer(32, 32);
  for (let y = y0; y <= y1; y++)
    for (let x = 0; x < 32; x++) {
      const row = Math.floor(y / h);
      const v = y % h;
      const off = rough ? Math.floor(hash(row, 0, seed) * w) : (row % 2) * (w / 2);
      const u = (x + off) % w;
      const col = Math.floor((x + off) / w);
      let c;
      if (v === h - 1 || u === w - 1) c = mortar ?? ramp[base + 2];
      else if (v === 0) c = ramp[base - 1] ?? ramp[base];
      else if (u === 0 && v < h - 2) c = ramp[base - 1] ?? ramp[base];
      else if (v === h - 2) c = ramp[base + 1];
      else {
        const dim = hash(col, row, seed) < 0.3;
        c = hash(x, y, seed + 5) < (dim ? 0.1 : 0.025) ? ramp[base + 1] : ramp[base];
      }
      L.set(x, y, c);
    }
  if (moss) {
    for (let x = 0; x < 32; x++) {
      const len = Math.floor(blot(x, 0, seed + 9, 8) * 9) - 2;
      for (let k = 0; k < len; k++) L.set(x, 31 - k, k === len - 1 ? moss[0] : moss[1 + (hash(x, k, seed) < 0.3 ? 1 : 0)]);
      if (hash(x, 3, seed) < 0.08) L.set(x, Math.floor(hash(x, 4, seed) * 20), moss[1]);
    }
  }
  extra?.(L);
  return L;
}

/** 벽 윗면 (위에서 본 돌판) */
function wallTop(ramp, o = {}) {
  const { base = 1, seed = 9, extra } = o;
  const L = new Layer(32, 32);
  L.rect(0, 0, 31, 31, (x, y) => {
    const u = x % 16;
    const v = y % 16;
    if (u === 15 || v === 15) return ramp[base + 2];
    if (v === 0 || u === 0) return ramp[base - 1] ?? ramp[base];
    if (v === 14) return ramp[base + 1];
    return hash(x, y, seed) < 0.04 ? ramp[base + 1] : ramp[base];
  });
  extra?.(L);
  return L;
}

// ---------------------------------------------------------------------
// 널빤지: 판마다 위 1줄 밝게, 결은 드문드문, 못 자국
// ---------------------------------------------------------------------
function planks(ramp, o = {}) {
  const { base = 1, size = 8, vertical = false, seed = 1, gap = true, grain = 0.12, extra } = o;
  const L = new Layer(32, 32);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const a = vertical ? x : y; // 판을 가르는 축
      const b = vertical ? y : x; // 판을 따라가는 축
      const k = Math.floor(a / size);
      const v = a % size;
      const end = (b + Math.floor(hash(k, 0, seed) * 32)) % 32;
      let c;
      if (v === size - 1) c = gap ? ramp[base + 2] : ramp[base + 1];
      else if (v === 0) c = ramp[base - 1] ?? ramp[base];
      else if (end === 0) c = ramp[base + 2];
      else if (end === 1) c = ramp[base - 1] ?? ramp[base];
      else if (hash(k, v, seed + 3) < grain && hash(b >> 3, k * 7 + v, seed) < 0.5) c = ramp[base + 1]; // 결 (드문드문)
      else c = ramp[base];
      L.set(x, y, c);
    }
  // 못
  for (let k = 0; k < 32 / size; k++) {
    const b = Math.floor(hash(k, 0, seed) * 32);
    for (const d of [3, 29]) {
      const p = (32 - b + d) % 32;
      const q = k * size + Math.floor(size / 2) - 1;
      if (vertical) L.set(q, p, ramp[base + 2]);
      else L.set(p, q, ramp[base + 2]);
    }
  }
  extra?.(L);
  return L;
}

// ---------------------------------------------------------------------
// 물: 바탕 얼룩 + 가로 물결(밝은 줄 위, 어두운 줄 아래) + 반짝임. frame으로 물결 위치를 옮김
// ---------------------------------------------------------------------
// 움직이는 타일 프레임 (0~3). 엔진이 차례로 바꿔 깖 (WORLD_ANIM)
let ANIM_F = 0;
const SWAY = [0, 1, 2, 1];
function water(ramp, o = {}) {
  const { base = 1, seed = 1, frame = 0, glint = R.sky[0], specks, extra } = o;
  const L = new Layer(32, 32);
  L.rect(0, 0, 31, 31, (x, y) => (blot(x, y, seed, 8) < 0.22 ? ramp[base + 1] : ramp[base]));
  for (let i = 0; i < 7; i++) {
    const y = (Math.floor(hash(i, 1, seed) * 32) + frame * 2) % 32;
    const x = (Math.floor(hash(i, 2, seed) * 32) + frame * 3 + SWAY[ANIM_F] * (i % 2 ? 1 : -1) + 32) % 32;
    const len = 4 + Math.floor(hash(i, 3, seed) * 6);
    for (let k = 0; k < len; k++) {
      L.set((x + k) % 32, y, ramp[base - 1] ?? ramp[0]);
      if (k > 0 && k < len - 1) L.set((x + k) % 32, (y + 1) % 32, ramp[base + 1]);
    }
    if (hash(i, 4, seed + ANIM_F) < 0.4) L.set((x + 1 + ANIM_F) % 32, y, glint);
  }
  if (specks) for (let i = 0; i < 6; i++) L.set(Math.floor(hash(i, 5, seed + frame) * 32), Math.floor(hash(i, 6, seed + frame) * 32), specks[i % specks.length]);
  extra?.(L);
  return L;
}

/** 용암: 붉은 바탕에 밝게 끓는 덩어리, 어두운 껍질 줄. 고해상도로 계산하고, 두 얼룩을 섞는 비율을 프레임마다 바꿔 끓어오름 */
function lava(seed, frame = 0) {
  const L = new Layer(32, 32);
  const t = ((ANIM_F + frame) * Math.PI) / 2;
  const wa = 0.5 + 0.5 * Math.cos(t);
  for (let Y = 0; Y < 64; Y++)
    for (let X = 0; X < 64; X++) {
      const x = X / 2;
      const y = Y / 2;
      const b = blot(x, y, seed, 8) * wa + blot(x, y, seed + 7, 8) * (1 - wa);
      const crust = blot(x, y, seed + 3, 16);
      let c;
      if (crust < 0.2) c = R.red[3];
      else if (crust < 0.24) c = R.fire[3];
      else if (b > 0.66) c = R.fire[0];
      else if (b > 0.56) c = R.fire[1];
      else if (b > 0.38) c = R.fire[2];
      else c = R.fire[3];
      L.setHi(X, Y, c);
    }
  return L;
}

/** 풀: 초록 얼룩 + 풀잎 송이(밝은 잎 끝, 어두운 뿌리) */
function grass(ramp, o = {}) {
  const { base = 1, seed = 1, tufts = 7, flowers = 0, bg, extra } = o;
  const L = bg ? bg : new Layer(32, 32);
  if (!bg) L.rect(0, 0, 31, 31, (x, y) => (blot(x, y, seed, 8) < 0.16 ? ramp[base + 1] : blot(x, y, seed + 1, 8) > 0.88 ? ramp[base - 1] : ramp[base]));
  for (let i = 0; i < tufts; i++) {
    const x = Math.floor(hash(i, 1, seed) * 29) + 1;
    const y = Math.floor(hash(i, 2, seed) * 27) + 3;
    L.set(x, y, ramp[base + 1]);
    L.set(x + 2, y, ramp[base + 1]);
    L.set(x, y - 1, ramp[base - 1] ?? ramp[0]);
    L.set(x + 1, y - 1, ramp[base + 1]);
    L.set(x + 2, y - 1, ramp[base - 1] ?? ramp[0]);
    L.set(x + 1, y - 2, ramp[base - 1] ?? ramp[0]);
  }
  for (let i = 0; i < flowers; i++) L.set(Math.floor(hash(i, 7, seed) * 30) + 1, Math.floor(hash(i, 8, seed) * 30) + 1, i % 2 ? R.ivory[0] : R.gold[1]);
  extra?.(L);
  return L;
}

/** 모래 물결 (얕은 호를 여러 줄) */
function ripples(L, ramp, base, seed, n = 5, deep = false, soft = false) {
  for (let i = 0; i < n; i++) {
    const y0 = Math.floor(hash(i, 1, seed) * 30) + 1;
    const x0 = Math.floor(hash(i, 2, seed) * 32);
    const len = (soft ? 5 : 8) + Math.floor(hash(i, 3, seed) * (soft ? 6 : 10));
    for (let k = 0; k < len; k++) {
      const x = (x0 + k) % 32;
      const y = y0 + Math.round(Math.sin((k / len) * Math.PI) * (soft ? -0.6 : -1.5));
      // soft: 물결이 칸 가장자리에서 끊기지 않게 가장자리 2칸은 비우고, 밝은 칸도 드문드문 (같은 무늬가 칸마다 되풀이돼 보이지 않게)
      if (soft && (x < 2 || x > 29 || hash(x, y, seed + 9) < 0.35)) continue;
      L.set(x, y, ramp[base - 1] ?? ramp[0]);
      if (deep || (k > 1 && k < len - 2 && hash(x, y, seed) < (soft ? 0.1 : 0.5))) L.set(x, y + 1, ramp[base + 1]);
    }
  }
}

/** 미장벽 (흙벽): 얼룩, 금, 아래 4줄 어두운 굽 */
function plaster(ramp, o = {}) {
  const { base = 1, seed = 1, extra } = o;
  const L = new Layer(32, 32);
  L.rect(0, 0, 31, 31, (x, y) => (blot(x, y, seed) < 0.3 ? ramp[base + 1] : hash(x, y, seed) < 0.03 ? ramp[base + 1] : ramp[base]));
  L.rect(0, 0, 31, 0, ramp[base - 1]);
  for (const [x0, y0] of [[6, 4], [22, 12]]) {
    let x = x0;
    for (let y = y0; y < y0 + 7; y++) {
      L.set(x, y, ramp[base + 2]);
      x += hash(x, y, seed) < 0.4 ? 1 : 0;
    }
  }
  L.rect(0, 26, 31, 26, ramp[base + 2]);
  L.rect(0, 27, 31, 31, (x, y) => (hash(x, y, seed + 2) < 0.06 ? ramp[base + 2] : ramp[base + 1]));
  extra?.(L);
  return L;
}

// ---------------------------------------------------------------------
// 덧칠 (돌 위 눈, 이끼, 룬 점, 불씨)
// ---------------------------------------------------------------------
const snowCaps = (L, h = 8) => {
  for (let y = 0; y < 32; y += h) for (let x = 0; x < 32; x++) {
    L.set(x, y, SNOW[0]);
    if (hash(x, y, 4) < 0.6) L.set(x, y + 1, SNOW[1]);
    if (hash(x, y, 5) < 0.25) L.set(x, y + 2, SNOW[2]);
  }
};
const dots = (L, n, seed, colors) => {
  for (let i = 0; i < n; i++) L.set(Math.floor(hash(i, 1, seed) * 30) + 1, Math.floor(hash(i, 2, seed) * 30) + 1, colors[i % colors.length]);
};
const patches = (L, seed, colors, amount = 0.25, cell = 8) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const b = blot(x, y, seed, cell);
    if (b > 1 - amount) L.set(x, y, b > 1 - amount * 0.45 ? colors[0] : colors[1]);
  }
};

/** 녹다 만 눈: 칸 안쪽에 작은 덩어리 몇 개 (칸 가장자리에 닿지 않아 격자로 보이지 않음) */
const snowBits = (L, seed) => {
  const n = 2 + Math.floor(hash(7, 7, seed) * 2);
  for (let k = 0; k < n; k++) {
    const cx = 6 + hash(k, 1, seed) * 20;
    const cy = 6 + hash(k, 2, seed) * 20;
    const r = 1.8 + hash(k, 3, seed) * 2.2;
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r * 1.4 - 1); x <= cx + r * 1.4 + 1; x++) {
      const d = Math.hypot((x - cx) / 1.4, y - cy) / r + (hash(x, y, seed + k) - 0.5) * 0.45;
      if (d < 1 && x > 0 && y > 0 && x < 31 && y < 31) L.set(x, y, d < 0.55 ? SNOW[1] : SNOW[2]);
    }
  }
};

// ---------------------------------------------------------------------
// 타일 목록 (이름 → 그림). seed만 다른 갈래는 VARIANTS
// ---------------------------------------------------------------------
const MOSS = [R.green[1], R.green[2], R.green[3]];
const make = {
  stone: (s = 1) => slabs(GREY, { base: 1, seed: s }),
  stone2: (s = 2) => slabs(GREY, { base: 1, w: 16, h: 8, stagger: 8, seed: s, crack: 0 }),
  wood: (s = 3) => planks(WOOD, { base: 1, seed: s }),
  castle_top: () => wallTop(GREY, { base: 2 }),
  castle_wall: (s = 4) => bricks(GREY, { base: 3, mortar: GREY[4], seed: s }),
  castle_moss: (s = 5) => bricks(GREY, { base: 3, mortar: GREY[4], seed: s, moss: MOSS }),
  castle_base: () =>
    bricks(GREY, {
      base: 3,
      mortar: GREY[4],
      seed: 6,
      extra: (L) => {
        L.rect(0, 22, 31, 25, (x, y) => (hash(x, y, 1) < 0.4 ? DARK[2] : DARK[1]));
        L.rect(0, 26, 31, 31, (x, y) => (y === 26 ? R.sky[1] : hash(x, y, 2) < 0.1 ? R.navy[1] : R.navy[2]));
        dots(L, 3, 8, MOSS);
      },
    }),
  water: (s = 7) => water([R.sky[1], R.navy[1], R.navy[2], R.navy[3]], { base: 2, seed: s }),
  water2: (s = 7) => water([R.sky[1], R.navy[1], R.navy[2], R.navy[3]], { base: 2, seed: s, frame: 1 }),
  cobble: (s = 8) => {
    const L = new Layer(32, 32);
    L.rect(0, 0, 31, 31, GREY[4]);
    // 둥근 돌 (8x8 격자를 조금씩 흔들어)
    for (let j = 0; j < 5; j++)
      for (let i = 0; i < 5; i++) {
        const cx = i * 8 - 4 + (j % 2) * 4 + Math.floor(hash(i, j, s) * 2);
        const cy = j * 8 - 4 + Math.floor(hash(j, i, s) * 2);
        const tone = hash(i, j, s + 1) < 0.3 ? 2 : 1;
        L.ellipse(cx + 4, cy + 4, 3.4, 3.2, (x, y, nx, ny) => {
          const xx = ((x % 32) + 32) % 32;
          const yy = ((y % 32) + 32) % 32;
          const c = nx + ny < -0.9 ? GREY[tone - 1] : nx + ny > 0.8 ? GREY[tone + 1] : GREY[tone];
          L.set(xx, yy, c);
          return null;
        });
      }
    return L;
  },
  sewer_floor: (s = 9) => slabs(GREY, { base: 2, w: 16, h: 8, stagger: 8, seed: s, crack: 0, tint: R.green[3] }),
  sewer_floor2: (s = 10) => slabs(GREY, { base: 2, w: 16, h: 8, stagger: 8, seed: s, crack: 1, extra: (L) => dots(L, 6, s, [R.green[2], R.green[3]]) }),
  sewer_water: (s = 11) => water([DARK[1], DARK[2], DARK[3], DARK[4]], { base: 2, seed: s, glint: DARK[0], specks: [R.green[3], R.green[2]] }),
  sewer_water2: (s = 11) => water([DARK[1], DARK[2], DARK[3], DARK[4]], { base: 2, seed: s, frame: 1, glint: DARK[0], specks: [R.green[3], R.green[2]] }),
  deep_water: (s = 12) => water([DARK[2], DARK[3], DARK[4], DARK[4]], { base: 1, seed: s, glint: R.navy[2] }),
  deep_water2: (s = 12) => water([DARK[2], DARK[3], DARK[4], DARK[4]], { base: 1, seed: s, frame: 1, glint: R.navy[2] }),
  sewer_wall_top: () => wallTop(DARK, { base: 2 }),
  sewer_wall: (s = 13) => bricks(DARK, { base: 1, seed: s, moss: [R.green[2], R.green[3], R.green[3]] }),
  cistern_floor: (s = 14) => slabs(GREY, { base: 2, seed: s, w: 32, h: 16, crack: 2 }),
  cellar_floor: (s = 15) => ground(DIRT, { base: 2, seed: s, pebbles: 2 }),
  mud: (s = 16) => ground(DIRT, { base: 2, seed: s, pebbles: 2, extra: (L) => patches(L, s + 3, [DIRT[3], DIRT[4]], 0.18) }),
  mud_snow: (s = 17) => ground(DIRT, { base: 2, seed: s, pebbles: 1, extra: (L) => snowBits(L, s + 4) }),
  shack_wall: (s = 18) => planks(WOOD, { base: 2, size: 16, vertical: true, seed: s, grain: 0.03 }), // 결은 아주 드문드문, 판자 이음매만 또렷하게
  bridge: (s = 19) => planks(WOOD, { base: 1, size: 8, seed: s }),
  grass: (s = 20) => grass(R.green, { base: 1, seed: s, flowers: 0 }),
  sand: (s = 21) => ground(SAND, { base: 1, seed: s, pebbles: 1, specks: 0.015, dark: 0.08 }),
  river: (s = 22) => water([R.sky[0], R.sky[1], R.sky[2], R.sky[3]], { base: 2, seed: s, glint: R.white[0] }),
  // 사막 바닥은 결만 두고, 모래 자국은 엔진이 칸마다 모양·자리·방향을 흩뜨려 그림 (칸마다 같은 자국이 되풀이돼 격자로 보이던 것, 점검_피드백2 3-1)
  // 사막: 칸 안 밝은 얼룩이 칸마다 같은 "ㄱ" 모양으로 되풀이돼 보여서 뺌 (점검_피드백3 1-2). 무늬는 맵 위에 흩뿌리는 자국(mapData)으로만
  desert: (s = 23) => ground(SAND, { base: 1, seed: s, pebbles: 0, specks: 0.012, light: 0, dark: 0.03 }),
  desert2: (s = 24) => ground(SAND, { base: 1, seed: s, pebbles: 0, specks: 0.012, light: 0, dark: 0.03 }),
  dune: (s = 25) => ground(SAND, { base: 1, seed: s, pebbles: 0, specks: 0.012, light: 0, dark: 0.04 }),
  sandstone: (s = 26) => bricks(SAND, { base: 2, h: 8, w: 32, rough: 1, seed: s, mortar: SAND[4] }),
  sandstone_top: () => wallTop(SAND, { base: 1 }),
  oasis_water: (s = 27) => water([R.white[0], R.sky[0], R.sky[1], R.sky[2]], { base: 2, seed: s, glint: R.white[0] }),
  oasis_grass: (s = 28) => grass(R.green, { base: 1, seed: s, tufts: 8, bg: ground(SAND, { base: 1, seed: s, pebbles: 0 }) }),
  adobe_wall: (s = 29) => plaster(SAND, { base: 2, seed: s }),
  adobe_roof: (s = 30) => planks(SAND, { base: 1, size: 4, vertical: true, seed: s, gap: false }),
  adobe_floor: (s = 31) => ground(SAND, { base: 2, seed: s, pebbles: 2 }),
  road: (s = 32) => ground(SAND, { base: 2, seed: s, pebbles: 5, light: 0.08 }),
  rock_floor: (s = 33) => ground(GREY, { base: 2, seed: s, pebbles: 5 }),
  rock_wall: (s = 34) => bricks(ROCK, { base: 2, h: 8, w: 32, rough: 1, seed: s }),
  dry_field: (s = 35) =>
    ground(DIRT, {
      base: 1,
      seed: s,
      pebbles: 0,
      extra: (L) => {
        // 밭고랑 (8px마다 가로 줄)
        for (let y = 3; y < 32; y += 8) for (let x = 0; x < 32; x++) {
          L.set(x, y, DIRT[3]);
          L.set(x, y + 1, DIRT[2]);
          L.set(x, y - 1, DIRT[0]);
        }
      },
    }),
  dry_grass: (s = 36) => grass([R.sand[0], R.sand[1], R.sand[2], R.sand[3]], { base: 1, seed: s, tufts: 9 }),
  forest_floor: (s = 37) =>
    grass([R.green[2], R.green[3], DARK[3]], { base: 1, seed: s, tufts: 4, extra: (L) => dots(L, 8, s, [R.wood[2], R.wood[1], R.green[2]]) }),
  ruin_wall: (s = 38) => bricks(DARK, { base: 1, seed: s, rough: 1, moss: MOSS }),
  // 서리 들판: 상아색 바탕에 서리 점(흰색)만 드문드문. 얼룩은 아주 옅게
  frost_field: (s = 39) => ground(IVORY, { base: 2, seed: s, pebbles: 1, specks: 0.01, light: 0.05, dark: 0.03, extra: (L) => dots(L, 10, s + 3, [SNOW[0], SNOW[1]]) }),
  frost_road: (s = 40) => ground(IVORY, { base: 3, seed: s, pebbles: 3, specks: 0.015, light: 0.1, dark: 0.02, extra: (L) => dots(L, 6, s + 3, [IVORY[2], SNOW[1]]) }),
  ice: (s = 41) => {
    const L = new Layer(32, 32);
    L.rect(0, 0, 31, 31, (x, y) => (blot(x, y, s, 16) < 0.4 ? R.sky[1] : R.sky[0]));
    for (let i = 0; i < 4; i++) {
      const x0 = Math.floor(hash(i, 1, s) * 32);
      for (let k = 0; k < 9; k++) L.set((x0 + k) % 32, (Math.floor(hash(i, 2, s) * 32) + k) % 32, R.white[0]);
    }
    for (let i = 0; i < 2; i++) {
      let x = Math.floor(hash(i, 3, s) * 28) + 2;
      for (let y = Math.floor(hash(i, 4, s) * 20); y < 32 && y >= 0; y += 1) {
        L.set(x, y, R.sky[2]);
        x += hash(x, y, s) < 0.5 ? 1 : -1;
        if (hash(y, x, s) < 0.15) break;
      }
    }
    return L;
  },
  snow: (s = 42) => ground(SNOW, { base: 1, seed: s, pebbles: 0, specks: 0.015, light: 0.1, dark: 0.04, extra: (L) => dots(L, 4, s, [SNOW[0], R.sky[0]]) }),
  snow_path: (s = 43) => ground(SNOW, { base: 2, seed: s, pebbles: 3, specks: 0.02, light: 0.1, dark: 0.03, extra: (L) => dots(L, 8, s + 1, [SNOW[1], SNOW[0]]) }),
  snow_rock: (s = 44) => bricks(GREY, { base: 3, mortar: GREY[4], seed: s, rough: 1, extra: (L) => snowCaps(L) }),
  dwarf_floor: (s = 45) => slabs(GREY, { base: 2, seed: s, crack: 1 }),
  stone_bridge: (s = 46) => slabs(IVORY, { base: 2, w: 32, h: 8, stagger: 12, seed: s, crack: 0 }),
  dwarf_wall: (s = 47) => bricks(ROCK, { base: 2, seed: s }),
  forge_floor: (s = 48) => slabs(DARK, { base: 1, seed: s, crack: 1, extra: (L) => dots(L, 5, s, [R.fire[2], R.fire[3]]) }),
  black_rock: (s = 49) =>
    ground(DARK, {
      base: 2,
      seed: s,
      pebbles: 2,
      extra: (L) => {
        // 붉은 금: 갈래 하나(씨앗 88)에만 길게 하나. 칸마다 짧은 금을 넣으면 붉은 점이 흩어진 것처럼 지저분해 보임
        if (s !== 88) return;
        let x = Math.floor(hash(1, 1, s) * 20) + 4;
        const y0 = Math.floor(hash(1, 2, s) * 16) + 4;
        const len = 9 + Math.floor(hash(1, 3, s) * 6);
        for (let y = y0; y < y0 + len; y++) {
          L.set(x, y, R.red[3]);
          if (y === y0 + 2) L.set(x, y, R.fire[3]);
          x += hash(y, x, s) < 0.5 ? 1 : 0;
        }
      },
    }),
  lava: () => lava(50, 0),
  lava2: () => lava(50, 1),
  lava_rock_wall: (s = 51) => bricks(DARK, { base: 2, seed: s, rough: 1, mortar: R.fire[3], extra: (L) => dots(L, 3, s, [R.fire[2]]) }),
  astra_floor: (s = 52) =>
    slabs(IVORY, {
      base: 1,
      seed: s,
      crack: 0,
      extra: (L) => {
        // 판 모서리에 보라 룬 점
        for (const [x, y] of [[15, 15], [31, 15], [15, 31], [31, 31]]) {
          L.set(x, y, R.violet[1]);
        }
        L.set(7, 7, R.violet[0]);
        L.set(23, 23, R.violet[0]);
      },
    }),
  astra_wall: (s = 53) =>
    bricks(ROCK, {
      base: 1,
      seed: s,
      extra: (L) => {
        L.rect(0, 28, 31, 28, R.violet[1]);
        L.rect(0, 29, 31, 29, R.violet[2]);
        for (let x = 3; x < 32; x += 8) L.set(x, 28, R.violet[0]);
      },
    }),
};

/** 예전 이름 → 새 그림 */
export const WORLD_TILES = Object.fromEntries(Object.entries(make).map(([k, f]) => [k, f()]));

// 바닥 무늬 갈래 (seed만 다르게). 엔진이 칸마다 섞어 깖
const VAR = {
  stone: [61, 62],
  cobble: [63],
  grass: [64, 65, 90],
  sand: [66, 91],
  desert: [67, 68, 84],
  desert2: [85],
  dune: [86],
  mud: [69, 92],
  cellar_floor: [70],
  road: [71, 93],
  rock_floor: [72, 94],
  dry_grass: [73, 95, 96],
  forest_floor: [74, 97, 98],
  frost_field: [75, 99, 100],
  snow: [76, 77],
  snow_path: [78],
  dwarf_floor: [79, 101],
  black_rock: [80, 87, 88],
  frost_road: [89],
  sewer_floor: [81],
  adobe_floor: [82],
  cistern_floor: [83, 102],
  oasis_grass: [103, 104],
  astra_floor: [105],
  forge_floor: [106],
};
export const WORLD_EXTRA = {};
export const WORLD_VARIANTS = {};
for (const [name, seeds] of Object.entries(VAR)) {
  WORLD_VARIANTS[name] = seeds.map((s, i) => {
    const key = `${name}_v${i + 1}`;
    WORLD_EXTRA[key] = make[name](s);
    return key;
  });
}
/** 움직이는 타일: 이름 → 프레임 4장 (이름_a0~a3). 물은 물결이 좌우로 흔들리고 용암은 끓어오름 */
export const WORLD_ANIM = {};
for (const name of ['water', 'water2', 'sewer_water', 'sewer_water2', 'deep_water', 'deep_water2', 'river', 'oasis_water', 'lava', 'lava2']) {
  if (!make[name]) continue;
  WORLD_ANIM[name] = [0, 1, 2, 3].map((f) => {
    ANIM_F = f;
    const key = `${name}_a${f}`;
    WORLD_EXTRA[key] = make[name]();
    return key;
  });
}
ANIM_F = 0;
// 나중에 더한 갈래: 위 목록 뒤에 덧붙임 (앞의 타일 번호는 그대로)
for (const [name, seeds] of Object.entries({ mud_snow: [107, 108], desert: [109, 110, 111], desert2: [112, 113], dune: [114] })) {
  const had = WORLD_VARIANTS[name] ?? [];
  WORLD_VARIANTS[name] = [...had, ...seeds.map((s, i) => {
    const key = `${name}_v${had.length + i + 1}`;
    WORLD_EXTRA[key] = make[name](s);
    return key;
  })];
}
/** 벽 아래 그림자 띠를 까는 벽 */
export const WORLD_SHADOW = [
  'castle_wall', 'castle_moss', 'sewer_wall', 'cellar_wall', 'shack_wall', 'sandstone', 'adobe_wall', 'rock_wall', 'ruin_wall', 'snow_rock', 'dwarf_wall', 'lava_rock_wall', 'astra_wall',
];
