// 1막 수로 생물: 수로 쥐, 수로 거머리, 수로의 괴물(썩은 점액 덩어리)
// gen-battle.mjs가 불러 필드 걷기 시트(32x40, 5열 x 8행)와 전투 시트를 만든다.
import { Cv } from './cv.mjs';

const VIEWS = ['down', 'left', 'right', 'up'];
const shade = (ramp) => (d) => (d < 0.45 ? ramp[0] : d < 0.8 ? ramp[1] : ramp[2]);

// ---------------------------------------------------------------------
// 수로 쥐 (회색 털, 분홍 꼬리, 붉은 눈)
// ---------------------------------------------------------------------
const RAT = ['t', 'T', 'R'];
function rat(view, step = 0) {
  const c = new Cv(32, 40);
  const v = view === 'left' ? 'right' : view;
  const lift = step % 2 === 1 ? -1 : 0;
  if (v === 'right') {
    // 꼬리
    c.line(9, 34, 5, 31, 'S');
    c.line(5, 31, 2, 32 + (step % 2), 'S');
    // 다리
    const a = step === 1 ? 1 : step === 3 ? -1 : 0;
    c.rect(11 + a, 35, 12 + a, 37, 'R');
    c.rect(18 - a, 35, 19 - a, 37, 'R');
    c.ellipse(15, 33 + lift, 6.5, 3.5, shade(RAT));
    c.ellipse(22, 32 + lift, 3.6, 2.6, shade(RAT));
    c.disc(20, 29 + lift, 1.4, 'S');
    c.rect(25, 32 + lift, 26, 32 + lift, 's');
    c.set(23, 31 + lift, 'x');
  } else if (v === 'down') {
    c.line(16, 29, 17, 25, 'S');
    c.line(17, 25, 15, 22 + (step % 2), 'S');
    const a = step === 1 ? 1 : step === 3 ? -1 : 0;
    c.rect(12, 36 + a, 13, 37 + a, 'R');
    c.rect(19, 36 - a, 20, 37 - a, 'R');
    c.ellipse(16, 32 + lift, 4.8, 4.2, shade(RAT));
    c.ellipse(16, 35 + lift, 3.2, 2.6, shade(RAT));
    c.disc(13, 33 + lift, 1.3, 'S');
    c.disc(19, 33 + lift, 1.3, 'S');
    c.set(15, 35 + lift, 'x');
    c.set(17, 35 + lift, 'x');
    c.set(16, 37 + lift, 's');
  } else {
    const a = step === 1 ? 1 : step === 3 ? -1 : 0;
    c.rect(12, 36 + a, 13, 37 + a, 'R');
    c.rect(19, 36 - a, 20, 37 - a, 'R');
    c.ellipse(16, 33 + lift, 4.8, 4.2, shade(RAT));
    c.ellipse(16, 30 + lift, 3, 2.4, shade(RAT));
    c.disc(13, 29 + lift, 1.3, 'S');
    c.disc(19, 29 + lift, 1.3, 'S');
    c.line(16, 37, 19, 39, 'S');
  }
  c.outline('R');
  return view === 'left' ? c.flipX() : c;
}

// ---------------------------------------------------------------------
// 수로 거머리 (검보라 마디, 밝은 빨판)
// ---------------------------------------------------------------------
const LEECH = ['u', 'I', 'K'];
function leech(view, step = 0) {
  const c = new Cv(32, 40);
  const v = view === 'left' ? 'right' : view;
  const stretch = [0, 2, 0, -2][step % 4];
  if (v === 'right') {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const x = 8 + i * ((14 + stretch) / (n - 1));
      const r = 2.2 + Math.sin((i / (n - 1)) * Math.PI) * 1.6 - stretch * 0.15;
      c.disc(x, 35 - r + 2, r, shade(LEECH));
    }
    for (let i = 1; i < n - 1; i++) c.set(Math.round(8 + i * ((14 + stretch) / (n - 1))), 33, 'K');
    const hx = Math.round(22 + stretch);
    c.disc(hx + 1, 35, 1.6, (d) => (d < 0.5 ? 'x' : 'i'));
  } else {
    const len = 6 + stretch / 2;
    const top = v === 'down' ? 37 - len * 1.6 : 37 - len * 1.6;
    for (let i = 0; i < 5; i++) {
      const y = top + i * len * 0.35;
      const r = 2.6 + Math.sin((i / 4) * Math.PI) * 1.2;
      c.disc(16, y + 2, r, shade(LEECH));
    }
    if (v === 'down') c.disc(16, 36, 1.6, (d) => (d < 0.5 ? 'x' : 'i'));
    else c.set(16, Math.round(top + 2), 'i');
  }
  c.outline('k');
  return view === 'left' ? c.flipX() : c;
}

