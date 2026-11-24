// 전투용 도트 생성기: 이펙트, 전투 UI, 인물·적 전투 동작 → art/*.txt (글자 격자) + 출력 목록
// 실행: npm run art:battle  (이 파일을 실행한 뒤 build.mjs로 PNG를 만든다)
//
// 만드는 파일
//   art/fx.txt, art/ui.txt, art/battle_chars.txt   글자 격자 (다시 실행하면 덮어씀)
//   battle-outputs.json                              build.mjs가 읽는 출력 목록 (outputs.mjs가 불러옴)
//   src/data/battle/sprites.json                     게임이 읽는 스프라이트 목록 (크기, 프레임 수, 속도)
//
// 색은 palette.json 글자만 쓴다. 이펙트도 인물처럼 진한 윤곽선, 명암 3~4단계, 흐림 없음.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHARS } from './gen-characters.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

import { Cv, rng } from './cv.mjs';

const deg = (d) => (d * Math.PI) / 180;
/** 0~1 → ramp 색 (밝음→어둠) */
const pick = (ramp, t) => ramp[Math.min(ramp.length - 1, Math.max(0, Math.floor(t * ramp.length)))];

// ---------------------------------------------------------------------
// 색 묶음 (palette.json 글자). [가장 밝음 → 어둠], 윤곽
// ---------------------------------------------------------------------
const P = {
  aura: { ramp: ['l', 'v', 'm'], out: 'L' }, // 레온의 흰빛 오러
  light: { ramp: ['l', 'w', 'a'], out: 'W' }, // 시황제의 하얗고 차가운 빛
  spark: { ramp: ['l', 'y', 'Y'], out: 'P' },
  heavy: { ramp: ['l', 'y', 'x', 'X'], out: 'Z' },
  parry: { ramp: ['l', 'w', 'y'], out: 'W' },
  dust: { ramp: ['c', 'd', 'D'], out: 'C' },
  crimson: { ramp: ['x', 'X', 'Z'], out: 'k' }, // 세레나 황혈, 갈리아 띠
  galia: { ramp: ['l', 'x', 'X'], out: 'Z' }, // 갈리아 오러(흰빛) + 진홍
  purple: { ramp: ['i', 'u', 'I'], out: 'k' }, // 엘리시아
  rune: { ramp: ['w', 'a', 'A'], out: 'W' }, // 엘리시아 하늘색 룬
  grey: { ramp: ['r', 't', 'T'], out: 'R' }, // 카르크 회색
  rust: { ramp: ['p', 'o', 'O'], out: 'P' }, // 카르크 붉은 갈색
  gold: { ramp: ['v', 'y', 'Y'], out: 'P' }, // 아드리안 금빛
  silver: { ramp: ['l', 'm', 'M'], out: 'L' },
  red: { ramp: ['x', 'X', 'Z'], out: 'k' },
  green: { ramp: ['q', 'g', 'G'], out: 'Q' },
  sky: { ramp: ['w', 'a', 'A'], out: 'W' },
  dark: { ramp: ['K', 'k', 'k'], out: 'k' },
};

// ---------------------------------------------------------------------
// 이펙트. 한 방향 공격은 오른쪽을 보고 그린다(게임에서 방향에 맞춰 돌림)
// ---------------------------------------------------------------------
const FX = []; // { key, w, h, frames: Cv[], rate, loop, note }
function fx(key, w, h, n, rate, draw, o = {}) {
  const frames = [];
  for (let i = 0; i < n; i++) {
    const c = new Cv(w, h);
    draw(c, i, n);
    frames.push(c);
  }
  FX.push({ key, w, h, frames, rate, loop: !!o.loop, note: o.note ?? '' });
}

/** 베기 궤적: 띠가 a0→a1로 휘두르며 지나가고 마지막엔 가늘어진다 */
function slash(c, i, n, o) {
  const { cx, cy, r, th, a0, a1, pal } = o;
  const grow = Math.min(1, (i + 1) / (n - 1.5));
  const fade = i >= n - 2 ? (i - (n - 3)) / 2 : 0; // 마지막 두 장: 얇아짐
  const end = a0 + (a1 - a0) * grow;
  const thick = th * (1 - fade * 0.65);
  const layer = new Cv(c.w, c.h);
  layer.band(cx, cy, r - thick, r, a0, end, (tr, ta) => {
    // 머리(최근) 쪽이 굵고 밝고, 꼬리 쪽이 가늘다
    const head = Math.abs(ta);
    if (tr < 1 - head * 1.05 - 0.05) return '.';
    return tr > 0.72 ? pal.ramp[0] : tr > 0.4 ? pal.ramp[1] : pal.ramp[2];
  }, o.sy ?? 1);
  if (o.sparks && i < n - 1) {
    const rnd = rng(o.seed ?? 7 + i);
    for (let k = 0; k < o.sparks; k++) {
      const a = a0 + (end - a0) * (0.6 + rnd() * 0.4);
      const d = r + 1 + rnd() * 4;
      layer.set(cx + Math.cos(a) * d, cy + Math.sin(a) * d * (o.sy ?? 1), pal.ramp[0]);
    }
  }
  layer.outline(pal.out);
  c.blit(layer, 0, 0);
}

/** 퍼지는 고리 */
function ring(c, cx, cy, r, th, pal, sy = 1, broken = 0) {
  const l = new Cv(c.w, c.h);
  l.band(cx, cy, Math.max(0, r - th), r, deg(-180), deg(180), (tr, ta) => {
    if (broken && Math.floor(ta * broken * 2) % 2) return '.';
    return tr > 0.6 ? pal.ramp[0] : pal.ramp[1];
  }, sy);
  l.outline(pal.out);
  c.blit(l, 0, 0);
}

/** 흩어지는 작은 점들 */
function motes(c, cx, cy, count, spread, rise, pal, seed, size = 1) {
  const rnd = rng(seed);
  const l = new Cv(c.w, c.h);
  for (let k = 0; k < count; k++) {
    const x = cx + (rnd() - 0.5) * spread * 2;
    const y = cy + (rnd() - 0.5) * spread - rise * (0.5 + rnd() * 0.5);
    if (size > 1 && rnd() > 0.5) l.rect(Math.round(x), Math.round(y), Math.round(x) + 1, Math.round(y) + 1, pal.ramp[rnd() > 0.5 ? 0 : 1]);
    else l.set(x, y, pal.ramp[rnd() > 0.4 ? 0 : 1]);
  }
  l.outline(pal.out);
  c.blit(l, 0, 0);
}

/** 원형 폭발 (가운데 밝음) */
function blast(c, cx, cy, r, pal, hollow = 0) {
  const l = new Cv(c.w, c.h);
  l.disc(cx, cy, r, (t) => (t < hollow ? '.' : t < 0.45 ? pal.ramp[0] : t < 0.75 ? pal.ramp[1] : pal.ramp[2] ?? pal.ramp[1]));
  l.outline(pal.out);
  c.blit(l, 0, 0);
}

/** 바닥의 원(납작한 타원) */
function floorRing(c, cx, cy, rx, ry, pal, th = 2, fill) {
  const l = new Cv(c.w, c.h);
  if (fill) l.ellipse(cx, cy, rx, ry, fill);
  l.band(cx, cy, rx - th, rx, deg(-180), deg(180), (tr) => (tr > 0.5 ? pal.ramp[0] : pal.ramp[1]), ry / rx);
  l.outline(pal.out);
  c.blit(l, 0, 0);
}

/** 앞으로 뻗는 줄기(찌르기, 돌진) */
function streak(c, x0, x1, cy, h, pal, taper = true) {
  const l = new Cv(c.w, c.h);
  for (let x = Math.round(x0); x <= Math.round(x1); x++) {
    const t = (x - x0) / Math.max(1, x1 - x0);
    const hh = taper ? Math.max(0.5, h * (0.35 + 0.65 * t)) : h;
    for (let y = Math.round(cy - hh); y <= Math.round(cy + hh); y++) {
      const tv = Math.abs(y - cy) / Math.max(hh, 0.5);
      l.set(x, y, tv < 0.35 ? pal.ramp[0] : tv < 0.75 ? pal.ramp[1] : pal.ramp[2] ?? pal.ramp[1]);
    }
  }
  l.outline(pal.out);
  c.blit(l, 0, 0);
}

