// 프롤로그 도트 맵 생성기 → Tiled JSON (src/data/maps/*.json)
// 실행: npm run maps   (그림을 바꿨으면 먼저 npm run art:palace)
//
// 만든 JSON은 Tiled(무료 맵 편집기)로 열어 고칠 수 있다. 단, 이 파일을 다시 실행하면 덮어쓰므로
// Tiled에서 고치기 시작했다면 이 생성기는 더 이상 실행하지 않는다.
//
// 레이어
//   floor    바닥 타일
//   walls    벽 타일 (타일셋의 solid 속성 = 막힘)
//   blood    피 웅덩이 (처음엔 꺼 둠. 대본 진행에 따라 켜고 끈다)
//   objects  물건·조사할 곳·위치 표시
//     type prop   그림 물건. name = 그림 이름(src/data/explore/sprites.json). 사각형 = 그림 크기, 아래 가운데가 발밑
//                 속성 wall(벽에 걸림, 막지 않음) / solid "가로,세로"(발밑 막는 상자)
//     type body   쓰러진 인물. 속성 sprite(전투 그림 ID), facing
//     type look   조사할 곳. name = 물건 ID(src/data/explore/looks.json). 표시는 가까이 간 레온 머리 위에 뜬다
//     (prop에 hidden: true면 처음엔 안 보이고, stage.json의 props로 보이게 한다)
//     type spawn  인물이 서는 자리. 속성 facing
//     type goal   닿으면 이동이 끝나는 곳. 속성 r(반지름)
//     type arena  전투장으로 쓰는 구역 (448x288)
//     type snow   눈 효과 구역. 속성 mode = glass(창 유리 안) / blow(창으로 들이침) / fall(하늘 전체)
//     type light  추가 조명. 속성 color, radius, intensity, spill(바닥에 번지는 빛)
//   (횃불·촛불은 그림 이름으로 게임이 알아서 불빛을 단다)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const SPR = JSON.parse(readFileSync(join(ROOT, 'src/data/explore/sprites.json'), 'utf8'));
const NAMES = SPR.tiles.names;
const TS = 32;
const gid = (name) => {
  const i = NAMES.indexOf(name);
  if (i < 0) throw new Error(`타일 이름이 없습니다: ${name}`);
  return i + 1;
};

// 글자 → 타일. 바닥 글자는 floor 레이어, 벽 글자는 walls 레이어
const FLOOR = {
  '.': (x, y) => ((x * 7 + y * 3) % 5 === 0 ? 'floor2' : 'floor'),
  '-': () => 'carpet_top',
  '=': () => 'carpet_mid',
  _: () => 'carpet_bot',
  ',': (x, y) => ((x * 5 + y * 11) % 3 === 0 ? 'stone2' : 'stone'),
  w: () => 'wood',
  '~': (x, y) => ((x * 3 + y * 7) % 4 === 0 ? 'water2' : 'water'),
  q: () => 'quay',
  c: () => 'cobble',
  // 1막
  s: (x, y) => ((x * 7 + y * 13) % 9 === 0 ? 'sewer_floor2' : 'sewer_floor'),
  e: () => 'sewer_edge',
  o: (x, y) => ((x * 3 + y * 7) % 4 === 0 ? 'sewer_water2' : 'sewer_water'),
  i: () => 'cistern_floor',
  k: () => 'cellar_floor',
  m: () => 'mud',
  n: () => 'mud_snow',
  b: () => 'bridge',
  g: () => 'grass',
  d: () => 'sand',
  r: () => 'river',
  // 2막
  a: (x, y) => ((x * 5 + y * 3) % 7 === 0 ? 'desert2' : 'desert'),
  u: () => 'dune',
  y: () => 'oasis_grass',
  f: () => 'adobe_floor',
  t: () => 'road',
  j: () => 'rock_floor',
  // 3막
  h: () => 'dry_field',
  l: () => 'dry_grass',
  p: () => 'forest_floor',
  // 4막
  1: () => 'frost_field',
  2: () => 'frost_road',
  3: () => 'ice',
  4: () => 'snow',
  5: () => 'snow_path',
  6: () => 'dwarf_floor',
  7: () => 'stone_bridge',
  8: () => 'forge_floor',
  9: () => 'black_rock',
  0: () => 'astra_floor',
};
const WALL = {
  Q: (x, y) => ((x * 3 + y * 7) % 4 === 0 ? 'deep_water2' : 'deep_water'), // 저수조 깊은 물 (벽 레이어라 못 들어감)
  '#': () => 'wall_top',
  '^': () => 'wall_up',
  v: () => 'wall_low',
  U: () => 'window_up',
  L: () => 'window_low',
  H: () => 'castle_top',
  C: (x, y) => ((x * 13 + y * 5) % 6 === 0 ? 'castle_moss' : 'castle_wall'),
  B: () => 'castle_base',
  // 1막
  X: () => 'sewer_wall_top',
  S: () => 'sewer_wall',
  K: () => 'cellar_wall',
  P: () => 'shack_wall',
  R: () => 'shack_roof',
  // 2막
  O: () => 'oasis_water',
  A: () => 'adobe_wall',
  T: () => 'adobe_roof',
  Z: () => 'sandstone',
  Y: () => 'sandstone_top',
  I: () => 'bars',
  J: () => 'rock_wall',
  // 3막
  G: () => 'ruin_wall',
  // 4막
  D: () => 'snow_rock',
  E: () => 'dwarf_wall',
  F: (x, y) => ((x * 5 + y * 3) % 4 === 0 ? 'lava2' : 'lava'),
  M: () => 'lava_rock_wall',
  N: () => 'astra_wall',
  V: () => 'barrier',
  W: () => 'cloud',
};

/** 맵 한 장을 Tiled JSON으로 */
function tiled(id, def) {
  const rows = def.rows;
  const w = rows[0].length;
  const h = rows.length;
  rows.forEach((r, i) => {
    if (r.length !== w) throw new Error(`${id}: ${i}번째 줄 길이가 다릅니다 (${r.length} / ${w})`);
  });
  const floor = [];
  const walls = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      floor.push(FLOOR[ch] ? gid(FLOOR[ch](x, y)) : 0);
      walls.push(WALL[ch] ? gid(WALL[ch](x, y)) : 0);
      if (ch !== ' ' && !FLOOR[ch] && !WALL[ch]) throw new Error(`${id}: 모르는 글자 "${ch}" (${x},${y})`);
    }
  const blood = Array(w * h).fill(0);
  for (const [x, y, name] of def.blood ?? []) blood[y * w + x] = gid(name);

  let oid = 1;
  const props = (o) => Object.entries(o).filter(([, v]) => v !== undefined).map(([name, value]) => ({
    name,
    type: typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? (Number.isInteger(value) ? 'int' : 'float') : 'string',
    value,
  }));
  const objects = def.objects.map((o) => {
    const base = { id: oid++, name: o.name ?? '', type: o.type, rotation: 0, visible: !o.hidden };
    let shape;
    if (o.type === 'prop') {
      const s = SPR.props[o.name];
      if (!s) throw new Error(`${id}: 물건 그림이 없습니다: ${o.name}`);
      shape = { x: o.x - s.w / 2, y: o.y - s.h, width: s.w, height: s.h };
    } else if (o.w) shape = { x: o.x, y: o.y, width: o.w, height: o.h };
    else shape = { x: o.x, y: o.y, width: 0, height: 0, point: true };
    const { name, type, x, y, w: _w, h: _h, ...rest } = o;
    const p = props(rest);
    return { ...base, ...shape, ...(p.length ? { properties: p } : {}) };
  });

  const layer = (lid, name, data, visible = true) => ({ id: lid, name, type: 'tilelayer', x: 0, y: 0, width: w, height: h, opacity: 1, visible, data });
  const layers = [layer(1, 'floor', floor), layer(2, 'walls', walls)];
  if (def.blood) layers.push(layer(3, 'blood', blood, false));
  layers.push({ id: 4, name: 'objects', type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true, draworder: 'topdown', objects });

  const cols = SPR.tiles.columns;
  return {
    compressionlevel: -1,
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    width: w,
    height: h,
    tilewidth: TS,
    tileheight: TS,
    nextlayerid: 5,
    nextobjectid: oid,
    properties: props(def.props),
    layers,
    tilesets: [
      {
        firstgid: 1,
        name: 'palace',
        image: '../../../public/assets/explore/palace_tiles.png',
        imagewidth: cols * TS,
        imageheight: Math.ceil(NAMES.length / cols) * TS,
        columns: cols,
        tilecount: NAMES.length,
        tilewidth: TS,
        tileheight: TS,
        margin: 0,
        spacing: 0,
        tiles: NAMES.map((n, i) => ({
          id: i,
          properties: [
            { name: 'name', type: 'string', value: n },
            ...(SPR.tiles.solid.includes(n) ? [{ name: 'solid', type: 'bool', value: true }] : []),
          ],
        })),
      },
    ],
  };
}

// ---------------------------------------------------------------------
// 도우미
// ---------------------------------------------------------------------
/** w x h 빈 격자에 글자를 칠한다 */
function grid(w, h, fill = ' ') {
  const g = Array.from({ length: h }, () => Array(w).fill(fill));
  return {
    g,
    rect(x0, y0, x1, y1, ch) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = ch;
      return this;
    },
    set(x, y, ch) {
      g[y][x] = ch;
      return this;
    },
    rows: () => g.map((r) => r.join('')),
  };
}
const cx = (col) => col * TS + TS / 2; // 칸 가운데 x
const wallItem = (name, x, foot = 80) => ({ type: 'prop', name, x, y: foot, wall: true });
const look = (name, x, y, iconY) => ({ type: 'look', name, x, y, iconY });
const spawn = (name, x, y, facing) => ({ type: 'spawn', name, x, y, facing });

const MAPS = {};

// ---------------------------------------------------------------------
// 1) 황궁 동쪽 회랑 (장면 1, 2): 긴 회랑 + 가운데 아래로 넓어지는 구간(장면 2 전투)
// ---------------------------------------------------------------------
{
  const W = 62;
  const H = 13;
  const HALL = [34, 47]; // 넓은 구간 (14칸 = 전투장 가로 448)
  const WINDOWS = [5, 11, 17, 23, 29, 37, 44, 53];
  const m = grid(W, H);
  m.rect(0, 0, W - 1, 0, '#');
  m.rect(1, 1, W - 2, 1, '^');
  m.rect(1, 2, W - 2, 2, 'v');
  for (const c of WINDOWS) m.set(c, 1, 'U').set(c, 2, 'L');
  m.rect(1, 3, W - 2, 3, '.');
  m.rect(1, 4, W - 2, 4, '-');
  m.rect(1, 5, W - 2, 5, '=');
  m.rect(1, 6, W - 2, 6, '_');
  m.rect(1, 7, W - 2, 7, '.');
  m.rect(0, 1, 0, 8, '#');
  m.rect(W - 1, 1, W - 1, 8, '#');
  m.rect(1, 8, W - 2, 8, '#');
  m.rect(HALL[0] - 1, 8, HALL[1] + 1, 12, '#');
  m.rect(HALL[0], 8, HALL[1], 11, '.');

  const objects = [];
  // 기둥 (벽 앞 바닥에 선다)
  for (const c of [2, 8, 14, 20, 26, 32, 49, 55]) objects.push({ type: 'prop', name: 'pillar', x: cx(c), y: 118, solid: '24,10' });
  // 횃불, 깃발
  for (const c of [4, 10, 16, 22, 28, 35, 46, 51, 57]) objects.push(wallItem('torch', cx(c), 78));
  for (const c of [39, 42]) objects.push(wallItem('banner', cx(c) + 16, 84));
  objects.push(wallItem('banner', cx(6) + 16, 84), wallItem('banner', cx(24) + 16, 84));
  // 조사할 물건
  objects.push(wallItem('portrait', 13 * TS, 82), look('portrait', 13 * TS, 112, 34));
  objects.push(wallItem('honor', 19 * TS, 86), look('honor', 19 * TS, 112, 42));
  objects.push({ type: 'prop', name: 'prayer', x: 25 * TS, y: 122, solid: '16,8' }, look('prayer', 25 * TS, 134, 78));
  objects.push(wallItem('board', 31 * TS - 8, 82), look('petition', 31 * TS - 8, 112, 44));
  objects.push(look('window', cx(44), 112, 40));
  // 장식
  objects.push({ type: 'prop', name: 'armor', x: cx(36), y: 126, solid: '18,8' }, { type: 'prop', name: 'vase', x: cx(45), y: 126, solid: '14,8' });
  // 창 유리 안의 눈
  for (const c of WINDOWS) objects.push({ type: 'snow', name: `window${c}`, x: c * TS + 7, y: 42, w: 18, h: 44, mode: 'glass' });
  // 자리
  objects.push(
    spawn('leon_start', 80, 170, 'right'),
    spawn('bram_wait', 975, 168, 'left'),
    spawn('talk_leon', 925, 170, 'right'),
    spawn('hall_leon', 1250, 250, 'right'),
    spawn('hall_bram', 1330, 236, 'left'),
  );
  objects.push({ type: 'goal', name: 'goal_bram', x: 975, y: 168, r: 36 });
  objects.push({ type: 'goal', name: 'goal_hall', x: 1300, y: 250, r: 64 });
  objects.push({ type: 'arena', name: 'arena', x: HALL[0] * TS, y: 48, w: 448, h: 288 });
  MAPS.east_hall = { rows: m.rows(), objects, props: { place: '황궁 동쪽 회랑', ambient: '#505a8a', bg: '#07060b' } };
}

