// 어떤 그림(art/*.txt의 [이름])을 어떤 PNG로 만들지 정하는 곳.
// 프레임 = 그림 이름, 또는 여러 그림을 겹친 { layers: [...] }
// layer 옵션: x, y(위치), flipX(좌우 반전), remap(색 바꾸기 { 원래글자: 새글자 })

// ---- 캐릭터: 몸(35줄) 아래에 다리(10줄)를 깔아 32x40 한 칸을 만든다 ----
const LEGS_Y = 30;

/** 서기, 걷기1~4. 걷기1·3(다리 벌림)에서 몸이 1픽셀 내려가 출렁인다 */
function walkRow(body, legs, extra = {}) {
  const f = (legArt, bodyY) => ({
    ...extra,
    layers: [
      { art: legArt, y: LEGS_Y },
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

// 근위병: 레온 그림을 색만 바꿔 씀 (머리 → 은색 투구, 남색 → 붉은 제복)
const GUARD_REMAP = {
  j: 'l', h: 'm', H: 'M', J: 'L',
  b: 'x', n: 'X', N: 'Z', B: 'Z',
};
const guardStand = (body, legs, flipX = false) => ({
  flipX,
  layers: [
    { art: `${legs}_stand`, y: LEGS_Y, remap: GUARD_REMAP },
    { art: body, y: 0, remap: GUARD_REMAP },
  ],
});

export const OUTPUTS = [
  {
    file: 'public/assets/tilesets/terrain.png',
    cell: [32, 32],
    columns: 6,
    // 순서 = 타일 번호(0부터). 바꾸면 tools/map/make-village.mjs 와 src/game/tiles.ts 도 맞출 것
    frames: [
      'grass1', 'grass2', 'grass_flower', 'dirt', 'stone_floor', 'water1',
      'water2', 'wall_top', 'wall_front', 'bush', 'fence',
    ],
  },
  {
    file: 'public/assets/sprites/leon.png',
    cell: [32, 40],
    columns: 5, // 행: 아래, 왼쪽, 오른쪽, 위 / 열: 서기, 걷기1~4
    frames: [
      ...walkRow('leon_body_down', 'leon_legs_front'),
      ...walkRow('leon_body_right', 'leon_legs_side', { flipX: true }),
      ...walkRow('leon_body_right', 'leon_legs_side'),
      ...walkRow('leon_body_up', 'leon_legs_front'),
    ],
  },
  {
    file: 'public/assets/sprites/guard.png',
    cell: [32, 40],
    columns: 4, // 아래, 왼쪽, 오른쪽, 위
    frames: [
      guardStand('leon_body_down', 'leon_legs_front'),
      guardStand('leon_body_right', 'leon_legs_side', true),
      guardStand('leon_body_right', 'leon_legs_side'),
      guardStand('leon_body_up', 'leon_legs_front'),
    ],
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
];
