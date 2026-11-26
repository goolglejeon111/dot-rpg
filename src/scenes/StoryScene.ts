import Phaser from 'phaser';
import type { BattleResult, BattleStart } from '../battle/BattleScene';
import { STAGE, type ExploreScene, type ExploreStart, type MapHost, type StageDef } from '../explore/ExploreScene';
import { makeBattleAnims, preloadBattle } from '../battle/assets';
import battlesData from '../data/battle/battles.json';
import { StoryFx } from './StoryFx';
import { ACTIVE_MAX, activeParty, addGuest, clearStory, gainOnce, healAll, joinParty, lowToHalf, leaveParty, levelOf, maxLevel, partyIds, setActive, unlock, unlockInfo, type Unlock } from '../battle/progress';
import { characters, stories } from '../game/data';
import { gameState, type StateData } from '../game/GameState';
import { makeBodyPlaceholder, PORTRAIT_H, PORTRAIT_W } from '../game/placeholders';
import { save, type ChoiceLogEntry } from '../game/save';
import { openLookLog } from '../game/lookLog';
import { cgKey, loadCgs } from '../game/cg';
import { senseBeat } from '../game/beat';
import { playLoop, playSe } from '../game/sound';
import { coverFit, endingKey, imageExists, loadEndingArt } from '../game/assets';
import { FONT, GOLD, hex, makeButton, type Button } from '../game/ui';
import type {
  ChoiceOption,
  CutinNode,
  Emphasis,
  EmphasisStyle,
  Expression,
  LineNode,
  Side,
  StoryData,
  StoryNode,
  StorySceneData,
} from '../game/types';

/** Story 장면을 열 때 넘기는 값 */
export interface StoryStartData {
  story: string;
  /** 시작할 장면 ID (없으면 첫 장면) */
  scene?: string;
  /** 그 장면 안에서 시작할 대사 번호 (이어하기) */
  node?: number;
  /** 이야기를 다 본 저장에서 이어하기: 막 전환 화면부터 */
  finished?: boolean;
  /** 개발 시험: 이 엔딩 화면만 바로 띄운다 (저장 기록 없음) */
  previewEnding?: string;
  /** 필드에서 열었을 때 돌아갈 장면 키 (없으면 끝나고 타이틀로) */
  returnTo?: string;
  /** 선택지 기록(C)에서 고른 선택지 번호: 그 선택지 화면부터 */
  choiceAt?: number;
}

/** 되감기(Backspace)와 선택지 기록 문구 */
const NO_BACK = '여기서부터는 뒤로 갈 수 없습니다. 선택지 기록을 쓰세요';
const BACK_MAX = 300;

const W = 960;
const H = 720;
const BOX = { x: 40, y: 540, w: 880, h: 160 };
const PORTRAIT_HEIGHT = 700; // 화면에 보이는 스탠딩 높이 (하단 기준)
const SIDE_X: Record<Side, number> = { left: 255, right: 705 };
const DIM_SPEAK = 0x5c5c5c; // 듣는 사람
const DIM_MONO = 0x9a9a9a; // 독백 중 (살짝)

/** 강조는 하나(문자열) 또는 여러 개(배열) */
const fxList = (s?: EmphasisStyle): Emphasis[] => (!s ? [] : Array.isArray(s) ? s : [s]);

const bodyKey = (id: string) => `${id}_body`;
const itemKey = (id: string) => `item_${id}`;
const faceKey = (id: string, e: Expression) => `${id}_face_${e}`;
/** 각인 무기를 얻은 뒤 레온의 도트 (4막 장면 7) */
const WEAPON_COSTUME = 'leon_blade';
/** 파티 선택 화면을 처음 열 때의 안내 (4막_연출.md "새로 필요한 기능" 3) */
const PARTY_GUIDE = '동료가 5명이 되었습니다. 함께 싸울 4명을 고르세요. 레온은 뺄 수 없습니다. 이동 중에는 파티 (P)로 언제든 바꿀 수 있습니다';
/** 장면 ID로 정하는 특별한 장면: 꿈(dream…), 막간(interlude…) */
const sceneKind = (id?: string) => (id?.startsWith('dream') ? 'dream' : id?.startsWith('interlude') ? 'interlude' : '');


interface Portrait {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  face: Phaser.GameObjects.Image;
  charId: string | null;
  expr: Expression;
}

type Mode = 'busy' | 'typing' | 'waiting' | 'choice' | 'end' | 'explore';

/** 마지막으로 화면에 보인 글 (선택지로 돌아갈 때 다시 그린다) */
type LastShown =
  | { kind: 'line'; node: LineNode }
  | { kind: 'mono'; lines: string[] }
  | null;

interface ChoicePoint {
  scene: number;
  node: number;
  state: StateData;
  stage: Record<Side, { id: string; expr: Expression } | null>;
  shown: LastShown;
  place: string;
}

/** 되감기로 다시 만들 화면 */
interface HistView {
  stage: ChoicePoint['stage'];
  shown: LastShown;
  place: string;
  cg: string | null;
  sense: boolean;
}

/** 되감기 기록 하나: 대사·독백 한 줄 또는 선택지 화면이 뜨기 직전 */
interface Hist {
  scene: number;
  node: number;
  /** 독백 안의 줄 번호 */
  mono: number;
  state: StateData;
  /** 그때의 지난 대사 수 (되감으면 그 뒤를 지운다) */
  backlog: number;
  /** 그때의 선택지 기록 수 */
  log: number;
  view: HistView;
}

/** 대본을 재생하는 대화 장면 (스탠딩 + 대사창 + 독백 + 선택지 + 엔딩) */
export class StoryScene extends Phaser.Scene implements MapHost {
  private story!: StoryData;
  private start!: StoryStartData;
  private sceneIdx = 0;
  private nodeIdx = 0;
  private monoIdx = 0;
  private mode: Mode = 'busy';

  private full = '';
  private shown = 0;
  private typeTimer?: Phaser.Time.TimerEvent;
  private waitTimer?: Phaser.Time.TimerEvent;
  private auto = false;
  private lastShown: LastShown = null;
  private lastChoice: ChoicePoint | null = null;
  private place = '';
  private entered = false;
  private backlog: { name?: string; text: string }[] = [];

  private bg!: Phaser.GameObjects.Rectangle;
  private placeLabel!: Phaser.GameObjects.Text;
  private portraits!: Record<Side, Portrait>;
  private box!: Phaser.GameObjects.Container;
  private nameBox!: Phaser.GameObjects.Container;
  private nameText!: Phaser.GameObjects.Text;
  private lineText!: Phaser.GameObjects.Text;
  private nextMark!: Phaser.GameObjects.Text;
  private mono!: Phaser.GameObjects.Container;
  private monoText!: Phaser.GameObjects.Text;
  private monoMark!: Phaser.GameObjects.Text;
  private choiceButtons: Button[] = [];
  private activeChoices: ChoiceOption[] = [];
  private logBtn!: Button;
  /** 대사창을 내리고 무대만 보여 주는 중 (버튼도 숨김) */
  private staging = false;
  /** 화면 가운데 확대한 아이템 그림 */
  private itemView?: Phaser.GameObjects.Container;
  private autoBtn!: Button;
  private skipBtn!: Button;
  private overlay?: Phaser.GameObjects.Container;
  private logView?: { root: Phaser.GameObjects.Container; text: Phaser.GameObjects.Text; top: number; min: number };
  /** 장면 전환용 검은 막 (카메라 페이드는 아래층 맵을 덮지 못해서 막을 쓴다) */
  private curtain!: Phaser.GameObjects.Rectangle;
  /** 꿈에 들어가고 나올 때 하얗게 번지는 막 */
  private bloom!: Phaser.GameObjects.Rectangle;
  /** 이벤트 CG (대사창 뒤 화면 전체) */
  private cgView?: Phaser.GameObjects.Container;
  private cgId: string | null = null;
  /** 상처 sense: 화면 왼쪽 가장자리의 맥박 */
  private senseFx?: Phaser.GameObjects.Image;
  /** 강조 문장 big: 화면 가운데 큰 글 */
  private bigText!: Phaser.GameObjects.Text;
  private veil!: Phaser.GameObjects.Rectangle;
  /** 강조 문장 slow: 다 나온 뒤 이만큼 머문다 */
  private holdMs = 0;
  /** 강조 slow: 자동 진행일 때 다 나온 뒤 더 머무는 시간 */
  private extraWait = 0;
  /** 맵 없이 대화 화면 위에서 하는 연출 (꿈, 남의 기억, 막간) */
  private fx!: StoryFx;
  /** 아래층 맵 화면(Explore) 상태 */
  private mapState: 'off' | 'loading' | 'on' = 'off';
  /** 물건 살펴보기 독백 */
  private looking: { pages: string[][]; page: number; line: number; done: () => void; name?: string } | null = null;
  /** 맵 위 몹과의 짧은 전투가 끝나면 이동으로 돌아간다 */
  private fieldDone: ((r?: BattleResult) => void) | null = null;
  /** 강제 출전(force) 때문에 바꾼 파티: 전투 전 대기 목록 (전투가 끝나면 되돌린다) */
  private benchBefore: string[] | null = null;
  /** 이동 중에 여는 파티 선택 버튼 (동료가 5명 이상일 때) */
  private partyBtn?: Button;
  /** 되감기 기록 (전투·이동·해금·막 시작에서 비운다) */
  private hist: Hist[] = [];
  private backBtn?: Button;
  private choiceBtn?: Button;
  private lookBtn?: Button;
  /** 지금 걷고 있는 이동 구간 (조사 기록에서 펼쳐 둠) */
  private curSeg?: string;
  /** 선택지 기록 창이 열려 있으면 휠로 넘기기 */
  private choiceScroll?: (dy: number) => void;

  constructor() {
    super('Story');
  }

  init(data: StoryStartData) {
    this.start = data;
    this.mode = 'busy';
    this.staging = false;
    this.auto = false;
    this.lastShown = null;
    this.lastChoice = null;
    this.backlog = [];
    this.hist = [];
    this.choiceScroll = undefined;
    this.curSeg = undefined;
    this.entered = false;
    this.choiceButtons = [];
    this.activeChoices = [];
    this.overlay = undefined;
    this.logView = undefined;
    this.mapState = 'off';
    this.looking = null;
    this.itemView = undefined;
  }

