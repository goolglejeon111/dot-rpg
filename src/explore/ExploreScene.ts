import { senseBeat } from '../game/beat';
import { playSe } from '../game/sound';
import Phaser from 'phaser';
import looksData from '../data/explore/looks.json';
import stageData from '../data/explore/stage.json';
import battlesData from '../data/battle/battles.json';
import { makeBattleAnims, preloadBattle } from '../battle/assets';
import { fieldFrame, footOrigin, isHd, rise } from '../game/hdSprites';
import { EXP_REWARD, gainOnce, isCapped, levelOf, levelProgress, partyIds } from '../battle/progress';
import { gameState } from '../game/GameState';
import type { StoryFxDef } from '../scenes/StoryFx';
import {
  FLAMES, MAPS, PROPS, TS, dressTiles, findObj, footOf, layerOf, makeMapAnims, makePropSprite, makeTilemap, objectsOf, preloadMapArt, propOf, solidGrid, wadeGrid,
  type TiledMap, type TiledObj,
} from './mapData';

/**
 * 맵 화면: 대화(Story)의 아래층에 깔리는 도트 맵.
 *   무대(stage)  인물을 세우고 카메라를 옮긴다. 대사는 그 위 Story 장면이 띄운다
 *   이동(play)   레온을 직접 움직인다. 이동 WASD/방향키 · 살펴보기 F · 점프 Space · 휴대폰은 조이스틱과 살펴보기·점프 버튼. 수로 물에 들어가면 몸이 1/3 잠기고 느려짐
 *                가까이 가면 레온 머리 위에 표시가 뜨고, F를 누르면 레온의 독백(Story가 보여 줌). 처음 한 번 경험치
 * 데이터: 맵 src/data/maps/*.json, 무대·이동 구간 src/data/explore/stage.json, 물건 독백 src/data/explore/looks.json
 * 밤 조명: Light2D. 맵 전체에 어두운 푸른빛(ambient), 횃불·촛불 주변만 따뜻하게 밝다
 */
export interface MapHost {
  /** 레온의 독백을 화면별로 보여 준다. 다 읽으면 done */
  playMonologue(pages: string[][], done: () => void): void;
  /** 행인의 한 줄 대사 (이름표만). 다 읽으면 done */
  playTalk(name: string, text: string, done: () => void): void;
  /** 맵 위의 몹 무리와 짧은 전투. 이기면 done(true), 지면 Story가 게임 오버를 처리 */
  fieldBattle(battle: string, done: () => void, at?: { x: number; y: number }): void;
  /** 레온의 어깨에 상처가 있는 이야기인가 (1막부터. 없으면 없음) */
  wounded?(): boolean;
}
export interface ExploreStart {
  host: MapHost;
}

type Dir = 'down' | 'left' | 'right' | 'up';
type Pt = string | number[];
export interface ActorSpec {
  /** 이 플래그가 참일 때만 세운다 ('!이름'이면 거짓일 때만). 예: galia_alive */
  if?: string;
  at?: Pt;
  walk?: Pt;
  facing?: string;
  pose?: string;
  sprite?: string;
  /** 걷는 빠르기 (없으면 보통 걸음) */
  speed?: number;
  /** 발밑은 그대로 두고 그림만 이만큼(px) 위로 (말 위에 탄 모습) */
  lift?: number;
  /** 지금 자리(말 위)에서 이 자리로 뛰어내린 뒤 walk */
  hop?: Pt;
  /** 고개를 숙였다 드는 짧은 동작 (walk가 있으면 도착한 뒤) */
  nod?: boolean;
  /** 모래 속에서 기어 나오며 나타난다 */
  emerge?: boolean;
  /** 앉아서 무언가를 적는 동작 (pose kneel과 함께). false면 그만 */
  write?: boolean;
  /** walk 끝에 닿으면 퇴장 */
  leave?: boolean;
  /** 걸을 때 발밑에 끌린 자국을 남긴다 (색). null이면 그만 */
  drag?: string | null;
  /** 손에 든 전단과 이 방향의 사람 얼굴을 번갈아 본다 (검문 병사). false면 그만 */
  compare?: string | false;
}
/** 맵 위에 잠깐 놓는 물건 그림 (ex_ 그림): 굴러가기·미끄러지기 */
export interface ItemSpec {
  key: string;
  at?: Pt;
  to?: Pt;
  ms?: number;
  delay?: number;
}
/** StoryFxDef 칸(꿈, 남의 기억, 막간)은 대화 화면(StoryFx)이 그린다. 맵은 무시 */
export interface StageDef extends StoryFxDef {
  map?: string;
  focus?: Pt;
  blood?: boolean;
  /** 대사창을 잠깐 내리고 이만큼(ms) 무대만 보여 준 뒤 다음 대사로 */
  wait?: number;
  /** 처음엔 숨긴 물건(hidden prop)을 보이게(true)/숨기게(false). 이미 주운 것은 계속 숨김. 글자면 플래그 조건('galia_alive', '!galia_alive') */
  props?: Record<string, boolean | string>;
  actors?: Record<string, ActorSpec | null>;
  /** 인물 그림이 위에서 떨어져 물에 빠지는 모습을 한 번 보여 준다 */
  fall?: { sprite: string; from: Pt; to: Pt; ms?: number };
  /** 맵 밤빛 색을 바꾼다 (예: 밤 → 새벽) */
  ambient?: string;
  /** 인물을 한 번 번쩍이게 (색) */
  flash?: { who: string; color: string };
  /** 인물 둘레에 옅은 빛 테두리를 남기거나(색) 지운다(null) */
  aura?: Record<string, string | null>;
  /** 맵을 내리고 검은 화면으로 (다음에 map이 있는 무대가 오면 다시 뜬다) */
  dark?: boolean;
  /** 화면 전체 효과: 번쩍임 색, 흔들림 세기 */
  screen?: { flash?: string; shake?: number };
  /** ambient를 이만큼(ms)에 걸쳐 천천히 바꾼다 (없으면 바로) */
  fade?: number;
  /** fade를 이 색에서 시작한다 (해 질 녘: 주황 → 남색) */
  from?: string;
  /** 레온 어깨 상처 빛이 한 번 크게 맥박친다 */
  pulse?: boolean;
  /** 화면 오른쪽 끝의 가늘고 하얀 빛의 기둥: rise = 아래에서 위로 솟음, fade = 위에서부터 사라짐 */
  pillar?: 'rise' | 'fade';
  /** 화면 전체를 한 색으로 덮어 간다 (하얗게 바램 등). alpha 0이면 걷어 냄 */
  veil?: { color: string; alpha: number; ms?: number };
  /** 이 인물들 둘레만 밝게 남기는 빛 (null이면 끔) */
  spot?: string[] | null;
  /** aura와 같되 불규칙하게 깜빡인다 */
  flicker?: Record<string, string | null>;
  /** 인물의 손에서(또는 at 자리에서) 작은 불씨가 화면 위로 올라가 사라진다 */
  embers?: { who: string; color: string; at?: Pt };
  /** 안개(맵 속성 fog)를 화면 위에서부터 걷어 낸다 */
  fog?: 'lift';
  /** 레온 어깨의 룬: break = 유리처럼 깨지며 크게 터짐, layer = 여러 겹 다시 그림(사이로 빛이 샘) */
  rune?: 'break' | 'layer';
  /** 위압: 인물이 이 색으로 번쩍이고 고리가 퍼진다. freeze면 다른 인물이 1초 굳는다 */
  awe?: { who: string; color: string; freeze?: boolean };
  /** 화면 채도가 아주 잠깐(ms) 빠진다 */
  gray?: number;
  /** 바닥의 붉은 범위 표시 (null이면 지움) */
  zone?: { at: Pt; r: number } | null;
  /** 숨긴 물건·빛을 이 순서대로 ms 간격으로 하나씩 켠다 (창 닫힘, 횃불 행렬, 돌무덤) */
  reveal?: { keys: string[]; ms: number; se?: string };
  /** 이름(key) 붙은 물건이 잠깐 빛난다 (표식 나무의 칼자국) */
  shine?: string;
  /** 효과음 한 번, BGM·환경음 바꾸기(null이면 끔). 대화 화면(StoryScene)이 튼다. 파일이 없으면 무음 */
  se?: string;
  /** 화면 가장자리를 이 색으로 물들여 둔다 (대화 화면이 그림, null이면 걷음) */
  edge?: string | null;
  bgm?: string | null;
  amb?: string | null;
  /** 맵 위에 물건 그림을 놓거나(움직이거나) 치운다(null) */
  items?: Record<string, ItemSpec | null>;
  /** 이 무대를 지나면 남기는 기록 (예: a1:seal = 상처를 룬으로 누름) */
  once?: string;
  /** 흘러가는 강(맵 속성 drift)의 화면 위 황도 불빛 크기 (1 = 처음, 0 = 사라짐) */
  city?: number;
  /** 흘러가는 강의 화면 위 끝에 사막의 노란 띠가 떠오른다 */
  dawnBand?: boolean;
}
export interface SegmentDef {
  map: string;
  looks: string[];
  goal: string;
  hint?: string;
  /** 도착점에 가기 전에 꼭 조사(줍기)해야 하는 것 */
  need?: string[];
  tutorial?: boolean;
  after?: string;
  /** 레온 걸음 빠르기 배율 (지친 상태 0.7) */
  speed?: number;
  /** 파티원이 레온 뒤를 따라 걷는다 (기본: 지금 파티) */
  follow?: boolean;
  /** 필수 조사: 이 물건을 조사하는 순간 구간이 끝난다 (출구 없이). 이 구간에서는 이미 본 물건도 다시 조사할 수 있다 */
  until?: string;
}
export const STAGE = stageData as unknown as {
  scenes: Record<string, string | null>;
  places: Record<string, { map: string | null; stage?: string }>;
  stages: Record<string, StageDef>;
  segments: Record<string, SegmentDef>;
};
const LOOKS = looksData as unknown as Record<string, { name: string; text: string; pickup?: boolean }>;
/** 독백 글: 줄바꿈 = 한 줄씩, 빈 줄 = 화면 나눔 */
export const lookPages = (id: string) =>
  (LOOKS[id]?.text ?? '').split(/\n\s*\n/).map((p) => p.split('\n').filter((l) => l.trim()));

const DIRS: Dir[] = ['down', 'left', 'right', 'up'];
/** 발밑 그림자. 새 도트(32x48)는 팔레트 그림자색(#2a1a48, 35%)으로 조금 넓게 */
const SHADOW_OLD = { w: 16, h: 6, color: 0x0a0810, alpha: 0.4 };
const SHADOW_HD = { w: 18, h: 6, color: 0x2a1a48, alpha: 0.35 };
const W = 960;
const H = 720;
const ZOOM = 2;
const SPEED = 92;
const WALK_SPEED = 78;
const NEAR = 52; // 이만큼 가까우면 표시가 뜨고 F로 살펴볼 수 있다
const FOOT = { w: 14, h: 8 };
/** 물속 걸음 빠르기 배율, 잠기는 깊이(px, 몸의 1/3쯤) */
const WADE_SPEED = 0.55;
const WADE_DEPTH = 12;
/** 평상시 점프 높이(px), 걸리는 시간 */
const JUMP_H = 14;
const JUMP_MS = 420;
const FONT = '"Noto Sans KR", "Malgun Gothic", sans-serif';
const hex = (s: string) => Phaser.Display.Color.HexStringToColor(s).color;

interface Actor {
  id: string;
  key: string;
  spr: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  facing: Dir;
  down: boolean;
  /** 무릎 꿇음 (전투 그림의 무릎 칸) */
  kneel?: boolean;
  walking: boolean;
  /** 그림만 위로 (px) */
  lift?: number;
  /** 점프하는 중 (lift가 점프 높이) */
  jumping?: boolean;
  /** 끌린 자국 색과 마지막 자국 자리 */
  drag?: string;
  lastDrag?: { x: number; y: number };
  /** 적는 동작의 종이·펜 */
  writeFx?: Phaser.GameObjects.GameObject[];
  /** 전단 대조 동작의 전단과 타이머 */
  compareFx?: { paper: Phaser.GameObjects.Container; timer: Phaser.Time.TimerEvent };
}
interface Lookable {
  id: string;
  x: number;
  y: number;
  /** 말 걸기 (행인 한 줄 대사, 경험치 없음) */
  talk?: boolean;
  /** 이 글을 누르면 이동이 끝나는 도착점 (사다리 오르기 등) */
  goal?: boolean;
}
interface Mob {
  name: string;
  battle: string;
  x: number;
  y: number;
  sprs: Phaser.GameObjects.Sprite[];
}
/** 인물을 따라다니는 빛: leon = 어깨 상처의 하얀 빛(맥박), elysia = 지팡이의 보랏빛 */
/** 엘리시아가 빛을 밝힌 뒤(이 표시가 once에 있으면) 어두운 맵도 이만큼 밝게 본다 */
export const LIGHT_KEY = 'a1:elysia_light';
const LIT_AMBIENT = '#8a86ac';