// ---------------------------------------------------------------------
// 2) 침소로 가는 회랑 (장면 3): 좁고 어두운 회랑, 끝의 앞방에 금장식 침소 문
// ---------------------------------------------------------------------
{
  const W = 45;
  const H = 13;
  const m = grid(W, H);
  m.rect(0, 0, W - 1, 0, '#');
  m.rect(1, 1, W - 2, 1, '^');
  m.rect(1, 2, W - 2, 2, 'v');
  m.rect(0, 1, 0, 6, '#');
  m.rect(1, 3, 29, 5, ',');
  m.rect(1, 6, 29, 6, '#');
  m.rect(29, 6, 29, 12, '#');
  m.rect(30, 3, 43, 11, ',');
  m.rect(29, 12, 44, 12, '#');
  m.rect(44, 0, 44, 12, '#');

  const objects = [];
  for (const c of [8, 21, 34, 39]) objects.push(wallItem('torch', cx(c), 78));
  for (const c of [14, 27]) objects.push(wallItem('banner', cx(c), 84));
  const door = 36.5 * TS + 16; // 앞방 가운데
  objects.push(wallItem('door_gold', door, 96));
  objects.push({ type: 'light', name: 'door_light', x: door, y: 112, color: '#d8ecff', radius: 150, intensity: 1.4, spill: true });
  // 쓰러진 경비병 넷 (하나는 조사할 수 있다)
  objects.push(
    { type: 'body', name: 'guard1', x: 300, y: 124, sprite: 'mob_royal_knight', facing: 'down' },
    { type: 'body', name: 'guard2', x: 470, y: 170, sprite: 'mob_royal_knight', facing: 'left' },
    { type: 'body', name: 'guard3', x: 650, y: 116, sprite: 'mob_royal_knight', facing: 'right' },
    { type: 'body', name: 'guard4', x: 820, y: 172, sprite: 'mob_royal_knight', facing: 'up' },
  );
  objects.push(look('guard', 470, 170, 146));
  objects.push(
    spawn('leon_start', 60, 150, 'right'),
    spawn('intruder_door', door, 132, 'up'),
    spawn('ante_leon', 1040, 236, 'right'),
    spawn('ante_intruder', door, 160, 'down'),
  );
  objects.push({ type: 'goal', name: 'goal_ante', x: 990, y: 150, r: 48 });
  // 장면 3에서 침입자가 떨어뜨린 펜던트 (장면 4에서 문 앞에서 줍는다), 침소로 들어가는 곳
  objects.push({ type: 'prop', name: 'pendant', x: door - 4, y: 150, hidden: true }, look('pendant', door - 4, 146));
  objects.push(spawn('wake_leon', 1100, 160, 'right'));
  objects.push({ type: 'goal', name: 'goal_bed', x: door, y: 116, r: 24 });
  objects.push({ type: 'arena', name: 'arena', x: 30 * TS, y: 48, w: 448, h: 288 });
  MAPS.chamber_corridor = { rows: m.rows(), objects, props: { place: '침소로 가는 회랑', ambient: '#343a5c', bg: '#050409' } };
}

// ---------------------------------------------------------------------
// 3) 황제의 침소 (장면 4, 5): 큰 침대, 커튼, 촛불, 열린 창. 피 웅덩이는 blood 레이어
// ---------------------------------------------------------------------
{
  const W = 22;
  const H = 16;
  const m = grid(W, H);
  m.rect(0, 0, W - 1, 0, '#');
  m.rect(1, 1, W - 2, 1, '^');
  m.rect(1, 2, W - 2, 2, 'v');
  m.rect(0, 1, 0, 13, '#');
  m.rect(W - 1, 1, W - 1, 13, '#');
  m.rect(1, 3, W - 2, 12, 'w');
  m.rect(6, 8, 15, 8, '-');
  m.rect(6, 9, 15, 9, '=');
  m.rect(6, 10, 15, 10, '_');
  m.rect(1, 13, W - 2, 13, '#');
  m.rect(10, 13, 11, 15, 'w');
  m.rect(9, 14, 9, 15, '#');
  m.rect(12, 14, 12, 15, '#');

  const objects = [];
  const win = cx(4);
  objects.push(wallItem('window_open', win, 96), wallItem('curtain', win - 27, 96), wallItem('curtain', win + 27, 96));
  objects.push({ type: 'snow', name: 'window', x: win - 13, y: 44, w: 28, h: 40, mode: 'blow' });
  objects.push(look('open_window', win, 116, 70));
  objects.push({ type: 'light', name: 'moon', x: win, y: 140, color: '#8fb0ff', radius: 130, intensity: 0.9 });
  objects.push({ type: 'prop', name: 'bed', x: 11 * TS, y: 150, solid: '62,44' });
  objects.push(wallItem('portrait', cx(16), 82), wallItem('banner', cx(7) + 8, 84), wallItem('banner', cx(14) + 8, 84));
  for (const [x, y] of [[228, 150], [478, 150], [100, 360], [604, 360]]) objects.push({ type: 'prop', name: 'candle', x, y, solid: '8,6' });
  objects.push({ type: 'prop', name: 'table', x: 568, y: 262, solid: '30,8' }, look('scripture', 568, 276, 226));
  objects.push(wallItem('torch', cx(1) + 8, 78), wallItem('torch', cx(20) - 8, 78));
  objects.push(
    spawn('wake_leon', 352, 400, 'up'),
    spawn('leon_bed', 410, 196, 'left'),
    spawn('door_leon', 352, 380, 'down'),
    spawn('stand_leon', 400, 230, 'down'),
    spawn('door_bram', 352, 330, 'up'),
    spawn('door_oswald', 300, 360, 'up'),
    spawn('knight1', 250, 392, 'up'),
    spawn('knight2', 440, 372, 'up'),
    spawn('knight3', 360, 420, 'up'),
  );
  objects.push({ type: 'goal', name: 'goal_door', x: 352, y: 400, r: 40 });
  const blood = [
    [10, 5, 'blood2'], [11, 5, 'blood1'], [12, 5, 'blood1'], [12, 4, 'blood3'], [11, 6, 'blood3'], [13, 5, 'blood3'], [9, 5, 'blood3'],
  ];
  MAPS.bedchamber = { rows: m.rows(), objects, blood, props: { place: '황제의 침소', ambient: '#3a3a5e', bg: '#060408' } };
}

// ---------------------------------------------------------------------
// 4) 해자 (탈출): 높은 성벽, 검은 물, 건너편 둑의 횃불, 멀리 종탑, 부서진 쇠창살
// ---------------------------------------------------------------------
{
  const W = 32;
  const H = 16;
  const m = grid(W, H);
  m.rect(0, 3, W - 1, 3, 'H');
  m.rect(0, 4, W - 1, 7, 'C');
  m.rect(0, 8, W - 1, 8, 'B');
  m.rect(0, 9, W - 1, 12, '~');
  m.rect(0, 13, W - 1, 13, 'q');
  m.rect(0, 14, W - 1, 15, 'c');

  const objects = [];
  objects.push(wallItem('belltower', cx(8), 104));
  for (const c of [4, 12, 20, 28]) objects.push(wallItem('torch', cx(c), 200));
  objects.push(wallItem('grate', cx(24), 288));
  for (const c of [3, 9, 15, 21, 27]) objects.push({ type: 'prop', name: 'torchpost', x: cx(c), y: 474, solid: '6,6' });
  objects.push({ type: 'snow', name: 'sky', x: 0, y: 0, w: W * TS, h: H * TS, mode: 'fall' });
  objects.push(
    spawn('knight1', 300, 470, 'up'),
    spawn('knight2', 470, 482, 'up'),
    spawn('knight3', 640, 470, 'up'),
    spawn('moat_view', 560, 300, 'up'),
  );
  MAPS.moat = { rows: m.rows(), objects, props: { place: '해자', ambient: '#3a4670', bg: '#04040a' } };
}

// =====================================================================
// 1막 맵
// =====================================================================
/** 바닥 칸 바로 위가 막힌 윗면(X)이면 그 칸을 벽 앞면(S)으로 (수로 통로를 깎아 낸 뒤) */
function faces(m, top = 'X', face = 'S') {
  const g = m.g;
  for (let y = 1; y < g.length; y++)
    for (let x = 0; x < g[0].length; x++) if (FLOOR[g[y][x]] && g[y - 1][x] === top) g[y - 1][x] = face;
  return m;
}
const ty = (row) => row * TS + TS / 2; // 칸 가운데 y
const npc = (name, x, y, sprite, facing, talk) => ({ type: 'npc', name, x, y, sprite, facing, talk });

// ---- 1막-1) 지하 수로 통로 (60 x 20): 물길 양옆 좁은 돌길, 가운데 넓은 물가(전투장) ----
{
  const W = 60;
  const H = 20;
  const m = grid(W, H, 'X');
  m.rect(1, 3, W - 2, 6, 's');
  m.rect(1, 7, W - 2, 7, 'e');
  m.rect(1, 8, W - 2, 13, 'o');
  m.rect(1, 14, W - 2, 16, 's');
  m.rect(22, 7, 37, 12, 's'); // 가운데 넓은 물가 (위아래 돌길을 잇는다)
  m.rect(22, 13, 37, 13, 's');
  m.rect(1, 13, 21, 13, 'e');
  m.rect(38, 13, W - 2, 13, 'e');
  faces(m);
  const objects = [];
  objects.push(wallItem('grate', cx(2), 96));
  objects.push(look('a1_grate', cx(2), 118, 60));
  objects.push(wallItem('scorch', cx(12), 84), wallItem('scorch', cx(15), 84), look('a1_scorched_wall', cx(13), 118, 50));
  objects.push(spawn('leon_start', cx(3), 150, 'right'), spawn('shore', cx(28), 300, 'down'));
  objects.push({ type: 'goal', name: 'goal_shore', x: cx(29), y: 280, r: 56 });
  objects.push({ type: 'arena', name: 'arena', x: 23 * TS, y: 4 * TS, w: 448, h: 288 });
  MAPS.sewer_a = { rows: m.rows(), objects, props: { place: '지하 수로', ambient: '#0a0912', bg: '#030206', dark: true } };
}

// ---- 1막-2) 룬이 떠 있는 수로 (25 x 15): 물 위에 보랏빛 룬 6개 ----
{
  const W = 25;
  const H = 15;
  const m = grid(W, H, 'X');
  m.rect(1, 3, W - 2, 6, 's');
  m.rect(1, 7, W - 2, 7, 'e');
  m.rect(1, 8, W - 2, 10, 'o');
  m.rect(1, 11, W - 2, 12, 's');
  faces(m);
  const objects = [];
  const runes = [[7, 8.6], [10, 9.6], [13, 8.4], [16, 9.8], [19, 8.8], [12, 10.4]];
  for (const [c, r] of runes) {
    objects.push({ type: 'prop', name: 'rune_float', x: cx(c), y: r * TS + 8 });
    objects.push({ type: 'light', name: `rune${c}`, x: cx(c), y: r * TS, color: '#a07cff', radius: 70, intensity: 1.1 });
  }
  objects.push(look('a1_runes', cx(12), 228, 60));
  objects.push(spawn('leon_start', cx(1), 150, 'right'), spawn('leon_talk', cx(9), 170, 'right'), spawn('elysia', cx(14), 172, 'right'));
  objects.push({ type: 'goal', name: 'goal_exit', x: cx(23), y: 150, r: 40 });
  MAPS.sewer_rune = { rows: m.rows(), objects, props: { place: '룬이 떠 있는 수로', ambient: '#0d0b18', bg: '#030206', dark: true } };
}

// ---- 1막-3) 수로 깊은 곳 (50 x 25): 갈림길이 많은 통로, 몹 무리, 숨겨진 동전, 끝에 저수조 입구 ----
{
  const W = 50;
  const H = 25;
  const m = grid(W, H, 'X');
  m.rect(1, 3, 24, 5, 's'); // 들어오는 길
  m.rect(22, 3, 24, 13, 's'); // 아래로
  m.rect(25, 3, 31, 5, 's'); // 첫 갈림길 (막다른 길)
  m.rect(8, 11, 41, 13, 's'); // 가운데 큰길
  m.rect(8, 14, 41, 14, 'e');
  m.rect(8, 15, 41, 16, 'o'); // 큰길 옆 물길
  m.rect(26, 7, 39, 13, 's'); // 넓은 방 (필드 전투장)
  m.rect(36, 7, 47, 9, 's'); // 셋째 갈림길 (막다른 길)
  m.rect(10, 13, 12, 13, 's');
  m.rect(10, 14, 12, 21, 's'); // 아래 갈림길
  m.rect(10, 15, 12, 16, 's');
  m.rect(3, 19, 9, 20, 's'); // 막다른 물길 끝의 작은 공간 (숨겨진 장소)
  m.rect(3, 21, 9, 21, 'e');
  m.rect(3, 22, 12, 22, 'o');
  m.rect(39, 14, 41, 21, 's'); // 저수조 쪽
  m.rect(39, 15, 41, 16, 's');
  m.rect(39, 19, 48, 21, 's');
  faces(m);
  const objects = [];
  objects.push({ type: 'prop', name: 'coins', x: cx(3) + 6, y: 20 * TS + 20 }, look('a1_hidden_coins', cx(3) + 6, 20 * TS + 26, 20 * TS - 4));
  objects.push(spawn('leon_start', cx(1), 140, 'right'), spawn('elysia_start', cx(0) + 4, 150, 'right'));
  objects.push(spawn('fork3', cx(44), ty(8), 'right'), spawn('fork_knights', cx(47), ty(8), 'left'));
  // 몹 무리 (닿으면 짧은 전투). battle = battles.json 이름
  objects.push({ type: 'mob', name: 'mob1', x: cx(17), y: ty(12), sprite: 'sewer_rat', battle: '수로 몹 1' });
  objects.push({ type: 'mob', name: 'mob2', x: cx(33), y: ty(9), sprite: 'sewer_leech', battle: '수로 몹 2' });
  objects.push({ type: 'mob', name: 'mob3', x: cx(40), y: ty(18), sprite: 'sewer_rat', battle: '수로 몹 3' });
  objects.push({ type: 'goal', name: 'goal_cistern', x: cx(48), y: ty(20), r: 40 });
  objects.push({ type: 'arena', name: 'arena', x: 26 * TS, y: 5 * TS, w: 448, h: 288 });
  MAPS.sewer_b = { rows: m.rows(), objects, props: { place: '수로 깊은 곳', ambient: '#09080f', bg: '#030206', dark: true } };
}