  create() {
    const story = stories[this.start.story];
    if (!story) {
      console.error(`[story] 이야기를 찾을 수 없습니다: ${this.start.story}`);
      this.leave();
      return;
    }
    this.story = story;
    this.cameras.main.setBackgroundColor('#000000');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.hideMap());
    void this.loadPortraits().then(() => this.build());
  }

  // ---------- 준비 ----------

  /** 이 이야기에 나오는 인물의 몸·얼굴 그림 중 실제로 있는 파일만 불러온다 */
  private async loadPortraits() {
    const ids = new Set<string>();
    for (const s of this.story.scenes) for (const n of s.nodes) if ('speaker' in n && n.speaker) ids.add(n.speaker);
    // 컷인 눈매는 스탠딩 그림에서 잘라 쓴다
    for (const s of this.story.scenes) for (const n of s.nodes) if ('cutin' in n) ids.add(n.cutin);
    // 이벤트 CG (없으면 임시 그림)
    const cgs: string[] = [];
    for (const s of this.story.scenes) for (const n of s.nodes) if ('cg' in n && n.cg) cgs.push(n.cg);
    await loadCgs(this, cgs);
    // 엔딩 일러스트 (없으면 붉은 화면)
    await loadEndingArt(this, Object.keys(this.story.endings));
    const wanted: { key: string; url: string }[] = [];
    for (const id of ids) {
      const c = characters[id];
      if (!c) {
        console.warn(`[story] characters.json에 없는 인물 id: ${id}`);
        continue;
      }
      wanted.push({ key: bodyKey(id), url: `assets/portraits/${id}_body.png` });
      // 기본 표정은 몸 그림에 들어 있으므로 normal 얼굴은 불러오지 않는다
      for (const e of c.expressions) {
        if (e !== 'normal') wanted.push({ key: faceKey(id, e), url: `assets/portraits/${id}_face_${e}.png` });
      }
    }
    // 확대해서 보여 줄 아이템 그림 (없으면 보여 주지 않음)
    for (const s of this.story.scenes) for (const n of s.nodes) if ('item' in n && n.item) wanted.push({ key: itemKey(n.item), url: `assets/items/${n.item}.png` });
    // 남의 기억 컷 그림 (없으면 실루엣)
    for (const s of this.story.scenes)
      for (const n of s.nodes)
        if ('stage' in n) for (const c of STAGE.stages[n.stage]?.memory ?? []) wanted.push({ key: `memory_${c}`, url: `assets/memory/${c}.png` });
    const todo = wanted.filter((w, i) => !this.textures.exists(w.key) && wanted.findIndex((x) => x.key === w.key) === i);
    const found = await Promise.all(todo.map((w) => imageExists(w.url)));
    const toLoad = todo.filter((_, i) => found[i]);
    // 몸 그림도 없으면 회색 실루엣
    for (const id of ids) {
      if (characters[id] && !this.textures.exists(bodyKey(id)) && !toLoad.some((w) => w.key === bodyKey(id))) {
        // silhouette: false인 인물(그림이 아직 없는 새 인물)은 회색 실루엣 없이 이름표만
        if (characters[id].silhouette !== false) makeBodyPlaceholder(this, bodyKey(id), id);
      }
    }
    // 막간처럼 맵 없이 도트를 세우는 이야기는 도트 그림도 (맵 화면이 아직 안 불렀을 수 있음)
    const dots = this.story.scenes.some((s) => sceneKind(s.id) === 'interlude');
    if (dots) preloadBattle(this);
    for (const w of toLoad) this.load.image(w.key, w.url);
    if (this.load.list.size === 0) {
      if (dots) makeBattleAnims(this);
      return;
    }
    await new Promise<void>((resolve) => {
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        // 스탠딩은 고해상도 그림이라 줄일 때 부드럽게 (게임 전체는 도트용 pixelArt 설정)
        for (const w of toLoad) if (!w.key.startsWith('item_')) this.textures.get(w.key).setFilter(Phaser.Textures.FilterMode.LINEAR);
        if (dots) makeBattleAnims(this);
        resolve();
      });
      this.load.start();
    });
  }

  private build() {
    // 아래층 맵이 보이도록 카메라 배경은 투명. 맵이 없을 때는 bg 사각형이 배경
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.bg = this.add.rectangle(0, 0, W, H, 0x101018).setOrigin(0);
    this.curtain = this.add.rectangle(0, 0, W, H, 0x000000, 1).setOrigin(0).setDepth(28).setAlpha(0).setVisible(false);
    this.bloom = this.add.rectangle(0, 0, W, H, 0xfffaf0, 1).setOrigin(0).setDepth(28).setAlpha(0).setVisible(false);
    this.fx = new StoryFx(this);
    this.placeLabel = this.add
      .text(24, 20, '', { fontFamily: FONT, fontSize: '20px', color: '#cdb88a' })
      .setDepth(9)
      .setShadow(0, 2, '#000000', 4);

    this.portraits = { left: this.makePortrait('left'), right: this.makePortrait('right') };

    // 대사창
    const g = this.add.graphics();
    g.fillStyle(0x12121c, 0.94);
    g.fillRoundedRect(BOX.x, BOX.y, BOX.w, BOX.h, 12);
    g.lineStyle(3, GOLD, 1);
    g.strokeRoundedRect(BOX.x, BOX.y, BOX.w, BOX.h, 12);
    this.lineText = this.add.text(BOX.x + 32, BOX.y + 30, '', {
      fontFamily: FONT,
      fontSize: '25px',
      color: '#ffffff',
      lineSpacing: 10,
      wordWrap: { width: BOX.w - 64, useAdvancedWrap: true },
    });
    this.nextMark = this.add
      .text(BOX.x + BOX.w - 34, BOX.y + BOX.h - 28, '▼', { fontFamily: FONT, fontSize: '20px', color: '#cdb88a' })
      .setOrigin(0.5)
      .setVisible(false);
    this.tweens.add({ targets: this.nextMark, y: '+=6', duration: 400, yoyo: true, repeat: -1 });
    this.box = this.add.container(0, 0, [g, this.lineText, this.nextMark]).setDepth(5).setVisible(false);

    const plate = this.add.graphics();
    plate.fillStyle(0x2a2440, 1);
    plate.fillRoundedRect(0, 0, 200, 44, 8);
    plate.lineStyle(2, GOLD, 1);
    plate.strokeRoundedRect(0, 0, 200, 44, 8);
    this.nameText = this.add
      .text(100, 22, '', { fontFamily: FONT, fontSize: '23px', color: '#f3e7c4', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.nameBox = this.add.container(BOX.x + 24, BOX.y - 30, [plate, this.nameText]).setDepth(6).setVisible(false);

    // 독백: 화면 전체를 살짝 덮고 가운데에 문장
    const veil = this.add.rectangle(0, 0, W, H, 0x000000, 0.5).setOrigin(0);
    this.veil = veil;
    // 남의 기억이 번쩍이는 동안은 가림막을 옅게 (하얗게 타 버린 화면이 보이도록)
    this.fx.onMemory = (on) => veil.setAlpha(on ? 0.18 : this.veilAlpha());
    this.monoText = this.add.text(150, 150, '', {
      fontFamily: FONT,
      fontSize: '26px',
      color: '#f2f2f2',
      lineSpacing: 18,
      wordWrap: { width: W - 300, useAdvancedWrap: true },
    }).setShadow(0, 2, '#000000', 6);
    this.monoMark = this.add
      .text(W - 150, H - 110, '▼', { fontFamily: FONT, fontSize: '20px', color: '#cdb88a' })
      .setOrigin(0.5)
      .setVisible(false);
    this.tweens.add({ targets: this.monoMark, y: '+=6', duration: 400, yoyo: true, repeat: -1 });
    this.mono = this.add.container(0, 0, [veil, this.monoText, this.monoMark]).setDepth(6).setVisible(false);
    this.bigText = this.add
      .text(W / 2, H / 2 - 30, '', { fontFamily: FONT, fontSize: '42px', color: '#ffffff', fontStyle: 'bold', align: 'center', wordWrap: { width: W - 160, useAdvancedWrap: true } })
      .setOrigin(0.5)
      .setShadow(0, 3, '#000000', 10)
      .setDepth(7);
    this.makeEdgeTextures();

    // 오른쪽 위 메뉴
    const small = { w: 92, h: 36, fontSize: 17, depth: 9 };
    this.lookBtn = makeButton(this, W - 490, 30, '조사 (J)', () => this.openLooks(), small);
    this.logBtn = makeButton(this, W - 392, 30, '로그 (L)', () => this.openLog(), small);
    this.autoBtn = makeButton(this, W - 294, 30, '자동 (A)', () => this.toggleAuto(), small);
    this.skipBtn = makeButton(this, W - 196, 30, '스킵 (S)', () => this.skipToNextPlace(), small);
    makeButton(this, W - 72, 30, '타이틀로', () => this.confirmLeave(), { ...small, w: 112 });
    this.partyBtn = makeButton(this, W - 196, 30, '파티 (P)', () => this.openPartyFromMap(), small).setVisible(false);
    // 대사창 위 오른쪽: 되감기, 선택지 기록
    this.backBtn = makeButton(this, W - 268, BOX.y - 24, '◀ 뒤로', () => this.rewind(), small);
    this.choiceBtn = makeButton(this, W - 152, BOX.y - 24, '선택지 (C)', () => this.openChoiceLog(), { ...small, w: 120 });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      this.onPress();
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (this.choiceScroll) this.choiceScroll(dy);
      else if (this.logView) this.scrollLog(dy);
      else if (dy < 0) this.openLog();
    });
    this.input.keyboard!.on('keydown', (ev: KeyboardEvent) => this.onKey(ev));

    if (this.start.previewEnding) {
      this.box.setAlpha(0);
      this.nameBox.setAlpha(0);
      this.mono.setAlpha(0);
      this.showEnding(this.start.previewEnding, true);
      return;
    }
    if (this.start.finished) {
      this.showChapter(Object.keys(this.story.chapters)[0] ?? '');
      return;
    }
    if (this.start.choiceAt !== undefined) {
      // 선택지 기록에서 돌아왔다: 그 선택지 화면과 상태로
      const e = save.choiceLog[this.start.choiceAt];
      const si = e ? this.story.scenes.findIndex((s) => s.id === e.scene) : -1;
      if (e && si >= 0 && 'choices' in (this.story.scenes[si].nodes[e.node] ?? {})) {
        const base = gameState.snapshot();
        if (e.walks !== undefined) save.trimWalks(e.walks);
        this.curtain.setVisible(true).setAlpha(1);
        this.restoreHist({
          scene: si,
          node: e.node,
          mono: 0,
          state: { ...base, ...e.state, progress: e.state.progress ?? base.progress },
          backlog: 0,
          log: this.start.choiceAt,
          view: e.view as HistView,
        });
        return;
      }
      console.error('[story] 선택지 기록의 자리를 찾을 수 없습니다', e);
    }
    const first = this.start.scene ? this.story.scenes.findIndex((s) => s.id === this.start.scene) : 0;
    if (first < 0) console.warn(`[story] 없는 장면 id: ${this.start.scene} → 처음부터`);
    if (this.start.scene) this.enterScene(Math.max(0, first), first < 0 ? 0 : this.start.node ?? 0);
    else {
      // 챕터 화면 도중에 새로고침해도 이어하기가 남도록 먼저 저장
      save.setCheckpoint({ story: this.story.id, scene: this.story.scenes[0].id, ...gameState.snapshot() });
      // 이 막을 처음부터: 그 막의 선택지 기록은 새로 (프롤로그면 전부)
      save.clearChoices(this.story.id, this.story.id === 'prologue');
      save.clearWalks(this.story.id, this.story.id === 'prologue');
      this.showChapterCard(() => this.enterScene(0));
    }
  }

  /** 새로 시작할 때 검은 화면에 "챕터: 프롤로그"를 띄운다. 클릭이나 키로 바로 넘길 수 있다 */
  private showChapterCard(then: () => void) {
    const name = this.story.title.split(':')[0].trim();
    const black = this.add.rectangle(0, 0, W, H, 0x000000, 1).setOrigin(0).setInteractive();
    const text = this.add
      .text(W / 2, H / 2, `챕터: ${name}`, { fontFamily: FONT, fontSize: '46px', color: '#e0c27a', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setAlpha(0)
      .setShadow(0, 4, '#000000', 10);
    this.overlay = this.add.container(0, 0, [black, text]).setDepth(30);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      hold.remove();
      this.input.keyboard!.off('keydown', finish);
      this.tweens.killTweensOf(text);
      this.tweens.add({
        targets: [black, text],
        alpha: 0,
        duration: 500,
        onComplete: () => {
          this.closeOverlay();
          then();
        },
      });
    };
    this.tweens.add({ targets: text, alpha: 1, duration: 700, delay: 300 });
    const hold = this.time.delayedCall(2600, finish);
    this.time.delayedCall(400, () => {
      black.once('pointerdown', finish);
      this.input.keyboard!.on('keydown', finish);
    });
  }

  // ---------- 장면 ----------

  private get scene_(): StorySceneData {
    return this.story.scenes[this.sceneIdx];
  }

  /** @param startNode 이어하기: 장면 안에서 시작할 대사 번호 */
  private enterScene(i: number, startNode = 0) {
    const sc = this.story.scenes[i];
    if (!sc) {
      console.warn('[story] 다음 장면이 없습니다. 타이틀로 돌아갑니다');
      return this.leave();
    }
    this.mode = 'busy';
    this.clearText();
    const first = !this.entered;
    const prevKind = first ? '' : sceneKind(this.scene_?.id);
    const kind = sceneKind(sc.id);
    this.entered = true;
    this.sceneIdx = i;
    this.nodeIdx = Math.min(startNode, sc.nodes.length);
    if (this.nodeIdx === 0) gameState.applyEffects(sc.effects);
    this.saveHere();

    // 이전 장면 인물은 퇴장, 맵과 무대는 이 장면(중간부터면 그 지점)에 맞춘다
    const swap = (after: () => void) => {
      for (const side of ['left', 'right'] as Side[]) this.hidePortrait(side, true);
      this.bg.setFillStyle(hex(sc.color));
      // 장면 중간부터 시작하면 그 앞에서 바뀐 장소를 따른다
      const moved = sc.nodes.slice(0, this.nodeIdx).filter((n) => 'place' in n).pop();
      this.setPlace(moved && 'place' in moved ? moved.place : sc.place);
      // 꿈 화면, 막간의 빛줄기·도트 (맵 없이 대화 화면에서)
      this.fx.clear();
      const prior = sc.nodes.slice(0, this.nodeIdx);
      const cgN = prior.filter((n) => 'cg' in n).pop();
      this.showCg(cgN && 'cg' in cgN ? cgN.cg : null, true);
      const wN = prior.filter((n) => 'wound' in n && (n.wound === 'sense' || n.wound === 'off')).pop();
      this.setSense(!!wN && 'wound' in wN && wN.wound === 'sense', true);
      this.setDreamLook(kind === 'dream');
      if (kind === 'dream') this.fx.setDream(sc.color);
      for (const d of this.mapSteps(i, this.nodeIdx, true)) if (d) {
        this.fx.apply(d, true);
        this.stageSound(d, true);
      }
      this.applyMap(this.mapSteps(i, this.nodeIdx), true, after);
    };
    const reveal = (ms: number, wait: number) => {
      this.curtainOut(ms);
      this.time.delayedCall(wait, () => this.runNode());
    };
    const show = () => (kind === 'interlude' ? this.interludeCard(() => reveal(500, 500)) : reveal(first ? 500 : 320, first ? 500 : 400));
    if (kind === 'dream' && prevKind !== 'dream') return this.dreamIn(first, swap);
    if (prevKind === 'dream' && kind !== 'dream') return this.dreamOut(swap, show);
    if (first) {
      this.curtain.setVisible(true).setAlpha(1);
      swap(show);
      return;
    }
    this.curtainIn(260, () => swap(show));
  }

  /**
   * 꿈에 들어간다: 지금 화면이 흐려지며(0.8초) 하얗게 번진 뒤 꿈 화면이 떠오른다
   */
  private dreamIn(first: boolean, swap: (after: () => void) => void) {
    const fadeIn = () => {
      this.tweens.add({ targets: this.bloom, alpha: 0, duration: 900, onComplete: () => this.bloom.setVisible(false) });
      this.time.delayedCall(800, () => this.runNode());
    };
    this.tweens.killTweensOf(this.bloom);
    if (first) {
      this.bloom.setVisible(true).setAlpha(1);
      return swap(fadeIn);
    }
    // 흐림 (WebGL에서만. 캔버스면 하얗게 번지기만)
    const cams = [this.cameras.main];
    if (this.mapState === 'on') cams.push(this.scene.get('Explore').cameras.main);
    const blurs = cams.map((c) => c.postFX?.addBlur(1, 1, 1, 0));
    this.tweens.addCounter({
      from: 0,
      to: 2.5,
      duration: 800,
      onUpdate: (t) => blurs.forEach((b) => b && (b.strength = t.getValue() ?? 0)),
    });
    this.bloom.setVisible(true).setAlpha(0);
    this.tweens.add({
      targets: this.bloom,
      alpha: 1,
      delay: 350,
      duration: 650,
      onComplete: () => {
        cams.forEach((c, k) => blurs[k] && c.postFX?.remove(blurs[k]!));
        swap(fadeIn);
      },
    });
  }

  /** 꿈에서 나온다: 꿈 화면이 하얗게 번지며 사라지고, 지금 장면이 떠오른다 */
  private dreamOut(swap: (after: () => void) => void, show: () => void) {
    this.tweens.killTweensOf(this.bloom);
    this.bloom.setVisible(true).setAlpha(0);
    this.tweens.add({
      targets: this.bloom,
      alpha: 1,
      duration: 700,
      onComplete: () =>
        swap(() => {
          // 하얀 막 → 검은 막으로 바꿔 끼우고 평소처럼 페이드 인
          this.curtain.setVisible(true).setAlpha(0);
          this.tweens.add({ targets: this.bloom, alpha: 0, duration: 500, onComplete: () => this.bloom.setVisible(false) });
          this.tweens.add({ targets: this.curtain, alpha: 1, duration: 500, onComplete: show });
        }),
    });
  }

  /** 막간: 검은 화면 가운데 "막간" 1.5초 */
  private interludeCard(then: () => void) {
    const t = this.add
      .text(W / 2, H / 2, '막간', { fontFamily: FONT, fontSize: '44px', color: '#e0c27a', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(29)
      .setAlpha(0)
      .setShadow(0, 4, '#000000', 10);
    this.tweens.chain({
      targets: t,
      tweens: [
        { alpha: 1, duration: 350 },
        { alpha: 1, duration: 800 },
        { alpha: 0, duration: 350 },
      ],
      onComplete: () => {
        t.destroy();
        then();
      },
    });
  }

  /** 꿈속 스탠딩: 세피아를 씌우고 조금 밝고 흐리게 (WebGL에서만) */
  private setDreamLook(on: boolean) {
    for (const p of Object.values(this.portraits)) {
      for (const img of [p.body, p.face]) {
        const fx = img.preFX;
        if (!fx) continue;
        fx.clear();
        if (!on) continue;
        const cm = fx.addColorMatrix();
        cm.sepia();
        cm.brightness(1.18, true);
        fx.addBlur(0, 1, 1, 0.6);
      }
    }
  }

  // ---------- 맵 (아래층 Explore 장면) ----------

  /** 검은 막 내리기 / 걷기 */
  private curtainIn(ms: number, then: () => void) {
    this.tweens.killTweensOf(this.curtain);
    this.curtain.setVisible(true);
    this.tweens.add({ targets: this.curtain, alpha: 1, duration: ms, onComplete: then });
  }
  private curtainOut(ms: number) {
    this.tweens.killTweensOf(this.curtain);
    this.tweens.add({ targets: this.curtain, alpha: 0, duration: ms, onComplete: () => this.curtain.setVisible(false) });
  }

  /**
   * 장면 i의 대사 node 직전까지의 무대 변화 목록 (이어하기·장면 전환에서 맵을 다시 만든다)
   * null = 맵 없음. map이 있는 무대에서 인물을 새로 세운다
   */
  private mapSteps(i: number, node: number, raw = false): (StageDef | null)[] {
    const sc = this.story.scenes[i];
    if (raw) {
      // 대화 화면 연출용: 장면 무대와 그 뒤 stage들을 그대로
      const id = STAGE.scenes[`${this.story.id}:${sc.id}`];
      const defs: (StageDef | null)[] = [id ? STAGE.stages[id] ?? null : null];
      for (const n of sc.nodes.slice(0, node)) if ('stage' in n) defs.push(STAGE.stages[n.stage] ?? null);
      return defs;
    }
    // 장면 무대: "이야기:장면" 이름이 먼저 (막마다 장면 ID가 겹침), 프롤로그는 장면 ID만으로도
    const first = STAGE.scenes[`${this.story.id}:${sc.id}`] ?? (this.story.id === 'prologue' ? STAGE.scenes[sc.id] : undefined);
    const steps: (StageDef | null)[] = [first ? STAGE.stages[first] ?? null : null];
    for (const n of sc.nodes.slice(0, node)) {
      if ('stage' in n) steps.push(STAGE.stages[n.stage]?.dark ? null : STAGE.stages[n.stage] ?? {});
      else if ('place' in n && STAGE.places[n.place]) steps.push(this.placeStage(n.place));
      else if ('explore' in n) {
        const after = STAGE.segments[n.explore]?.after;
        if (after) steps.push(STAGE.stages[after]?.dark ? null : STAGE.stages[after] ?? {});
      }
    }
    return steps;
  }

  private placeStage(place: string): StageDef | null {
    const p = STAGE.places[place];
    if (!p?.map) return null;
    return p.stage ? { ...STAGE.stages[p.stage], map: p.map } : { map: p.map };
  }

  /** 무대 변화 목록을 맵에 적용 (마지막으로 맵이 정해진 곳부터) */
  private applyMap(steps: (StageDef | null)[], instant: boolean, done: () => void) {
    let from = -1;
    steps.forEach((s, k) => {
      if (s === null || s.map) from = k;
    });
    if (from < 0 || steps[from] === null) {
      this.hideMap();
      return done();
    }
    this.withMap((m) => {
      for (const d of steps.slice(from)) m.applyStage(d!, { reset: !!d!.map, instant });
      done();
    });
  }

  /** 맵 화면을 띄우고(없으면) fn 실행 */
  private withMap(fn: (m: ExploreScene) => void) {
    const m = this.scene.get('Explore') as ExploreScene;
    this.bg.setVisible(false);
    if (this.mapState === 'on' && m.ready) return fn(m);
    m.events.once('mapready', () => {
      this.mapState = 'on';
      fn(m);
    });
    if (this.mapState === 'off') {
      this.mapState = 'loading';
      this.scene.launch('Explore', { host: this } satisfies ExploreStart);
      this.scene.sendToBack('Explore');
    }
  }

  /** 화면 전체 효과: 번쩍임(색), 흔들림(세기) */
  /** 무대의 소리: 효과음 한 번(건너뛸 때는 안 냄), BGM·환경음 바꾸기. 파일이 없으면 무음 */
  private stageSound(d: { se?: string; bgm?: string | null; amb?: string | null; edge?: string | null }, instant: boolean) {
    if (d.edge !== undefined) this.setEdge(d.edge, instant);
    if (d.se && !instant) void playSe(this, d.se);
    if (d.bgm !== undefined) void playLoop(this, 'bgm', d.bgm);
    if (d.amb !== undefined) void playLoop(this, 'amb', d.amb);
  }

  private screenFx(fx: { flash?: string; shake?: number }) {
    if (fx.flash) {
      const c = Phaser.Display.Color.HexStringToColor(fx.flash);
      this.cameras.main.flash(220, c.red, c.green, c.blue);
    }
    if (fx.shake) {
      this.cameras.main.shake(320, fx.shake);
      if (this.mapState === 'on') this.scene.get('Explore').cameras.main.shake(320, fx.shake);
    }
  }

  private hideMap() {
    if (this.mapState !== 'off') this.scene.stop('Explore');
    this.mapState = 'off';
    this.bg?.setVisible(true);
  }

  /** 물건 살펴보기: 레온의 독백을 화면(page)별로, 한 줄씩 (대본 독백과 같은 방식) */
  playMonologue(pages: string[][], done: () => void) {
    this.looking = { pages: pages.filter((p) => p.length), page: 0, line: 0, done };
    if (!this.looking.pages.length) return this.endLook();
    this.showLookLine();
  }

  /** 행인의 한 줄 대사: 이름표만 있는 대사창 (경험치 없음) */
  playTalk(name: string, text: string, done: () => void) {
    this.looking = { pages: [[text]], page: 0, line: 0, done, name };
    this.showLookLine();
  }

  /** 맵 위의 몹 무리와 짧은 전투. 몹이 있던 자리를 가운데로 그 맵 위에서 싸운다. 이기면 그 자리 이동으로 */
  /** 1막부터는 레온의 어깨에 상처가 있다 (맵의 레온 도트에 빛 점) */
  wounded() {
    return this.story.id !== 'prologue';
  }

  fieldBattle(battle: string, done: (r?: BattleResult) => void, pos?: { x: number; y: number }) {
    this.fieldDone = done;
    // 어두운 수로에서 처음 싸울 때: 엘리시아가 빛을 밝힌 뒤 전투 (이후로는 계속 밝다)
    const m = this.mapState === 'on' ? (this.scene.get('Explore') as ExploreScene) : null;
    if (m?.needsLight())
      return this.playTalk('엘리시아', '잠깐만요. 이렇게 깜깜해서야 칼끝도 안 보이겠네요. …빛을 좀 밝혀 둘게요.', () => {
        this.mode = 'busy';
        m.castLight(() => this.startBattle({ battle, field: pos }));
      });
    this.startBattle({ battle, field: pos });
  }

  private showLookLine() {
    const L = this.looking!;
    if (L.name) {
      this.mono.setVisible(false);
      this.box.setVisible(true);
      this.nextMark.setVisible(false);
      this.highlight(null, DIM_SPEAK);
      this.nameText.setText(L.name);
      this.nameBox.setVisible(true);
      const t = L.pages[0][0];
      this.backlog.push({ name: L.name, text: t });
      this.typeText(t, (x) => this.lineText.setText(x));
      return;
    }
    const page = L.pages[L.page];
    const before = page.slice(0, L.line);
    const line = page[L.line];
    this.box.setVisible(false);
    this.nameBox.setVisible(false);
    this.mono.setVisible(true).setAlpha(1);
    this.monoMark.setVisible(false);
    this.backlog.push({ text: line });
    const head = before.length ? `${before.join('\n')}\n` : '';
    this.typeText(line, (s) => this.monoText.setText(head + s));
  }

  /** 독백 가림막: CG가 떠 있으면 그림이 보이도록 옅게 */
  private veilAlpha() {
    return this.cgView ? 0.25 : 0.5;
  }

  // ---------- 추가 연출: 이벤트 CG, 컷인, 상처 반응 ----------

  /** 이벤트 CG 띄우기 (null이면 닫기). 한 번 본 CG는 타이틀의 CG 회상에 남는다 */
  private showCg(id: string | null, instant = false) {
    if (id === this.cgId && (id === null || this.cgView)) return;
    const old = this.cgView;
    this.cgView = undefined;
    this.cgId = id;
    if (old) {
      this.tweens.killTweensOf(old);
      if (instant) old.destroy();
      else this.tweens.add({ targets: old, alpha: 0, duration: 600, onComplete: () => old.destroy() });
    }
    // 그림 파일이 없으면 CG 없이 진행
    if (!id || !this.textures.exists(cgKey(id))) return;
    save.markCg(id);
    for (const side of ['left', 'right'] as Side[]) this.hidePortrait(side, instant);
    const black = this.add.rectangle(0, 0, W, H, 0x000000, 1).setOrigin(0);
    const img = coverFit(this.add.image(0, 0, cgKey(id)), W, H);
    this.cgView = this.add.container(0, 0, [black, img]).setDepth(4).setAlpha(instant ? 1 : 0);
    if (!instant) this.tweens.add({ targets: this.cgView, alpha: 1, duration: 600 });
    if (this.mono.visible) this.veil.setAlpha(this.veilAlpha());
  }

  /** 화면 가장자리를 한 색으로 물들여 둔다 (회상: 어둡게, 과거: 옅은 주황). null이면 걷음 */
  private edgeFx?: Phaser.GameObjects.Image;
  private setEdge(color: string | null, instant: boolean) {
    const old = this.edgeFx;
    this.edgeFx = undefined;
    if (old) {
      this.tweens.killTweensOf(old);
      if (instant) old.destroy();
      else this.tweens.add({ targets: old, alpha: 0, duration: 600, onComplete: () => old.destroy() });
    }
    if (!color) return;
    this.makeEdgeTextures();
    const e = this.add.image(0, 0, 'edge_all').setOrigin(0).setDepth(26).setTint(Number.parseInt(color.slice(1), 16)).setAlpha(instant ? 0.8 : 0);
    if (!instant) this.tweens.add({ targets: e, alpha: 0.8, duration: 700 });
    this.edgeFx = e;
  }

  /** 화면 가장자리 빛 그림: 사방(edge_all), 왼쪽만(edge_left) */
  private makeEdgeTextures() {
    if (!this.textures.exists('edge_all')) {
      const t = this.textures.createCanvas('edge_all', W, H)!;
      const ctx = t.getContext();
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.62, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0.95)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      t.refresh();
    }
    if (!this.textures.exists('edge_left')) {
      const t = this.textures.createCanvas('edge_left', 160, H)!;
      const ctx = t.getContext();
      const g = ctx.createLinearGradient(0, 0, 160, 0);
      g.addColorStop(0, 'rgba(235,242,255,0.9)');
      g.addColorStop(1, 'rgba(235,242,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 160, H);
      t.refresh();
    }
  }

  /** 상처 반응: 맵의 레온 어깨 빛 + 화면 가장자리 */
  private woundReact(mode: 'flicker' | 'flare' | 'sense' | 'off') {
    if (mode === 'sense' || mode === 'off') return this.setSense(mode === 'sense');
    if (this.mapState === 'on') (this.scene.get('Explore') as ExploreScene).woundFx(mode);
    if (mode === 'flicker') {
      // 화면 왼쪽 가장자리가 아주 희미하게 한 번 밝아진다 (소리 없음)
      const f = this.add.image(0, 0, 'edge_left').setOrigin(0).setDepth(27).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: f, alpha: 0.22, duration: 300, yoyo: true, hold: 120, ease: 'Sine.inOut', onComplete: () => f.destroy() });
      return;
    }
    // 크게 맥박: 화면 가장자리가 하얗게 번졌다 걷힌다
    void playSe(this, 'se_wound_pulse');
    const e = this.add.image(0, 0, 'edge_all').setOrigin(0).setDepth(27).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: e, alpha: 1, duration: 140, ease: 'Quad.out',
      onComplete: () => this.tweens.add({ targets: e, alpha: 0, duration: 900, ease: 'Quad.in', onComplete: () => e.destroy() }),
    });
  }

  /** 상처 sense: 화면 왼쪽 가장자리가 희미하게 계속 맥박친다 (빛의 기둥과 같은 박자) */
  private setSense(on: boolean, instant = false) {
    if (this.mapState === 'on') (this.scene.get('Explore') as ExploreScene).woundFx(on ? 'sense' : 'off');
    if (on === !!this.senseFx) return;
    if (on) {
      // 2초마다 맥박 (맵의 어깨 빛과 같은 시계)
      const e = this.add.image(0, 0, 'edge_left').setOrigin(0).setDepth(27).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
      this.senseFx = e;
      this.events.on(Phaser.Scenes.Events.UPDATE, this.senseTick, this);
      return;
    }
    const e = this.senseFx!;
    this.senseFx = undefined;
    this.events.off(Phaser.Scenes.Events.UPDATE, this.senseTick, this);
    this.tweens.killTweensOf(e);
    if (instant) e.destroy();
    else this.tweens.add({ targets: e, alpha: 0, duration: 600, onComplete: () => e.destroy() });
  }

  private senseTick() {
    this.senseFx?.setAlpha(0.04 + 0.32 * senseBeat(this.game.loop.time));
  }

  /**
   * 컷인: 화면 가운데를 가로지르는 띠(180px)가 0.15초에 미끄러져 들어와 0.5초 머문 뒤 반대쪽으로 빠진다.
   * 띠 안에는 스탠딩 그림의 눈 부분을 크게 (자리는 characters.json의 cutin). 그림이나 자리가 없으면 생략
   */
  private showCutin(n: CutinNode, done: () => void) {
    const key = bodyKey(n.cutin);
    const eye = characters[n.cutin]?.cutin;
    // 회색 실루엣(임시 그림)이거나 눈 자리가 없으면 생략
    if (!eye || !this.textures.exists(key) || this.textures.get(key).getSourceImage().width === PORTRAIT_W) return done();
    this.mode = 'busy';
    this.clearText();
    const bandH = 180;
    const cy = H / 2;
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 1).setOrigin(0).setDepth(19).setAlpha(0);
    const parts: Phaser.GameObjects.GameObject[] = [this.add.rectangle(0, 0, W, bandH, 0x08060c, 1).setOrigin(0, 0.5)];
    // 눈 자리를 띠 가운데에: 보이는 부분만 잘라서 키운다
    const k = eye.scale;
    const cw = W / k;
    const ch = bandH / k;
    const img = this.add.image(0, 0, key).setOrigin(0, 0);
    const x0 = eye.x - cw / 2;
    const y0 = eye.y - ch / 2;
    img.setCrop(x0, y0, cw, ch).setScale(k).setPosition(-x0 * k, -bandH / 2 - y0 * k);
    parts.push(img);
    if (n.tint === 'gold') {
      // 붉은 금빛 눈매와 번쩍임
      img.setTint(0xffd27a, 0xffd27a, 0xff8a50, 0xff8a50);
      const flash = this.add.rectangle(0, 0, W, bandH, 0xffe2a0, 1).setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      parts.push(flash);
      this.tweens.add({ targets: flash, alpha: { from: 0.85, to: 0 }, duration: 380, delay: 170, ease: 'Quad.out' });
    }
    parts.push(this.add.rectangle(0, -bandH / 2, W, 3, GOLD).setOrigin(0, 0.5), this.add.rectangle(0, bandH / 2, W, 3, GOLD).setOrigin(0, 0.5));
    if (n.caption) {
      parts.push(
        this.add
          .text(W - 36, bandH / 2 - 14, n.caption, { fontFamily: FONT, fontSize: '17px', color: '#f3e7c4' })
          .setOrigin(1, 1)
          .setShadow(0, 2, '#000', 4),
      );
    }
    const band = this.add.container(W, cy, parts).setDepth(20);
    this.tweens.add({ targets: dim, alpha: 0.45, duration: 150 });
    this.tweens.add({ targets: band, x: 0, duration: 150, ease: 'Quad.out' });
    this.time.delayedCall(650, () => {
      this.tweens.add({ targets: band, x: -W, duration: 150, ease: 'Quad.in', onComplete: () => band.destroy() });
      this.tweens.add({ targets: dim, alpha: 0, duration: 150, onComplete: () => dim.destroy() });
    });
    this.time.delayedCall(800, done);
  }

  private lookNext() {
    const L = this.looking!;
    L.line++;
    if (L.line >= L.pages[L.page].length) {
      L.page++;
      L.line = 0;
      if (L.page >= L.pages.length) return this.endLook();
    }
    this.showLookLine();
  }

  private endLook() {
    const done = this.looking?.done;
    this.looking = null;
    this.clearText();
    this.mode = 'explore';
    done?.();
  }

  /** 장소 이름: 왼쪽 위에 계속 표시 */
  private setPlace(place: string) {
    this.place = place;
    this.placeLabel.setText(place ? `◆ ${place}` : '');
  }

  /** 이어하기 지점: 지금 장면과 대사 번호. 대사의 효과가 붙기 전에 저장한다 */
  private saveHere() {
    save.setCheckpoint({
      story: this.story.id,
      scene: this.scene_.id,
      ...(this.nodeIdx ? { node: this.nodeIdx } : {}),
      ...gameState.snapshot(),
    });
  }

  private runNode() {
    const sc = this.scene_;
    const node: StoryNode | undefined = sc.nodes[this.nodeIdx];
    this.monoIdx = 0;
    // 전투에서 지면(게임 오버) 이 저장부터 다시 시작한다
    if (node && ('text' in node || 'monologue' in node || 'choices' in node || 'battle' in node || 'explore' in node)) this.saveHere();
    // 되감기: 대사·독백·선택지 화면은 기록, 전투·이동·해금·막 끝은 경계
    if (node && ('text' in node || 'monologue' in node || 'choices' in node)) this.pushHist();
    else if (node && ('battle' in node || 'explore' in node || 'hpZero' in node || 'unlock' in node || 'ending' in node || 'chapter' in node)) this.hist = [];
    if (!node) {
      // 장면 끝: 다음 장면으로 (선택지로만 들어가는 장면은 건너뛴다)
      let next = this.sceneIdx + 1;
      while (this.story.scenes[next]?.branch) next++;
      return this.enterScene(next);
    }
    if ('text' in node) {
      gameState.applyEffects(node);
      this.showLine(node);
    } else if ('monologue' in node) {
      this.showMonoLine();
    } else if ('choices' in node) {
      this.showChoices(node.choices);
    } else if ('battle' in node) {
      this.startBattle({ battle: node.battle });
    } else if ('explore' in node) {
      this.startExplore(node.explore);
    } else if ('hpZero' in node) {
      this.startBattle({ battle: 'hpZero', hpZero: { who: node.hpZero, by: node.by ?? 'mob_royal_knight', count: node.count ?? 3 } });
    } else if ('stage' in node) {
      const d = STAGE.stages[node.stage];
      if (d?.screen) this.screenFx(d.screen);
      if (d) this.fx.apply(d);
      if (d) this.stageSound(d, false);
      if (d?.dark) {
        // 맵을 내리고 검은 화면 위에서 이어 간다
        this.mode = 'busy';
        return this.curtainIn(450, () => {
          this.clearText();
          this.hideMap();
          this.curtainOut(500);
          this.time.delayedCall(500, () => this.nextNode());
        });
      }
      if (d && (d.map || this.mapState !== 'off')) this.withMap((m) => m.applyStage(d, { reset: !!d.map }));
      else if (!d) console.warn(`[story] stage.json에 없는 무대: ${node.stage}`);
      if (!d?.wait) return this.nextNode();
      // 대사창을 잠깐 내리고 맵에서 벌어지는 일을 보여 준다
      this.mode = 'busy';
      this.clearText();
      for (const side of ['left', 'right'] as Side[]) this.hidePortrait(side);
      this.staging = true;
      this.time.delayedCall(d.wait, () => {
        this.staging = false;
        this.nextNode();
      });
    } else if ('place' in node) {
      this.setPlace(node.place);
      if (!STAGE.places[node.place]) return this.nextNode();
      // 맵이 바뀌는 장소: 검은 막을 내렸다 올린다
      this.mode = 'busy';
      this.curtainIn(450, () => {
        this.clearText();
        for (const side of ['left', 'right'] as Side[]) this.hidePortrait(side, true);
        this.applyMap([this.placeStage(node.place)], true, () => {
          this.curtainOut(600);
          this.time.delayedCall(550, () => this.nextNode());
        });
      });
    } else if ('unlock' in node) {
      this.showUnlock(node.unlock);
    } else if ('join' in node) {
      joinParty(node.join);
      this.nextNode();
    } else if ('leave' in node) {
      leaveParty(node.leave);
      this.nextNode();
    } else if ('party' in node) {
      // 동료가 5명 이상일 때만 파티 선택 화면 (처음 한 번은 안내 글과 함께)
      if (gameState.progress.party.length <= ACTIVE_MAX) return this.nextNode();
      this.mode = 'busy';
      this.toggleAuto(false);
      this.clearText();
      for (const side of ['left', 'right'] as Side[]) this.hidePortrait(side);
      this.openParty({ guide: PARTY_GUIDE, done: () => this.nextNode() });
    } else if ('branch' in node) {
      // 자동 분기: 처음 맞는 장면으로. 없으면 다음 ## 장면 (runNode의 장면 끝 처리)
      const hit = node.branch.find((b) => gameState.check(b.condition));
      const target = hit ? this.story.scenes.findIndex((s) => s.id === hit.next) : -1;
      if (hit && target < 0) console.error(`[story] 자동 분기의 장면이 없습니다: ${hit.next}`);
      if (target >= 0) return this.enterScene(target);
      this.nodeIdx = this.scene_.nodes.length;
      this.runNode();
    } else if ('guest' in node) {
      addGuest(node.guest);
      this.nextNode();
    } else if ('costume' in node) {
      this.setCostume(node.who ?? 'leon', node.costume);
      this.nextNode();
    } else if ('item' in node) {
      this.showItem(node.item);
      this.nextNode();
    } else if ('cg' in node) {
      this.showCg(node.cg);
      this.nextNode();
    } else if ('wound' in node) {
      this.woundReact(node.wound);
      this.nextNode();
    } else if ('cutin' in node) {
      this.showCutin(node, () => this.nextNode());
    } else if ('ending' in node) {
      gameState.applyEffects(node);
      this.showEnding(node.ending);
    } else if ('chapter' in node) {
      gameState.applyEffects(node);
      this.showChapter(node.chapter);
    }
  }

  // ---------- 전투 ----------

  /** 대사창을 닫고 전투 화면으로. 끝나면 결과에 따라 다음 대사·장면·엔딩, 또는 게임 오버 */
  private startBattle(b: Omit<BattleStart, 'onEnd' | 'map'>) {
    this.mode = 'busy';
    this.toggleAuto(false);
    // 강제 출전: 대기 중이고 파티가 이미 4명이면 한 명을 빼도록 안내 (전투가 끝나면 원래 파티로)
    const force = (battlesData as unknown as Record<string, { force?: string[] }>)[b.battle]?.force ?? [];
    const p = gameState.progress;
    const need = b.hpZero ? [] : force.filter((id) => p.party.includes(id) && !activeParty().includes(id));
    if (need.length && activeParty().length >= ACTIVE_MAX) {
      this.benchBefore ??= [...p.bench];
      p.bench = p.bench.filter((id) => !need.includes(id));
      const names = need.map((id) => characters[id]?.name ?? id).join(', ');
      this.clearText();
      for (const side of ['left', 'right'] as Side[]) this.hidePortrait(side);
      return this.openParty({ guide: `${names}은(는) 이번 싸움에 반드시 나갑니다. 대신 쉴 동료를 한 명 빼 주세요`, force: need, done: () => this.startBattle(b) });
    }
    // 맵이 떠 있으면 화면을 바꾸지 않고, 카메라만 전투장으로 옮겨 그 자리에서 싸운다
    const m = this.mapState === 'on' ? (this.scene.get('Explore') as ExploreScene) : null;
    let center = m?.battleCenter(b.battle, b.hpZero?.who);
    // 필드 몹: 몹 자리를 가운데로 한 전투장
    if (m && b.field) {
      const ar = (battlesData as unknown as Record<string, { arena: { w: number; h: number } }>)[b.battle]?.arena;
      if (ar) {
        b = { ...b, at: m.fieldArena(ar.w, ar.h, b.field.x, b.field.y) };
        center = { x: b.at!.x + ar.w / 2, y: b.at!.y + ar.h / 2 };
      }
    }
    // 따로 그린 전투장은 쓰지 않는다: 맵이 꺼져 있거나 다른 맵이면, 그 전투의 맵을 띄워 그 위에서 싸운다
    const arMap = (battlesData as unknown as Record<string, { arena: { map?: string } }>)[b.battle]?.arena.map;
    if (!center && !b.hpZero && arMap) {
      // 상시 전투 기준으로는 앞 대사의 장소 바뀜에서 이미 이 맵이어야 한다. 아니면 화면을 바꿀 수밖에 없음 (점검 목록용)
      console.warn(`[상시 전투] 맵이 달라 화면을 바꾼 전투: ${b.battle} (지금 ${m?.mapId ?? '맵 없음'} → ${arMap})`);
      this.clearText();
      for (const side of ['left', 'right'] as Side[]) this.hidePortrait(side, true);
      return this.curtainIn(350, () =>
        this.withMap((mm) => {
          if (mm.mapId !== arMap) mm.applyStage({ map: arMap }, { reset: true, instant: true });
          this.curtainOut(350);
          const c = mm.battleCenter(b.battle);
          if (c) mm.lookAt(c.x, c.y, 1, () => undefined);
          this.time.delayedCall(380, () => {
            this.scene.launch('Battle', { ...b, map: mm, onEnd: (r: BattleResult) => this.afterBattle(r) } satisfies BattleStart);
            this.scene.sleep();
          });
        }),
      );
    }
    if (!center) console.error(`[story] 맵 위에서 싸울 수 없는 전투: ${b.battle} (battles.json arena.map과 맵의 arena 구역 필요)`);
    if (m && center) {
      // 상시 전투: 카메라를 전투장으로 옮기지 않고 그 자리에서 바로 시작. 카메라는 전투가 싸움 가운데를 부드럽게 따라감
      this.clearText();
      for (const side of ['left', 'right'] as Side[]) this.hidePortrait(side);
      this.scene.launch('Battle', { ...b, map: m, onEnd: (r: BattleResult) => this.afterBattle(r) } satisfies BattleStart);
      this.scene.sleep();
      return;
    }
    this.curtainIn(350, () => {
      this.clearText();
      for (const side of ['left', 'right'] as Side[]) this.hidePortrait(side, true);
      if (this.mapState !== 'off') this.scene.sleep('Explore');
      this.scene.launch('Battle', { ...b, onEnd: (r: BattleResult) => this.afterBattle(r) } satisfies BattleStart);
      this.scene.sleep();
    });
  }

  /** 대사창을 닫고 레온을 직접 움직이는 이동 구간으로. 도착점에 닿으면 다음 대사로 */
  private startExplore(seg: string) {
    this.toggleAuto(false);
    this.clearText();
    for (const side of ['left', 'right'] as Side[]) this.hidePortrait(side, true);
    this.mode = 'explore';
    const def = STAGE.segments[seg];
    // 조사 기록의 "다시 걷기": 이 구간이 시작되는 순간의 상태
    this.curSeg = seg;
    save.addWalk({ story: this.story.id, scene: this.scene_.id, node: this.nodeIdx, seg, state: gameState.snapshot(), choices: save.choiceCount });
    this.withMap((m) =>
      m.play(seg, () => {
        this.mode = 'busy';
        this.curSeg = undefined;
        const after = def?.after ? STAGE.stages[def.after] : undefined;
        if (after?.dark)
          return this.curtainIn(450, () => {
            this.hideMap();
            this.curtainOut(500);
            this.time.delayedCall(500, () => this.nextNode());
          });
        if (after) m.applyStage(after);
        this.time.delayedCall(300, () => this.nextNode());
      }),
    );
  }

  private afterBattle(r: BattleResult) {
    this.scene.wake();
    const a = r.action;
    if (this.benchBefore) {
      gameState.progress.bench = this.benchBefore;
      this.benchBefore = null;
    }
    if (a === 'gameover-retry') {
      // 가장 최근 저장 지점부터 다시
      const cp = save.checkpoint;
      if (!cp) return this.scene.start('Title');
      gameState.restore(cp);
      // 체력이 절반보다 낮은 인물은 절반으로 맞춰 다시 시작 (낮은 체력으로 저장된 뒤 계속 지는 막힘 방지)
      lowToHalf();
      save.setCheckpoint({ ...cp, ...gameState.snapshot() });
      return this.scene.start('Story', { story: cp.story, scene: cp.scene, node: cp.node, returnTo: this.start.returnTo } satisfies StoryStartData);
    }
    if (a === 'gameover-title') return this.scene.start('Title');
    if (this.mapState !== 'off' && this.scene.isSleeping('Explore')) this.scene.wake('Explore');
    this.curtainOut(400);
    const field = this.fieldDone;
    if (field) {
      this.fieldDone = null;
      this.mode = 'explore';
      return field(r);
    }
    this.time.delayedCall(350, () => {
      if (a.next) {
        const target = this.story.scenes.findIndex((s) => s.id === a.next);
        if (target >= 0) return this.enterScene(target);
        console.error(`[story] 전투 결과의 장면이 없습니다: ${a.next}`);
      }
      if (a.ending) return this.showEnding(a.ending);
      this.nextNode();
    });
  }

  private nextNode() {
    this.nodeIdx++;
    this.runNode();
  }

  // ---------- 진행 입력 ----------

  private onPress() {
    if (this.logView) return this.closeLog();
    if (this.overlay) return;
    if (this.mode === 'explore') return; // 이동 중 (살펴보기 독백이면 mode가 typing/waiting)
    this.advance();
  }

  private advance() {
    if (this.looking) {
      if (this.mode === 'typing') this.completeTyping();
      else if (this.mode === 'waiting') this.lookNext();
      return;
    }
    if (this.mode === 'typing') {
      this.completeTyping();
    } else if (this.mode === 'waiting') {
      this.waitTimer?.remove();
      const node = this.scene_.nodes[this.nodeIdx];
      if ('monologue' in node && this.monoIdx < node.monologue.length - 1) {
        this.monoIdx++;
        this.pushHist();
        this.showMonoLine();
      } else {
        this.nextNode();
      }
    }
  }

  /** 로그·자동·스킵 버튼은 대화 중에만 (이동·살펴보기·엔딩 화면에서는 숨김) */
  update() {
    const talk = this.mode !== 'explore' && this.mode !== 'end' && !this.looking && !this.staging;
    for (const b of [this.logBtn, this.autoBtn, this.skipBtn, this.backBtn, this.choiceBtn]) if (b && b.visible !== talk) b.setVisible(talk);
    const pb = this.mode === 'explore' && !this.looking && !this.overlay && gameState.progress.party.length > ACTIVE_MAX;
    if (this.partyBtn && this.partyBtn.visible !== pb) this.partyBtn.setVisible(pb);
    const lb = (talk || this.mode === 'explore') && !this.looking && !this.overlay;
    if (this.lookBtn && this.lookBtn.visible !== lb) this.lookBtn.setVisible(lb);
  }

  private onKey(ev: KeyboardEvent) {
    const k = ev.key.toLowerCase();
    if (this.logView) {
      if (k === 'escape' || k === 'l') this.closeLog();
      else if (ev.key === 'ArrowUp') this.scrollLog(-60);
      else if (ev.key === 'ArrowDown') this.scrollLog(60);
      return;
    }
    // 되감기: Backspace (브라우저의 뒤로 가기는 막는다). 대사·독백·선택지 화면에서만
    if (ev.key === 'Backspace') {
      ev.preventDefault();
      if (this.mode !== 'explore') this.rewind();
      return;
    }
    // 이동 중에는 이동 키(WASD)가 겹치므로 대화 단축키를 쓰지 않는다. 살펴보기 독백은 F·스페이스 등으로 넘김
    if (this.mode === 'explore' || this.looking) {
      if (k === 'p' && this.mode === 'explore' && !this.looking && !this.overlay) return this.openPartyFromMap();
      if (k === 'c' && this.mode === 'explore' && !this.looking && !this.overlay) return this.openChoiceLog();
      if (k === 'j' && this.mode === 'explore' && !this.looking && !this.overlay) return this.openLooks();
      if (this.looking && !this.overlay && (ev.code === 'Space' || ev.code === 'Enter' || k === 'z' || k === 'f')) {
        ev.preventDefault();
        this.onPress();
      }
      return;
    }
    if (ev.code === 'Space' || ev.code === 'Enter' || k === 'z') {
      ev.preventDefault();
      if (!this.overlay && this.mode !== 'choice') this.onPress();
      return;
    }
    if (this.overlay) return;
    if (k === 'l') this.openLog();
    else if (k === 'c') this.openChoiceLog();
    else if (k === 'j') this.openLooks();
    else if (k === 'a') this.toggleAuto();
    else if ((k === 's' || ev.key === 'Control') && !ev.repeat) this.skipToNextPlace(); // 누르고 있어도 한 번만
    else if (this.mode === 'choice') {
      const n = Number(ev.key);
      if (n >= 1 && n <= this.activeChoices.length) this.pickChoice(n - 1);
    }
  }

  private toggleAuto(on = !this.auto) {
    this.auto = on;
    this.autoBtn.setOn(on);
    if (on && this.mode === 'waiting') this.scheduleNext();
    if (!on) this.waitTimer?.remove();
  }

  /**
   * 스킵: 다음에 장소가 바뀌는 곳(다음 장면, 또는 장면 안의 장소 변경) 바로 뒤로 건너뛴다.
   * 선택지·엔딩·막 끝·전투는 건너뛰지 않고 그 앞에서 멈춘다. 건너뛴 대사의 효과(플래그 등)는 적용한다.
   */
  private skipToNextPlace() {
    if (this.overlay || this.logView || this.looking) return;
    if (this.mode !== 'typing' && this.mode !== 'waiting') return;
    const passed: string[] = [];
    let cg: string | null | undefined;
    let sense: boolean | undefined;
    const nodes = this.scene_.nodes;
    let i = this.nodeIdx + 1;
    for (; i < nodes.length; i++) {
      const n = nodes[i];
      if ('place' in n || 'choices' in n || 'ending' in n || 'chapter' in n || 'battle' in n || 'hpZero' in n || 'explore' in n || 'branch' in n || 'party' in n) break; // 전투·이동 맵·자동 분기·파티 선택은 건너뛰지 않음
      if ('text' in n) gameState.applyEffects(n);
      if ('stage' in n) passed.push(n.stage);
      // 건너뛰어도 효과는 남는다 (아이템 확대는 닫힌 채로)
      if ('unlock' in n) unlock(n.unlock);
      if ('join' in n) joinParty(n.join);
      if ('leave' in n) leaveParty(n.leave);
      if ('guest' in n) addGuest(n.guest);
      if ('costume' in n) this.setCostume(n.who ?? 'leon', n.costume);
      if ('unlock' in n && n.unlock === 'weapon') this.setCostume('leon', WEAPON_COSTUME);
      if ('cg' in n) cg = n.cg;
      if ('wound' in n && (n.wound === 'sense' || n.wound === 'off')) sense = n.wound === 'sense';
    }
    this.showItem(null);
    if (cg !== undefined) this.showCg(cg, true);
    if (sense !== undefined) this.setSense(sense, true);
    // 건너뛴 무대 변화는 바로 적용
    const defs = passed.map((id) => STAGE.stages[id]).filter(Boolean);
    for (const d of defs) {
      this.fx.apply(d, true);
      this.stageSound(d, true);
    }
    const steps = defs.map((d) => (d.dark ? null : d));
    if (steps.some((d) => d === null || d.map)) this.applyMap(steps, true, () => {});
    else if (defs.length && this.mapState !== 'off') this.withMap((m) => defs.forEach((d) => m.applyStage(d, { instant: true })));
    this.toggleAuto(false);
    this.clearText();
    for (const side of ['left', 'right'] as Side[]) this.hidePortrait(side, true);
    this.nodeIdx = i;
    this.runNode(); // 장면 끝까지 갔으면 runNode가 다음 장면으로 넘어간다
  }

  // ---------- 글 표시 (대사, 독백 공통) ----------

  private readKey() {
    return `${this.story.id}:${this.scene_.id}:${this.nodeIdx}:${this.monoIdx}`;
  }

  /** target 글자를 한 글자씩 */
  private typeText(text: string, render: (s: string) => void, fx: Emphasis[] = [], target?: Phaser.GameObjects.Text) {
    this.full = text;
    this.shown = 0;
    this.typeTimer?.remove();
    this.waitTimer?.remove();
    this.mode = 'typing';
    this.render = render;
    const slow = fx.includes('slow');
    const big = fx.includes('big');
    // big: 다 나온 뒤 0.3초 정적 (그동안 넘길 수 없음)
    this.holdMs = big ? 300 : 0;
    // slow: 자동 진행이면 다 나온 뒤 1초 더 머문다
    this.extraWait = slow ? 1000 : 0;
    if (big && target) target.setFontSize(Math.round(1.6 * (this.mono.visible ? 26 : 25)));
    target?.setAlpha(fx.includes('faint') ? 0.5 : 1);
    const delay = slow ? save.settings.textDelay * 3 : save.settings.textDelay;
    const chars = Array.from(text);
    const go = () => {
      if (this.full !== text || this.mode !== 'typing') return;
      if (fx.includes('shake')) this.shakeText(target);
      if (delay <= 0) return this.completeTyping();
      this.typeTimer = this.time.addEvent({
      delay,
      loop: true,
        callback: () => {
          this.shown++;
          render(chars.slice(0, this.shown).join(''));
          if (this.shown >= chars.length) this.completeTyping();
        },
      });
    };
    render('');
    // big: 나타나기 전 0.3초 정적
    if (big) this.typeTimer = this.time.delayedCall(300, go);
    else go();
  }

  private render: (s: string) => void = () => {};

  private completeTyping() {
    this.typeTimer?.remove();
    this.typeTimer = undefined;
    this.render(this.full);
    if (!this.looking) save.markRead(this.readKey());
    if (this.holdMs > 0) {
      // 강조 big: 다 나온 뒤 잠깐 정적 (그동안은 넘길 수 없음)
      const ms = this.holdMs;
      this.holdMs = 0;
      this.mode = 'busy';
      this.time.delayedCall(ms, () => {
        if (this.mode === 'busy') this.completeTyping();
      });
      return;
    }
    this.mode = 'waiting';
    const inMono = this.mono.visible;
    this.nextMark.setVisible(!inMono);
    this.monoMark.setVisible(inMono);
    this.scheduleNext();
  }

  /** 자동 진행 */
  private scheduleNext() {
    this.waitTimer?.remove();
    if (this.mode !== 'waiting' || this.overlay || this.logView || !this.auto || this.looking) return;
    const delay = save.settings.autoDelay + Array.from(this.full).length * 25 + this.extraWait;
    this.waitTimer = this.time.delayedCall(delay, () => {
      if (this.mode === 'waiting' && !this.overlay && !this.logView) this.advance();
    });
  }

  private clearText() {
    this.typeTimer?.remove();
    this.waitTimer?.remove();
    for (const o of [this.box, this.nameBox, this.mono]) o.setVisible(false).setAlpha(1);
    this.monoText.setText('');
    this.lineText.setText('');
    this.bigText.setText('');
    this.holdMs = 0;
    this.extraWait = 0;
  }

  /** 강조 shake: 글자와 화면이 0.25초 흔들린다 */
  private shakeText(target?: Phaser.GameObjects.Text) {
    this.cameras.main.shake(250, 0.006);
    if (this.mapState === 'on') this.scene.get('Explore').cameras.main.shake(250, 0.006);
    if (!target) return;
    const x0 = target.x;
    this.tweens.killTweensOf(target);
    this.tweens.add({ targets: target, x: x0 + 5, duration: 25, yoyo: true, repeat: 4, onComplete: () => target.setX(x0) });
  }

  private showLine(node: LineNode, instant = false) {
    this.mono.setVisible(false);
    this.box.setVisible(true);
    this.nextMark.setVisible(false);
    const c = node.speaker ? characters[node.speaker] : undefined;
    // 대본의 이름이 따로 있으면 그것을 (이름을 밝히기 전의 "장로"처럼)
    const name = node.name ?? c?.name ?? '';
    this.bigText.setText('');
    // 이벤트 CG가 떠 있는 동안은 스탠딩 없이 이름표만
    if (c && !this.cgView && this.textures.exists(bodyKey(c.id))) {
      const side = node.position ?? (c.id === this.leftOf() ? 'left' : 'right');
      this.setPortrait(side, c.id, node.expression ?? 'normal');
      this.highlight(side);
    } else {
      this.highlight(null, DIM_SPEAK);
    }
    this.nameText.setText(name);
    this.nameBox.setVisible(!!name);
    this.lastShown = { kind: 'line', node };
    if (instant) {
      this.lineText.setText(node.text);
      return;
    }
    this.backlog.push({ name, text: node.text });
    const fx = fxList(node.emphasis);
    if (fx.includes('big')) {
      this.lineText.setText('');
      this.typeText(node.text, (s) => this.bigText.setText(s), fx, this.bigText);
    } else this.typeText(node.text, (s) => this.lineText.setText(s), fx, this.lineText);
  }

  /** 왼쪽에 서는 인물: 레온. 레온이 없는 장면(막간)은 그 장면의 첫 화자 */
  private leftOf() {
    const sp = this.scene_.nodes.map((n) => ('speaker' in n ? n.speaker : undefined)).filter(Boolean);
    return sp.includes('leon') || !sp.length ? 'leon' : sp[0];
  }

  private showMonoLine(instantLines?: string[]) {
    const node = this.scene_.nodes[this.nodeIdx] as { monologue: string[]; emphasis?: Record<string, EmphasisStyle> };
    this.box.setVisible(false);
    this.nameBox.setVisible(false);
    this.mono.setVisible(true);
    this.veil.setAlpha(this.veilAlpha());
    this.monoMark.setVisible(false);
    this.highlight(null, DIM_MONO);
    this.bigText.setText('');
    if (instantLines) {
      this.monoText.setText(instantLines.join('\n'));
      return;
    }
    const before = node.monologue.slice(0, this.monoIdx);
    const line = node.monologue[this.monoIdx];
    this.lastShown = { kind: 'mono', lines: [...before, line] };
    this.fx.onLine();
    this.backlog.push({ text: line });
    const head = before.length ? `${before.join('\n')}\n` : '';
    const fx = fxList(node.emphasis?.[this.monoIdx]);
    if (fx.includes('big')) {
      // 크게: 앞 줄은 그대로 두고 이 줄만 화면 가운데에
      this.monoText.setText(before.join('\n'));
      this.typeText(line, (s) => this.bigText.setText(s), fx, this.bigText);
    } else this.typeText(line, (s) => this.monoText.setText(head + s), fx, this.monoText);
  }

  // ---------- 스탠딩 ----------

  private makePortrait(side: Side): Portrait {
    const body = this.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 1);
    const face = this.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 1);
    const container = this.add.container(SIDE_X[side], H, [body, face]).setVisible(false).setDepth(2);
    return { container, body, face, charId: null, expr: 'normal' };
  }

  private setPortrait(side: Side, id: string, expr: Expression, instant = false) {
    if (!this.textures.exists(bodyKey(id))) return;
    const p = this.portraits[side];
    const otherSide: Side = side === 'left' ? 'right' : 'left';
    if (this.portraits[otherSide].charId === id) this.hidePortrait(otherSide, true);
    // normal이거나 얼굴 그림이 없으면 몸(기본 표정)만
    const fk = faceKey(id, expr);
    const hasFace = expr !== 'normal' && this.textures.exists(fk);
    p.body.setTexture(bodyKey(id));
    if (hasFace) p.face.setTexture(fk);
    p.face.setVisible(hasFace);
    // 몸과 얼굴은 같은 크기(1024x1344)라서 같은 비율·같은 위치로 겹친다
    const scale = PORTRAIT_HEIGHT / (p.body.height || PORTRAIT_H);
    p.body.setScale(scale);
    p.face.setScale(scale);
    if (p.charId !== id) {
      // 등장
      this.tweens.killTweensOf(p.container);
      p.container.setVisible(true);
      if (instant) p.container.setAlpha(1).setY(H);
      else {
        p.container.setAlpha(0).setY(H + 16);
        this.tweens.add({ targets: p.container, alpha: 1, y: H, duration: 220, ease: 'Quad.easeOut' });
      }
    }
    p.charId = id;
    p.expr = expr;
  }

  private hidePortrait(side: Side, instant = false) {
    const p = this.portraits[side];
    if (!p.charId) return;
    p.charId = null;
    this.tweens.killTweensOf(p.container);
    if (instant) p.container.setVisible(false);
    else this.tweens.add({ targets: p.container, alpha: 0, duration: 200, onComplete: () => p.container.setVisible(false) });
  }

  /** 말하는 쪽은 밝게, 나머지는 어둡게. speaking이 null이면 모두 dim 색으로 */
  private highlight(speaking: Side | null, dim = DIM_SPEAK) {
    for (const side of ['left', 'right'] as Side[]) {
      const p = this.portraits[side];
      if (side === speaking) {
        p.body.clearTint();
        p.face.clearTint();
        p.container.setDepth(3);
      } else {
        p.body.setTint(dim);
        p.face.setTint(dim);
        p.container.setDepth(2);
      }
    }
  }

  // ---------- 선택지 ----------

  private showChoices(options: ChoiceOption[]) {
    this.activeChoices = options.filter((o) => gameState.check(o.condition));
    if (this.activeChoices.length === 0) {
      console.warn('[story] 표시할 선택지가 없습니다. 다음으로 넘어갑니다');
      this.hist.pop();
      return this.nextNode();
    }
    this.waitTimer?.remove();
    this.mode = 'choice';
    this.nextMark.setVisible(false);
    this.monoMark.setVisible(false);
    this.lastChoice = {
      scene: this.sceneIdx,
      node: this.nodeIdx,
      state: gameState.snapshot(),
      stage: {
        left: this.portraits.left.charId ? { id: this.portraits.left.charId, expr: this.portraits.left.expr } : null,
        right: this.portraits.right.charId ? { id: this.portraits.right.charId, expr: this.portraits.right.expr } : null,
      },
      shown: this.lastShown,
      place: this.place,
    };
    // 장면의 첫 선택지 앞 상태 (엔딩의 "선택지로 돌아가기"가 이 장면으로 정해져 있을 때)
    if (this.scene_.nodes.findIndex((n) => 'choices' in n) === this.nodeIdx) save.setChoiceState(`${this.story.id}:${this.scene_.id}`, this.lastChoice.state);

    const bh = 54;
    const gap = 12;
    const n = this.activeChoices.length;
    const top = BOX.y - 56 - (n * bh + (n - 1) * gap);
    this.activeChoices.forEach((opt, i) => {
      const b = makeButton(this, W / 2, top + i * (bh + gap) + bh / 2, `${i + 1}. ${opt.text}`, () => this.pickChoice(i), {
        w: 560,
        h: bh,
        fontSize: 24,
        depth: 8,
      });
      // 한 번 고른 적 있는 선택지는 글자를 조금 어둡게
      if (save.hasChosen(this.choiceKey(opt.text))) (b.list[1] as Phaser.GameObjects.Text).setColor('#a9a39a');
      // 이미 본 엔딩으로 바로 이어지는 선택지: 흐린 "엔딩" (못 본 엔딩은 표시 안 함)
      if (this.seenEndingAfter(opt)) b.add(this.add.text(262, 0, '엔딩', { fontFamily: FONT, fontSize: '15px', color: '#cdb88a' }).setOrigin(1, 0.5).setAlpha(0.6));
      this.choiceButtons.push(b);
    });
  }

  private pickChoice(i: number) {
    if (this.mode !== 'choice') return;
    const opt = this.activeChoices[i];
    this.choiceButtons.forEach((b) => b.destroy());
    this.choiceButtons = [];
    this.activeChoices = [];
    this.backlog.push({ text: `▶ ${opt.text}` });
    // 선택지 기록: 선택지가 뜰 때의 상태와 화면
    const cp = this.lastChoice;
    if (cp)
      save.addChoice({
        story: this.story.id,
        scene: this.scene_.id,
        node: this.nodeIdx,
        place: cp.place,
        text: opt.text,
        state: cp.state,
        view: { stage: cp.stage, shown: cp.shown, place: cp.place, cg: this.cgId, sense: !!this.senseFx } satisfies HistView,
        walks: save.walkCount,
      } satisfies ChoiceLogEntry);
    gameState.applyEffects(opt);
    if (opt.exp) {
      const key = `choice:${this.story.id}:${opt.next ?? opt.text}`;
      const first = !gameState.progress.once.includes(key);
      const ups = gainOnce(key, partyIds(), opt.exp);
      if (first) this.flash(`경험치 +${opt.exp}${ups.length ? '   레벨 업!' : ''}`);
    }
    const target = opt.next ? this.story.scenes.findIndex((s) => s.id === opt.next) : -1;
    if (opt.next && target < 0) console.error(`[story] 없는 장면 id: ${opt.next}`);
    if (target >= 0) this.enterScene(target);
    else this.nextNode();
  }

  /**
   * 이어하기로 갈래 장면부터 시작해서 선택 기록이 없을 때:
   * 이 장면으로 오는 선택지를 찾아 그 직전 화면(인물, 마지막 글)을 데이터에서 다시 만든다
   */
  private findChoicePoint(): ChoicePoint | null {
    const target = this.scene_.id;
    for (let si = 0; si < this.story.scenes.length; si++) {
      const sc = this.story.scenes[si];
      const ni = sc.nodes.findIndex((n) => 'choices' in n && n.choices.some((c) => c.next === target));
      if (ni < 0) continue;
      const state = gameState.snapshot();
      const opt = (sc.nodes[ni] as { choices: ChoiceOption[] }).choices.find((c) => c.next === target);
      for (const k of Object.keys(opt?.flags ?? {})) delete state.flags[k];
      return this.rebuildPoint(si, ni, state);
    }
    return null;
  }

  /** 엔딩의 retry: 정해 둔 장면의 첫 선택지 앞 (그때 남긴 상태. 없으면 지금 상태) */
  private retryPoint(sceneId: string): ChoicePoint | null {
    const si = this.story.scenes.findIndex((s) => s.id === sceneId);
    const ni = si < 0 ? -1 : this.story.scenes[si].nodes.findIndex((n) => 'choices' in n);
    if (ni < 0) {
      console.error(`[story] 엔딩의 retry 장면에 선택지가 없습니다: ${sceneId}`);
      return null;
    }
    const s = save.choiceState(`${this.story.id}:${sceneId}`);
    const base = gameState.snapshot();
    return this.rebuildPoint(si, ni, s ? { ...base, ...s, progress: s.progress ?? base.progress } : base);
  }

  /** 장면 si의 대사 ni 직전 화면(인물, 마지막 글, 장소)을 데이터에서 다시 만든다 */
  private rebuildPoint(si: number, ni: number, state: StateData): ChoicePoint {
    {
      const sc = this.story.scenes[si];
      const stage: ChoicePoint['stage'] = { left: null, right: null };
      let shown: LastShown = null;
      let place = sc.place;
      for (const n of sc.nodes.slice(0, ni)) {
        if ('text' in n) {
          shown = { kind: 'line', node: n };
          const c = n.speaker ? characters[n.speaker] : undefined;
          if (c) {
            const side: Side = n.position ?? (c.id === 'leon' ? 'left' : 'right');
            const other: Side = side === 'left' ? 'right' : 'left';
            if (stage[other]?.id === c.id) stage[other] = null;
            stage[side] = { id: c.id, expr: n.expression ?? 'normal' };
          }
        } else if ('monologue' in n) shown = { kind: 'mono', lines: n.monologue };
        else if ('place' in n) place = n.place;
      }
      return { scene: si, node: ni, state, stage, shown, place };
    }
  }

  /** 엔딩 화면에서 "선택지로 돌아가기": 선택 직전 화면과 상태로 되돌린다 */
  private backToChoice() {
    const cp = this.lastChoice;
    if (!cp) return this.leave();
    this.closeOverlay();
    gameState.restore(cp.state);
    this.sceneIdx = cp.scene;
    this.nodeIdx = cp.node;
    this.curtain.setVisible(true).setAlpha(1);
    this.applyMap(this.mapSteps(cp.scene, cp.node), true, () => this.curtainOut(300));
    const sc = this.scene_;
    this.saveHere();
    this.bg.setFillStyle(hex(sc.color));
    this.setPlace(cp.place);
    this.clearText();
    for (const side of ['left', 'right'] as Side[]) {
      const s = cp.stage[side];
      if (s) this.setPortrait(side, s.id, s.expr, true);
      else this.hidePortrait(side, true);
    }
    // 다시 고를 때의 기록(선택지 기록)에 남을 마지막 글
    this.lastShown = cp.shown;
    if (cp.shown?.kind === 'line') this.showLine(cp.shown.node, true);
    else if (cp.shown?.kind === 'mono') this.showMonoLine(cp.shown.lines);
    const node = sc.nodes[cp.node];
    // 엔딩 앞의 선택지 기록은 이 선택지 앞까지만 (다시 고르면 새로 남는다)
    const log = save.choiceLog;
    const at = log.map((e, k) => (e.story === this.story.id && e.scene === sc.id && e.node === cp.node ? k : -1)).filter((k) => k >= 0).pop();
    if (at !== undefined) save.trimChoices(at);
    this.hist = [];
    this.pushHist();
    if ('choices' in node) this.showChoices(node.choices);
  }

  // ---------- 되감기 (Backspace, ◀ 뒤로) ----------

  /** 지금 화면을 되감기 기록에 남긴다 (대사·독백·선택지를 띄우기 직전) */
  private pushHist() {
    this.hist.push({
      scene: this.sceneIdx,
      node: this.nodeIdx,
      mono: this.monoIdx,
      state: gameState.snapshot(),
      backlog: this.backlog.length,
      log: save.choiceCount,
      view: this.viewNow(),
    });
    if (this.hist.length > BACK_MAX) this.hist.shift();
  }

  private viewNow(): HistView {
    const st = (side: Side) => (this.portraits[side].charId ? { id: this.portraits[side].charId!, expr: this.portraits[side].expr } : null);
    return { stage: { left: st('left'), right: st('right') }, shown: this.lastShown, place: this.place, cg: this.cgId, sense: !!this.senseFx };
  }

  /** 맵이 바뀌는 대사(stage, 맵 있는 장소, 이동 구간 뒤)를 몇 개 지났는지: 같으면 맵을 다시 그리지 않는다 */
  private mapSig(si: number, ni: number) {
    const nodes = this.story.scenes[si]?.nodes.slice(0, ni) ?? [];
    return `${si}:${nodes.filter((n) => 'stage' in n || ('place' in n && STAGE.places[n.place]) || 'explore' in n).length}`;
  }

  /** 바로 앞 대사·독백 화면으로 (선택지를 지난 직후면 그 선택지 화면으로) */
  private rewind() {
    if (this.overlay || this.logView || this.looking || this.staging) return;
    if (this.mode !== 'typing' && this.mode !== 'waiting' && this.mode !== 'choice') return;
    if (this.hist.length < 2) return this.flash(NO_BACK);
    this.hist.pop();
    this.restoreHist(this.hist.pop()!);
  }

  /** 기록한 화면과 상태로 되돌린 뒤 그 대사부터 다시 (컷인·CG·강조 연출은 다시 재생하지 않음) */
  private restoreHist(t: Hist) {
    this.toggleAuto(false);
    this.choiceButtons.forEach((b) => b.destroy());
    this.choiceButtons = [];
    this.activeChoices = [];
    this.showItem(null);
    gameState.restore(t.state);
    if (this.backlog.length > t.backlog) this.backlog.length = t.backlog;
    save.trimChoices(t.log);
    const sameMap = this.entered && this.mapSig(t.scene, t.node) === this.mapSig(this.sceneIdx, this.nodeIdx);
    const sc = this.story.scenes[t.scene];
    this.entered = true;
    this.mode = 'busy';
    this.sceneIdx = t.scene;
    this.nodeIdx = t.node;
    this.clearText();
    const v = t.view;
    if (!sameMap) {
      // 장면 연출(꿈의 세피아, 막간의 빛줄기 등)을 그 지점 상태로
      const kind = sceneKind(sc.id);
      this.bg.setFillStyle(hex(sc.color));
      this.fx.clear();
      this.setDreamLook(kind === 'dream');
      if (kind === 'dream') this.fx.setDream(sc.color);
      for (const d of this.mapSteps(t.scene, t.node, true)) if (d) {
        this.fx.apply(d, true);
        this.stageSound(d, true);
      }
    }
    this.setPlace(v.place);
    this.showCg(v.cg, true);
    this.setSense(v.sense, true);
    for (const side of ['left', 'right'] as Side[]) {
      const s = v.stage[side];
      if (s) this.setPortrait(side, s.id, s.expr, true);
      else this.hidePortrait(side, true);
    }
    const go = () => {
      if (this.curtain.visible) this.curtainOut(300);
      // 겉모습(무기를 얻기 전 등)도 그 시점으로
      if (this.mapState === 'on') {
        const m = this.scene.get('Explore') as ExploreScene;
        for (const [who, spr] of Object.entries(gameState.progress.costume)) m.setCostume(who, spr);
      }
      const node = sc.nodes[t.node];
      if (node && 'choices' in node) {
        this.lastShown = v.shown;
        if (v.shown?.kind === 'line') this.showLine(v.shown.node, true);
        else if (v.shown?.kind === 'mono') this.showMonoLine(v.shown.lines);
      }
      if (node && 'monologue' in node && t.mono > 0) {
        this.monoIdx = t.mono;
        this.saveHere();
        this.pushHist();
        return this.showMonoLine();
      }
      this.runNode();
    };
    if (sameMap) go();
    else this.applyMap(this.mapSteps(t.scene, t.node), true, go);
  }

  // ---------- 조사 기록 (J) ----------

  /** 조사 기록: 대화·이동 중. 근처에 적이 있으면 열지 않는다 */
  private openLooks() {
    if (this.overlay || this.logView || this.looking || this.staging) return;
    if (this.mode !== 'typing' && this.mode !== 'waiting' && this.mode !== 'choice' && this.mode !== 'explore') return;
    const m = this.mapState === 'on' ? (this.scene.get('Explore') as ExploreScene) : null;
    if (this.mode === 'explore' && m?.enemyNear()) return m.say('근처에 적이 있어 조사 기록을 열 수 없습니다');
    const inMap = this.mode === 'explore';
    if (inMap) m?.hold(true);
    this.time.paused = true;
    const v = openLookLog(this, {
      current: this.curSeg,
      onClose: () => {
        this.overlay = undefined;
        this.choiceScroll = undefined;
        this.time.paused = false;
        if (inMap) m?.hold(false);
      },
      onRewalk: (w, i) => {
        // 그 구간이 시작되던 순간으로: 상태, 이어하기 지점, 그 뒤 기록을 되돌린다
        const base = gameState.snapshot();
        gameState.restore({ ...base, ...w.state, progress: w.state.progress ?? base.progress });
        save.trimChoices(w.choices);
        save.trimWalks(i);
        save.setCheckpoint({ story: w.story, scene: w.scene, node: w.node, ...gameState.snapshot() });
        this.scene.start('Story', { story: w.story, scene: w.scene, node: w.node, returnTo: this.start.returnTo } satisfies StoryStartData);
      },
    });
    this.overlay = v.root;
    this.choiceScroll = v.scroll;
  }

  // ---------- 선택지 기록 (C) ----------

  private choiceKey(text: string) {
    return `${this.story.id}:${this.scene_.id}:${this.nodeIdx}:${text}`;
  }

  /** 고르면 이미 본 엔딩으로 바로 이어지는 선택지인지 (가는 장면에 본 엔딩이 있음) */
  private seenEndingAfter(opt: ChoiceOption) {
    const sc = opt.next ? this.story.scenes.find((s) => s.id === opt.next) : undefined;
    return !!sc?.nodes.some((n) => 'ending' in n && save.hasSeenEnding(n.ending));
  }

  /** 지나온 선택지를 막별로 보여 주고, 고르면 확인한 뒤 그 선택지 화면으로 */
  private openChoiceLog() {
    if (this.overlay || this.logView || this.looking || this.staging) return;
    if (this.mode !== 'typing' && this.mode !== 'waiting' && this.mode !== 'choice' && this.mode !== 'explore') return;
    const m = this.mapState === 'on' ? (this.scene.get('Explore') as ExploreScene) : null;
    if (this.mode === 'explore' && m?.enemyNear()) return m.say('근처에 적이 있어 선택지 기록을 열 수 없습니다');
    const inMap = this.mode === 'explore';
    if (inMap) m?.hold(true);
    this.time.paused = true;
    const log = save.choiceLog;
    const top = 96;
    const bottom = H - 76;
    const rowH = 40;
    const shade = this.add.rectangle(0, 0, W, H, 0x05050a, 0.94).setOrigin(0).setInteractive();
    const head = this.add.text(W / 2, 46, '지나온 선택지', { fontFamily: FONT, fontSize: '26px', color: '#e0c27a' }).setOrigin(0.5);
    const help = this.add
      .text(W / 2, H - 36, log.length ? '클릭이나 ↑↓·Enter로 고르기 / Esc로 닫기' : 'Esc나 클릭으로 닫기', { fontFamily: FONT, fontSize: '16px', color: '#888888' })
      .setOrigin(0.5);
    const list = this.add.container(0, 0);
    const rows: Phaser.GameObjects.Text[] = [];
    let y = 0;
    let prev = '';
    const actName = (id: string) => (stories[id]?.title ?? id).split(':')[0].trim();
    log.forEach((e, i) => {
      if (e.story !== prev) {
        prev = e.story;
        list.add(this.add.text(110, y + 8, actName(e.story), { fontFamily: FONT, fontSize: '20px', color: '#cdb88a' }));
        y += rowH;
      }
      const t = this.add
        .text(130, y + 6, `${actName(e.story)} · ${e.place || '—'} — ▶ ${e.text}`, { fontFamily: FONT, fontSize: '21px', color: '#e8e8e8', fixedWidth: W - 260 })
        .setInteractive({ useHandCursor: true });
      t.on('pointerover', () => pick(i, false));
      t.on('pointerdown', (_p: unknown, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        ask(i);
      });
      t.setData('y', y);
      rows.push(t);
      list.add(t);
      y += rowH;
    });
    if (!log.length) list.add(this.add.text(W / 2, 40, '아직 고른 선택지가 없습니다', { fontFamily: FONT, fontSize: '22px', color: '#aaaaaa' }).setOrigin(0.5, 0));
    const maskShape = this.make.graphics({}, false).fillRect(0, top, W, bottom - top);
    list.setMask(maskShape.createGeometryMask());
    const minY = Math.min(top, bottom - y);
    list.setY(minY);
    const root = this.add.container(0, 0, [shade, head, help, list]).setDepth(20);
    this.overlay = root;
    let sel = log.length - 1;
    let asking: Phaser.GameObjects.Container | null = null;
    const scroll = (dy: number) => list.setY(Phaser.Math.Clamp(list.y - dy, minY, top));
    const pick = (i: number, show = true) => {
      if (i < 0 || i >= rows.length) return;
      sel = i;
      rows.forEach((r, k) => r.setColor(k === i ? '#ffe9a8' : '#e8e8e8'));
      if (!show) return;
      const ry = rows[i].getData('y') as number;
      if (list.y + ry < top) list.setY(top - ry);
      else if (list.y + ry + rowH > bottom) list.setY(bottom - ry - rowH);
    };
    pick(sel);
    const close = () => {
      this.input.keyboard!.off('keydown', onKey);
      this.choiceScroll = undefined;
      this.closeOverlay();
      this.time.paused = false;
      if (inMap) m?.hold(false);
    };
    const ask = (i: number) => {
      if (asking) return;
      pick(i, false);
      const box = this.add.graphics();
      box.fillStyle(0x14121e, 0.98);
      box.fillRoundedRect(W / 2 - 300, H / 2 - 120, 600, 240, 14);
      box.lineStyle(3, 0xcdb88a, 1);
      box.strokeRoundedRect(W / 2 - 300, H / 2 - 120, 600, 240, 14);
      const msg = this.add
        .text(W / 2, H / 2 - 52, '이 선택지로 돌아갑니다.\n이후의 진행(경험치, 획득한 것 포함)은 사라집니다', {
          fontFamily: FONT,
          fontSize: '22px',
          color: '#ffffff',
          align: 'center',
          lineSpacing: 8,
        })
        .setOrigin(0.5);
      const no = () => {
        asking?.destroy();
        asking = null;
      };
      const yes = makeButton(this, W / 2 - 110, H / 2 + 60, '돌아가기 (Enter)', () => go(i), { w: 190, h: 46, fontSize: 19, depth: 21 });
      const cancel = makeButton(this, W / 2 + 110, H / 2 + 60, '취소 (Esc)', no, { w: 190, h: 46, fontSize: 19, depth: 21 });
      const blocker = this.add.rectangle(0, 0, W, H, 0x000000, 0.4).setOrigin(0).setInteractive();
      asking = this.add.container(0, 0, [blocker, box, msg, yes, cancel]).setDepth(21);
      root.add(asking);
    };
    const go = (i: number) => {
      close();
      const e = save.choiceLog[i];
      if (!e) return;
      this.scene.start('Story', { story: e.story, choiceAt: i, returnTo: this.start.returnTo } satisfies StoryStartData);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (asking) {
        if (ev.key === 'Escape') {
          asking.destroy();
          asking = null;
        } else if (ev.key === 'Enter') go(sel);
        return;
      }
      if (ev.key === 'Escape' || ev.key.toLowerCase() === 'c') close();
      else if (ev.key === 'ArrowUp') pick(sel - 1);
      else if (ev.key === 'ArrowDown') pick(sel + 1);
      else if (ev.key === 'Enter' && rows.length) ask(sel);
    };
    shade.on('pointerdown', (_p: unknown, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      close();
    });
    this.choiceScroll = scroll;
    // 연 키(C)가 바로 닫지 않도록 다음 틱부터
    window.setTimeout(() => this.overlay === root && this.input.keyboard!.on('keydown', onKey), 0);
  }

  // ---------- 조작 해금, 겉모습, 아이템 ----------

  /** 조작 해금: 화면 가운데 "스킬 해금: 오러 찌르기 (E)" 2초 뒤 다음으로 */
  private showUnlock(what: Unlock) {
    const fresh = unlock(what);
    if (what === 'weapon') this.setCostume('leon', WEAPON_COSTUME);
    if (!fresh) return this.nextNode();
    this.mode = 'busy';
    this.toggleAuto(false);
    this.clearText();
    for (const side of ['left', 'right'] as Side[]) this.hidePortrait(side);
    this.staging = true;
    const info = unlockInfo(what);
    const glow = this.add.rectangle(W / 2, H / 2, W, 110, 0x000000, 0.7).setDepth(27);
    const t = this.add
      .text(W / 2, H / 2, info.banner, { fontFamily: FONT, fontSize: '38px', color: '#ffe9a8', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setShadow(0, 3, '#000000', 8)
      .setDepth(27);
    const both = [glow, t];
    both.forEach((o) => o.setAlpha(0));
    this.tweens.add({ targets: both, alpha: 1, duration: 250 });
    this.tweens.add({ targets: t, scale: { from: 1.25, to: 1 }, duration: 300, ease: 'Back.out' });
    this.time.delayedCall(2000, () => {
      this.tweens.add({
        targets: both, alpha: 0, duration: 300,
        onComplete: () => {
          both.forEach((o) => o.destroy());
          this.staging = false;
          this.nextNode();
        },
      });
    });
  }

  /** 이동 중 파티 (P) */
  private openPartyFromMap() {
    if (this.overlay || gameState.progress.party.length <= ACTIVE_MAX) return;
    const m = this.mapState === 'on' ? (this.scene.get('Explore') as ExploreScene) : null;
    if (m?.enemyNear()) return m.say('근처에 적이 있어 파티를 바꿀 수 없습니다');
    m?.hold(true);
    this.openParty({ done: () => m?.hold(false) });
  }

  /**
   * 파티 선택: 출전할 4명을 고른다 (레온과 force는 뺄 수 없음). 숫자 키나 클릭으로 넣고 빼고, 확정 (Enter)
   */
  private openParty(o: { guide?: string; force?: string[]; done: () => void }) {
    const p = gameState.progress;
    const members = p.party.length ? p.party : ['leon'];
    const locked = new Set(['leon', ...(o.force ?? [])]);
    const want = Math.min(ACTIVE_MAX, members.length);
    const picked = new Set(activeParty());
    for (const id of locked) picked.add(id);
    // 강제 출전으로 넘친 만큼은 고르게 비워 둔다
    while (picked.size > want) {
      const drop = [...picked].reverse().find((id) => !locked.has(id));
      if (!drop) break;
      picked.delete(drop);
    }
    const shade = this.add.rectangle(0, 0, W, H, 0x05050a, 0.9).setOrigin(0).setInteractive();
    const head = this.add.text(W / 2, 86, '파티', { fontFamily: FONT, fontSize: '34px', color: '#e0c27a', fontStyle: 'bold' }).setOrigin(0.5);
    const guide = this.add
      .text(W / 2, 140, o.guide ?? '함께 싸울 4명을 고르세요. 레온은 뺄 수 없습니다', { fontFamily: FONT, fontSize: '20px', color: '#e8e8e8', align: 'center', wordWrap: { width: W - 200, useAdvancedWrap: true } })
      .setOrigin(0.5, 0);
    const count = this.add.text(W / 2, H - 170, '', { fontFamily: FONT, fontSize: '20px', color: '#cdb88a' }).setOrigin(0.5);
    const cards: Button[] = [];
    const cw = 150;
    const gap = 16;
    const x0 = W / 2 - ((members.length - 1) * (cw + gap)) / 2;
    const ok = makeButton(this, W / 2, H - 110, '확정 (Enter)', () => close(), { w: 220, h: 52, fontSize: 22, depth: 0 });
    const refresh = () => {
      members.forEach((id, i) => {
        const on = picked.has(id);
        cards[i].setOn(on).setLabel(`${i + 1}. ${characters[id]?.name ?? id}
Lv ${levelOf(id)}${locked.has(id) ? '  고정' : on ? '' : '  대기'}`);
      });
      count.setText(`출전 ${picked.size} / ${want}`);
      ok.setEnabled(picked.size === want);
    };
    const toggle = (id: string) => {
      if (locked.has(id)) return;
      if (picked.has(id)) picked.delete(id);
      else if (picked.size < want) picked.add(id);
      refresh();
    };
    members.forEach((id, i) => cards.push(makeButton(this, x0 + i * (cw + gap), H / 2 - 10, '', () => toggle(id), { w: cw, h: 110, fontSize: 20, depth: 0 })));
    const onKey = (ev: KeyboardEvent) => {
      const n = Number(ev.key);
      if (n >= 1 && n <= members.length) toggle(members[n - 1]);
      else if (ev.key === 'Enter' && picked.size === want) close();
    };
    const close = () => {
      if (picked.size !== want) return;
      this.input.keyboard!.off('keydown', onKey);
      setActive([...picked]);
      this.closeOverlay();
      o.done();
    };
    refresh();
    this.overlay = this.add.container(0, 0, [shade, head, guide, count, ...cards, ok]).setDepth(32);
    this.time.delayedCall(200, () => this.input.keyboard!.on('keydown', onKey));
  }

  /** 도트 겉모습 바꾸기 (저장에 남고, 맵·전투 그림이 따른다) */
  private setCostume(who: string, sprite: string) {
    gameState.progress.costume[who] = sprite;
    if (this.mapState === 'on') (this.scene.get('Explore') as ExploreScene).setCostume(who, sprite);
  }

  /** 아이템 그림을 대사창 위 가운데에 크게 (null = 닫기). 그림 파일이 없으면 보여 주지 않음 */
  private showItem(id: string | null) {
    const old = this.itemView;
    this.itemView = undefined;
    if (old) this.tweens.add({ targets: old, alpha: 0, duration: 250, onComplete: () => old.destroy() });
    if (!id || !this.textures.exists(itemKey(id))) return;
    const img = this.add.image(0, 0, itemKey(id));
    const k = Math.min(300 / img.width, 300 / img.height);
    img.setScale(Math.max(1, Math.floor(k)) || k);
    const back = this.add.rectangle(0, 0, img.displayWidth + 36, img.displayHeight + 36, 0x0c0a14, 0.88).setStrokeStyle(3, GOLD);
    this.itemView = this.add.container(W / 2, (BOX.y - 20) / 2 + 20, [back, img]).setDepth(7).setAlpha(0);
    this.tweens.add({ targets: this.itemView, alpha: 1, duration: 300 });
  }

  /** 화면 위쪽에 잠깐 뜨는 글 (경험치 등) */
  private flash(text: string) {
    const t = this.add
      .text(W / 2, 110, text, { fontFamily: FONT, fontSize: '22px', color: '#ffe9a8', backgroundColor: '#000000aa', padding: { x: 14, y: 8 } })
      .setOrigin(0.5)
      .setDepth(26);
    this.tweens.add({ targets: t, alpha: 0, delay: 1800, duration: 500, onComplete: () => t.destroy() });
  }

  // ---------- 엔딩, 막 전환 ----------

  private showEnding(id: string, preview = false) {
    this.mode = 'end';
    this.toggleAuto(false);
    const def = this.story.endings[id];
    if (!def) console.error(`[story] 없는 엔딩 id: ${id}`);
    if (!preview) save.markEnding(id);
    this.showCg(null);
    this.setSense(false);
    if (!preview) this.lastChoice = def?.retry ? this.retryPoint(def.retry) ?? this.lastChoice : this.lastChoice ?? this.findChoicePoint();
    // 이어하기는 엔딩 갈래를 다시 보지 않도록 선택지가 있던 곳부터
    if (this.lastChoice && !preview) {
      const sc = this.story.scenes[this.lastChoice.scene];
      save.setCheckpoint({ story: this.story.id, scene: sc.id, node: this.lastChoice.node, ...this.lastChoice.state });
    }

    const shade = this.add.rectangle(0, 0, W, H, 0x2a0000, 1).setOrigin(0).setAlpha(0);
    const label = this.add
      .text(W / 2, H / 2 - 110, def?.label ?? 'END', { fontFamily: FONT, fontSize: '30px', color: '#e04848', fontStyle: 'bold' })
      .setOrigin(0.5);
    const title = this.add
      .text(W / 2, H / 2 - 40, def?.title ?? id, { fontFamily: FONT, fontSize: '54px', color: '#f4dede', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setShadow(0, 4, '#000000', 10);
    const back = makeButton(this, W / 2, H / 2 + 90, '선택지로 돌아가기', () => this.backToChoice(), {
      w: 320, h: 54, fontSize: 22, fill: [0x2a0c0c, 0x5a1a1a], stroke: 0xc05050, depth: 31,
    });
    const toTitle = makeButton(this, W / 2, H / 2 + 158, '타이틀로', () => this.leave(), {
      w: 320, h: 54, fontSize: 22, fill: [0x2a0c0c, 0x5a1a1a], stroke: 0xc05050, depth: 31,
    });
    back.setEnabled(!!this.lastChoice && !preview);
    const texts = [label, title, back, toTitle];
    texts.forEach((t) => t.setAlpha(0));
    this.tweens.add({ targets: [this.box, this.nameBox, this.mono], alpha: 0, duration: 500 });
    // 엔딩 일러스트가 있으면: 그림이 1초에 서서히 → 2초 그림만 → 아래 1/3 어두운 띠 위에 글자와 버튼
    if (this.textures.exists(endingKey(id))) {
      const art = coverFit(this.add.image(0, 0, endingKey(id)), W, H).setAlpha(0);
      const band = this.add.image(0, H, this.bandTexture()).setOrigin(0, 1).setAlpha(0);
      // 글자와 버튼을 아래 1/3로
      const top = (H * 2) / 3;
      label.setFontSize(22).setY(top + 18);
      title.setFontSize(40).setY(top + 62);
      back.setPosition(W / 2 - 170, H - 62);
      toTitle.setPosition(W / 2 + 170, H - 62);
      this.overlay = this.add.container(0, 0, [art, band, ...texts]).setDepth(30);
      this.tweens.add({ targets: art, alpha: 1, duration: 1000 });
      this.tweens.add({ targets: band, alpha: 1, duration: 600, delay: 3000 });
      this.tweens.add({ targets: texts, alpha: 1, duration: 700, delay: 3300 });
      return;
    }
    this.overlay = this.add.container(0, 0, [shade, ...texts]).setDepth(30);
    this.tweens.add({ targets: shade, alpha: 0.92, duration: 900 });
    this.tweens.add({ targets: texts, alpha: 1, duration: 700, delay: 700 });
  }

  /** 엔딩 그림 아래 1/3에 까는 띠: 위는 투명, 아래로 갈수록 짙은 검정 */
  private bandTexture() {
    const key = 'ending_band';
    if (this.textures.exists(key)) return key;
    const h = Math.round(H / 3);
    const tex = this.textures.createCanvas(key, W, h)!;
    const ctx = tex.getContext();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.35, 'rgba(0,0,0,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0.92)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, h);
    tex.refresh();
    return key;
  }

  /**
   * 막 끝: "1막 끝" 화면 → 최대 레벨 해금 알림 → 다음 막(chapters의 id와 같은 이야기)을 처음부터.
   * 다음 이야기가 없으면 "다음 이야기는 준비 중입니다" 뒤 타이틀로
   */
  private showChapter(id: string) {
    this.mode = 'end';
    this.toggleAuto(false);
    this.showItem(null);
    const def = this.story.chapters[id];
    this.showCg(null);
    this.setSense(false);
    const before = maxLevel();
    clearStory(this.story.id); // 다음 구간이 열려 최대 레벨이 오른다
    healAll(); // 막 클리어: 파티 전원(대기 동료 포함) 체력 가득
    const after = maxLevel();
    const cp = save.checkpoint;
    save.setCheckpoint({
      story: this.story.id,
      scene: cp?.story === this.story.id ? cp.scene : this.story.scenes[0].id,
      finished: true,
      ...gameState.snapshot(),
    });
    const next = stories[id] ? id : null;
    const black = this.add.rectangle(0, 0, W, H, 0x000000, 1).setOrigin(0).setAlpha(0);
    const done = this.add
      .text(W / 2, H / 2 - 60, def?.finished ?? '', { fontFamily: FONT, fontSize: '40px', color: '#e0c27a', fontStyle: 'bold' })
      .setOrigin(0.5);
    const title = this.add
      .text(W / 2, H / 2 + 10, def?.title ?? '', { fontFamily: FONT, fontSize: '24px', color: '#9a9a9a' })
      .setOrigin(0.5);
    const level = this.add
      .text(W / 2, H / 2 + 90, after > before ? `최대 레벨 ${after} 해금` : '', { fontFamily: FONT, fontSize: '30px', color: '#ffe9a8', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setShadow(0, 3, '#000000', 8);
    const hint = this.add
      .text(W / 2, H - 80, '', { fontFamily: FONT, fontSize: '18px', color: '#888888' })
      .setOrigin(0.5);
    [done, title, level, hint].forEach((t) => t.setAlpha(0));
    this.overlay = this.add.container(0, 0, [black, done, title, level, hint]).setDepth(30);
    this.tweens.add({ targets: [this.box, this.nameBox, this.mono], alpha: 0, duration: 500 });
    this.tweens.add({ targets: black, alpha: 1, duration: 900 });
    this.tweens.add({ targets: [done, title], alpha: 1, duration: 700, delay: 800 });
    // 막 끝 화면 2초 → 최대 레벨 알림 (겹치지 않게 차례로)
    const lvAt = 800 + 2000;
    if (level.text) {
      this.tweens.add({ targets: level, alpha: 1, duration: 400, delay: lvAt });
      this.tweens.add({ targets: level, scale: { from: 1.3, to: 1 }, duration: 400, delay: lvAt, ease: 'Back.out' });
    }
    const ready = lvAt + (level.text ? 1200 : 0);
    this.time.delayedCall(ready, () => {
      hint.setText(next ? '클릭하면 다음 이야기로' : '클릭하면 계속');
      this.tweens.add({ targets: hint, alpha: 1, duration: 400 });
      const go = () => {
        this.input.keyboard!.off('keydown', go);
        black.off('pointerdown', go);
        if (next) return this.goNextStory(next);
        this.showComingSoon();
      };
      black.setInteractive();
      black.once('pointerdown', go);
      this.input.keyboard!.once('keydown', go);
    });
  }

  /** 다음 막을 처음부터 (상태는 그대로 이어감) */
  private goNextStory(id: string) {
    this.curtainIn(400, () => {
      this.hideMap();
      this.scene.start('Story', { story: id, returnTo: this.start.returnTo } satisfies StoryStartData);
    });
  }

  private showComingSoon() {
    this.closeOverlay();
    const black = this.add.rectangle(0, 0, W, H, 0x000000, 1).setOrigin(0).setInteractive();
    const t = this.add
      .text(W / 2, H / 2, '다음 이야기는 준비 중입니다', { fontFamily: FONT, fontSize: '34px', color: '#cfcfcf' })
      .setOrigin(0.5)
      .setAlpha(0);
    this.overlay = this.add.container(0, 0, [black, t]).setDepth(30);
    this.tweens.add({ targets: t, alpha: 1, duration: 600 });
    this.time.delayedCall(900, () => {
      black.once('pointerdown', () => this.leave());
      this.input.keyboard!.once('keydown', () => this.leave());
    });
  }

  private closeOverlay() {
    this.overlay?.destroy();
    this.overlay = undefined;
  }

  // ---------- 백로그 ----------

  private openLog() {
    if (this.logView || this.overlay || this.backlog.length === 0 || this.mode === 'explore' || this.looking) return;
    this.waitTimer?.remove();
    const top = 90;
    const bottom = H - 70;
    const shade = this.add.rectangle(0, 0, W, H, 0x05050a, 0.94).setOrigin(0).setInteractive();
    shade.on('pointerdown', (_p: unknown, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.closeLog();
    });
    const head = this.add.text(W / 2, 44, '지난 대사', { fontFamily: FONT, fontSize: '26px', color: '#e0c27a' }).setOrigin(0.5);
    const help = this.add
      .text(W / 2, H - 34, '휠·방향키로 넘기기 / 클릭·Esc로 닫기', { fontFamily: FONT, fontSize: '16px', color: '#888888' })
      .setOrigin(0.5);
    const body = this.backlog
      .map((e) => (e.name ? `【${e.name}】\n${e.text}` : e.text))
      .join('\n\n');
    const text = this.add.text(110, 0, body, {
      fontFamily: FONT,
      fontSize: '22px',
      color: '#e8e8e8',
      lineSpacing: 8,
      wordWrap: { width: W - 220, useAdvancedWrap: true },
    });
    const maskShape = this.make.graphics({}, false).fillRect(0, top, W, bottom - top);
    text.setMask(maskShape.createGeometryMask());
    // 맨 아래(가장 최근)부터 보이게
    const min = Math.min(top, bottom - text.height);
    text.setY(min);
    const root = this.add.container(0, 0, [shade, head, help, text]).setDepth(20);
    this.logView = { root, text, top, min };
  }

  private scrollLog(dy: number) {
    const v = this.logView;
    if (!v) return;
    v.text.setY(Phaser.Math.Clamp(v.text.y - dy, v.min, v.top));
  }

  private closeLog() {
    this.logView?.root.destroy();
    this.logView = undefined;
    this.scheduleNext();
  }

  // ---------- 끝내기 ----------

  /** 오른쪽 위 "타이틀로": 한 번 물어본 뒤 타이틀로 */
  private confirmLeave() {
    if (this.overlay || this.mode === 'end') return;
    if (this.logView) this.closeLog();
    this.time.paused = true; // 글자 찍기·자동 진행 멈춤
    const shade = this.add.rectangle(0, 0, W, H, 0x000000, 0.6).setOrigin(0).setInteractive();
    const box = this.add.graphics();
    box.fillStyle(0x14121e, 0.98);
    box.fillRoundedRect(W / 2 - 230, H / 2 - 110, 460, 220, 14);
    box.lineStyle(3, 0xcdb88a, 1);
    box.strokeRoundedRect(W / 2 - 230, H / 2 - 110, 460, 220, 14);
    const msg = this.add
      .text(W / 2, H / 2 - 40, '타이틀 화면으로 이동하시겠습니까?', { fontFamily: FONT, fontSize: '24px', color: '#ffffff' })
      .setOrigin(0.5);
    const close = (go: boolean) => {
      this.input.keyboard!.off('keydown', onKey);
      this.closeOverlay();
      this.time.paused = false;
      if (go) this.leave();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') close(false);
      else if (ev.key === 'Enter') close(true);
    };
    const opt = { w: 160, h: 50, fontSize: 21, depth: 0 };
    const yes = makeButton(this, W / 2 - 95, H / 2 + 45, '예', () => close(true), opt);
    const no = makeButton(this, W / 2 + 95, H / 2 + 45, '아니요', () => close(false), opt);
    this.overlay = this.add.container(0, 0, [shade, box, msg, yes, no]).setDepth(40);
    this.input.keyboard!.on('keydown', onKey);
  }

  private leave() {
    this.mode = 'end';
    this.typeTimer?.remove();
    this.waitTimer?.remove();
    this.curtainIn(300, () => {
      const back = this.start.returnTo;
      if (back) {
        this.scene.resume(back);
        this.scene.stop();
      } else {
        this.scene.start('Title');
      }
    });
  }
}
