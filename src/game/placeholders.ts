import Phaser from 'phaser';

export const PORTRAIT_W = 300;
export const PORTRAIT_H = 520;

const HEAD_X = PORTRAIT_W / 2;
const HEAD_Y = 120;

/** 인물마다 조금씩 다른 회색 */
function grayFor(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const v = 0x78 + (h % 0x30);
  return (v << 16) | (v << 8) | v;
}

/** 몸 실루엣 임시 그림 */
export function makeBodyPlaceholder(scene: Phaser.Scene, key: string, id: string) {
  const g = scene.make.graphics({}, false);
  const c = grayFor(id);
  g.fillStyle(c, 1);
  g.fillCircle(HEAD_X, HEAD_Y, 66); // 머리
  g.fillRect(HEAD_X - 24, HEAD_Y + 50, 48, 50); // 목
  g.fillRoundedRect(HEAD_X - 120, HEAD_Y + 90, 240, PORTRAIT_H - HEAD_Y - 90, 60); // 몸통
  g.lineStyle(3, 0x4a4a4a, 1);
  g.strokeCircle(HEAD_X, HEAD_Y, 66);
  g.strokeRoundedRect(HEAD_X - 120, HEAD_Y + 90, 240, PORTRAIT_H - HEAD_Y - 90, 60);
  g.generateTexture(key, PORTRAIT_W, PORTRAIT_H);
  g.destroy();
}
