import Phaser from 'phaser';
import sprites from '../data/explore/sprites.json';
import hd from '../data/explore/hd_sprites.json';
import decor from '../data/explore/decor.json';

/**
 * 프롤로그 도트 맵 (Tiled JSON, src/data/maps/*.json — tools/maps/gen-maps.mjs가 만듦)
 * 맵 화면(ExploreScene)과 전투장(BattleScene)이 같이 쓴다.
 */
export interface TiledProp {
  name: string;
  value: string | number | boolean;
}
export interface TiledObj {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  point?: boolean;
  properties?: TiledProp[];
}
interface TiledLayer {
  name: string;
  type: string;
  data?: number[];
  objects?: TiledObj[];
}
export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  properties?: TiledProp[];
  layers: TiledLayer[];
}

const files = import.meta.glob('../data/maps/*.json', { eager: true, import: 'default' }) as Record<string, TiledMap>;
export const MAPS: Record<string, TiledMap> = {};
for (const [path, data] of Object.entries(files)) MAPS[path.split('/').pop()!.replace('.json', '')] = data;

export const PROPS = sprites.props as Record<string, { file: string; w: number; h: number; frames: number; rate?: number }>;
const TILE_NAMES = sprites.tiles.names;
const SOLID_TILES = new Set(sprites.tiles.solid);
const WADE_TILES = new Set<string>((sprites.tiles as { wade?: string[] }).wade ?? []);
export const TS = 32;

export const propOf = <T extends TiledProp['value']>(o: { properties?: TiledProp[] }, key: string): T | undefined =>
  o.properties?.find((p) => p.name === key)?.value as T | undefined;

export const objectsOf = (map: TiledMap) => map.layers.find((l) => l.type === 'objectgroup')?.objects ?? [];
export const layerOf = (map: TiledMap, name: string) => map.layers.find((l) => l.name === name);
export const findObj = (map: TiledMap, type: string, name?: string) =>
  objectsOf(map).find((o) => o.type === type && (name === undefined || o.name === name));

/** 물건(prop)의 발밑 좌표 (Tiled 사각형의 아래 가운데) */
export const footOf = (o: TiledObj) => ({ x: o.x + o.width / 2, y: o.y + o.height });

/** 칸이 막혀 있는지 (벽 타일, 또는 바닥도 벽도 없는 빈 곳) */
export function solidGrid(map: TiledMap) {
  const floor = layerOf(map, 'floor')?.data ?? [];
  const walls = layerOf(map, 'walls')?.data ?? [];
  return floor.map((f, i) => {
    const w = walls[i];
    if (w) return SOLID_TILES.has(TILE_NAMES[w - 1]);
    return !f;
  });
}

/** 걸어 들어갈 수 있는 물 칸 (몸이 잠기고 느려짐) */
export function wadeGrid(map: TiledMap) {
  const floor = layerOf(map, 'floor')?.data ?? [];
  const walls = layerOf(map, 'walls')?.data ?? [];
  return floor.map((f, i) => !walls[i] && !!f && WADE_TILES.has(TILE_NAMES[f - 1]));
}

export function preloadMapArt(scene: Phaser.Scene) {
  if (!scene.textures.exists('palace_tiles')) scene.load.spritesheet('palace_tiles', sprites.tiles.file, { frameWidth: TS, frameHeight: TS });
  const dec = (hd as { _decor?: { file: string; size: number } })._decor;
  if (dec && !scene.textures.exists('decor')) scene.load.spritesheet('decor', dec.file, { frameWidth: dec.size, frameHeight: dec.size });
  for (const [k, s] of Object.entries(PROPS)) {
    if (!scene.textures.exists(`ex_${k}`)) scene.load.spritesheet(`ex_${k}`, s.file, { frameWidth: s.w, frameHeight: s.h });
  }
}

export function makeMapAnims(scene: Phaser.Scene) {
  for (const [k, s] of Object.entries(PROPS)) {
    if (s.frames > 1 && !scene.anims.exists(`ex_${k}`)) {
      scene.anims.create({ key: `ex_${k}`, frames: scene.anims.generateFrameNumbers(`ex_${k}`, { start: 0, end: s.frames - 1 }), frameRate: s.rate ?? 5, repeat: -1 });
    }
  }
}