// ---------------------------------------------------------------------
// 걷기 시트: 0~3행 걷기(서기, 걷기1~4), 4~7행 점프(같은 그림을 올렸다 내림)
// ---------------------------------------------------------------------
function walkSheet(draw) {
  const frames = [];
  for (const v of VIEWS) for (let i = 0; i < 5; i++) frames.push(draw(v, i === 0 ? 0 : i - 1));
  const JUMP_DY = [1, -3, -5, -1, 0];
  for (const v of VIEWS)
    for (let i = 0; i < 5; i++) {
      const c = new Cv(32, 40);
      c.blit(draw(v, 0), 0, JUMP_DY[i]);
      frames.push(c);
    }
  return frames;
}

/** 작은 생물 전투 시트 48x48, 12열 x 4행 (공격은 몸을 내밀고, 10열 움츠림, 11열 뒤집혀 쓰러짐) */
function smallBattle(draw) {
  const frames = [];
  for (const view of VIEWS) {
    const fwd = { down: [0, 1], left: [-1, 0], right: [1, 0], up: [0, -1] }[view];
    for (let col = 0; col < 12; col++) {
      const cell = new Cv(48, 48);
      if (col === 11) {
        const b = draw(view === 'up' ? 'down' : view, 0);
        const flipped = new Cv(32, 40);
        for (let y = 0; y < 40; y++) for (let x = 0; x < 32; x++) {
          const ch = b.get(x, y);
          if (ch !== '.') flipped.set(x, Math.min(39, 70 - y), ch);
        }
        cell.blit(flipped, 8, 8);
      } else if (col === 10) {
        cell.blit(draw(view, 0), 8, 9);
      } else if (col === 7) {
        cell.blit(draw(view, 0), 8 - fwd[0] * 2, 8 - fwd[1] * 2);
      } else if (col < 6) {
        const d = col % 2 === 1 ? 4 : -1;
        cell.blit(draw(view, col % 2 === 1 ? 1 : 0), 8 + fwd[0] * d, 8 + fwd[1] * d);
      } else {
        cell.blit(draw(view, col === 9 ? 2 : 0), 8, 8);
      }
      frames.push(cell);
    }
  }
  return frames;
}

