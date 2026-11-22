import Phaser from 'phaser';
import { characters, dialogues } from '../game/data';
import { gameState } from '../game/GameState';
import { makeBodyPlaceholder, makeFacePlaceholder, PORTRAIT_H } from '../game/placeholders';
import type {
  ChoiceOption,
  DialogueData,
  DialogueNode,
  Expression,
  LineNode,
  Side,
} from '../game/types';

export interface DialogueSceneData {
  dialogueId: string;
  /** 대화가 끝나면 돌아갈 장면 키 */
  returnTo: string;
}

const W = 960;
const H = 720;
const BOX = { x: 40, y: 530, w: 880, h: 170 };
const TYPE_DELAY = 30; // 한 글자당 ms
const PORTRAIT_HEIGHT = 560; // 화면에 보이는 스탠딩 높이
const SIDE_X: Record<Side, number> = { left: 250, right: 710 };
const DIM = 0x555555;
const FONT = "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";

const bodyKey = (id: string) => `${id}_body`;
const faceKey = (id: string, e: Expression) => `${id}_face_${e}`;

type Mode = 'typing' | 'waiting' | 'choice' | 'done';

/** 파일이 실제 이미지인지 확인 (없는 파일이면 개발 서버가 HTML을 돌려줄 수 있음) */
const existsCache = new Map<string, Promise<boolean>>();
function imageExists(url: string): Promise<boolean> {
  let p = existsCache.get(url);
  if (!p) {
    p = fetch(url, { method: 'HEAD' })
      .then((r) => r.ok && (r.headers.get('content-type') ?? '').startsWith('image/'))
      .catch(() => false);
    existsCache.set(url, p);
  }
  return p;
}

interface Portrait {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  face: Phaser.GameObjects.Image;
  charId: string | null;
}

export class DialogueScene extends Phaser.Scene {
  private dialogue!: DialogueData;
  private returnTo = 'Field';
  private index = 0;
  private idIndex = new Map<string, number>();

  private mode: Mode = 'done';
  private fullText: string[] = [];
  private shown = 0;
  private typeTimer?: Phaser.Time.TimerEvent;

  private nameBox!: Phaser.GameObjects.Container;
  private nameText!: Phaser.GameObjects.Text;
  private bodyText!: Phaser.GameObjects.Text;
  private nextMark!: Phaser.GameObjects.Text;
  private portraits!: Record<Side, Portrait>;
  private choiceButtons: Phaser.GameObjects.Container[] = [];
  private activeChoices: ChoiceOption[] = [];

  constructor() {
    super('Dialogue');
  }

  init(data: DialogueSceneData) {
    const d = dialogues[data.dialogueId];
    if (!d) throw new Error(`대화 데이터를 찾을 수 없습니다: ${data.dialogueId}`);
    this.dialogue = d;
    this.returnTo = data.returnTo;
    this.index = 0;
    this.idIndex.clear();
    d.nodes.forEach((n, i) => n.id && this.idIndex.set(n.id, i));
    this.choiceButtons = [];
  }

  create() {
    void this.loadPortraits().then(() => this.build());
  }

  /** 있는 그림 파일만 골라 불러온다. 없는 파일은 build()에서 임시 그림으로 채운다 */
  private async loadPortraits() {
    const wanted: { key: string; url: string }[] = [];
    for (const id of this.speakerIds()) {
      const c = characters[id];
      if (!c) continue;
      wanted.push({ key: bodyKey(id), url: `assets/portraits/${id}_body.png` });
      for (const e of c.expressions) {
        wanted.push({ key: faceKey(id, e), url: `assets/portraits/${id}_face_${e}.png` });
      }
    }
    const todo = wanted.filter((w) => !this.textures.exists(w.key));
    const found = await Promise.all(todo.map((w) => imageExists(w.url)));
    const toLoad = todo.filter((_, i) => found[i]);
    if (toLoad.length === 0) return;
    await new Promise<void>((resolve) => {
      for (const w of toLoad) this.load.image(w.key, w.url);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
      this.load.start();
    });
  }