const CARRY: Record<string, { color: number; r: number; intensity: number; pulse: boolean }> = {
  leon: { color: 0xeef4ff, r: 96, intensity: 1.5, pulse: true },
  elysia: { color: 0xa47cff, r: 128, intensity: 1.6, pulse: false },
};
/** 2막 장면 3의 빛의 기둥을 본 뒤(이 표시가 once에 있으면) 레온 어깨 빛이 1막보다 조금 크고 밝다 */
export const PILLAR_KEY = 'a2:pillar';
/** 3막: 2막보다 밝게 시작 / 장면 7에서 룬이 깨짐 / 장면 10에서 룬을 겹쳐 그림 */
export const A3_KEY = 'a3:start';
export const RUNE_BREAK_KEY = 'a3:rune_break';
export const LAYER_KEY = 'a3:layered';
/** 엘리시아가 룬으로 상처를 누른 뒤 (보랏빛 룬 테두리) */
export const SEAL_KEY = 'a1:seal';
/** 상처 빛 점의 자리 (발밑 기준, 왼쪽 어깨). 오른쪽을 보면 어깨가 몸 뒤로 숨는다 */
const SHOULDER: Record<Dir, [number, number]> = { down: [5, -21], up: [-5, -21], left: [1, -21], right: [-1, -21] };
function carryOf(id: string) {
  const d = CARRY[id];
  const once = gameState.progress.once;
  if (id === 'leon' && once.includes(RUNE_BREAK_KEY) && !once.includes(LAYER_KEY)) return { ...d, r: d.r * 1.8, intensity: d.intensity * 2 };
  if (id === 'leon' && once.includes(A3_KEY)) return { ...d, r: d.r * 1.5, intensity: d.intensity * 1.6 };
  if (id === 'leon' && once.includes(PILLAR_KEY)) return { ...d, r: d.r * 1.3, intensity: d.intensity * 1.35 };
  return d;
}
/** 무대의 플래그 조건: 'galia_alive'는 참일 때, '!galia_alive'는 거짓일 때 */
const flagOk = (c: string) => (c.startsWith('!') ? !gameState.getFlag(c.slice(1)) : !!gameState.getFlag(c));
/** 맵에서 레온 뒤를 따라 걷는 인물 (임시 동료 포함) */
const walkers = () => (gameState.progress.party?.length ? gameState.progress.party : ['leon']);
type Box = { x0: number; y0: number; x1: number; y1: number };

/**
 * 글자용 카메라(uiCam)는 조명을 받는 그림을 그리지 않는다. 그런데 Light2D는 카메라마다 빛 위치를 다시 넣으므로,
 * 한꺼번에 늦게 그려지는 인물 그림이 글자 카메라 기준 빛 위치로 칠해진다(인물만 어둡게 보임).
 * 그 카메라에서는 빛 값을 바꾸지 않게 한다.
 */
