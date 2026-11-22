// 60x40 마을 맵을 Tiled에서 열 수 있는 JSON으로 만든다.
// 실행: npm run map  →  public/assets/maps/village.json
// 한 번 만든 뒤에는 Tiled로 직접 고쳐도 된다 (다시 실행하면 덮어씀).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../public/assets/maps/village.json');

const W = 60, H = 40, TS = 32;
// terrain.png 타일 번호 (tools/pixel-art/outputs.mjs 순서와 같아야 함)
const T = { grass1: 0, grass2: 1, flower: 2, dirt: 3, stone: 4, water1: 5, water2: 6, wallTop: 7, wallFront: 8, bush: 9, fence: 10 };
const COLLIDES = [T.water1, T.water2, T.wallTop, T.wallFront, T.bush, T.fence];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(2026);

const ground = Array.from({ length: H }, () => Array.from({ length: W }, () => (r() < 0.3 ? T.grass2 : r() < 0.06 ? T.flower : T.grass1)));
const walls = Array.from({ length: H }, () => Array(W).fill(-1));
const gset = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) ground[y][x] = t; };
const wset = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) walls[y][x] = t; };

// 길: 가운데 세로길, 가로길, 광장
for (let y = 9; y <= 37; y++) { gset(29, y, T.dirt); gset(30, y, T.dirt); }
for (let x = 2; x <= 57; x++) { gset(x, 21, T.dirt); gset(x, 22, T.dirt); }
for (let y = 18; y <= 25; y++) for (let x = 26; x <= 33; x++) gset(x, y, T.stone);
// 집 앞 갈림길
for (let y = 15; y <= 20; y++) { gset(12, y, T.dirt); gset(13, y, T.dirt); }
for (let y = 14; y <= 20; y++) { gset(46, y, T.dirt); gset(47, y, T.dirt); }

// 연못
const pond = { cx: 45.5, cy: 30.5, rx: 6.5, ry: 4.2 };
for (let y = 24; y <= 36; y++) for (let x = 36; x <= 55; x++) {
  const nx = (x + 0.5 - pond.cx) / pond.rx, ny = (y + 0.5 - pond.cy) / pond.ry;
  if (nx * nx + ny * ny <= 1) gset(x, y, T.water1);
}

// 바깥 돌벽: 위쪽은 윗면+앞면, 나머지는 윗면
for (let x = 0; x < W; x++) { wset(x, 0, T.wallTop); wset(x, 1, T.wallTop); wset(x, 2, T.wallFront); wset(x, H - 1, T.wallTop); }
for (let y = 0; y < H; y++) { wset(0, y, T.wallTop); wset(W - 1, y, T.wallTop); }
wset(0, 2, T.wallTop); wset(W - 1, 2, T.wallTop);

// 울타리 (텃밭 둘레, 연못 위쪽)
for (let x = 4; x <= 21; x++) if (x !== 12 && x !== 13) wset(x, 26, T.fence);
for (let x = 4; x <= 21; x++) wset(x, 34, T.fence);
for (let x = 37; x <= 43; x++) wset(x, 24, T.fence);
for (let x = 49; x <= 55; x++) wset(x, 24, T.fence);
// 텃밭 안은 흙
for (let y = 28; y <= 32; y++) for (let x = 6; x <= 19; x++) if (y % 2 === 0) gset(x, y, T.dirt);

// 덤불
for (const [x, y] of [[3, 5], [4, 5], [22, 4], [23, 4], [36, 6], [37, 6], [56, 9], [56, 10], [3, 17], [24, 30], [25, 30], [34, 36], [35, 36], [56, 18], [8, 37], [9, 37], [20, 12], [40, 18]]) wset(x, y, T.bush);

// ---------- 오브젝트 (점: x,y = 발밑 가운데) ----------
const objects = [];
let nextId = 1;
const obj = (type, tx, ty, props = {}, name = '') => {
  objects.push({
    id: nextId++, name, type, point: true, rotation: 0, visible: true, width: 0, height: 0,
    x: tx * TS, y: ty * TS,
    properties: Object.entries(props).map(([k, v]) => ({ name: k, type: typeof v === 'number' ? 'int' : 'string', value: v })),
  });
};
obj('spawn', 30, 24, {}, 'leon');
obj('npc', 33, 20, { sprite: 'guard', character: 'imperial_guard', dialogue: 'prologue_awakening', facing: 'left' }, 'guard');
obj('house', 30, 9);
obj('house', 13, 15);
obj('house', 47, 14);
obj('sign', 27.5, 18);
obj('crate', 33.5, 9);
obj('crate', 34.5, 9);
obj('crate', 16, 15);

// 나무: 길·물·집·벽과 겹치지 않는 곳에 흩어 심기
const blocked = (x, y) => {
  for (let yy = y - 1; yy <= y; yy++) for (let xx = x - 1; xx <= x; xx++) {
    if (xx < 1 || xx > W - 2 || yy < 3 || yy > H - 2) return true;
    if (ground[yy][xx] !== T.grass1 && ground[yy][xx] !== T.grass2 && ground[yy][xx] !== T.flower) return true;
    if (walls[yy][xx] !== -1) return true;
  }
  return false;
};
const houses = objects.filter((o) => o.type === 'house').map((o) => [o.x / TS, o.y / TS]);
const trees = [];
const fixed = [[5, 9], [9, 6], [20, 8], [38, 9], [52, 6], [55, 14], [4, 22.5], [24, 34], [52, 37], [36, 13], [22, 18], [56, 30]];
for (const [x, y] of fixed) trees.push([x, y]);
for (let i = 0; i < 400 && trees.length < 34; i++) {
  const x = 2 + Math.floor(r() * (W - 4)), y = 5 + Math.floor(r() * (H - 7));
  if (blocked(x, y)) continue;
  if (houses.some(([hx, hy]) => Math.abs(hx - x) < 4 && y > hy - 4 && y < hy + 3)) continue;
  if (trees.some(([tx, ty]) => Math.abs(tx - x) < 3 && Math.abs(ty - y) < 3)) continue;
  if (Math.abs(x - 30) < 5 && Math.abs(y - 22) < 6) continue;
  trees.push([x, y]);
}
for (const [x, y] of trees) obj('tree', x, y);

// ---------- Tiled JSON ----------
const tileLayer = (id, name, grid) => ({
  id, name, type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true,
  data: grid.flat().map((t) => (t < 0 ? 0 : t + 1)),
});
const map = {
  type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down',
  width: W, height: H, tilewidth: TS, tileheight: TS, infinite: false,
  nextlayerid: 4, nextobjectid: nextId,
  layers: [
    tileLayer(1, 'ground', ground),
    tileLayer(2, 'walls', walls),
    { id: 3, name: 'objects', type: 'objectgroup', draworder: 'topdown', opacity: 1, visible: true, x: 0, y: 0, objects },
  ],
  tilesets: [{
    firstgid: 1, name: 'terrain', image: '../tilesets/terrain.png', imagewidth: 192, imageheight: 64,
    tilewidth: TS, tileheight: TS, tilecount: 12, columns: 6, margin: 0, spacing: 0,
    tiles: COLLIDES.map((id) => ({ id, properties: [{ name: 'collides', type: 'bool', value: true }] })),
  }],
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(map));
console.log(`village.json: ${W}x${H}, 나무 ${trees.length}그루, 오브젝트 ${objects.length}개`);
