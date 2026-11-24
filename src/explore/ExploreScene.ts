import Phaser from 'phaser';
import looksData from '../data/explore/looks.json';
import stageData from '../data/explore/stage.json';
import battlesData from '../data/battle/battles.json';
import { makeBattleAnims, preloadBattle } from '../battle/assets';
import { EXP_REWARD, gainOnce, isCapped, levelOf, levelProgress } from '../battle/progress';
import { gameState } from '../game/GameState';
import {
  FLAMES, MAPS, PROPS, TS, findObj, footOf, layerOf, makeMapAnims, makePropSprite, makeTilemap, objectsOf, preloadMapArt, propOf, solidGrid,
  type TiledMap, type TiledObj,
} from './mapData';

/**
 * 맵 화면: 대화(Story)의 아래층에 깔리는 도트 맵.
 *   무대(stage)  인물을 세우고 카메라를 옮긴다. 대사는 그 위 Story 장면이 띄운다
 *   이동(play)   레온을 직접 움직인다. 이동 WASD/방향키 · 살펴보기 F · 휴대폰은 조이스틱과 살펴보기 버튼
 *                가까이 가면 레온 머리 위에 표시가 뜨고, F를 누르면 레온의 독백(Story가 보여 줌). 처음 한 번 경험치
 * 데이터: 맵 src/data/maps/*.json, 무대·이동 구간 src/data/explore/stage.json, 물건 독백 src/data/explore/looks.json
 * 밤 조명: Light2D. 맵 전체에 어두운 푸른빛(ambient), 횃불·촛불 주변만 따뜻하게 밝다
 */
export interface MapHost {
  /** 레온의 독백을 화면별로 보여 준다. 다 읽으면 done */
  playMonologue(pages: string[][], done: () => void): void;
}
export interface ExploreStart {
  host: MapHost;
}

type Dir = 'down' | 'left' | 'right' | 'up';
type Pt = string | number[];
export interface ActorSpec {
  at?: Pt;
  walk?: Pt;
  facing?: string;
  pose?: string;
  sprite?: string;
  /** 걷는 빠르기 (없으면 보통 걸음) */
  speed?: number;
}
export interface StageDef {
  map?: string;
  focus?: Pt;
  blood?: boolean;
  /** 대사창을 잠깐 내리고 이만큼(ms) 무대만 보여 준 뒤 다음 대사로 */
  wait?: number;
  /** 처음엔 숨긴 물건(hidden prop)을 보이게(true)/숨기게(false). 이미 주운 것은 계속 숨김 */
  props?: Record<string, boolean>;
  actors?: Record<string, ActorSpec | null>;
  /** 인물 그림이 위에서 떨어져 물에 빠지는 모습을 한 번 보여 준다 */
  fall?: { sprite: string; from: Pt; to: Pt; ms?: number };
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
const W = 960;
const H = 720;
const ZOOM = 2;
const SPEED = 92;
const WALK_SPEED = 78;
const NEAR = 52; // 이만큼 가까우면 표시가 뜨고 F로 살펴볼 수 있다
const FOOT = { w: 14, h: 8 };
const FONT = '"Noto Sans KR", "Malgun Gothic", sans-serif';
const hex = (s: string) => Phaser.Display.Color.HexStringToColor(s).color;

interface Actor {
  id: string;
  key: string;
  spr: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  facing: Dir;
  down: boolean;
  walking: boolean;
}
interface Lookable {
  id: string;
  x: number;
  y: number;
}
type Box = { x0: number; y0: number; x1: number; y1: number };
type Vis = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible;

export class ExploreScene extends Phaser.Scene {
  ready = false;
  mapId = '';
  private host!: MapHost;
  private map?: TiledMap;
  private mapW = 0;
  private mapH = 0;
  private grid: boolean[] = [];
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
    this.seg = null;
    this.lookables = [];
    this.touchUi = [];
    this.stickKnob = undefined;
    this.reading = false;
    this.stick = { id: -1, x: 0, y: 0, dx: 0, dy: 0 };
  }