/** 룬 문양(작은 십자·마름모) */
function runeGlyph(c, x, y, ch) {
  c.set(x, y, ch);
  c.set(x - 1, y, ch);
  c.set(x + 1, y, ch);
  c.set(x, y - 1, ch);
  c.set(x, y + 1, ch);
}

// ---- 공통 ----
fx('hit', 32, 32, 4, 20, (c, i) => {
  const r = [5, 9, 11, 8][i];
  if (i < 3) c.star(16, 16, r, 8, P.spark.ramp, deg(i * 12), i === 0 ? 0.6 : 0.3);
  else motes(c, 16, 16, 8, 10, 0, P.spark, 3);
  if (i < 3) c.outline(P.spark.out);
}, { note: '피격 반짝임' });

fx('hit_heavy', 48, 48, 5, 18, (c, i) => {
  if (i < 3) {
    c.star(24, 24, [8, 15, 18][i], 10, P.heavy.ramp, deg(i * 9), 0.35);
    c.outline(P.heavy.out);
  }
  if (i >= 1) ring(c, 24, 24, [0, 12, 17, 20, 22][i], i < 3 ? 2 : 1, P.heavy, 1, i >= 3 ? 6 : 0);
  if (i >= 3) motes(c, 24, 24, 10, 16, 0, P.heavy, 11 + i);
}, { note: '강한 피격' });

fx('block', 32, 32, 4, 20, (c, i) => {
  const rnd = rng(21);
  const l = new Cv(32, 32);
  for (let k = 0; k < 7; k++) {
    const a = deg(-60 + rnd() * 120) + Math.PI; // 왼쪽(공격이 온 쪽)으로 튐
    const d0 = 2 + i * 3;
    const d1 = d0 + 4 - i;
    l.line(16 + Math.cos(a) * d0, 16 + Math.sin(a) * d0, 16 + Math.cos(a) * d1, 16 + Math.sin(a) * d1, k % 2 ? 'l' : 'y');
  }
  if (i < 2) l.disc(16, 16, 2 - i, 'l');
  l.outline(P.block?.out ?? 'O');
  c.blit(l, 0, 0);
}, { note: '막기 성공 불꽃' });

fx('parry', 48, 48, 5, 18, (c, i) => {
  ring(c, 24, 24, [5, 10, 15, 19, 21][i], [3, 3, 2, 1, 1][i], P.parry, 1, i >= 3 ? 8 : 0);
  if (i < 3) {
    const l = new Cv(48, 48);
    const len = [10, 18, 14][i];
    l.line(24 - len, 24, 24 + len, 24, 'l');
    l.line(24, 24 - len * 0.7, 24, 24 + len * 0.7, 'l');
    l.disc(24, 24, [3, 2, 1][i], 'l');
    l.outline('w');
    l.outline(P.parry.out);
    c.blit(l, 0, 0);
  }
}, { note: '튕겨 내기(패링) 섬광' });

fx('guard_break', 48, 48, 4, 16, (c, i) => {
  const rnd = rng(33);
  const l = new Cv(48, 48);
  for (let k = 0; k < 9; k++) {
    const a = rnd() * Math.PI * 2;
    const d = 4 + i * 5 + rnd() * 3;
    const x = 24 + Math.cos(a) * d;
    const y = 24 + Math.sin(a) * d;
    l.line(x, y, x + Math.cos(a + 1) * 2, y + Math.sin(a + 1) * 2, k % 3 ? 'm' : 'l');
  }
  if (i === 0) l.star(24, 24, 9, 6, ['l', 'x', 'X'], 0, 0.3);
  l.outline('L');
  c.blit(l, 0, 0);
}, { note: '막기가 무너짐' });

fx('dust_land', 48, 16, 4, 14, (c, i) => {
  for (const s of [-1, 1]) {
    const x = 24 + s * (6 + i * 4);
    const r = [3, 3.5, 3, 2][i];
    const l = new Cv(48, 16);
    l.disc(x, 11 - i * 0.6, r, (t) => (t < 0.5 ? 'c' : 'd'));
    l.disc(x + s * 4, 12 - i * 0.4, r * 0.7, (t) => (t < 0.5 ? 'c' : 'd'));
    if (i < 3) l.outline('D');
    c.blit(l, 0, 0);
  }
}, { note: '착지 먼지' });

fx('dust_run', 16, 16, 4, 14, (c, i) => {
  const l = new Cv(16, 16);
  l.disc(8 - i, 11 - i, [2, 3, 2.5, 1.5][i], (t) => (t < 0.5 ? 'c' : 'd'));
  if (i < 3) l.outline('D');
  c.blit(l, 0, 0);
}, { note: '달리기 먼지' });

fx('dust_roll', 32, 16, 5, 14, (c, i) => {
  const l = new Cv(32, 16);
  for (let k = 0; k < 3; k++) l.disc(6 + k * 8 - i, 11 - i * 0.5 - (k % 2), [2.5, 3.5, 3.5, 2.5, 1.5][i] - k * 0.3, (t) => (t < 0.5 ? 'c' : 'd'));
  if (i < 4) l.outline('D');
  c.blit(l, 0, 0);
}, { note: '구르기 먼지' });

fx('jump_shadow', 24, 8, 3, 1, (c, i) => {
  const rx = [9, 7, 5][i];
  c.ellipse(12, 4, rx, [2.6, 2.2, 1.8][i], 'z');
}, { note: '점프 그림자 (0=바닥, 2=가장 높이)' });

fx('warn_glow', 48, 56, 4, 10, (c, i) => {
  // 막을 수 없는 공격 예고: 몸을 둘러싸는 붉은 빛 테두리 (게임에서는 인물 윤곽선도 붉게 칠함)
  const l = new Cv(48, 56);
  const rx = 14 + (i % 2);
  l.band(24, 30, rx - 2, rx, deg(-180), deg(180), (tr, ta) => (Math.floor(ta * 16 + i) % 3 === 0 ? '.' : tr > 0.5 ? 'x' : 'X'), 22 / 14);
  for (let k = 0; k < 4; k++) {
    const a = deg(k * 90 + i * 22 - 45);
    l.set(24 + Math.cos(a) * (rx + 3), 30 + Math.sin(a) * (rx + 3) * 1.5, 'x');
  }
  l.outline('Z');
  c.blit(l, 0, 0);
}, { loop: true, note: '막을 수 없는 공격 예고' });

fx('warn_area', 96, 48, 4, 8, (c, i) => {
  // 피할 수 없는 범위 공격 예고: 바닥의 붉은 영역 (게임에서 크기를 키워 씀)
  c.ellipse(48, 24, 46, 22, 'z');
  c.ellipse(48, 24, 46, 22, (d, x, y) => ((x + y + i * 2) % 6 === 0 && d < 0.92 ? 'x' : 'z'));
  const l = new Cv(96, 48);
  l.band(48, 24, 43, 46, deg(-180), deg(180), (tr, ta) => (Math.floor(ta * 24 + i) % 4 === 3 ? 'X' : 'x'), 22 / 46);
  c.blit(l, 0, 0);
}, { loop: true, note: '피할 수 없는 범위 공격 예고' });

fx('gnosis_signal', 48, 56, 4, 12, (c, i) => {
  const l = new Cv(48, 56);
  l.disc(24, 30, [6, 10, 8, 12][i], (t) => (t < 0.5 ? 'l' : t < 0.8 ? 'v' : '.'));
  for (let k = 0; k < 8; k++) {
    const a = deg(k * 45 + i * 11);
    const len = [12, 18, 14, 22][i];
    l.line(24 + Math.cos(a) * 6, 30 + Math.sin(a) * 6, 24 + Math.cos(a) * len, 30 + Math.sin(a) * len, k % 2 ? 'v' : 'l');
  }
  l.outline('y');
  l.outline('Y');
  c.blit(l, 0, 0);
}, { loop: true, note: '그노시스회 하수인 자폭 신호 (하얀 빛)' });