// ---- 1막-4) 저수조 (30 x 25): 가운데는 물, 가장자리만 걷는다 ----
{
  const W = 30;
  const H = 25;
  const m = grid(W, H, 'X');
  for (let y = 3; y <= 21; y++)
    for (let x = 1; x <= W - 2; x++) {
      const d = Math.hypot((x - 14.5) / 13.5, (y - 12) / 9.5);
      if (d <= 1) m.set(x, y, 'i');
      const w = Math.hypot((x - 14.5) / 9.5, (y - 7) / 4.4);
      if (w <= 1) m.set(x, y, 'Q');
    }
  // 물 아래 가장자리
  for (let x = 1; x < W - 1; x++) for (let y = 4; y < 21; y++) if (m.g[y][x] === 'i' && m.g[y - 1][x] === 'Q') m.g[y - 1][x] = 'Q';
  m.rect(0, 17, 6, 19, 'i'); // 들어오는 길
  m.rect(23, 4, 28, 6, 'i'); // 사다리 앞
  faces(m);
  const objects = [];
  objects.push(wallItem('ladder', cx(27), 4 * TS));
  objects.push({ type: 'prop', name: 'bones', x: cx(4), y: ty(15) + 6 }, look('a1_bones', cx(4), ty(15) + 10, ty(15) - 20));
  objects.push(spawn('leon_start', cx(0) + 8, ty(18), 'right'), spawn('elysia_start', cx(0) - 6, ty(18), 'right'));
  objects.push(spawn('leon_edge', cx(13), ty(14), 'up'), spawn('elysia_edge', cx(16), ty(14), 'up'), spawn('eel', cx(15), ty(8), 'down'));
  objects.push({ type: 'goal', name: 'goal_enter', x: cx(9), y: ty(17), r: 48 });
  objects.push({ type: 'goal', name: 'goal_ladder', x: cx(27), y: 4 * TS + 40, r: 30, press: '사다리 오르기' });
  objects.push({ type: 'arena', name: 'arena', x: 8 * TS, y: 9 * TS, w: 448, h: 288 });
  MAPS.sewer_cistern = { rows: m.rows(), objects, props: { place: '저수조', ambient: '#0b0a14', bg: '#030206', dark: true } };
}

// ---- 1막-5) 마탑 은신처: 염색 공방 지하 (15 x 12) ----
{
  const W = 15;
  const H = 12;
  const m = grid(W, H, 'X');
  m.rect(1, 3, W - 2, 10, 'k');
  faces(m, 'X', 'K');
  const objects = [];
  objects.push({ type: 'prop', name: 'straw_bed', x: cx(3), y: ty(8) + 8, solid: '50,14' });
  objects.push({ type: 'prop', name: 'dye_vat', x: cx(10), y: ty(9) + 10, solid: '26,10' }, { type: 'prop', name: 'dye_vat', x: cx(12), y: ty(9) + 10, solid: '26,10' });
  objects.push(wallItem('cloth', cx(5), 92), wallItem('cloth', cx(9), 92));
  objects.push({ type: 'prop', name: 'rune_table', x: cx(7), y: ty(5) + 8, solid: '36,10' }, look('a1_violet_paper', cx(7), ty(5) + 20, ty(5) - 30));
  objects.push(wallItem('measure_paper', cx(11), 76), look('a1_measurements', cx(11), 112, 50));
  objects.push({ type: 'prop', name: 'candle', x: cx(6), y: ty(4), solid: '8,6' }, { type: 'prop', name: 'candle', x: cx(9), y: ty(7) });
  objects.push(wallItem('ladder', cx(13), 3 * TS));
  objects.push(spawn('leon_bed', cx(3), ty(8), 'down'), spawn('leon_start', cx(4), ty(9), 'down'), spawn('elysia', cx(8), ty(8), 'left'));
  objects.push({ type: 'goal', name: 'goal_exit', x: cx(13), y: 3 * TS + 24, r: 26, press: '밖으로 나가기' });
  MAPS.hideout = { rows: m.rows(), objects, props: { place: '마탑 은신처', ambient: '#584a40', bg: '#05040a' } };
}

// ---- 1막-6) 황도 외곽 빈민가 (40 x 20): 새벽, 벽마다 수배 전단, 지붕에 녹다 만 눈 ----
{
  const W = 40;
  const H = 20;
  const m = grid(W, H);
  m.rect(0, 0, W - 1, 1, 'R');
  m.rect(0, 2, W - 1, 3, 'P');
  m.rect(0, 4, W - 1, 14, 'm');
  m.rect(0, 15, W - 1, 16, 'P');
  m.rect(0, 17, W - 1, 19, 'R');
  for (const [x, y] of [[4, 6], [9, 12], [15, 5], [22, 13], [27, 7], [33, 11], [37, 5]]) m.rect(x, y, x + 1, y, 'n');
  m.rect(12, 15, 13, 19, 'm'); // 골목
  m.rect(28, 0, 29, 3, 'm');
  const objects = [];
  for (const c of [3, 8, 14, 19, 24, 31, 35]) objects.push(wallItem('wanted', cx(c), 104));
  objects.push(wallItem('notice', cx(21), 108), look('a1_mourning_notice', cx(21), 136, 76));
  objects.push(npc('passerby1', cx(7), ty(9), 'mob_citizen', 'down', 'a1_passerby1'));
  objects.push(npc('passerby2', cx(18), ty(6), 'mob_citizen', 'down', 'a1_passerby2'));
  objects.push(npc('passerby3', cx(30), ty(12), 'mob_citizen', 'left', 'a1_passerby3'));
  objects.push(spawn('leon_start', cx(1), ty(9), 'right'), spawn('elysia_start', cx(0), ty(10), 'right'));
  objects.push(spawn('leon_poster', cx(14), ty(5), 'up'), spawn('elysia_poster', cx(16), ty(6), 'left'));
  objects.push({ type: 'goal', name: 'goal_exit', x: cx(39), y: ty(9), r: 48 });
  MAPS.slum_alley = { rows: m.rows(), objects, props: { place: '황도 외곽 빈민가', ambient: '#6f86b8', bg: '#0b1020' } };
}

// ---- 1막-7) 아우렐 강 다리 검문소 (30 x 20): 낮. 목책과 병사, 게시판 ----
{
  const W = 30;
  const H = 20;
  const m = grid(W, H);
  m.rect(0, 0, W - 1, H - 1, 'g');
  m.rect(0, 8, 20, 11, 'c'); // 길
  m.rect(21, 0, W - 1, H - 1, 'r'); // 강
  m.rect(21, 8, W - 1, 11, 'b'); // 다리
  const objects = [];
  for (const y of [4, 5, 6, 13, 14, 15]) objects.push({ type: 'prop', name: 'palisade', x: cx(20), y: ty(y) + 14, solid: '30,12' });
  objects.push({ type: 'prop', name: 'board', x: cx(17), y: ty(6) + 12, solid: '26,8' }, look('a1_checkpoint_board', cx(17), ty(6) + 26, ty(6) - 30));
  objects.push(spawn('leon_start', cx(1), ty(9), 'right'), spawn('elysia_start', cx(0), ty(10), 'right'));
  objects.push(spawn('leon_gate', cx(14), ty(9), 'right'), spawn('elysia_gate', cx(13), ty(10), 'right'));
  const guards = [['sp1', 18, 8], ['sp2', 18, 11], ['sp3', 19, 7], ['sp4', 19, 12], ['ar1', 16, 5], ['ar2', 16, 14]];
  for (const [n, c, r] of guards) objects.push(spawn(n, cx(c), ty(r), 'left'));
  objects.push(spawn('leon_far', cx(29), ty(9), 'right'), spawn('elysia_far', cx(28), ty(10), 'right'));
  objects.push({ type: 'goal', name: 'goal_gate', x: cx(15), y: ty(9) + 16, r: 60 });
  objects.push({ type: 'arena', name: 'arena', x: 6 * TS, y: 5 * TS, w: 448, h: 288 });
  MAPS.bridge_checkpoint = { rows: m.rows(), objects, props: { place: '아우렐 강 다리 검문소', ambient: '#ffffff', bg: '#5a7a3a' } };
}

// ---- 1막-8) 강둑 (50 x 15): 해질녘. 갈대밭, 물가 길. 오른쪽에서 왼쪽으로 ----
{
  const W = 50;
  const H = 15;
  const m = grid(W, H);
  m.rect(0, 0, W - 1, 4, 'r');
  m.rect(0, 5, W - 1, 6, 'd');
  m.rect(0, 7, W - 1, H - 1, 'g');
  m.rect(0, 5, 4, 5, 'r'); // 배가 있는 작은 물굽이
  const objects = [];
  const rnd = (() => {
    let s = 9;
    return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  })();
  for (let i = 0; i < 26; i++) {
    const c = 1 + Math.floor(rnd() * (W - 2));
    const r = 8 + Math.floor(rnd() * 6);
    if (c > 16 && c < 33) continue; // 전투장은 비워 둔다
    objects.push({ type: 'prop', name: 'reeds', x: cx(c), y: ty(r) + 12 });
  }
  objects.push({ type: 'prop', name: 'boat', x: cx(2) + 8, y: ty(5) + 10 });
  objects.push(spawn('leon_start', cx(47), ty(8), 'left'), spawn('elysia_start', cx(48), ty(9), 'left'));
  objects.push(spawn('leon_mid', cx(25), ty(8), 'left'), spawn('elysia_mid', cx(26), ty(9), 'left'));
  for (const [n, c, r] of [['k1', 35, 7], ['k2', 36, 9], ['k3', 35, 11], ['k4', 37, 8], ['k5', 37, 10]]) objects.push(spawn(n, cx(c), ty(r), 'left'));
  objects.push({ type: 'goal', name: 'goal_boat', x: cx(3), y: ty(6) + 8, r: 40, press: '배에 오르기' });
  objects.push({ type: 'arena', name: 'arena', x: 18 * TS, y: 5 * TS, w: 448, h: 288 });
  MAPS.riverbank = { rows: m.rows(), objects, props: { place: '강둑', ambient: '#ffb98a', bg: '#3a2a20' } };
}

// ---- 1막-9) 강을 따라 내려가는 배 (화면 하나): 배는 가운데, 밤 → 새벽 ----
{
  const W = 16;
  const H = 12;
  const m = grid(W, H);
  m.rect(0, 0, W - 1, 2, 'g');
  m.rect(0, 3, W - 1, 3, 'd');
  m.rect(0, 4, W - 1, 8, 'r');
  m.rect(0, 9, W - 1, 9, 'd');
  m.rect(0, 10, W - 1, 11, 'g');
  const objects = [];
  // 기슭의 갈대는 맵 화면이 만들어 왼쪽으로 흘려보낸다 (drift)
  objects.push({ type: 'prop', name: 'boat', x: cx(8), y: ty(6) + 18 });
  objects.push(spawn('leon_boat', cx(7) + 2, ty(6) + 8, 'down'), spawn('elysia_boat', cx(9) - 2, ty(6) + 8, 'down'));
  MAPS.river_boat = { rows: m.rows(), objects, props: { place: '강 위', ambient: '#2a3560', bg: '#05070f', drift: true } };
}

// ---------------------------------------------------------------------
// 2막
// ---------------------------------------------------------------------
const DAY = '#fff2d6'; // 사막 낮: 옅은 노란 색조
const NIGHT = '#28305e'; // 사막 밤: 짙은 남색
/** 흙벽 집: 위 두 줄은 지붕, 아래는 벽 */
function hut(m, c0, r0, c1, r1) {
  m.rect(c0, r0, c1, r0 + 1, 'T');
  m.rect(c0, r0 + 2, c1, r1, 'A');
}
const dune = (x, y) => ({ type: 'prop', name: 'dune', x, y, solid: '88,18' });
const palm = (c, r) => ({ type: 'prop', name: 'palm', x: cx(c), y: ty(r) + 12, solid: '10,6' });