// ---------------------------------------------------------------------
// 수로의 괴물: 하수 찌꺼기가 엉겨 썩은 초록 점액 덩어리 (96x96 칸).
// 물 위로 몸을 일으켜 아가리로 물고, 점액 촉수로 쓸고, 썩은 점액을 뱉는다.
// 몸에는 삼킨 뼈가 비치고, 눈은 크기가 제각각인 누런 눈 셋
// ---------------------------------------------------------------------
const hash = (i) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** 점액 덩어리 칠하기: 윤곽(Q) → 몸(G) → 젖은 빛(g) 순서로, 빛은 왼쪽 위에서 */
const h2 = (x, y) => hash(x * 13.7 + y * 71.3);
function goo(c, blobs) {
  for (const [x, y, r] of blobs) c.disc(x, y, r, 'Q');
  for (const [x, y, r] of blobs) c.disc(x - r * 0.15, y - r * 0.15, r * 0.78, (d, px, py) => (h2(px, py) < 0.16 ? 'Q' : 'G'));
  for (const [x, y, r] of blobs) if (r > 5) c.disc(x - r * 0.38, y - r * 0.4, r * 0.2, 'g');
  for (const [x, y, r] of blobs) if (r > 7) c.set(x - r * 0.45, y - r * 0.5, 'q');
}
function eel(col) {
  const c = new Cv(96, 96);
  const ripple = (rx, ry) => c.ellipse(46, 88, rx, ry, (d) => (d > 0.82 ? 'w' : d > 0.6 ? 'a' : 'A'));
  // 물 위에 뜬 썩은 막
  const scum = () => {
    for (let i = 0; i < 9; i++) {
      const a = hash(i + 40) * Math.PI * 2;
      c.ellipse(46 + Math.cos(a) * (14 + hash(i) * 14), 88 + Math.sin(a) * 4.5, 3 + hash(i + 9) * 3, 1, i % 3 ? 'G' : 'D');
    }
  };
  if (col === 10) {
    // 잠수: 물결과 올라오는 거품만
    ripple(26, 6);
    scum();
    for (const [x, y] of [[40, 86], [52, 89], [46, 84]]) {
      c.disc(x, y, 1.6, 'q');
      c.set(x, y, 'G');
    }
    return c;
  }
  ripple(32, 7);
  scum();
  const pose = {
    0: { hx: 54, hy: 32, mouth: 1 }, // 서기
    1: { hx: 42, hy: 24, mouth: 2 }, // 물기 준비 (뒤로 젖힘)
    2: { hx: 68, hy: 48, mouth: 4 }, // 물기
    3: { hx: 48, hy: 30, mouth: 1, tail: 1 }, // 촉수 준비
    4: { hx: 52, hy: 34, mouth: 2, tail: 2 }, // 촉수 쓸기
    5: { hx: 52, hy: 26, mouth: 3, spit: 2 }, // 뱉기 준비
    6: { hx: 55, hy: 31, mouth: 1 },
    7: { hx: 48, hy: 36, mouth: 2 }, // 맞음
    8: { hx: 52, hy: 26, mouth: 3, spit: 3 }, // 시전(점액 모으기)
    9: { hx: 48, hy: 62, mouth: 0 }, // 가라앉는 중
    11: { hx: 66, hy: 76, mouth: 1, down: true }, // 쓰러짐: 녹아 퍼짐
  }[col];
  // 촉수: 옆 물속에서 솟는 점액 줄기, 끝에서 방울이 떨어진다
  if (pose.tail) {
    const tx = pose.tail === 1 ? 16 : 80;
    const blobs = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      blobs.push([tx + (pose.tail === 1 ? -t * 6 : t * 10), 88 - t * 32, 6 - t * 3.2]);
    }
    goo(c, blobs);
    const [ex, ey] = blobs[blobs.length - 1];
    c.line(ex, ey + 3, ex, ey + 9, 'G');
    c.disc(ex, ey + 10, 1.2, 'g');
  }
  const bx = 46;
  const by = 88;
  const mx = pose.down ? 60 : bx - 12;
  const my = pose.down ? 70 : 58;
  const { hx, hy } = pose;
  const at = (t) => [
    (1 - t) * (1 - t) * bx + 2 * (1 - t) * t * mx + t * t * hx,
    (1 - t) * (1 - t) * by + 2 * (1 - t) * t * my + t * t * hy,
  ];
  // 몸통: 밑동은 넓게 퍼지고 위로 갈수록 좁아지는 울퉁불퉁한 기둥
  const body = [];
  const N = 22;
  const base = pose.down ? 12 : 18;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const [x, y] = at(t);
    body.push([x, y, base - t * (base - 11)]);
    if (i % 3 === 1) {
      const side = hash(i) > 0.5 ? 1 : -1;
      body.push([x + side * (base - t * 6) * 0.7, y + 2, 4 + hash(i + 3) * 3]);
    }
  }
  if (pose.down) body.push([34, 84, 14], [58, 84, 13]);
  // 머리 덩어리 (앞쪽으로 늘어진 큰 덩이)
  body.push([hx + 2, hy - 1, 12], [hx + 10, hy + 2, 9], [hx - 6, hy + 4, 10], [hx + 6, hy + 10, 7], [hx - 2, hy - 8, 6]);
  goo(c, body);
  // 썩은 얼룩과 비치는 뼈
  for (let i = 0; i < 12; i++) {
    const [x, y] = at(0.05 + i * 0.075);
    const ex = x - 7 + hash(i + 20) * 14;
    c.ellipse(ex, y + 1, 2 + hash(i) * 3, 1.5 + hash(i + 2), (d) => (d < 0.5 ? (i % 3 ? 'D' : 'I') : i % 2 ? 'C' : 'Q'));
  }
  if (!pose.down) {
    // 갈비뼈: 몸통 가운데에 비스듬히
    const [rx, ry] = at(0.3);
    for (let k = 0; k < 3; k++) c.band(rx + 1, ry - 4 + k * 4, 5, 6, Math.PI * 0.9, Math.PI * 1.9, (tr, ta, px, py) => (h2(px, py) < 0.35 ? 'G' : 'V'), 0.6);
    // 반쯤 녹은 해골
    const [sx, sy] = at(0.55);
    c.disc(sx - 6, sy, 3, (d, px, py) => (h2(px, py) < 0.25 ? 'G' : 'V'));
    c.set(sx - 7, sy - 1, 'K');
    c.set(sx - 5, sy - 1, 'K');
    c.line(sx - 7, sy + 2, sx - 5, sy + 2, 'K');
  }
  // 거품
  for (let i = 0; i < 5; i++) {
    const [x, y] = at(0.15 + hash(i + 7) * 0.7);
    const px = x + (hash(i + 11) - 0.5) * 14;
    c.disc(px, y, 1.3, 'q');
    c.set(px, y, 'G');
  }
  // 아가리: 축 처진 비대칭 입, 삐뚤빼뚤한 이빨, 늘어지는 점액 실
  const m = pose.mouth;
  if (m > 0) {
    const h = 1 + m * 2;
    const x0 = hx - 2;
    const x1 = hx + 18;
    for (let x = x0; x <= x1; x++) {
      const sag = Math.round(Math.sin(((x - x0) / (x1 - x0)) * Math.PI) * h);
      c.line(x, hy + 3, x, hy + 3 + sag, 'K');
      if (sag > 1) c.set(x, hy + 3 + sag, 'Z');
    }
    for (let x = x0 + 1; x <= x1 - 1; x += 2) {
      c.set(x, hy + 3, 'V');
      if (hash(x) > 0.5) c.set(x, hy + 4, 'V');
      const sag = Math.round(Math.sin(((x - x0) / (x1 - x0)) * Math.PI) * h);
      if (sag > 2 && hash(x + 5) > 0.45) c.set(x, hy + 2 + sag, 'V');
    }
    // 위아래 턱을 잇는 점액 실
    if (m >= 2) {
      c.line(hx + 4, hy + 3, hx + 5, hy + 2 + h, 'G');
      c.line(hx + 12, hy + 3, hx + 11, hy + 2 + h, 'G');
    }
    // 턱에서 떨어지는 점액
    c.line(hx + 8, hy + 4 + h, hx + 8, hy + 8 + h, 'G');
    c.set(hx + 8, hy + 9 + h, 'g');
  } else c.line(hx + 3, hy + 4, hx + 14, hy + 5, 'Q');
  // 눈: 크기가 제각각인 누런 눈 셋, 가는 세로 동공, 움푹 꺼진 자리
  const eyes = [[hx + 8, hy - 4, 2.2], [hx - 4, hy - 5, 1.2], at(0.42).concat(1.2), at(0.7).map((v, i) => v + (i ? 2 : 6)).concat(1)];
  for (const [x, y, r] of eyes) {
    c.disc(x, y, r + 1, 'Q');
    if (col === 11 || col === 9) c.line(x - r, y, x + r, y, 'K');
    else {
      c.disc(x, y, r, r > 2 ? (d) => (d > 0.75 ? 'x' : 'y') : 'y');
      c.line(x, y - r + 0.5, x, y + r - 0.5, 'K');
    }
  }
  // 뱉을 점액 덩이
  if (pose.spit) {
    c.disc(hx + 17, hy + 6, pose.spit, 'G');
    c.disc(hx + 16.5, hy + 5.5, pose.spit * 0.5, 'q');
  }
  c.outline('k');
  // 몸에서 흘러내리는 방울 (윤곽 밖으로)
  for (let i = 0; i < 6; i++) {
    const [x, y] = at(0.25 + i * 0.13);
    const dx = x + (i % 2 ? 12 : -14) + hash(i) * 2;
    const len = 3 + Math.round(hash(i + 30) * 6);
    c.line(dx, y + 4, dx, y + 4 + len, 'Q');
    c.set(dx, y + 5 + len, 'G');
  }
  if (!pose.down)
    for (const [ox, len] of [[-8, 6], [14, 9], [4, 4]]) {
      c.line(hx + ox, hy + 10, hx + ox, hy + 10 + len, 'Q');
      c.set(hx + ox, hy + 11 + len, 'G');
    }
  // 물결 앞쪽 (몸을 가림)
  c.ellipse(46, 91, 24, 3, (d) => (d > 0.7 ? 'w' : 'a'));
  if (col === 7) c.map((ch) => (ch === 'g' || ch === 'q' ? 'l' : ch));
  return c;
}