/** Tiled 맵을 Phaser 타일맵으로 (캐시에 한 번 올려 두고 씀) */
export function makeTilemap(scene: Phaser.Scene, id: string) {
  const key = `map_${id}`;
  if (!scene.cache.tilemap.exists(key)) scene.cache.tilemap.add(key, { format: Phaser.Tilemaps.Formats.TILED_JSON, data: MAPS[id] });
  const tm = scene.make.tilemap({ key });
  const ts = tm.addTilesetImage('palace', 'palace_tiles', TS, TS, 0, 0)!;
  return { tm, ts };
}

/**
 * 새 도트 타일로 맵 꾸미기 (맵 데이터는 그대로, 기준: docs/도트기준.md 6절)
 * - 바닥 무늬 갈래를 칸마다 섞어 깖, 여러 칸에 걸친 큰 밝음·어둠 얼룩
 * - 다른 바닥이 만나는 곳은 둥글고 불규칙한 경계(자동 경계): 위 바닥(풀 > 흙·모래 > 돌·길 > 물)의 색 덩어리가 아래 바닥으로 번짐
 * - 벽: 앞면 위 밝은 줄과 아래 어두운 띠, 벽 아래 바닥에 그림자 띠
 * - 물·용암은 4프레임으로 움직이고, 용암 둘레는 붉게 빛남
 * - 장식 소품(src/data/explore/decor.json): 충돌 없음, 칸 위치로 정해지는 난수, 길·물건·spawn 주변은 피함
 * 만든 그림을 돌려줌 (부르는 쪽이 맵을 지울 때 함께 지움)
 */
