// 새 도트 생성기 (32x48 인물, 그림은 K배 고해상도). 기준: docs/도트기준.md
// 모든 그림 파일은 K배(2배)로 쓰고 hd_sprites.json의 _hd에 적는다 → 엔진(src/game/hdTex.ts)이 논리 크기로 다룸
// 실행: npm run art:hd
//
// 만드는 파일
//   public/assets/sprites/{id}.png          필드 시트 32x48, 5열 x 8행 (예전 32x40과 같은 배치)
//     0~3행: 걷기(서기, 걷기1~4) 아래, 왼쪽, 오른쪽, 위
//     4~7행: 점프(웅크림, 뛰어오름, 꼭대기, 착지, 서기) 같은 방향 순서
//   public/assets/battle/chars/{id}.png     전투 시트 48x48, 12열 x 4행 (예전과 같은 배치, 인물만 커짐)
//   (발밑 그림자는 엔진이 팔레트 그림자색 #2a1a48 35%로 타원을 깖: ExploreScene SHADOW_HD)
//   src/data/explore/hd_sprites.json        새 도트 목록과 크기 (엔진·outputs.mjs가 읽음)
//   tools/pixel-art/preview_hd.png          확인용
//
// 여기 있는 인물은 예전 생성기(outputs.mjs, gen-battle.mjs)가 덮어쓰지 않는다.
import { writeFileSync, mkdirSync, existsSync, copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { readPNG } from './png-read.mjs';
import { TILES, EXTRA, VARIANTS, ALTERNATE, SHADOW_BELOW, PROPS } from './hd/palace.mjs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PEOPLE, FACE_SETS, drawPerson as drawPerson25, drawWeapon, FOOT } from './hd/people.mjs';
import { drawTall, isTall, tallBattleSheet, tallStanceSheet, STANCE_COLS } from './hd/tall.mjs';
// 3등신 인물(hd/tall.mjs TALL 표)은 새 방식으로, 나머지는 2.5등신(hd/people.mjs)
const drawPerson = (id, v, o) => (isTall(id) ? drawTall(id, v, o) : drawPerson25(id, v, o));
import { RAMPS as R } from './palette.mjs';
import { Layer, K, scale2x } from './hd/layer.mjs';
import { WORLD_TILES, WORLD_EXTRA, WORLD_VARIANTS, WORLD_SHADOW, WORLD_ANIM } from './hd/world.mjs';
import { remapData } from './hd/remap.mjs';
import { palaceHi, creaturesHi } from './hd/redraw.mjs';
import { finish, putRGBA } from './hd/hicv.mjs';
import { SMALLS, DECOR } from './hd/smalls.mjs';
import { JUMP_ART } from './hd/jumps.mjs';
import { jumpSheet } from './gen-jumps.mjs';
// 예전 그림 코드(gen-palace.mjs, creatures.mjs)를 고해상도 캔버스로 다시 실행한 결과
const PAL_HI = await palaceHi();
const CRE_HI = (await creaturesHi()).CREATURES;
const HI_TILE = Object.fromEntries(PAL_HI.TILES.map((t) => [t.key, t.cv]));
const HI_PROP = Object.fromEntries(PAL_HI.PROPS.map((p) => [p.key, p.frames]));
/** 고해상도 Layer 여러 장 → 시트 PNG (cw, ch: 논리 칸 크기) */
function hiSheet(layers, cw, ch, cols) {
  const W = cw * K * cols;
  const H = ch * K * Math.ceil(layers.length / cols);
  const d = new Uint8Array(W * H * 4);
  layers.forEach((L, n) => L && putRGBA(d, W, L, (n % cols) * cw * K, Math.floor(n / cols) * ch * K));
  return encodePNG(W, H, d);
}
import { encodePNG } from './png.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const VIEWS = ['down', 'left', 'right', 'up'];

// 예전 도트(32x40)의 키(발끝~정수리)는 39, 새 도트는 44 → 머리 위 표시를 이만큼 올림
const OLD_HEIGHT = 39;

// ---------------------------------------------------------------------
// 필드 시트
// ---------------------------------------------------------------------
function fieldSheet(id) {
  const frames = [];
  for (const v of VIEWS) {
    // 서기, 걷기 4프레임: 발 닿음(몸이 1px 내려감, 팔·망토 크게 흔듦) → 한 발 들고 지나감 → 반대 발 닿음 → 지나감
    frames.push(
      drawPerson(id, v),
      drawPerson(id, v, { step: 'a', dy: 1, swing: 2, sway: -1, flare: 2 }),
      drawPerson(id, v, { step: 'pa', swing: 0, flare: 1 }),
      drawPerson(id, v, { step: 'b', dy: 1, swing: -2, sway: 1, flare: 2 }),
      drawPerson(id, v, { step: 'pb', swing: 0, flare: 1 }),
    );
  }
  for (const v of VIEWS) {
    frames.push(
      drawPerson(id, v, { dy: 2 }),
      drawPerson(id, v, { lift: 3 }),
      drawPerson(id, v, { lift: 4 }),
      drawPerson(id, v, { dy: 2 }),
      // 마지막 칸: 숨쉬기 (몸 1칸 내려가고 망토·머리 끝이 1칸 흔들림). 엔진이 서 있을 때 서기 칸과 번갈아 씀 (움직임_피드백 1절)
      isTall(id) ? drawPerson(id, v, { dy: 0.5, sway: 1 }) : drawPerson(id, v),
    );
  }
  return frames;
}

// ---------------------------------------------------------------------
// 전투 시트 (48x48 칸, 32x48 인물을 (8, 2)에 놓아 발끝이 칸 아래 끝에 닿음)
// 열: 0 공격1 준비, 1 공격1, 2 공격2 준비, 3 공격2, 4 공격3 준비, 5 공격3,
//     6 막기, 7 피격, 8~9 시전(서기), 10 무릎 꿇음, 11 쓰러짐
// ---------------------------------------------------------------------
const OX = 8;
const OY = 2;
// 손 위치(인물 32x48 기준)와 칼 각도. up 보기는 칼을 몸 뒤에
const POSES = {
  down: {
    a1w: { h: [25, 24], ang: -60 }, a1s: { h: [20, 33], ang: 125 },
    a2w: { h: [6, 26], ang: -120 }, a2s: { h: [12, 33], ang: 55 },
    a3w: { h: [16, 17], ang: -90, dy: -1 }, a3s: { h: [16, 35], ang: 90, dy: 2 },
    guard: { h: [7, 29], ang: 0 },
  },
  right: {
    a1w: { h: [14, 25], ang: -130 }, a1s: { h: [22, 30], ang: 15 },
    a2w: { h: [14, 33], ang: 150 }, a2s: { h: [22, 26], ang: -25 },
    a3w: { h: [17, 19], ang: -100, dx: -1 }, a3s: { h: [24, 30], ang: 3, dx: 2 },
    guard: { h: [22, 35], ang: -90 },
  },
  up: {
    a1w: { h: [25, 24], ang: -30, behind: true }, a1s: { h: [12, 20], ang: -120 },
    a2w: { h: [6, 24], ang: -150, behind: true }, a2s: { h: [20, 20], ang: -60 },
    a3w: { h: [16, 14], ang: -90 }, a3s: { h: [16, 10], ang: -90, dy: -2 },
    guard: { h: [6, 24], ang: 0, behind: true },
  },
};
const SHOULDERS = { down: [[9, 22], [22, 22]], up: [[9, 22], [22, 22]], right: [[15, 22]] };
const HANG = { down: [[9, 22], [8, 30]], up: [[22, 22], [23, 30]] };

// 마력 구슬 (시전 손)
function orb(cell, cx, cy, r, ramp) {
  const O = new Layer(48, 48);
  O.ellipse(cx, cy, r, r, (x, y, nx, ny) => (nx * nx + ny * ny < 0.25 ? ramp[0] : ny < 0 ? ramp[1] : ramp[2]));
  O.outline();
  O.set(cx - r * 0.4, cy - r * 0.4, ramp[0]);
  cell.over(O);
}
// 시전 손 위치 (인물 32x48 기준)
const CAST_HAND = { down: [24, 28], right: [22, 27], up: [7, 28] };
const hash01 = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function battleFrame(id, view, col) {
  const p = PEOPLE[id];
  const cfg = p.battle ?? { weapon: p.weapon };
  const v = view === 'left' ? 'right' : view;
  const cell = new Layer(48, 48);
  const fwd = { down: [0, 1], right: [1, 0], up: [0, -1] }[v];
  const put = (body, dx = 0, dy = 0) => cell.over(body, OX + dx, OY + dy);
  // 칼을 휘두르는 인물은 손에 든 물건(허리 칼, 등의 칼)을 숨김. 찌르기·마법형은 그대로
  const hide = !cfg.lunge && !cfg.cast;
  const P = (vv, o = {}) => drawPerson(id, vv, { battle: hide, ...o });
  const drop = p.drop ?? 0;
  let res = cell;
  if (col === 11) {
    const lying = P('down').rot90();
    cell.over(lying, 0, 48 - 32 - 0);
  } else if (col === 10) {
    put(P(v, { dy: 5, lift: 0 }));
  } else if (col === 7) {
    put(P(v), -fwd[0] * 2, -fwd[1] * 2 + 1);
  } else if (col >= 8) {
    if (cfg.prep) {
      // 자폭 준비: 웅크리고 몸 안쪽에서 하얀 빛이 새어 나옴
      const b = P(v, { dy: 2 });
      for (let y = 0; y < b.h; y++)
        for (let x = 0; x < b.w; x++) if (b.d[y][x] && hash01(x + col * 7, y + v.length) < (col === 8 ? 0.12 : 0.28)) b.d[y][x] = hash01(y, x) > 0.5 ? R.white[0] : R.sky[0];
      put(b);
    } else {
      put(P(v, { dy: col === 9 ? -1 : 0 }));
      if (cfg.cast) {
        const [hx, hy] = CAST_HAND[v];
        orb(cell, OX + hx, OY + hy + drop - (col === 9 ? 1 : 0), col === 8 ? 2.5 : 4, cfg.cast);
      }
    }
  } else if (cfg.lunge) {
    // 몸에 든 창·활을 내밀며 찌름 (홀수 열 = 찌름)
    const d = col % 2 === 1 ? 3 : -1;
    put(P(v), fwd[0] * d, fwd[1] * d);
  } else if (cfg.cast) {
    // 마법형: 손을 내밀어 마력을 쏨
    const k = col % 2;
    put(P(v), fwd[0] * k, fwd[1] * k);
    if (k === 1 || col === 6) {
      const [hx, hy] = CAST_HAND[v];
      orb(cell, OX + hx + fwd[0] * 3 + fwd[0] * k, OY + hy + drop + fwd[1] * 3 + fwd[1] * k, 3, cfg.cast);
    }
  } else {
    const pose = ['a1w', 'a1s', 'a2w', 'a2s', 'a3w', 'a3s', 'guard'][col];
    const pz = POSES[v][pose];
    const [hx, hy] = pz.h;
    // 칼 쥔 팔: 손에 가까운 어깨에서
    const sh = SHOULDERS[v].reduce((a, b) => (Math.abs(b[0] - hx) < Math.abs(a[0] - hx) ? b : a));
    const arms = [{ from: sh, to: [hx, hy - 1] }];
    if (v !== 'right') {
      const other = SHOULDERS[v].find((s) => s !== sh);
      arms.unshift({ from: other, to: [other[0] < 16 ? other[0] - 1 : other[0] + 1, 30] });
    }
    const body = P(v, { arms, dy: pz.dy ?? 0 });
    const wp = drawWeapon(cfg.weapon, OX + hx + (pz.dx ?? 0), OY + hy + (pz.dy ?? 0) + drop, pz.ang);
    if (pz.behind) {
      cell.over(wp);
      put(body, pz.dx ?? 0);
    } else {
      put(body, pz.dx ?? 0);
      cell.over(wp);
    }
    if (cfg.dual && col !== 6) {
      // 쌍단검: 반대 손에도 하나 (몸 뒤)
      const w2 = drawWeapon(cfg.weapon, OX + (v === 'right' ? hx - 6 : 32 - hx), OY + hy + 2 + drop, 180 - pz.ang);
      cell.under(w2);
    }
  }
  return view === 'left' ? res.flipX() : res;
}

function battleSheet(id) {
  if (isTall(id)) return tallBattleSheet(id);
  const frames = [];
  for (const v of VIEWS) for (let col = 0; col < 12; col++) frames.push(battleFrame(id, v, col));
  return frames;
}

// ---------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function toPNG(frames, cw, ch, cols, scale = 1, bg = null) {
  cw *= K;
  ch *= K;
  const rows = Math.ceil(frames.length / cols);
  const W = cw * cols * scale;
  const H = ch * rows * scale;
  const d = new Uint8Array(W * H * 4);
  if (bg) for (let i = 0; i < W * H; i++) d.set([...rgb(bg), 255], i * 4);
  frames.forEach((L, n) => {
    if (!L) return;
    const ox = (n % cols) * cw;
    const oy = Math.floor(n / cols) * ch;
    for (let y = 0; y < Math.min(L.h, ch); y++)
      for (let x = 0; x < Math.min(L.w, cw); x++) {
        const c = L.d[y][x];
        if (!c) continue;
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) d.set([...rgb(c), 255], (((oy + y) * scale + sy) * W + (ox + x) * scale + sx) * 4);
      }
  });
  return encodePNG(W, H, d);
}
const write = (rel, buf) => {
  const f = join(ROOT, rel);
  mkdirSync(dirname(f), { recursive: true });
  // 개발 서버·백신이 파일을 잠깐 잡고 있으면 열기가 실패함: 조금 기다렸다 다시
  for (let i = 0; ; i++) {
    try {
      writeFileSync(f, buf);
      break;
    } catch (e) {
      if (i >= 8) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
    }
  }
  if (rel.startsWith('public/assets/')) HD[rel.slice('public/'.length)] = K;
  console.log('만듦', rel);
};