// ---- 2막-1) 카심 사막 (60 x 25): 낮. 모래 언덕, 바위, 반쯤 묻힌 뼈. 가운데쯤 큰 바위 ----
{
  const W = 60;
  const H = 25;
  const m = grid(W, H, 'a');
  m.rect(0, 0, W - 1, 0, 'Y');
  m.rect(0, 1, W - 1, 1, 'Z');
  m.rect(0, H - 1, W - 1, H - 1, 'Y');
  const objects = [];
  for (const [c, r] of [[8, 5], [14, 21], [22, 3], [27, 22], [41, 4], [44, 20], [52, 9], [55, 17], [6, 19], [37, 7]]) objects.push(dune(cx(c), ty(r) + 14));
  for (const [c, r] of [[11, 9], [47, 13], [29, 6]]) objects.push({ type: 'prop', name: 'rock', x: cx(c), y: ty(r) + 12, solid: '34,10' });
  objects.push({ type: 'prop', name: 'big_rock', x: cx(32), y: ty(10) + 16, solid: '64,18' });
  objects.push({ type: 'prop', name: 'camel_bones', x: cx(12), y: ty(17) + 10 }, look('a2_bones', cx(12), ty(17) + 16, ty(17) - 14));
  objects.push({ type: 'prop', name: 'rock_arrow', x: cx(20), y: ty(6) + 12, solid: '34,10' }, look('a2_rock_arrow', cx(20), ty(6) + 22, ty(6) - 30));
  objects.push(spawn('leon_start', cx(3), ty(12), 'right'), spawn('elysia_start', cx(2), ty(13), 'right'));
  objects.push(spawn('leon_rock', cx(31), ty(13), 'up'), spawn('elysia_rock', cx(33), ty(13), 'up'));
  objects.push({ type: 'mob', name: 'mob1', x: cx(18), y: ty(12), sprite: 'sand_crawler', battle: '사막 몹 1' });
  objects.push({ type: 'mob', name: 'mob2', x: cx(24), y: ty(18), sprite: 'sand_crawler', battle: '사막 몹 2' });
  objects.push({ type: 'goal', name: 'goal_rock', x: cx(32), y: ty(12) + 8, r: 56 });
  objects.push({ type: 'arena', name: 'arena', x: 25 * TS, y: 11 * TS, w: 448, h: 288 });
  MAPS.desert_a = { rows: m.rows(), objects, props: { desert: true, place: '카심 사막', ambient: DAY, bg: '#c8a464' } };
}

// ---- 2막-2) 사막의 야영지 (25 x 18): 밤 → 새벽. 바위 그늘, 불 피우지 못한 자리. 동쪽 지평선 ----
{
  const W = 25;
  const H = 18;
  const m = grid(W, H, 'a');
  m.rect(0, 0, W - 1, 0, 'Y');
  m.rect(0, 1, W - 1, 1, 'Z');
  const objects = [];
  objects.push({ type: 'prop', name: 'big_rock', x: cx(5), y: ty(8) + 16, solid: '64,18' });
  objects.push({ type: 'prop', name: 'rock', x: cx(3), y: ty(12) + 12, solid: '34,10' });
  objects.push(dune(cx(18), ty(15) + 14), dune(cx(4), ty(16) + 14));
  objects.push({ type: 'prop', name: 'campfire_out', x: cx(11), y: ty(10) + 4 });
  objects.push(spawn('leon_camp', cx(10), ty(9), 'right'), spawn('elysia_camp', cx(12), ty(9) + 4, 'left'));
  objects.push(spawn('karg', cx(15), ty(9), 'left'));
  const ring = [[8, 6], [14, 6], [7, 11], [16, 11], [10, 13], [13, 13]];
  ring.forEach(([c, r], i) => objects.push(spawn(`w${i + 1}`, cx(c), ty(r), c < 11 ? 'right' : 'left')));
  MAPS.desert_camp = { rows: m.rows(), objects, props: { place: '사막의 야영지', ambient: NIGHT, bg: '#04060e', carry: 'leon', stars: true } };
}

// ---- 2막-3) 루바 오아시스 (50 x 35): 가운데 우물과 푸른 물, 야자수, 흙벽 집, 감옥, 동쪽 출구, 서쪽 입구 ----
{
  const W = 50;
  const H = 35;
  const m = grid(W, H, 'a');
  m.rect(13, 3, 37, 25, 'y');
  m.rect(21, 5, 29, 9, 'O'); // 푸른 물
  hut(m, 4, 3, 9, 6);
  hut(m, 39, 3, 45, 6);
  hut(m, 39, 26, 46, 30); // 장로의 집
  hut(m, 4, 25, 9, 28); // 주인 없는 집
  hut(m, 14, 27, 19, 30); // 흙벽 감옥
  m.rect(15, 30, 18, 30, 'I');
  const objects = [];
  for (const [c, r] of [[15, 6], [33, 5], [19, 11], [31, 11], [15, 22], [35, 22], [36, 14], [20, 24], [11, 4], [47, 9]]) objects.push(palm(c, r));
  objects.push({ type: 'prop', name: 'well', x: cx(25), y: ty(17) + 8, solid: '36,14' }, look('a2_well_names', cx(25), ty(18) + 4, ty(16) - 28));
  objects.push({ type: 'prop', name: 'toll_notice', x: cx(34), y: ty(17) + 12, solid: '8,6' }, look('a2_toll_notice', cx(34), ty(18) + 2, ty(16) - 14));
  objects.push(wallItem('hut_door', cx(6) + 16, 29 * TS), { type: 'prop', name: 'shoes', x: cx(6) + 16, y: 29 * TS + 10 }, look('a2_empty_hut', cx(6) + 16, 29 * TS + 18, 28 * TS - 6));
  objects.push(wallItem('hut_door', cx(42) + 16, 31 * TS));
  // 불길과 모닥불 (처음엔 꺼 둠, 무대에서 켠다)
  for (const [x, y] of [[cx(23), ty(16)], [cx(27), ty(19)]]) objects.push({ type: 'light', name: 'well_fire', x, y, color: '#ff8a3a', radius: 110, intensity: 1.4, hidden: true, flicker: true });
  objects.push({ type: 'prop', name: 'campfire', x: cx(25), y: ty(23) + 6, hidden: true });
  objects.push({ type: 'prop', name: 'horse', x: cx(3), y: ty(17) + 12, hidden: true });
  // 성기사단 (서쪽 입구). 앞의 셋은 횃불
  const pal = [[5, 13], [5, 15], [5, 17], [5, 19], [5, 21], [3, 13], [3, 15], [3, 19], [3, 21], [1, 17]]; // 뒷줄은 말(3, 17)을 가리지 않게
  pal.forEach(([c, r], i) => objects.push(spawn(`p${i + 1}`, cx(c), ty(r), 'right')));
  for (const [c, r] of pal.slice(0, 3)) objects.push({ type: 'light', name: 'paladin_torch', x: cx(c) + 6, y: ty(r) - 26, color: '#ffa048', radius: 90, intensity: 1.3, hidden: true, flicker: true });
  objects.push(spawn('adrian_horse', cx(4), ty(17), 'right'), spawn('adrian_front', cx(7), ty(17), 'right'));
  objects.push(spawn('leon_w', cx(15), ty(17), 'left'), spawn('elysia_w', cx(16), ty(18) + 8, 'left'), spawn('karg_w', cx(12), ty(15), 'left'));
  objects.push(spawn('ursha_w', cx(14), ty(18), 'left'), spawn('ursha_mid', cx(10), ty(17), 'left'), spawn('leon_side', cx(12), ty(16) + 12, 'left'));
  objects.push(spawn('wolf1', cx(13), ty(13), 'left'), spawn('wolf2', cx(14), ty(20), 'left'), spawn('wolf3', cx(16), ty(15), 'left'));
  objects.push(spawn('leon_duel', cx(9), ty(16), 'left'), spawn('adrian_duel', cx(6), ty(16), 'right'), spawn('adrian_away', cx(0), ty(16), 'left'));
  objects.push(spawn('palms_back', cx(36), ty(26), 'right'));
  // 우물 쪽 (장면 5-1)
  objects.push(spawn('prison_door', cx(16) + 16, ty(31) + 6, 'up'));
  objects.push(spawn('leon_well', cx(22), ty(20), 'right'), spawn('elysia_well', cx(21), ty(21), 'right'), spawn('karg_well', cx(28), ty(19), 'left'));
  objects.push(spawn('wolf_a', cx(27), ty(21), 'left'), spawn('wolf_b', cx(23), ty(15), 'down'), spawn('ursha_well', cx(19), ty(24), 'up'));
  objects.push(spawn('sc1', cx(20), ty(16), 'right'), spawn('sc2', cx(30), ty(16), 'left'), spawn('sc3', cx(25), ty(21), 'up'));
  // 장면 6-1 출발, 장면 9
  objects.push(spawn('leon_night', cx(16), ty(32), 'up'), spawn('elysia_night', cx(15), ty(32) + 8, 'up'), spawn('karg_night', cx(18), ty(32), 'up'));
  objects.push(spawn('leon_fire', cx(23), ty(23), 'right'), spawn('karg_fire', cx(27), ty(23), 'left'), spawn('elysia_fire', cx(25), ty(24) + 10, 'up'), spawn('elysia_apart', cx(30), ty(25), 'left'));
  objects.push(spawn('leon_dusk', cx(22), ty(19), 'right'), spawn('karg_dusk', cx(26), ty(19), 'left'), spawn('elysia_dusk', cx(21), ty(20) + 8, 'right'));
  for (const [i, r] of [[1, 18], [2, 20], [3, 21]]) objects.push(spawn(`wp${i}_from`, cx(34), ty(r), 'left'), spawn(`wp${i}_to`, cx(12), ty(r), 'left'));
  // 늑대 전사 NPC (말 걸기)
  objects.push(npc('wolf_npc1', cx(12), ty(9), 'mob_wolf', 'down', 'a2_wolf1'));
  objects.push(npc('wolf_npc2', cx(35), ty(24), 'mob_wolf', 'left', 'a2_wolf2'));
  objects.push(npc('wolf_npc3', cx(38), ty(10), 'mob_wolf', 'down', 'a2_wolf3'));
  objects.push({ type: 'goal', name: 'goal_east', x: cx(49), y: ty(17), r: 48 });
  objects.push({ type: 'arena', name: 'arena', x: 18 * TS, y: 13 * TS, w: 448, h: 288 }); // 우물 방어
  objects.push({ type: 'arena', name: 'west', x: 1 * TS, y: 12 * TS, w: 448, h: 288 }); // 성기사단, 아드리안
  MAPS.oasis = { rows: m.rows(), objects, props: { desert: true, place: '루바 오아시스', ambient: DAY, bg: '#c8a464' } };
}

// ---- 2막-4) 흙벽 감옥 안 (12 x 9): 창살 너머로 오아시스 마당이 조금 보임 ----
{
  const W = 12;
  const H = 9;
  const m = grid(W, H, 'A');
  m.rect(0, 0, W - 1, 0, 'T');
  m.rect(1, 2, W - 2, 6, 'f');
  m.rect(1, 7, W - 2, 7, 'I');
  m.rect(0, 8, W - 1, 8, 'y');
  const objects = [];
  objects.push({ type: 'prop', name: 'straw_bed', x: cx(2) + 6, y: ty(5) + 12 });
  objects.push(wallItem('wall_marks', cx(9), 2 * TS - 6), look('a2_prison_marks', cx(9), ty(2) + 4, TS - 12));
  objects.push(spawn('leon_start', cx(3), ty(3), 'down'), spawn('elysia_start', cx(7), ty(5), 'down'));
  objects.push(spawn('leon_bars', cx(5), ty(6), 'down'), spawn('elysia_bars', cx(7), ty(6), 'down'));
  objects.push(spawn('karg_out', cx(6), ty(8) + 8, 'up'), spawn('ursha_out', cx(5), ty(8) + 8, 'up'), spawn('karg_side', cx(7) + 8, ty(8) + 10, 'up'));
  objects.push({ type: 'goal', name: 'goal_bars', x: cx(5) + 16, y: ty(6), r: 44 });
  MAPS.oasis_prison = { rows: m.rows(), objects, props: { place: '오아시스의 감옥', ambient: '#d0b088', bg: '#1a120a' } };
}

// ---- 2막-5) 동쪽 교역로 (60 x 15): 모래 언덕 사이의 긴 길. 오른쪽 끝에 바위 틈 ----
{
  const W = 60;
  const H = 15;
  const m = grid(W, H, 'a');
  m.rect(0, 0, W - 1, 0, 'Y');
  m.rect(0, 1, W - 1, 1, 'Z');
  m.rect(0, H - 1, W - 1, H - 1, 'Y');
  m.rect(0, 6, W - 1, 8, 't');
  m.rect(55, 2, W - 1, 13, 'Z');
  m.rect(55, 6, W - 1, 8, 'j'); // 바위 틈 (도적 은신처 입구)
  const objects = [];
  for (const c of [4, 10, 16, 24, 30, 36, 46, 51]) objects.push(dune(cx(c), ty(4) + 10));
  for (const c of [7, 13, 21, 27, 33, 40, 49]) objects.push(dune(cx(c), ty(11) + 14));
  objects.push({ type: 'prop', name: 'rock', x: cx(18), y: ty(10) + 12, solid: '34,10' });
  objects.push({ type: 'prop', name: 'white_cloth', x: cx(22), y: ty(9) + 4 }, look('a2_white_cloth', cx(22), ty(9) + 8, ty(8) - 10));
  // 숨겨진 장소: 길에서 벗어난 모래 언덕 뒤
  objects.push({ type: 'prop', name: 'cache', x: cx(36), y: ty(2) + 14 }, look('a2_hidden_cache', cx(36), ty(2) + 20, ty(1) - 4));
  objects.push(spawn('leon_start', cx(2), ty(7), 'right'), spawn('elysia_start', cx(0), ty(8), 'right'), spawn('karg_start', cx(4), ty(7), 'right'));
  objects.push(spawn('leon_tracks', cx(44), ty(7), 'right'), spawn('elysia_tracks', cx(45), ty(8), 'down'), spawn('karg_tracks', cx(47), ty(7), 'left'));
  objects.push({ type: 'goal', name: 'goal_tracks', x: cx(45), y: ty(7) + 8, r: 44 });
  MAPS.trade_route = { rows: m.rows(), objects, props: { desert: true, place: '동쪽 교역로', ambient: DAY, bg: '#c8a464' } };
}

