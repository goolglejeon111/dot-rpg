import Phaser from 'phaser';
import battles from '../data/battle/battles.json';
import enemies from '../data/battle/enemies.json';
import fighters from '../data/battle/fighters.json';
import levels from '../data/battle/levels.json';
import { gameState } from '../game/GameState';
import { fxInfo, makeBattleAnims, preloadBattle } from './assets';
import { gainExp, gainOnce, isUnlocked, levelOf, statsOf, unlockLevel, type LevelUp, type Unlock } from './progress';

// =====================================================================
// 종류
// =====================================================================
export type Dir = 'down' | 'left' | 'right' | 'up';
const DIRS: Dir[] = ['down', 'left', 'right', 'up'];
type Team = 'party' | 'ally' | 'enemy';

/** 결과별 다음 행동 (battles.json의 outcomes 값) */
export interface OutcomeAction {
  continue?: boolean;
  next?: string;
  ending?: string;
}

export interface BattleResult {
  /** win / fall:ID / timeout / wipe / damage / done(체력 0 연출 끝) */
  outcome: string;
  /** 정해 둔 다음 행동. 'gameover'면 게임 오버 화면에서 고른 것 */
  action: OutcomeAction | 'gameover-retry' | 'gameover-title';
}

export interface BattleStart {
  battle: string;
  /** 체력 0 연출 */
  hpZero?: { who: string; by: string; count: number };
  onEnd: (r: BattleResult) => void;
}

interface AttackHit {
  mult: number;
  range: number;
  arc: number;
  windup: number;
  active: number;
  recover: number;
  step: number;
  fx: string;
  cols: number[];
  heavy?: boolean;
  push?: number;
  projectile?: number;
  flipFx?: boolean;
  fxTint?: string;
}

interface MoveDef {
  name: string;
  text?: string;
  type?: string;
  cooldown?: number;
  maxHold?: number;
  drain?: number;
  blockCost?: number;
  parryWindow?: number;
  regen?: number;
  fx?: string;
}

interface FighterDef {
  name: string;
  speed: number;
  hp: number;
  atk: number;
  def: number;
  attack?: { chainWindow: number; hits: AttackHit[] };
  evade?: MoveDef;
  skill?: MoveDef;
  ult?: MoveDef;
  gauge?: { name: string; fill: string; perHit: number; perParry?: number };
  stamina?: number;
}

interface EnemyDef {
  name: string;
  sprite: string;
  hp: number;
  atk: number;
  def: number;
  speed: number;
  exp: number;
  boss?: boolean;
  ai: 'rusher' | 'caster';
  attack?: { range: number; windup: number; recover: number; cooldown: number; mult: number; fx: string };
  selfDestruct?: { below: number; signal: number; radius: number; mult: number; unblockable: boolean };
  keepAway?: number;
  bolt?: { cast: number; speed: number; mult: number; cooldown: number; unblockable: boolean };
  area?: { every: number; cast: number; radius: number; mult: number; breakDamage: number };
  blink?: { cooldown: number; distance: number };
}

interface BattleDef {
  title?: string;
  arena: { w: number; h: number; floor: string; tint: string };
  party?: string[];
  start?: Record<string, number[]>;
  allies?: { id: string; x: number; y: number }[];
  waves?: { enemy: string; x: number; y: number }[][];
  outcomes?: Record<string, OutcomeAction>;
  damage?: number;
  timeLimit?: number;
  exp?: number;
  guide?: string;
}

type State =
  | 'idle' | 'move' | 'attack' | 'guard' | 'hurt' | 'fainted' | 'dead'
  | 'prep' | 'cast' | 'kneel' | 'revive' | 'stagger';

/** 싸우는 인물 하나 */
export class Fighter {
  sprite!: Phaser.GameObjects.Sprite;
  shadow!: Phaser.GameObjects.Sprite;
  hpBar?: { frame: Phaser.GameObjects.Image; fill: Phaser.GameObjects.Image };
  glow?: Phaser.GameObjects.Sprite;
  signal?: Phaser.GameObjects.Sprite;
  extra: Phaser.GameObjects.GameObject[] = [];

  x = 0;
  y = 0;
  z = 0;
  vz = 0;
  hp = 1;
  maxHp = 1;
  atk = 1;
  defense = 0;
  speed = 60;
  facing: Dir = 'down';
  aimX = 0;
  aimY = 1;
  state: State = 'idle';
  stateT = 0;

  // 공격
  combo = -1;
  hitDone = false;
  chainUntil = 0;
  queued = false;
  attackCd = 0;
  // 막기
  guardStart = 0;
  guardCd = 0;
  stamina = 100;
  maxStamina = 100;
  // 게이지
  gauge = 0;
  // 기절
  faintUntil = 0;
  faintStreak = 0;
  lastGetUp = -1e9;
  invulnUntil = 0;
  // 적 AI
  aiCd = 0;
  castKind: 'bolt' | 'area' | '' = '';
  castTaken = 0;
  attacks = 0;
  blinkCd = 0;
  area?: { x: number; y: number; r: number; warn: Phaser.GameObjects.Sprite };
  stunUntil = 0;
  exploded = false;

  constructor(
    readonly id: string,
    readonly spriteKey: string,
    readonly team: Team,
    readonly def: FighterDef,
    readonly enemy?: EnemyDef,
  ) {}

  get alive() {
    return this.state !== 'dead';
  }
  /** 공격 대상이 될 수 있나 (기절·사망 제외) */
  get targetable() {
    return this.state !== 'dead' && this.state !== 'fainted' && !(this.enemy?.selfDestruct && this.state === 'prep');
  }
  get airborne() {
    return this.z > 5;
  }
}

const W = 960;
const H = 720;
const ZOOM = 2;
const FX_ORIGIN: Record<string, [number, number]> = {
  leon_slash1: [16, 24], leon_slash2: [16, 24], leon_slash3: [20, 32], galia_cleave: [18, 32], karg_slash: [14, 25],
  adrian_slash: [16, 24], serena_stab: [8, 12], leon_thrust: [6, 16], leon_guard: [4, 20], adrian_block: [2, 24],
  adrian_bash: [4, 24], adrian_charge: [4, 16], adrian_sever: [18, 32], light_bolt: [23, 8], karg_dash: [44, 12],
};
const BODY = 18; // 발밑에서 몸 가운데까지
const JUMP_V = 150;
const GRAVITY = 620;

const dirOf = (x: number, y: number): Dir => (Math.abs(x) > Math.abs(y) ? (x < 0 ? 'left' : 'right') : y < 0 ? 'up' : 'down');
const dirVec = (d: Dir) => ({ down: [0, 1], left: [-1, 0], right: [1, 0], up: [0, -1] })[d];

/** 휴대폰 버튼 등 HUD에서 들어오는 입력 */
export interface VirtualInput {
  mx: number;
  my: number;
  attack: boolean;
  evade: boolean;
  jump: boolean;
  skill: boolean;
  ult: boolean;
  combo: boolean;
  interact: boolean;
  swap: number;
}

/** 전투 화면 (월드). 위에 BattleHUD 장면이 함께 뜬다 */
export class BattleScene extends Phaser.Scene {
  start!: BattleStart;
  bdef!: BattleDef;
  all: Fighter[] = [];
  party: Fighter[] = [];
  controlled: Fighter | null = null;
  projectiles: { s: Phaser.GameObjects.Sprite; x: number; y: number; vx: number; vy: number; dmg: number; owner: Fighter; unblockable: boolean }[] = [];
  now = 0;
  elapsed = 0;
  waveIdx = 0;
  pendingSpawns = 0;
  damageDealt = 0;
  comboGauge = 0;
  swapCd = 0;
  ended = false;
  frozen = false;
  timeScale = 1;
  reviving: { target: Fighter; t: number } | null = null;
  reviveBar?: { frame: Phaser.GameObjects.Image; fill: Phaser.GameObjects.Image };
  bounds = { x0: 12, x1: 436, y0: 50, y1: 282 };
  vin: VirtualInput = { mx: 0, my: 0, attack: false, evade: false, jump: false, skill: false, ult: false, combo: false, interact: false, swap: 0 };
  /** HUD가 읽는 알림 (보여 준 뒤 비움) */
  notices: { kind: 'toast' | 'guide' | 'levelup' | 'unlock' | 'word'; text: string; what?: Unlock; ms?: number }[] = [];
  wheelOpen = false;
  /** 기절·게임 오버 규칙을 쓰는지 (체력 0 연출에서는 끔) */
  cutscene = false;

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private attackClick = false;
  private aimPoint: { x: number; y: number } | null = null;
  private prevVin: Partial<VirtualInput> = {};