/** 1배 RGBA → K배 (Scale2x: 계단 모서리를 둥글게) */
function upscale(w, h, data) {
  const rows = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => {
    const i = (y * w + x) * 4;
    return data[i + 3] ? (data[i] << 24 | data[i + 1] << 16 | data[i + 2] << 8 | data[i + 3]) >>> 0 : null;
  }));
  let g = rows;
  for (let s = 1; s < K; s *= 2) g = scale2x(g);
  const out = new Uint8Array(w * K * h * K * 4);
  g.forEach((r, y) => r.forEach((v, x) => { if (v !== null) out.set([v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255], (y * w * K + x) * 4); }));
  return out;
}

// 예전 그림을 public/assets/_old/ 아래 같은 자리로 한 번 복사
function keepOld(rel) {
  const old = join(ROOT, rel.replace('public/assets/', 'public/assets/_old/'));
  if (existsSync(old) || !existsSync(join(ROOT, rel))) return;
  mkdirSync(dirname(old), { recursive: true });
  copyFileSync(join(ROOT, rel), old);
}
const list = {};
const STANCE_IDS = ['leon', 'leon_hood', 'leon_blade', 'serena', 'serena_hood', 'elysia', 'karg', 'adrian', 'galia'];
// 고해상도로 쓴 파일 (public 아래 경로 → 배수). write()가 public/assets/ 아래 파일을 적음
const HD = {};
const preview = [];
for (const id of Object.keys(PEOPLE)) {
  const field = fieldSheet(id);
  keepOld(`public/assets/sprites/${id}.png`);
  write(`public/assets/sprites/${id}.png`, toPNG(field, 32, 48, 5));
  // 전투 시트는 예전에 전투 시트가 있던 인물만 (예전 그림은 _old로 옮겨 둠)
  const bt = `public/assets/battle/chars/${id}.png`;
  const base = PEOPLE[id].variantOf ?? id;
  if (existsSync(join(ROOT, `public/assets/battle/chars/${base}.png`)) || existsSync(join(ROOT, 'public/assets/_old/battle/chars', `${base}.png`))) {
    keepOld(bt);
    write(bt, toPNG(battleSheet(id), 48, 48, 12));
  }
  // 전투 자세 시트 (파티만): 전투 자세 서기·걷기, 공격 뒤따름·거둠 (움직임_피드백 3절)
  if (STANCE_IDS.includes(id)) write(`public/assets/battle/chars/${id}_stance.png`, toPNG(tallStanceSheet(id), 48, 48, STANCE_COLS));
  const top = Math.min(...field.slice(0, 1).map((f) => f.bounds().y0));
  list[id] = { w: 32, h: 48, foot: 48 - 1 - FOOT, rise: FOOT - top + 1 - OLD_HEIGHT };
  preview.push(...field.slice(0, 20).filter((_, i) => i % 5 !== 4));
}
write('tools/pixel-art/preview_hd.png', toPNG(preview, 32, 48, 16, 3, '#8fb08a'));