  private build() {
    // 없는 그림은 회색 실루엣으로 채운다
    for (const id of this.speakerIds()) {
      const c = characters[id];
      if (!c) continue;
      if (!this.textures.exists(bodyKey(id))) makeBodyPlaceholder(this, bodyKey(id), id);
      for (const e of c.expressions) {
        if (!this.textures.exists(faceKey(id, e))) makeFacePlaceholder(this, faceKey(id, e), e);
      }
    }

    this.add.rectangle(0, 0, W, H, 0x0b0b14, 0.92).setOrigin(0);

    this.portraits = { left: this.makePortrait('left'), right: this.makePortrait('right') };

    // 대사창
    const box = this.add.graphics();
    box.fillStyle(0x12121c, 0.94);
    box.fillRoundedRect(BOX.x, BOX.y, BOX.w, BOX.h, 12);
    box.lineStyle(3, 0xcdb88a, 1);
    box.strokeRoundedRect(BOX.x, BOX.y, BOX.w, BOX.h, 12);
    box.setDepth(5);

    const plate = this.add.graphics();
    plate.fillStyle(0x2a2440, 1);
    plate.fillRoundedRect(0, 0, 200, 44, 8);
    plate.lineStyle(2, 0xcdb88a, 1);
    plate.strokeRoundedRect(0, 0, 200, 44, 8);
    this.nameText = this.add
      .text(100, 22, '', { fontFamily: FONT, fontSize: '24px', color: '#f3e7c4', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.nameBox = this.add.container(BOX.x + 24, BOX.y - 30, [plate, this.nameText]).setDepth(6);

    this.bodyText = this.add.text(BOX.x + 32, BOX.y + 34, '', {
      fontFamily: FONT,
      fontSize: '26px',
      color: '#ffffff',
      lineSpacing: 10,
      wordWrap: { width: BOX.w - 64, useAdvancedWrap: true },
    }).setDepth(6);

    this.nextMark = this.add
      .text(BOX.x + BOX.w - 36, BOX.y + BOX.h - 30, '▼', { fontFamily: FONT, fontSize: '20px', color: '#cdb88a' })
      .setOrigin(0.5)
      .setDepth(6)
      .setVisible(false);
    this.tweens.add({ targets: this.nextMark, y: '+=6', duration: 400, yoyo: true, repeat: -1 });

    this.input.on('pointerdown', () => this.advance());
    this.input.keyboard!.on('keydown', (ev: KeyboardEvent) => this.onKey(ev));

    this.cameras.main.fadeIn(200, 0, 0, 0);
    this.runNode(0);
  }

  // ---------- 진행 ----------

  private speakerIds(): string[] {
    const ids = new Set<string>();
    for (const n of this.dialogue.nodes) if ('speaker' in n && n.speaker) ids.add(n.speaker);
    return [...ids];
  }

  private resolve(target: string | undefined, fallback: number): number {
    if (target === undefined) return fallback;
    const i = this.idIndex.get(target);
    if (i === undefined) {
      console.error(`[dialogue] 없는 노드 id: ${target}`);
      return -1;
    }
    return i;
  }

  private runNode(i: number) {
    const node: DialogueNode | undefined = this.dialogue.nodes[i];
    if (i < 0 || !node) return this.finishToField();
    this.index = i;

    if ('text' in node) {
      gameState.applyEffects(node);
      this.showLine(node);
    } else if ('choices' in node) {
      this.showChoices(node.choices);
    } else if ('branch' in node) {
      const hit = node.branch.find((b) => gameState.check(b.if));
      const target = hit ? hit.next : node.else;
      this.runNode(this.resolve(target, i + 1));
    } else if ('end' in node) {
      gameState.applyEffects(node);
      this.finishToField();
    } else if ('ending' in node) {
      gameState.applyEffects(node);
      this.finishToCard('ending', node.ending);
    } else if ('chapter' in node) {
      gameState.applyEffects(node);
      this.finishToCard('chapter', node.chapter);
    } else if ('goto' in node) {
      gameState.save();
      this.scene.restart({ dialogueId: node.goto, returnTo: this.returnTo });
    }
  }

  private advance() {
    if (this.mode === 'typing') {
      this.completeTyping();
    } else if (this.mode === 'waiting') {
      const node = this.dialogue.nodes[this.index] as LineNode;
      this.runNode(this.resolve(node.next, this.index + 1));
    }
  }

  private onKey(ev: KeyboardEvent) {
    if (ev.code === 'Space' || ev.code === 'Enter') {
      ev.preventDefault();
      if (this.mode !== 'choice') this.advance();
      return;
    }
    if (this.mode === 'choice') {
      const n = Number(ev.key);
      if (n >= 1 && n <= this.activeChoices.length) this.pickChoice(n - 1);
    }
  }

  // ---------- 대사 ----------

  private showLine(node: LineNode) {
    const c = node.speaker ? characters[node.speaker] : undefined;
    if (node.speaker && !c) console.warn(`[dialogue] 없는 인물 id: ${node.speaker}`);

    if (c) {
      const side = node.position ?? 'left';
      this.setPortrait(side, c.id, node.expression ?? 'normal');
      this.highlight(side);
      this.nameText.setText(c.name);
      this.nameBox.setVisible(true);
    } else {
      this.highlight(null);
      this.nameBox.setVisible(false);
    }

    this.fullText = Array.from(node.text);
    this.shown = 0;
    this.bodyText.setText('');
    this.nextMark.setVisible(false);
    this.mode = 'typing';
    this.typeTimer?.remove();
    this.typeTimer = this.time.addEvent({
      delay: TYPE_DELAY,
      loop: true,
      callback: () => {
        this.shown++;
        this.bodyText.setText(this.fullText.slice(0, this.shown).join(''));
        if (this.shown >= this.fullText.length) this.completeTyping();
      },
    });
  }

  private completeTyping() {
    this.typeTimer?.remove();
    this.typeTimer = undefined;
    this.bodyText.setText(this.fullText.join(''));
    this.mode = 'waiting';
    this.nextMark.setVisible(true);
  }

  // ---------- 스탠딩 ----------

  private makePortrait(side: Side): Portrait {
    const body = this.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 1);
    const face = this.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 1);
    const container = this.add.container(SIDE_X[side], H + 10, [body, face]).setVisible(false);
    return { container, body, face, charId: null };
  }