export function dressTiles(scene: Phaser.Scene, floor: Phaser.Tilemaps.TilemapLayer, walls: Phaser.Tilemaps.TilemapLayer, mapId = '', lightUp?: (o: Phaser.GameObjects.GameObject) => void) {
  type Info = { extra: string[]; variants: Record<string, string[]>; alternate?: Record<string, string>; shadowBelow: string[]; anim?: Record<string, string[]>; avg?: Record<string, string> };
  const info = (hd as { _tiles?: Info })._tiles;
  const out: Phaser.GameObjects.GameObject[] = [];
  if (!info) return out;
  const gid = (name: string) => {
    const i = TILE_NAMES.indexOf(name);
    return i >= 0 ? i + 1 : TILE_NAMES.length + info.extra.indexOf(name) + 1;
  };
  const nameOf = (g: number) => (g <= TILE_NAMES.length ? TILE_NAMES[g - 1] : info.extra[g - TILE_NAMES.length - 1]) ?? '';
  // 칸 위치로 정해지는 난수. 잘 섞어서 일정한 간격으로 되풀이되지 않게 (점검_피드백2 3-1: 소품이 격자로 놓이던 것)
  const hash = (x: number, y: number, s = 0) => {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul((s | 0) + 0x632be5ab, 0x9e3779b9);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const variants = new Map(Object.entries(info.variants).map(([k, v]) => [gid(k), v.map(gid)]));
  const alternate = new Map(Object.entries(info.alternate ?? {}).map(([k, v]) => [gid(k), gid(v)]));
  const shade = new Set(info.shadowBelow.map(gid));
  const W = floor.layer.width;
  const H = floor.layer.height;
  // 원래 이름 (갈래로 바꾸기 전)
  const base: string[] = [];
  floor.forEachTile((t) => (base[t.y * W + t.x] = t.index > 0 ? nameOf(t.index) : ''));
  const wallAt = (x: number, y: number) => walls.getTileAt(x, y);

  const g = scene.add.graphics().setDepth(-18);
  out.push(g);
  floor.forEachTile((t) => {
    const v = variants.get(t.index);
    if (v) {
      // 칸 위치로 정해지는 난수: 40%는 그대로, 나머지는 갈래
      const h = Math.floor(hash(t.x, t.y, 77) * 100);
      if (h >= 40) t.index = v[Math.floor(((h - 40) * v.length) / 60)];
    }
    const alt = alternate.get(t.index);
    if (alt && t.x % 2 === 1) t.index = alt;
    if (t.index > 0 && !wallAt(t.x, t.y) && shade.has(wallAt(t.x, t.y - 1)?.index ?? 0)) {
      g.fillStyle(0x2a1a48, 0.35).fillRect(t.pixelX, t.pixelY, TS, 4);
      g.fillStyle(0x2a1a48, 0.18).fillRect(t.pixelX, t.pixelY + 4, TS, 4);
    }
  });

  // 벽 앞면: 위 밝은 줄 + 아래 어두운 띠 (윗면·앞면·그림자 띠 세 층이 읽히게)
  const gw = scene.add.graphics().setDepth(-14.9);
  out.push(gw);
  walls.forEachTile((t) => {
    if (!shade.has(t.index)) return;
    if (!shade.has(wallAt(t.x, t.y - 1)?.index ?? 0)) gw.fillStyle(0xffffff, 0.1).fillRect(t.pixelX, t.pixelY, TS, 1);
    if (!wallAt(t.x, t.y + 1)) {
      gw.fillStyle(0x1d2735, 0.22).fillRect(t.pixelX, t.pixelY + TS - 3, TS, 3);
      gw.fillStyle(0x1d2735, 0.1).fillRect(t.pixelX, t.pixelY + TS - 7, TS, 4);
    }
  });

  // 바닥 경계: 위에 오는 바닥일수록 큰 수. 같은 무리끼리는 잇지 않음
  const rank = (n: string): [number, string] => {
    if (!n || /bridge|quay|edge|carpet|stair|bars|barrier/.test(n)) return [-1, n];
    if (/water|river|lava|ice/.test(n)) return [0, 'water'];
    if (/road|path|cobble|stone|floor|slab|rock|black/.test(n)) return [1, n.replace(/\d+$/, '')];
    if (/mud|sand|desert|dune|dirt|field/.test(n)) return [2, n.startsWith('desert') || n === 'dune' ? 'desert' : n];
    if (/grass|forest/.test(n)) return [3, n];
    if (/snow|frost/.test(n)) return [4, 'snow'];
    return [-1, n];
  };
  const avg = info.avg ?? {};
  const ge = scene.add.graphics().setDepth(-19.8);
  out.push(ge);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const me = base[y * W + x];
      const [rm, gm] = rank(me);
      if (rm < 0 || wallAt(x, y)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nb = base[ny * W + nx];
        const [rn, gn] = rank(nb);
        if (rn <= rm || gn === gm || !avg[nb] || (rn === 0 && rm === 0)) continue;
        const col = Phaser.Display.Color.HexStringToColor(avg[nb]).color;
        // 맞닿은 변을 따라 크기가 다른 둥근 덩어리
        const cnt = 4 + Math.floor(hash(x, y, 3 + dx * 2 + dy) * 4);
        for (let k = 0; k < cnt; k++) {
          const u = ((k + hash(x * 7 + k, y * 13 + dx * 3 + dy, 5) * 0.9) * TS) / cnt;
          const big = hash(x + k, y - k, 9);
          const r = big < 0.25 ? 1.5 : big < 0.8 ? 2.5 + big * 2 : 5;
          const d = Math.floor(hash(x * 3 + k, y * 5 + dx, 11) * 4) - 1;
          const px = dx ? (dx > 0 ? TS - d : d) : u;
          const py = dy ? (dy > 0 ? TS - d : d) : u;
          ge.fillStyle(col, 1).fillCircle(x * TS + px, y * TS + py, r);
        }
      }
    }

  // 큰 얼룩: 여러 칸에 걸쳐 은은한 밝음·어둠
  const gm = scene.add.graphics().setDepth(-19.7);
  out.push(gm);
  const n = Math.round((W * H) / 16);
  for (let i = 0; i < n; i++) {
    const cx = hash(i, 1, 21) * W * TS;
    const cy = hash(i, 2, 21) * H * TS;
    const tx = Math.floor(cx / TS);
    const ty = Math.floor(cy / TS);
    if (rank(base[ty * W + tx])[0] <= 0) continue;
    const dark = hash(i, 3, 21) < 0.6;
    const r = 26 + hash(i, 4, 21) * 40;
    // 모래 위 그늘은 푸른 회색 대신 따뜻한 갈색으로, 고리를 더 많이·더 옅게 겹쳐 경계가 흐리게 (흙탕 자국처럼 보이지 않게)
    const onSand = /desert|dune|sand/.test(base[ty * W + tx] ?? '');
    const rings = onSand ? ([[1, 0.008], [0.85, 0.008], [0.7, 0.01], [0.55, 0.01], [0.4, 0.01]] as const) : ([[1, 0.02], [0.75, 0.02], [0.5, 0.02]] as const);
    for (const [k, a] of rings) gm.fillStyle(dark ? (onSand ? 0xa8743c : 0x1d2735) : 0xfff6e0, a).fillEllipse(cx, cy, r * 2 * k, r * 1.4 * k);
  }
  // 사막: 칸 무늬가 되풀이돼 보이지 않게 여러 칸에 걸친 더 큰 밝음·그늘 얼룩 (점검_피드백 3절)
  const sandy = (n: string) => n.startsWith('desert') || n === 'dune';
  const nd = Math.round((W * H) / 36);
  for (let i = 0; i < nd; i++) {
    const cx = hash(i, 1, 41) * W * TS;
    const cy = hash(i, 2, 41) * H * TS;
    if (!sandy(base[Math.floor(cy / TS) * W + Math.floor(cx / TS)] ?? '')) continue;
    const dark = hash(i, 3, 41) < 0.5;
    const r = 60 + hash(i, 4, 41) * 80;
    const sq = 0.45 + hash(i, 5, 41) * 0.4;
    for (const [k, a] of [[1, 0.01], [0.86, 0.012], [0.72, 0.012], [0.58, 0.012], [0.44, 0.012]] as const) gm.fillStyle(dark ? 0xc08a4c : 0xfff2c8, a).fillEllipse(cx, cy, r * 2 * k, r * 2 * sq * k);
  }
  // 사막 모래 자국 (점검_피드백3 1-2): 바람 물결 줄·작은 조약돌·마른 풀·모래알 여러 가지를 칸마다 자리·방향을 흩뜨리고,
  // 3분의 2쯤의 칸은 비움. 물결은 밝은 줄만 옅게(아래 그림자를 붙이면 "ㄱ" 모양으로 보여서 뺌)
  const marks = scene.add.graphics().setDepth(-19.6);
  out.push(marks);
  const px = (x: number, y: number, c: number, a: number) => marks.fillStyle(c, a).fillRect(x, y, 1, 1);
  const KINDS: ((ox: number, oy: number, f: number, r: (k: number) => number) => void)[] = [
    // 길게 휜 바람 물결 줄 (10~18px, 위아래 1px 휨)
    (ox, oy, f, r) => {
      const n = 10 + Math.floor(r(1) * 9);
      const ph = r(2) * 6;
      for (let i = 0; i < n; i++) px(ox + i * f, oy + Math.round(Math.sin(i / 4 + ph) * 0.9), 0xf6e4b4, 0.32 + 0.12 * Math.sin((i / n) * Math.PI));
    },
    // 나란한 물결 두 줄 (짧고 어긋남)
    (ox, oy, f, r) => {
      const n = 6 + Math.floor(r(1) * 5);
      for (let i = 0; i < n; i++) px(ox + i * f, oy + (i > n / 2 ? 1 : 0), 0xf6e4b4, 0.35);
      for (let i = 0; i < n - 2; i++) px(ox + (i + 3) * f, oy + 4 + (i > n / 2 ? 1 : 0), 0xf6e4b4, 0.28);
    },
    // 작은 조약돌 2~3개 (어두운 몸, 위 밝은 점)
    (ox, oy, _f, r) => {
      const n = 2 + Math.floor(r(1) * 2);
      for (let i = 0; i < n; i++) {
        const x = ox + Math.floor(r(3 + i) * 9);
        const y = oy + Math.floor(r(6 + i) * 6);
        marks.fillStyle(0x9a7448, 0.55).fillRect(x, y, r(9 + i) < 0.5 ? 2 : 1, 1);
        px(x, y - 1, 0xfff0c8, 0.5);
      }
    },
    // 마른 풀 한 포기 (짧은 줄기 3~4개, 바깥으로 벌어짐)
    (ox, oy, _f, r) => {
      const n = 3 + Math.floor(r(1) * 2);
      for (let i = 0; i < n; i++) {
        const lean = i - (n - 1) / 2;
        const h = 3 + Math.floor(r(2 + i) * 3);
        for (let k = 0; k < h; k++) px(ox + Math.round(lean * (0.4 + k * 0.35)), oy - k, k === h - 1 ? 0xd8b070 : 0xa88450, 0.75);
      }
    },
    // 흩어진 모래알
    (ox, oy, _f, r) => {
      for (let i = 0; i < 4; i++) px(ox + Math.floor(r(2 + i) * 10), oy + Math.floor(r(7 + i) * 8), i % 2 ? 0xb08a58 : 0xf6e4b4, 0.45);
    },
  ];
  // 고르는 비율: 물결 줄이 가장 흔하고 마른 풀이 가장 드묾
  const WEIGHT = [0.34, 0.16, 0.2, 0.1, 0.2];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!sandy(base[y * W + x] ?? '') || wallAt(x, y)) continue;
      if (hash(x, y, 51) < 0.66) continue;
      let k = hash(x, y, 52);
      let kind = 0;
      while (kind < WEIGHT.length - 1 && k > WEIGHT[kind]) k -= WEIGHT[kind++];
      const f = hash(x, y, 53) < 0.5 ? -1 : 1;
      const ox = x * TS + 6 + Math.floor(hash(x, y, 55) * 20) + (f < 0 ? 12 : 0);
      const oy = y * TS + 6 + Math.floor(hash(x, y, 56) * 22);
      KINDS[kind](ox, oy, f, (n) => hash(x * 7 + n, y * 13 + n, 57));
    }

  // 물·용암 움직임
  const anim = new Map(Object.entries(info.anim ?? {}).map(([k, v]) => [gid(k), v.map(gid)]));
  const moving: { t: Phaser.Tilemaps.Tile; f: number[]; o: number }[] = [];
  const glow: [number, number][] = [];
  for (const layer of [floor, walls])
    layer.forEachTile((t) => {
      const f = anim.get(t.index);
      if (!f) return;
      const lava = /lava/.test(nameOf(t.index));
      moving.push({ t, f, o: lava ? (t.x + t.y) % 4 : 0 });
      if (lava && hash(t.x, t.y, 31) < 0.3) glow.push([t.pixelX + TS / 2, t.pixelY + TS / 2]);
    });
  if (moving.length) {
    let k = 0;
    const timer = scene.time.addEvent({
      delay: 260,
      loop: true,
      callback: () => {
        if (!floor.scene) return timer.remove();
        k++;
        for (const m of moving) m.t.index = m.f[(k + m.o) % m.f.length];
      },
    });
  }
  // 용암 둘레 빛 원
  for (const [x, y] of glow) {
    const e = scene.add.ellipse(x, y, 72, 56, 0xff7a30, 0.1).setDepth(-14.8).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: e, alpha: 0.18, duration: 700 + hash(x, y) * 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    out.push(e);
  }

  // 장식 소품
  const def = (decor as unknown as Record<string, { kinds: string[]; density: number; on?: string[] }>)[mapId];
  const kinds = (hd as { _decor?: { kinds: string[] } })._decor?.kinds ?? [];
  const md = MAPS[mapId];
  if (def && md && scene.textures.exists('decor')) {
    const avoid = objectsOf(md).map(footOf);
    const swaying: Phaser.GameObjects.Image[] = [];
    for (let y = 1; y < H; y++)
      for (let x = 0; x < W; x++) {
        const nm = base[y * W + x];
        if (!nm || wallAt(x, y) || wallAt(x, y - 1) || (def.on ? !def.on.includes(nm) : /road|path|carpet|bridge|cobble|stair|quay|edge|water|river|lava/.test(nm))) continue;
        // 몇 개씩 모여 있게: 5칸 단위로 정한 덩어리 세기(부드럽게 이어짐)에 따라 확률을 바꿈
        const cell = (cx: number, cy: number) => hash(cx, cy, 46);
        const fx = x / 5;
        const fy = y / 5;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const sx = fx - ix;
        const sy = fy - iy;
        const lerp = (a: number, b: number, t: number) => a + (b - a) * t * t * (3 - 2 * t);
        const field = lerp(lerp(cell(ix, iy), cell(ix + 1, iy), sx), lerp(cell(ix, iy + 1), cell(ix + 1, iy + 1), sx), sy);
        if (hash(x, y, 41) >= def.density * (0.15 + 2.6 * field * field)) continue;
        const px = x * TS + 2 + hash(x, y, 42) * 28;
        const py = y * TS + 6 + hash(x, y, 43) * 26;
        if (avoid.some((a) => Math.abs(a.x - px) < 28 && Math.abs(a.y - py) < 24)) continue;
        const kind = def.kinds[Math.floor(hash(x, y, 44) * def.kinds.length)];
        const ki = kinds.indexOf(kind);
        if (ki < 0) continue;
        const im = scene.add.image(Math.round(px), Math.round(py), 'decor', ki * 2).setOrigin(0.5, 1).setDepth(kind === 'cobweb' || kind === 'puddle' || kind === 'leaves' ? -17 : py - 6);
        if (hash(x, y, 45) < 0.5) im.setFlipX(true);
        lightUp?.(im);
        out.push(im);
        if (/tuft|flowers|shrub|puddle/.test(kind)) swaying.push(im);
      }
    if (swaying.length) {
      let k = 0;
      const timer = scene.time.addEvent({
        delay: 700,
        loop: true,
        callback: () => {
          if (!floor.scene) return timer.remove();
          k++;
          for (const [i, im] of swaying.entries()) if ((i + k) % 3 === 0) im.setFrame((Number(im.frame.name) ^ 1) as number);
        },
      });
    }
  }
  return out;
}

