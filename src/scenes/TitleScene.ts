import Phaser from 'phaser';
import { EXP_REWARD, gainExp, levelOf } from '../battle/progress';
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
    // 개발 중에만: 전투·갈래 시험 메뉴
    if (import.meta.env.DEV) items.push(['개발 시험', () => this.showDevMenu(), true]);
    this.menu = items.map(([label, fn, enabled], i) =>
      makeButton(this, W / 2, 320 + i * 70, label, fn, { w: 300, h: 54, fontSize: 24 }).setEnabled(enabled),
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

  /** 엔딩 목록: 본 엔딩은 이름과 "보상 받기", 못 본 엔딩은 ???와 힌트 한 줄 */
  private showEndings() {
    const list = allEndings();
    const seen = list.filter((e) => save.hasSeenEnding(e.id)).length;
    this.openPanel(`엔딩 목록 (${seen}/${list.length})`, (add) => {
      list.forEach((e, i) => {
        const y = 190 + i * 62;
        const got = save.hasSeenEnding(e.id);
        const color = e.type === 'dead' ? '#e05a5a' : e.type === 'bad' ? '#b88ae0' : '#e0c27a';
        add(this.add.text(180, y, e.label, { fontFamily: FONT, fontSize: '20px', color: got ? color : '#555555' }).setOrigin(0, 0.5));
        add(
          this.add
            .text(320, y - (got ? 0 : 10), got ? e.title : '???', { fontFamily: FONT, fontSize: '21px', color: got ? '#ffffff' : '#666666' })
            .setOrigin(0, 0.5),
        );
        if (!got) {
          add(this.add.text(320, y + 14, e.hint ?? '', { fontFamily: FONT, fontSize: '15px', color: '#8a8a8a' }).setOrigin(0, 0.5));
          return;
        }
        const claimed = save.hasReward(e.id);
        add(
          makeButton(this, W - 230, y, claimed ? '다시 보기' : '보상 받기', () => this.openReward(e.id), {
            w: 130, h: 40, fontSize: 17, depth: 0, fill: claimed ? [0x1d1a2c, 0x3d3560] : [0x4a3a10, 0x6a5420],
          }),
        );
      });
    });
  }

  /** 엔딩 보상: 경험치(배드·데드만, 한 번), 일러스트(없으면 임시 화면), 짧은 후일담(없으면 빈칸) */
  private openReward(id: string) {
    const e = allEndings().find((x) => x.id === id);
    if (!e) return;
    const exp = e.type === 'dead' || e.type === 'bad' ? EXP_REWARD.ending(id) : 0;
    let note = '';
    const first = !save.hasReward(id);
    if (first) {
      save.claimReward(id, (cp) => {
        if (!exp) return;
        cp.progress ??= { exp: {}, stage: 'start', once: [] };
        // 최신 저장의 파티(경험치 기록이 있는 인물, 없으면 레온)가 같은 양을 받는다
        const ids = Object.keys(cp.progress.exp).length ? Object.keys(cp.progress.exp) : ['leon'];
        const ups = gainExp(ids, exp, cp.progress);
        note = `경험치 +${exp} (최신 저장에 반영)` + (ups.length ? `  ·  레온 Lv ${levelOf('leon', cp.progress)}` : '');
      });
      if (exp && !save.checkpoint) note = `경험치 +${exp} (저장이 없어 반영할 곳이 없습니다)`;
    } else note = exp ? `경험치 ${exp}은(는) 이미 받았습니다` : '';
    if (!exp) note ||= '트루·히든엔딩은 일러스트와 후일담만 열립니다';

    this.openPanel(`${e.label}: ${e.title}`, (add) => {
      // 일러스트 (아직 없으면 임시 화면)
      add(this.add.rectangle(W / 2, 290, 520, 220, 0x221a26).setStrokeStyle(2, 0x6a5a7a));
      add(this.add.text(W / 2, 290, '엔딩 일러스트\n(준비 중)', { fontFamily: FONT, fontSize: '20px', color: '#776a86', align: 'center' }).setOrigin(0.5));
      add(
        this.add
          .text(W / 2, 430, e.epilogue ?? '', { fontFamily: FONT, fontSize: '18px', color: '#dddddd', align: 'center', wordWrap: { width: 560, useAdvancedWrap: true } })
          .setOrigin(0.5, 0),
      );
      add(this.add.text(W / 2, 520, note, { fontFamily: FONT, fontSize: '18px', color: first && exp ? '#e0c27a' : '#999999' }).setOrigin(0.5));
    });
    // 닫으면 엔딩 목록으로
    this.input.keyboard!.removeAllListeners('keydown-ESC');
    this.input.keyboard!.once('keydown-ESC', () => this.closePanel());
    const panel = this.panel;
    panel?.once('destroy', () => this.time.delayedCall(0, () => !this.panel && this.showEndings()));
  }

  // ---------- 개발 시험 (npm run dev 일 때만) ----------

  private showDevMenu() {
    const pro = stories[FIRST_STORY];
    const at = (scene: string, find: (n: object) => boolean, back = 0) => {
      const sc = pro?.scenes.find((x) => x.id === scene);
      return Math.max(0, (sc?.nodes.findIndex(find) ?? 0) - back);
    };
    const start = (data: StoryStartData, setup?: () => void) => {
      gameState.reset();
      setup?.();
      this.go(data);
    };
    const rows: [string, () => void][] = [
      ['갈래 전투 시험 장면', () => start({ story: 'dev_test' })],
      ['장면 1 회랑 순찰 (이동 튜토리얼)', () => start({ story: FIRST_STORY, scene: 'scene1', node: at('scene1', (n) => 'explore' in n) })],
      ['장면 3 침소 회랑 · 장면 4 침소', () => start({ story: FIRST_STORY, scene: 'scene3', node: at('scene3', (n) => 'explore' in n) })],
      ['해자 (창으로 뛰어내린 뒤)', () => start({ story: FIRST_STORY, scene: 'choice_window', node: at('choice_window', (n) => 'place' in n) })],
      ['장면 2 전투 (하수인들)', () => start({ story: FIRST_STORY, scene: 'scene2', node: at('scene2', (n) => 'battle' in n) })],
      ['장면 3 전투 (침입자)', () => start({ story: FIRST_STORY, scene: 'scene3', node: at('scene3', (n) => 'battle' in n) })],
      ['검을 뽑는다 (체력 0 연출)', () => start({ story: FIRST_STORY, scene: 'choice_draw', node: at('choice_draw', (n) => 'hpZero' in n, 2) })],
      ['장면 2 전투, 5레벨 (아이콘 확인)', () => start({ story: FIRST_STORY, scene: 'scene2', node: at('scene2', (n) => 'battle' in n) }, () => {
        gameState.progress.stage = 'prologue';
        gameState.progress.exp.leon = 700;
      })],
    ];
    this.openPanel('개발 시험', (add) => {
      rows.forEach(([label, fn], i) => add(makeButton(this, W / 2, 180 + i * 46, label, fn, { w: 420, h: 42, fontSize: 18, depth: 0 })));
      add(
        this.add
          .text(W / 2, 548, '전투 중: F6 적 전멸 · F7 브람 쓰러뜨리기 · F8 시간 끝 · F9 파티 전멸', { fontFamily: FONT, fontSize: '15px', color: '#888888' })
          .setOrigin(0.5),
      );
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