function eelBattle() {
  const frames = [];
  for (const view of VIEWS)
    for (let col = 0; col < 12; col++) {
      const f = eel(col);
      frames.push(view === 'left' ? f.flipX() : f);
    }
  return frames;
}


// ---------------------------------------------------------------------
// 2막 모래 괴물: 모래빛 마디 벌레, 검은 큰 턱. 모래 속에서 머리만 내밀고 문다
// ---------------------------------------------------------------------
const SANDW = ['c', 'd', 'D'];
function crawler(view, step = 0, rise = 1) {
  const c = new Cv(32, 40);
  const v = view === 'left' ? 'right' : view;
  const wig = [0, 1, 0, -1][step % 4];
  // 흙더미 (몸이 나온 자리)
  c.ellipse(16, 37, 9, 2.6, (d) => (d > 0.75 ? 'D' : d > 0.4 ? 'd' : 'c'));
  if (rise <= 0) {
    // 모래 속: 흙더미만, 작은 돌기
    c.ellipse(16, 36, 6, 2.4, (d) => (d > 0.6 ? 'D' : 'd'));
    c.set(14 + wig, 34, 'D');
    c.set(18 - wig, 35, 'C');
    c.outline('C');
    return view === 'left' ? c.flipX() : c;
  }
  const n = 4;
  const lean = v === 'right' ? 1.8 : 0;
  let hx = 16;
  let hy = 36;
  for (let i = 0; i < n; i++) {
    const r = 4.6 - i * 0.5;
    hx = 16 + lean * i + (i % 2 ? wig : 0);
    hy = 36 - i * 4.2 * rise;
    c.disc(hx, hy, r, shade(SANDW));
    if (i > 0) c.line(hx - r + 1, hy + 1, hx + r - 1, hy + 1, 'D');
  }
  // 머리와 큰 턱
  const jaw = step === 1 ? 3 : 1;
  if (v === 'up') {
    c.disc(hx, hy - 2, 3.6, shade(SANDW));
  } else {
    const fx = v === 'right' ? 3 : 0;
    c.disc(hx + fx, hy - 2, 3.8, shade(['c', 'c', 'd']));
    c.line(hx + fx - 3, hy, hx + fx - 4 - (v === 'right' ? 0 : jaw), hy + 3, 'K');
    c.line(hx + fx + 3, hy, hx + fx + 4 + jaw, hy + 3, 'K');
    if (v === 'right') c.line(hx + fx + 2, hy - 1, hx + fx + 5 + jaw, hy + 1, 'K');
    c.set(hx + fx - (v === 'right' ? -1 : 1), hy - 3, 'k');
    if (v !== 'right') c.set(hx + fx + 1, hy - 3, 'k');
  }
  c.outline('C');
  // 흙더미 앞쪽 (몸 밑동을 가림)
  c.ellipse(16, 38, 8, 1.6, (d) => (d > 0.6 ? 'D' : 'd'));
  return view === 'left' ? c.flipX() : c;
}