/** 물건 그림 하나 (아래 가운데가 발밑). 횃불·촛불은 움직인다 */
export function makePropSprite(scene: Phaser.Scene, o: TiledObj, dx = 0, dy = 0) {
  const f = footOf(o);
  const wall = !!propOf(o, 'wall');
  const s = scene.add.sprite(f.x + dx, f.y + dy, `ex_${o.name}`, 0).setOrigin(0.5, 1).setDepth(wall ? -5 : f.y + dy);
  if (scene.anims.exists(`ex_${o.name}`)) s.play({ key: `ex_${o.name}`, startFrame: Math.floor(Math.random() * 2) });
  return s;
}

/** 불빛을 내는 물건: 불꽃 위치와 세기 */
export const FLAMES: Record<string, { radius: number; intensity: number; top: number }> = {
  torch: { radius: 104, intensity: 1.35, top: 5 },
  torchpost: { radius: 100, intensity: 1.3, top: 5 },
  candle: { radius: 70, intensity: 1.1, top: 5 },
  campfire: { radius: 130, intensity: 1.5, top: 10 },
  torch_stand: { radius: 100, intensity: 1.3, top: 5 },
  forge_lit: { radius: 140, intensity: 1.5, top: 34 },
};

/**
 * 맵 바깥과 맵 안의 빈칸(바닥도 벽도 없는 칸)을 검정 대신 그 맵 바깥 테두리의 벽(없으면 바닥) 타일로 채움 (점검_피드백3 1-1).
 * 맵 데이터는 그대로, 그림만 아래 층에 깖. 테두리에서 가장 많이 쓰인 타일을 고름
 */
