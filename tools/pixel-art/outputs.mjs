// 어떤 그림(art/*.txt의 [이름])을 어떤 PNG로 만들지 정하는 곳.
// 프레임 = 그림 이름, 또는 여러 그림을 겹친 { layers: [...] }
// layer 옵션: x, y(위치), flipX(좌우 반전), remap(색 바꾸기 { 원래글자: 새글자 })
import { SHORE_MASKS, shoreName } from './shore.mjs';
import { CHARS } from './gen-characters.mjs';
import { existsSync, readFileSync } from 'node:fs';

// 전투 그림 목록(gen-battle.mjs가 만듦)
const BATTLE_JSON = new URL('./battle-outputs.json', import.meta.url);
const BATTLE_OUTPUTS = existsSync(BATTLE_JSON) ? JSON.parse(readFileSync(BATTLE_JSON, 'utf8')) : [];
// 황궁 이동 맵 그림 목록(gen-palace.mjs가 만듦)
const PALACE_JSON = new URL('./palace-outputs.json', import.meta.url);
const PALACE_OUTPUTS = existsSync(PALACE_JSON) ? JSON.parse(readFileSync(PALACE_JSON, 'utf8')) : [];

// ---- 캐릭터: 몸(35줄) 아래에 다리(10줄)를 깔아 32x40 한 칸을 만든다 ----
const LEGS_Y = 30;

/** 서기, 걷기1~4. 걷기1·3(다리 벌림)에서 몸이 1픽셀 내려가 출렁인다. remap: 다리 색 바꾸기 */
function walkRow(body, legs, extra = {}, remap) {
  const f = (legArt, bodyY) => ({
    ...extra,
    layers: [
      { art: legArt, y: LEGS_Y, remap },
      { art: body, y: bodyY },
    ],
  });
  return [
    f(`${legs}_stand`, 0),
    f(`${legs}_walk1`, 1),
    f(`${legs}_stand`, 0),
    f(`${legs}_walk3`, 1),
    f(`${legs}_stand`, 0),
  ];
}

/**
 * 점프 5칸: 웅크림(몸 2픽셀 내려감), 뛰어오름(발 3픽셀 당김), 꼭대기(발 4픽셀), 착지 웅크림, 서기.
 * 높이(공중에 뜨는 정도)는 게임 코드가 스프라이트를 올려서 만들고, 그림자는 땅에 남긴다.
 */
function jumpRow(body, legs, extra = {}, remap) {
  const f = (legY, bodyY) => ({
    ...extra,
    layers: [
      { art: `${legs}_stand`, y: legY, remap },
      { art: body, y: bodyY },
    ],
  });
  return [f(LEGS_Y, 2), f(LEGS_Y - 3, 0), f(LEGS_Y - 4, 0), f(LEGS_Y, 2), f(LEGS_Y, 0)];
}

/** 걷기 4행 + 점프 4행 (아래, 왼쪽, 오른쪽, 위) */
function fullSheet(b, remap) {
  return [
    ...walkRow(b('down'), 'leon_legs_front', {}, remap),
    ...walkRow(b('right'), 'leon_legs_side', { flipX: true }, remap),
    ...walkRow(b('right'), 'leon_legs_side', {}, remap),
    ...walkRow(b('up'), 'leon_legs_front', {}, remap),
    ...jumpRow(b('down'), 'leon_legs_front', {}, remap),
    ...jumpRow(b('right'), 'leon_legs_side', { flipX: true }, remap),
    ...jumpRow(b('right'), 'leon_legs_side', {}, remap),
    ...jumpRow(b('up'), 'leon_legs_front', {}, remap),
  ];
}

/** 서 있기 한 칸 */
const stand = (body, legs, remap, flipX = false) => ({
  flipX,
  layers: [
    { art: `${legs}_stand`, y: LEGS_Y, remap },
    { art: body, y: 0 },
  ],
});

/**
 * 인물 시트: 5열 x 8행. 파티원·NPC·모브 모두 같은 모양
 *   0~3행: 걷기(서기, 걷기1~4) 아래, 왼쪽, 오른쪽, 위
 *   4~7행: 점프(웅크림, 뛰어오름, 꼭대기, 착지, 서기) 같은 방향 순서
 */
function characterSheet(c) {
  const b = (v) => `${c.id}_body_${v}`;
  const remap = Object.keys(c.legs ?? {}).length ? c.legs : undefined;
  return {
    file: `public/assets/sprites/${c.id}.png`,
    cell: [32, 40],
    columns: 5,
    frames: fullSheet(b, remap),
  };
}

