import Phaser from 'phaser';
import type { Expression } from './types';

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

/** 표정 임시 그림 (몸과 같은 크기, 투명 배경) */
export function makeFacePlaceholder(scene: Phaser.Scene, key: string, expr: Expression) {
  const g = scene.make.graphics({}, false);
  const ink = 0x2b2b2b;
  const ex = 24; // 눈 간격
  const ey = HEAD_Y - 6;
  const my = HEAD_Y + 30;
  g.lineStyle(5, ink, 1);
  g.fillStyle(ink, 1);

  const brows = (tilt: number) => {
    g.lineBetween(HEAD_X - ex - 14, ey - 22 - tilt, HEAD_X - ex + 12, ey - 22 + tilt);
    g.lineBetween(HEAD_X + ex - 12, ey - 22 + tilt, HEAD_X + ex + 14, ey - 22 - tilt);
  };
  const arc = (x: number, y: number, r: number, from: number, to: number) => {
    g.beginPath();
    g.arc(x, y, r, Phaser.Math.DegToRad(from), Phaser.Math.DegToRad(to));
    g.strokePath();
  };

  switch (expr) {
    case 'normal':
      g.fillCircle(HEAD_X - ex, ey, 6);
      g.fillCircle(HEAD_X + ex, ey, 6);
      g.lineBetween(HEAD_X - 14, my, HEAD_X + 14, my);
      break;
    case 'smile':
      arc(HEAD_X - ex, ey + 4, 9, 200, 340);
      arc(HEAD_X + ex, ey + 4, 9, 200, 340);
      arc(HEAD_X, my - 12, 18, 30, 150);
      break;
    case 'angry':
      brows(7);
      g.fillCircle(HEAD_X - ex, ey, 6);
      g.fillCircle(HEAD_X + ex, ey, 6);
      arc(HEAD_X, my + 14, 16, 220, 320);
      break;
    case 'sad':
      brows(-7);
      g.fillCircle(HEAD_X - ex, ey + 2, 5);
      g.fillCircle(HEAD_X + ex, ey + 2, 5);
      arc(HEAD_X, my + 14, 14, 215, 325);
      break;
    case 'surprised':
      g.strokeCircle(HEAD_X - ex, ey, 10);
      g.strokeCircle(HEAD_X + ex, ey, 10);
      g.strokeCircle(HEAD_X, my + 4, 9);
      break;
  }
  g.generateTexture(key, PORTRAIT_W, PORTRAIT_H);
  g.destroy();
}
