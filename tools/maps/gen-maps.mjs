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
};
const WALL = {
  '#': () => 'wall_top',
  '^': () => 'wall_up',
  v: () => 'wall_low',
  U: () => 'window_up',
  L: () => 'window_low',
  H: () => 'castle_top',
  C: (x, y) => ((x * 13 + y * 5) % 6 === 0 ? 'castle_moss' : 'castle_wall'),
  B: () => 'castle_base',
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
  objects.push(wallItem('sanctum', 59 * TS, 96), look('sanctum', 59 * TS, 112, 30));
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

// ---------------------------------------------------------------------
mkdirSync(join(ROOT, 'src/data/maps'), { recursive: true });
for (const [id, def] of Object.entries(MAPS)) {
  const json = tiled(id, def);
  writeFileSync(join(ROOT, 'src/data/maps', `${id}.json`), JSON.stringify(json, null, 1) + '\n');
  console.log(`  src/data/maps/${id}.json  (${json.width}x${json.height}칸, 물건 ${json.layers.at(-1).objects.length}개)`);
}
