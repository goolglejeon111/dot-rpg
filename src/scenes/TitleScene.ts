import Phaser from 'phaser';
import { allEndings, FIRST_STORY, stories } from '../game/data';
import { gameState } from '../game/GameState';
import { AUTO_SPEEDS, save, TEXT_SPEEDS } from '../game/save';
import { FONT, makeButton, type Button } from '../game/ui';
import type { StoryStartData } from './StoryScene';

const W = 960;
const H = 720;

/** 타이틀: 새 게임, 이어하기, 엔딩 목록, 설정 */
export class TitleScene extends Phaser.Scene {
  private menu: Button[] = [];
  private panel?: Phaser.GameObjects.Container;

  constructor() {
    super('Title');
  }

  create() {
    this.panel = undefined;
    this.cameras.main.setBackgroundColor('#07070c');
    this.cameras.main.fadeIn(400, 0, 0, 0);

    this.add
      .text(W / 2, 170, '대륙전기', {
        fontFamily: FONT,
        fontSize: '44px',
        color: '#e0c27a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(0, 4, '#000000', 10);
    this.add
      .text(W / 2, 228, '(임시 타이틀 화면)', { fontFamily: FONT, fontSize: '17px', color: '#666666' })
      .setOrigin(0.5);

    const cp = save.checkpoint;
    const items: [string, () => void, boolean][] = [
      ['새 게임', () => this.newGame(), true],
      ['이어하기', () => this.continueGame(), !!cp && !!stories[cp.story]],
      ['엔딩 목록', () => this.showEndings(), true],
      ['설정', () => this.showSettings(), true],
    ];
    this.menu = items.map(([label, fn, enabled], i) =>
      makeButton(this, W / 2, 340 + i * 74, label, fn, { w: 300, h: 56, fontSize: 24 }).setEnabled(enabled),
    );
    this.add
      .text(W / 2, H - 40, '진행: 클릭 · 스페이스 · Z   /   로그 L · 자동 A · 스킵 S', {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#777777',
      })
      .setOrigin(0.5);
  }

  private go(data: StoryStartData) {
    this.input.enabled = false;
    this.cameras.main.fadeOut(350, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Story', data));
  }

  private newGame() {
    gameState.reset();
    this.go({ story: FIRST_STORY });
  }

  /** 마지막으로 본 장면부터 */
  private continueGame() {
    const cp = save.checkpoint;
    if (!cp) return;
    gameState.restore(cp);
    this.go({ story: cp.story, scene: cp.scene, node: cp.node, finished: cp.finished });
  }

  // ---------- 작은 창 (엔딩 목록, 설정) ----------

  private openPanel(title: string, build: (add: (o: Phaser.GameObjects.GameObject) => void) => void) {
    this.panel?.destroy();
    this.menu.forEach((b) => b.setVisible(false));
    const shade = this.add.rectangle(0, 0, W, H, 0x000000, 0.75).setOrigin(0).setInteractive();
    const box = this.add.graphics();
    box.fillStyle(0x14121e, 0.98);
    box.fillRoundedRect(140, 90, W - 280, H - 180, 14);
    box.lineStyle(3, 0xcdb88a, 1);
    box.strokeRoundedRect(140, 90, W - 280, H - 180, 14);
    const head = this.add.text(W / 2, 130, title, { fontFamily: FONT, fontSize: '30px', color: '#e0c27a' }).setOrigin(0.5);
    const parts: Phaser.GameObjects.GameObject[] = [shade, box, head];
    build((o) => parts.push(o));
    parts.push(makeButton(this, W / 2, H - 140, '닫기', () => this.closePanel(), { w: 200, h: 48, fontSize: 21, depth: 0 }));
    this.panel = this.add.container(0, 0, parts).setDepth(50);
    this.input.keyboard!.once('keydown-ESC', () => this.closePanel());
  }

  private closePanel() {
    this.panel?.destroy();
    this.panel = undefined;
    this.menu.forEach((b) => b.setVisible(true));
  }

  private showEndings() {
    const list = allEndings();
    const seen = list.filter((e) => save.hasSeenEnding(e.id)).length;
    this.openPanel(`엔딩 목록 (${seen}/${list.length})`, (add) => {
      list.forEach((e, i) => {
        const got = save.hasSeenEnding(e.id);
        const color = e.type === 'dead' ? '#e05a5a' : e.type === 'bad' ? '#b88ae0' : '#e0c27a';
        add(
          this.add
            .text(200, 190 + i * 46, `${e.label}`, { fontFamily: FONT, fontSize: '22px', color: got ? color : '#555555' })
            .setOrigin(0, 0.5),
        );
        add(
          this.add
            .text(360, 190 + i * 46, got ? e.title : '???', { fontFamily: FONT, fontSize: '22px', color: got ? '#ffffff' : '#666666' })
            .setOrigin(0, 0.5),
        );
      });
    });
  }

  private showSettings() {
    this.openPanel('설정', (add) => {
      const row = (y: number, label: string, opts: { label: string; value: number }[], key: 'textDelay' | 'autoDelay') => {
        add(this.add.text(200, y, label, { fontFamily: FONT, fontSize: '22px', color: '#dddddd' }).setOrigin(0, 0.5));
        const btns: Button[] = [];
        const refresh = () => btns.forEach((b, i) => b.setOn(save.settings[key] === opts[i].value));
        opts.forEach((o, i) => {
          const b = makeButton(this, 440 + i * 100, y, o.label, () => {
            save.setSettings({ [key]: o.value });
            refresh();
          }, { w: 90, h: 42, fontSize: 18, depth: 0 });
          btns.push(b);
          add(b);
        });
        refresh();
      };
      row(220, '글자 속도', TEXT_SPEEDS, 'textDelay');
      row(300, '자동 진행 속도', AUTO_SPEEDS, 'autoDelay');
      add(
        this.add
          .text(W / 2, 400, '설정은 이 브라우저에 저장됩니다.', { fontFamily: FONT, fontSize: '17px', color: '#777777' })
          .setOrigin(0.5),
      );
    });
  }
}