fx('gnosis_explode', 96, 96, 6, 16, (c, i) => {
  const R = [10, 22, 32, 38, 40, 42][i];
  if (i < 4) blast(c, 48, 52, R, { ramp: ['l', 'v', 'y'], out: 'Y' }, i >= 2 ? 0.35 + i * 0.1 : 0);
  if (i >= 1) ring(c, 48, 52, R + 3, 2, { ramp: ['l', 'w'], out: 'W' }, 0.75, i >= 4 ? 10 : 0);
  if (i >= 2) motes(c, 48, 48, 14 + i * 2, R * 0.9, i * 3, { ramp: ['l', 'v'], out: 'y' }, 40 + i, 2);
}, { note: '자폭 폭발 → 흔적 없이 사라짐' });

fx('gnosis_vanish', 48, 48, 5, 10, (c, i) => {
  motes(c, 24, 34 - i * 3, 14 - i * 2, 9 + i, 4 + i * 2, { ramp: ['l', 'v'], out: 'y' }, 77 + i);
}, { note: '하수인이 빛으로 흩어짐' });

fx('light_cast', 32, 32, 4, 12, (c, i) => {
  blast(c, 16, 16, [2, 3, 4, 5][i], P.light);
  const rnd = rng(5 + i);
  const l = new Cv(32, 32);
  for (let k = 0; k < 6; k++) {
    const a = rnd() * Math.PI * 2;
    const d = 13 - i * 2.5;
    l.set(16 + Math.cos(a) * d, 16 + Math.sin(a) * d, 'l');
  }
  l.outline('w');
  c.blit(l, 0, 0);
}, { loop: true, note: '시황제의 빛: 손에 모으기' });

fx('light_bolt', 32, 16, 4, 16, (c, i) => {
  streak(c, 4 + (i % 2), 22, 8, 2.5, P.light);
  blast(c, 23, 8, 4 + (i % 2), P.light);
  c.set(2 + i * 2, 8 + ((i % 2) * 2 - 1) * 3, 'w');
}, { loop: true, note: '시황제의 빛: 날아가는 빛 (마르키온)' });

fx('light_burst', 48, 48, 5, 16, (c, i) => {
  if (i < 3) c.star(24, 24, [8, 14, 18][i], 8, P.light.ramp, deg(22), 0.4), c.outline(P.light.out);
  if (i >= 1) ring(c, 24, 24, [0, 10, 15, 19, 21][i], 2, P.light, 1, i >= 3 ? 8 : 0);
  if (i >= 3) motes(c, 24, 22, 8, 14, 4, P.light, 90 + i);
}, { note: '시황제의 빛: 맞은 자리' });

fx('wound_glow', 16, 16, 4, 6, (c, i) => {
  const l = new Cv(16, 16);
  l.disc(8, 8, [2, 3, 3.5, 3][i], (t) => (t < 0.5 ? 'l' : 'w'));
  l.set(8, 3 - (i % 2), 'w');
  l.set(12, 6 + (i % 2), 'w');
  l.outline('a');
  c.blit(l, 0, 0);
}, { loop: true, note: '레온 어깨 상처의 희미한 빛' });

fx('level_up', 48, 64, 6, 12, (c, i) => {
  const h = [10, 30, 50, 60, 60, 40][i];
  const w = [4, 7, 8, 7, 5, 3][i];
  const l = new Cv(48, 64);
  l.rect(24 - w, 62 - h, 24 + w, 61, (x) => (Math.abs(x - 24) < w * 0.4 ? 'l' : 'v'));
  l.outline('y');
  l.outline('Y');
  c.blit(l, 0, 0);
  floorRing(c, 24, 60, 14 + i * 2, 4 + i * 0.5, P.gold, 1);
  motes(c, 24, 50 - i * 4, 10, 14, 8 + i * 3, P.gold, 60 + i);
}, { note: '레벨 업' });

fx('unlock', 48, 48, 6, 12, (c, i) => {
  if (i < 4) ring(c, 24, 24, 4 + i * 5, 2, P.gold, 1, i >= 2 ? 8 : 0);
  if (i >= 1 && i < 5) c.star(24, 24, [0, 7, 11, 9, 6][i], 4, ['l', 'v', 'y'], deg(45), 0.3), c.outline('Y');
  if (i >= 2) motes(c, 24, 24, 12, 18, 0, P.gold, 70 + i);
}, { note: '새 기술 해금' });

fx('stun', 24, 12, 4, 8, (c, i) => {
  // 기절 표시: 머리 위를 도는 별 세 개
  for (let k = 0; k < 3; k++) {
    const a = deg(k * 120 + i * 30);
    const x = 12 + Math.cos(a) * 8;
    const y = 6 + Math.sin(a) * 3;
    const l = new Cv(24, 12);
    l.set(x, y, 'y');
    l.set(x - 1, y, 'Y');
    l.set(x + 1, y, 'Y');
    l.set(x, y - 1, 'Y');
    l.set(x, y + 1, 'Y');
    l.set(x, y, 'l');
    l.outline('P');
    c.blit(l, 0, 0, { under: true });
  }
}, { loop: true, note: '기절(쓰러진 상태 위의 표시)' });

// ---- 인물별 기본 공격 궤적 (오른쪽을 봄) ----
fx('leon_slash1', 48, 48, 4, 22, (c, i, n) => slash(c, i, n, { cx: 16, cy: 24, r: 18, th: 6, a0: deg(-75), a1: deg(70), pal: P.aura, sparks: 3 }), { note: '레온 베기 1타' });
fx('leon_slash2', 48, 48, 4, 22, (c, i, n) => slash(c, i, n, { cx: 16, cy: 24, r: 18, th: 6, a0: deg(70), a1: deg(-75), pal: P.aura, sparks: 3, seed: 3 }), { note: '레온 베기 2타' });
fx('leon_slash3', 64, 64, 5, 20, (c, i, n) => {
  slash(c, i, n, { cx: 20, cy: 32, r: 26, th: 9, a0: deg(-95), a1: deg(80), pal: P.aura, sparks: 5, seed: 9 });
  if (i >= 1 && i <= 3) streak(c, 26, 58 - (i - 1) * 4, 32, 1.5, P.aura);
}, { note: '레온 베기 3타(한 걸음 내디디며 강하게)' });

fx('galia_cleave', 64, 64, 5, 16, (c, i, n) => {
  slash(c, i, n, { cx: 18, cy: 32, r: 28, th: 11, a0: deg(-110), a1: deg(110), pal: P.silver, sparks: 0 });
  slash(c, i, n, { cx: 18, cy: 32, r: 30, th: 3, a0: deg(-110), a1: deg(110), pal: P.galia, sparks: 4, seed: 12 });
}, { note: '갈리아 대검 휘두르기' });

fx('elysia_bolt', 16, 16, 4, 14, (c, i) => {
  blast(c, 8, 8, 4 + (i % 2) * 0.5, P.purple);
  c.set(8, 8, 'w');
  runeGlyph(c, 8, 8, i % 2 ? 'w' : 'a');
  c.set(8, 8, 'l');
}, { loop: true, note: '엘리시아 마력탄' });

fx('elysia_bolt_hit', 32, 32, 4, 18, (c, i) => {
  if (i < 3) c.star(16, 16, [5, 9, 11][i], 6, ['l', 'i', 'u'], deg(i * 15), 0.4), c.outline('I');
  ring(c, 16, 16, 3 + i * 3, 1, P.rune, 1, i >= 2 ? 6 : 0);
}, { note: '마력탄 맞은 자리' });

fx('karg_slash', 48, 48, 4, 26, (c, i, n) => {
  slash(c, i, n, { cx: 14, cy: 20, r: 16, th: 4, a0: deg(-60), a1: deg(50), pal: P.grey, sparks: 2 });
  slash(c, i, n, { cx: 14, cy: 30, r: 16, th: 4, a0: deg(60), a1: deg(-50), pal: P.rust, sparks: 2, seed: 5 });
}, { note: '카르크 쌍단검 연격' });

fx('adrian_slash', 48, 48, 4, 20, (c, i, n) => slash(c, i, n, { cx: 16, cy: 24, r: 18, th: 6, a0: deg(-70), a1: deg(70), pal: P.gold, sparks: 3, seed: 14 }), { note: '아드리안 검' });