/** 모래 괴물 전투 시트: 0~5 물기, 7 맞음, 8·9 튀어나오기, 10 모래 속(흙더미만), 11 쓰러짐 */
function crawlerBattle() {
  const frames = [];
  for (const view of VIEWS) {
    const fwd = { down: [0, 1], left: [-1, 0], right: [1, 0], up: [0, -1] }[view];
    for (let col = 0; col < 12; col++) {
      const cell = new Cv(48, 48);
      if (col === 10) cell.blit(crawler(view, 0, 0), 8, 8);
      else if (col === 8) cell.blit(crawler(view, 0, 0.45), 8, 8);
      else if (col === 9) cell.blit(crawler(view, 1, 0.75), 8, 8);
      else if (col === 11) {
        const b = crawler(view === 'up' ? 'down' : view, 0, 0.3);
        b.map((ch) => (ch === 'c' ? 'd' : ch));
        cell.blit(b, 8, 9);
      } else if (col === 7) cell.blit(crawler(view, 0), 8 - fwd[0] * 2, 8 - fwd[1] * 2);
      else if (col < 6) {
        const strike = col % 2 === 1;
        cell.blit(crawler(view, strike ? 1 : 0, strike ? 1.15 : 0.9), 8 + fwd[0] * (strike ? 4 : -1), 8 + fwd[1] * (strike ? 4 : -1));
      } else cell.blit(crawler(view, 0), 8, 8);
      frames.push(cell);
    }
  }
  return frames;
}