  preload() {
    preloadBattle(this);
    preloadMapArt(this);
    if (!this.textures.exists('oswald')) this.load.spritesheet('oswald', 'assets/sprites/oswald.png', { frameWidth: 32, frameHeight: 40 });
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
    this.boxes = [];
    this.named.clear();

    const cam = this.cameras.main;
    cam.setBackgroundColor(propOf<string>(md, 'bg') ?? '#05040a');
    const vw = W / ZOOM;
    const vh = H / ZOOM;
    cam.setBounds(Math.min(0, (this.mapW - vw) / 2), Math.min(0, (this.mapH - vh) / 2), Math.max(this.mapW, vw), Math.max(this.mapH, vh));

    // 밤 조명
    if (this.lit) this.lights.enable().setAmbientColor(hex(propOf<string>(md, 'ambient') ?? '#5a6494'));

    const { tm, ts } = makeTilemap(this, id);
    this.tilemap = tm;
    this.lightUp(this.world(tm.createLayer('floor', ts, 0, 0)!.setDepth(-20)));
    if (layerOf(md, 'blood')) this.blood = this.lightUp(this.world(tm.createLayer('blood', ts, 0, 0)!.setDepth(-19).setVisible(false)));
    this.lightUp(this.world(tm.createLayer('walls', ts, 0, 0)!.setDepth(-15)));

    for (const o of objectsOf(md)) this.makeObject(o);
  }