  constructor() {
    super('Battle');
  }

  init(data: BattleStart) {
    this.start = data;
    this.all = [];
    this.party = [];
    this.controlled = null;
    this.projectiles = [];
    this.now = 0;
    this.elapsed = 0;
    this.waveIdx = 0;
    this.pendingSpawns = 0;
    this.damageDealt = 0;
    this.comboGauge = 0;
    this.swapCd = 0;
    this.ended = false;
    this.frozen = false;
    this.timeScale = 1;
    this.reviving = null;
    this.notices = [];
    this.wheelOpen = false;
    this.cutscene = !!data.hpZero;
    this.vin = { mx: 0, my: 0, attack: false, evade: false, jump: false, skill: false, ult: false, combo: false, interact: false, swap: 0 };
    this.prevVin = {};
    const all = battles as unknown as Record<string, BattleDef>;
    this.bdef = data.hpZero ? all.hpZero : all[data.battle];
    if (!this.bdef) console.error(`[battle] battles.json에 없는 전투: ${data.battle}`);
  }

  preload() {
    preloadBattle(this);
  }

  create() {
    makeBattleAnims(this);
    const { w, h, tint } = this.bdef.arena;
    this.bounds = { x0: 12, x1: w - 12, y0: 50, y1: h - 6 };
    const cam = this.cameras.main;
    cam.setZoom(ZOOM).centerOn(w / 2, h / 2 - 10).setBackgroundColor('#08070c');
    cam.fadeIn(350, 0, 0, 0);

    // 전투장: 돌바닥 + 위쪽 벽 (terrain 타일)
    const t = Phaser.Display.Color.HexStringToColor(tint).color;
    this.add.tileSprite(0, 0, w, h, 'terrain_tiles', 4).setOrigin(0).setTint(t).setDepth(-10);
    this.add.tileSprite(0, -32, w, 32, 'terrain_tiles', 7).setOrigin(0).setTint(t).setDepth(-9);
    this.add.tileSprite(0, 0, w, 40, 'terrain_tiles', 8).setOrigin(0).setTint(t).setDepth(-9);
    this.add.rectangle(0, h, w, 6, 0x000000, 0.6).setOrigin(0).setDepth(-9);

    if (this.start.hpZero) this.setupHpZero();
    else this.setupBattle();

    // 입력
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,SHIFT,SPACE,E,Q,R,F,ONE,TWO,THREE,FOUR,UP,DOWN,LEFT,RIGHT,F6,F7,F8,F9') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('SPACE,SHIFT,F6,F7,F8,F9');
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.ended || this.cutscene) return;
      if (p.leftButtonDown() || p.wasTouch) {
        this.attackClick = true;
        this.aimPoint = { x: p.worldX, y: p.worldY };
      }
    });

    this.scene.launch('BattleHUD', { battle: this });
    this.notices.push({ kind: 'guide', text: this.bdef.guide ?? '', ms: 6000 });
  }

  // ---------------------------------------------------------------
  // 준비
  // ---------------------------------------------------------------

  private setupBattle() {
    const b = this.bdef;
    for (const id of b.party ?? ['leon']) {
      const pos = b.start?.[id] ?? [b.arena.w / 2, b.arena.h / 2];
      const f = this.makePartyFighter(id, pos[0], pos[1]);
      if (f) this.party.push(f);
    }
    this.controlled = this.party[0] ?? null;
    for (const a of b.allies ?? []) {
      const d = (fighters.npc as Record<string, FighterDef>)[a.id];
      if (!d) continue;
      const f = new Fighter(a.id, a.id, 'ally', d);
      Object.assign(f, { hp: d.hp, maxHp: d.hp, atk: d.atk, defense: d.def, speed: d.speed });
      this.spawn(f, a.x, a.y);
    }
    this.spawnWave(0);
  }

  private makePartyFighter(id: string, x: number, y: number) {
    const d = (fighters.party as Record<string, FighterDef>)[id];
    if (!d) return null;
    const st = statsOf(id)!;
    const f = new Fighter(id, id, 'party', d);
    Object.assign(f, { hp: st.hp, maxHp: st.hp, atk: st.atk, defense: st.def, speed: d.speed, stamina: d.stamina ?? 100, maxStamina: d.stamina ?? 100 });
    f.facing = 'right';
    f.aimX = 1;
    f.aimY = 0;
    this.spawn(f, x, y);
    return f;
  }

  private spawnEnemy(key: string, x: number, y: number) {
    const e = (enemies as unknown as Record<string, EnemyDef>)[key];
    if (!e) return console.warn(`[battle] enemies.json에 없는 적: ${key}`);
    const d: FighterDef = {
      name: e.name,
      speed: e.speed,
      hp: e.hp,
      atk: e.atk,
      def: e.def,
      attack: e.attack
        ? { chainWindow: 0, hits: [{ mult: e.attack.mult, range: e.attack.range, arc: 110, windup: e.attack.windup, active: 60, recover: e.attack.recover, step: 4, fx: '', cols: [0, 1] }] }
        : undefined,
    };
    const f = new Fighter(key, e.sprite, 'enemy', d, e);
    Object.assign(f, { hp: e.hp, maxHp: e.hp, atk: e.atk, defense: e.def, speed: e.speed });
    f.aiCd = 600 + Math.random() * 600;
    this.spawn(f, x, y);
    // 나타날 때 빛
    this.fx('gnosis_vanish', x, y - BODY, { depth: y + 1, alpha: 0.8 });
    return f;
  }

  private spawn(f: Fighter, x: number, y: number) {
    f.x = x;
    f.y = y;
    f.shadow = this.add.sprite(x, y + 1, 'fx_jump_shadow', 0).setOrigin(0.5, 0.5);
    f.sprite = this.add.sprite(x, y, f.spriteKey, DIRS.indexOf(f.facing) * 5).setOrigin(0.5, 1);
    if (f.team === 'enemy' && !f.enemy?.boss) {
      f.hpBar = {
        frame: this.add.image(x, y, 'ui_bar_enemy').setOrigin(0.5, 0).setVisible(false),
        fill: this.add.image(x, y, 'ui_fill_red_2').setOrigin(0, 0).setVisible(false),
      };
    }
    this.all.push(f);
  }

  private spawnWave(i: number) {
    const wave = this.bdef.waves?.[i];
    if (!wave) return;
    this.waveIdx = i;
    this.pendingSpawns += wave.length;
    wave.forEach((s, k) =>
      this.time.delayedCall(400 + k * 220, () => {
        this.pendingSpawns--;
        if (!this.ended) this.spawnEnemy(s.enemy, s.x, s.y);
      }),
    );
  }

  /** 체력 0 연출: who 주위를 공격자들이 둘러싸고 차례로 찌른다 */
  private setupHpZero() {
    const { who, by, count } = this.start.hpZero!;
    const cx = this.bdef.arena.w / 2;
    const cy = this.bdef.arena.h / 2 + 30;
    const f = this.makePartyFighter(who, cx, cy);
    if (!f) return this.finish('done', { continue: true });
    this.party.push(f);
    this.controlled = f;
    f.facing = 'down';
    const attackers: Fighter[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.4;
      const e = this.spawnEnemy(by, cx + Math.cos(a) * 64, cy + Math.sin(a) * 40);
      if (!e) continue;
      e.facing = dirOf(cx - e.x, cy - e.y);
      e.state = 'idle';
      e.aiCd = 1e9; // 스스로 움직이지 않음
      attackers.push(e);
    }
    const per = Math.ceil(f.maxHp / Math.max(1, attackers.length));
    let k = 0;
    const strikeNext = () => {
      if (this.ended) return;
      const e = attackers[k % attackers.length];
      const last = k >= attackers.length - 1;
      k++;
      e.state = 'attack';
      e.combo = 0;
      e.hitDone = true;
      e.stateT = 0;
      this.tweens.add({ targets: e, x: e.x + (f.x - e.x) * 0.35, y: e.y + (f.y - e.y) * 0.35, duration: 140, yoyo: true, hold: 160 });
      this.time.delayedCall(150, () => {
        this.fx(last ? 'hit_heavy' : 'hit', f.x + (e.x - f.x) * 0.2, f.y - BODY, { depth: 9999 });
        this.damageNumber(f, last ? f.hp : per, true);
        f.hp = Math.max(0, f.hp - per);
        if (last) f.hp = 0;
        f.state = 'hurt';
        f.facing = dirOf(e.x - f.x, e.y - f.y);
        this.cameras.main.shake(120, 0.004);
      });
      this.time.delayedCall(420, () => {
        e.state = 'idle';
        if (!last) {
          f.state = f.hp < f.maxHp * 0.5 ? 'kneel' : 'idle';
          this.time.delayedCall(260, strikeNext);
        } else {
          f.state = 'kneel';
          this.time.delayedCall(700, () => {
            f.state = 'fainted';
            this.fx('dust_land', f.x, f.y - 6, { depth: f.y - 1 });
            this.cameras.main.flash(300, 120, 0, 0);
            this.time.delayedCall(1400, () => this.finish('done', { continue: true }));
          });
        }
      });
    };
    this.time.delayedCall(900, strikeNext);
  }

  // ---------------------------------------------------------------
  // 매 프레임
  // ---------------------------------------------------------------

  update(_t: number, rawDelta: number) {
    const dt = Math.min(50, rawDelta) * this.timeScale;
    if (this.frozen) return this.renderAll();
    this.now += dt;
    if (!this.cutscene && !this.ended) {
      this.elapsed += dt;
      this.readInput(dt);
      this.devKeys();
    }
    for (const f of this.all) this.updateFighter(f, dt);
    this.updateProjectiles(dt);
    this.separate();
    if (!this.cutscene && !this.ended) this.checkOutcome();
    this.renderAll();
  }

  // ---- 입력 ----

  private pressed(name: keyof VirtualInput, key?: Phaser.Input.Keyboard.Key) {
    const v = !!this.vin[name];
    const was = !!this.prevVin[name];
    return (key ? Phaser.Input.Keyboard.JustDown(key) : false) || (v && !was);
  }

  private readInput(dt: number) {
    const k = this.keys;
    const f = this.controlled;
    const press = {
      attack: this.attackClick || this.pressed('attack'),
      evadeHeld: k.SHIFT.isDown || this.vin.evade,
      evadeDown: this.pressed('evade', k.SHIFT),
      jump: this.pressed('jump', k.SPACE),
      skill: this.pressed('skill', k.E),
      ult: this.pressed('ult', k.Q),
      comboHeld: k.R.isDown || this.vin.combo,
      interactHeld: k.F.isDown || this.vin.interact,
    };
    const swapKey = [k.ONE, k.TWO, k.THREE, k.FOUR].findIndex((key) => Phaser.Input.Keyboard.JustDown(key));
    const swapTo = swapKey >= 0 ? swapKey : this.vin.swap > 0 ? this.vin.swap - 1 : -1;
    this.vin.swap = 0;
    this.attackClick = false;
    this.prevVin = { ...this.vin };

    this.swapCd = Math.max(0, this.swapCd - dt);
    if (swapTo >= 0) this.trySwap(swapTo);

    // 합동 기술 휠
    this.handleComboWheel(press.comboHeld);
    if (!f || f.state === 'fainted') return;

    // 이동 방향
    let mx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0) + this.vin.mx;
    let my = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0) + this.vin.my;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }

    // 깨우기 (F를 누르고 있기)
    const near = this.party.find((p) => p !== f && p.state === 'fainted' && Math.hypot(p.x - f.x, p.y - f.y) < 34);
    if (press.interactHeld && near && f.state !== 'attack') {
      if (!this.reviving || this.reviving.target !== near) this.reviving = { target: near, t: 0 };
      f.state = 'revive';
      this.reviving.t += dt;
      if (this.reviving.t >= levels.faint.reviveHold * 1000) {
        this.getUp(near);
        this.notices.push({ kind: 'toast', text: `${near.def.name}을(를) 깨웠습니다` });
        this.reviving = null;
        f.state = 'idle';
      }
      return;
    }
    if (this.reviving) {
      this.reviving = null;
      if (f.state === 'revive') f.state = 'idle';
    }
    if (press.interactHeld && !near && Phaser.Input.Keyboard.JustDown(k.F)) {
      this.notices.push({ kind: 'toast', text: '주변에 상호작용할 것이 없습니다' });
    }

    // 막기 (회피)
    if (press.evadeDown) this.tryEvade(f);
    if (f.state === 'guard') {
      const ev = f.def.evade!;
      const held = this.now - f.guardStart;
      f.stamina -= (ev.drain ?? 40) * (dt / 1000);
      if (!press.evadeHeld || held > (ev.maxHold ?? 2000) || f.stamina <= 0) this.endGuard(f);
      if (len > 0) f.facing = dirOf(mx, my), (f.aimX = mx), (f.aimY = my);
      return;
    }

    if (press.jump) this.tryJump(f);
    if (press.skill) this.tryMove(f, 'skill');
    if (press.ult) this.tryMove(f, 'ult');

    if (press.attack) {
      if (this.aimPoint) {
        // PC: 클릭한 쪽을 바라본다
        const ax = this.aimPoint.x - f.x;
        const ay = this.aimPoint.y - (f.y - BODY);
        const l = Math.hypot(ax, ay) || 1;
        f.aimX = ax / l;
        f.aimY = ay / l;
        f.facing = dirOf(ax, ay);
        this.aimPoint = null;
      }
      this.requestAttack(f);
    }

    if (f.state === 'idle' || f.state === 'move') {
      if (len > 0.1) {
        f.state = 'move';
        f.facing = dirOf(mx, my);
        f.aimX = mx / Math.max(len, 0.01);
        f.aimY = my / Math.max(len, 0.01);
        this.moveBy(f, mx * f.speed * (dt / 1000), my * f.speed * (dt / 1000));
      } else f.state = 'idle';
    } else if (f.airborne || f.vz !== 0) {
      // 점프 중에도 움직일 수 있음
    }
    if (f.z > 0 && len > 0.1 && f.state !== 'attack') this.moveBy(f, mx * f.speed * (dt / 1000), my * f.speed * (dt / 1000));
  }

  /** 개발용 단축키: F6 적 전멸, F7 브람 쓰러뜨리기, F8 시간 끝, F9 파티 전멸 */
  private devKeys() {
    if (!import.meta.env.DEV) return;
    const k = this.keys;
    if (Phaser.Input.Keyboard.JustDown(k.F6)) {
      for (const e of this.all.filter((x) => x.team === 'enemy' && x.alive)) this.kill(e, this.controlled);
      this.waveIdx = (this.bdef.waves?.length ?? 1) - 1;
    }
    if (Phaser.Input.Keyboard.JustDown(k.F7)) {
      const b = this.all.find((x) => x.id === 'bram');
      if (b) this.damage(b, null, 9999, { raw: true });
    }
    if (Phaser.Input.Keyboard.JustDown(k.F8)) this.elapsed = (this.bdef.timeLimit ?? 0) * 1000 + 1;
    if (Phaser.Input.Keyboard.JustDown(k.F9)) for (const p of this.party) this.damage(p, null, 99999, { raw: true });
  }

  private lockedToast(what: Unlock, label: string) {
    this.notices.push({ kind: 'toast', text: `🔒 ${label}은(는) ${unlockLevel(what)}레벨에 해금됩니다`, what });
  }

  private tryEvade(f: Fighter) {
    if (!isUnlocked(f.id, 'evade')) return this.lockedToast('evade', '회피');
    const ev = f.def.evade;
    if (!ev) return;
    if (ev.type !== 'guard') return this.notices.push({ kind: 'toast', text: `${ev.name}: 아직 준비 중인 동작입니다` });
    if (this.now < f.guardCd || f.stamina < 10) return;
    if (f.state !== 'idle' && f.state !== 'move' && !(f.state === 'attack' && this.now >= f.chainUntil - f.def.attack!.chainWindow)) return;
    if (f.airborne) return;
    f.state = 'guard';
    f.guardStart = this.now;
    f.combo = -1;
    const g = this.fx('leon_guard', f.x, f.y - BODY, { loop: true });
    g.setData('owner', f);
    f.extra.push(g);
  }

  private endGuard(f: Fighter) {
    if (f.state === 'guard') f.state = 'idle';
    f.guardCd = this.now + (f.def.evade?.cooldown ?? 1000);
    this.clearExtra(f);
  }

  private clearExtra(f: Fighter) {
    for (const o of f.extra) o.destroy();
    f.extra = [];
  }

  private tryJump(f: Fighter) {
    if (f.z > 0 || (f.state !== 'idle' && f.state !== 'move')) return;
    f.vz = JUMP_V;
    f.z = 0.01;
    f.sprite.play(`${f.spriteKey}-jump-${f.facing}`, true);
  }

  private tryMove(f: Fighter, which: 'skill' | 'ult') {
    const what: Unlock = which;
    const label = which === 'skill' ? '스킬' : '궁극기';
    if (!isUnlocked(f.id, what)) return this.lockedToast(what, label);
    const m = f.def[which];
    this.notices.push({ kind: 'toast', text: `${m?.name ?? label}: 아직 준비 중인 기술입니다` });
  }

  private handleComboWheel(held: boolean) {
    const f = this.controlled;
    if (!f) return;
    if (held && !this.wheelOpen) {
      if (!isUnlocked(f.id, 'combo')) {
        if (Phaser.Input.Keyboard.JustDown(this.keys.R) || (this.vin.combo && !this.prevVin.combo)) this.lockedToast('combo', '합동 기술');
        return;
      }
      this.wheelOpen = true;
      this.timeScale = 0.3; // 시간이 느려짐
    } else if (!held && this.wheelOpen) {
      this.wheelOpen = false;
      this.timeScale = 1;
      this.notices.push({
        kind: 'toast',
        text: this.comboGauge < 100 ? '연계 게이지가 아직 차지 않았습니다' : '합동 기술: 아직 준비 중입니다',
      });
    }
  }

  private trySwap(i: number) {
    const target = this.party[i];
    if (!target || target === this.controlled) return;
    if (target.state === 'fainted') return this.notices.push({ kind: 'toast', text: `${target.def.name}은(는) 기절해 있습니다` });
    if (this.swapCd > 0) return;
    this.controlled = target;
    this.swapCd = 800; // 교체 직후 짧은 대기 시간
    this.fx('dust_land', target.x, target.y - 6, { depth: target.y - 1 });
  }

  // ---- 공격 ----

  private requestAttack(f: Fighter) {
    const hits = f.def.attack?.hits;
    if (!hits || f.airborne) return;
    if (f.state === 'idle' || f.state === 'move') return this.startHit(f, 0);
    if (f.state === 'attack') f.queued = true;
  }

  private startHit(f: Fighter, i: number) {
    const hits = f.def.attack!.hits;
    f.state = 'attack';
    f.combo = i % hits.length;
    f.stateT = 0;
    f.hitDone = false;
    f.queued = false;
  }

  /** 공격 한 타의 진행 */
  private updateAttack(f: Fighter, dt: number) {
    const hits = f.def.attack!.hits;
    const h = hits[f.combo];
    f.stateT += dt;
    if (!f.hitDone && f.stateT >= h.windup) {
      f.hitDone = true;
      if (h.step) this.moveBy(f, f.aimX * h.step, f.aimY * h.step);
      this.swing(f, h);
    }
    const total = h.windup + h.active + h.recover;
    if (f.stateT >= total) {
      if (f.queued && f.combo < hits.length - 1) return this.startHit(f, f.combo + 1);
      f.state = 'idle';
      f.chainUntil = this.now + (f.def.attack!.chainWindow ?? 0);
      f.combo = -1;
    } else if (f.queued && f.stateT >= h.windup + h.active && f.combo < hits.length - 1) {
      this.startHit(f, f.combo + 1);
    }
  }

  /** 휘두름: 이펙트 + 부채꼴 안의 적에게 피해 */
  private swing(f: Fighter, h: AttackHit) {
    const ang = Math.atan2(f.aimY, f.aimX);
    if (h.fx && !h.projectile) {
      const s = this.fx(h.fx, f.x, f.y - BODY - f.z, { angle: ang, depth: f.y + (f.aimY < -0.5 ? -1 : 2), flipY: (Math.cos(ang) < -0.01) !== !!h.flipFx });
      if (h.fxTint === 'warm') s.setTint(0xffe6b0);
    }
    if (h.projectile) {
      // 마력탄 (엘리시아)
      this.shoot(f, f.x + f.aimX * 10, f.y - BODY + f.aimY * 6, f.aimX * h.projectile, f.aimY * h.projectile, h.fx, Math.round(f.atk * h.mult), false);
      return;
    }
    const foes = this.foesOf(f);
    let hit = false;
    for (const t of foes) {
      const dx = t.x - f.x;
      const dy = t.y - f.y;
      const d = Math.hypot(dx, dy);
      if (d > h.range + 8) continue;
      const da = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - ang));
      if (d > 10 && da > Phaser.Math.DegToRad(h.arc / 2)) continue;
      hit = this.damage(t, f, f.atk * h.mult, { heavy: h.heavy, push: h.push ?? (h.heavy ? 10 : 4) }) || hit;
    }
    if (hit && h.heavy) this.cameras.main.shake(90, 0.003);
  }

  private foesOf(f: Fighter) {
    return this.all.filter((t) => t.targetable && (f.team === 'enemy' ? t.team !== 'enemy' : t.team === 'enemy'));
  }

  /**
   * 피해 주기. 막기·튕겨 내기·무너뜨리기도 여기서.
   * @returns 맞았는지 (막히거나 빗나가면 false)
   */
  damage(
    t: Fighter,
    src: Fighter | null,
    amount: number,
    o: { heavy?: boolean; push?: number; unblockable?: boolean; area?: boolean; from?: { x: number; y: number }; raw?: boolean } = {},
  ): boolean {
    if (!t.targetable || this.ended) return false;
    if (this.now < t.invulnUntil && !o.raw) return false;
    if (t.airborne && !o.area && !o.raw) return false; // 점프 중에는 땅 위 공격이 닿지 않음 (넓은 범위 공격은 맞음)
    const from = o.from ?? (src ? { x: src.x, y: src.y } : { x: t.x, y: t.y - 1 });

    // 막기
    if (t.state === 'guard' && !o.raw) {
      const fx = from.x - t.x;
      const fy = from.y - t.y;
      const fl = Math.hypot(fx, fy) || 1;
      const front = (fx / fl) * t.aimX + (fy / fl) * t.aimY > 0.15;
      if (front) {
        const ev = t.def.evade!;
        if (o.unblockable) {
          // 막을 수 없는 공격: 막기가 무너짐
          this.word('break', t);
          this.fx('guard_break', t.x, t.y - BODY, { depth: t.y + 5 });
          this.endGuard(t);
          t.guardCd = this.now + 1500;
        } else if (this.now - t.guardStart <= (ev.parryWindow ?? 200)) {
          // 튕겨 내기 + 반격
          this.word('parry', t);
          this.fx('parry', t.x + (fx / fl) * 10, t.y - BODY + (fy / fl) * 6, { depth: t.y + 5 });
          this.addGauge(t, t.def.gauge?.perParry ?? 20);
          if (src && src.team === 'enemy' && src.state !== 'prep') {
            src.state = 'stagger';
            src.stateT = 0;
            src.stunUntil = this.now + 800;
          }
          this.endGuard(t);
          t.guardCd = this.now + 200;
          t.aimX = fx / fl;
          t.aimY = fy / fl;
          t.facing = dirOf(fx, fy);
          this.startHit(t, 2); // 반격 = 3타째 강한 베기
          return false;
        } else {
          this.fx('block', t.x + (fx / fl) * 10, t.y - BODY + (fy / fl) * 6, { depth: t.y + 5, flipX: fx > 0 });
          t.stamina -= ev.blockCost ?? 14;
          this.moveBy(t, (-fx / fl) * 3, (-fy / fl) * 3);
          if (t.stamina <= 0) {
            this.word('break', t);
            this.endGuard(t);
          }
          return false;
        }
      }
    }

    let dmg = o.raw ? amount : Math.max(1, Math.round(amount * (0.9 + Math.random() * 0.2) - t.defense * 0.5));
    // NPC 아군은 쓰러지지 않음 (갈래 전투에서 "그 인물이 쓰러지면"이 있으면 쓰러질 수 있음)
    if (t.team === 'ally' && !this.bdef.outcomes?.[`fall:${t.id}`]) dmg = Math.min(dmg, t.hp - 1);
    if (dmg <= 0 && t.team === 'ally') {
      this.fx('hit', t.x, t.y - BODY, { depth: t.y + 5 });
      return true;
    }
    t.hp -= dmg;
    this.damageNumber(t, dmg, t.team !== 'enemy');
    this.fx(o.heavy ? 'hit_heavy' : 'hit', t.x + (Math.random() - 0.5) * 6, t.y - BODY - t.z + (Math.random() - 0.5) * 6, { depth: t.y + 5 });
    if (src && src.team !== 'enemy') {
      this.addGauge(src, src.def.gauge?.perHit ?? 6);
      this.comboGauge = Math.min(100, this.comboGauge + 3);
    }
    if (t.team === 'enemy') this.damageDealt += dmg;
    if (t.state === 'cast' && t.castKind === 'area') t.castTaken += dmg;

    // 밀려남
    const push = o.push ?? 4;
    if (push && !t.enemy?.boss) {
      const px = t.x - from.x;
      const py = t.y - from.y;
      const pl = Math.hypot(px, py) || 1;
      this.moveBy(t, (px / pl) * push, (py / pl) * push);
    }

    if (t.hp <= 0) {
      t.hp = 0;
      if (t.team === 'enemy') this.kill(t, src);
      else if (t.team === 'party') this.faint(t);
      else this.allyFall(t);
    } else if (t.state !== 'prep' && t.state !== 'cast' && !t.enemy?.boss) {
      // 맞으면 하던 것이 끊김
      if (t.state === 'guard') this.endGuard(t);
      t.state = 'hurt';
      t.stateT = 0;
      t.combo = -1;
    }
    if (t === this.controlled) this.cameras.main.shake(80, 0.003);
    return true;
  }

  private addGauge(f: Fighter, n: number) {
    f.gauge = Math.min(100, f.gauge + n);
  }

  /** 적 쓰러뜨림 (그노시스 하수인은 자폭으로) */
  private kill(e: Fighter, by: Fighter | null) {
    if (!e.alive) return;
    if (e.enemy?.selfDestruct && !e.exploded && e.state !== 'prep') {
      e.hp = Math.max(1, e.hp);
      return this.startSelfDestruct(e);
    }
    this.removeEnemy(e, by);
  }

  private removeEnemy(e: Fighter, _by: Fighter | null) {
    if (e.state === 'dead') return;
    e.state = 'dead';
    this.fx('gnosis_vanish', e.x, e.y - BODY, { depth: e.y + 1 });
    e.sprite.destroy();
    e.shadow.destroy();
    e.hpBar?.frame.destroy();
    e.hpBar?.fill.destroy();
    e.glow?.destroy();
    e.signal?.destroy();
    e.area?.warn.destroy();
    this.clearExtra(e);
    if (e.enemy?.exp && !this.cutscene) this.grantExp(e.enemy.exp);
  }

  /** 경험치: 파티 전원이 같은 양. 레벨이 오르면 체력·공격력·방어력이 오르고 알림 */
  grantExp(amount: number) {
    const ids = this.party.map((p) => p.id);
    this.showLevelUps(gainExp(ids, amount));
  }

  private showLevelUps(ups: LevelUp[]) {
    for (const u of ups) {
      const f = this.party.find((p) => p.id === u.id);
      if (f) {
        const st = statsOf(f.id)!;
        const gained = st.hp - f.maxHp;
        f.maxHp = st.hp;
        f.atk = st.atk;
        f.defense = st.def;
        if (f.state !== 'fainted') f.hp = Math.min(f.maxHp, f.hp + gained);
        this.fx('level_up', f.x, f.y + 2, { origin: [0.5, 1], depth: f.y + 3 });
      }
      this.notices.push({ kind: 'levelup', text: `${f?.def.name ?? u.id} Lv ${u.to}` });
      for (const un of u.unlocked) {
        if (f) this.time.delayedCall(700, () => this.fx('unlock', f.x, f.y - BODY, { depth: f.y + 4 }));
        this.notices.push({ kind: 'unlock', text: `${un.name} 해금`, what: un.what });
        this.notices.push({ kind: 'guide', text: un.guide, ms: 7000 });
      }
    }
  }

  // ---- 기절 ----

  private faint(f: Fighter) {
    if (f.state === 'fainted') return;
    this.clearExtra(f);
    f.state = 'fainted';
    f.z = 0;
    f.vz = 0;
    f.combo = -1;
    const fl = levels.faint;
    // 일어난 지 얼마 안 돼서 다시 쓰러지면 기절 시간이 늘어난다
    f.faintStreak = this.now - f.lastGetUp < fl.refaintWindow * 1000 ? f.faintStreak + 1 : 0;
    const sec = Math.min(fl.max, fl.time + fl.addPerRefaint * f.faintStreak);
    f.faintUntil = this.now + sec * 1000;
    const st = this.fx('stun', f.x, f.y - 14, { loop: true, depth: f.y + 2 });
    f.extra.push(st);
    this.fx('dust_land', f.x, f.y - 6, { depth: f.y - 1 });
    if (this.bdef.outcomes?.[`fall:${f.id}`]) return this.finish(`fall:${f.id}`);
    if (f === this.controlled) {
      const next = this.party.find((p) => p.state !== 'fainted');
      if (next) {
        this.controlled = next;
        this.notices.push({ kind: 'toast', text: `${f.def.name}이(가) 쓰러졌습니다 → ${next.def.name}(으)로 교체` });
      }
    }
  }

  private getUp(f: Fighter) {
    this.clearExtra(f);
    f.state = 'idle';
    f.hp = Math.max(1, Math.round(f.maxHp * levels.faint.reviveHp));
    f.lastGetUp = this.now;
    f.invulnUntil = this.now + 1000;
    this.fx('unlock', f.x, f.y - BODY, { depth: f.y + 3 });
  }

  private allyFall(f: Fighter) {
    f.state = 'fainted';
    this.clearExtra(f);
    if (this.bdef.outcomes?.[`fall:${f.id}`]) this.finish(`fall:${f.id}`);
  }

  // ---- 그노시스 하수인 자폭 ----

  private startSelfDestruct(e: Fighter) {
    const sd = e.enemy!.selfDestruct!;
    e.state = 'prep';
    e.stateT = 0;
    e.combo = -1;
    // 하얀 빛 신호 + 막을 수 없는 공격의 붉은 윤곽 + 바닥의 범위
    e.signal = this.fx('gnosis_signal', e.x, e.y - BODY, { loop: true, depth: e.y + 2 });
    e.glow = this.fx('warn_glow', e.x, e.y - 22, { loop: true, depth: e.y + 1 });
    const warn = this.fx('warn_area', e.x, e.y, { loop: true, depth: -5 });
    warn.setScale(sd.radius / 46).setAlpha(0.85);
    e.area = { x: e.x, y: e.y, r: sd.radius, warn };
  }

  private explode(e: Fighter) {
    const sd = e.enemy!.selfDestruct!;
    e.exploded = true;
    this.fx('gnosis_explode', e.x, e.y - 8, { depth: e.y + 10, scale: sd.radius / 38 });
    this.cameras.main.shake(200, 0.006);
    this.cameras.main.flash(120, 255, 255, 240);
    for (const t of this.all.filter((x) => x.targetable && x.team !== 'enemy')) {
      const d = Math.hypot((t.x - e.x) / 1, (t.y - e.y) / 0.6);
      if (d <= sd.radius) this.damage(t, e, e.atk * sd.mult, { unblockable: sd.unblockable, heavy: true, push: 14, from: { x: e.x, y: e.y } });
    }
    // 흔적 없이 사라짐
    this.removeEnemy(e, null);
  }

  // ---------------------------------------------------------------
  // 인물별 갱신
  // ---------------------------------------------------------------

  private updateFighter(f: Fighter, dt: number) {
    if (!f.alive) return;
    // 점프
    if (f.z > 0 || f.vz !== 0) {
      f.vz -= GRAVITY * (dt / 1000);
      f.z += f.vz * (dt / 1000);
      if (f.z <= 0) {
        f.z = 0;
        f.vz = 0;
        this.fx('dust_land', f.x, f.y - 6, { depth: f.y - 1 });
      }
    }
    // 기력 회복
    if (f.state !== 'guard') f.stamina = Math.min(f.maxStamina, f.stamina + (f.def.evade?.regen ?? 30) * (dt / 1000));

    switch (f.state) {
      case 'attack':
        return this.updateAttack(f, dt);
      case 'hurt':
        f.stateT += dt;
        if (f.stateT > 260) f.state = 'idle';
        return;
      case 'stagger':
        if (this.now > f.stunUntil) f.state = 'idle';
        return;
      case 'fainted':
        if (f.team === 'party' && !this.cutscene && this.now >= f.faintUntil) this.getUp(f);
        return;
      case 'prep':
        f.stateT += dt;
        if (f.enemy?.selfDestruct && f.stateT >= f.enemy.selfDestruct.signal) this.explode(f);
        return;
      case 'cast':
        return this.updateCast(f, dt);
    }
    if (this.cutscene) return;
    if (f.team === 'enemy') this.enemyAI(f, dt);
    else if (f !== this.controlled) this.allyAI(f, dt);
  }

  /** 동료·NPC: 가까운 적에게 다가가 공격. 자폭하려는 적에게서는 떨어진다 */
  private allyAI(f: Fighter, dt: number) {
    if (f.state !== 'idle' && f.state !== 'move') return;
    const danger = this.all.find((e) => e.state === 'prep' && e.area && Math.hypot(e.x - f.x, e.y - f.y) < e.area.r + 10);
    if (danger) {
      const dx = f.x - danger.x;
      const dy = f.y - danger.y;
      const l = Math.hypot(dx, dy) || 1;
      f.state = 'move';
      f.facing = dirOf(dx, dy);
      return this.moveBy(f, (dx / l) * f.speed * (dt / 1000), (dy / l) * f.speed * (dt / 1000));
    }
    const foes = this.foesOf(f);
    if (!foes.length) {
      f.state = 'idle';
      return;
    }
    const t = foes.reduce((a, b) => (Math.hypot(a.x - f.x, a.y - f.y) < Math.hypot(b.x - f.x, b.y - f.y) ? a : b));
    const dx = t.x - f.x;
    const dy = t.y - f.y;
    const d = Math.hypot(dx, dy);
    const range = (f.def.attack?.hits[0].range ?? 26) - 4;
    f.aimX = dx / (d || 1);
    f.aimY = dy / (d || 1);
    f.facing = dirOf(dx, dy);
    if (d > range) {
      f.state = 'move';
      this.moveBy(f, (dx / d) * f.speed * 0.9 * (dt / 1000), (dy / d) * f.speed * 0.9 * (dt / 1000));
    } else {
      f.state = 'idle';
      f.attackCd -= dt;
      if (f.attackCd <= 0) {
        f.attackCd = 500 + Math.random() * 600;
        this.startHit(f, 0);
        f.queued = Math.random() < 0.6;
      }
    }
  }

  private enemyAI(e: Fighter, dt: number) {
    const ed = e.enemy!;
    const targets = this.all.filter((t) => t.targetable && t.team !== 'enemy');
    if (!targets.length) {
      e.state = 'idle';
      return;
    }
    const t = targets.reduce((a, b) => (Math.hypot(a.x - e.x, a.y - e.y) < Math.hypot(b.x - e.x, b.y - e.y) ? a : b));
    const dx = t.x - e.x;
    const dy = t.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.aiCd -= dt;
    e.blinkCd -= dt;

    // 체력이 낮아지면 자폭 신호
    if (ed.selfDestruct && e.hp <= e.maxHp * ed.selfDestruct.below) return this.startSelfDestruct(e);

    if (ed.ai === 'rusher') {
      const a = ed.attack!;
      e.aimX = dx / d;
      e.aimY = dy / d;
      e.facing = dirOf(dx, dy);
      if (d > a.range) {
        e.state = 'move';
        this.moveBy(e, (dx / d) * e.speed * (dt / 1000), (dy / d) * e.speed * (dt / 1000));
      } else {
        e.state = 'idle';
        if (e.aiCd <= 0) {
          e.aiCd = a.cooldown + Math.random() * 500;
          this.startHit(e, 0);
        }
      }
      return;
    }

    // caster (마르키온): 거리를 두고 빛을 쏜다
    const keep = ed.keepAway ?? 80;
    e.facing = dirOf(dx, dy);
    e.aimX = dx / d;
    e.aimY = dy / d;
    if (d < keep) {
      const nx = e.x - (dx / d) * e.speed * (dt / 1000);
      const ny = e.y - (dy / d) * e.speed * (dt / 1000);
      const cornered = nx < this.bounds.x0 + 20 || nx > this.bounds.x1 - 20 || ny < this.bounds.y0 + 14 || ny > this.bounds.y1 - 14;
      if (cornered && e.blinkCd <= 0 && ed.blink) {
        e.blinkCd = ed.blink.cooldown;
        this.fx('light_burst', e.x, e.y - BODY, { depth: e.y + 2, scale: 0.6 });
        const cx = (this.bounds.x0 + this.bounds.x1) / 2;
        const cy = (this.bounds.y0 + this.bounds.y1) / 2;
        const bx = t.x < cx ? this.bounds.x1 - 40 : this.bounds.x0 + 40;
        e.x = bx;
        e.y = Phaser.Math.Clamp(cy + (Math.random() - 0.5) * 80, this.bounds.y0 + 20, this.bounds.y1 - 20);
        this.fx('light_burst', e.x, e.y - BODY, { depth: e.y + 2, scale: 0.6 });
      } else {
        e.state = 'move';
        this.moveBy(e, (-dx / d) * e.speed * (dt / 1000), (-dy / d) * e.speed * (dt / 1000));
      }
    } else e.state = 'idle';
    if (e.aiCd <= 0) {
      e.attacks++;
      const area = ed.area && e.attacks % ed.area.every === 0;
      e.state = 'cast';
      e.stateT = 0;
      e.castKind = area ? 'area' : 'bolt';
      e.castTaken = 0;
      e.glow = this.fx('warn_glow', e.x, e.y - 22, { loop: true, depth: e.y + 1 });
      const hand = this.fx('light_cast', e.x + e.aimX * 10, e.y - BODY - 2, { loop: true, depth: e.y + 3 });
      e.extra.push(hand);
      if (area) {
        const warn = this.fx('warn_area', t.x, t.y, { loop: true, depth: -5 });
        warn.setScale(ed.area!.radius / 46).setAlpha(0.9);
        e.area = { x: t.x, y: t.y, r: ed.area!.radius, warn };
        this.notices.push({ kind: 'toast', text: '피할 수 없는 공격! 공격해서 시전을 끊으세요' });
      }
    }
  }

  private updateCast(e: Fighter, dt: number) {
    const ed = e.enemy!;
    e.stateT += dt;
    const cast = e.castKind === 'area' ? ed.area!.cast : ed.bolt!.cast;
    // 범위 공격은 일정 피해를 받으면 끊긴다
    if (e.castKind === 'area' && e.castTaken >= ed.area!.breakDamage) {
      this.word('break', e);
      this.endCast(e);
      e.state = 'stagger';
      e.stunUntil = this.now + 900;
      e.aiCd = 1600;
      return;
    }
    if (e.stateT < cast) return;
    if (e.castKind === 'area' && e.area) {
      const { x, y, r } = e.area;
      this.fx('light_burst', x, y - 10, { depth: y + 10, scale: r / 20 });
      this.cameras.main.shake(160, 0.005);
      for (const t of this.all.filter((a) => a.targetable && a.team !== 'enemy')) {
        if (Math.hypot(t.x - x, (t.y - y) / 0.5) <= r) this.damage(t, e, e.atk * ed.area!.mult, { area: true, unblockable: true, heavy: true, push: 10, from: { x, y } });
      }
    } else {
      // 빛을 쏜다 (조준한 쪽으로)
      const t = this.all.filter((a) => a.targetable && a.team !== 'enemy').sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
      if (t) {
        const dx = t.x - e.x;
        const dy = t.y - e.y;
        const l = Math.hypot(dx, dy) || 1;
        this.shoot(e, e.x + (dx / l) * 10, e.y - BODY, (dx / l) * ed.bolt!.speed, (dy / l) * ed.bolt!.speed, 'light_bolt', Math.round(e.atk * ed.bolt!.mult), ed.bolt!.unblockable);
      }
    }
    this.endCast(e);
    e.state = 'idle';
    e.aiCd = (ed.bolt?.cooldown ?? 1500) + Math.random() * 500;
  }

  private endCast(e: Fighter) {
    e.glow?.destroy();
    e.glow = undefined;
    e.area?.warn.destroy();
    e.area = undefined;
    this.clearExtra(e);
  }

  // ---- 날아가는 것 ----

  private shoot(owner: Fighter, x: number, y: number, vx: number, vy: number, fx: string, dmg: number, unblockable: boolean) {
    const s = this.fx(fx, x, y, { loop: true, angle: Math.atan2(vy, vx), depth: 9000 });
    this.projectiles.push({ s, x, y, vx, vy, dmg, owner, unblockable });
  }

  private updateProjectiles(dt: number) {
    for (const p of [...this.projectiles]) {
      p.x += p.vx * (dt / 1000);
      p.y += p.vy * (dt / 1000);
      p.s.setPosition(p.x, p.y);
      const foes = this.foesOf(p.owner);
      const hit = foes.find((t) => Math.abs(t.x - p.x) < 9 && Math.abs(t.y - BODY - p.y) < 14 && !t.airborne);
      const out = p.x < 0 || p.y < 20 || p.x > this.bdef.arena.w || p.y > this.bdef.arena.h;
      if (hit) {
        this.damage(hit, p.owner, p.dmg, { unblockable: p.unblockable, push: 6, from: { x: p.x - p.vx * 0.05, y: p.y + BODY - p.vy * 0.05 } });
        this.fx(p.owner.team === 'enemy' ? 'light_burst' : 'elysia_bolt_hit', p.x, p.y, { depth: 9000, scale: 0.5 });
      }
      if (hit || out) {
        p.s.destroy();
        this.projectiles.splice(this.projectiles.indexOf(p), 1);
      }
    }
  }

  // ---- 이동, 겹침 ----

  private moveBy(f: Fighter, dx: number, dy: number) {
    f.x = Phaser.Math.Clamp(f.x + dx, this.bounds.x0, this.bounds.x1);
    f.y = Phaser.Math.Clamp(f.y + dy, this.bounds.y0, this.bounds.y1);
  }

  /** 서로 겹치지 않게 살짝 밀어냄 */
  private separate() {
    const list = this.all.filter((f) => f.alive && f.state !== 'fainted' && f.z === 0);
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dy = (b.y - a.y) * 1.6;
        const d = Math.hypot(dx, dy);
        const min = 13;
        if (d < min && d > 0.01) {
          const push = (min - d) / 2;
          const bossA = a.enemy?.boss ? 0 : 1;
          const bossB = b.enemy?.boss ? 0 : 1;
          this.moveBy(a, (-dx / d) * push * bossA, (-dy / d) * push * 0.6 * bossA);
          this.moveBy(b, (dx / d) * push * bossB, (dy / d) * push * 0.6 * bossB);
        }
      }
  }

  // ---------------------------------------------------------------
  // 결과
  // ---------------------------------------------------------------

  private checkOutcome() {
    const b = this.bdef;
    const enemiesLeft = this.all.some((f) => f.team === 'enemy' && f.alive);
    const spawning = this.pendingSpawns > 0;
    if (!enemiesLeft && !spawning) {
      if (this.waveIdx < (b.waves?.length ?? 0) - 1) {
        this.waveIdx++;
        this.notices.push({ kind: 'toast', text: '적이 더 몰려옵니다!' });
        return this.spawnWave(this.waveIdx);
      }
      return this.finish('win');
    }
    if (b.damage && this.damageDealt >= b.damage) return this.finish('damage');
    if (b.timeLimit && this.elapsed >= b.timeLimit * 1000) return this.finish('timeout');
    if (this.party.length && this.party.every((p) => p.state === 'fainted')) return this.finish('wipe');
  }

  /** 남은 시간 (초). 제한 없으면 null */
  get timeLeft() {
    return this.bdef.timeLimit ? Math.max(0, this.bdef.timeLimit - this.elapsed / 1000) : null;
  }

  private finish(outcome: string, forced?: OutcomeAction) {
    if (this.ended) return;
    this.ended = true;
    this.wheelOpen = false;
    this.timeScale = 1;
    this.reviving = null;
    const outs = this.bdef.outcomes ?? {};
    let action: OutcomeAction | undefined = forced ?? outs[outcome];
    if (!action && outcome === 'win') action = { continue: true };
    if (!action && outcome === 'wipe') {
      // 게임 오버
      this.time.delayedCall(900, () => {
        this.frozen = true;
        this.notices.push({ kind: 'word', text: 'gameover' });
      });
      return;
    }
    action ??= { continue: true };
    const done = action;
    // 전투 이벤트 경험치 (처음 한 번)
    if (outcome !== 'wipe' && this.bdef.exp && !this.cutscene) {
      this.showLevelUps(gainOnce(`battle:${this.start.battle}`, this.party.map((p) => p.id), this.bdef.exp));
    }
    if (outcome === 'win') this.notices.push({ kind: 'word', text: 'victory' });
    if (outcome === 'damage') this.cameras.main.flash(500, 255, 255, 255);
    const wait = outcome === 'done' ? 200 : this.notices.some((e) => e.kind === 'levelup') ? 2600 : 1500;
    this.time.delayedCall(wait, () => this.leave({ outcome, action: done }));
  }

  /** HUD의 게임 오버 화면에서 고름 */
  gameOverChoice(retry: boolean) {
    this.leave({ outcome: 'wipe', action: retry ? 'gameover-retry' : 'gameover-title' });
  }

  private leaving = false;
  private leave(r: BattleResult) {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.scene.get('BattleHUD')?.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.leaving = false;
      this.scene.stop('BattleHUD');
      this.scene.stop();
      this.start.onEnd(r);
    });
  }

  // ---------------------------------------------------------------
  // 그리기
  // ---------------------------------------------------------------

  private renderAll() {
    for (const f of this.all) if (f.alive) this.renderFighter(f);
    // 깨우기 막대
    const r = this.reviving;
    if (r) {
      if (!this.reviveBar) {
        this.reviveBar = {
          frame: this.add.image(0, 0, 'ui_bar_revive').setOrigin(0.5, 0).setDepth(10001),
          fill: this.add.image(0, 0, 'ui_fill_green_2').setOrigin(0, 0).setDepth(10002),
        };
      }
      const t = r.t / (levels.faint.reviveHold * 1000);
      this.reviveBar.frame.setPosition(r.target.x, r.target.y - 26).setVisible(true);
      this.reviveBar.fill.setPosition(r.target.x - 13, r.target.y - 25).setCrop(0, 0, Math.round(26 * t), 2).setVisible(true);
    } else if (this.reviveBar) {
      this.reviveBar.frame.setVisible(false);
      this.reviveBar.fill.setVisible(false);
    }
  }

  private renderFighter(f: Fighter) {
    const s = f.sprite;
    s.setPosition(Math.round(f.x), Math.round(f.y - f.z)).setDepth(f.y);
    f.shadow.setPosition(Math.round(f.x), Math.round(f.y)).setDepth(-4).setFrame(f.z > 12 ? 2 : f.z > 4 ? 1 : 0);
    f.shadow.setVisible(f.state !== 'fainted');
    const bt = `bt_${f.spriteKey}`;
    const row = DIRS.indexOf(f.facing);
    const setBt = (col: number) => {
      if (s.texture.key !== bt) s.stop().setTexture(bt, row * 12 + col);
      else s.setFrame(row * 12 + col);
    };
    const walk = () => {
      if (s.texture.key !== f.spriteKey) s.setTexture(f.spriteKey, row * 5);
    };
    switch (f.state) {
      case 'attack': {
        const h = f.def.attack!.hits[f.combo];
        if (!h) break;
        setBt(f.stateT < h.windup ? h.cols[0] : h.cols[1]);
        break;
      }
      case 'guard':
        setBt(6);
        break;
      case 'hurt':
        setBt(7);
        break;
      case 'stagger':
        setBt(7);
        break;
      case 'prep':
      case 'cast':
        setBt(Math.floor(this.now / 150) % 2 ? 9 : 8);
        break;
      case 'kneel':
      case 'revive':
        setBt(f.state === 'revive' ? 10 : 10);
        break;
      case 'fainted':
        setBt(11);
        break;
      default:
        if (f.z > 0) {
          walk();
          if (!s.anims.isPlaying || !s.anims.currentAnim?.key.includes('-jump-')) s.play(`${f.spriteKey}-jump-${f.facing}`, true);
        } else if (f.state === 'move') {
          walk();
          s.play(`${f.spriteKey}-walk-${f.facing}`, true);
        } else {
          walk();
          s.stop();
          s.setFrame(row * 5);
        }
    }
    // 무적(일어난 직후) 깜빡임, 막을 수 없는 공격 준비 중엔 붉게
    s.setAlpha(this.now < f.invulnUntil ? (Math.floor(this.now / 80) % 2 ? 0.5 : 1) : 1);
    if (f.glow) s.setTint(Math.floor(this.now / 120) % 2 ? 0xff9a9a : 0xffffff);
    else s.clearTint();
    f.glow?.setPosition(f.x, f.y - 22 - f.z).setDepth(f.y + 1);
    f.signal?.setPosition(f.x, f.y - BODY).setDepth(f.y + 2);
    for (const o of f.extra) {
      const sp = o as Phaser.GameObjects.Sprite;
      if (sp.anims?.currentAnim?.key === 'fx_leon_guard') {
        sp.setPosition(f.x, f.y - BODY - f.z).setRotation(Math.atan2(f.aimY, f.aimX)).setDepth(f.y + (f.aimY < -0.5 ? -1 : 2));
      } else if (sp.anims?.currentAnim?.key === 'fx_stun') sp.setPosition(f.x, f.y - 14).setDepth(f.y + 2);
      else if (sp.anims?.currentAnim?.key === 'fx_light_cast') sp.setPosition(f.x + f.aimX * 10, f.y - BODY - 2).setDepth(f.y + 3);
    }
    if (f.hpBar) {
      const show = f.hp < f.maxHp && f.state !== 'prep';
      f.hpBar.frame.setVisible(show).setPosition(Math.round(f.x), Math.round(f.y - 44 - f.z)).setDepth(10000);
      f.hpBar.fill
        .setVisible(show)
        .setPosition(Math.round(f.x) - 10, Math.round(f.y - 43 - f.z))
        .setCrop(0, 0, Math.max(0, Math.round((20 * f.hp) / f.maxHp)), 2)
        .setDepth(10001);
    }
  }

  /** 이펙트 하나 재생 (반복이 아니면 끝나면 사라짐) */
  fx(
    key: string,
    x: number,
    y: number,
    o: { angle?: number; depth?: number; flipY?: boolean; flipX?: boolean; loop?: boolean; scale?: number; alpha?: number; origin?: [number, number] } = {},
  ) {
    const info = fxInfo(key);
    const s = this.add.sprite(Math.round(x), Math.round(y), `fx_${key}`, 0);
    const org = FX_ORIGIN[key];
    if (o.origin) s.setOrigin(o.origin[0], o.origin[1]);
    else if (org && info) s.setOrigin(org[0] / info.w, org[1] / info.h);
    if (o.angle !== undefined) s.setRotation(o.angle);
    if (o.flipY) s.setFlipY(true);
    if (o.flipX) s.setFlipX(true);
    if (o.scale) s.setScale(o.scale);
    if (o.alpha !== undefined) s.setAlpha(o.alpha);
    s.setDepth(o.depth ?? y + 20);
    s.play(`fx_${key}`);
    if (!o.loop && !info?.loop) s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
    return s;
  }

  /** 맞은 자리 위에 뜨는 숫자 */
  damageNumber(t: Fighter, n: number, hurtsUs: boolean) {
    const digits = String(Math.max(0, Math.round(n))).split('').map(Number);
    const c = this.add.container(Math.round(t.x), Math.round(t.y - 40 - t.z)).setDepth(12000);
    digits.forEach((d, i) => {
      const im = this.add.image((i - (digits.length - 1) / 2) * 6, 0, 'ui_digits', d);
      im.setTint(hurtsUs ? 0xff7060 : 0xfff2c0);
      c.add(im);
    });
    this.tweens.add({ targets: c, y: c.y - 14, alpha: { from: 1, to: 0 }, duration: 800, ease: 'Quad.easeOut', onComplete: () => c.destroy() });
  }

  /** PARRY, BREAK 같은 글자 */
  word(w: 'parry' | 'break' | 'block', f: Fighter) {
    const im = this.add.image(Math.round(f.x), Math.round(f.y - 50), `ui_word_${w}`).setDepth(12001);
    this.tweens.add({ targets: im, y: im.y - 10, alpha: { from: 1, to: 0 }, duration: 900, delay: 200, onComplete: () => im.destroy() });
  }

  // ---- HUD가 읽는 값 ----
  get enemiesBoss() {
    return this.all.find((f) => f.enemy?.boss && f.alive) ?? null;
  }
  levelOf(id: string) {
    return levelOf(id);
  }
}