  private setPortrait(side: Side, id: string, expr: Expression) {
    const p = this.portraits[side];
    const other = this.portraits[side === 'left' ? 'right' : 'left'];
    if (other.charId === id) {
      // 같은 인물이 반대쪽에 있었다면 치운다
      other.container.setVisible(false);
      other.charId = null;
    }
    const fk = this.textures.exists(faceKey(id, expr)) ? faceKey(id, expr) : faceKey(id, 'normal');
    p.body.setTexture(bodyKey(id));
    p.face.setTexture(fk);
    // 몸과 얼굴은 같은 크기의 그림이라고 가정하고 같은 비율로 맞춘다
    const scale = PORTRAIT_HEIGHT / (p.body.height || PORTRAIT_H);
    p.body.setScale(scale);
    p.face.setScale(scale);
    if (p.charId !== id) {
      p.container.setAlpha(0);
      this.tweens.add({ targets: p.container, alpha: 1, duration: 180 });
    }
    p.charId = id;
    p.container.setVisible(true);
  }

  /** 말하는 쪽은 밝게, 나머지는 어둡게. null이면 둘 다 어둡게(나레이션) */
  private highlight(speaking: Side | null) {
    for (const side of ['left', 'right'] as Side[]) {
      const p = this.portraits[side];
      if (side === speaking) {
        p.body.clearTint();
        p.face.clearTint();
        p.container.setDepth(1);
      } else {
        p.body.setTint(DIM);
        p.face.setTint(DIM);
        p.container.setDepth(0);
      }
    }
  }

  // ---------- 선택지 ----------

  private showChoices(options: ChoiceOption[]) {
    this.activeChoices = options.filter((o) => gameState.check(o.condition));
    if (this.activeChoices.length === 0) {
      console.warn('[dialogue] 표시할 선택지가 없습니다. 다음 노드로 넘어갑니다.');
      return this.runNode(this.index + 1);
    }
    this.mode = 'choice';
    this.nextMark.setVisible(false);

    const bw = 560;
    const bh = 52;
    const gap = 12;
    const total = this.activeChoices.length * bh + (this.activeChoices.length - 1) * gap;
    const top = BOX.y - 50 - total;

    this.activeChoices.forEach((opt, i) => {
      const bg = this.add.graphics();
      const draw = (hover: boolean) => {
        bg.clear();
        bg.fillStyle(hover ? 0x3d3560 : 0x1d1a2c, 0.96);
        bg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 10);
        bg.lineStyle(2, hover ? 0xf3e7c4 : 0xcdb88a, 1);
        bg.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 10);
      };
      draw(false);
      const label = this.add
        .text(0, 0, `${i + 1}. ${opt.text}`, { fontFamily: FONT, fontSize: '24px', color: '#ffffff' })
        .setOrigin(0.5);
      const btn = this.add
        .container(W / 2, top + i * (bh + gap) + bh / 2, [bg, label])
        .setSize(bw, bh)
        .setDepth(10)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => draw(true));
      btn.on('pointerout', () => draw(false));
      btn.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        this.pickChoice(i);
      });
      this.choiceButtons.push(btn);
    });
  }

  private pickChoice(i: number) {
    if (this.mode !== 'choice') return;
    const opt = this.activeChoices[i];
    this.choiceButtons.forEach((b) => b.destroy());
    this.choiceButtons = [];
    this.activeChoices = [];
    gameState.applyEffects(opt);
    gameState.save();
    this.runNode(this.resolve(opt.next, this.index + 1));
  }

  // ---------- 끝내기 ----------

  private finishToField() {
    this.mode = 'done';
    gameState.save();
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.resume(this.returnTo);
      this.scene.stop();
    });
  }

  private finishToCard(kind: 'ending' | 'chapter', id: string) {
    this.mode = 'done';
    gameState.save();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.stop(this.returnTo);
      this.scene.start('TitleCard', { kind, id, returnTo: this.returnTo });
    });
  }
}
