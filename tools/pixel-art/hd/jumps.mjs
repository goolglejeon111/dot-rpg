// 점프 장애물 그림 (docs/대본/점프_장애물.md, docs/claude_code/점프_장애물.md). 고해상도 캔버스(hicv.mjs)로 그림
// 한 칸 = 논리 32x32 (그림은 64x64). 넘는 것(hurdle)은 칸 아래쪽에 서고 위로 솟음, 틈(gap)은 바닥 칸 하나를 채움
// 줄 순서가 곧 프레임 번호 (src/explore/jumps.ts JUMP_ART 와 같아야 함)
import { HiCv, rng } from './hicv.mjs';

const T = 32;

/** 쓰러진 갑옷: 바닥에 흩어진 흉갑·투구·건틀릿, 뒤에 넘어진 거치대 막대 (점검_피드백2 3-3: 한눈에 갑옷으로) */
function armorRack() {
  const c = new HiCv(T, T);
  // 넘어진 거치대 막대 (가늘게, 뒤쪽)
  c.line(1, 18.5, 30, 16.5, 'o', 1);
  // 흉갑 (앞면이 보이게 누움): 어깨가 넓고 허리가 좁은 판, 목 파임, 가운데 세로 능선, 가슴 둥근 빛
  const cx = 11;
  c.ellipse(cx, 22, 7.5, 4.2, (d, x, y) => (x < cx - 1 && y < 22 ? 'l' : d > 0.8 ? 'M' : 'm'));
  c.ellipse(cx, 26.2, 5, 2.6, (d, x, y) => (d > 0.75 ? 'M' : 'm'));
  c.ellipse(cx, 18.6, 2.6, 1.5, 'K');
  c.line(cx, 20, cx, 28.3, 'M', 0.8);
  c.ellipse(cx - 3, 22.4, 1.6, 1.2, 'l');
  c.line(cx - 4.6, 27.8, cx + 4.6, 27.8, 'Y', 0.9);
  // 투구 (얼굴 쪽이 보임): 둥근 머리통, T자 눈·코 틈, 붉은 깃 장식
  c.line(22.5, 17.4, 27.5, 14.8, 'x', 1.6);
  c.disc(25, 22.6, 4.6, (d, x, y) => (y < 20.5 && x < 25 ? 'l' : d > 0.8 ? 'M' : 'm'));
  c.rect(21.6, 21.6, 28.4, 22.8, 'K');
  c.rect(24.4, 22.6, 25.6, 25.6, 'K');
  // 건틀릿 (작은 손 판)
  c.ellipse(19.5, 28, 2.4, 1.4, (d, x, y) => (y < 28 ? 'm' : 'M'));
  c.line(18, 28.4, 21, 28.4, 'L', 0.5);
  c.outline('L');
  return c;
}
/** 넘어진 촛대: 쇠 받침과 꺾인 초 */
function candlestick() {
  const c = new HiCv(T, T);
  c.line(4, 25, 25, 22, 'Y', 1.6);
  c.ellipse(5, 25, 3, 2.2, 'Y');
  for (const x of [12, 19]) c.line(x, 23.5, x + 1, 20, 'Y', 1);
  c.rect(24, 20.5, 29, 23, (x) => (x < 26 ? 'v' : 'V'));
  c.ellipse(14, 27, 3.5, 1, 'V');
  c.outline('C');
  return c;
}
/** 골목을 막은 빈 수레: 짐칸 판자와 바퀴 */
function cart() {
  const c = new HiCv(T, T);
  c.rect(2, 12, 29, 22, (x, y) => (y < 14 ? 'p' : (x - 2) % 6 < 0.7 ? 'O' : 'o'));
  c.rect(2, 22, 29, 23, 'O');
  for (const x of [8, 23]) {
    c.disc(x, 25, 4.2, (d) => (d > 0.75 ? 'P' : d < 0.25 ? 'O' : 'o'));
    c.line(x - 3, 25, x + 3, 25, 'O');
    c.line(x, 22, x, 28, 'O');
  }
  c.line(29, 18, 31, 26, 'o', 1.2);
  c.outline('P');
  return c;
}
/** 굴러떨어진 바위 */
function rock() {
  const c = new HiCv(T, T);
  c.ellipse(16, 21, 12, 8, (d, x, y) => (y < 17 ? 'r' : d < 0.75 ? 't' : 'T'));
  c.ellipse(9, 24, 5, 4, (d, x, y) => (y < 23 ? 't' : 'T'));
  c.line(13, 16, 17, 22, 'T');
  c.line(19, 19, 23, 18, 'T');
  c.outline('R');
  return c;
}
/** 쓰러진 고목: 이끼 낀 둥치, 잘린 단면 */
function log() {
  const c = new HiCv(T, T);
  c.rect(2, 17, 27, 26, (x, y) => (y < 19 ? 'p' : y > 24 ? 'O' : 'o'));
  for (const x of [6, 13, 20]) c.line(x, 19, x + 3, 25, 'O');
  for (const x of [5, 11, 17, 23]) c.ellipse(x, 17.5, 2.2, 1, 'g');
  c.ellipse(27.5, 21.5, 3, 4.8, (d) => (d < 0.4 ? 'o' : d < 0.75 ? 'p' : 'O'));
  c.outline('P');
  return c;
}
/** 불탄 들보: 검게 그을린 나무, 갈라진 틈에 남은 불씨 */
function beam() {
  const c = new HiCv(T, T);
  c.line(2, 25, 29, 18, 'K', 4.5);
  c.line(3, 23, 28, 16.5, 'O', 1.2);
  c.line(8, 23, 13, 22, 'x');
  c.line(18, 20.5, 22, 19.5, 'y');
  c.ellipse(24, 26, 4, 1.4, 'T');
  c.outline('k');
  return c;
}
/** 무너진 담: 쌓인 돌과 흙 */
function wall() {
  const c = new HiCv(T, T);
  const rnd = rng(31);
  c.ellipse(16, 25, 14, 4, 'D');
  for (const [x, y, w] of [[3, 19, 7], [10, 18, 8], [19, 19, 7], [6, 14, 7], [14, 13, 8], [24, 15, 5]]) {
    c.rect(x, y, x + w, y + 4, (X, Y) => (Y < y + 1 ? 'r' : 't'));
    c.rect(x, y + 4, x + w, y + 4.5, 'T');
  }
  for (let k = 0; k < 6; k++) c.disc(3 + rnd() * 26, 25 + rnd() * 3, 1, 't');
  c.outline('R');
  return c;
}
/** 무너진 수로 옆 통로: 깨진 돌 가장자리 아래로 물이 흐름 */
function sewerGap() {
  const c = new HiCv(T, T);
  c.rect(0, 0, 31, 31, (x, y) => (y < 5 ? 'W' : (x + y * 2) % 9 < 1 ? 'w' : y % 6 < 1 ? 'a' : 'A'));
  for (const x of [1, 9, 17, 25]) c.rect(x, 0, x + 5, 2.5, (X, Y) => (Y < 1 ? 'r' : 'T'));
  for (const x of [4, 13, 22]) c.rect(x, 29.5, x + 6, 31, 'T');
  c.edge('R');
  return c;
}
/** 개울의 징검돌 사이: 물과 양옆 돌 끝 */
function stones() {
  const c = new HiCv(T, T);
  c.rect(0, 0, 31, 31, (x, y) => ((x * 2 + y) % 11 < 1 ? 'w' : y % 7 < 1 ? 'a' : 'A'));
  for (const [x, y] of [[3, 8], [28, 22]]) c.ellipse(x, y, 4, 3, (d, X, Y) => (Y < y - 1 ? 'r' : 't'));
  c.outline('W');
  return c;
}
/** 모래 구덩이: 가운데로 빨려 드는 깔때기 */
function sandPit() {
  const c = new HiCv(T, T);
  c.ellipse(16, 16, 15.5, 13, (d) => (d < 0.25 ? 'C' : d < 0.55 ? 'D' : d < 0.8 ? 'd' : 'c'));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    c.line(16 + Math.cos(a) * 13, 16 + Math.sin(a) * 11, 16 + Math.cos(a + 0.5) * 4, 16 + Math.sin(a + 0.5) * 3, 'D');
  }
  return c;
}
/** 눈 덮인 얼음 틈: 푸른 그늘이 깊어지는 갈라짐 */
function iceCrack() {
  const c = new HiCv(T, T);
  c.rect(0, 0, 31, 31, (x, y) => (y < 3 || y > 28.5 ? 'v' : y < 7 || y > 25 ? 'a' : y < 11 || y > 21 ? 'A' : 'W'));
  for (const x of [0, 7, 15, 22, 29]) c.ellipse(x + 3, 2, 4, 2.2, 'v');
  for (const x of [3, 11, 19, 26]) c.ellipse(x + 2, 30, 4, 2, 'V');
  c.line(4, 15, 12, 17, 'B');
  c.line(12, 17, 22, 14, 'B');
  return c;
}
/** 용암 틈: 검은 바위 가장자리, 가운데 흐르는 불 */
function lavaCrack() {
  const c = new HiCv(T, T);
  c.rect(0, 0, 31, 31, (x, y) => (y < 4 || y > 27.5 ? 'K' : y < 8 || y > 24 ? 'Z' : y < 12 || y > 20 ? 'X' : (x + y) % 7 < 2 ? 'y' : 'x'));
  for (const x of [2, 10, 19, 26]) c.rect(x, 0, x + 5, 3, 'k');
  for (const x of [5, 14, 22]) c.rect(x, 29, x + 6, 31, 'k');
  return c;
}

/** 프레임 순서 (src/explore/jumps.ts 와 같음) */
export const JUMP_ART = {
  armor_rack: armorRack,
  candlestick,
  cart,
  rock,
  log,
  beam,
  wall,
  sewer_gap: sewerGap,
  stones,
  sand_pit: sandPit,
  ice_crack: iceCrack,
  lava_crack: lavaCrack,
};