const NO_LIGHTS = new WeakSet<Phaser.Cameras.Scene2D.Camera>();
function skipLightsFor(cam: Phaser.Cameras.Scene2D.Camera) {
  NO_LIGHTS.add(cam);
  const r = cam.scene.renderer;
  if (!(r instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;
  type OnRender = (s: Phaser.Scene, c: Phaser.Cameras.Scene2D.Camera) => void;
  const p = r.pipelines.get('Light2D') as unknown as { onRender: OnRender; skipPatched?: boolean } | undefined;
  if (!p || p.skipPatched) return;
  // 파이프라인은 처음 만들 때 renderer의 RENDER 이벤트에 onRender를 걸어 두므로, 그 걸이를 바꿔 끼운다
  const orig = p.onRender;
  const wrapped: OnRender = function (this: unknown, scene, camera) {
    if (!NO_LIGHTS.has(camera)) orig.call(this, scene, camera);
  };
  r.off(Phaser.Renderer.Events.RENDER, orig, p);
  r.on(Phaser.Renderer.Events.RENDER, wrapped, p);
  p.onRender = wrapped;
  p.skipPatched = true;
}
type Vis = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible;

export class ExploreScene extends Phaser.Scene {
  ready = false;
  mapId = '';
  private host!: MapHost;
  private map?: TiledMap;
  private mapW = 0;
  private mapH = 0;
  private grid: boolean[] = [];
  private wade: boolean[] = [];
  private boxes: Box[] = [];
  /** 이름으로 찾는 물건 그림 (숨겼다 보이는 것) */
  private named = new Map<string, Phaser.GameObjects.Sprite>();
  private worldObjs: Phaser.GameObjects.GameObject[] = [];
  private lights2: { light: Phaser.GameObjects.Light; base: number; r: number; color: number }[] = [];
  private blood?: Phaser.Tilemaps.TilemapLayer;
  private tilemap?: Phaser.Tilemaps.Tilemap;
  private actors = new Map<string, Actor>();
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private lit = false;
  // 이동
  private seg: SegmentDef | null = null;
  private carry: { id: string; light: Phaser.GameObjects.Light; base: number; pulse: boolean; at?: { x: number; y: number } }[] = [];
  private trail: { x: number; y: number }[] = [];
  private mobs: Mob[] = [];
  private npcs = new Set<string>();
  private auras = new Map<string, Phaser.GameObjects.Sprite>();
  /** 처음엔 꺼 둔 불빛 (숨긴 불꽃 물건, hidden 빛). 무대의 props로 켠다 */
  private namedLights = new Map<string, { light: Phaser.GameObjects.Light; base: number }[]>();
  private pillarFx?: { bar: Phaser.GameObjects.Rectangle; glow: Phaser.GameObjects.Rectangle; t0: number };
  private veilFx?: Phaser.GameObjects.Rectangle;
  /** 안개 (맵 속성 fog): 레온 둘레만 또렷한 흰 막 */
  private fogFx?: { img: Phaser.GameObjects.Image; off: number; k: number };
  /** 이름(key) 붙은 표식 나무와 지금 빛나는 중인 것 */
  private marks: { key: string; s: Phaser.GameObjects.Sprite }[] = [];
  private marksLit = new Set<string>();
  private zoneFx?: Phaser.GameObjects.Ellipse;
  private grayFx?: Phaser.FX.ColorMatrix;
  private items = new Map<string, Phaser.GameObjects.Image>();
  /** 레온 왼쪽 어깨의 상처 빛 점과 룬 테두리 */
  private woundG?: Phaser.GameObjects.Graphics;
  private woundBoost = 0;
  private sensing = false;
  /** 흘러가는 강: 흘러가는 기슭 장식, 황도 불빛, 사막 띠 */
  private drift: { o: Phaser.GameObjects.Components.Transform; v: number }[] = [];
  private city?: { box: Phaser.GameObjects.Container; light?: Phaser.GameObjects.Light; base: number };
  private dawnBand?: Phaser.GameObjects.Container;
  /** 사막 낮의 노란 색조·아지랑이, 밤하늘의 별 (맵 속성 desert / stars) */
  private haze?: Phaser.GameObjects.Container;
  private stars: Phaser.GameObjects.Rectangle[] = [];
  private spots: { id: string; light: Phaser.GameObjects.Light }[] = [];
  private blinking = new Set<string>();
  private onEnd?: () => void;
  private lookables: Lookable[] = [];
  private near: Lookable | null = null;
  /** 살펴볼 수 있을 때 레온 머리 위에 뜨는 표시 */
  private mark?: Phaser.GameObjects.Sprite;
  private reading = false;
  private lockUntil = 0;
  private needWarn = 0;
  private moved = 0;
  private tutStep = 0;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private stick = { id: -1, x: 0, y: 0, dx: 0, dy: 0 };
  private touchUi: Vis[] = [];
  private stickKnob?: Phaser.GameObjects.Image;
  private touchLook = false;
  // 화면 글자
  private hud!: Phaser.GameObjects.Container;
  private lvText!: Phaser.GameObjects.Text;
  private expFill!: Phaser.GameObjects.Image;
  private countText!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private guideBox!: Phaser.GameObjects.Container;
  private guideText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;

  constructor() {
    super('Explore');
  }

  init(data: ExploreStart) {
    this.host = data.host;
    this.ready = false;
    this.mapId = '';
    this.map = undefined;
    this.tilemap = undefined;
    this.actors = new Map();
    this.worldObjs = [];
    this.lights2 = [];
    this.carry = [];
    this.mobs = [];
    this.auras = new Map();
    this.seg = null;
    this.lookables = [];
    this.touchUi = [];
    this.stickKnob = undefined;
    this.reading = false;
    this.stick = { id: -1, x: 0, y: 0, dx: 0, dy: 0 };
    this.woundG = undefined;
    this.woundBoost = 0;
    this.sensing = false;
  }

  preload() {
    preloadBattle(this);
    preloadMapArt(this);
    if (!this.textures.exists('oswald')) this.load.spritesheet('oswald', 'assets/sprites/oswald.png', fieldFrame('oswald'));
  }

  create() {
    makeBattleAnims(this);
    makeMapAnims(this);
    this.walkAnims('oswald');
    if (!this.textures.exists('snow_px')) {
      const g = this.make.graphics({}, false).fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2);
      g.generateTexture('snow_px', 2, 2);
      g.destroy();
    }
    this.lit = this.sys.game.renderer.type === Phaser.WEBGL;
    this.cameras.main.setZoom(ZOOM).setBackgroundColor('#05040a');
    this.uiCam = this.cameras.add(0, 0, W, H);
    if (this.lit) skipLightsFor(this.uiCam);
    this.makeUi();
    this.makeInput();
    this.time.addEvent({ delay: 90, loop: true, callback: () => this.flicker() });
    this.ready = true;
    this.events.emit('mapready');
  }

  private walkAnims(id: string) {
    DIRS.forEach((dir, i) => {
      const key = `${id}-walk-${dir}`;
      if (!this.anims.exists(key)) {
        this.anims.create({ key, frames: this.anims.generateFrameNumbers(id, { frames: [i * 5 + 1, i * 5 + 2, i * 5 + 3, i * 5 + 4] }), frameRate: 8, repeat: -1 });
      }
    });
  }

  private world<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.worldObjs.push(o);
    this.uiCam.ignore(o);
    return o;
  }
  private ui<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.cameras.main.ignore(o);
    return o;
  }
  private lightUp<T extends Phaser.GameObjects.GameObject>(o: T): T {
    if (this.lit) (o as unknown as Phaser.GameObjects.Components.Pipeline).setPipeline('Light2D');
    return o;
  }

  // ---------------------------------------------------------------
  // 맵 만들기
  // ---------------------------------------------------------------

  /** 맵을 바꾼다 (같은 맵이면 그대로). 인물은 모두 퇴장 */
  setMap(id: string) {
    if (this.mapId === id) return;
    this.clearWorld();
    const md = MAPS[id];
    if (!md) return console.error(`[map] 없는 맵: ${id}`);
    this.mapId = id;
    this.map = md;
    this.mapW = md.width * TS;
    this.mapH = md.height * TS;
    this.grid = solidGrid(md);
    this.wade = wadeGrid(md);
    this.boxes = [];
    this.named.clear();

    const cam = this.cameras.main;
    cam.setBackgroundColor(propOf<string>(md, 'bg') ?? '#05040a');
    const vw = W / ZOOM;
    const vh = H / ZOOM;
    cam.setBounds(Math.min(0, (this.mapW - vw) / 2), Math.min(0, (this.mapH - vh) / 2), Math.max(this.mapW, vw), Math.max(this.mapH, vh));

    // 밤 조명
    if (this.lit) this.lights.enable().setAmbientColor(this.ambientOf(md));

    const { tm, ts } = makeTilemap(this, id);
    this.tilemap = tm;
    const floorLayer = this.lightUp(this.world(tm.createLayer('floor', ts, 0, 0)!.setDepth(-20)));
    if (layerOf(md, 'blood')) this.blood = this.lightUp(this.world(tm.createLayer('blood', ts, 0, 0)!.setDepth(-19).setVisible(false)));
    const wallLayer = this.lightUp(this.world(tm.createLayer('walls', ts, 0, 0)!.setDepth(-15)));
    const wallShade = dressTiles(this, floorLayer, wallLayer);
    if (wallShade) this.world(wallShade.setDepth(-18));

    for (const o of objectsOf(md)) this.makeObject(o);
    this.makeSky(md);
  }

  private clearWorld() {
    this.stopPlay();
    for (const id of [...this.actors.keys()]) this.removeActor(id);
    for (const o of this.worldObjs) o.destroy();
    this.worldObjs = [];
    if (this.lit) for (const l of this.lights2) this.lights.removeLight(l.light);
    this.lights2 = [];
    if (this.lit) for (const c of this.carry) this.lights.removeLight(c.light);
    this.carry = [];
    if (this.lit) for (const sp of this.spots) this.lights.removeLight(sp.light);
    this.spots = [];
    this.namedLights.clear();
    this.pillarFx = undefined;
    this.veilFx?.destroy();
    this.veilFx = undefined;
    this.fogFx = undefined;
    this.marks = [];
    this.marksLit.clear();
    this.zoneFx = undefined;
    this.items.clear();
    this.haze = undefined;
    this.stars = [];
    this.drift = [];
    if (this.city?.light && this.lit) this.lights.removeLight(this.city.light);
    this.city = undefined;
    this.dawnBand = undefined;
    this.mobs = [];
    this.npcs.clear();
    this.auras.clear();
    this.blinking.clear();
    this.blood = undefined;
    this.tilemap?.destroy();
    this.tilemap = undefined;
    this.map = undefined;
    this.mapId = '';
  }

  private makeObject(o: TiledObj) {
    const f = footOf(o);
    if (o.type === 'prop') {
      if (!PROPS[o.name]) return;
      const s = this.world(makePropSprite(this, o));
      // 같은 그림이 여럿이면 key로 구별한다
      const key = String(propOf(o, 'key') ?? o.name);
      if (propOf(o, 'hidden')) s.setVisible(false);
      if (propOf(o, 'hidden') || propOf(o, 'key')) this.named.set(key, s);
      if (o.name === 'mark_tree' && propOf(o, 'key')) this.marks.push({ key, s });
      const fl = FLAMES[o.name];
      const top = f.y - PROPS[o.name].h;
      if (fl) {
        // 불꽃은 조명을 받지 않고 그대로 밝게, 주변을 비춘다
        const l = this.addLight(f.x, top + fl.top, fl.radius, 0xffa048, fl.intensity);
        const glow = this.world(this.add.ellipse(f.x, top + fl.top + 1, 24, 20, 0xffb060, 0.22).setDepth(s.depth + 0.1).setBlendMode(Phaser.BlendModes.ADD));
        this.tweens.add({ targets: glow, alpha: 0.42, duration: 300 + Math.random() * 200, yoyo: true, repeat: -1 });
        if (propOf(o, 'hidden')) {
          glow.setVisible(false);
          s.on('changevisible', (v: boolean) => glow.setVisible(v));
          if (l) this.hideLight(key, l);
        }
      } else this.lightUp(s);
      const solid = propOf<string>(o, 'solid');
      if (solid) {
        const [w, h] = solid.split(',').map(Number);
        this.boxes.push({ x0: f.x - w / 2, y0: f.y - h, x1: f.x + w / 2, y1: f.y });
      }
    } else if (o.type === 'body') {
      // 쓰러진 인물: 전투 동작 그림의 "쓰러짐" 칸
      const key = String(propOf(o, 'sprite') ?? 'mob_royal_knight');
      const row = Math.max(0, DIRS.indexOf((propOf<string>(o, 'facing') ?? 'down') as Dir));
      this.lightUp(this.world(this.add.sprite(o.x, o.y + 6, `bt_${key}`, row * 12 + 11).setOrigin(0.5, 1).setDepth(o.y - 10)));
      this.boxes.push({ x0: o.x - 10, y0: o.y - 8, x1: o.x + 10, y1: o.y });
    } else if (o.type === 'light') {
      const color = hex(propOf<string>(o, 'color') ?? '#ffffff');
      const l = this.addLight(o.x, o.y, Number(propOf(o, 'radius') ?? 120), color, Number(propOf(o, 'intensity') ?? 1), !propOf(o, 'flicker'));
      if (l && propOf(o, 'hidden')) this.hideLight(String(propOf(o, 'key') ?? o.name), l);
      if (propOf(o, 'spill')) {
        // 문틈에서 새는 차가운 흰빛
        const spill = this.world(this.add.ellipse(o.x, o.y + 6, 70, 24, color, 0.3).setDepth(-14).setBlendMode(Phaser.BlendModes.ADD));
        const line = this.world(this.add.rectangle(o.x, o.y - 32, 2, 52, color, 0.75).setDepth(-4).setBlendMode(Phaser.BlendModes.ADD));
        this.tweens.add({ targets: [spill, line], alpha: 0.15, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
    } else if (o.type === 'snow') {
      this.makeSnow(o);
    } else if (o.type === 'npc') {
      this.npcs.add(o.name);
      this.placeActor(o.name, { at: [o.x, o.y], sprite: String(propOf(o, 'sprite') ?? 'mob_citizen'), facing: propOf<string>(o, 'facing') ?? 'down' }, true);
    } else if (o.type === 'mob') {
      this.makeMob(o);
    }
  }

  /** 몹 무리: 같은 그림 2~3마리가 제자리에서 꿈틀거린다. 맵을 다시 만들면 다시 나타난다 */
  private makeMob(o: TiledObj) {
    const key = String(propOf(o, 'sprite') ?? 'sewer_rat');
    if (!this.textures.exists(key)) return;
    const sprs: Phaser.GameObjects.Sprite[] = [];
    for (const [dx, dy] of [[-10, -4], [10, 2], [0, 10]]) {
      const s = this.lightUp(this.world(this.add.sprite(o.x + dx, o.y + dy, key, 5).setOrigin(0.5, 1).setDepth(o.y + dy)));
      const dir = dx < 0 ? 'right' : 'left';
      if (this.anims.exists(`${key}-walk-${dir}`)) s.play({ key: `${key}-walk-${dir}`, startFrame: Math.floor(Math.random() * 4) });
      this.tweens.add({ targets: s, x: s.x + (dx < 0 ? 8 : -8), duration: 900 + Math.random() * 400, yoyo: true, repeat: -1, ease: 'Sine.inOut', onYoyo: () => s.toggleFlipX() });
      sprs.push(s);
    }
    this.mobs.push({ name: o.name, battle: String(propOf(o, 'battle') ?? ''), x: o.x, y: o.y, sprs });
  }

  /** 맵이 어두우면(dark) 인물이 빛을 들고 다닌다. 엘리시아가 있으면 지팡이 빛, 없으면 레온의 상처 빛 */
  private updateCarry() {
    if (!this.lit || !this.map) return;
    const only = propOf<string>(this.map, 'carry');
    if (!propOf(this.map, 'dark') && !only) return;
    const want = only ? (this.actors.has(only) ? only : null) : this.actors.has('elysia') ? 'elysia' : this.actors.has('leon') ? 'leon' : null;
    if (this.carry[0]?.id !== want) {
      for (const c of this.carry) this.lights.removeLight(c.light);
      this.carry = [];
      if (want) {
        const d = carryOf(want);
        this.carry.push({ id: want, light: this.lights.addLight(0, 0, d.r, d.color, d.intensity), base: d.intensity, pulse: d.pulse });
      }
    }
    for (const c of this.carry) {
      const a = this.actors.get(c.id);
      const p = c.at ?? (a && a.spr.visible ? { x: a.spr.x, y: a.spr.y - 24 } : null);
      if (p) c.light.setPosition(p.x, p.y);
      if (c.pulse && this.pillarFx && c.id === 'leon') {
        // 빛의 기둥과 같은 박자로
        c.light.intensity = c.base * (0.8 + 0.9 * this.pillarBeat());
      } else if (c.pulse) {
        const t = this.time.now / 1000;
        c.light.intensity = c.base * (0.75 + 0.25 * Math.max(0, Math.sin(t * 2.4)) ** 3 + 0.05 * Math.sin(t * 7));
      }
    }
  }

  /** 전투 중: 싸우는 인물의 자리(맵 좌표)로 빛을 옮긴다. 전투가 끝나면 null */
  trackCarry(id: string, at: { x: number; y: number } | null) {
    for (const c of this.carry) if (c.id === id) c.at = at ?? undefined;
  }

  /** 지금 빛을 든 인물 (전투 장면이 같은 빛을 따라 단다) */
  carrier() {
    const c = this.carry[0];
    return c ? { id: c.id, ...carryOf(c.id) } : null;
  }

  /** 상처 빛이 한 번 크게 번쩍 */
  pulseWound() {
    const c = this.carry.find((x) => x.id === 'leon');
    if (!c) return;
    this.tweens.addCounter({ from: 3.2, to: 1, duration: 700, ease: 'Quad.out', onUpdate: (tw) => (c.base = carryOf('leon').intensity * tw.getValue()!) });
  }

  /** 빛의 기둥의 맥박 (0~1) */
  private pillarBeat() {
    if (!this.pillarFx) return 0;
    return senseBeat(this.game.loop.time);
  }

  /** 빛의 기둥: 화면 오른쪽 끝, 아래에서 위로 솟았다가(rise) 위에서부터 사라진다(fade). 소리 없음 */
  private playPillar(mode: 'rise' | 'fade') {
    const cam = this.cameras.main;
    if (mode === 'rise') {
      if (this.pillarFx) return;
      const v = cam.worldView;
      const x = v.right - 14;
      const bar = this.world(this.add.rectangle(x, v.bottom, 3, v.height, 0xffffff, 0.95).setOrigin(0.5, 1).setDepth(9400).setBlendMode(Phaser.BlendModes.ADD));
      const glow = this.world(this.add.rectangle(x, v.bottom, 11, v.height, 0xdde8ff, 0.28).setOrigin(0.5, 1).setDepth(9399).setBlendMode(Phaser.BlendModes.ADD));
      bar.scaleY = 0;
      glow.scaleY = 0;
      this.pillarFx = { bar, glow, t0: this.time.now };
      this.tweens.add({ targets: [bar, glow], scaleY: 1, duration: 1600, ease: 'Cubic.out' });
      this.tweens.add({ targets: glow, alpha: 0.12, duration: 1047, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    } else {
      const p = this.pillarFx;
      if (!gameState.progress.once.includes(PILLAR_KEY)) gameState.progress.once.push(PILLAR_KEY);
      // 어깨 빛을 새 크기로
      for (const c of this.carry) if (c.id === 'leon') {
        const d = carryOf('leon');
        c.base = d.intensity;
        c.light.radius = d.r;
      }
      if (!p) return;
      // 위에서부터 사라짐: 아래를 기준점으로 둔 채 키를 줄인다
      this.tweens.add({
        targets: [p.bar, p.glow], scaleY: 0, duration: 1400, ease: 'Cubic.in',
        onComplete: () => {
          p.bar.destroy();
          p.glow.destroy();
          if (this.pillarFx === p) this.pillarFx = undefined;
        },
      });
    }
  }

  /** 화면을 한 색으로 덮어 간다 */
  private playVeil(v: NonNullable<StageDef['veil']>) {
    const cam = this.cameras.main;
    if (!this.veilFx) {
      this.veilFx = this.world(this.add.rectangle(0, 0, 10, 10, hex(v.color), 0).setOrigin(0).setScrollFactor(0).setDepth(9600));
      this.veilFx.setSize(cam.width / cam.zoom + 40, cam.height / cam.zoom + 40).setPosition(-20 + (cam.width - cam.width / cam.zoom) / 2, -20 + (cam.height - cam.height / cam.zoom) / 2);
    }
    this.veilFx.fillColor = hex(v.color);
    this.tweens.add({ targets: this.veilFx, fillAlpha: v.alpha, duration: v.ms ?? 1500, ease: 'Sine.inOut' });
  }

  /** ambient를 천천히 바꾼다 */
  private fadeAmbient(to: string, ms: number, start?: string) {
    if (!this.lit) return;
    const from = Phaser.Display.Color.ValueToColor(start ? hex(start) : this.curAmbient());
    const dst = Phaser.Display.Color.ValueToColor(hex(to));
    this.tweens.addCounter({
      from: 0, to: 100, duration: ms,
      onUpdate: (tw) => {
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(from, dst, 100, tw.getValue() ?? 0);
        this.lights.setAmbientColor(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      },
    });
  }

  /** 이 인물들 둘레만 밝게 (둘만의 결투) */
  private setSpots(ids: string[] | null) {
    if (!this.lit) return;
    for (const sp of this.spots) this.lights.removeLight(sp.light);
    this.spots = (ids ?? []).map((id) => ({ id, light: this.lights.addLight(0, 0, 90, 0xfff4dc, 1.6) }));
  }

  private addLight(x: number, y: number, r: number, color: number, intensity: number, steady = false) {
    if (!this.lit) return null;
    const light = this.lights.addLight(x, y, r, color, intensity);
    const l = { light, base: steady ? -1 : intensity, r, color };
    this.lights2.push(l);
    return l;
  }

  /** 처음엔 꺼 두는 빛 (이름으로 켠다) */
  private hideLight(name: string, l: { light: Phaser.GameObjects.Light; base: number }) {
    const list = this.namedLights.get(name) ?? [];
    list.push({ light: l.light, base: l.base < 0 ? l.light.intensity : l.base });
    this.namedLights.set(name, list);
    l.light.setVisible(false);
  }

  /** 횃불·촛불 일렁임 */
  private flicker() {
    for (const l of this.lights2) {
      if (l.base < 0) continue;
      l.light.intensity = l.base * (0.82 + Math.random() * 0.3);
      l.light.radius = l.r * (0.95 + Math.random() * 0.08);
    }
  }

  /** 눈: glass = 창 유리 안에서만, blow = 열린 창으로 들이침, fall = 하늘 전체 */
  private makeSnow(o: TiledObj) {
    const mode = propOf<string>(o, 'mode') ?? 'glass';
    const { x, y, width: w, height: h } = o;
    if (mode === 'glass') {
      // 창 안쪽에 은은한 달빛, 바닥에 창빛
      this.world(this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x8fb0ff, 0.12).setDepth(-14.5).setBlendMode(Phaser.BlendModes.ADD));
      this.world(this.add.ellipse(x + w / 2, 114, w + 18, 14, 0x8fb0ff, 0.12).setDepth(-18).setBlendMode(Phaser.BlendModes.ADD));
      const e = this.add.particles(0, 0, 'snow_px', {
        x: { min: x, max: x + w }, y, lifespan: 5000, speedY: { min: 9, max: 18 }, speedX: { min: -3, max: 5 },
        frequency: 220, quantity: 1, scale: { min: 0.5, max: 1 }, alpha: { min: 0.55, max: 0.95 }, advance: 4000,
        deathZone: { type: 'onLeave', source: new Phaser.Geom.Rectangle(x, y, w, h) },
      });
      this.world(e.setDepth(-14));
    } else if (mode === 'blow') {
      const e = this.add.particles(0, 0, 'snow_px', {
        x: { min: x, max: x + w }, y: { min: y, max: y + h }, lifespan: 2600, speedY: { min: 30, max: 62 }, speedX: { min: -22, max: 26 },
        frequency: 60, quantity: 1, scale: { min: 0.5, max: 1 }, alpha: { start: 0.95, end: 0 }, advance: 2500,
      });
      this.world(e.setDepth(9000));
    } else {
      const e = this.add.particles(0, 0, 'snow_px', {
        x: { min: x - 40, max: x + w }, y: y - 6, lifespan: (h / 30) * 1000, speedY: { min: 24, max: 40 }, speedX: { min: -4, max: 10 },
        frequency: 30, quantity: 1, scale: { min: 0.5, max: 1 }, alpha: { min: 0.5, max: 0.95 }, advance: 16000,
      });
      this.world(e.setDepth(9000));
    }
  }

  // ---------------------------------------------------------------
  // 무대
  // ---------------------------------------------------------------

  private point(p: Pt | undefined): { x: number; y: number } | null {
    if (!p) return null;
    if (Array.isArray(p)) return { x: p[0], y: p[1] };
    const o = this.map && findObj(this.map, 'spawn', p);
    if (!o) {
      console.warn(`[map] ${this.mapId}에 없는 자리: ${p}`);
      return null;
    }
    return { x: o.x, y: o.y };
  }

  /** 무대를 바꾼다. reset이면 인물을 모두 새로 세운다. instant면 걷기·카메라 이동 없이 바로 */
  applyStage(def: StageDef, { reset = false, instant = false } = {}) {
    if (def.map) this.setMap(def.map);
    if (!this.map) return;
    if (reset) for (const id of [...this.actors.keys()]) if (!this.npcs.has(id)) this.removeActor(id);
    if (def.blood !== undefined) this.blood?.setVisible(def.blood);
    for (const [name, v] of Object.entries(def.props ?? {})) {
      const on = typeof v === 'string' ? flagOk(v) : v;
      const spr = this.named.get(name);
      spr?.setVisible(on && !this.seen(name));
      spr?.emit('changevisible', on && !this.seen(name));
      for (const l of this.namedLights.get(name) ?? []) l.light.setVisible(on);
    }
    for (const [id, spec] of Object.entries(def.actors ?? {})) {
      if (spec?.if && !flagOk(spec.if)) continue;
      if (spec === null) this.removeActor(id);
      else this.placeActor(id, spec, instant);
    }
    this.focus(def.focus ?? (reset ? 'leon' : undefined), instant);
    if (def.fall && !instant) this.playFall(def.fall);
    if (def.ambient && this.lit) {
      if (def.fade && !instant) this.fadeAmbient(def.ambient, def.fade, def.from);
      else this.lights.setAmbientColor(hex(def.ambient));
    }
    if (def.pulse && !instant) this.pulseWound();
    if (def.once && !gameState.progress.once.includes(def.once)) gameState.progress.once.push(def.once);
    if (def.city !== undefined) this.setCity(def.city, instant);
    if (def.dawnBand !== undefined) this.setDawnBand(def.dawnBand, instant);
    if (def.pillar === 'rise' && !instant) this.playPillar('rise');
    if (def.pillar === 'fade') this.playPillar('fade');
    if (def.veil) {
      if (instant && this.veilFx) this.veilFx.fillAlpha = def.veil.alpha;
      else this.playVeil(instant ? { ...def.veil, ms: 1 } : def.veil);
    }
    if (def.spot !== undefined) this.setSpots(def.spot);
    if (def.flash && !instant) this.flashActor(def.flash.who, def.flash.color);
    for (const [id, color] of Object.entries(def.aura ?? {})) this.setAura(id, color);
    for (const [id, color] of Object.entries(def.flicker ?? {})) {
      this.setAura(id, color);
      if (color) this.blinking.add(id);
      else this.blinking.delete(id);
    }
    if (def.embers && !instant) this.playEmbers(def.embers);
    for (const [id, it] of Object.entries(def.items ?? {})) this.placeItem(id, it, instant);
    if (def.fog === 'lift') this.liftFog(instant);
    if (def.rune) {
      const k = def.rune === 'break' ? RUNE_BREAK_KEY : LAYER_KEY;
      if (!gameState.progress.once.includes(k)) gameState.progress.once.push(k);
      for (const c of this.carry) if (c.id === 'leon') {
        const d = carryOf('leon');
        c.base = d.intensity;
        c.light.radius = d.r;
      }
      if (def.rune === 'break' && !instant) this.runeShards();
    }
    if (def.awe && !instant) this.playAwe(def.awe);
    if (def.gray && !instant) this.playGray(def.gray);
    if (def.zone !== undefined) this.setZone(def.zone);
    if (def.reveal) this.reveal(def.reveal, instant);
    if (def.shine && !instant) this.shineProp(def.shine);
  }

  /** 숨긴 물건·빛을 하나씩 켠다 */
  private reveal(r: NonNullable<StageDef['reveal']>, instant: boolean) {
    const on = (k: string) => {
      const spr = this.named.get(k);
      spr?.setVisible(true);
      spr?.emit('changevisible', true);
      for (const l of this.namedLights.get(k) ?? []) l.light.setVisible(true);
    };
    if (instant) return r.keys.forEach(on);
    r.keys.forEach((k, i) => this.time.delayedCall(i * r.ms, () => {
      if (!this.map) return;
      on(k);
      if (r.se) playSe(this, r.se);
    }));
  }

  /** 이름 붙은 물건이 잠깐 하얗게(보랏빛 섞어) 빛난다 */
  private shineProp(key: string) {
    const s = this.named.get(key);
    if (!s || !s.visible) return;
    const fx = this.world(this.add.sprite(s.x, s.y, s.texture.key, s.frame.name).setOrigin(s.originX, s.originY));
    fx.setTintFill(0xe8dcff).setAlpha(0).setDepth(s.depth + 0.2).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: fx, alpha: 0.45, duration: 350, yoyo: true, hold: 300, onComplete: () => fx.destroy() });
  }

  /** 표식 나무 가까이(약 60px) 가면 칼자국이 잠깐 밝아진다. 멀어졌다 다시 오면 또 */
  private updateMarks(leon: Actor) {
    for (const m of this.marks) {
      const near = Math.hypot(m.s.x - leon.spr.x, m.s.y - leon.spr.y) < 60;
      if (near && !this.marksLit.has(m.key)) {
        this.marksLit.add(m.key);
        this.shineProp(m.key);
      } else if (!near) this.marksLit.delete(m.key);
    }
  }

  /** 안개: 둘레 반경 약 4타일만 또렷하고 나머지는 흰 막. 텍스처는 한 번만 만든다 */
  private makeFog(md: NonNullable<typeof this.map>) {
    const W = 1024;
    const H = 768;
    if (!this.textures.exists('fx_fog')) {
      const t = this.textures.createCanvas('fx_fog', W, H)!;
      const c = t.getContext();
      const g = c.createRadialGradient(W / 2, H / 2, TS * 3, W / 2, H / 2, TS * 6);
      g.addColorStop(0, 'rgba(216,220,220,0)');
      g.addColorStop(1, 'rgba(216,220,220,1)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      t.refresh();
    }
    const img = this.world(this.add.image(0, 0, 'fx_fog').setDepth(9300).setAlpha(0.88));
    this.fogFx = { img, off: 0, k: 1 };
    void md;
  }

  /** 안개가 레온을 따라다닌다. 레온이 안 보이면(전투 등) 화면 가운데에서 옅게 */
  private updateFog() {
    const f = this.fogFx;
    if (!f) return;
    const a = this.actors.get('leon');
    const v = this.cameras.main.worldView;
    const shown = !!a && a.spr.visible;
    const x = shown ? a!.spr.x : v.centerX;
    const y = shown ? a!.spr.y - 12 : v.centerY;
    f.img.setPosition(x, y + f.off).setAlpha((shown ? 0.88 : 0.5) * f.k);
  }

  /** 안개가 걷힌다: 막이 아래로 밀려 내려가며(위쪽부터 맑아짐) 사라진다 */
  private liftFog(instant: boolean) {
    const f = this.fogFx;
    if (!f) return;
    const done = () => {
      f.img.destroy();
      if (this.fogFx === f) this.fogFx = undefined;
    };
    if (instant) return done();
    this.tweens.add({ targets: f, off: 420, k: 0, duration: 2600, ease: 'Sine.in', onComplete: done });
  }

  /** 룬이 유리처럼 깨진다: 어깨에서 보랏빛 조각이 튀고 하얀 빛이 번진다 */
  private runeShards() {
    const a = this.actors.get('leon');
    if (!a) return;
    const [ox, oy] = SHOULDER[a.facing];
    const x = a.spr.x + ox;
    const y = a.spr.y + oy;
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
      const d = 18 + Math.random() * 22;
      const p = this.world(this.add.rectangle(x, y, 2, 1 + (i % 2), 0xa47cff).setDepth(a.spr.depth + 2).setAngle(Math.random() * 180));
      this.tweens.add({ targets: p, x: x + Math.cos(ang) * d, y: y + Math.sin(ang) * d + 8, angle: p.angle + 180, alpha: 0, duration: 700 + Math.random() * 300, ease: 'Quad.out', onComplete: () => p.destroy() });
    }
    const glow = this.world(this.add.ellipse(x, y, 10, 10, 0xffffff, 0.8).setDepth(a.spr.depth + 1.5).setBlendMode(Phaser.BlendModes.ADD));
    this.tweens.add({ targets: glow, scale: 5, alpha: 0, duration: 800, ease: 'Quad.out', onComplete: () => glow.destroy() });
    this.woundFx('flare');
  }

  /** 위압: 번쩍임과 퍼지는 고리, freeze면 다른 인물이 1초 동안 굳는다 */
  private playAwe(w: NonNullable<StageDef['awe']>) {
    const a = this.actors.get(w.who);
    if (!a) return;
    this.flashActor(w.who, w.color);
    const ring = this.world(this.add.ellipse(a.spr.x, a.spr.y - 14, 12, 8).setStrokeStyle(2, hex(w.color), 0.9).setDepth(9200).setBlendMode(Phaser.BlendModes.ADD));
    this.tweens.add({ targets: ring, scale: 12, alpha: 0, duration: 900, ease: 'Quad.out', onComplete: () => ring.destroy() });
    if (!w.freeze) return;
    const others = [...this.actors.values()].filter((o) => o.id !== w.who);
    for (const o of others) {
      for (const tw of this.tweens.getTweensOf(o.spr)) tw.pause();
      o.spr.anims.pause();
    }
    this.time.delayedCall(1000, () => {
      for (const o of others) {
        for (const tw of this.tweens.getTweensOf(o.spr)) tw.resume();
        o.spr.anims.resume();
      }
    });
  }

  /** 채도가 빠졌다가(ms 동안) 돌아온다 */
  private playGray(ms: number) {
    const cam = this.cameras.main;
    if (!cam.postFX) return;
    this.grayFx ??= cam.postFX.addColorMatrix();
    const fx = this.grayFx;
    const set = (v: number) => fx.grayscale(v);
    this.tweens.addCounter({
      from: 0, to: 0.9, duration: 200, onUpdate: (tw) => set(tw.getValue() ?? 0),
      onComplete: () => this.tweens.addCounter({ from: 0.9, to: 0, delay: ms, duration: 600, onUpdate: (tw) => set(tw.getValue() ?? 0), onComplete: () => fx.reset() }),
    });
  }

  /** 바닥의 붉은 범위 (습격대장의 빛이 떨어질 자리) */
  private setZone(z: StageDef['zone']) {
    this.zoneFx?.destroy();
    this.zoneFx = undefined;
    const p = z && this.point(z.at);
    if (!z || !p) return;
    const e = this.world(this.add.ellipse(p.x, p.y, z.r * 2, z.r * 1.2, 0xff3030, 0.25).setStrokeStyle(1, 0xff5050, 0.8).setDepth(-13).setBlendMode(Phaser.BlendModes.ADD));
    this.tweens.add({ targets: e, alpha: 0.5, duration: 400, yoyo: true, repeat: -1 });
    this.zoneFx = e;
  }

  /** 불씨: 인물 손에서 화면 위로 */
  private playEmbers(e: NonNullable<StageDef['embers']>) {
    const a = this.actors.get(e.who);
    const at = e.at ? this.point(e.at) : a ? { x: a.spr.x, y: a.spr.y - 18 } : null;
    if (!at) return;
    const top = this.cameras.main.worldView.top - 10;
    for (let i = 0; i < 14; i++) {
      const p = this.world(this.add.rectangle(at.x + (Math.random() - 0.5) * 8, at.y, 2, 2, hex(e.color)).setDepth(9450).setBlendMode(Phaser.BlendModes.ADD));
      this.tweens.add({
        targets: p, y: top - Math.random() * 30, x: p.x + (Math.random() - 0.5) * 40, alpha: 0,
        delay: i * 140, duration: 2600 + Math.random() * 900, ease: 'Sine.in', onComplete: () => p.destroy(),
      });
    }
  }

  /** 인물 둘레의 옅은 빛 테두리 (엘리시아의 변장 마법) */
  private setAura(id: string, color: string | null) {
    this.auras.get(id)?.destroy();
    this.auras.delete(id);
    const a = this.actors.get(id);
    if (!color || !a) return;
    const s = this.world(this.add.sprite(a.spr.x, a.spr.y, a.spr.texture.key, a.spr.frame.name).setOrigin(0.5, 1).setScale(1.12));
    s.setTintFill(hex(color)).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD);
    this.auras.set(id, s);
  }

  /** 떨어져서 물에 풍덩: 점프 꼭대기 그림으로 떨어지고, 물보라와 물결을 남기고 사라진다 */
  private playFall(f: NonNullable<StageDef['fall']>) {
    const from = this.point(f.from);
    const to = this.point(f.to);
    if (!from || !to) return;
    const frame = (4 + DIRS.indexOf('down')) * 5 + 2;
    const spr = this.lightUp(this.world(this.add.sprite(from.x, from.y, f.sprite, frame).setOrigin(0.5, footOrigin(f.sprite)).setDepth(to.y + 50)));
    this.tweens.add({
      targets: spr, x: to.x, y: to.y, duration: f.ms ?? 900, ease: 'Quad.easeIn',
      onComplete: () => {
        spr.destroy();
        this.cameras.main.shake(120, 0.003);
        // 물결 고리
        for (let i = 0; i < 3; i++) {
          const ring = this.world(this.add.ellipse(to.x, to.y, 10, 4).setStrokeStyle(1, 0xcfe4ff, 0.9).setDepth(to.y - 1));
          this.tweens.add({ targets: ring, scaleX: 5 + i * 2, scaleY: 5 + i * 2, alpha: 0, delay: i * 220, duration: 1100, onComplete: () => ring.destroy() });
        }
        // 물방울
        for (let i = 0; i < 10; i++) {
          const d = this.world(this.add.rectangle(to.x, to.y - 4, 2, 2, 0xe6f2ff).setDepth(to.y + 51));
          const dx = (Math.random() - 0.5) * 50;
          const up = 18 + Math.random() * 22;
          this.tweens.add({ targets: d, x: to.x + dx, duration: 600 });
          this.tweens.add({ targets: d, y: to.y - 4 - up, duration: 260, ease: 'Quad.easeOut', yoyo: true, onComplete: () => d.destroy() });
        }
      },
    });
  }

  private focus(f: Pt | undefined, instant: boolean) {
    if (!f) return;
    const cam = this.cameras.main;
    const a = typeof f === 'string' ? this.actors.get(f) : undefined;
    if (a) {
      cam.startFollow(a.spr, true, instant ? 1 : 0.08, instant ? 1 : 0.08, 0, 20);
      return;
    }
    const p = this.point(f);
    if (!p) return;
    cam.stopFollow();
    if (instant) cam.centerOn(p.x, p.y);
    else cam.pan(p.x, p.y, 700, 'Sine.easeInOut');
  }

  private placeActor(id: string, spec: ActorSpec, instant: boolean) {
    let a = this.actors.get(id);
    const at = this.point(spec.at);
    const fresh = !a;
    if (!a) {
      const start = at ?? this.point(spec.walk);
      if (!start) return console.warn(`[map] 처음 나오는 인물은 자리(at)가 필요합니다: ${id}`);
      const key = spec.sprite ?? this.costumeOf(id);
      // 발밑 그림자: 새 도트는 팔레트의 푸른 보라 그림자 (docs/도트기준.md)
      const sc = isHd(key) ? SHADOW_HD : SHADOW_OLD;
      const shadow = this.world(this.add.ellipse(start.x, start.y, sc.w, sc.h, sc.color, sc.alpha).setDepth(-13));
      const spr = this.lightUp(this.world(this.add.sprite(start.x, start.y, key, 0).setOrigin(0.5, footOrigin(key))));
      a = { id, key, spr, shadow, facing: 'down', down: false, walking: false };
      this.actors.set(id, a);
    }
    const act = a;
    act.spr.setVisible(true);
    if (at) {
      this.tweens.killTweensOf(act.spr);
      act.walking = false;
      act.spr.setPosition(at.x, at.y);
    }
    if (spec.lift !== undefined) act.lift = spec.lift;
    if (spec.drag !== undefined) [act.drag, act.lastDrag] = [spec.drag ?? undefined, undefined];
    if (spec.facing) act.facing = spec.facing as Dir;
    const setPose = () => {
      if (spec.pose === 'down') [act.down, act.kneel] = [true, false];
      else if (spec.pose === 'kneel') [act.down, act.kneel] = [true, true];
      else if (spec.pose === 'stand') [act.down, act.kneel] = [false, false];
    };
    const to = this.point(spec.walk);
    const hop = this.point(spec.hop);
    // 도착한 뒤: 자세, 고개 숙이기, 적기, 퇴장
    const arrive = () => {
      act.walking = false;
      if (spec.facing) act.facing = spec.facing as Dir;
      setPose();
      this.pose(act);
      if (spec.write !== undefined) this.setWriting(act, spec.write && !instant);
      if (spec.compare !== undefined) this.setCompare(act, spec.compare);
      if (spec.nod && !instant) this.playNod(act);
      if (spec.leave) this.removeActor(act.id);
    };
    const walk = () => {
      if (!to) return arrive();
      const dx = to.x - act.spr.x;
      const dy = to.y - act.spr.y;
      const dist = Math.hypot(dx, dy);
      if (instant || dist < 2) {
        act.spr.setPosition(to.x, to.y);
        return arrive();
      }
      act.walking = true;
      act.down = false;
      this.setWriting(act, false);
      const dir: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      act.spr.setOrigin(0.5, footOrigin(act.key)).play(`${act.key}-walk-${dir}`, true);
      this.tweens.add({ targets: act.spr, x: to.x, y: to.y, duration: (dist / (spec.speed ?? WALK_SPEED)) * 1000, onComplete: arrive });
    };
    this.tweens.killTweensOf(act.spr);
    act.walking = false;
    if (!to && !hop) setPose();
    this.pose(act);
    if (spec.emerge && fresh && !instant) this.playEmerge(act);
    if (hop) {
      // 말에서 뛰어내리기: 그림 높이를 포물선으로 낮추며 옆자리로
      const from = { x: act.spr.x, y: act.spr.y, lift: act.lift ?? 0 };
      if (instant) {
        act.spr.setPosition(hop.x, hop.y);
        act.lift = 0;
        return walk();
      }
      act.walking = true;
      this.tweens.addCounter({
        from: 0, to: 1, duration: 420, ease: 'Sine.inOut',
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          act.spr.setPosition(from.x + (hop.x - from.x) * t, from.y + (hop.y - from.y) * t);
          act.lift = from.lift * (1 - t) + Math.sin(Math.PI * t) * 8;
        },
        onComplete: () => {
          act.lift = 0;
          act.walking = false;
          this.dust(hop.x, hop.y, 0xd6b98a, 6);
          this.time.delayedCall(180, walk);
        },
      });
      return;
    }
    if (to || spec.nod || spec.write !== undefined || spec.leave || spec.compare !== undefined) walk();
  }

  /** 인물을 한 번 번쩍이게 (그림 모양 그대로 한 색으로) */
  private flashActor(who: string, color: string) {
    const a = this.actors.get(who);
    if (!a) return;
    const fx = this.world(this.add.sprite(a.spr.x, a.spr.y, a.spr.texture.key, a.spr.frame.name).setOrigin(a.spr.originX, a.spr.originY));
    fx.setTintFill(hex(color)).setDepth(a.spr.depth + 1).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: fx, alpha: 0, duration: 600, onComplete: () => fx.destroy() });
  }

  /**
   * 검문 병사: 손에 든 전단을 들여다보고(아래), 앞사람 얼굴을 본다(dir). 이것을 되풀이한다
   * 전단은 누런 종이에 얼굴 자리만 어둡게 찍은 작은 네모
   */
  private setCompare(a: Actor, dir: string | false) {
    a.compareFx?.timer.remove();
    a.compareFx?.paper.destroy();
    a.compareFx = undefined;
    if (!dir) return;
    const look = dir as Dir;
    const paper = this.world(this.add.container(0, 0, [
      this.lightUp(this.add.rectangle(0, 0, 5, 6, 0xe8dcc0).setOrigin(0.5, 1)),
      this.lightUp(this.add.rectangle(0, -3, 3, 2, 0x6a5a48).setOrigin(0.5, 1)),
    ]));
    let phase = 0;
    const step = () => {
      if (a.walking || a.down) return;
      phase ^= 1;
      a.facing = phase ? 'down' : look;
      this.pose(a);
      // 들여다볼 때는 전단을 눈앞에, 얼굴을 볼 때는 앞사람 쪽으로 내밀어 견준다
      const side = look === 'left' ? -1 : look === 'right' ? 1 : 0;
      if (phase) paper.setPosition(a.spr.x + 2, a.spr.y - 15).setDepth(a.spr.y + 1);
      else paper.setPosition(a.spr.x + side * 9, a.spr.y - 19).setDepth(a.spr.y + 1);
      if (phase) this.tweens.add({ targets: a.spr, scaleY: 0.95, duration: 160, yoyo: true, ease: 'Sine.inOut' });
    };
    step();
    const timer = this.time.addEvent({ delay: 1100 + Math.random() * 300, loop: true, startAt: Math.random() * 600, callback: step });
    a.compareFx = { paper, timer };
  }

  /**
   * 레온 왼쪽 어깨의 상처 빛 점 (1막부터 계속). 상처 빛과 같은 박자로 깜빡인다.
   * 룬으로 누른 뒤(SEAL_KEY)에는 보랏빛 룬 테두리 안에서 약하게, 빛의 기둥을 본 뒤(PILLAR_KEY)에는 조금 더 크고 밝게
   */
  private updateWound() {
    const a = this.actors.get('leon');
    const on = !!a && a.spr.visible && !!this.host.wounded?.() && (!a.down || !!a.kneel);
    if (!on || !a) return void this.woundG?.setVisible(false);
    if (!this.woundG) this.woundG = this.world(this.add.graphics());
    const g = this.woundG.clear().setVisible(true);
    const once = gameState.progress.once;
    const broken = once.includes(RUNE_BREAK_KEY) && !once.includes(LAYER_KEY);
    const layered = once.includes(LAYER_KEY);
    const sealed = once.includes(SEAL_KEY) && !broken;
    const big = once.includes(PILLAR_KEY) || once.includes(A3_KEY) || broken;
    const t = this.time.now / 1000;
    const beat = this.sensing
      ? senseBeat(this.game.loop.time)
      : this.pillarFx
        ? this.pillarBeat()
        : Math.max(0, Math.sin(t * 2.4)) ** 3;
    const [ox, oy] = SHOULDER[a.facing];
    const x = Math.round(a.spr.x + ox);
    const y = Math.round(a.spr.y + (a.down ? oy + 8 : oy - (a.lift ?? 0)));
    // 오른쪽을 보면 어깨가 몸 뒤라서 그림 뒤로
    g.setDepth(a.spr.depth + (a.facing === 'right' ? -0.1 : 0.1));
    const lvl = (sealed ? 0.35 + 0.5 * beat : 0.45 + 0.55 * beat) * (broken ? 1.6 : big ? 1.2 : 1) + this.woundBoost;
    if (layered) {
      // 겹쳐 그린 룬: 고리 세 겹, 그 사이로 하얀 빛이 희미하게 샌다
      g.fillStyle(0xdde8ff, 0.15 + 0.25 * beat);
      for (const r of [5, 7]) for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) if (Math.round(Math.hypot(dx, dy)) === r && (dx + dy + Math.floor(t * 3)) % 3 === 0) g.fillRect(x + dx, y + dy, 1, 1);
      g.fillStyle(0xa47cff, Math.min(1, 0.7 + 0.2 * beat + this.woundBoost * 0.3));
      for (const r of [4, 6, 8]) for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) if (Math.round(Math.hypot(dx, dy)) === r) g.fillRect(x + dx, y + dy, 1, 1);
    } else if (sealed) {
      // 룬 테두리: 점을 둘러싼 보랏빛 고리 (픽셀)
      const r = big ? 4 : 3;
      g.fillStyle(0xa47cff, Math.min(1, 0.7 + 0.2 * beat + this.woundBoost * 0.3));
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) if (Math.round(Math.hypot(dx, dy)) === r) g.fillRect(x + dx, y + dy, 1, 1);
    }
    const s = big ? 3 : 2;
    if (lvl > 0.9) {
      // 크게 맥박칠 때는 둘레로 번진다
      g.fillStyle(0xdde8ff, Math.min(0.5, (lvl - 0.9) * 0.6));
      g.fillRect(x - s, y - s, s * 2 + (s % 2), s * 2 + (s % 2));
    }
    g.fillStyle(0xffffff, Math.min(1, lvl));
    g.fillRect(x - Math.floor(s / 2), y - Math.floor(s / 2), s, s);
  }

  /**
   * 상처 반응 (대본의 wound): flicker = 희미하게 한 번, flare = 크게 맥박치며 번쩍,
   * sense = 2초마다 맥박 (off까지, 화면 왼쪽 가장자리와 같은 박자)
   */
  woundFx(mode: 'flicker' | 'flare' | 'sense' | 'off') {
    if (mode === 'sense' || mode === 'off') return void (this.sensing = mode === 'sense');
    const peak = mode === 'flare' ? 2.2 : 0.5;
    this.tweens.addCounter({ from: peak, to: 0, duration: mode === 'flare' ? 900 : 600, ease: 'Quad.out', onUpdate: (tw) => (this.woundBoost = tw.getValue() ?? 0) });
    if (mode === 'flare') {
      this.pulseWound();
      this.flashActor('leon', '#ffffff');
    }
  }

  /** 고개를 숙였다 든다 (그림을 살짝 눌렀다 편다) */
  private playNod(a: Actor) {
    this.tweens.add({ targets: a.spr, scaleY: 0.9, duration: 260, yoyo: true, hold: 420, ease: 'Sine.inOut' });
  }

  /** 모래 속에서 기어 나온다: 그림이 아래에서 위로 드러나고 모래가 튄다 */
  private playEmerge(a: Actor) {
    a.spr.setScale(1, 0.05);
    this.tweens.add({ targets: a.spr, scaleY: 1, duration: 700, ease: 'Back.out' });
    this.dust(a.spr.x, a.spr.y, 0xd6b98a, 10);
  }

  /** 발밑에 흙먼지 (작은 네모가 튀어 올랐다 떨어짐) */
  private dust(x: number, y: number, color: number, n: number) {
    for (let i = 0; i < n; i++) {
      const d = this.world(this.add.rectangle(x + (Math.random() - 0.5) * 10, y - 1, 2, 2, color).setDepth(y + 1));
      this.tweens.add({ targets: d, x: d.x + (Math.random() - 0.5) * 30, duration: 500 });
      this.tweens.add({ targets: d, y: y - 6 - Math.random() * 10, duration: 220, ease: 'Quad.out', yoyo: true, onComplete: () => d.destroy() });
    }
  }

  /** 앉아서 적기: 무릎 앞에 종이, 펜 끝이 좌우로 움직인다 */
  private setWriting(a: Actor, on: boolean) {
    for (const o of a.writeFx ?? []) o.destroy();
    a.writeFx = undefined;
    if (!on || !this.textures.exists('ex_notebook')) return;
    const fwd = { down: [0, 6], up: [0, -4], left: [-8, 2], right: [8, 2] }[a.facing];
    const x = a.spr.x + fwd[0];
    const y = a.spr.y + fwd[1];
    const paper = this.lightUp(this.world(this.add.image(x, y, 'ex_notebook').setOrigin(0.5, 1).setDepth(a.spr.y + 0.5)));
    const pen = this.lightUp(this.world(this.add.rectangle(x - 3, y - 4, 1, 3, 0x2f2c3b).setOrigin(0.5, 1).setDepth(a.spr.y + 0.6)));
    this.tweens.add({ targets: pen, x: x + 3, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.tweens.add({ targets: pen, y: y - 2, duration: 1520, yoyo: true, repeat: -1, ease: 'Stepped' });
    a.writeFx = [paper, pen];
  }

  /** 맵 위 물건 그림: 놓기, 굴러가기(to), 치우기(null) */
  private placeItem(id: string, spec: ItemSpec | null, instant: boolean) {
    const old = this.items.get(id);
    if (spec === null) {
      old?.destroy();
      this.items.delete(id);
      return;
    }
    const at = this.point(spec.at);
    let it = old;
    if (!it) {
      if (!at || !this.textures.exists(`ex_${spec.key}`)) return;
      it = this.lightUp(this.world(this.add.image(at.x, at.y, `ex_${spec.key}`).setOrigin(0.5, 1).setDepth(at.y)));
      this.items.set(id, it);
    } else if (at) it.setPosition(at.x, at.y);
    const to = this.point(spec.to);
    if (!to) return;
    const item = it;
    if (instant) return void item.setPosition(to.x, to.y).setDepth(to.y);
    // 굴러가기: 통통 튀며 미끄러지다 멈춘다
    const from = { x: item.x, y: item.y };
    this.tweens.addCounter({
      from: 0, to: 1, delay: spec.delay ?? 0, duration: spec.ms ?? 700, ease: 'Quad.out',
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        const bounce = Math.abs(Math.sin(t * Math.PI * 3)) * (1 - t) * 6;
        item.setPosition(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t - bounce).setDepth(item.y + bounce);
      },
      onComplete: () => this.dust(to.x, to.y, 0xd6b98a, 5),
    });
  }

  private pose(a: Actor) {
    if (a.walking) return;
    a.spr.anims.stop();
    const row = DIRS.indexOf(a.facing);
    if (a.down && this.textures.exists(`bt_${a.key}`)) a.spr.setTexture(`bt_${a.key}`, row * 12 + (a.kneel ? 10 : 11)).setOrigin(0.5, 0.86);
    else a.spr.setTexture(a.key, row * 5).setOrigin(0.5, footOrigin(a.key));
    if (a.lift) a.spr.setOrigin(0.5, a.spr.originY + a.lift / a.spr.height);
  }

  /** 인물의 지금 도트 그림 (대본의 costume. 그림이 없으면 기본) */
  private costumeOf(id: string) {
    const c = gameState.progress.costume[id];
    return c && this.textures.exists(c) ? c : id;
  }

  /** 겉모습 바꾸기: 맵에 서 있는 인물의 그림을 바로 바꾼다 */
  setCostume(id: string, sprite: string) {
    const a = this.actors.get(id);
    if (!a || !this.textures.exists(sprite)) return;
    a.key = sprite;
    a.walking = false;
    this.tweens.killTweensOf(a.spr);
    this.pose(a);
  }

  private removeActor(id: string) {
    const a = this.actors.get(id);
    if (!a) return;
    this.setCompare(a, false);
    this.tweens.killTweensOf(a.spr);
    if ((this.cameras.main as unknown as { _follow: unknown })._follow === a.spr) this.cameras.main.stopFollow();
    this.setWriting(a, false);
    a.spr.destroy();
    a.shadow.destroy();
    this.actors.delete(id);
  }

  // ---------------------------------------------------------------
  // 전투 (BattleScene이 이 맵 위에서 싸운다)
  // ---------------------------------------------------------------

  get currentMap() {
    return this.map;
  }

  private ambientOf(md: Parameters<typeof propOf>[0]) {
    if (propOf(md, 'dark') && gameState.progress.once.includes(LIGHT_KEY)) return hex(LIT_AMBIENT);
    return hex(propOf<string>(md, 'ambient') ?? '#5a6494');
  }

  private curAmbient() {
    const c = this.lights.ambientColor;
    return Phaser.Display.Color.GetColor(Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255));
  }

  /** 어두운 맵에 엘리시아가 있고, 아직 빛을 밝히지 않았는가 */
  needsLight() {
    return !!this.map && !!propOf(this.map, 'dark') && this.actors.has('elysia') && !gameState.progress.once.includes(LIGHT_KEY);
  }

  /** 엘리시아의 빛 마법: 보랏빛이 번진 뒤 맵 전체가 밝아지고, 이후로 어두운 맵도 계속 밝다 */
  castLight(done: () => void) {
    if (!gameState.progress.once.includes(LIGHT_KEY)) gameState.progress.once.push(LIGHT_KEY);
    const a = this.actors.get('elysia');
    if (a) {
      const fx = this.world(this.add.sprite(a.spr.x, a.spr.y, a.spr.texture.key, a.spr.frame.name).setOrigin(a.spr.originX, a.spr.originY));
      fx.setTintFill(0xc8b0ff).setDepth(a.spr.depth + 1).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: fx, alpha: 0, duration: 700, onComplete: () => fx.destroy() });
    }
    if (!this.lit || !this.map) return void this.time.delayedCall(500, done);
    const from = Phaser.Display.Color.ValueToColor(this.curAmbient());
    const to = Phaser.Display.Color.ValueToColor(this.ambientOf(this.map));
    this.tweens.addCounter({
      from: 0, to: 100, duration: 900,
      onUpdate: (tw) => {
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, 100, tw.getValue() ?? 0);
        this.lights.setAmbientColor(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      },
      onComplete: () => this.time.delayedCall(250, done),
    });
  }

  /** 밤빛 색과 불빛들 (전투 장면이 같은 조명을 쓴다) */
  lighting() {
    return {
      lit: this.lit,
      ambient: this.lit ? this.curAmbient() : this.ambientOf(this.map ?? {}),
      lights: this.lights2.map((l) => ({ x: l.light.x, y: l.light.y, r: l.r, color: l.color, intensity: l.base < 0 ? l.light.intensity : l.base })),
    };
  }

  actorInfo(id: string) {
    const a = this.actors.get(id);
    return a ? { x: a.spr.x, y: a.spr.y, facing: a.facing, key: a.key, down: a.down } : null;
  }

  /** 그림이 key인 인물들의 ID */
  actorsOf(key: string) {
    return [...this.actors.values()].filter((a) => a.key === key && a.spr.visible).map((a) => a.id);
  }

  /** 전투 동안 맵의 인물을 숨긴다 (전투 장면이 같은 자리에 싸우는 인물을 띄움) */
  hideActor(id: string, hidden: boolean) {
    const a = this.actors.get(id);
    if (!a) return;
    this.tweens.killTweensOf(a.spr);
    a.walking = false;
    a.spr.setVisible(!hidden);
    a.shadow.setVisible(!hidden);
  }

  /** 전투가 끝난 자리로 인물을 옮긴다 */
  putActor(id: string, x: number, y: number, facing: string, down = false) {
    const a = this.actors.get(id);
    if (!a) return;
    a.spr.setPosition(x, y).setVisible(true);
    a.facing = facing as Dir;
    a.down = down;
    this.pose(a);
  }

  /** 발밑(x, y)이 벽이나 물건에 막혔는지 (인물은 빼고) */
  solidAt(x: number, y: number, w = 12, h = 6) {
    if (!this.map) return false;
    const a = { x0: x - w / 2, y0: y - h, x1: x + w / 2, y1: y };
    if (a.x0 < 0 || a.x1 > this.mapW || a.y0 < 0 || a.y1 > this.mapH) return true;
    const cols = this.map.width;
    for (let ty = Math.floor(a.y0 / TS); ty <= Math.floor((a.y1 - 0.01) / TS); ty++)
      for (let tx = Math.floor(a.x0 / TS); tx <= Math.floor((a.x1 - 0.01) / TS); tx++) if (this.grid[ty * cols + tx]) return true;
    return this.boxes.some((b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0);
  }

  /**
   * 이 맵 위에서 싸울 수 있으면 전투장 가운데 (맵 좌표), 아니면 null.
   * 전투의 arena.map이 지금 맵과 같아야 한다. 체력 0 연출은 who 둘레
   */
  battleCenter(battle: string, who?: string) {
    if (!this.map) return null;
    if (who) {
      const a = this.actors.get(who);
      return a ? { x: a.spr.x, y: a.spr.y - 30 - rise(a.key) / 2 } : null;
    }
    const def = (battlesData as unknown as Record<string, { arena: { map?: string; zone?: string } }>)[battle];
    if (!def?.arena.map || def.arena.map !== this.mapId) return null;
    const ar = findObj(this.map, 'arena', def.arena.zone);
    return ar ? { x: ar.x + ar.width / 2, y: ar.y + ar.height / 2 } : null;
  }

  /** 몹 자리(x, y)를 가운데로 하는 w x h 전투장의 왼쪽 위 (맵 밖으로 나가지 않게) */
  fieldArena(w: number, h: number, x: number, y: number) {
    return {
      x: Math.round(Phaser.Math.Clamp(x - w / 2, 0, Math.max(0, this.mapW - w))),
      y: Math.round(Phaser.Math.Clamp(y - h / 2, 0, Math.max(0, this.mapH - h))),
    };
  }

  /** 카메라를 (x, y)로 옮기고 ms 뒤 done */
  lookAt(x: number, y: number, ms: number, done: () => void) {
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.pan(x, y, ms, 'Sine.easeInOut');
    this.time.delayedCall(ms + 30, done);
  }

  // ---------------------------------------------------------------
  // 이동 구간
  // ---------------------------------------------------------------

  play(segId: string, onEnd: () => void) {
    const seg = STAGE.segments[segId];
    if (!seg) {
      console.error(`[map] 없는 이동 구간: ${segId}`);
      return onEnd();
    }
    this.setMap(seg.map);
    if (!this.actors.has('leon')) this.placeActor('leon', { at: 'leon_start', facing: 'right' }, true);
    const leon = this.actors.get('leon')!;
    this.tweens.killTweensOf(leon.spr);
    leon.walking = false;
    leon.down = false;
    this.pose(leon);
    this.seg = seg;
    this.onEnd = onEnd;
    this.reading = false;
    this.moved = 0;
    this.tutStep = 0;
    this.cameras.main.startFollow(leon.spr, true, 0.15, 0.15, 0, 20);
    // 동료가 뒤를 따른다
    this.trail = [];
    if (seg.follow !== false)
      for (const id of walkers()) {
        if (id === 'leon') continue;
        if (!this.actors.has(id)) this.placeActor(id, { at: [leon.spr.x - 18, leon.spr.y + 4], facing: leon.facing }, true);
      }

    this.lookables = [];
    for (const o of this.map ? objectsOf(this.map) : []) {
      if (o.type === 'npc') this.lookables.push({ id: String(propOf(o, 'talk') ?? o.name), x: o.x, y: o.y, talk: true });
      if (o.type === 'goal' && o.name === seg.goal && propOf(o, 'press')) this.lookables.push({ id: o.name, x: o.x, y: o.y, goal: true });
    }
    for (const id of seg.looks) {
      const o = this.map && findObj(this.map, 'look', id);
      if (!o) {
        console.warn(`[map] ${seg.map}에 조사할 곳이 없습니다: ${id}`);
        continue;
      }
      if (this.seen(id) && !seg.until) continue;
      this.lookables.push({ id, x: o.x, y: o.y });
    }
    // 필수 조사: 조사할 차례인 물건이 은은하게 빛나고 머리 위에 작은 표시
    this.untilFx.forEach((o) => o.destroy());
    this.untilFx = [];
    const uo = seg.until && this.map ? findObj(this.map, 'look', seg.until) : undefined;
    if (uo) {
      const glow = this.world(this.add.ellipse(uo.x, uo.y - 6, 40, 22, 0xfff0b0, 0.35).setDepth(uo.y - 1).setBlendMode(Phaser.BlendModes.ADD));
      this.tweens.add({ targets: glow, alpha: 0.12, scaleX: 1.2, scaleY: 1.2, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      const top = uo.y - Number(propOf(uo, 'iconY') ?? 40);
      const pin = this.world(this.add.sprite(uo.x, top, 'ex_look', 0).setDepth(9400).setScale(0.75).setTint(0xffe9a8).play('ex_look'));
      this.tweens.add({ targets: pin, y: top - 4, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.untilLight = this.addLight(uo.x, uo.y - 10, 60, 0xfff0b0, 0.9, true)?.light;
      this.untilFx.push(glow, pin);
    }
    this.mark?.destroy();
    this.mark = this.world(this.add.sprite(leon.spr.x, leon.spr.y - 44 - rise(leon.key), 'ex_look', 0).setDepth(9500).setAlpha(0).play('ex_look'));
    this.hud.setVisible(true);
    this.touchUi.forEach((t) => t.setVisible(true));
    this.refreshHud();
    if (seg.tutorial) this.guide('WASD 또는 방향키로 움직입니다');
    else if (seg.hint) this.guide(seg.hint, 5000);
  }

  /** 필수 조사 표시 (빛, 머리 위 표시) */
  private untilFx: Phaser.GameObjects.GameObject[] = [];
  private untilLight?: Phaser.GameObjects.Light;

  /** 이동을 잠깐 멈춤 (파티 선택 화면이 떠 있는 동안) */
  hold(on: boolean) {
    this.reading = on;
  }

  private stopPlay() {
    this.untilFx.forEach((o) => o.destroy());
    this.untilFx = [];
    this.untilLight?.setVisible(false);
    this.untilLight = undefined;
    this.seg = null;
    this.near = null;
    this.lookables = [];
    this.mark?.destroy();
    this.mark = undefined;
    this.hud?.setVisible(false);
    this.prompt?.setVisible(false);
    this.touchUi.forEach((t) => t.setVisible(false));
    if (this.guideBox) {
      this.tweens.killTweensOf(this.guideBox);
      this.guideBox.setAlpha(0);
    }
  }

  update(_t: number, rawDelta: number) {
    const dt = Math.min(50, rawDelta);
    const leon = this.actors.get('leon');
    if (this.seg && leon) {
      if (this.touchLook) {
        this.touchLook = false;
        this.look();
      }
      if (!this.reading) this.move(leon, dt);
      else if (leon.spr.anims.isPlaying) this.pose(leon);
      if (this.seg) this.follow(leon);
      if (this.seg) this.findNear(leon);
      if (this.seg) this.checkGoal(leon);
      if (this.seg && !this.reading) this.checkMobs(leon);
    }
    this.updateCarry();
    this.updateWound();
    this.updateDrift(dt);
    this.updateFog();
    if (this.seg && leon && this.marks.length) this.updateMarks(leon);
    for (const sp of this.spots) {
      const a = this.actors.get(sp.id);
      if (a) sp.light.setPosition(a.spr.x, a.spr.y - 20);
    }
    for (const [id, s] of this.auras) {
      const a = this.actors.get(id);
      if (a) s.setPosition(a.spr.x, a.spr.y + 2).setTexture(a.spr.texture.key, a.spr.frame.name).setOrigin(a.spr.originX, a.spr.originY).setDepth(a.spr.depth - 0.5).setVisible(a.spr.visible);
      if (this.blinking.has(id)) s.setAlpha(Math.random() < 0.18 ? 0.05 : 0.2 + Math.random() * 0.3);
    }
    for (const a of this.actors.values()) {
      a.spr.setDepth(a.spr.y + (a.lift && !a.jumping ? 2 : 0));
      a.shadow.setPosition(Math.round(a.spr.x), Math.round(a.spr.y)).setVisible(!a.down && (!a.lift || !!a.jumping) && a.spr.visible);
      if (a.lift !== undefined && (a.walking || a.jumping || a.id === 'leon') && !a.down) a.spr.setOrigin(0.5, footOrigin(a.spr.texture.key) + a.lift / a.spr.height);
      this.wadeLook(a);
      if (a.drag && a.walking) this.dragMark(a);
    }
    this.updateSky();
  }

  /** 끌린 망토 자국: 걸은 자리에 옅은 줄을 남기고 천천히 사라진다 */
  private dragMark(a: Actor) {
    const p = { x: a.spr.x, y: a.spr.y };
    if (a.lastDrag && Math.hypot(p.x - a.lastDrag.x, p.y - a.lastDrag.y) < 4) return;
    a.lastDrag = p;
    const m = this.lightUp(this.world(this.add.rectangle(p.x, p.y - 1, 6, 2, hex(a.drag!), 0.9).setDepth(-12)));
    this.tweens.add({ targets: m, alpha: 0, delay: 2500, duration: 2500, onComplete: () => m.destroy() });
  }

  /** 낮이 밝을수록 아지랑이가, 밤이 어두울수록 별이 보인다 */
  private updateSky() {
    if (!this.haze && !this.stars.length) return;
    const c = this.lit ? this.lights.ambientColor : { r: 1, g: 1, b: 1 };
    const lum = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
    if (this.haze) this.haze.setAlpha(Phaser.Math.Clamp((lum - 0.7) / 0.2, 0, 1));
    const night = Phaser.Math.Clamp((0.55 - lum) / 0.3, 0, 1);
    for (const st of this.stars) st.setAlpha(night * (st.getData('a') as number));
  }

  /** 흘러가는 강: 기슭 장식과 물결이 왼쪽으로 흐르고, 화면 밖으로 나가면 오른쪽 끝으로 돌아온다 */
  private updateDrift(dt: number) {
    if (!this.drift.length) return;
    const w = this.mapW + 64;
    for (const d of this.drift) {
      d.o.x -= (d.v * dt) / 1000;
      if (d.o.x < -32) d.o.x += w;
    }
  }

  /** 화면 위 황도 불빛: 작은 주황 점 무리. 크기·밝기를 k(0~1)로 */
  private setCity(k: number, instant: boolean) {
    const c = this.city;
    if (!c) return;
    const to = { scale: 0.25 + 0.75 * k, alpha: k <= 0 ? 0 : 0.35 + 0.65 * k };
    const lightTo = c.base * k;
    if (instant) {
      c.box.setScale(to.scale).setAlpha(to.alpha);
      if (c.light) c.light.intensity = lightTo;
      return;
    }
    this.tweens.add({ targets: c.box, ...to, duration: 4000, ease: 'Sine.inOut' });
    if (c.light) this.tweens.add({ targets: c.light, intensity: lightTo, duration: 4000 });
  }

  /** 화면 위 끝의 사막 띠 (새벽) */
  private setDawnBand(on: boolean, instant: boolean) {
    const b = this.dawnBand;
    if (!b) return;
    this.tweens.killTweensOf(b);
    if (instant) b.setAlpha(on ? 1 : 0);
    else this.tweens.add({ targets: b, alpha: on ? 1 : 0, duration: 2600, ease: 'Sine.inOut' });
  }

  /** 흘러가는 강(맵 속성 drift): 기슭의 갈대·돌, 물결, 화면 위의 황도 불빛과 사막 띠를 만든다 */
  private makeDrift(md: NonNullable<typeof this.map>) {
    const W2 = md.width * TS;
    const H2 = md.height * TS;
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    // 기슭: 위(강 너머)와 아래(가까운 쪽). 가까운 쪽이 더 빨리 흐른다
    const banks = [{ y0: 2 * TS + 4, y1: 3 * TS + 10, v: 9 }, { y0: 9 * TS + 22, y1: 11 * TS + 20, v: 16 }];
    for (const b of banks) {
      for (let x = 0; x < W2 + 64; x += 30 + rnd() * 40) {
        const y = b.y0 + rnd() * (b.y1 - b.y0);
        const key = rnd() < 0.7 ? 'ex_reeds' : null;
        const o = key && this.textures.exists(key)
          ? this.add.image(x, y, key).setOrigin(0.5, 1)
          : this.add.rectangle(x, y, 5 + Math.floor(rnd() * 4), 3, 0x6b6a72).setOrigin(0.5, 1);
        this.lightUp(this.world(o.setDepth(y - 30)));
        this.drift.push({ o, v: b.v });
      }
    }
    // 물결: 강물 위의 옅은 줄
    for (let i = 0; i < 22; i++) {
      const y = 4 * TS + 4 + rnd() * (5 * TS - 8);
      const o = this.lightUp(this.world(this.add.rectangle(rnd() * W2, y, 4 + Math.floor(rnd() * 6), 1, 0xb8c8e8, 0.55).setDepth(-18)));
      this.drift.push({ o, v: 12 + rnd() * 10 });
    }
    // 황도 불빛 (화면 위 오른쪽, 뒤에 두고 온 도시)
    const cx = W2 - 70;
    const cy = 2 * TS + 8;
    const dots: Phaser.GameObjects.GameObject[] = [];
    for (let i = 0; i < 16; i++) {
      const big = rnd() < 0.3;
      const d = this.add.rectangle((rnd() - 0.5) * 70, -rnd() * 14 + Math.abs((rnd() - 0.5) * 10), big ? 2 : 1, big ? 2 : 1, rnd() < 0.5 ? 0xffc870 : 0xffe0a0);
      this.tweens.add({ targets: d, alpha: 0.4, duration: 300 + rnd() * 900, yoyo: true, repeat: -1, delay: rnd() * 800 });
      dots.push(d);
    }
    dots.unshift(this.add.ellipse(0, -6, 90, 16, 0xffb060, 0.16));
    const box = this.world(this.add.container(cx, cy, dots).setDepth(-16).setBlendMode(Phaser.BlendModes.ADD));
    const light = this.lit ? this.lights.addLight(cx, cy, 110, 0xffb060, 0.9) : undefined;
    this.city = { box, light, base: 0.9 };
    // 사막 띠 (새벽에 화면 위 끝, 서쪽부터 노랗게)
    const band: Phaser.GameObjects.GameObject[] = [];
    for (let i = 0; i < 4; i++) band.push(this.add.rectangle(0, 2 * TS - 18 + i * 5, W2, 5, 0xe8c070, 0.55 - i * 0.12).setOrigin(0, 0));
    this.dawnBand = this.world(this.add.container(0, 0, band).setDepth(-17).setAlpha(0));
    void H2;
  }

  /** 맵 속성에 따라 하늘 효과를 만든다 */
  private makeSky(md: NonNullable<typeof this.map>) {
    if (propOf(md, 'drift')) this.makeDrift(md);
    if (propOf(md, 'fog')) this.makeFog(md);
    if (propOf(md, 'desert')) {
      const cam = this.cameras.main;
      const vw = cam.width / cam.zoom + 40;
      const vh = cam.height / cam.zoom + 40;
      const ox = -20 + (cam.width - cam.width / cam.zoom) / 2;
      const oy = -20 + (cam.height - cam.height / cam.zoom) / 2;
      const parts: Phaser.GameObjects.GameObject[] = [this.add.rectangle(0, 0, vw, vh, 0xffc868, 0.13).setOrigin(0).setBlendMode(Phaser.BlendModes.ADD)];
      // 아지랑이: 옅은 빛 띠가 천천히 위로 오르며 흔들린다
      for (let i = 0; i < 7; i++) {
        const band = this.add.rectangle(0, vh * (i / 7), vw, 4 + (i % 3) * 2, 0xfff0c8, 0.07).setOrigin(0).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: band, y: band.y - vh / 7, duration: 3200 + i * 260, repeat: -1, ease: 'Linear' });
        this.tweens.add({ targets: band, alpha: 0.16, x: 3, duration: 900 + i * 130, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        parts.push(band);
      }
      this.haze = this.world(this.add.container(ox, oy, parts).setScrollFactor(0).setDepth(9500).setAlpha(0));
    }
    if (propOf(md, 'stars')) {
      // 별: 바닥 타일이 없는 하늘 칸에만
      const fl = layerOf(md, 'floor') as unknown as { data: number[] } | undefined;
      for (let ty = 0; ty < md.height; ty++)
        for (let tx = 0; tx < md.width; tx++) {
          if (fl?.data[ty * md.width + tx]) continue;
          for (let k = 0; k < 2; k++) {
            if (Math.random() < 0.35) continue;
            const big = Math.random() < 0.15;
            const st = this.world(this.add.rectangle(tx * TS + Math.random() * TS, ty * TS + Math.random() * TS, big ? 2 : 1, big ? 2 : 1, big ? 0xeef0f4 : 0xbcc1cc).setDepth(-21).setAlpha(0));
            st.setData('a', 0.5 + Math.random() * 0.5);
            this.tweens.add({ targets: st, scale: 0.4, duration: 700 + Math.random() * 1400, yoyo: true, repeat: -1, delay: Math.random() * 1500 });
            this.stars.push(st);
          }
        }
    }
  }

  /** 동료: 레온이 지나간 자리를 조금 늦게 따라 걷는다 */
  private follow(leon: Actor) {
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - leon.spr.x, last.y - leon.spr.y) > 2) this.trail.push({ x: leon.spr.x, y: leon.spr.y });
    if (this.trail.length > 60) this.trail.shift();
    let k = 0;
    for (const id of walkers()) {
      if (id === 'leon') continue;
      const a = this.actors.get(id);
      if (!a || a.walking) continue;
      k++;
      const p = this.trail[Math.max(0, this.trail.length - 1 - 12 * k)];
      if (!p) continue;
      const dx = p.x - a.spr.x;
      const dy = p.y - a.spr.y;
      const d = Math.hypot(dx, dy);
      if (d < 1 || Math.hypot(leon.spr.x - a.spr.x, leon.spr.y - a.spr.y) < 20) {
        if (a.spr.anims.isPlaying) this.pose(a);
        continue;
      }
      a.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      a.spr.play(`${a.key}-walk-${a.facing}`, true);
      const step = Math.min(d, Math.max(SPEED * (this.seg?.speed ?? 1), d * 0.15) * (16 / 1000) * 1.1);
      a.spr.setPosition(a.spr.x + (dx / d) * step, a.spr.y + (dy / d) * step);
    }
  }

  /** 몹 무리에 닿으면 짧은 전투. 이기면 그 무리는 사라지고 그 자리에서 이어서 움직인다 */
  private checkMobs(leon: Actor) {
    const hit = this.mobs.find((m) => Math.hypot(m.x - leon.spr.x, (m.y - leon.spr.y) * 1.3) < 26);
    if (!hit) return;
    this.mobs = this.mobs.filter((m) => m !== hit);
    this.reading = true;
    this.pose(leon);
    this.prompt.setVisible(false);
    // 맵 위 몹 그림은 숨기고, 그 자리에서 전투의 적이 나타난다
    for (const s of hit.sprs) s.setVisible(false);
    this.host.fieldBattle(hit.battle, () => {
      for (const s of hit.sprs) s.destroy();
      // 맵 위에서 싸우느라 카메라가 전투장에 가 있었으면 다시 레온을 따라간다
      this.cameras.main.startFollow(leon.spr, true, 0.15, 0.15, 0, 20);
      this.reading = false;
      this.lockUntil = this.time.now + 300;
      this.refreshHud();
    }, { x: hit.x, y: hit.y });
  }

  private move(a: Actor, dt: number) {
    const k = this.keys;
    let mx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0) + this.stick.dx;
    let my = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0) + this.stick.dy;
    const l = Math.hypot(mx, my);
    if (l < 0.2) {
      if (a.spr.anims.isPlaying) this.pose(a);
      return;
    }
    if (l > 1) {
      mx /= l;
      my /= l;
    }
    a.facing = Math.abs(mx) > Math.abs(my) ? (mx > 0 ? 'right' : 'left') : my > 0 ? 'down' : 'up';
    a.spr.play(`${a.key}-walk-${a.facing}`, true);
    const step = SPEED * (this.seg?.speed ?? 1) * (dt / 1000) * (this.wadeAt(a.spr.x, a.spr.y) && !a.jumping ? WADE_SPEED : 1);
    const { x: ox, y: oy } = a.spr;
    let x = ox;
    let y = oy;
    if (!this.blocked(x + mx * step, y)) x += mx * step;
    if (!this.blocked(x, y + my * step)) y += my * step;
    a.spr.setPosition(x, y);
    this.moved += Math.hypot(x - ox, y - oy);
    if (this.seg?.tutorial && this.tutStep === 0 && this.moved > 60) {
      this.tutStep = 1;
      this.guide('물건 가까이 가면 머리 위에 표시가 뜹니다. F를 누르면 살펴봅니다 (처음 한 번 경험치)');
    }
  }

  /** 발밑이 걸어 들어갈 수 있는 물인지 */
  wadeAt(x: number, y: number) {
    if (!this.map) return false;
    const tx = Math.floor(x / TS);
    const ty = Math.floor((y - 2) / TS);
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return false;
    return this.wade[ty * this.map.width + tx];
  }

  /** 점프: 그림만 포물선으로 떴다 내려온다 (움직임은 그대로) */
  private jump(a: Actor) {
    if (a.jumping || a.down || this.reading) return;
    a.jumping = true;
    this.tweens.addCounter({
      from: 0, to: 1, duration: JUMP_MS, ease: 'Linear',
      onUpdate: (tw) => void (a.lift = Math.sin(Math.PI * (tw.getValue() ?? 0)) * JUMP_H),
      onComplete: () => {
        a.lift = 0;
        a.jumping = false;
        if (this.wadeAt(a.spr.x, a.spr.y)) this.splash(a.spr.x, a.spr.y);
        else this.dust(a.spr.x, a.spr.y, 0x8a8070, 4);
      },
    });
  }

  /** 물에 내려앉을 때 물방울 */
  private splash(x: number, y: number) {
    for (let i = 0; i < 7; i++) {
      const d = this.world(this.add.rectangle(x + (Math.random() - 0.5) * 12, y - WADE_DEPTH, 2, 2, 0xb8cca8, 0.9).setDepth(y + 1));
      this.tweens.add({ targets: d, x: d.x + (Math.random() - 0.5) * 20, duration: 420 });
      this.tweens.add({ targets: d, y: d.y - 6 - Math.random() * 8, duration: 200, ease: 'Quad.out', yoyo: true, onComplete: () => d.destroy() });
    }
  }

  /** 물속이면 아랫몸을 잘라 잠긴 모습, 물 위에 물결 띠 */
  private wadeLook(a: Actor) {
    const s = a.spr;
    const inWater = s.visible && !a.lift && this.wadeAt(s.x, s.y);
    if (!inWater) {
      if (s.isCropped) s.setCrop();
      const sc = isHd(a.key) ? SHADOW_HD : SHADOW_OLD;
      a.shadow.setFillStyle(sc.color, sc.alpha).setSize(sc.w, sc.h).setDepth(-13);
      return;
    }
    const feet = s.originY * s.frame.height;
    s.setCrop(0, 0, s.frame.width, Math.max(0, Math.round(feet - WADE_DEPTH)));
    a.shadow
      .setPosition(Math.round(s.x), Math.round(s.y - WADE_DEPTH))
      .setFillStyle(0xa8c0a0, 0.35 + Math.sin(this.time.now / 260 + s.x) * 0.1)
      .setSize(18, 5)
      .setDepth(s.y + 0.2)
      .setVisible(true);
  }

  private blocked(x: number, y: number) {
    const a = { x0: x - FOOT.w / 2, y0: y - FOOT.h, x1: x + FOOT.w / 2, y1: y };
    if (a.x0 < 0 || a.x1 > this.mapW || a.y0 < 0 || a.y1 > this.mapH) return true;
    const cols = this.map!.width;
    for (let ty = Math.floor(a.y0 / TS); ty <= Math.floor((a.y1 - 0.01) / TS); ty++)
      for (let tx = Math.floor(a.x0 / TS); tx <= Math.floor((a.x1 - 0.01) / TS); tx++) if (this.grid[ty * cols + tx]) return true;
    const hit = (b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
    if (this.boxes.some(hit)) return true;
    const party = walkers();
    for (const o of this.actors.values()) {
      if (o.id === 'leon' || party.includes(o.id) || !o.spr.visible) continue;
      if (hit({ x0: o.spr.x - 8, y0: o.spr.y - 6, x1: o.spr.x + 8, y1: o.spr.y })) return true;
    }
    return false;
  }

  private findNear(a: Actor) {
    let best: Lookable | null = null;
    let bd = NEAR;
    if (!this.reading) {
      for (const l of this.lookables) {
        const d = Math.hypot(l.x - a.spr.x, (l.y - a.spr.y) * 1.3);
        if (d < bd) {
          bd = d;
          best = l;
        }
      }
    }
    const mark = this.mark;
    if (best !== this.near && mark) {
      this.tweens.killTweensOf(mark);
      this.tweens.add({ targets: mark, alpha: best ? 1 : 0, duration: 150 });
    }
    this.near = best;
    // 표시는 레온 머리 위 (예전 도트 키 40, 새 도트는 rise만큼 더 큼)
    mark?.setPosition(Math.round(a.spr.x), Math.round(a.spr.y - 48 - rise(a.key)));
    if (!best || !mark) return this.prompt.setVisible(false);
    const cam = this.cameras.main;
    const sx = (mark.x - cam.worldView.x) * ZOOM;
    const sy = (mark.y - 10 - cam.worldView.y) * ZOOM;
    const key = this.stickKnob ? '살펴보기' : 'F';
    const label = best.goal ? String(propOf(findObj(this.map!, 'goal', best.id) ?? {}, 'press') ?? '') : best.talk ? '말 걸기' : LOOKS[best.id]?.name ?? '살펴보기';
    this.prompt.setText(`${key}  ${label}`).setPosition(sx, sy).setVisible(true);
  }

  private checkGoal(a: Actor) {
    if (this.reading || !this.seg || !this.map) return;
    const g = findObj(this.map, 'goal', this.seg.goal);
    if (!g || propOf(g, 'press')) return;
    const r = Number(propOf(g, 'r') ?? 40);
    if (Math.hypot(a.spr.x - g.x, (a.spr.y - g.y) * 1.2) > r) return;
    const missing = this.seg.need?.find((id) => !this.seen(id));
    if (missing) {
      if (this.time.now > this.needWarn) this.guide(`먼저 ${LOOKS[missing]?.name ?? missing} (F)`, 2500);
      this.needWarn = this.time.now + 2600;
      return;
    }
    this.finish(a);
  }

  private finish(a: Actor) {
    this.pose(a);
    const cb = this.onEnd;
    this.stopPlay();
    this.time.delayedCall(150, () => cb?.());
  }

  // ---------------------------------------------------------------
  // 살펴보기
  // ---------------------------------------------------------------

  private seen = (id: string) => gameState.progress.once.includes(`look:${id}`);

  private look() {
    if (!this.seg || this.reading || !this.near || this.time.now < this.lockUntil) return;
    const l = this.near;
    const leon = this.actors.get('leon')!;
    if (l.goal) {
      const missing = this.seg.need?.find((id) => !this.seen(id));
      if (missing) return this.guide(`먼저 ${LOOKS[missing]?.name ?? missing} (F)`, 2500);
      return this.finish(leon);
    }
    const dx = l.x - leon.spr.x;
    const dy = l.y - leon.spr.y;
    leon.facing = Math.abs(dx) > Math.abs(dy) * 1.5 ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    this.pose(leon);
    this.reading = true;
    this.prompt.setVisible(false);
    if (this.mark) {
      this.tweens.killTweensOf(this.mark);
      this.mark.setAlpha(0);
    }
    if (l.talk) {
      // 행인: 레온 쪽을 돌아보고 한 줄
      const npcA = [...this.actors.values()].find((a) => Math.hypot(a.spr.x - l.x, a.spr.y - l.y) < 2);
      if (npcA) {
        npcA.facing = Math.abs(dx) > Math.abs(dy) * 1.5 ? (dx > 0 ? 'left' : 'right') : dy > 0 ? 'up' : 'down';
        this.pose(npcA);
      }
      this.host.playTalk(LOOKS[l.id]?.name ?? '행인', LOOKS[l.id]?.text ?? '', () => {
        this.reading = false;
        this.lockUntil = this.time.now + 250;
      });
      return;
    }
    this.host.playMonologue(lookPages(l.id), () => {
      this.reading = false;
      this.lockUntil = this.time.now + 250;
      this.lookDone(l);
    });
  }

  private lookDone(l: Lookable) {
    const amount = EXP_REWARD.look(l.id);
    const ups = gainOnce(`look:${l.id}`, partyIds(), amount).filter((u) => u.id === 'leon');
    if (LOOKS[l.id]?.pickup) {
      this.named.get(l.id)?.setVisible(false);
      const item = LOOKS[l.id].name.replace(/ 줍기$/, '');
      const c = item.charCodeAt(item.length - 1) - 0xac00;
      this.toast(`${item}${c >= 0 && c < 11172 && c % 28 ? '을' : '를'} 얻었습니다`);
    }
    // 필수 조사: 그 물건이면 구간 끝. 다른 물건은 다시 조사할 수 있게 남겨 둔다
    if (this.seg?.until && l.id === this.seg.until) return this.finish(this.actors.get('leon')!);
    if (!this.seg?.until) this.lookables = this.lookables.filter((x) => x !== l);
    this.near = null;
    if (amount) this.toast(`경험치 +${amount}${isCapped('leon') && !ups.length ? '   (최대 레벨: 프롤로그를 마치면 반영)' : ''}`);
    for (const u of ups) this.time.delayedCall(1000, () => this.toast(`레벨 업!  Lv ${u.from} → Lv ${u.to}`));
    this.refreshHud();
    if (this.seg?.tutorial && this.tutStep <= 1) {
      this.tutStep = 2;
      this.guide(`잘했습니다. ${this.seg.hint ?? ''}`, 6000);
    }
  }

  // ---------------------------------------------------------------
  // 화면 글자, 입력
  // ---------------------------------------------------------------

  private makeUi() {
    this.lvText = this.add.text(24, 56, '', { fontFamily: FONT, fontSize: '17px', color: '#e0c27a', fontStyle: 'bold' }).setShadow(0, 2, '#000', 2);
    const bar = this.add.image(84, 66, 'ui_bar_exp').setOrigin(0, 0.5).setScale(1, 2);
    this.expFill = this.add.image(85, 66, 'ui_fill_sky_3').setOrigin(0, 0.5).setScale(1, 2);
    this.countText = this.add.text(W - 24, 62, '', { fontFamily: FONT, fontSize: '17px', color: '#cccccc' }).setOrigin(1, 0).setShadow(0, 2, '#000', 2);
    this.hud = this.ui(this.add.container(0, 0, [this.lvText, bar, this.expFill, this.countText]).setVisible(false).setDepth(20));
    this.prompt = this.ui(
      this.add
        .text(0, 0, '', { fontFamily: FONT, fontSize: '17px', color: '#ffffff', backgroundColor: '#000000bb', padding: { x: 10, y: 5 } })
        .setOrigin(0.5, 1)
        .setVisible(false)
        .setDepth(21),
    );
    const gbg = this.add.rectangle(0, 0, 840, 52, 0x0c0a14, 0.85).setStrokeStyle(2, 0xcdb88a);
    this.guideText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '18px', color: '#f3e7c4', align: 'center', wordWrap: { width: 810, useAdvancedWrap: true } }).setOrigin(0.5);
    this.guideBox = this.ui(this.add.container(W / 2, H - 60, [gbg, this.guideText]).setAlpha(0).setDepth(25));
    this.toastText = this.ui(
      this.add
        .text(W / 2, 150, '', { fontFamily: FONT, fontSize: '21px', color: '#ffe9a8', backgroundColor: '#000000aa', padding: { x: 14, y: 8 } })
        .setOrigin(0.5)
        .setAlpha(0)
        .setDepth(26),
    );
  }

  private makeInput() {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,F,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('UP,DOWN,LEFT,RIGHT');
    this.keys.F.on('down', () => this.look());
    this.keys.SPACE.on('down', () => this.tryJump());

    const touch = this.sys.game.device.input.touch || new URLSearchParams(location.search).has('touch');
    if (!touch) return;
    const base = this.ui(this.add.image(130, H - 150, 'ui_stick_base').setScale(2).setAlpha(0.85));
    const knob = (this.stickKnob = this.ui(this.add.image(130, H - 150, 'ui_stick_knob').setScale(2)));
    const btn = this.ui(this.add.image(W - 110, H - 150, 'ui_btn', 0).setScale(2).setInteractive());
    const icon = this.ui(this.add.image(W - 110, H - 150, 'ui_icon_interact').setScale(2));
    const label = this.ui(this.add.text(W - 110, H - 100, '살펴보기', { fontFamily: FONT, fontSize: '16px', color: '#ffffff' }).setOrigin(0.5).setShadow(0, 2, '#000', 2));
    this.touchUi = [base, knob, btn, icon, label];
    this.touchUi.forEach((t) => t.setVisible(false));
    btn.on('pointerdown', () => {
      btn.setFrame(1);
      this.touchLook = true;
    });
    btn.on('pointerup', () => btn.setFrame(0));
    btn.on('pointerout', () => btn.setFrame(0));
    // 점프 버튼 (살펴보기 버튼 위)
    const jbtn = this.ui(this.add.image(W - 110, H - 280, 'ui_btn', 0).setScale(1.5).setInteractive());
    const jlabel = this.ui(this.add.text(W - 110, H - 280, '점프', { fontFamily: FONT, fontSize: '16px', color: '#ffffff' }).setOrigin(0.5).setShadow(0, 2, '#000', 2));
    this.touchUi.push(jbtn, jlabel);
    jbtn.setVisible(false);
    jlabel.setVisible(false);
    jbtn.on('pointerdown', () => {
      jbtn.setFrame(1);
      this.tryJump();
    });
    jbtn.on('pointerup', () => jbtn.setFrame(0));
    jbtn.on('pointerout', () => jbtn.setFrame(0));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.seg && p.x < W / 2 && this.stick.id < 0) this.stick = { id: p.id, x: base.x, y: base.y, dx: 0, dy: 0 };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stick.id) return;
      let dx = p.x - this.stick.x;
      let dy = p.y - this.stick.y;
      const l = Math.hypot(dx, dy);
      if (l > 50) {
        dx = (dx / l) * 50;
        dy = (dy / l) * 50;
      }
      this.stick.dx = dx / 50;
      this.stick.dy = dy / 50;
      knob.setPosition(this.stick.x + dx, this.stick.y + dy);
    });
    const up = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stick.id) return;
      this.stick = { id: -1, x: 0, y: 0, dx: 0, dy: 0 };
      knob.setPosition(base.x, base.y);
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
  }

  /** 직접 움직이는 구간에서만 점프 */
  private tryJump() {
    const leon = this.actors.get('leon');
    if (this.seg && leon && !this.reading) this.jump(leon);
  }

  private refreshHud() {
    this.lvText.setText(`Lv ${levelOf('leon')}`);
    this.expFill.setCrop(0, 0, Math.round(242 * levelProgress('leon')), 10);
    // 조사 수: 줍는 것(pickup)은 빼고 센다
    const list = this.seg?.looks.filter((id) => !LOOKS[id]?.pickup) ?? [];
    const all = list.length;
    const done = list.filter((id) => this.seen(id)).length;
    this.countText.setText(all ? `조사 ${done} / ${all}` : '');
  }

  private guide(text: string, ms = 0) {
    this.tweens.killTweensOf(this.guideBox);
    this.guideText.setText(text);
    this.guideBox.setAlpha(1);
    if (ms) this.tweens.add({ targets: this.guideBox, alpha: 0, delay: ms, duration: 600 });
  }

  private toast(text: string) {
    this.tweens.killTweensOf(this.toastText);
    this.toastText.setText(text).setAlpha(1);
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: 1800, duration: 500 });
  }
}