// ---------------------------------------------------------------------
// 2막 사막 전갈: 붉은 갈색 등껍질, 집게, 말아 올린 꼬리와 독침
// ---------------------------------------------------------------------
const SHELL = ['p', 'O', 'P'];
function scorpion(view, step = 0, sting = 0) {
  const c = new Cv(32, 40);
  const v = view === 'left' ? 'right' : view;
  const a = [0, 1, 0, -1][step % 4];
  if (v === 'right') {
    // 다리
    for (const [x, k] of [[10, 1], [14, -1], [18, 1]]) {
      c.line(x, 35, x - 2 + a * k, 38, 'P');
      c.line(x + 1, 35, x + 2 - a * k, 38, 'P');
    }
    // 꼬리: 몸 뒤에서 위로 말려 머리 위로
    const pts = sting ? [[8, 33], [5, 29], [5, 24], [8, 20], [13, 19], [18, 21], [22, 25]] : [[8, 33], [5, 29], [5, 24], [8, 20], [12, 19], [15, 21]];
    pts.forEach(([x, y], i) => c.disc(x, y, 2.3 - i * 0.15, shade(SHELL)));
    const [tx, ty] = pts[pts.length - 1];
    c.line(tx, ty, tx + 2, ty + 3, sting ? 'x' : 'X');
    // 몸통
    c.ellipse(15, 34, 7.5, 3.4, shade(SHELL));
    for (const x of [11, 14, 17]) c.set(x, 32, 'O');
    // 집게
    c.ellipse(24, 34, 2.6, 1.8, shade(SHELL));
    c.disc(27 + (step === 1 ? 1 : 0), 33, 2, shade(SHELL));
    c.set(29 + (step === 1 ? 1 : 0), 34, '.');
    c.set(21, 32, 'k');
  } else {
    const up = v === 'up';
    for (const k of [-1, 1])
      for (const [dx, dy] of [[5, 0], [6, 2], [5, 4]]) c.line(16 + k * 4, 33 + dy, 16 + k * (dx + 3) + a * k, 34 + dy + (dy === 4 ? 1 : 0), 'P');
    c.ellipse(16, 34, 5.5, 4, shade(SHELL));
    c.rect(13, 33, 19, 33, 'O');
    // 꼬리: 몸 뒤에서 솟아 위로
    const h = sting ? 18 : 14;
    for (let i = 0; i <= 6; i++) c.disc(16, (up ? 36 : 32) - (i * h) / 6, 2.2 - i * 0.12, shade(SHELL));
    c.line(16, (up ? 36 : 32) - h - 2, 16, (up ? 36 : 32) - h + 1, sting ? 'x' : 'X');
    if (!up) {
      // 집게 둘
      for (const k of [-1, 1]) {
        c.line(16 + k * 4, 36, 16 + k * 7, 38, 'O');
        c.disc(16 + k * (8 + (step === 1 ? 1 : 0)), 38, 1.8, shade(SHELL));
      }
      c.set(14, 35, 'k');
      c.set(18, 35, 'k');
    }
  }
  c.outline('P');
  return view === 'left' ? c.flipX() : c;
}