fx('serena_stab', 48, 24, 4, 22, (c, i) => {
  const len = [12, 24, 28, 20][i];
  streak(c, 8, 8 + len, 12, [1.5, 2.5, 2, 1][i], P.crimson);
  if (i >= 1 && i <= 2) c.star(8 + len, 12, 4, 4, ['x', 'X', 'Z'], 0, 0.3), c.outline('k');
}, { note: '세레나 단검 찌르기' });

// ---- 회피 ----
fx('leon_guard', 32, 40, 3, 10, (c, i) => {
  const l = new Cv(32, 40);
  l.band(4, 20, 16, 18 + (i % 2), deg(-65), deg(65), (tr) => (tr > 0.5 ? 'l' : 'v'), 1.1);
  for (let k = 0; k < 3; k++) l.set(20 + ((k + i) % 2), 8 + k * 11, 'l');
  l.outline('L');
  c.blit(l, 0, 0);
}, { loop: true, note: '레온 막기 (흰빛 오러 방패)' });

fx('galia_brace', 48, 24, 4, 10, (c, i) => {
  floorRing(c, 24, 18, 18 + (i % 2), 5, P.galia, 2);
  for (let k = 0; k < 5; k++) {
    const x = 8 + k * 8;
    const l = new Cv(48, 24);
    l.line(x, 16 - ((k + i) % 3) * 2, x, 8 - ((k + i) % 3) * 2, k % 2 ? 'x' : 'l');
    l.outline('Z');
    c.blit(l, 0, 0);
  }
}, { loop: true, note: '갈리아 버티기' });

fx('elysia_blink', 48, 48, 5, 16, (c, i) => {
  floorRing(c, 24, 38, 14 - i, 5 - i * 0.5, P.rune, 1);
  for (let k = 0; k < 4; k++) runeGlyph(c, 24 + Math.cos(deg(k * 90 + i * 20)) * 10, 38 + Math.sin(deg(k * 90 + i * 20)) * 3.5, 'w');
  motes(c, 24, 26 - i * 2, 10, 10, 6 + i * 2, P.purple, 50 + i);
}, { note: '엘리시아 순간이동' });

fx('karg_dash', 48, 24, 4, 18, (c, i) => {
  for (let k = 0; k < 3; k++) {
    const y = 6 + k * 6;
    const x1 = 44 - k * 4 - i * 3;
    streak(c, Math.max(2, x1 - 22 + i * 4), x1, y, 0.6, k % 2 ? P.rust : P.grey, false);
  }
}, { note: '카르크 대시 (잔상은 게임에서 인물 그림을 겹쳐 그림)' });

fx('adrian_block', 40, 48, 4, 10, (c, i) => {
  const l = new Cv(40, 48);
  l.band(2, 24, 20, 23, deg(-75), deg(75), (tr, ta) => (tr > 0.6 ? 'v' : 'y'), 1.05);
  l.band(2, 24, 17, 18, deg(-60), deg(60), (tr, ta) => (Math.floor(ta * 8 + i) % 2 ? 'y' : '.'), 1.05);
  l.outline('Y');
  l.outline('P');
  c.blit(l, 0, 0);
}, { loop: true, note: '아드리안 방패 막기' });

fx('adrian_bash', 48, 48, 4, 16, (c, i) => {
  const l = new Cv(48, 48);
  l.band(4 + i * 6, 24, 14, 17, deg(-55), deg(55), (tr) => (tr > 0.5 ? 'v' : 'y'), 1.2);
  l.outline('P');
  c.blit(l, 0, 0);
  if (i >= 1) motes(c, 26 + i * 4, 24, 6, 12, 0, P.gold, 30 + i);
}, { note: '아드리안 방패 밀치기' });

fx('serena_step', 64, 32, 5, 14, (c, i) => {
  floorRing(c, 32, 20, 8 + i * 6, 3 + i * 2, P.crimson, i < 3 ? 2 : 1, 0);
  if (i < 3) motes(c, 32, 16, 6, 10 + i * 4, 2, P.crimson, 20 + i);
}, { note: '세레나 물러서기 (주변을 밀어냄)' });

// ---- 스킬과 궁극기 ----
fx('leon_thrust', 96, 32, 5, 18, (c, i) => {
  const x1 = [30, 70, 92, 92, 80][i];
  const x0 = [6, 10, 30, 60, 76][i];
  streak(c, x0, x1, 16, [2, 4, 4, 2.5, 1][i], P.aura);
  if (i >= 1 && i <= 3) c.star(Math.min(x1, 88), 16, 6, 4, P.aura.ramp, 0, 0.3), c.outline('L');
}, { note: '레온 스킬: 오러 찌르기' });

fx('leon_oath', 64, 96, 6, 14, (c, i) => {
  // 오러를 모아 크게 내려침 (위에서 아래로 내려꽂는 빛 기둥, 바라보는 방향 앞)
  if (i === 0) blast(c, 32, 20, 6, P.aura);
  if (i >= 1 && i <= 4) {
    const w = [0, 6, 10, 8, 4][i];
    const l = new Cv(64, 96);
    l.rect(32 - w, [0, 10, 4, 4, 30][i], 32 + w, 80, (x) => (Math.abs(x - 32) < w * 0.35 ? 'l' : Math.abs(x - 32) < w * 0.7 ? 'v' : 'm'));
    l.outline('L');
    c.blit(l, 0, 0);
  }
  if (i >= 2) {
    ring(c, 32, 80, 10 + i * 4, 2, P.aura, 0.4, i >= 4 ? 8 : 0);
    motes(c, 32, 76, 10, 20, i * 2, P.aura, 15 + i);
  }
}, { note: '레온 궁극기: 맹세의 검' });

fx('galia_taunt', 64, 64, 5, 14, (c, i) => {
  ring(c, 32, 32, 6 + i * 6, 2, P.galia, 1, i >= 3 ? 10 : 0);
  if (i >= 1) ring(c, 32, 32, i * 6 - 2, 1, P.crimson, 1, 8);
}, { note: '갈리아 스킬: 단장의 호령 (도발)' });

fx('galia_quake', 96, 64, 6, 14, (c, i) => {
  const rnd = rng(91);
  const l = new Cv(96, 64);
  for (let k = 0; k < 7; k++) {
    let x = 48;
    let y = 40;
    const a = deg(k * (360 / 7) + 10);
    const len = Math.min(i, 4) * 10;
    for (let s = 0; s < len; s++) {
      x += Math.cos(a) + (rnd() - 0.5) * 0.8;
      y += Math.sin(a) * 0.45 + (rnd() - 0.5) * 0.4;
      l.set(x, y, s % 4 === 0 ? 'X' : 'k');
    }
  }
  c.blit(l, 0, 0);
  if (i <= 3) {
    const sw = new Cv(96, 64);
    sw.rect(46, 4 + i * 8, 49, 40, (x) => (x === 47 || x === 48 ? 'l' : 'x'));
    sw.outline('Z');
    if (i < 3) c.blit(sw, 0, 0);
  }
  if (i >= 2) floorRing(c, 48, 40, 14 + i * 6, 5 + i * 2, P.galia, 2);
  if (i >= 3) motes(c, 48, 36, 12, 26, i * 2, P.dust, 10 + i, 2);
}, { note: '갈리아 궁극기: 대지 가르기' });

fx('elysia_rune', 96, 48, 4, 8, (c, i) => {
  floorRing(c, 48, 24, 44, 20, P.rune, 2, (d, x, y) => ((x * 3 + y * 5 + i) % 11 === 0 && d < 0.9 ? 'I' : '.'));
  floorRing(c, 48, 24, 30, 13, P.purple, 1);
  for (let k = 0; k < 6; k++) {
    const a = deg(k * 60 + i * 15);
    runeGlyph(c, 48 + Math.cos(a) * 37, 24 + Math.sin(a) * 16.5, k % 2 ? 'w' : 'i');
  }
}, { loop: true, note: '엘리시아 스킬: 룬 결계 (바닥)' });

fx('elysia_overload', 96, 96, 6, 14, (c, i) => {
  const R = [8, 20, 32, 40, 44, 46][i];
  if (i < 4) blast(c, 48, 48, R, { ramp: ['l', 'i', 'u', 'I'], out: 'k' }, i >= 2 ? 0.4 + i * 0.1 : 0);
  if (i >= 1) ring(c, 48, 48, R + 2, 2, P.rune, 1, i >= 4 ? 12 : 0);
  if (i >= 2) for (let k = 0; k < 8; k++) runeGlyph(c, 48 + Math.cos(deg(k * 45 + i * 9)) * (R - 4), 48 + Math.sin(deg(k * 45 + i * 9)) * (R - 4), 'w');
  if (i >= 3) motes(c, 48, 48, 16, R, 0, P.purple, 80 + i, 2);
}, { note: '엘리시아 궁극기: 마력 폭주' });