// ---------------------------------------------------------------------
// 황궁 타일: 예전 생성기(build.mjs)가 만든 palace_tiles.png에서 새로 그린 칸만 바꾸고,
// 바닥 무늬 갈래를 맨 뒤 줄에 덧붙인다. 예전 그림은 public/assets/_old/explore/에 한 번 복사
// ---------------------------------------------------------------------
const sprites = JSON.parse(readFileSync(join(ROOT, 'src/data/explore/sprites.json'), 'utf8'));
const NAMES = sprites.tiles.names;
const COLS = sprites.tiles.columns;
const tilesFile = join(ROOT, 'public', sprites.tiles.file);
const oldTiles = join(ROOT, 'public/assets/_old/explore/palace_tiles.png');
if (!existsSync(oldTiles)) {
  mkdirSync(dirname(oldTiles), { recursive: true });
  copyFileSync(tilesFile, oldTiles);
}
const AVG = {};
{
  // 바탕은 예전 그림(_old). 새로 그리지 않은 칸은 새 팔레트로 옮겨 칠함
  const src = readPNG(oldTiles);
  src.data = remapData(src.data);
  const ALL_EXTRA = { ...EXTRA, ...WORLD_EXTRA };
  const extra = Object.keys(ALL_EXTRA);
  const total = NAMES.length + extra.length;
  const T = 32 * K;
  const W = COLS * T;
  const H = Math.ceil(total / COLS) * T;
  const d = new Uint8Array(W * H * 4);
  // 예전 칸 (덧붙인 줄은 빼고 이름 수만큼)
  // 예전 칸은 K배로 키움 (타일 경계가 어긋나지 않게 가장 가까운 칸 그대로)
  const keepRows = Math.ceil(NAMES.length / COLS) * 32;
  for (let y = 0; y < Math.min(keepRows, src.h) * K; y++)
    for (let x = 0; x < Math.min(COLS * 32, src.w) * K; x++) {
      const i = (Math.floor(y / K) * src.w + Math.floor(x / K)) * 4;
      d.set(src.data.subarray(i, i + 4), (y * W + x) * 4);
    }
  const put = (L, n) => {
    const ox = (n % COLS) * T;
    const oy = Math.floor(n / COLS) * T;
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const c = L.d[y][x];
        d.set(c ? [...rgb(c), 255] : [0, 0, 0, 0], ((oy + y) * W + ox + x) * 4);
      }
    if (L.alpha) putRGBA(d, W, { w: 0, h: 0, d: [], alpha: L.alpha }, ox, oy);
  };
  for (const name of NAMES) if (HI_TILE[name] && !TILES[name] && !WORLD_TILES[name]) put(finish(HI_TILE[name], { wrap: true, grain: 0.025 }), NAMES.indexOf(name));
  for (const [name, L] of Object.entries({ ...TILES, ...WORLD_TILES })) {
    if (!NAMES.includes(name)) throw new Error(`타일 이름 없음: ${name}`);
    put(L, NAMES.indexOf(name));
  }
  extra.forEach((name, i) => put(ALL_EXTRA[name], NAMES.length + i));
  // 타일마다 평균 색 (엔진이 바닥 경계를 둥글게 이을 때 씀)
  NAMES.forEach((name, n) => {
    const ox = (n % COLS) * T;
    const oy = Math.floor(n / COLS) * T;
    let r = 0, g = 0, b = 0, k = 0;
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const i = ((oy + y) * W + ox + x) * 4;
        if (d[i + 3] < 255) continue;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; k++;
      }
    if (k > T * T * 0.9) AVG[name] = '#' + [r, g, b].map((v) => Math.round(v / k).toString(16).padStart(2, '0')).join('');
  });
  write(`public/${sprites.tiles.file}`, encodePNG(W, H, d));
  HD[sprites.tiles.file] = K;
}
const tileInfo = {
  anim: WORLD_ANIM,
  avg: AVG,
  extra: Object.keys({ ...EXTRA, ...WORLD_EXTRA }),
  variants: { ...VARIANTS, ...WORLD_VARIANTS },
  alternate: ALTERNATE,
  shadowBelow: [...SHADOW_BELOW, ...WORLD_SHADOW],
};