  private clearWorld() {
    this.stopPlay();
    for (const id of [...this.actors.keys()]) this.removeActor(id);
    for (const o of this.worldObjs) o.destroy();
    this.worldObjs = [];
    if (this.lit) for (const l of this.lights2) this.lights.removeLight(l.light);
    this.lights2 = [];
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
      if (propOf(o, 'hidden')) {
        s.setVisible(false);
        this.named.set(o.name, s);
      }
      const fl = FLAMES[o.name];
      const top = f.y - PROPS[o.name].h;
      if (fl) {
        // 불꽃은 조명을 받지 않고 그대로 밝게, 주변을 비춘다
        this.addLight(f.x, top + fl.top, fl.radius, 0xffa048, fl.intensity);
        const glow = this.world(this.add.ellipse(f.x, top + fl.top + 1, 24, 20, 0xffb060, 0.22).setDepth(s.depth + 0.1).setBlendMode(Phaser.BlendModes.ADD));
        this.tweens.add({ targets: glow, alpha: 0.42, duration: 300 + Math.random() * 200, yoyo: true, repeat: -1 });
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
      this.addLight(o.x, o.y, Number(propOf(o, 'radius') ?? 120), color, Number(propOf(o, 'intensity') ?? 1), true);
      if (propOf(o, 'spill')) {
        // 문틈에서 새는 차가운 흰빛
        const spill = this.world(this.add.ellipse(o.x, o.y + 6, 70, 24, color, 0.3).setDepth(-14).setBlendMode(Phaser.BlendModes.ADD));
        const line = this.world(this.add.rectangle(o.x, o.y - 32, 2, 52, color, 0.75).setDepth(-4).setBlendMode(Phaser.BlendModes.ADD));
        this.tweens.add({ targets: [spill, line], alpha: 0.15, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
    } else if (o.type === 'snow') {
      this.makeSnow(o);
    }
  }

  private addLight(x: number, y: number, r: number, color: number, intensity: number, steady = false) {
    if (!this.lit) return;
    const light = this.lights.addLight(x, y, r, color, intensity);
    this.lights2.push({ light, base: steady ? -1 : intensity, r, color });
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
    if (reset) for (const id of [...this.actors.keys()]) this.removeActor(id);
    if (def.blood !== undefined) this.blood?.setVisible(def.blood);
    for (const [name, on] of Object.entries(def.props ?? {})) this.named.get(name)?.setVisible(on && !this.seen(name));
    for (const [id, spec] of Object.entries(def.actors ?? {})) {
      if (spec === null) this.removeActor(id);
      else this.placeActor(id, spec, instant);
    }
    this.focus(def.focus ?? (reset ? 'leon' : undefined), instant);
    if (def.fall && !instant) this.playFall(def.fall);
  }

  /** 떨어져서 물에 풍덩: 점프 꼭대기 그림으로 떨어지고, 물보라와 물결을 남기고 사라진다 */
  private playFall(f: NonNullable<StageDef['fall']>) {
    const from = this.point(f.from);
    const to = this.point(f.to);
    if (!from || !to) return;
    const frame = (4 + DIRS.indexOf('down')) * 5 + 2;
    const spr = this.lightUp(this.world(this.add.sprite(from.x, from.y, f.sprite, frame).setOrigin(0.5, 1).setDepth(to.y + 50)));
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
    if (!a) {
      const start = at ?? this.point(spec.walk);
      if (!start) return console.warn(`[map] 처음 나오는 인물은 자리(at)가 필요합니다: ${id}`);
      const key = spec.sprite ?? id;
      const shadow = this.world(this.add.ellipse(start.x, start.y, 16, 6, 0x0a0810, 0.4).setDepth(-13));
      const spr = this.lightUp(this.world(this.add.sprite(start.x, start.y, key, 0).setOrigin(0.5, 1)));
      a = { id, key, spr, shadow, facing: 'down', down: false, walking: false };
      this.actors.set(id, a);
    }
    a.spr.setVisible(true);
    if (at) {
      this.tweens.killTweensOf(a.spr);
      a.walking = false;
      a.spr.setPosition(at.x, at.y);
    }
    if (spec.facing) a.facing = spec.facing as Dir;
    if (spec.pose === 'down') a.down = true;
    else if (spec.pose === 'stand') a.down = false;
    const to = this.point(spec.walk);
    if (to) {
      const dx = to.x - a.spr.x;
      const dy = to.y - a.spr.y;
      const dist = Math.hypot(dx, dy);
      this.tweens.killTweensOf(a.spr);
      a.walking = false;
      if (instant || dist < 2) a.spr.setPosition(to.x, to.y);
      else {
        const act = a;
        act.walking = true;
        act.down = false;
        const dir: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        act.spr.setOrigin(0.5, 1).play(`${act.key}-walk-${dir}`, true);
        this.tweens.add({
          targets: act.spr, x: to.x, y: to.y, duration: (dist / (spec.speed ?? WALK_SPEED)) * 1000,
          onComplete: () => {
            act.walking = false;
            this.pose(act);
          },
        });
      }
    }
    this.pose(a);
  }

  private pose(a: Actor) {
    if (a.walking) return;
    a.spr.anims.stop();
    const row = DIRS.indexOf(a.facing);
    if (a.down && this.textures.exists(`bt_${a.key}`)) a.spr.setTexture(`bt_${a.key}`, row * 12 + 11).setOrigin(0.5, 0.86);
    else a.spr.setTexture(a.key, row * 5).setOrigin(0.5, 1);
  }

  private removeActor(id: string) {
    const a = this.actors.get(id);
    if (!a) return;
    this.tweens.killTweensOf(a.spr);
    if ((this.cameras.main as unknown as { _follow: unknown })._follow === a.spr) this.cameras.main.stopFollow();
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

  /** 밤빛 색과 불빛들 (전투 장면이 같은 조명을 쓴다) */
  lighting() {
    return {
      lit: this.lit,
      ambient: hex(propOf<string>(this.map ?? {}, 'ambient') ?? '#5a6494'),
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
  putActor(id: string, x: number, y: number, facing: string) {
    const a = this.actors.get(id);
    if (!a) return;
    a.spr.setPosition(x, y).setVisible(true);
    a.facing = facing as Dir;
    a.down = false;
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
      return a ? { x: a.spr.x, y: a.spr.y - 30 } : null;
    }
    const def = (battlesData as unknown as Record<string, { arena: { map?: string } }>)[battle];
    if (!def?.arena.map || def.arena.map !== this.mapId) return null;
    const ar = findObj(this.map, 'arena');
    return ar ? { x: ar.x + ar.width / 2, y: ar.y + ar.height / 2 } : null;
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

    this.lookables = [];
    for (const id of seg.looks) {
      const o = this.map && findObj(this.map, 'look', id);
      if (!o) {
        console.warn(`[map] ${seg.map}에 조사할 곳이 없습니다: ${id}`);
        continue;
      }
      if (this.seen(id)) continue;
      this.lookables.push({ id, x: o.x, y: o.y });
    }
    this.mark?.destroy();
    this.mark = this.world(this.add.sprite(leon.spr.x, leon.spr.y - 44, 'ex_look', 0).setDepth(9500).setAlpha(0).play('ex_look'));
    this.hud.setVisible(true);
    this.touchUi.forEach((t) => t.setVisible(true));
    this.refreshHud();
    if (seg.tutorial) this.guide('WASD 또는 방향키로 움직입니다');
    else if (seg.hint) this.guide(seg.hint, 5000);
  }

  private stopPlay() {
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
      if (this.seg) this.findNear(leon);
      if (this.seg) this.checkGoal(leon);
    }
    for (const a of this.actors.values()) {
      a.spr.setDepth(a.spr.y);
      a.shadow.setPosition(Math.round(a.spr.x), Math.round(a.spr.y)).setVisible(!a.down && a.spr.visible);
    }
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
    a.spr.play(`leon-walk-${a.facing}`, true);
    const step = SPEED * (dt / 1000);
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

  private blocked(x: number, y: number) {
    const a = { x0: x - FOOT.w / 2, y0: y - FOOT.h, x1: x + FOOT.w / 2, y1: y };
    if (a.x0 < 0 || a.x1 > this.mapW || a.y0 < 0 || a.y1 > this.mapH) return true;
    const cols = this.map!.width;
    for (let ty = Math.floor(a.y0 / TS); ty <= Math.floor((a.y1 - 0.01) / TS); ty++)
      for (let tx = Math.floor(a.x0 / TS); tx <= Math.floor((a.x1 - 0.01) / TS); tx++) if (this.grid[ty * cols + tx]) return true;
    const hit = (b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
    if (this.boxes.some(hit)) return true;
    for (const o of this.actors.values()) {
      if (o.id === 'leon') continue;
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
    // 표시는 레온 머리 위 (서 있는 그림 높이 40)
    mark?.setPosition(Math.round(a.spr.x), Math.round(a.spr.y - 48));
    if (!best || !mark) return this.prompt.setVisible(false);
    const cam = this.cameras.main;
    const sx = (mark.x - cam.worldView.x) * ZOOM;
    const sy = (mark.y - 10 - cam.worldView.y) * ZOOM;
    const key = this.stickKnob ? '살펴보기' : 'F';
    this.prompt.setText(`${key}  ${LOOKS[best.id]?.name ?? '살펴보기'}`).setPosition(sx, sy).setVisible(true);
  }

  private checkGoal(a: Actor) {
    if (this.reading || !this.seg || !this.map) return;
    const g = findObj(this.map, 'goal', this.seg.goal);
    if (!g) return;
    const r = Number(propOf(g, 'r') ?? 40);
    if (Math.hypot(a.spr.x - g.x, (a.spr.y - g.y) * 1.2) > r) return;
    const missing = this.seg.need?.find((id) => !this.seen(id));
    if (missing) {
      if (this.time.now > this.needWarn) this.guide(`먼저 ${LOOKS[missing]?.name ?? missing} (F)`, 2500);
      this.needWarn = this.time.now + 2600;
      return;
    }
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
    this.host.playMonologue(lookPages(l.id), () => {
      this.reading = false;
      this.lockUntil = this.time.now + 250;
      this.lookDone(l);
    });
  }

  private lookDone(l: Lookable) {
    const amount = EXP_REWARD.look(l.id);
    const ups = gainOnce(`look:${l.id}`, ['leon'], amount);
    if (LOOKS[l.id]?.pickup) {
      this.named.get(l.id)?.setVisible(false);
      const item = LOOKS[l.id].name.replace(/ 줍기$/, '');
      const c = item.charCodeAt(item.length - 1) - 0xac00;
      this.toast(`${item}${c >= 0 && c < 11172 && c % 28 ? '을' : '를'} 얻었습니다`);
    }
    this.lookables = this.lookables.filter((x) => x !== l);
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
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,F') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('UP,DOWN,LEFT,RIGHT');
    this.keys.F.on('down', () => this.look());

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
