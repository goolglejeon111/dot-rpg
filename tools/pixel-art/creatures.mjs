// 1막 수로 생물: 수로 쥐, 수로 거머리, 수로의 괴물(큰 장어)
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
// 수로의 괴물: 물 위로 목을 내민 거대한 장어 (96x96 칸)
// ---------------------------------------------------------------------
const EEL = ['G', 'Q', 'k'];
function eel(col) {
  const c = new Cv(96, 96);
  // 물결 (아래)
  const ripple = (rx, ry) => {
    c.ellipse(46, 88, rx, ry, (d) => (d > 0.82 ? 'w' : d > 0.6 ? 'a' : 'A'));
  };
  if (col === 10) {
    // 잠수: 물결만
    ripple(26, 6);
    c.ellipse(46, 88, 10, 2, 'W');
    return c;
  }
  ripple(30, 7);
  // 몸통 곡선: 밑동(46, 88)에서 머리까지
  const pose = {
    0: { hx: 56, hy: 30, mouth: 0 }, // 서기
    1: { hx: 44, hy: 22, mouth: 1 }, // 물기 준비 (뒤로 젖힘)
    2: { hx: 70, hy: 48, mouth: 3 }, // 물기
    3: { hx: 50, hy: 28, mouth: 0, tail: 1 }, // 꼬리 준비
    4: { hx: 52, hy: 32, mouth: 0, tail: 2 }, // 꼬리 쓸기
    5: { hx: 54, hy: 24, mouth: 2 }, // 물 뿜기 준비
    6: { hx: 56, hy: 30, mouth: 0 },
    7: { hx: 50, hy: 34, mouth: 1 }, // 맞음
    8: { hx: 54, hy: 24, mouth: 2 }, // 시전(물 모으기)
    9: { hx: 50, hy: 60, mouth: 0 }, // 잠수 중
    11: { hx: 70, hy: 78, mouth: 1, down: true }, // 쓰러짐: 머리를 물 위에 늘어뜨림
  }[col];
  if (pose.tail) {
    // 꼬리: 옆 물속에서 솟음
    const tx = pose.tail === 1 ? 18 : 80;
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      c.disc(tx + (pose.tail === 1 ? -t * 6 : t * 10), 88 - t * 30, 4.5 - t * 3, shade(EEL));
    }
    c.disc(tx + (pose.tail === 1 ? -7 : 12), 56, 2.5, 'Q');
  }
  const bx = 46;
  const by = 88;
  const mx = pose.down ? 62 : bx - 14;
  const my = pose.down ? 60 : 56;
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = (1 - t) * (1 - t) * bx + 2 * (1 - t) * t * mx + t * t * pose.hx;
    const y = (1 - t) * (1 - t) * by + 2 * (1 - t) * t * my + t * t * pose.hy;
    const r = 8.5 - t * 2.5;
    c.disc(x, y, r, (d) => (d < 0.35 ? 'c' : d < 0.55 ? 'G' : d < 0.85 ? 'Q' : 'k'));
  }
  // 등지느러미
  for (let i = 6; i < N - 4; i += 4) {
    const t = i / N;
    const x = (1 - t) * (1 - t) * bx + 2 * (1 - t) * t * mx + t * t * pose.hx;
    const y = (1 - t) * (1 - t) * by + 2 * (1 - t) * t * my + t * t * pose.hy;
    c.line(x - 8, y - 2, x - 10, y - 4, 'I');
  }
  // 머리
  const { hx, hy, mouth } = pose;
  c.ellipse(hx + 2, hy, 11, 7.5, (d) => (d < 0.4 ? 'g' : d < 0.8 ? 'G' : 'Q'));
  c.ellipse(hx + 9, hy + 1, 5, 4.5, 'G');
  // 입
  if (mouth > 0) {
    const h = mouth * 2;
    c.rect(hx + 4, hy + 2, hx + 15, hy + 2 + h, 'Z');
    for (let x = hx + 5; x <= hx + 14; x += 2) {
      c.set(x, hy + 2, 'v');
      c.set(x + 1, hy + 2 + h, 'v');
    }
  } else c.line(hx + 4, hy + 3, hx + 14, hy + 3, 'k');
  // 눈
  if (col === 11) c.line(hx + 3, hy - 3, hx + 6, hy - 3, 'k');
  else {
    c.disc(hx + 4, hy - 3, 1.6, 'y');
    c.set(hx + 4, hy - 3, 'k');
  }
  if (col === 5 || col === 8) c.disc(hx + 15, hy + 4, col === 8 ? 3 : 2, (d) => (d < 0.5 ? 'w' : 'a'));
  c.outline('k');
  // 물결 앞쪽 (몸을 가림)
  c.ellipse(46, 91, 22, 3, (d) => (d > 0.7 ? 'w' : 'a'));
  if (col === 7) c.map((ch) => (ch === 'g' ? 'l' : ch));
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

/** gen-battle.mjs가 쓰는 목록 */
export const CREATURES = {
  sewer_rat: { walk: walkSheet(rat), battle: smallBattle(rat), cell: 48 },
  sewer_leech: { walk: walkSheet(leech), battle: smallBattle(leech), cell: 48 },
  sewer_eel: { walk: null, battle: eelBattle(), cell: 96 },
  sand_crawler: { walk: walkSheet((v, i) => crawler(v, i, 0)), battle: crawlerBattle(), cell: 48 },
  desert_scorpion: { walk: walkSheet(scorpion), battle: scorpionBattle(), cell: 48 },
};