fx('karg_fang', 48, 48, 5, 20, (c, i) => {
  const l = new Cv(48, 48);
  const shown = Math.min(3, i + 1);
  for (let k = 0; k < shown; k++) {
    const o = (k - 1) * 7;
    l.line(12 + o, 8, 32 + o, 40, i >= 4 ? 'O' : k === shown - 1 ? 'p' : 'o', i >= 4 ? 1 : 2);
  }
  l.outline('P');
  c.blit(l, 0, 0);
  if (i >= 2) motes(c, 28, 24, 6, 12, 0, P.grey, 40 + i);
}, { note: '카르크 스킬: 송곳니 (방어막을 찢음)' });

fx('karg_frenzy', 48, 56, 4, 12, (c, i) => {
  const rnd = rng(17 + i);
  const l = new Cv(48, 56);
  for (let k = 0; k < 9; k++) {
    const x = 10 + rnd() * 28;
    const top = 8 + rnd() * 20;
    l.line(x, 52 - (k % 3) * 2, x + (rnd() - 0.5) * 4, top, k % 3 === 0 ? 'p' : k % 3 === 1 ? 't' : 'o', 2);
  }
  l.outline('P');
  c.blit(l, 0, 0, { under: true });
}, { loop: true, note: '카르크 궁극기: 늑대의 피 (각성 기운)' });

fx('adrian_heal', 48, 48, 5, 12, (c, i) => {
  const rnd = rng(55);
  for (let k = 0; k < 6; k++) {
    const x = 8 + rnd() * 32;
    const y = 40 - i * 6 - rnd() * 10;
    const l = new Cv(48, 48);
    l.rect(Math.round(x) - 1, Math.round(y), Math.round(x) + 1, Math.round(y), 'v');
    l.rect(Math.round(x), Math.round(y) - 1, Math.round(x), Math.round(y) + 1, 'v');
    l.outline('Y');
    if (i < 4 || k % 2) c.blit(l, 0, 0);
  }
  floorRing(c, 24, 42, 16, 5, P.gold, 1);
}, { note: '아드리안 스킬(신앙 전): 치유의 빛' });

fx('adrian_sanctuary', 96, 48, 5, 10, (c, i) => {
  floorRing(c, 48, 30, 44, 16, P.gold, 2, (d, x, y) => ((x + y * 2 + i) % 9 === 0 && d < 0.9 ? 'y' : '.'));
  const l = new Cv(96, 48);
  l.band(48, 30, 40, 42, deg(-180), deg(0), (tr, ta) => (Math.floor(ta * 12 + i) % 3 === 0 ? '.' : 'v'), 0.7);
  l.outline('Y');
  c.blit(l, 0, 0);
}, { loop: true, note: '아드리안 궁극기(신앙 전): 성역' });

fx('adrian_charge', 64, 32, 4, 18, (c, i) => {
  streak(c, 4 + i * 6, 52 + (i % 2) * 4, 16, 6 - i, P.gold);
  const l = new Cv(64, 32);
  l.band(52, 16, 10, 12, deg(-60), deg(60), (tr) => (tr > 0.5 ? 'v' : 'y'), 1.2);
  l.outline('P');
  c.blit(l, 0, 0);
}, { note: '아드리안 스킬(신앙 후): 방패 돌진' });

fx('adrian_sever', 64, 64, 6, 16, (c, i, n) => {
  slash(c, Math.min(i, n - 1), n, { cx: 18, cy: 32, r: 28, th: 10, a0: deg(-100), a1: deg(100), pal: { ramp: ['l', 'v', 'y'], out: 'Y' }, sparks: 5, seed: 31 });
  if (i >= 3) motes(c, 40, 32, 10, 16, 0, P.light, 60 + i);
}, { note: '아드리안 궁극기(신앙 후): 끊어 내는 검' });

fx('serena_awe', 96, 96, 5, 12, (c, i) => {
  ring(c, 48, 48, 10 + i * 9, 3, P.crimson, 1, i >= 3 ? 12 : 0);
  if (i >= 1) ring(c, 48, 48, i * 9, 1, { ramp: ['y', 'Y'], out: 'P' }, 1, 16);
}, { note: '세레나 스킬: 위압' });

fx('serena_command', 48, 48, 6, 12, (c, i) => {
  const l = new Cv(48, 48);
  const y = 16 - Math.min(i, 3);
  // 왕관 모양 인장
  l.rect(14, y + 6, 34, y + 9, 'y');
  for (const x of [14, 24, 34]) l.line(x, y + 6, x, y - 2, 'y', 2);
  l.line(14, y + 6, 19, y + 1, 'y');
  l.line(34, y + 6, 29, y + 1, 'y');
  l.set(24, y - 3, 'x');
  l.set(14, y - 3, 'x');
  l.set(34, y - 3, 'x');
  l.outline('X');
  l.outline('Z');
  if (i < 5) c.blit(l, 0, 0);
  floorRing(c, 24, 40, 10 + i * 2, 3 + i * 0.6, P.crimson, 1);
  if (i >= 2) motes(c, 24, 30, 8, 16, i * 2, P.crimson, 99 + i);
}, { note: '세레나 궁극기: 황제의 명령' });

// ---------------------------------------------------------------------
// 인물 전투 동작 (48x48 칸, 32x40 인물을 (8, 8)에 놓아 발밑이 칸 아래 끝에 닿음)
// 열: 0 공격1 준비, 1 공격1, 2 공격2 준비, 3 공격2, 4 공격3 준비, 5 공격3,
//     6 막기, 7 피격, 8 시전/자폭 준비1, 9 시전/자폭 준비2, 10 무릎 꿇음, 11 쓰러짐
// 행: 아래, 왼쪽, 오른쪽, 위
// ---------------------------------------------------------------------
function loadArtFile(file) {
  const art = {};
  let name = null;
  let rows = [];
  for (const raw of readFileSync(join(HERE, 'art', file), 'utf8').split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith('#')) continue;
    const m = line.match(/^\[(.+)\]$/);
    if (m) {
      if (name) art[name] = rows;
      name = m[1];
      rows = [];
    } else if (line === '') {
      if (name && rows.length) art[name] = rows;
      if (rows.length) name = null;
      rows = [];
    } else if (name) rows.push(line.trim());
  }
  if (name && rows.length) art[name] = rows;
  return art;
}
const ART = { ...loadArtFile('leon.txt'), ...loadArtFile('characters.txt') };
const LEGS = Object.fromEntries(CHARS.map((c) => [c.id, c.legs ?? {}]));

/** 인물 한 칸(32x40): 다리 + 몸 */
function compose(id, view, o = {}) {
  const v = view === 'left' ? 'right' : view;
  const c = new Cv(32, 40);
  const legs = Cv.from(ART[`leon_legs_${v === 'right' ? 'side' : 'front'}_${o.legs ?? 'stand'}`]);
  const remap = Object.keys(LEGS[id] ?? {}).length ? LEGS[id] : undefined;
  c.blit(legs, 0, 30 + (o.legDY ?? 0), { remap });
  c.blit(Cv.from(ART[`${id}_body_${v}`]), o.dx ?? 0, o.dy ?? 0);
  return c;
}