export function fillOutside(tm: Phaser.Tilemaps.Tilemap, ts: Phaser.Tilemaps.Tileset, floor: Phaser.Tilemaps.TilemapLayer, walls: Phaser.Tilemaps.TilemapLayer, pad = 20) {
  const W = tm.width;
  const H = tm.height;
  const pick = (layer: Phaser.Tilemaps.TilemapLayer) => {
    const n = new Map<number, number>();
    const add = (x: number, y: number) => {
      const i = layer.getTileAt(x, y)?.index ?? -1;
      if (i > 0) n.set(i, (n.get(i) ?? 0) + 1);
    };
    for (let x = 0; x < W; x++) (add(x, 0), add(x, H - 1));
    for (let y = 1; y < H - 1; y++) (add(0, y), add(W - 1, y));
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
  };
  let gid = pick(walls);
  if (gid < 0) gid = pick(floor);
  if (gid < 0) return null;
  const layer = tm.createBlankLayer('fill_outside', ts, -pad * TS, -pad * TS, W + pad * 2, H + pad * 2);
  if (!layer) return null;
  for (let y = 0; y < H + pad * 2; y++)
    for (let x = 0; x < W + pad * 2; x++) {
      const mx = x - pad;
      const my = y - pad;
      const inside = mx >= 0 && my >= 0 && mx < W && my < H;
      if (inside && ((floor.getTileAt(mx, my)?.index ?? -1) > 0 || (walls.getTileAt(mx, my)?.index ?? -1) > 0)) continue;
      layer.putTileAt(gid, x, y);
    }
  return layer.setDepth(-21);
}