// ---- 2막-6) 도적 은신처 (30 x 20): 바위 틈 안쪽의 천막과 상자, 묶인 정찰대 ----
{
  const W = 30;
  const H = 20;
  const m = grid(W, H, 'J');
  m.rect(1, 2, W - 2, H - 2, 'j');
  m.rect(0, 8, 0, 11, 'j');
  const objects = [];
  objects.push({ type: 'prop', name: 'tent', x: cx(5), y: ty(5) + 14, solid: '60,16' }, { type: 'prop', name: 'tent', x: cx(25), y: ty(5) + 14, solid: '60,16' });
  objects.push({ type: 'prop', name: 'crates', x: cx(4), y: ty(16) + 12, solid: '36,12' }, { type: 'prop', name: 'crates', x: cx(26), y: ty(16) + 12, solid: '36,12' });
  objects.push({ type: 'light', name: 'fire', x: cx(15), y: ty(3), color: '#ffa048', radius: 120, intensity: 0.8 });
  objects.push(spawn('leon_start', cx(2), ty(9), 'right'), spawn('elysia_start', cx(1), ty(10), 'right'), spawn('karg_start', cx(3), ty(10), 'right'));
  objects.push(spawn('sc1', cx(25), ty(9), 'left'), spawn('sc2', cx(26), ty(11), 'left'), spawn('sc3', cx(25), ty(13), 'left'));
  objects.push(spawn('leon_scouts', cx(22), ty(11), 'right'), spawn('karg_scouts', cx(23), ty(10), 'right'), spawn('elysia_scouts', cx(21), ty(12), 'right'));
  objects.push({ type: 'arena', name: 'arena', x: 8 * TS, y: 5 * TS, w: 448, h: 288 });
  MAPS.bandit_hideout = { rows: m.rows(), objects, props: { place: '도적 은신처', ambient: '#f2dcb4', bg: '#20180f' } };
}

// ---------------------------------------------------------------------
// 3막
// ---------------------------------------------------------------------
const PLAIN = '#efe2c0'; // 로웬 평원 낮: 누렇게 마른 색
const MIST = '#d8dcdc'; // 안개 숲: 희뿌연 낮
const RUIN_NIGHT = '#2a3050'; // 버려진 마을의 밤
/** 시골 집: 위 두 줄은 지붕, 아래는 벽 (나무 판자) */
function shack(m, c0, r0, c1, r1, wall = 'P') {
  m.rect(c0, r0, c1, r0 + 1, 'R');
  m.rect(c0, r0 + 2, c1, r1, wall);
}
const tree = (c, r, name = 'dark_tree') => ({ type: 'prop', name, x: cx(c), y: ty(r) + 12, solid: '12,8' });
/** 숨긴 물건 (stage.json의 props에서 key 이름으로 켠다) */
const hiddenProp = (name, key, x, y, extra = {}) => ({ type: 'prop', name, key, x, y, hidden: true, ...extra });

// ---- 3막-1) 레온의 고향 마을 (45 x 25): 낮. 마른 밭, 흙길, 닫힌 창문의 집들, 우물(전단이 붙은 담벼락), 마을 끝 불 꺼진 대장간 ----
{
  const W = 45;
  const H = 25;
  const m = grid(W, H, 'l');
  m.rect(0, 12, W - 1, 13, 't');
  m.rect(1, 1, 12, 8, 'h');
  m.rect(1, 17, 14, 23, 'h');
  m.rect(26, 18, 36, 23, 'h');
  const houses = [[15, 3, 20, 8], [23, 3, 29, 8], [31, 3, 36, 8], [17, 17, 22, 21], [39, 17, 44, 21]];
  for (const [c0, r0, c1, r1] of houses) shack(m, c0, r0, c1, r1);
  shack(m, 38, 3, 44, 7); // 대장간
  const objects = [];
  // 창: 열린 창 위에 덧문(처음엔 숨김). 오른쪽 집부터 차례로 닫힌다 (shutter1이 가장 오른쪽)
  const wins = [[42, 21], [34, 8], [27, 8], [24, 8], [20, 21], [18, 8]];
  wins.forEach(([c, r], i) => {
    objects.push(wallItem('village_window', cx(c), r * TS - 4));
    objects.push(hiddenProp('village_shutter', `shutter${i + 1}`, cx(c), r * TS - 4, { wall: true }));
  });
  // 촌장 집 (두 번째 집) 담벼락의 공물 기록판
  objects.push(wallItem('notice', cx(28), 9 * TS - 2), look('a3_tribute_board', cx(28), ty(9) + 6, ty(8) - 26));
  // 우물과 전단이 붙은 담벼락
  objects.push({ type: 'prop', name: 'well', x: cx(24), y: ty(15) + 10, solid: '36,14' });
  objects.push({ type: 'prop', name: 'stone_wall', x: cx(29), y: ty(15) + 8, solid: '96,10' });
  objects.push({ type: 'prop', name: 'wanted', x: cx(29), y: ty(15) + 5 });
  objects.push(look('a3_dry_field', cx(8), ty(9) + 4, ty(8) - 10));
  // 대장간: 불 꺼진 화덕, 벽의 검 걸이
  objects.push({ type: 'prop', name: 'forge', x: cx(41), y: ty(9) + 10, solid: '52,14' });
  objects.push(wallItem('blade_rack', cx(43), 8 * TS - 2), look('a3_forge_blade', cx(43), ty(8) + 8, ty(6) - 4));
  objects.push(spawn('leon_start', cx(1), ty(12), 'right'), spawn('elysia_start', cx(0), ty(13), 'right'), spawn('karg_start', cx(2), ty(13), 'right'));
  objects.push(spawn('leon_in', cx(10), ty(12), 'right'), spawn('elysia_in', cx(8), ty(13), 'right'), spawn('karg_in', cx(11), ty(13) + 8, 'right'));
  objects.push(spawn('view_houses', cx(29), ty(8)));
  objects.push(spawn('leon_well', cx(28), ty(17), 'up'), spawn('elysia_well', cx(26), ty(17) + 6, 'up'), spawn('karg_well', cx(31), ty(17) + 4, 'up'));
  objects.push(spawn('leon_door', cx(26), ty(10), 'up'), spawn('elysia_door', cx(24), ty(11), 'up'), spawn('karg_door', cx(28), ty(11) + 4, 'up'));
  objects.push(spawn('smith', cx(39), ty(9) + 2, 'right'));
  objects.push(spawn('leon_forge', cx(37), ty(10), 'right'), spawn('elysia_forge', cx(35), ty(10) + 10, 'right'), spawn('karg_forge', cx(36), ty(11) + 8, 'right'));
  objects.push({ type: 'goal', name: 'goal_forge', x: cx(37), y: ty(10), r: 48 });
  MAPS.arden_village = { rows: m.rows(), objects, props: { place: '레온의 고향', ambient: PLAIN, bg: '#a08a5c' } };
}

// ---- 3막-2) 안개 숲 가장자리 (50 x 30): 짙은 흰 안개. 검은 나무 사이로 칼자국 표식 나무 5그루. 위쪽 끝 너머에 버려진 마을 ----
{
  const W = 50;
  const H = 30;
  const m = grid(W, H, 'p');
  m.rect(30, 0, W - 1, 3, 'l'); // 숲 너머 버려진 마을 자리
  const objects = [];
  // 표식 나무 (조사하지 않아도 가까이 가면 칼자국이 잠깐 밝아진다: 무대가 아니라 맵이 알아서)
  const marks = [[9, 15], [16, 20], [25, 17], [33, 12], [41, 8]];
  marks.forEach(([c, r], i) => {
    objects.push({ ...tree(c, r, 'mark_tree'), key: `mark${i + 1}` });
    objects.push(spawn(`mark${i + 1}`, cx(c), ty(r) - 20));
  });
  // 검은 나무: 표식 길과 전투장을 비워 두고 둘레에
  const trees = [
    [1, 2], [5, 4], [10, 2], [15, 5], [20, 3], [25, 6], [28, 2], [2, 9], [6, 11], [13, 10], [19, 9], [22, 13], [28, 10], [37, 5],
    [1, 15], [1, 21], [17, 15], [20, 24], [24, 27], [29, 22], [30, 16], [36, 18], [38, 13], [44, 13], [47, 9], [46, 17], [42, 21],
    [35, 25], [40, 27], [48, 24], [26, 24], [45, 4], [33, 3], [12, 27], [6, 28], [18, 28],
  ];
  for (const [c, r] of trees) objects.push(tree(c, r));
  // 숲 너머: 무너진 돌담과 연기 한 줄기 (안개가 걷히면 보임)
  objects.push({ type: 'prop', name: 'stone_wall', x: cx(35), y: ty(2) + 10 }, { type: 'prop', name: 'stone_wall', x: cx(44), y: ty(1) + 10 });
  objects.push({ type: 'prop', name: 'smoke', x: cx(40), y: ty(1) });
  // 조사할 것
  objects.push({ type: 'prop', name: 'campfire_out', x: cx(13), y: ty(25) + 4 }, look('a3_old_fire', cx(13), ty(25) + 10, ty(24) - 8));
  objects.push({ type: 'prop', name: 'spirit_stone', x: cx(31), y: ty(22) + 10, solid: '14,8' }, look('a3_spirit_stone', cx(31), ty(23) + 4, ty(21) - 20));
  // 숨겨진 장소: 표식 길에서 벗어난 안개 깊은 곳
  objects.push({ type: 'prop', name: 'white_herbs', x: cx(46), y: ty(28) + 6 }, look('a3_hidden_herbs', cx(46), ty(28) + 10, ty(27) - 4));
  objects.push(spawn('leon_start', cx(5), ty(26), 'up'), spawn('elysia_start', cx(4), ty(27), 'up'), spawn('karg_start', cx(6), ty(27) + 6, 'up'));
  objects.push(spawn('leon_mark', cx(9), ty(18), 'up'), spawn('elysia_mark', cx(7), ty(19), 'up'), spawn('karg_mark', cx(11), ty(19), 'up'));
  objects.push(spawn('leon_end', cx(42), ty(5), 'up'), spawn('elysia_end', cx(40), ty(6), 'up'), spawn('karg_end', cx(44), ty(6), 'up'), spawn('view_ruins', cx(40), ty(2)));
  objects.push({ type: 'mob', name: 'mob1', x: cx(21), y: ty(18), sprite: 'mist_beast', battle: '안개 몹 1' });
  objects.push({ type: 'mob', name: 'mob2', x: cx(37), y: ty(10), sprite: 'mist_beast', battle: '안개 몹 2' });
  objects.push({ type: 'goal', name: 'goal_ruins', x: cx(42), y: ty(5), r: 56 });
  objects.push({ type: 'arena', name: 'arena', x: 2 * TS, y: 16 * TS, w: 448, h: 288 });
  MAPS.morwen_edge = { rows: m.rows(), objects, props: { place: '안개 숲', ambient: MIST, bg: '#c8cccc', fog: true } };
}

