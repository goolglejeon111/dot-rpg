import Phaser from 'phaser';
import { chapters, endings } from '../game/data';
import { gameState } from '../game/GameState';

export interface TitleCardData {
  kind: 'ending' | 'chapter';
  id: string;
  returnTo: string;
}

const FONT = "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
const COLORS: Record<string, string> = {
  dead: '#d04848',
  bad: '#9b6ad6',
  true: '#f3e7c4',
  hidden: '#7fd6c8',
  chapter: '#e0c27a',
};

/** 엔딩, 막 전환 임시 화면 */
export class TitleCardScene extends Phaser.Scene {
  private info!: TitleCardData;
  private leaving = false;

  constructor() {
    super('TitleCard');
  }

  init(data: TitleCardData) {
    this.info = data;
    this.leaving = false;
  }

  create() {
    const { width: W, height: H } = this.scale;
    const def = this.info.kind === 'ending' ? endings[this.info.id] : chapters[this.info.id];
    const title = def?.title ?? `(데이터 없음: ${this.info.id})`;
    const color = this.info.kind === 'chapter' ? COLORS.chapter : COLORS[def?.type ?? 'bad'];

    this.cameras.main.setBackgroundColor('#000000');
    this.add
      .text(W / 2, H / 2 - 90, title, { fontFamily: FONT, fontSize: '56px', color, fontStyle: 'bold' })
      .setOrigin(0.5);
    if (def?.subtitle) {
      this.add
        .text(W / 2, H / 2 - 25, def.subtitle, { fontFamily: FONT, fontSize: '26px', color: '#bbbbbb' })
        .setOrigin(0.5);
    }
    if (def?.text) {
      this.add
        .text(W / 2, H / 2 + 60, def.text, {
          fontFamily: FONT,
          fontSize: '22px',
          color: '#dddddd',
          align: 'center',
          lineSpacing: 10,
        })
        .setOrigin(0.5);
    }
    const hint = this.add
      .text(W / 2, H - 70, '클릭 또는 스페이스: 필드로 돌아가기', { fontFamily: FONT, fontSize: '18px', color: '#888888' })
      .setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.3, duration: 800, yoyo: true, repeat: -1 });

    this.cameras.main.fadeIn(600, 0, 0, 0);
    // 직전 클릭이 바로 넘기지 않도록 잠깐 기다린다
    this.time.delayedCall(500, () => {
      this.input.once('pointerdown', () => this.leave());
      this.input.keyboard!.once('keydown-SPACE', () => this.leave());
      this.input.keyboard!.once('keydown-ENTER', () => this.leave());
    });
  }

  private leave() {
    if (this.leaving) return;
    this.leaving = true;
    // 배드/데드엔딩이면 상태를 처음으로 되돌린다 (임시)
    if (this.info.kind === 'ending') gameState.reset();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(this.info.returnTo);
    });
  }
}