/** 무기: 손(hx, hy)에서 ang 방향으로 len 길이 */
function weapon(kind, hx, hy, ang, cw, ch) {
  const W = {
    sword: { len: 13, w: 1, blade: ['l', 'm'], out: 'L', hilt: 'Y' },
    greatsword: { len: 18, w: 2, blade: ['l', 'm'], out: 'L', hilt: 'X' },
    dagger: { len: 7, w: 1, blade: ['l', 'm'], out: 'L', hilt: 'O' },
    darkdagger: { len: 8, w: 1, blade: ['t', 'T'], out: 'k', hilt: 'k' },
  }[kind];
  const l = new Cv(cw, ch);
  const a = deg(ang);
  const ex = hx + Math.cos(a) * W.len;
  const ey = hy + Math.sin(a) * W.len;
  l.line(hx + Math.cos(a) * 2, hy + Math.sin(a) * 2, ex, ey, (t) => (t > 0.15 && t < 0.85 ? W.blade[0] : W.blade[1]), W.w);
  // 손잡이와 십자 날밑
  const px = -Math.sin(a);
  const py = Math.cos(a);
  l.line(hx + px * 2 + Math.cos(a) * 2, hy + py * 2 + Math.sin(a) * 2, hx - px * 2 + Math.cos(a) * 2, hy - py * 2 + Math.sin(a) * 2, W.hilt);
  l.line(hx, hy, hx + Math.cos(a), hy + Math.sin(a), 'O');
  l.outline(W.out);
  return l;
}

// 손 위치와 칼 각도 (32x40 인물 기준). up 보기는 칼을 몸 뒤에 그림
const POSES = {
  down: {
    a1w: { h: [25, 22], ang: -60 }, a1s: { h: [20, 30], ang: 125 },
    a2w: { h: [7, 24], ang: -120 }, a2s: { h: [12, 30], ang: 55 },
    a3w: { h: [16, 14], ang: -90, dy: -1 }, a3s: { h: [16, 32], ang: 90, dy: 3 },
    guard: { h: [7, 27], ang: 0 },
  },
  right: {
    a1w: { h: [15, 22], ang: -130 }, a1s: { h: [22, 27], ang: 15 },
    a2w: { h: [15, 30], ang: 150 }, a2s: { h: [22, 24], ang: -25 },
    a3w: { h: [17, 17], ang: -100, dx: -1 }, a3s: { h: [24, 27], ang: 3, dx: 3 },
    guard: { h: [23, 33], ang: -90 },
  },
  up: {
    a1w: { h: [25, 22], ang: -30, behind: true }, a1s: { h: [12, 18], ang: -120 },
    a2w: { h: [7, 22], ang: -150, behind: true }, a2s: { h: [20, 18], ang: -60 },
    a3w: { h: [16, 12], ang: -90 }, a3s: { h: [16, 8], ang: -90, dy: -3 },
    guard: { h: [6, 22], ang: 0, behind: true },
  },
};

/** 인물별 전투 동작 설정 */
const BATTLE_CHARS = [
  { id: 'leon', weapon: 'sword' },
  { id: 'bram', weapon: 'sword' },
  { id: 'galia', weapon: 'greatsword' },
  { id: 'adrian', weapon: 'sword' },
  { id: 'karg', weapon: 'dagger', dual: true },
  { id: 'serena', weapon: 'dagger' },
  { id: 'elysia', cast: { ramp: ['l', 'i', 'u'], out: 'I', hand: { down: [27, 24], right: [24, 22], up: [5, 24] } } },
  { id: 'mob_gnosis', weapon: 'darkdagger', prep: true },
  { id: 'marcion_hooded', cast: { ramp: ['l', 'w', 'a'], out: 'W', hand: { down: [27, 27], right: [23, 24], up: [5, 27] } } },
  { id: 'mob_royal_knight', lunge: true }, // 몸에 창이 그려져 있어 몸을 내밀어 찌름
  { id: 'leon_hood', weapon: 'sword' }, // 1막 두건 망토
  { id: 'imperial_spear', lunge: true }, // 1막 적: 무기가 몸에 그려져 있음
  { id: 'imperial_archer', lunge: true },
  { id: 'pursuit_sword', lunge: true },
  { id: 'pursuit_shield', lunge: true },
];

const VIEWS = ['down', 'left', 'right', 'up'];
const COLS = 12;

function battleFrame(cfg, view, col) {
  const v = view === 'left' ? 'right' : view;
  const cell = new Cv(48, 48);
  const pose = ['a1w', 'a1s', 'a2w', 'a2s', 'a3w', 'a3s', 'guard'][col];
  const fwd = { down: [0, 1], right: [1, 0], up: [0, -1] }[v];

  if (col === 11) {
    // 쓰러짐: 정면 그림을 옆으로 눕힘
    const lying = compose(cfg.id, 'down').rot90();
    cell.blit(lying, 4, 48 - lying.h);
    return view === 'left' ? cell.flipX() : cell;
  }
  if (col === 10) {
    // 무릎 꿇음: 몸이 내려앉고 다리가 가려짐
    const k = compose(cfg.id, v, { dy: 5, legDY: 1 });
    cell.blit(k, 8, 8);
    return view === 'left' ? cell.flipX() : cell;
  }
  if (col === 7) {
    const h = compose(cfg.id, v, { dx: -fwd[0] * 2, dy: -fwd[1] * 2 + 1 });
    cell.blit(h, 8, 8);
    return view === 'left' ? cell.flipX() : cell;
  }
  if (col === 8 || col === 9) {
    if (cfg.cast) {
      const b = compose(cfg.id, v, { dy: col === 8 ? 0 : -1 });
      const [hx, hy] = cfg.cast.hand[v];
      const orb = new Cv(48, 48);
      orb.disc(8 + hx, 8 + hy, col === 8 ? 2.5 : 4, (t) => (t < 0.45 ? cfg.cast.ramp[0] : t < 0.8 ? cfg.cast.ramp[1] : cfg.cast.ramp[2]));
      orb.outline(cfg.cast.out);
      cell.blit(b, 8, 8);
      cell.blit(orb, 0, 0);
    } else if (cfg.prep) {
      // 자폭 준비: 웅크리고 몸 안쪽에서 하얀 빛이 새어 나옴
      const b = compose(cfg.id, v, { dy: 2 });
      const rnd = rng(col * 13 + v.length);
      b.map((ch, x, y) => (ch !== '.' && ch !== 'k' && rnd() < (col === 8 ? 0.12 : 0.28) ? (rnd() > 0.5 ? 'l' : 'v') : ch));
      cell.blit(b, 8, 8);
    } else {
      cell.blit(compose(cfg.id, v), 8, 8);
    }
    return view === 'left' ? cell.flipX() : cell;
  }

  // 공격, 막기
  const pz = POSES[v][pose];
  if (cfg.lunge) {
    const strike = col % 2 === 1;
    const d = strike ? 3 : -1;
    cell.blit(compose(cfg.id, v, { dx: fwd[0] * d, dy: fwd[1] * d }), 8, 8);
    return view === 'left' ? cell.flipX() : cell;
  }
  if (cfg.cast) {
    // 마법사형: 공격 = 손을 내밀어 마력을 쏨
    const b = compose(cfg.id, v, { dx: (col % 2) * fwd[0], dy: (col % 2) * fwd[1] });
    const [hx, hy] = cfg.cast.hand[v];
    cell.blit(b, 8, 8);
    if (col % 2 === 1 || col === 6) {
      const orb = new Cv(48, 48);
      orb.disc(8 + hx + fwd[0] * 3, 8 + hy + fwd[1] * 3, 3, (t) => (t < 0.5 ? cfg.cast.ramp[0] : cfg.cast.ramp[1]));
      orb.outline(cfg.cast.out);
      cell.blit(orb, 0, 0);
    }
    return view === 'left' ? cell.flipX() : cell;
  }
  const body = compose(cfg.id, v, { dx: pz.dx ?? 0, dy: pz.dy ?? 0 });
  const wp = weapon(cfg.weapon, 8 + pz.h[0], 8 + pz.h[1], pz.ang, 48, 48);
  if (pz.behind) {
    cell.blit(wp, 0, 0);
    cell.blit(body, 8, 8);
  } else {
    cell.blit(body, 8, 8);
    cell.blit(wp, 0, 0);
  }
  if (cfg.dual && col !== 6) {
    // 쌍단검: 반대 손에도 하나
    const w2 = weapon(cfg.weapon, 8 + (v === 'right' ? pz.h[0] - 6 : 32 - pz.h[0]), 8 + pz.h[1] + 2, 180 - pz.ang, 48, 48);
    cell.blit(w2, 0, 0, { under: true });
  }
  return view === 'left' ? cell.flipX() : cell;
}

