import Phaser from 'phaser';
import sprites from '../data/battle/sprites.json';

/**
 * 전투 그림 불러오기. 목록은 src/data/battle/sprites.json (tools/pixel-art/gen-battle.mjs가 만듦)
 *   이펙트  fx_{이름}   → 애니메이션 키도 같음
 *   UI      ui_{이름}
 *   전투 동작 bt_{인물}  (48x48, 12열 x 4행)
 *   필드 걷기 {인물}     (32x40, 5열 x 8행)
 */
type Sheet = { file: string; w: number; h: number; frames?: number; rate?: number; loop?: boolean; columns?: number };
const FX = sprites.fx as Record<string, Sheet>;
const UI = sprites.ui as Record<string, Sheet>;
const CHARS = sprites.chars as Record<string, Sheet>;

/** 필드 걷기 시트 (전투에도 이동·점프 동작으로 씀) */
export const WALK_SPRITES = [
  'leon', 'serena', 'elysia', 'karg', 'adrian', 'galia', 'bram', 'marcion_hooded', 'mob_royal_knight', 'mob_gnosis',
  'leon_hood', 'mob_citizen', 'sewer_rat', 'sewer_leech', 'imperial_spear', 'imperial_archer', 'pursuit_sword', 'pursuit_shield',
  'mob_paladin', 'mob_wolf', 'ursha', 'wolf_scout', 'wolf_scout_tied', 'bandit_blade', 'bandit_archer', 'sand_crawler', 'desert_scorpion',
  'ignatius',
];

export const fxInfo = (key: string) => FX[key];
export const uiInfo = (key: string) => UI[key];

export function preloadBattle(scene: Phaser.Scene) {
  const load = (key: string, s: Sheet) => {
    if (!scene.textures.exists(key)) scene.load.spritesheet(key, s.file, { frameWidth: s.w, frameHeight: s.h });
  };
  for (const [k, s] of Object.entries(FX)) load(`fx_${k}`, s);
  for (const [k, s] of Object.entries(UI)) load(`ui_${k}`, s);
  for (const [k, s] of Object.entries(CHARS)) load(`bt_${k}`, s);
  for (const id of WALK_SPRITES) {
    if (!scene.textures.exists(id)) scene.load.spritesheet(id, `assets/sprites/${id}.png`, { frameWidth: 32, frameHeight: 40 });
  }
  if (!scene.textures.exists('terrain_tiles')) {
    scene.load.spritesheet('terrain_tiles', 'assets/tilesets/terrain.png', { frameWidth: 32, frameHeight: 32 });
  }
}

const DIRS = ['down', 'left', 'right', 'up'];

/** 애니메이션 등록 (한 번만) */
export function makeBattleAnims(scene: Phaser.Scene) {
  const a = scene.anims;
  for (const [k, s] of Object.entries(FX)) {
    const key = `fx_${k}`;
    if (a.exists(key)) continue;
    a.create({
      key,
      frames: a.generateFrameNumbers(key, { start: 0, end: (s.frames ?? 1) - 1 }),
      frameRate: s.rate ?? 12,
      repeat: s.loop ? -1 : 0,
    });
  }
  for (const id of WALK_SPRITES) {
    DIRS.forEach((dir, i) => {
      const walk = `${id}-walk-${dir}`;
      if (!a.exists(walk)) {
        a.create({ key: walk, frames: a.generateFrameNumbers(id, { frames: [i * 5 + 1, i * 5 + 2, i * 5 + 3, i * 5 + 4] }), frameRate: 8, repeat: -1 });
      }
      const jump = `${id}-jump-${dir}`;
      const j = 20 + i * 5;
      if (!a.exists(jump)) {
        a.create({ key: jump, frames: a.generateFrameNumbers(id, { frames: [j, j + 1, j + 2, j + 2, j + 1, j + 3, j + 4] }), frameRate: 12 });
      }
    });
  }
}