/** 확인용: 서 있는 4방향 */
function standRow(c) {
  const b = (v) => `${c.id}_body_${v}`;
  const remap = Object.keys(c.legs ?? {}).length ? c.legs : undefined;
  return [
    stand(b('down'), 'leon_legs_front', remap),
    stand(b('right'), 'leon_legs_side', remap, true),
    stand(b('right'), 'leon_legs_side', remap),
    stand(b('up'), 'leon_legs_front', remap),
  ];
}

// 확인용 한 장: 인물마다 한 줄씩 (아래, 왼쪽, 오른쪽, 위), 발밑 그림자 포함
const LEON = { id: 'leon', legs: {} };
const ALL = [LEON, { id: 'leon_hood', legs: {} }, { id: 'leon_blade', legs: {} }, ...CHARS];
const withShadow = (f) => ({ ...f, layers: [{ art: 'shadow', x: 6, y: 34 }, ...f.layers] });
const PREVIEW_FRAMES = ALL.flatMap(standRow).map(withShadow);

// 새 도트(gen-hd.mjs, 32x48)로 바꾼 인물은 여기서 만들지 않는다 (덮어쓰지 않게)
const HD_JSON = new URL('../../src/data/explore/hd_sprites.json', import.meta.url);
const HD_LIST = existsSync(HD_JSON) ? JSON.parse(readFileSync(HD_JSON, 'utf8')) : {};
const HD = Object.keys(HD_LIST).filter((k) => !k.startsWith('_'));
// _files: gen-hd.mjs가 새로 그린 물건 그림
const HD_FILES = new Set([...HD.flatMap((id) => [`public/assets/sprites/${id}.png`, `public/assets/battle/chars/${id}.png`]), ...(HD_LIST._files ?? [])]);

const ALL_OUTPUTS = [
  {
    file: 'public/assets/tilesets/terrain.png',
    cell: [32, 32],
    columns: 8,
    // 순서 = 타일 번호(0부터). 바꾸면 tools/map/make-village.mjs 도 맞출 것
    // 11번부터는 물가 둑 타일 (shore.mjs 순서)
    frames: [
      'grass1', 'grass2', 'grass_flower', 'dirt', 'stone_floor', 'water1',
      'water2', 'wall_top', 'wall_front', 'bush', 'fence',
      ...SHORE_MASKS.map(shoreName),
    ],
  },
  {
    file: 'public/assets/sprites/leon.png',
    cell: [32, 40],
    columns: 5, // characterSheet와 같은 배치 (걷기 4행 + 점프 4행)
    frames: fullSheet((v) => `leon_body_${v}`),
  },
  {
    file: 'public/assets/sprites/leon_hood.png', // 1막 갈색 두건 망토
    cell: [32, 40],
    columns: 5,
    frames: fullSheet((v) => `leon_hood_body_${v}`),
  },
  {
    file: 'public/assets/sprites/leon_blade.png', // 4막 각인 무기
    cell: [32, 40],
    columns: 5,
    frames: fullSheet((v) => `leon_blade_body_${v}`),
  },
  ...CHARS.map(characterSheet),
  // 확인용: 모든 인물을 한 장에 (4방향씩 가로로 두 묶음), 풀밭 배경, 3배 확대
  {
    file: 'tools/pixel-art/preview.png',
    cell: [32, 40],
    columns: 8,
    frames: PREVIEW_FRAMES,
    background: 'g',
    scale: 3,
  },
  {
    file: 'public/assets/sprites/tree.png',
    cell: [64, 64],
    frames: [{ layers: [{ art: 'tree_trunk' }, { art: 'tree_leaves' }] }],
  },
  { file: 'public/assets/sprites/house.png', cell: [96, 96], frames: ['house'] },
  { file: 'public/assets/sprites/crate.png', cell: [32, 32], frames: ['crate'] },
  { file: 'public/assets/sprites/sign.png', cell: [32, 32], frames: ['sign'] },
  { file: 'public/assets/sprites/shadow.png', cell: [20, 6], frames: ['shadow'] },
  { file: 'public/assets/sprites/shadow_large.png', cell: [44, 12], frames: ['shadow_large'] },
  { file: 'public/assets/sprites/talk_icon.png', cell: [12, 12], frames: ['talk_icon'] },
  ...BATTLE_OUTPUTS,
  ...PALACE_OUTPUTS,
];
export const OUTPUTS = ALL_OUTPUTS.filter((o) => !HD_FILES.has(o.file));