const CHAR_FRAMES = {}; // id → Cv[] (행 x 열)
for (const cfg of BATTLE_CHARS) {
  const frames = [];
  for (const view of VIEWS) for (let col = 0; col < COLS; col++) frames.push(battleFrame(cfg, view, col));
  CHAR_FRAMES[cfg.id] = frames;
}

// ---------------------------------------------------------------------
// 전투 UI
// ---------------------------------------------------------------------
const UI = []; // { key, w, h, frames: Cv[] }
const ui = (key, frames) => UI.push({ key, w: frames[0].w, h: frames[0].h, frames });

// 작은 얼굴(18x18): 정면 그림의 머리 부분. 회색판은 기절 때
const PALETTE = JSON.parse(readFileSync(join(HERE, 'palette.json'), 'utf8'));
const lum = (ch) => {
  const hex = PALETTE[ch]?.color?.replace('#', '');
  if (!hex) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.3 * r + 0.59 * g + 0.11 * b;
};
const toGrey = (ch) => (ch === '.' ? '.' : ch === 'z' ? 'z' : ['R', 'T', 't', 'r'][Math.min(3, Math.floor(lum(ch) / 64))]);
const FACE_IDS = ['leon', 'galia', 'elysia', 'karg', 'adrian', 'serena', 'bram'];
for (const id of FACE_IDS) {
  const body = Cv.from(ART[`${id}_body_down`]);
  const f = new Cv(18, 18);
  const top = id === 'karg' ? 0 : 1;
  for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) f.set(x, y, body.get(x + 7, y + top));
  ui(`face_${id}`, [f, f.clone().map(toGrey)]);
}

// 칸 테두리
function frameBox(w, h, fill, border, light) {
  const c = new Cv(w, h);
  c.rect(1, 1, w - 2, h - 2, fill);
  c.rect(1, 0, w - 2, 0, border);
  c.rect(1, h - 1, w - 2, h - 1, border);
  c.rect(0, 1, 0, h - 2, border);
  c.rect(w - 1, 1, w - 1, h - 2, border);
  if (light) {
    c.rect(2, 1, w - 3, 1, light);
    c.rect(1, 2, 1, h - 3, light);
  }
  return c;
}
ui('slot', [frameBox(22, 22, 'K', 'k', 'R'), frameBox(22, 22, 'K', 'Y', 'y'), frameBox(22, 22, 'K', 'R', 'T')]); // 보통, 선택, 비활성

// 체력바 등: 테두리(frame)와 채움(fill). fill은 게임에서 잘라 씀
const BARS = {
  hp_s: [38, 5], hp_l: [124, 8], sp: [124, 5], gauge: [124, 5], combo: [64, 6], exp: [244, 5], enemy: [22, 4], boss: [324, 10], revive: [28, 4],
};
for (const [k, [w, h]] of Object.entries(BARS)) {
  const fr = new Cv(w, h);
  fr.rect(0, 0, w - 1, h - 1, 'k');
  fr.rect(1, 1, w - 2, h - 2, 'z');
  if (k === 'boss') {
    // 보스 체력바: 양 끝 장식
    fr.rect(0, 0, w - 1, 0, 'Y');
    fr.rect(0, h - 1, w - 1, h - 1, 'P');
    fr.rect(0, 0, 0, h - 1, 'Y');
    fr.rect(w - 1, 0, w - 1, h - 1, 'P');
  }
  ui(`bar_${k}`, [fr]);
}
const FILLS = {
  red: ['x', 'X', 'Z'], green: ['q', 'g', 'G'], white: ['l', 'v', 'm'], purple: ['i', 'u', 'I'], rust: ['p', 'o', 'O'],
  gold: ['y', 'Y', 'O'], sky: ['w', 'a', 'A'], cold: ['l', 'w', 'a'], crimson: ['x', 'X', 'Z'],
};
for (const [k, r] of Object.entries(FILLS)) {
  for (const h of [2, 3, 4, 6, 8]) {
    const c = new Cv(322, h);
    c.rect(0, 0, 321, h - 1, r[1]);
    c.rect(0, 0, 321, 0, r[0]);
    if (h >= 3) c.rect(0, h - 1, 321, h - 1, r[2]);
    ui(`fill_${k}_${h}`, [c]);
  }
}

// 아이콘 16x16
function icon(draw) {
  const c = new Cv(16, 16);
  draw(c);
  return c;
}
const swordIcon = (c, ang = -45, pal = ['l', 'm'], out = 'L') => {
  const w = weapon('sword', 4, 12, ang, 16, 16);
  c.blit(w, 0, 0);
};
ui('icon_attack', [icon((c) => swordIcon(c))]);
ui('icon_guard', [icon((c) => {
  c.band(8, 9, 4, 7, deg(-180), deg(0), (tr) => (tr > 0.5 ? 'l' : 'm'), 1.2);
  c.rect(2, 9, 14, 11, 'm');
  c.rect(7, 2, 8, 14, 'l');
  c.outline('L');
})]);
ui('icon_jump', [icon((c) => {
  c.line(8, 3, 8, 11, 'l', 2);
  c.line(8, 2, 4, 6, 'l');
  c.line(8, 2, 12, 6, 'l');
  c.ellipse(8, 14, 5, 1.2, 'm');
  c.outline('L');
})]);
ui('icon_interact', [icon((c) => {
  c.rect(5, 6, 11, 12, 'e');
  for (const x of [5, 7, 9, 11]) c.rect(x, 3, x, 6, 'e');
  c.rect(3, 8, 4, 10, 'e');
  c.outline('S');
  c.outline('O');
})]);
ui('icon_skill', [icon((c) => {
  c.line(2, 8, 14, 8, 'l', 3);
  c.star(13, 8, 3, 4, ['l', 'v', 'm'], 0, 0.3);
  c.outline('L');
})]);
ui('icon_ult', [icon((c) => {
  c.line(8, 1, 8, 12, 'l', 2);
  c.rect(5, 11, 11, 11, 'y');
  c.rect(7, 12, 9, 14, 'O');
  c.band(8, 6, 6, 7, deg(-180), deg(180), (tr, ta) => (Math.floor(ta * 8) % 2 ? 'v' : '.'));
  c.outline('L');
})]);
ui('icon_combo', [icon((c) => {
  c.blit(weapon('sword', 3, 13, -45, 16, 16), 0, 0);
  c.blit(weapon('sword', 13, 13, -135, 16, 16), 0, 0, { under: true });
})]);
ui('icon_evade', [icon((c) => {
  for (let k = 0; k < 3; k++) c.line(2 + k * 2, 5 + k * 3, 10 + k * 2, 5 + k * 3, k === 1 ? 'l' : 'm');
  c.line(10, 3, 14, 8, 'l', 2);
  c.line(14, 8, 10, 13, 'l', 2);
  c.outline('L');
})]);
ui('icon_lock', [(() => {
  const c = new Cv(10, 12);
  c.band(5, 5, 2, 3.5, deg(-180), deg(0), 'm');
  c.rect(1, 5, 8, 10, 'y');
  c.rect(1, 5, 8, 5, 'v');
  c.rect(4, 7, 5, 8, 'P');
  c.edge('P');
  return c;
})()]);

// 데미지 숫자 (7x9, 흰 글자 + 검은 테두리 → 게임에서 색을 입힘)
const DIGITS = [
  ['111', '101', '101', '101', '111'], ['010', '110', '010', '010', '111'], ['111', '001', '111', '100', '111'],
  ['111', '001', '111', '001', '111'], ['101', '101', '111', '001', '001'], ['111', '100', '111', '001', '111'],
  ['111', '100', '111', '101', '111'], ['111', '001', '010', '010', '010'], ['111', '101', '111', '101', '111'],
  ['111', '101', '111', '001', '111'],
];
ui('digits', DIGITS.map((g) => {
  const c = new Cv(7, 9);
  g.forEach((row, y) => [...row].forEach((b, x) => {
    if (b === '1') c.rect(1 + x * 1.67, 1 + y * 1.4, 1 + x * 1.67 + 1, 1 + y * 1.4 + 1, 'l');
  }));
  c.outline('k');
  return c;
}));