// ---- 3막-3) 버려진 마을 (40 x 30): 무너진 돌담, 지붕이 내려앉은 집들, 가운데 연기가 오르는 집. 뒤편에 낮은 언덕. 밤과 새벽 ----
{
  const W = 40;
  const H = 30;
  const m = grid(W, H, 'l');
  m.rect(0, 0, W - 1, 3, 'p'); // 안개 숲 가장자리
  m.rect(16, 14, 17, 29, 't');
  m.rect(4, 22, 30, 22, 't');
  m.rect(30, 24, 38, 28, 'g'); // 뒤편 낮은 언덕
  shack(m, 11, 9, 17, 13, 'G'); // 연기가 오르는 집 (무너진 집)
  m.set(17, 9, 'l').set(16, 9, 'l'); // 지붕이 내려앉은 자리
  shack(m, 3, 14, 7, 17, 'G');
  m.rect(6, 14, 7, 15, 'l');
  shack(m, 30, 7, 36, 10, 'G');
  m.rect(30, 7, 32, 8, 'l');
  shack(m, 28, 17, 33, 20, 'G');
  shack(m, 4, 24, 9, 27, 'G');
  m.rect(8, 24, 9, 25, 'l');
  const objects = [];
  for (const [c, r] of [[1, 1], [6, 2], [11, 1], [22, 2], [27, 1], [34, 2], [38, 1], [3, 6], [37, 13]]) objects.push(tree(c, r));
  objects.push({ type: 'prop', name: 'smoke', x: cx(15), y: ty(9) });
  // 무너진 돌담 (세레나가 앉는 돌담은 sit_wall)
  for (const [c, r] of [[23, 7], [7, 20], [36, 15], [24, 26]]) objects.push({ type: 'prop', name: 'stone_wall', x: cx(c), y: ty(r) + 10, solid: '96,10' });
  objects.push({ type: 'prop', name: 'stone_wall', x: cx(25), y: ty(18) + 10, solid: '96,10' });
  objects.push({ type: 'prop', name: 'well_cracked', x: cx(21), y: ty(24) + 10, solid: '36,14' }, look('a3_village_stone', cx(21), ty(25) + 2, ty(23) - 20));
  // 언덕의 돌무덤 (곁에서 잃음: 돌이 하나씩 쌓이고 마지막에 대검)
  for (const [i, c] of [[1, 33], [2, 35], [3, 34]]) objects.push(hiddenProp(`cairn${i}`, `grave${i}`, cx(c), ty(26) + (i === 3 ? 0 : 6)));
  objects.push(hiddenProp('greatsword_planted', 'grave_sword', cx(34), ty(26) - 6));
  // 안개 속 횃불 (습격): 줄지어 다가오도록 차례로 켠다. torch1~6 = 행렬, torch7~12 = 장면 8에서 늘어나는 것
  const torches = [[20, 3], [24, 4], [28, 3], [22, 6], [26, 6], [30, 5], [14, 2], [18, 1], [32, 2], [35, 3], [10, 3], [37, 4]];
  torches.forEach(([c, r], i) => objects.push({ type: 'light', name: `torch${i + 1}`, x: cx(c), y: ty(r), color: '#ffa048', radius: 70, intensity: 1.2, hidden: true, flicker: true }));
  // 엘리시아의 룬 결계 자리, 하얀 빛이 모이는 손
  objects.push({ type: 'light', name: 'serena_eyes', x: cx(14), y: ty(14) - 20, color: '#ffb040', radius: 90, intensity: 1.6, hidden: true });
  // 자리
  objects.push(spawn('doorway', cx(14), ty(14), 'down'));
  objects.push({ type: 'goal', name: 'goal_door', x: cx(14), y: ty(14) + 8, r: 40 });
  objects.push(spawn('leon_arrive', cx(16), ty(4), 'down'), spawn('elysia_arrive', cx(15), ty(3), 'down'), spawn('karg_arrive', cx(17), ty(3), 'down'));
  objects.push(spawn('leon_s3', cx(16), ty(16), 'down'), spawn('galia_behind', cx(16), ty(15) + 4, 'down'), spawn('elysia_s3', cx(14), ty(18), 'up'), spawn('karg_s3', cx(18), ty(18), 'up'));
  objects.push(spawn('leon_face', cx(16), ty(17), 'up'), spawn('galia_face', cx(16), ty(15) + 2, 'down'));
  objects.push(spawn('sit_wall', cx(25), ty(18) - 2, 'down'), spawn('leon_wall', cx(25), ty(20), 'up'), spawn('leon_from_house', cx(14), ty(15), 'down'));
  objects.push(spawn('leon_out', cx(17), ty(16), 'up'), spawn('galia_out', cx(19), ty(15), 'up'), spawn('elysia_out', cx(15), ty(16), 'up'), spawn('karg_out', cx(20), ty(16), 'up'));
  objects.push(spawn('serena_door', cx(14), ty(14), 'up'), spawn('leon_shield', cx(14), ty(15) + 4, 'up'));
  objects.push(spawn('captain', cx(23), ty(7) + 10, 'down'), spawn('raid', cx(20), ty(7) + 10, 'down'), spawn('pal_cap_from', cx(24), ty(2), 'down'), spawn('raid_from', cx(21), ty(2), 'down'));
  for (let i = 0; i < 4; i++) objects.push(spawn(`foe${i + 1}`, cx(18 + i * 2 + (i > 1 ? 4 : 0)), ty(9) + (i % 2) * 14, 'down'), spawn(`foe${i + 1}_from`, cx(18 + i * 2 + (i > 1 ? 4 : 0)), ty(2), 'down'));
  objects.push(spawn('galia_fight', cx(24), ty(12), 'up'), spawn('pal_a', cx(23), ty(10), 'down'), spawn('pal_b', cx(26), ty(11), 'left'), spawn('pal_c', cx(25), ty(13) + 8, 'up'));
  objects.push(spawn('leon_flee', cx(16), ty(29), 'down'), spawn('serena_flee', cx(15), ty(29), 'down'), spawn('galia_stand', cx(17), ty(11) + 20, 'up'));
  objects.push(spawn('galia_kneel', cx(19), ty(15), 'down'), spawn('leon_by_galia', cx(18), ty(16), 'right'), spawn('serena_by_galia', cx(20), ty(16) + 6, 'left'));
  objects.push(spawn('elysia_by', cx(17), ty(17) + 6, 'up'), spawn('karg_by', cx(21), ty(17), 'up'));
  objects.push(spawn('leon_grave', cx(33), ty(28), 'up'), spawn('elysia_grave', cx(31), ty(28), 'up'), spawn('karg_grave', cx(36), ty(28), 'up'), spawn('serena_grave', cx(34), ty(28) + 10, 'up'));
  objects.push({ type: 'arena', name: 'arena', x: 9 * TS, y: 13 * TS, w: 448, h: 288 });
  MAPS.ruined_village = { rows: m.rows(), objects, props: { place: '버려진 마을', ambient: RUIN_NIGHT, bg: '#0c0e16', stars: true } };
}

// ---- 3막-4) 무너진 집 안 (14 x 10): 꺼져 가는 화덕, 짚더미, 안쪽 구석, 무너진 지붕 틈 ----
{
  const W = 14;
  const H = 10;
  const m = grid(W, H, 'G');
  m.rect(1, 2, W - 2, H - 2, 'k');
  m.rect(6, 9, 7, 9, 'k'); // 문간
  m.rect(9, 0, 11, 1, ' '); // 지붕 틈 (밤하늘)
  const objects = [];
  objects.push({ type: 'prop', name: 'campfire', x: cx(6) + 16, y: ty(5) + 8, solid: '20,8' });
  objects.push({ type: 'prop', name: 'straw_bed', x: cx(11), y: ty(3) + 12 });
  objects.push({ type: 'prop', name: 'folded_cloak', x: cx(9), y: ty(6) + 6 }, look('a3_folded_cloak', cx(9), ty(6) + 10, ty(5) - 4));
  objects.push({ type: 'light', name: 'roof_gap', x: cx(10), y: ty(2), color: '#8fa8e0', radius: 60, intensity: 0.7 });
  objects.push(spawn('roof_gap', cx(10), ty(1)));
  objects.push(spawn('leon_fire', cx(5), ty(5), 'right'), spawn('galia_fire', cx(8) + 8, ty(5), 'left'), spawn('elysia_fire', cx(7), ty(7), 'up'), spawn('karg_fire', cx(7), ty(3) + 8, 'down'));
  objects.push(spawn('serena_corner', cx(2), ty(2) + 10, 'up'), spawn('serena_stand', cx(2), ty(3), 'right'));
  objects.push(spawn('elysia_close', cx(3), ty(4), 'left'), spawn('serena_back', cx(1) + 10, ty(3) + 6, 'right'));
  objects.push(spawn('galia_door', cx(6) + 16, ty(8) + 6, 'down'), spawn('leon_door_talk', cx(6) + 16, ty(7) - 4, 'down'));
  objects.push(spawn('leon_bed', cx(11), ty(3) + 6, 'up'), spawn('leon_in', cx(6) + 16, ty(8), 'up'));
  objects.push({ type: 'goal', name: 'goal_fire', x: cx(6) + 16, y: ty(6), r: 40 });
  MAPS.ruined_house = { rows: m.rows(), objects, props: { place: '무너진 집', ambient: '#6a5a50', bg: '#08080e', stars: true } };
}

// ---- 3막-5) 사냥꾼의 길, 개울가 (40 x 18): 숲 서쪽 가장자리의 개울. 위로 평원과 먼 산맥. 개울가에 작은 언덕 ----
{
  const W = 40;
  const H = 18;
  const m = grid(W, H, 'p');
  m.rect(0, 0, W - 1, 5, 'l'); // 숲 밖 평원
  m.rect(0, 12, W - 1, 13, 'r'); // 개울
  m.rect(4, 8, 10, 10, 'g'); // 개울가 언덕
  const objects = [];
  objects.push({ type: 'prop', name: 'far_mountains', x: cx(12), y: ty(0) + 12 }, { type: 'prop', name: 'far_mountains', x: cx(30), y: ty(0) + 8 });
  for (const [c, r] of [[1, 6], [14, 6], [33, 6], [38, 7], [2, 15], [9, 16], [16, 15], [24, 16], [31, 15], [37, 16]]) objects.push(tree(c, r));
  for (const [i, c] of [[1, 6], [2, 8], [3, 7]]) objects.push(hiddenProp(`cairn${i}`, `grave${i}`, cx(c), ty(9) + (i === 3 ? 0 : 6)));
  objects.push(hiddenProp('broken_greatsword', 'grave_sword', cx(7), ty(9) - 4));
  objects.push(spawn('leon_c', cx(18), ty(10), 'down'), spawn('elysia_c', cx(21), ty(10) + 10, 'left'), spawn('karg_c', cx(23), ty(9), 'left'), spawn('serena_c', cx(20), ty(9), 'down'));
  objects.push(spawn('galia_c', cx(16), ty(9) + 8, 'right'), spawn('galia_wash', cx(26), ty(11), 'down'), spawn('leon_to_galia', cx(24), ty(10), 'right'));
  objects.push(spawn('karg_away', cx(0), ty(9), 'left'), spawn('karg_back', cx(16), ty(9), 'right'));
  objects.push(spawn('leon_hill', cx(7), ty(11), 'up'), spawn('elysia_hill', cx(5), ty(11) + 6, 'up'), spawn('karg_hill', cx(9), ty(11) + 6, 'up'), spawn('serena_hill', cx(8), ty(11) + 12, 'up'));
  objects.push(spawn('serena_alone', cx(30), ty(11), 'down'), spawn('leon_behind', cx(30), ty(9), 'down'), spawn('leon_oath', cx(30) + 18, ty(11), 'left'));
  objects.push(spawn('serena_oath', cx(22), ty(10), 'right'), spawn('leon_oath2', cx(24), ty(10), 'left'), spawn('galia_oath', cx(23), ty(8) + 8, 'down'));
  objects.push(spawn('leon_north', cx(20), ty(7), 'up'), spawn('serena_north', cx(18), ty(7), 'up'), spawn('elysia_north', cx(17), ty(8), 'up'), spawn('karg_north', cx(22), ty(8), 'up'), spawn('galia_north', cx(23), ty(7), 'up'));
  objects.push(spawn('view_mountains', cx(20), ty(2)));
  MAPS.hunter_creek = { rows: m.rows(), objects, props: { place: '사냥꾼의 길', ambient: '#f2ead6', bg: '#2a3020' } };
}

// ---------------------------------------------------------------------
// 4막 (4막_연출.md "맵 목록")
// ---------------------------------------------------------------------
const party5 = (tag, pts, facing) => ['leon', 'elysia', 'karg', 'serena', 'galia'].map((id, i) => spawn(`${id}_${tag}`, pts[i][0], pts[i][1], facing));
const P = (c, r, dx = 0, dy = 0) => [cx(c) + dx, ty(r) + dy];
const pine = (c, r) => ({ type: 'prop', name: 'snow_pine', x: cx(c), y: ty(r) + 12, solid: '12,8' });

// ---- 4막-1) 로웬 평원 북쪽 길 (55 x 25): 서리 내린 누런 들, 얼어붙은 개울, 반쯤 쓰러진 경계석, 멀리 하얀 산맥. 맵 끝에 야영지 ----
{
  const W = 55;
  const H = 25;
  const m = grid(W, H, '1');
  m.rect(0, 11, W - 1, 13, '2');
  m.rect(20, 0, 22, H - 1, '3');
  m.rect(20, 11, 22, 13, '2');
  const objects = [];
  for (const c of [6, 24, 42]) objects.push({ type: 'prop', name: 'far_mountains', x: cx(c), y: ty(1) + 12 });
  objects.push({ type: 'prop', name: 'border_stone', x: cx(17), y: ty(9) + 10, solid: '16,8' }, look('a4_border_stone', cx(17), ty(10), ty(8) - 20));
  objects.push({ type: 'prop', name: 'tent', x: cx(51), y: ty(14), solid: '60,12' });
  objects.push({ type: 'prop', name: 'campfire', x: cx(49), y: ty(17) + 8, solid: '20,8' });
  objects.push(...party5('start', [P(3, 12), P(1, 13), P(4, 13, 0, 8), P(2, 11), P(0, 11)], 'right'));
  objects.push(...party5('arg', [P(38, 12), P(41, 11), P(42, 13), P(39, 13, 0, 6), P(37, 11)], 'right'));
  objects.push(spawn('elysia_arg2', cx(41), ty(12), 'right'), spawn('karg_arg2', cx(42), ty(12) + 6, 'left'));
  objects.push(...party5('camp', [P(47, 17), P(50, 19), P(51, 17), P(48, 17, 8, -10), P(49, 15)], 'right'));
  objects.push(spawn('serena_dagger', cx(48), ty(17), 'left'));
  objects.push(spawn('view_north', cx(30), ty(4)));
  objects.push({ type: 'goal', name: 'goal_north', x: cx(38), y: ty(12), r: 48 });
  MAPS.lowen_north = { rows: m.rows(), objects, props: { place: '로웬 평원 북쪽', ambient: '#f4efe4', bg: '#c8c0a8' } };
}

