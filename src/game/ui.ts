import Phaser from 'phaser';

export const FONT = "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
export const GOLD = 0xcdb88a;

export interface ButtonOptions {
  w: number;
  h: number;
  fontSize?: number;
  /** 바탕색 (평소, 마우스 올렸을 때) */
  fill?: [number, number];
  stroke?: number;
  depth?: number;
}

export type Button = Phaser.GameObjects.Container & {
  setLabel(text: string): Button;
  setOn(on: boolean): Button;
  setEnabled(on: boolean): Button;
};

/** 둥근 사각형 글자 버튼. 누르면 아래(장면 전체 클릭)로 전달되지 않는다 */
export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  o: ButtonOptions,
): Button {
  const [fill, hoverFill] = o.fill ?? [0x1d1a2c, 0x3d3560];
  const stroke = o.stroke ?? GOLD;
  const bg = scene.add.graphics();
  let hover = false;
  let on = false;
  let enabled = true;
  const draw = () => {
    bg.clear();
    bg.fillStyle(on ? 0x5a4a20 : hover && enabled ? hoverFill : fill, 0.95);
    bg.fillRoundedRect(-o.w / 2, -o.h / 2, o.w, o.h, Math.min(10, o.h / 3));
    bg.lineStyle(2, hover && enabled ? 0xf3e7c4 : stroke, enabled ? 1 : 0.35);
    bg.strokeRoundedRect(-o.w / 2, -o.h / 2, o.w, o.h, Math.min(10, o.h / 3));
  };
  draw();
  const text = scene.add
    .text(0, 0, label, { fontFamily: FONT, fontSize: `${o.fontSize ?? 22}px`, color: '#ffffff' })
    .setOrigin(0.5);
  const btn = scene.add.container(x, y, [bg, text]) as Button;
  btn.setSize(o.w, o.h).setDepth(o.depth ?? 10).setInteractive({ useHandCursor: true });
  btn.on('pointerover', () => ((hover = true), draw()));
  btn.on('pointerout', () => ((hover = false), draw()));
  btn.on('pointerdown', (_p: unknown, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
    e.stopPropagation();
    if (enabled) onClick();
  });
  btn.setLabel = (t: string) => (text.setText(t), btn);
  btn.setOn = (v: boolean) => ((on = v), draw(), btn);
  btn.setEnabled = (v: boolean) => {
    enabled = v;
    text.setAlpha(v ? 1 : 0.4);
    draw();
    return btn;
  };
  return btn;
}

/** 저장해 둔 색 문자열(#rrggbb) → 숫자 */
export const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;