/** 전갈 전투 시트: 0~5 집게, 7 맞음, 8·9 꼬리 들기(독침 준비), 10 움츠림, 11 뒤집힘 */
function scorpionBattle() {
  const frames = smallBattle(scorpion);
  for (let r = 0; r < 4; r++)
    for (const col of [8, 9]) {
      const cell = new Cv(48, 48);
      cell.blit(scorpion(VIEWS[r], 0, 1), 8, col === 9 ? 7 : 8);
      frames[r * 12 + col] = cell;
    }
  return frames;
}

// ---------------------------------------------------------------------
// 3막 안개 짐승: 안개처럼 흰 털의 네발짐승. 등이 굽고 머리를 낮춤, 붉은 눈
// ---------------------------------------------------------------------
const MIST = ['v', 'V', 't'];
function mistBeast(view, step = 0) {
  const c = new Cv(32, 40);
  const v = view === 'left' ? 'right' : view;
  const leg = [0, 1, 0, -1][step % 4];
  if (v === 'right') {
    // 옆: 긴 몸통, 낮은 머리, 늘어진 꼬리털
    for (const [x, ph] of [[9, leg], [13, -leg], [20, -leg], [24, leg]]) c.rect(x, 31, x + 1, 37 + (ph > 0 ? 0 : 1) - Math.abs(ph), 'T');
    c.ellipse(16, 27, 10, 5.2, shade(MIST));
    c.ellipse(13, 23.5, 6, 3, shade(MIST));
    c.disc(26, 28, 3.6, shade(MIST));
    c.line(28, 28, 30, 30, 'V');
    c.set(27, 27, 'X');
    c.line(6, 25, 3, 29, 'V');
    c.line(5, 26, 2, 31, 't');
  } else {
    // 앞·뒤: 어깨를 웅크린 몸, 앞다리 둘
    for (const [x, ph] of [[11, leg], [19, -leg]]) c.rect(x, 31, x + 1, 37 - Math.abs(ph), 'T');
    c.ellipse(15.5, 27, 8, 6, shade(MIST));
    c.ellipse(15.5, 22, 6.5, 3.5, shade(MIST));
    if (v === 'down') {
      c.disc(15.5, 29, 3.6, shade(['v', 'v', 'V']));
      c.set(14, 28, 'X');
      c.set(17, 28, 'X');
      c.line(15, 32, 16, 32, 'T');
    } else c.line(15, 30, 16, 36, 'V');
  }
  c.outline('T');
  return view === 'left' ? c.flipX() : c;
}

/** gen-battle.mjs가 쓰는 목록 */
export const CREATURES = {
  sewer_rat: { walk: walkSheet(rat), battle: smallBattle(rat), cell: 48 },
  sewer_leech: { walk: walkSheet(leech), battle: smallBattle(leech), cell: 48 },
  sewer_eel: { walk: null, battle: eelBattle(), cell: 96 },
  sand_crawler: { walk: walkSheet((v, i) => crawler(v, i, 0)), battle: crawlerBattle(), cell: 48 },
  desert_scorpion: { walk: walkSheet(scorpion), battle: scorpionBattle(), cell: 48 },
  mist_beast: { walk: walkSheet(mistBeast), battle: smallBattle(mistBeast), cell: 48 },
};