// 도트 글자 (5x7) → 단어 그림
const FONT5 = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], B: ['11110', '10001', '11110', '10001', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'], D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '11110', '10000', '10000', '10000', '11111'], G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'], L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'], O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'], R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'], V: ['10001', '10001', '10001', '10001', '01010', '01010', '00100'],
  X: ['10001', '01010', '00100', '00100', '00100', '01010', '10001'], Y: ['10001', '01010', '00100', '00100', '00100', '00100', '00100'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'], I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'], S: ['01111', '10000', '01110', '00001', '00001', '00001', '11110'],
  ' ': ['000', '000', '000', '000', '000', '000', '000'],
};
function word(text, ramp, out) {
  const w = [...text].reduce((s, ch) => s + FONT5[ch][0].length + 1, 1) + 1;
  const c = new Cv(w, 11);
  let x = 2;
  for (const ch of text) {
    const g = FONT5[ch];
    g.forEach((row, y) => [...row].forEach((b, i) => b === '1' && c.set(x + i, 2 + y, y < 2 ? ramp[0] : y < 5 ? ramp[1] : ramp[2])));
    x += g[0].length + 1;
  }
  c.outline(out);
  return c;
}
ui('word_gameover', [word('GAME OVER', ['x', 'X', 'Z'], 'k')]);
ui('word_levelup', [word('LEVEL UP', ['l', 'y', 'Y'], 'P')]);
ui('word_parry', [word('PARRY', ['l', 'w', 'a'], 'W')]);
ui('word_break', [word('BREAK', ['l', 'x', 'X'], 'k')]);
ui('word_block', [word('BLOCK', ['l', 'y', 'Y'], 'P')]);
ui('word_max', [word('MAX', ['l', 'y', 'Y'], 'P')]);
ui('word_unlock', [word('UNLOCK', ['l', 'y', 'Y'], 'P')]);
ui('word_victory', [word('VICTORY', ['l', 'y', 'Y'], 'P')]);

// 합동 기술 선택 휠
ui('wheel', [(() => {
  const c = new Cv(112, 112);
  c.disc(56, 56, 54, 'z');
  c.band(56, 56, 50, 54, deg(-180), deg(180), (tr, ta) => (tr > 0.5 ? 'y' : 'Y'));
  c.band(56, 56, 20, 22, deg(-180), deg(180), (tr, ta) => (Math.floor(ta * 16) % 2 ? 'Y' : '.'));
  c.outline('P');
  return c;
})()]);
ui('wheel_slot', [frameBox(26, 26, 'K', 'Y', 'y'), frameBox(26, 26, 'k', 'R', '.'), frameBox(26, 26, 'K', 'l', 'y')]); // 보통, 어둡게(조합 없음), 가리킴

// 휴대폰 조작
ui('btn', [(() => {
  const c = new Cv(44, 44);
  c.disc(22, 22, 20, (t) => (t < 0.85 ? 'z' : 'K'));
  c.band(22, 22, 19, 21, deg(-180), deg(180), (tr) => (tr > 0.5 ? 'T' : 'R'));
  c.outline('k');
  return c;
})(), (() => {
  const c = new Cv(44, 44);
  c.disc(22, 22, 20, (t) => (t < 0.85 ? 'R' : 'K'));
  c.band(22, 22, 19, 21, deg(-180), deg(180), (tr) => (tr > 0.5 ? 'y' : 'Y'));
  c.outline('k');
  return c;
})()]);
ui('stick_base', [(() => {
  const c = new Cv(72, 72);
  c.disc(36, 36, 34, 'z');
  c.band(36, 36, 32, 34, deg(-180), deg(180), 'T');
  for (let k = 0; k < 4; k++) {
    const a = deg(k * 90);
    c.set(36 + Math.cos(a) * 28, 36 + Math.sin(a) * 28, 'r');
  }
  c.outline('k');
  return c;
})()]);
ui('stick_knob', [(() => {
  const c = new Cv(30, 30);
  c.disc(15, 15, 13, (t) => (t < 0.4 ? 'r' : t < 0.8 ? 't' : 'T'));
  c.outline('R');
  c.outline('k');
  return c;
})()]);

// ---------------------------------------------------------------------
// 파일 쓰기
// ---------------------------------------------------------------------
const head = (what) => [`# ${what} (tools/pixel-art/gen-battle.mjs가 만든 파일. 다시 실행하면 덮어씀)`, ''];
const fxTxt = head('전투 이펙트');
for (const e of FX) e.frames.forEach((f, i) => fxTxt.push(`[fx_${e.key}_${i}]`, f.text(), ''));
writeFileSync(join(HERE, 'art', 'fx.txt'), fxTxt.join('\n'));

const uiTxt = head('전투 UI');
for (const u of UI) u.frames.forEach((f, i) => uiTxt.push(`[ui_${u.key}_${i}]`, f.text(), ''));
writeFileSync(join(HERE, 'art', 'ui.txt'), uiTxt.join('\n'));

const chTxt = head('인물·적 전투 동작 48x48 (열: 공격1준비, 공격1, 공격2준비, 공격2, 공격3준비, 공격3, 막기, 피격, 시전1, 시전2, 무릎, 쓰러짐 / 행: 아래, 왼쪽, 오른쪽, 위)');
for (const [id, frames] of Object.entries(CHAR_FRAMES)) frames.forEach((f, i) => chTxt.push(`[bt_${id}_${i}]`, f.text(), ''));
writeFileSync(join(HERE, 'art', 'battle_chars.txt'), chTxt.join('\n'));

// build.mjs가 만들 PNG 목록
const outputs = [];
const sprites = { fx: {}, ui: {}, chars: {} };
for (const e of FX) {
  const file = `public/assets/battle/fx/${e.key}.png`;
  outputs.push({ file, cell: [e.w, e.h], frames: e.frames.map((_, i) => `fx_${e.key}_${i}`) });
  sprites.fx[e.key] = { file: file.replace('public/', ''), w: e.w, h: e.h, frames: e.frames.length, rate: e.rate, loop: e.loop, note: e.note };
}
for (const u of UI) {
  const file = `public/assets/battle/ui/${u.key}.png`;
  outputs.push({ file, cell: [u.w, u.h], frames: u.frames.map((_, i) => `ui_${u.key}_${i}`) });
  sprites.ui[u.key] = { file: file.replace('public/', ''), w: u.w, h: u.h, frames: u.frames.length };
}
for (const [id, frames] of Object.entries(CHAR_FRAMES)) {
  const file = `public/assets/battle/chars/${id}.png`;
  outputs.push({ file, cell: [48, 48], columns: COLS, frames: frames.map((_, i) => `bt_${id}_${i}`) });
  sprites.chars[id] = { file: file.replace('public/', ''), w: 48, h: 48, columns: COLS };
}
// 확인용: 모든 이펙트를 한 장에 (한 줄에 이펙트 하나, 96x96 칸 가운데)
const PREVIEW_CELL = 96;
const maxFrames = Math.max(...FX.map((e) => e.frames.length));
const pv = [];
for (const e of FX) {
  for (let i = 0; i < maxFrames; i++) {
    pv.push(i < e.frames.length
      ? { layers: [{ art: `fx_${e.key}_${i}`, x: Math.floor((PREVIEW_CELL - e.w) / 2), y: Math.floor((PREVIEW_CELL - e.h) / 2) }] }
      : null);
  }
}
outputs.push({ file: 'tools/pixel-art/preview_effects.png', cell: [PREVIEW_CELL, PREVIEW_CELL], columns: maxFrames, frames: pv, background: 'T', scale: 1 });
// 확인용: 인물 전투 동작
const pc = [];
for (const [id, frames] of Object.entries(CHAR_FRAMES)) frames.forEach((_, i) => pc.push(`bt_${id}_${i}`));
outputs.push({ file: 'tools/pixel-art/preview_battle_chars.png', cell: [48, 48], columns: COLS, frames: pc, background: 'g', scale: 2 });

writeFileSync(join(HERE, 'battle-outputs.json'), JSON.stringify(outputs));
mkdirSync(join(ROOT, 'src/data/battle'), { recursive: true });
writeFileSync(join(ROOT, 'src/data/battle/sprites.json'), JSON.stringify(sprites, null, 2));
console.log(`이펙트 ${FX.length}종, UI ${UI.length}종, 전투 동작 ${Object.keys(CHAR_FRAMES).length}명 → art/fx.txt, art/ui.txt, art/battle_chars.txt`);
