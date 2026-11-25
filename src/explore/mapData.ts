import Phaser from 'phaser';
import sprites from '../data/explore/sprites.json';

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
};