// 물건: 예전 그림은 public/assets/_old/explore/로 옮겨 두고 같은 크기로 새로 그림
const files = [];
for (const [name, frames] of Object.entries(PROPS)) {
  const p = sprites.props[name];
  const rel = `public/${p.file}`;
  const old = join(ROOT, 'public/assets/_old/explore', `${name}.png`);
  if (!existsSync(old)) copyFileSync(join(ROOT, rel), old);
  write(rel, toPNG(frames, p.w, p.h, frames.length));
  files.push(rel);
}
// 새로 그리지 않은 물건·생물·작은 그림: 예전 그림(_old)을 새 팔레트로 옮겨 칠함 (모양은 그대로)
const remapFile = (rel) => {
  keepOld(rel);
  const old = join(ROOT, rel.replace('public/assets/', 'public/assets/_old/'));
  if (!existsSync(old)) return;
  const im = readPNG(old);
  const up = upscale(im.w, im.h, remapData(im.data));
  write(rel, encodePNG(im.w * K, im.h * K, up));
  files.push(rel);
};
for (const [name, p] of Object.entries(sprites.props)) {
  if (PROPS[name]) continue;
  const rel = `public/${p.file}`;
  if (!HI_PROP[name]) {
    remapFile(rel);
    continue;
  }
  keepOld(rel);
  write(rel, hiSheet(HI_PROP[name].map((f) => finish(f)), p.w, p.h, HI_PROP[name].length));
  files.push(rel);
}
// 생물(필드 걷기 32x40 5열, 전투 12열)과 작은 그림
const HI_FILES = {};
for (const [id, cr] of Object.entries(CRE_HI)) {
  if (cr.walk) HI_FILES[`public/assets/sprites/${id}.png`] = () => hiSheet(cr.walk.map((f) => finish(f)), 32, 40, 5);
  HI_FILES[`public/assets/battle/chars/${id}.png`] = () => hiSheet(cr.battle.map((f) => finish(f)), cr.cell, cr.cell, 12);
}
for (const [id, draw] of Object.entries(SMALLS)) {
  const cv = draw();
  HI_FILES[`public/assets/sprites/${id}.png`] = () => hiSheet([finish(cv, { grain: 0.03 })], cv.w, cv.h, 1);
}
const SKIP = new Set(['shadow', 'shadow_large', '.gitkeep']);
for (const dir of ['public/assets/sprites', 'public/assets/battle/chars']) {
  const seen = new Set();
  for (const where of [dir, dir.replace('public/assets/', 'public/assets/_old/')])
    for (const f of existsSync(join(ROOT, where)) ? readdirSync(join(ROOT, where)) : []) {
      const id = f.replace(/.png$/, '');
      if (!f.endsWith('.png') || SKIP.has(id) || PEOPLE[id] || id.endsWith('_stance') || seen.has(id) || id.endsWith('_2.5')) continue; // _2.5: 예전 2.5등신 인물 보관본
      seen.add(id);
      const rel = `${dir}/${f}`;
      if (HI_FILES[rel]) {
        keepOld(rel);
        write(rel, HI_FILES[rel]());
        files.push(rel);
      } else {
        console.log('다시 그리지 않음(색만 옮김):', rel);
        remapFile(rel);
      }
    }
}
// 장식 소품: 종류마다 한 줄, 프레임 2장 (16x16)
const DECOR_KINDS = Object.keys(DECOR);
// 점프 장애물 (docs/대본/점프_장애물.md): 한 줄에 4칸, 32x32
write('public/assets/explore/jumps.png', jumpSheet());
write('public/assets/explore/decor.png', hiSheet(DECOR_KINDS.flatMap((k) => [0, 1].map((f) => finish(DECOR[k](f), { grain: 0 }))), 16, 16, 2));
writeFileSync(
  join(ROOT, 'src/data/explore/hd_sprites.json'),
  JSON.stringify(
    {
      _설명: 'tools/pixel-art/gen-hd.mjs가 만든 파일 (직접 고치지 말 것). 새 도트(32x48) 인물 목록. foot: 발끝 아래 빈 줄 수, rise: 예전 도트보다 키가 큰 만큼(머리 위 표시를 올림). _tiles: 황궁 타일 뒤에 덧붙인 무늬 갈래·벽 아래 그림자, _files: 여기서 만드는 물건 그림(예전 생성기가 덮어쓰지 않음)',
      ...list,
      _tiles: tileInfo,
      _files: files,
      _decor: { file: "assets/explore/decor.png", size: 16, kinds: DECOR_KINDS },
      _jumps: { file: 'assets/explore/jumps.png', size: 32, kinds: Object.keys(JUMP_ART) },
      _faces: FACE_SETS,
      _hd: HD,
    },
    null,
    2,
  ) + '\n',
);
console.log('만듦 src/data/explore/hd_sprites.json');
