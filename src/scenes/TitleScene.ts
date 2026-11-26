import Phaser from 'phaser';
import { addGuest, EXP_REWARD, gainExp, joinParty, leaveParty, levelOf, unlock, type Unlock } from '../battle/progress';
import expData from '../data/exp.json';
import { allEndings, FIRST_STORY, stories } from '../game/data';
import { freshProgress, gameState } from '../game/GameState';
import { AUTO_SPEEDS, save, TEXT_SPEEDS } from '../game/save';
import { FONT, makeButton, type Button } from '../game/ui';
import { openLookLog } from '../game/lookLog';
import { CG_LIST, cgKey, loadCgs } from '../game/cg';
import { containFit, coverFit, endingKey, loadEndingArt } from '../game/assets';
import type { StoryStartData } from './StoryScene';
import stageData from '../data/explore/stage.json';

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
      ['CG 회상', () => void this.showCgs(), true],
      ['조사 기록', () => this.showLooks(), true],
      ['설정', () => this.showSettings(), true],
    ];
    // 개발 중에만: 전투·갈래 시험 메뉴
    if (import.meta.env.DEV) items.push(['개발 시험', () => this.showDevMenu(), true]);
    this.menu = items.map(([label, fn, enabled], i) =>
      makeButton(this, W / 2, 290 + i * (items.length > 6 ? 54 : 62), label, fn, { w: 300, h: 46, fontSize: 23 }).setEnabled(enabled),
    );
    this.add
      .text(W / 2, H - 40, '진행: 클릭 · 스페이스 · Z   /   로그 L · 자동 A · 스킵 S · 뒤로 Backspace · 선택지 C · 조사 J', {
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
    // 이 막을 다 봤고 다음 막 이야기가 있으면 그 막 처음부터
    if (cp.finished) {
      const next = Object.keys(stories[cp.story]?.chapters ?? {})[0];
      if (next && stories[next]) return this.go({ story: next });
    }
    this.go({ story: cp.story, scene: cp.scene, node: cp.node, finished: cp.finished });
  }

  /** 조사 기록: 한 번이라도 조사한 물건과 수집률 (다시 걷기 없음) */
  private showLooks() {
    if (this.panel) return;
    this.menu.forEach((b) => b.setVisible(false));
    const wheel = (_p: unknown, _o: unknown, _dx: number, dy: number) => v.scroll(dy);
    const v = openLookLog(this, {
      title: true,
      depth: 50,
      onClose: () => {
        this.input.off('wheel', wheel);
        this.menu.forEach((m) => m.setVisible(true));
      },
    });
    this.input.on('wheel', wheel);
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

  /** CG 회상: 한 번 본 이벤트 CG는 작은 그림, 못 본 것은 ?. 누르면 크게 */
  private async showCgs() {
    await loadCgs(this, CG_LIST.filter((c) => save.hasCg(c.id)).map((c) => c.id));
    const seen = CG_LIST.filter((c) => save.hasCg(c.id)).length;
    this.openPanel(`CG 회상 (${seen}/${CG_LIST.length})`, (add) => {
      // 4:3 작은 그림을 한 줄에 넷씩
      const TW = 148;
      const TH = 111;
      const GAP = 16;
      CG_LIST.forEach((c, i) => {
        const x = W / 2 - (4 * TW + 3 * GAP) / 2 + TW / 2 + (i % 4) * (TW + GAP);
        const y = 250 + Math.floor(i / 4) * 170;
        const got = save.hasCg(c.id) && this.textures.exists(cgKey(c.id));
        const frame = this.add.rectangle(x, y, TW + 6, TH + 6, 0x0c0a14).setStrokeStyle(2, got ? 0xcdb88a : 0x444444);
        add(frame);
        if (got) {
          const img = this.add.image(x, y, cgKey(c.id));
          img.setScale(Math.min(TW / img.width, TH / img.height));
          add(img);
          frame.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.viewCg(c.id));
        } else add(this.add.text(x, y, '?', { fontFamily: FONT, fontSize: '32px', color: '#555555' }).setOrigin(0.5));
        add(
          this.add
            .text(x, y + TH / 2 + 10, got ? c.title : '?', { fontFamily: FONT, fontSize: '14px', color: got ? '#dddddd' : '#666666', align: 'center', wordWrap: { width: TW + 10, useAdvancedWrap: true } })
            .setOrigin(0.5, 0),
        );
      });
    });
  }

  /** CG 한 장을 화면 가득 */
  private viewCg(id: string) {
    this.viewImage(cgKey(id));
  }

  /** 그림 한 장을 화면 가득. 한 번 더 누르거나 ESC로 닫힘 (ESC가 뒤의 창까지 닫지 않게) */
  private viewImage(key: string) {
    const kb = this.input.keyboard!;
    kb.removeAllListeners('keydown-ESC');
    const back = this.add.rectangle(0, 0, W, H, 0x000000, 1).setOrigin(0).setDepth(60).setInteractive();
    const img = coverFit(this.add.image(0, 0, key), W, H).setDepth(61);
    const close = () => {
      if (!back.active) return;
      back.destroy();
      img.destroy();
      kb.removeAllListeners('keydown-ESC');
      kb.once('keydown-ESC', () => this.closePanel());
    };
    back.once('pointerdown', close);
    kb.once('keydown-ESC', close);
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
          makeButton(this, W - 230, y, claimed ? '다시 보기' : '보상 받기', () => void this.openReward(e.id), {
            w: 130, h: 40, fontSize: 17, depth: 0, fill: claimed ? [0x1d1a2c, 0x3d3560] : [0x4a3a10, 0x6a5420],
          }),
        );
      });
    });
  }

  /** 엔딩 보상: 경험치(배드·데드만, 한 번), 일러스트(없으면 임시 화면), 짧은 후일담(없으면 빈칸) */
  private async openReward(id: string) {
    const e = allEndings().find((x) => x.id === id);
    if (!e) return;
    await loadEndingArt(this, [id]);
    const exp = e.type === 'dead' || e.type === 'bad' ? EXP_REWARD.ending(id) : 0;
    let note = '';
    const first = !save.hasReward(id);
    if (first) {
      save.claimReward(id, (cp) => {
        if (!exp) return;
        cp.progress ??= freshProgress();
        // 최신 저장의 파티가 같은 양을 받는다 (예전 저장에 파티가 없으면 레온)
        const ids = cp.progress.party?.length ? cp.progress.party : ['leon'];
        const ups = gainExp(ids, exp, cp.progress);
        note = `경험치 +${exp} (최신 저장에 반영)` + (ups.length ? `  ·  레온 Lv ${levelOf('leon', cp.progress)}` : '');
      });
      if (exp && !save.checkpoint) note = `경험치 +${exp} (저장이 없어 반영할 곳이 없습니다)`;
    } else note = exp ? `경험치 ${exp}은(는) 이미 받았습니다` : '';
    if (!exp) note ||= '트루·히든엔딩은 일러스트와 후일담만 열립니다';

    this.openPanel(`${e.label}: ${e.title}`, (add) => {
      // 일러스트 (4:3 작게, 누르면 크게). 아직 없으면 임시 화면
      const frame = this.add.rectangle(W / 2, 290, 282, 213, 0x221a26).setStrokeStyle(2, 0x6a5a7a);
      add(frame);
      if (this.textures.exists(endingKey(id))) {
        frame.setStrokeStyle(2, 0xcdb88a).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.viewImage(endingKey(id)));
        add(containFit(this.add.image(W / 2, 290, endingKey(id)), 276, 207));
      } else add(this.add.text(W / 2, 290, '엔딩 일러스트\n(준비 중)', { fontFamily: FONT, fontSize: '20px', color: '#776a86', align: 'center' }).setOrigin(0.5));
      add(
        this.add
          .text(W / 2, 410, e.epilogue ?? '', { fontFamily: FONT, fontSize: '18px', color: '#dddddd', align: 'center', wordWrap: { width: 560, useAdvancedWrap: true } })
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

  /** 엔딩 화면 미리 보기: 엔딩을 골라 그 엔딩 화면만 띄운다 (저장 기록 없음) */
  private showEndingPreviewMenu() {
    const list = Object.entries(stories).flatMap(([sid, st]) => Object.keys(st.endings).map((id) => ({ sid, id, title: st.endings[id].title })));
    this.openPanel('엔딩 화면 미리 보기', (add) => {
      list.forEach((e, i) =>
        add(
          makeButton(this, W / 2 + (i < 6 ? -170 : 170), 190 + (i % 6) * 52, `${e.id}`, () => this.go({ story: e.sid, previewEnding: e.id }), {
            w: 330, h: 44, fontSize: 16, depth: 0,
          }),
        ),
      );
    });
  }

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
      // 새 도트(32x48) 확인: 프롤로그 장면 2의 맵(east_hall)에서 레온·세레나가 함께 걷기
      ['새 도트 샘플 (레온·세레나 걷기)', () => start({ story: FIRST_STORY, scene: 'scene1', node: at('scene1', (n) => 'explore' in n) }, () => {
        gameState.progress.party = ['leon', 'serena'];
      })],
      ['1막 시험 ▶', () => this.showAct1Menu()],
      ['2막 시험 ▶', () => this.showAct2Menu()],
      ['3막 시험 ▶', () => this.showAct3Menu()],
      ['4막 시험 ▶', () => this.showAct4Menu()],
      ['엔딩 화면 미리 보기 ▶', () => this.showEndingPreviewMenu()],
    ];
    this.openPanel('개발 시험', (add) => {
      // 두 줄로 (한 줄에 8개)
      rows.forEach(([label, fn], i) =>
        add(makeButton(this, W / 2 + (i < 8 ? -170 : 170), 186 + (i % 8) * 41, label, fn, { w: 330, h: 36, fontSize: 15, depth: 0 })),
      );
      add(
        this.add
          .text(W / 2, 520, '전투 중: F6 적 전멸 · F7 NPC 아군 쓰러뜨리기 · F8 시간 끝 · F9 파티 전멸 · F10 지킬 대상 무너뜨리기', { fontFamily: FONT, fontSize: '15px', color: '#888888' })
          .setOrigin(0.5),
      );
    });
  }

  /**
   * 1막 시험: 장면, 전투, 이동 구간으로 바로 간다.
   * 프롤로그를 깬 상태(레벨 5)에서, 그 지점까지 지나온 해금·합류·겉모습 노드를 미리 적용한다
   */
  private showAct1Menu() {
    const act1 = stories.act1;
    if (!act1) return;
    const where = (pred: (n: object) => boolean) => {
      for (const sc of act1.scenes) {
        const i = sc.nodes.findIndex(pred);
        if (i >= 0) return { scene: sc.id, node: i };
      }
      return { scene: act1.scenes[0].id, node: 0 };
    };
    const jump = (scene: string, node: number) => {
      gameState.reset();
      const p = gameState.progress;
      p.stage = 'prologue';
      p.exp.leon = 700;
      unlock('evade');
      // 그 지점 앞까지의 노드 (갈래 장면은 목적지일 때만)
      for (const sc of act1.scenes) {
        if (sc.branch && sc.id !== scene) continue;
        const end = sc.id === scene ? node : sc.nodes.length;
        for (const n of sc.nodes.slice(0, end) as unknown as Record<string, unknown>[]) {
          if ('unlock' in n) unlock(n.unlock as Unlock);
          if ('join' in n) joinParty(String(n.join));
          if ('costume' in n) p.costume[String(n.who ?? 'leon')] = String(n.costume);
        }
        if (sc.id === scene) break;
      }
      this.go({ story: 'act1', scene, node });
    };
    const scenes = act1.scenes.filter((sc) => !sc.branch || sc.id === 's3_refuse');
    const battles = ['수로 쥐 떼', '수로의 괴물', '검문소 병사', '추격 기사'];
    const segs = ['a1_sewer_walk', 'a1_rune_room', 'a1_sewer_deep', 'a1_cistern_exit', 'a1_hideout', 'a1_slum', 'a1_checkpoint', 'a1_reeds'];
    const cols: [string, [string, () => void][]][] = [
      ['장면', [
        ...scenes.map((sc): [string, () => void] => [sc.id === 's3_refuse' ? '배드 길 (거절)' : sc.title.replace(/^장면 /, '').slice(0, 14), () => jump(sc.id, 0)]),
        ['장면 3 선택지', () => {
          const sc = act1.scenes.find((x) => x.id === 'scene3');
          jump('scene3', Math.max(0, (sc?.nodes.length ?? 1) - 1));
        }],
      ]],
      ['전투', battles.map((b): [string, () => void] => [b, () => { const w = where((n) => (n as { battle?: string }).battle === b); jump(w.scene, w.node); }])],
      ['이동 구간', segs.map((g): [string, () => void] => [g.replace('a1_', ''), () => { const w = where((n) => (n as { explore?: string }).explore === g); jump(w.scene, w.node); }])],
    ];
    this.openPanel('1막 시험', (add) => {
      cols.forEach(([head, rows], c) => {
        const x = 270 + c * 210;
        add(this.add.text(x, 172, head, { fontFamily: FONT, fontSize: '17px', color: '#a89a78' }).setOrigin(0.5));
        rows.forEach(([label, fn], i) => add(makeButton(this, x, 206 + i * 33, label, fn, { w: 196, h: 30, fontSize: 14, depth: 0 })));
      });
    });
  }

  /**
   * 2막 시험: 장면, 선택지, 전투, 이동 구간으로 바로 간다.
   * 1막을 깬 상태(레벨 9)에서, 1막과 그 지점까지의 2막 노드(해금, 합류, 임시 동료, 겉모습)를 미리 적용한다
   */
  private showAct2Menu() {
    const act1 = stories.act1;
    const act2 = stories.act2;
    if (!act1 || !act2) return;
    const apply = (n: Record<string, unknown>) => {
      const p = gameState.progress;
      if ('unlock' in n) unlock(n.unlock as Unlock);
      if ('join' in n) joinParty(String(n.join));
      if ('guest' in n) addGuest(String(n.guest));
      if ('costume' in n) p.costume[String(n.who ?? 'leon')] = String(n.costume);
    };
    const where = (pred: (n: object) => boolean) => {
      for (const sc of act2.scenes) {
        const i = sc.nodes.findIndex(pred);
        if (i >= 0) return { scene: sc.id, node: i };
      }
      return { scene: act2.scenes[0].id, node: 0 };
    };
    const jump = (scene: string, node: number) => {
      gameState.reset();
      const p = gameState.progress;
      p.stage = 'act1';
      p.exp.leon = 2200;
      unlock('evade');
      for (const sc of act1.scenes) {
        if (sc.branch) continue;
        for (const n of sc.nodes as unknown as Record<string, unknown>[]) apply(n);
      }
      for (const sc of act2.scenes) {
        if (sc.branch && sc.id !== scene) continue;
        const end = sc.id === scene ? node : sc.nodes.length;
        for (const n of sc.nodes.slice(0, end) as unknown as Record<string, unknown>[]) apply(n);
        if (sc.id === scene) break;
      }
      this.go({ story: 'act2', scene, node });
    };
    const short = (t: string) => t.replace(/^장면 /, '').replace(/^▶ /, '').slice(0, 14);
    const choiceAt = (id: string) => {
      const sc = act2.scenes.find((x) => x.id === id);
      return Math.max(0, sc?.nodes.findIndex((n) => 'choice' in n || 'choices' in n) ?? 0);
    };
    const branches = ['s4_resist', 's5_stop_elysia', 's5_calm_karg', 's5_ask', 's7_flee'];
    const battles = ['모래 괴물 무리', '우물 방어', '교역로 도적', '성기사단', '아드리안'];
    const segs = ['a2_desert_walk', 'a2_prison', 'a2_oasis', 'a2_trade_route'];
    const cols: [string, [string, () => void][]][] = [
      ['장면', act2.scenes.filter((sc) => !sc.branch).map((sc): [string, () => void] => [short(sc.title), () => jump(sc.id, 0)])],
      ['선택지 · 갈래', [
        ...['scene4', 'scene5', 'scene7', 'scene8'].map((id): [string, () => void] => [`${id.replace('scene', '장면 ')} 선택지`, () => jump(id, choiceAt(id))]),
        ...branches.map((id): [string, () => void] => [short(act2.scenes.find((x) => x.id === id)?.title ?? id), () => jump(id, 0)]),
      ]],
      ['전투', battles.map((b): [string, () => void] => [b, () => { const w = where((n) => (n as { battle?: string }).battle === b); jump(w.scene, w.node); }])],
      ['이동 구간', segs.map((g): [string, () => void] => [g.replace('a2_', ''), () => { const w = where((n) => (n as { explore?: string }).explore === g); jump(w.scene, w.node); }])],
    ];
    this.openPanel('2막 시험', (add) => {
      cols.forEach(([head, rows], c) => {
        const x = 165 + c * 210;
        add(this.add.text(x, 172, head, { fontFamily: FONT, fontSize: '17px', color: '#a89a78' }).setOrigin(0.5));
        // 줄이 많으면 닫기 버튼 위까지 들어가게 촘촘히
        const step = Math.min(33, Math.floor(330 / Math.max(1, rows.length - 1)));
        rows.forEach(([label, fn], i) =>
          add(makeButton(this, x, 206 + i * step, label, fn, { w: 196, h: step - 3, fontSize: step < 30 ? 13 : 14, depth: 0 })),
        );
      });
    });
  }

  /**
   * 3막 시험: 장면, 선택지·결과, 전투, 이동 구간으로 바로 간다.
   * 2막을 깬 상태(레벨 13, 파티 레온·엘리시아·카르크)에서, 1·2막과 그 지점까지의 3막 노드를 미리 적용한다.
   * 무대의 once(3막 상처 빛, 룬 깨짐)와 galia_alive도 그 지점에 맞춘다
   */
  private showAct3Menu() {
    const act1 = stories.act1;
    const act2 = stories.act2;
    const act3 = stories.act3;
    if (!act1 || !act2 || !act3) return;
    const stages = (stageData as unknown as { stages: Record<string, { once?: string; rune?: string }> }).stages;
    const apply = (n: Record<string, unknown>) => {
      const p = gameState.progress;
      if ('unlock' in n) unlock(n.unlock as Unlock);
      if ('join' in n) joinParty(String(n.join));
      if ('costume' in n) p.costume[String(n.who ?? 'leon')] = String(n.costume);
      if ('stage' in n) {
        const d = stages[String(n.stage)];
        const keys = [d?.once, d?.rune === 'break' ? 'a3:rune_break' : d?.rune === 'layer' ? 'a3:layered' : undefined];
        for (const k of keys) if (k && !p.once.includes(k)) p.once.push(k);
      }
    };
    const where = (pred: (n: object) => boolean) => {
      for (const sc of act3.scenes) {
        const i = sc.nodes.findIndex(pred);
        if (i >= 0) return { scene: sc.id, node: i };
      }
      return { scene: act3.scenes[0].id, node: 0 };
    };
    /** galiaAlive: 장면 8 뒤에서 갈리아가 살아 있는 길(결과 "끝까지 지켜 냄")인지 */
    const jump = (scene: string, node: number, galiaAlive = false) => {
      gameState.reset();
      const p = gameState.progress;
      p.stage = 'act2';
      unlock('evade');
      for (const sc of [...act1.scenes, ...act2.scenes]) {
        if (sc.branch) continue;
        for (const n of sc.nodes as unknown as Record<string, unknown>[]) if (!('guest' in n)) apply(n);
      }
      p.party = ['leon', 'elysia', 'karg'];
      p.guests = {};
      for (const id of p.party) p.exp[id] = 4650;
      const idx = act3.scenes.findIndex((x) => x.id === scene);
      const after8 = idx > act3.scenes.findIndex((x) => x.id === 'scene8');
      for (const sc of act3.scenes) {
        const toSaved = galiaAlive && sc.id === 'r_saved';
        if (sc.branch && sc.id !== scene && !toSaved) continue;
        if (!sc.branch && act3.scenes.indexOf(sc) > idx) break;
        const end = sc.id === scene ? node : sc.nodes.length;
        for (const n of sc.nodes.slice(0, end) as unknown as Record<string, unknown>[]) apply(n);
        if (sc.id === scene) break;
      }
      if (after8) gameState.setFlag('galia_alive', galiaAlive);
      this.go({ story: 'act3', scene, node });
    };
    const short = (t: string) => t.replace(/^장면 /, '').replace(/^▶ /, '').replace(/^결과: /, '').slice(0, 14);
    const choiceAt = (id: string) => {
      const sc = act3.scenes.find((x) => x.id === id);
      return Math.max(0, sc?.nodes.findIndex((n) => 'choice' in n || 'choices' in n) ?? 0);
    };
    const alive = ['scene10', 'scene10_1'];
    const battles = ['안개 짐승 무리', '마을 습격', '습격대장'];
    const segs = ['a3_village', 'a3_forest', 'a3_night', 'a3_night_in'];
    const cols: [string, [string, () => void][]][] = [
      ['장면', [
        ...act3.scenes.filter((sc) => !sc.branch).map((sc): [string, () => void] => [short(sc.title), () => jump(sc.id, 0)]),
        ...alive.map((id): [string, () => void] => [`${id.replace('scene', '').replace('_', '-')} (갈리아 생존)`, () => jump(id, 0, true)]),
      ]],
      ['선택지 · 결과', [
        ...['scene5', 'scene6_1', 'scene8', 'scene10'].map((id): [string, () => void] => [`${id.replace('scene', '장면 ').replace('_', '-')} 선택지`, () => jump(id, choiceAt(id))]),
        ...['r_saved', 'r_fallen', 'r_wiped'].map((id): [string, () => void] => [short(act3.scenes.find((x) => x.id === id)?.title ?? id), () => jump(id, 0, id === 'r_saved')]),
      ]],
      ['전투', battles.map((b): [string, () => void] => [b, () => { const w = where((n) => (n as { battle?: string }).battle === b); jump(w.scene, w.node); }])],
      ['이동 구간', segs.map((g): [string, () => void] => [g.replace('a3_', ''), () => { const w = where((n) => (n as { explore?: string }).explore === g); jump(w.scene, w.node); }])],
    ];
    this.openPanel('3막 시험', (add) => {
      cols.forEach(([head, rows], c) => {
        const x = 165 + c * 210;
        add(this.add.text(x, 172, head, { fontFamily: FONT, fontSize: '17px', color: '#a89a78' }).setOrigin(0.5));
        const step = Math.min(33, Math.floor(330 / Math.max(1, rows.length - 1)));
        rows.forEach(([label, fn], i) =>
          add(makeButton(this, x, 206 + i * step, label, fn, { w: 196, h: step - 3, fontSize: step < 30 ? 13 : 14, depth: 0 })),
        );
      });
    });
  }

  /**
   * 4막 시험: 장면, 선택지·결과, 전투, 이동 구간, 엘리시아 분기로 바로 간다.
   * 3막을 깬 상태(파티 레온·엘리시아·카르크, 갈리아는 위의 단추로)에서 1~3막과 그 지점까지의 4막 노드를 미리 적용한다.
   * 경험치는 장면 순서에 맞춰 17 → 21레벨만큼 쌓는다(4막 중에는 최대 17레벨, 4막을 깨면 넘친 만큼 오름). 호감도(엘리시아-레온, 엘리시아-카르크)는 위의 단추로 고른다
   */
  private showAct4Menu() {
    const [act1, act2, act3, act4] = [stories.act1, stories.act2, stories.act3, stories.act4];
    if (!act1 || !act2 || !act3 || !act4) return;
    const stages = (stageData as unknown as { stages: Record<string, { once?: string; rune?: string }> }).stages;
    const opt = { galia: true, rel: [1, 0] as [number, number] };
    const apply = (n: Record<string, unknown>) => {
      const p = gameState.progress;
      if ('unlock' in n) unlock(n.unlock as Unlock);
      if ('unlock' in n && n.unlock === 'weapon') p.costume.leon = 'leon_blade';
      if ('join' in n) joinParty(String(n.join));
      if ('leave' in n) leaveParty(String(n.leave));
      if ('costume' in n) p.costume[String(n.who ?? 'leon')] = String(n.costume);
      if ('stage' in n) {
        const d = stages[String(n.stage)];
        const keys = [d?.once, d?.rune === 'break' ? 'a3:rune_break' : d?.rune === 'layer' ? 'a3:layered' : undefined];
        for (const k of keys) if (k && !p.once.includes(k)) p.once.push(k);
      }
    };
    const where = (pred: (n: object) => boolean) => {
      for (const sc of act4.scenes) {
        const i = sc.nodes.findIndex(pred);
        if (i >= 0) return { scene: sc.id, node: i };
      }
      return { scene: act4.scenes[0].id, node: 0 };
    };
    const main = act4.scenes.filter((sc) => !sc.branch);
    /** via: 지나온 것으로 칠 갈래 장면 (엘리시아 결과, 탈출 결과) */
    const jump = (scene: string, node: number, setup?: () => void, via: string[] = []) => {
      gameState.reset();
      const p = gameState.progress;
      p.stage = 'act3';
      unlock('evade');
      for (const sc of [...act1.scenes, ...act2.scenes, ...act3.scenes]) {
        if (sc.branch) continue;
        for (const n of sc.nodes as unknown as Record<string, unknown>[]) if (!('guest' in n) && !('join' in n && n.join === 'galia')) apply(n);
      }
      p.party = ['leon', 'elysia', 'karg'];
      if (opt.galia) p.party.push('galia');
      p.guests = {};
      gameState.setFlag('galia_alive', opt.galia);
      gameState.addAffection('elysia_leon', opt.rel[0]);
      gameState.addAffection('elysia_karg', opt.rel[1]);
      // 경험치: 장면 순서에 맞춰 17 → 21레벨만큼 (4막 중에는 17레벨에서 멈추고 쌓임)
      const at = act4.scenes.findIndex((x) => x.id === scene);
      const main = act4.scenes.findIndex((x) => x.id === 'scene12');
      const lv = 17 + Math.floor((4 * Math.min(at, main)) / Math.max(1, main));
      for (const id of ['leon', 'elysia', 'karg', 'serena', 'galia']) p.exp[id] = expData.levels[lv - 1];
      for (const sc of act4.scenes) {
        if (sc.branch && sc.id !== scene && !via.includes(sc.id)) continue;
        if (!sc.branch && act4.scenes.indexOf(sc) > at) break;
        if (via.includes(sc.id) && sc.id !== scene) gameState.applyEffects(sc.effects);
        const end = sc.id === scene ? node : sc.nodes.length;
        for (const n of sc.nodes.slice(0, end) as unknown as Record<string, unknown>[]) apply(n);
        if (sc.id === scene) break;
      }
      setup?.();
      this.go({ story: 'act4', scene, node });
    };
    const short = (t: string) => t.replace(/^장면 /, '').replace(/^▶ /, '').replace(/^결과: /, '').replace(/^막간\. /, '막간 ').slice(0, 13);
    const choiceAt = (id: string) => {
      const sc = act4.scenes.find((x) => x.id === id);
      return Math.max(0, sc?.nodes.findIndex((n) => 'choice' in n || 'choices' in n) ?? 0);
    };
    const nodeOf = (id: string, pred: (n: object) => boolean) => Math.max(0, act4.scenes.find((x) => x.id === id)?.nodes.findIndex(pred) ?? 0);
    const title = (id: string) => short(act4.scenes.find((x) => x.id === id)?.title ?? id);
    const battles = ['산길의 도적', '용암의 수호자', '마탑 파견대', '아스트라 탈출'];
    const segs = ['a4_plain', 'a4_pass', 'a4_tablet1', 'a4_tablet2', 'a4_tablet3', 'a4_tablet4', 'a4_grimhelm_night', 'a4_grimhelm_night_in', 'a4_volcano'];
    // 엘리시아 분기: 장면 10의 마지막 독백(발소리가 멀어졌다) 앞에서, 호감도를 정해 시작
    const s10 = nodeOf('scene10', (n) => 'stage' in n && (n as { stage: string }).stage === 'a4_wait') - 1;
    const rel = (lbl: string, l: number, k: number): [string, () => void] => [lbl, () => { opt.rel = [l, k]; jump('scene10', Math.max(0, s10)); }];
    const cols: [string, [string, () => void][]][] = [
      ['장면', main.map((sc): [string, () => void] => [short(sc.title), () => jump(sc.id, 0)])],
      ['선택지 · 결과', [
        ...['scene1', 'scene4', 'scene6'].map((id): [string, () => void] => [`${id.replace('scene', '장면 ')} 선택지`, () => jump(id, choiceAt(id))]),
        ...['e_stand', 'e_together', 'e_betray'].map((id): [string, () => void] => [title(id), () => jump(id, 0)]),
        ...['g1', 'g2', 'g9', 'g11'].map((id): [string, () => void] => [`갈래 ${id}`, () => { opt.galia = true; jump(id, 0); }]),
        [title('r11_stay'), () => jump('scene11_1', nodeOf('scene11_1', (n) => 'battle' in n) + 1, undefined, ['e_stand'])],
        [title('r11_die'), () => jump('scene11_1', nodeOf('scene11_1', (n) => 'battle' in n) + 1, undefined, ['e_together'])],
        ['장면 12 (엘리시아 남음)', () => jump('scene12', 0, undefined, ['e_stand', 'r11_stay'])],
        ['장면 12 (엘리시아 죽음)', () => jump('scene12', 0, undefined, ['e_together', 'r11_die'])],
      ]],
      ['전투', battles.map((b): [string, () => void] => [b, () => { const w = where((n) => (n as { battle?: string }).battle === b); jump(w.scene, w.node, undefined, b === '아스트라 탈출' ? ['e_stand'] : []); }])],
      ['이동 구간', segs.map((g): [string, () => void] => [g.replace('a4_', ''), () => { const w = where((n) => (n as { explore?: string }).explore === g); jump(w.scene, w.node); }])],
      ['엘리시아 분기', [
        rel('남는다 (2, 1)', 2, 1),
        rel('함께 (2, 0)', 2, 0),
        rel('함께 (1, 1)', 1, 1),
        rel('배신 (1, 0)', 1, 0),
        ['카르크 -1로 장면 1', () => { opt.rel = [0, -1]; jump('scene1', 0); }],
      ]],
    ];
    this.openPanel('4막 시험', (add) => {
      // 위: 갈리아 생존 여부, 호감도(엘리시아-레온, 엘리시아-카르크)
      const gBtns: Button[] = [];
      const gRefresh = () => gBtns.forEach((b, i) => b.setOn(opt.galia === (i === 0)));
      ['갈리아 있음', '갈리아 없음'].forEach((l, i) => {
        const b = makeButton(this, 160 + i * 130, 168, l, () => ((opt.galia = i === 0), gRefresh()), { w: 120, h: 28, fontSize: 13, depth: 0 });
        gBtns.push(b);
        add(b);
      });
      gRefresh();
      const presets: [string, [number, number]][] = [['관계 (1, 0)', [1, 0]], ['관계 (2, 1)', [2, 1]], ['관계 (0, -1)', [0, -1]]];
      const rBtns: Button[] = [];
      const rRefresh = () => rBtns.forEach((b, i) => b.setOn(opt.rel[0] === presets[i][1][0] && opt.rel[1] === presets[i][1][1]));
      presets.forEach(([l, v], i) => {
        const b = makeButton(this, 470 + i * 130, 168, l, () => ((opt.rel = [...v] as [number, number]), rRefresh()), { w: 120, h: 28, fontSize: 13, depth: 0 });
        rBtns.push(b);
        add(b);
      });
      rRefresh();
      cols.forEach(([head, rows], c) => {
        const x = 104 + c * 188;
        add(this.add.text(x, 198, head, { fontFamily: FONT, fontSize: '16px', color: '#a89a78' }).setOrigin(0.5));
        const step = Math.min(33, Math.floor(310 / Math.max(1, rows.length - 1)));
        rows.forEach(([label, fn], i) =>
          add(makeButton(this, x, 222 + i * step, label, fn, { w: 180, h: step - 2, fontSize: step < 24 ? 12 : 14, depth: 0 })),
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
      // 전투 궁극기 컷인 켜기/끄기
      add(this.add.text(200, 380, '궁극기 컷인', { fontFamily: FONT, fontSize: '22px', color: '#dddddd' }).setOrigin(0, 0.5));
      const onOff: Button[] = [];
      const refresh = () => onOff.forEach((b, i) => b.setOn(save.settings.ultCutin === (i === 0)));
      ['켜기', '끄기'].forEach((label, i) => {
        const b = makeButton(this, 440 + i * 100, 380, label, () => {
          save.setSettings({ ultCutin: i === 0 });
          refresh();
        }, { w: 90, h: 42, fontSize: 18, depth: 0 });
        onOff.push(b);
        add(b);
      });
      refresh();
      add(
        this.add
          .text(W / 2, 460, '설정은 이 브라우저에 저장됩니다.', { fontFamily: FONT, fontSize: '17px', color: '#777777' })
          .setOrigin(0.5),
      );
    });
  }
}