// ---- 4막-2) 주인 없는 산길 (55 x 30): 눈 덮인 바위길, 버려진 교역 수레, 도적 야영 흔적, 절벽 ----
{
  const W = 55;
  const H = 30;
  const m = grid(W, H, '4');
  m.rect(0, 0, W - 1, 2, 'D');
  m.rect(0, 27, W - 1, H - 1, 'D');
  m.rect(30, 3, 34, 9, 'D');
  m.rect(36, 19, 44, 26, 'D');
  // 길: 왼쪽 아래 → 가운데 → 오른쪽 위
  m.rect(0, 19, 24, 21, '5');
  m.rect(22, 11, 24, 21, '5');
  m.rect(22, 11, 46, 13, '5');
  m.rect(44, 5, 46, 13, '5');
  m.rect(44, 5, W - 1, 7, '5');
  const objects = [];
  for (const [c, r] of [[2, 5], [6, 4], [12, 6], [17, 4], [27, 4], [38, 15], [50, 16], [52, 11], [8, 24], [16, 25], [28, 24], [48, 24], [36, 4], [41, 2]]) objects.push(pine(c, r));
  // 도적이 숨은 바위, 도적 야영 흔적
  objects.push({ type: 'prop', name: 'snow_boulder', x: cx(15), y: ty(14) + 8, solid: '32,10' }, { type: 'prop', name: 'snow_boulder', x: cx(19), y: ty(13) + 8, solid: '32,10' });
  objects.push({ type: 'prop', name: 'campfire_out', x: cx(10), y: ty(10) + 4 }, { type: 'prop', name: 'crates', x: cx(7), y: ty(10) + 8, solid: '30,10' });
  objects.push({ type: 'prop', name: 'trade_cart', x: cx(34), y: ty(15) + 4, solid: '48,12' }, look('a4_trade_cart', cx(34), ty(16), ty(14) - 16));
  objects.push(...party5('start', [P(3, 20), P(1, 21), P(4, 21, 0, 8), P(2, 19), P(0, 19)], 'right'));
  objects.push(...party5('s2', [P(13, 19), P(11, 20), P(14, 20, 0, 8), P(12, 20, -8, 14), P(10, 19)], 'up'));
  for (let i = 0; i < 5; i++) objects.push(spawn(`bandit${i + 1}`, cx(13 + i * 2), ty(15) + (i % 2) * 12, 'down'), spawn(`bandit${i + 1}_from`, cx(14 + i), ty(13) - 4, 'down'));
  objects.push(spawn('bandit_run', cx(16), ty(3), 'up'));
  objects.push(...party5('pass', [P(23, 18), P(22, 19), P(24, 19, 0, 8), P(23, 20), P(21, 19)], 'up'));
  objects.push({ type: 'mob', name: 'mob1', x: cx(30), y: ty(12), sprite: 'crag_lizard', battle: '산길 몹 1' });
  objects.push({ type: 'mob', name: 'mob2', x: cx(45), y: ty(9), sprite: 'crag_lizard', battle: '산길 몹 2' });
  objects.push({ type: 'goal', name: 'goal_gate', x: cx(53), y: ty(6), r: 48 });
  objects.push({ type: 'arena', name: 'arena', x: 6 * TS, y: 12 * TS, w: 448, h: 288 });
  objects.push({ type: 'snow', name: 'sky', x: 0, y: 0, w: W * TS, h: H * TS, mode: 'fall' });
  MAPS.eisen_pass = { rows: m.rows(), objects, props: { place: '주인 없는 산길', ambient: '#e8ecf4', bg: '#9aa0aa' } };
}

// ---- 4막-3) 그림헬름 관문 (30 x 20): 절벽에 박힌 거대한 돌문(망치와 모루 문양). 눈보라. 장면 3과 장면 8 ----
{
  const W = 30;
  const H = 20;
  const m = grid(W, H, '4');
  m.rect(0, 0, W - 1, 7, 'D');
  m.rect(13, 8, 16, H - 1, '5');
  const objects = [];
  objects.push({ type: 'prop', name: 'stone_gate', key: 'gate_shut', x: cx(15) - 16, y: 8 * TS });
  objects.push(hiddenProp('stone_gate_open', 'gate_open', cx(15) - 16, 8 * TS));
  for (const [c, r] of [[3, 10], [7, 13], [25, 11], [27, 15], [2, 17]]) objects.push(pine(c, r));
  // 보랏빛 원: 1 → 2 → 5 → 12 (장면 8)
  const portals = [[15, 11], [10, 12], [20, 12], [7, 15], [23, 15], [12, 9], [18, 9], [5, 11], [25, 10], [9, 17], [21, 17], [15, 17]];
  portals.forEach(([c, r], i) => objects.push(hiddenProp('portal_circle', `portal${i + 1}`, cx(c), ty(r) + 10)));
  portals.slice(0, 6).forEach(([c, r], i) => objects.push(spawn(`mage${i + 1}`, cx(c), ty(r) + 4, 'down')));
  objects.push(spawn('gatekeeper', cx(15) - 16, ty(9), 'down'));
  objects.push(...party5('gate', [P(14, 13), P(12, 14), P(16, 14), P(13, 15, 8, 4), P(15, 15, 8, 6)], 'up'));
  objects.push(spawn('karg_step', cx(14), ty(11), 'up'), spawn('karg_in', cx(14), ty(8), 'up'));
  objects.push(...party5('s8', [P(14, 14), P(12, 15), P(16, 15), P(14, 16, 0, 6), P(16, 13)], 'up'));
  objects.push(spawn('leon_down', cx(14), ty(13), 'up'));
  objects.push({ type: 'arena', name: 'arena', x: 8 * TS, y: 10 * TS, w: 448, h: 288 });
  objects.push({ type: 'snow', name: 'sky', x: 0, y: 0, w: W * TS, h: H * TS, mode: 'fall' });
  MAPS.grimhelm_gate = { rows: m.rows(), objects, props: { place: '그림헬름 관문', ambient: '#dfe4ee', bg: '#8a909c' } };
}

// ---- 4막-4) 그림헬름 지하 도시 (45 x 30): 수백 개의 화덕 불빛, 돌다리, 큰 벽화, 망치 소리 ----
{
  const W = 45;
  const H = 30;
  const m = grid(W, H, '6');
  m.rect(0, 0, W - 1, 2, 'E');
  m.rect(0, 0, 0, H - 1, 'E');
  m.rect(W - 1, 0, W - 1, H - 1, 'E');
  m.rect(0, H - 1, W - 1, H - 1, 'E');
  m.rect(1, 13, W - 2, 15, 'F'); // 용암 물길
  m.rect(20, 13, 24, 15, '7'); // 돌다리
  m.set(22, H - 1, '6'); // 아래 입구
  const objects = [];
  objects.push(wallItem('mural', cx(22), 3 * TS - 2), look('a4_mural', cx(22), ty(3) + 8, ty(1) - 10));
  for (const [c, r] of [[4, 5], [10, 5], [34, 5], [40, 5], [4, 19], [10, 19], [34, 19], [40, 19], [4, 25], [40, 25]]) objects.push({ type: 'prop', name: 'forge_lit', x: cx(c), y: ty(r) + 10, solid: '52,14' });
  for (const [c, r] of [[15, 7], [29, 7], [15, 22], [29, 22]]) objects.push({ type: 'prop', name: 'anvil', x: cx(c), y: ty(r) + 8, solid: '24,8' });
  objects.push(...party5('hall', [P(22, 27), P(21, 28), P(23, 28), P(22, 28, 0, 10), P(23, 27, 10, 0)], 'up'));
  objects.push(...party5('hall_end', [P(22, 5), P(21, 6), P(23, 6), P(22, 6, 0, 10), P(23, 5, 10, 0)], 'up'));
  objects.push(spawn('leon_night', cx(22), ty(20), 'up'), spawn('leon_start', cx(22), ty(20), 'up'));
  objects.push(spawn('door_forge', cx(42), ty(21), 'right'));
  objects.push({ type: 'goal', name: 'goal_forge', x: cx(42), y: ty(21), r: 40 });
  MAPS.grimhelm_hall = { rows: m.rows(), objects, props: { place: '그림헬름', ambient: '#6a4a3a', bg: '#140a06' } };
}

// ---- 4막-5) 도린의 기록실 (16 x 12): 벽을 따라 선 돌판 셋과 구석의 반으로 깨진 돌판 하나, 옆방으로 가는 문 ----
{
  const W = 16;
  const H = 12;
  const m = grid(W, H, '6');
  m.rect(0, 0, W - 1, 1, 'E');
  m.rect(0, 0, 0, H - 1, 'E');
  m.rect(W - 1, 0, W - 1, H - 1, 'E');
  m.rect(0, H - 1, W - 1, H - 1, 'E');
  m.rect(0, 5, 0, 6, '6'); // 옆방 문 (아이들 웃음소리)
  m.set(8, H - 1, '6');
  const objects = [];
  [[3, 1], [7, 2], [12, 3]].forEach(([c, n]) => {
    objects.push({ type: 'prop', name: `stone_tablet${n}`, x: cx(c), y: ty(2) + 12, solid: '28,8' });
    objects.push(look(`a4_tablet_${n}`, cx(c), ty(3), ty(1) - 30));
  });
  objects.push({ type: 'prop', name: 'broken_tablet', x: cx(13), y: ty(9) + 10, solid: '28,8' }, look('a4_tablet_4', cx(13), ty(9) + 14, ty(8) - 10));
  objects.push(hiddenProp('tablet_glow', 'tab4_glow', cx(13), ty(9) + 10));
  objects.push({ type: 'prop', name: 'candle', x: cx(1), y: ty(2) + 4 }, { type: 'prop', name: 'candle', x: cx(14), y: ty(2) + 4 });
  objects.push(...party5('in', [P(8, 9), P(7, 10), P(9, 10), P(8, 10, -14, 6), P(9, 9, 14, 0)], 'up'));
  objects.push(spawn('brida', cx(10), ty(6), 'left'), spawn('brida_out', cx(8), ty(11), 'down'), spawn('brida_door', cx(8), ty(10), 'up'));
  ['kid1', 'kid2', 'kid3'].forEach((k, i) => objects.push(spawn(k, cx(1), ty(5) + i * 10, 'right'), spawn(`${k}_out`, -16, ty(5) + i * 10, 'left')));
  objects.push(spawn('serena_door', cx(1), ty(6), 'left'), spawn('serena_out', -16, ty(6), 'left'));
  // 돌판마다 엘리시아·카르크가 곁에 선다 (구간 시작), 레온이 볼 자리
  [[3, 3], [7, 3], [12, 3], [13, 10]].forEach(([c, r], i) => {
    const t = i + 1;
    objects.push(spawn(`elysia_t${t}`, cx(c) - 18, ty(r) + (t === 4 ? 0 : 6), t === 4 ? 'right' : 'up'), spawn(`karg_t${t}`, cx(c) + 22, ty(r) + (t === 4 ? -20 : 10), t === 4 ? 'down' : 'up'));
    objects.push(spawn(`leon_t${t}`, cx(c), ty(r) + (t === 4 ? -22 : 20), t === 4 ? 'down' : 'up'));
  });
  objects.push(spawn('elysia_kneel', cx(12), ty(9) + 10, 'right'), spawn('galia_wall', cx(14), ty(5), 'left'));
  objects.push(spawn('leon_alone', cx(8), ty(6), 'up'), spawn('elysia_leave', cx(8), ty(11) + 16, 'down'));
  objects.push(spawn('leon_plate', cx(9), ty(5), 'down'), spawn('brida_plate', cx(9), ty(6) + 8, 'up'));
  MAPS.dorin_archive = { rows: m.rows(), objects, props: { place: '도린의 기록실', ambient: '#7a5a48', bg: '#0c0806' } };
}

// ---- 4막-6) 브리다의 대장간 (18 x 12): 화덕, 모루, 선반, 이름이 새겨진 벽 ----
{
  const W = 18;
  const H = 12;
  const m = grid(W, H, '8');
  m.rect(0, 0, W - 1, 1, 'E');
  m.rect(0, 0, 0, H - 1, 'E');
  m.rect(W - 1, 0, W - 1, H - 1, 'E');
  m.rect(0, H - 1, W - 1, H - 1, 'E');
  m.set(9, H - 1, '8');
  const objects = [];
  objects.push({ type: 'prop', name: 'forge_lit', x: cx(3), y: ty(3) + 10, solid: '52,14' });
  objects.push({ type: 'prop', name: 'anvil', x: cx(8), y: ty(5) + 8, solid: '24,8' });
  objects.push(wallItem('shelf', cx(12), 2 * TS + 8), wallItem('name_wall', cx(15), 2 * TS + 14), look('a4_forge_names', cx(15), ty(3), ty(1) - 20));
  objects.push({ type: 'prop', name: 'straw_bed', x: cx(14), y: ty(9) + 12 });
  objects.push(hiddenProp('rusty_hammers', 'hammers_down', cx(9), ty(6) + 8));
  objects.push(spawn('brida', cx(7), ty(5), 'right'), spawn('brida_anvil', cx(8), ty(4), 'down'));
  objects.push(...party5('f', [P(9, 8), P(6, 8, 0, 6), P(11, 8, 0, 6), P(8, 9, 0, 6), P(12, 9)], 'up'));
  objects.push(spawn('leon_bed', cx(14), ty(9) + 6, 'up'), spawn('leon_night', cx(9), ty(10), 'up'), spawn('leon_start', cx(9), ty(10), 'up'));
  objects.push(spawn('karg_hammers', cx(9), ty(7), 'up'));
  objects.push({ type: 'goal', name: 'goal_bed', x: cx(14), y: ty(9), r: 36 });
  MAPS.brida_forge = { rows: m.rows(), objects, props: { place: '브리다의 대장간', ambient: '#7a5040', bg: '#0c0604' } };
}

// ---- 4막-7) 무스펠 화산지대 (60 x 35): 용암 강, 검게 굳은 바위, 증기 구멍, 좁은 다리. 붉은 빛이 바닥에서 올라옴 ----
{
  const W = 60;
  const H = 35;
  const m = grid(W, H, '9');
  m.rect(0, 0, W - 1, 1, 'M');
  m.rect(0, H - 2, W - 1, H - 1, 'M');
  m.rect(0, 0, 0, H - 1, 'M');
  m.rect(W - 1, 0, W - 1, H - 1, 'M');
  // 용암 강 셋과 좁은 다리
  m.rect(14, 2, 17, H - 3, 'F');
  m.rect(14, 24, 17, 25, '9');
  m.rect(30, 2, 33, H - 3, 'F');
  m.rect(30, 8, 33, 9, '9');
  m.rect(18, 15, 29, 18, 'F');
  m.rect(22, 15, 23, 18, '9');
  m.rect(44, 2, 47, H - 3, 'F');
  m.rect(44, 20, 47, 21, '9');
  m.rect(50, 2, W - 2, 9, 'F'); // 오른쪽 위 용암 호수
  m.rect(1, 2, 5, 6, 'M'); // 숨은 틈 뒤 벽
  m.rect(2, 3, 3, 5, '9'); // 증기 구멍 뒤 좁은 틈 (숨은 증기 동굴)
  m.set(3, 6, '9');
  const objects = [];
  for (const [c, r] of [[3, 8], [10, 28], [26, 5], [37, 26], [41, 12], [53, 25]]) objects.push({ type: 'prop', name: 'steam_vent', x: cx(c), y: ty(r) + 8 });
  objects.push({ type: 'prop', name: 'red_crystal', x: cx(2), y: ty(4) + 10 }, look('a4_hidden_vent', cx(3), ty(5), ty(3) - 10));
  objects.push({ type: 'prop', name: 'melted_helm', x: cx(38), y: ty(16) + 6 }, look('a4_melted_helm', cx(38), ty(16) + 10, ty(15) - 6));
  objects.push(...party5('start', [P(4, 26), P(3, 27), P(5, 27, 0, 8), P(4, 28, 0, 4), P(2, 26)], 'right'));
  objects.push(...party5('lake', [P(52, 12), P(50, 13), P(54, 13), P(51, 14, 0, 6), P(53, 14, 0, 6)], 'up'));
  objects.push(spawn('karg_lake', cx(52), ty(11), 'up'), spawn('karg_front', cx(53), ty(11), 'up'));
  objects.push({ type: 'mob', name: 'mob1', x: cx(24), y: ty(24), sprite: 'fire_spirit', battle: '화산 몹 1' });
  objects.push({ type: 'mob', name: 'mob2', x: cx(39), y: ty(9), sprite: 'magma_slug', battle: '화산 몹 2' });
  objects.push({ type: 'goal', name: 'goal_lake', x: cx(52), y: ty(12), r: 48 });
  objects.push({ type: 'arena', name: 'arena', x: 18 * TS, y: 20 * TS, w: 448, h: 288 });
  MAPS.muspel_a = { rows: m.rows(), objects, props: { place: '무스펠 화산지대', ambient: '#c87860', bg: '#200604' } };
}

// ---- 4막-8) 화산의 심장 (30 x 25): 용암 호수 한가운데의 둥근 바위판(보스 전투장) ----
{
  const W = 30;
  const H = 25;
  const m = grid(W, H, 'F');
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (((x - 14.5) / 9.5) ** 2 + ((y - 12) / 7) ** 2 <= 1) m.set(x, y, '9');
  m.rect(13, 18, 16, H - 1, '9'); // 들어오는 바위길
  m.rect(24, 16, 26, 18, '9'); // 돌아 나오는 길 바위틈
  m.rect(0, 0, W - 1, 0, 'M');
  const objects = [];
  objects.push(hiddenProp('lava_mound', 'guardian', cx(14) + 16, ty(10) + 16));
  objects.push(hiddenProp('cooled_guardian', 'guardian_stone', cx(14) + 16, ty(10) + 12));
  objects.push(hiddenProp('rusty_hammers', 'hammers', cx(25), ty(17) + 6));
  objects.push(...party5('in', [P(14, 22), P(13, 23), P(16, 23), P(15, 23, 0, 10), P(14, 23, -8, 12)], 'up'));
  objects.push(...party5('core', [P(14, 14), P(12, 15), P(17, 15), P(15, 15, 0, 10), P(13, 14, -6, 8)], 'up'));
  objects.push(...party5('out', [P(24, 17), P(22, 17, 0, 8), P(25, 18), P(23, 18, 0, 8), P(21, 17)], 'right'));
  objects.push(spawn('view_core', cx(14) + 16, ty(10)));
  objects.push({ type: 'arena', name: 'arena', x: 8 * TS, y: 7 * TS, w: 448, h: 288 });
  MAPS.muspel_core = { rows: m.rows(), objects, props: { place: '화산의 심장', ambient: '#d08060', bg: '#200604' } };
}

// ---- 4막-9) 결계 감옥 (14 x 10): 투명한 벽, 벽 너머 발아래로 흐르는 구름. 옆 칸(갈리아) ----
{
  const W = 14;
  const H = 10;
  const m = grid(W, H, 'W');
  m.rect(1, 1, 5, 6, '0'); // 레온의 칸
  m.rect(8, 1, 12, 6, '0'); // 옆 칸 (갈리아)
  m.rect(0, 0, 6, 0, 'V');
  m.rect(7, 0, 13, 0, 'V');
  m.rect(0, 0, 0, 7, 'V');
  m.rect(6, 0, 7, 7, 'V');
  m.rect(13, 0, 13, 7, 'V');
  m.rect(0, 7, 13, 7, 'V');
  m.rect(0, 8, W - 1, 9, '0'); // 감옥 앞 복도
  const objects = [];
  objects.push(spawn('leon_cell', cx(3), ty(4), 'down'), spawn('leon_wall', cx(3), ty(6), 'down'), spawn('leon_lie', cx(3), ty(3), 'down'));
  objects.push(spawn('galia_cell', cx(10), ty(4), 'left'), spawn('galia_wall', cx(8), ty(4), 'left'));
  objects.push(spawn('elysia_visit', cx(3), ty(8) + 6, 'up'), spawn('elysia_from', -20, ty(9), 'right'), spawn('elysia_go', -20, ty(9), 'left'));
  objects.push(spawn('leon_out', cx(3), ty(8) + 4, 'right'), spawn('galia_out', cx(10), ty(8) + 4, 'left'));
  objects.push(spawn('view_south', cx(7), ty(9)));
  MAPS.astra_cell = { rows: m.rows(), objects, props: { place: '아스트라, 결계 감옥', ambient: '#dfe4f4', bg: '#6a7aa8' } };
}

// ---- 4막-10) 탑주의 방 (16 x 12): 책과 측정 기구, 큰 창 밖의 하늘 (막간은 맵 없이 연출하므로 지금은 쓰지 않음) ----
{
  const W = 16;
  const H = 12;
  const m = grid(W, H, '0');
  m.rect(0, 0, W - 1, 1, 'N');
  m.rect(5, 0, 10, 1, 'W'); // 큰 창
  m.rect(0, 0, 0, H - 1, 'N');
  m.rect(W - 1, 0, W - 1, H - 1, 'N');
  m.rect(0, H - 1, W - 1, H - 1, 'N');
  const objects = [];
  objects.push(wallItem('bookcase', cx(2) + 16, 2 * TS + 22), wallItem('bookcase', cx(12) + 16, 2 * TS + 22));
  objects.push({ type: 'prop', name: 'rune_table', x: cx(8), y: ty(6) + 10, solid: '36,10' }, { type: 'prop', name: 'measure_paper', x: cx(10), y: ty(7) + 8 });
  objects.push(spawn('cassius', cx(8), ty(3), 'down'), spawn('elysia', cx(8), ty(8), 'up'));
  MAPS.astra_study = { rows: m.rows(), objects, props: { place: '아스트라, 탑주의 방', ambient: '#9a90c8', bg: '#2a2448' } };
}

// ---- 4막-11) 탑의 복도 (45 x 12): 흰 돌 복도, 실험실 유리창(안에 카르크), 보랏빛 등 ----
{
  const W = 45;
  const H = 12;
  const m = grid(W, H, '0');
  m.rect(0, 0, W - 1, 2, 'N');
  m.rect(0, 10, W - 1, H - 1, 'N');
  const objects = [];
  for (const c of [8, 16, 24, 32]) objects.push(wallItem('lab_window', cx(c), 3 * TS - 2));
  for (const c of [4, 12, 20, 28, 36, 42]) objects.push(wallItem('violet_lamp', cx(c), 3 * TS - 4));
  objects.push(...party5('start', [P(3, 6), P(2, 7), P(4, 7, 0, 8), P(1, 6), P(5, 6)], 'right'));
  objects.push(...party5('end', [P(41, 6), P(40, 7), P(42, 7, 0, 8), P(39, 6), P(43, 6)], 'right'));
  for (let i = 0; i < 4; i++) objects.push(spawn(`mage${i + 1}`, cx(30 + i * 2), ty(5 + (i % 3)), 'left'));
  objects.push(spawn('galia_sweep', cx(29), ty(6), 'right'));
  objects.push({ type: 'goal', name: 'goal_portal', x: cx(43), y: ty(6), r: 40 });
  MAPS.astra_corridor = { rows: m.rows(), objects, props: { place: '아스트라, 탑의 복도', ambient: '#e4e0f0', bg: '#2a2448' } };
}

// ---- 4막-12) 포탈실 (24 x 18): 방 한가운데 거대한 돌고리 ----
{
  const W = 24;
  const H = 18;
  const m = grid(W, H, '0');
  m.rect(0, 0, W - 1, 1, 'N');
  m.rect(0, 0, 0, H - 1, 'N');
  m.rect(W - 1, 0, W - 1, H - 1, 'N');
  m.rect(0, H - 1, W - 1, H - 1, 'N');
  m.rect(11, H - 1, 12, H - 1, '0'); // 문
  const objects = [];
  objects.push({ type: 'prop', name: 'stone_ring', x: cx(11) + 16, y: ty(7) + 16, solid: '60,10' });
  objects.push(hiddenProp('ring_light', 'ring_light', cx(11) + 16, ty(7) + 16));
  for (const c of [3, 20]) objects.push(wallItem('violet_lamp', cx(c), 2 * TS - 4));
  const pts = [[5, 4], [18, 4], [3, 9], [20, 9], [6, 13], [17, 13], [9, 3], [14, 3], [2, 6], [21, 6], [2, 13], [21, 13]];
  pts.forEach(([c, r], i) => objects.push(hiddenProp('portal_circle', `portal${i + 1}`, cx(c), ty(r) + 10)));
  objects.push(...party5('in', [P(12, 14), P(10, 14, 8, 0), P(13, 15), P(11, 15, 8, 8), P(14, 14)], 'up'));
  objects.push(...party5('ring', [P(12, 10), P(11, 11, -4, 4), P(13, 11), P(12, 11, 0, 10), P(14, 11)], 'up'));
  objects.push(spawn('elysia_stay', cx(11) + 16, ty(13), 'down'), spawn('elysia_fall', cx(11) + 4, ty(11) + 8, 'down'));
  objects.push(spawn('leon_jump', cx(11) + 16, ty(8), 'up'), spawn('karg_jump', cx(12), ty(8), 'up'), spawn('serena_jump', cx(11), ty(8), 'up'));
  objects.push(spawn('door', cx(11) + 16, ty(17), 'up'));
  objects.push({ type: 'arena', name: 'arena', x: 5 * TS, y: 7 * TS, w: 448, h: 288 });
  MAPS.astra_portal = { rows: m.rows(), objects, props: { place: '아스트라, 포탈실', ambient: '#a89ad0', bg: '#1a1430' } };
}

// ---- 4막-13) 세라핀 구릉 근처 언덕 (40 x 20): 낮은 언덕, 언덕 아래 피난민의 긴 줄, 멀리 대성당의 첨탑 ----
{
  const W = 40;
  const H = 20;
  const m = grid(W, H, 'l');
  m.rect(12, 2, 28, 9, 'g'); // 언덕
  m.rect(0, 14, W - 1, 16, 't'); // 언덕 아래 길
  const objects = [];
  objects.push({ type: 'prop', name: 'cathedral_far', x: cx(36), y: ty(4) + 10 }, { type: 'prop', name: 'far_mountains', x: cx(8), y: ty(1) + 10 });
  objects.push(hiddenProp('cairn3', 'grave', cx(20), ty(4) + 6));
  for (let i = 0; i < 8; i++) objects.push(spawn(`refugee${i + 1}`, cx(2 + i * 4), ty(15) + (i % 2) * 8, 'right'), spawn(`refugee${i + 1}_to`, cx(30 + i * 4), ty(15) + (i % 2) * 8, 'right'));
  objects.push(...party5('hill', [P(20, 8), P(18, 9), P(22, 9), P(19, 8, -6, 10), P(21, 8, 6, 10)], 'down'));
  objects.push(...party5('arrive', [P(18, 7), P(17, 8), P(21, 7), P(19, 8), P(22, 8)], 'down'));
  objects.push(spawn('elysia_lie', cx(19), ty(7) + 6, 'down'), spawn('karg_grave', cx(21), ty(5), 'up'), spawn('leon_grave', cx(19), ty(5) + 10, 'up'), spawn('serena_grave', cx(20), ty(6), 'up'));
  objects.push(spawn('view_hill', cx(20), ty(10)));
  MAPS.seraphine_hill = { rows: m.rows(), objects, props: { place: '세라핀 구릉 근처', ambient: '#dcdcd4', bg: '#7a7a6a' } };
}

// ---------------------------------------------------------------------
mkdirSync(join(ROOT, 'src/data/maps'), { recursive: true });
for (const [id, def] of Object.entries(MAPS)) {
  const json = tiled(id, def);
  writeFileSync(join(ROOT, 'src/data/maps', `${id}.json`), JSON.stringify(json, null, 1) + '\n');
  console.log(`  src/data/maps/${id}.json  (${json.width}x${json.height}칸, 물건 ${json.layers.at(-1).objects.length}개)`);
}
