import Phaser from 'phaser';
import battles from '../data/battle/battles.json';
import enemies from '../data/battle/enemies.json';
import fighters from '../data/battle/fighters.json';
import combos from '../data/battle/combos.json';
import levels from '../data/battle/levels.json';
import { gameState } from '../game/GameState';
import { save } from '../game/save';
import { loadOptional } from '../game/assets';
import { hasCutin } from '../game/cutin';
import { currentLoop, playLoop } from '../game/sound';
import { fxInfo, makeBattleAnims, preloadBattle } from './assets';
import { activeParty, EXP_REWARD, gainExp, isUnlocked, levelOf, partyIds, statsOf, type LevelUp, type Unlock } from './progress';
import { MAPS, findObj, footOf, makeMapAnims, makePropSprite, makeTilemap, objectsOf, preloadMapArt, propOf } from '../explore/mapData';
import type { ExploreScene } from '../explore/ExploreScene';

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
  /** 게임 오버 화면으로 (지켜야 하는 대상이 무너졌을 때 등) */
  gameover?: boolean;
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
  /** 지금 떠 있는 맵 화면. 있으면 그 맵 위에서 그대로 싸운다 (화면 전환 없음) */
  map?: ExploreScene;
  /** 필드 몹 전투: 맵 위 몹이 있던 자리 (맵 좌표). 적이 이 둘레에서 나타난다 */
  field?: { x: number; y: number };
  /** 맵 위 전투장의 왼쪽 위 (맵 좌표). 없으면 맵의 arena 구역 */
  at?: { x: number; y: number };
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
  /** 대시: 연달아 쓸 수 있는 횟수 (하나씩 cooldown 뒤에 다시 참) */
  charges?: number;
  /** 버티기·도발: 지속 시간(ms), 받는 피해 감소 비율 */
  hold?: number;
  cut?: number;
  /** 도발 범위, 대지 가르기 범위(픽셀) */
  radius?: number;
  /** 대지 가르기: 공격력 배율, 일어나지 못하는 시간(ms) */
  mult?: number;
  stun?: number;
  /** 갈리아 10레벨: 버티기로 줄인 피해 중 오러 게이지로 바꾸는 비율 */
  gaugeRatio?: number;
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
  gauge?: { name: string; fill: string; perHit: number; perParry?: number; overload?: Overload };
  stamina?: number;
}

/** 엘리시아의 과부하: 마법을 쓸 때마다 오르고, 가득 찬 채로 쓰면 체력이 hpCost 비율만큼 깎인다 */
interface Overload {
  bolt: number;
  blink: number;
  skill: number;
  hpCost: number;
}

interface EnemyDef {
  name: string;
  sprite: string;
  hp: number;
  atk: number;
  def: number;
  speed: number;
  boss?: boolean;
  ai: 'rusher' | 'caster' | 'eel' | 'burrow' | 'knight';
  /** 쓰러지면 사라지지 않고 기절한 모습으로 남음 (제국 병사, 추격 기사) */
  faint?: boolean;
  /** 쓰러지면 물속으로 가라앉음 (수로의 괴물) */
  sink?: boolean;
  bite?: { range: number; windup: number; mult: number; cooldown: number };
  tail?: { every: number; cast: number; radius: number; mult: number; breakDamage: number };
  spray?: { cast: number; speed: number; mult: number; count: number };
  dive?: { below: number; leech: number; maxMs: number };
  /** hits = 한 번에 몇 번 베는지 (도적의 단검 두 번 베기) */
  attack?: { range: number; windup: number; recover: number; cooldown: number; mult: number; fx: string; hits?: number; unblockable?: boolean };
  selfDestruct?: { below: number; signal: number; radius: number; mult: number; unblockable: boolean };
  keepAway?: number;
  /** count = 한 번에 쏘는 빛 수, spread = 빛 사이 각도(도) */
  bolt?: { cast: number; speed: number; mult: number; cooldown: number; unblockable?: boolean; fx?: string; tint?: string; count?: number; spread?: number };
  area?: { every: number; cast: number; radius: number; mult: number; breakDamage: number };
  blink?: { cooldown: number; distance: number };
  /** 안개 짐승: every ms마다 ms 동안 흐려진다(맞지 않고, 덮치지도 않음) */
  fade?: { every: number; ms: number };
  /** 체력이 at(비율) 아래로 내려갈 때마다 enemy를 count마리 부른다 */
  summon?: { at: number[]; enemy: string; count: number };
  /** 시전 뒤 멈춰 서 있는 시간 (이때 때리기 쉽다) */
  recover?: number;
  /** 정면에서 받는 피해 배율 (사막 전갈의 등껍질) */
  shell?: number;
  /**
   * 방패로 정면 공격을 막는다. always = 서 있거나 걸을 때 늘 (성기사), stance = 방패를 든 동안만 (아드리안).
   * 막을 수 없는 공격(오러 찌르기 등)을 정면에 맞으면 자세가 무너져 stagger ms 동안 휘청인다
   */
  shield?: { mode: 'always' | 'stance'; stagger: number };
  /** 모래 속(무적)으로 다가가 range 안에서 튀어나와 문다(emerge ms 뒤). 그 뒤 open ms 동안 드러난 채 서 있다 */
  burrow?: { range: number; emerge: number; mult: number; open: number };
  /** 기사: 방패 돌진 (windup 뒤 ms 동안 곧게 달려듦, 막을 수 없음) */
  charge?: { windup: number; ms: number; speed: number; mult: number; cooldown: number };
  /** 기사: 방패 들고 버티기 */
  block?: { ms: number };
  /** 기사: 체력이 at 아래면 한 번 치유의 빛 (cast ms, 최대 체력의 amount만큼 회복) */
  heal?: { at: number; cast: number; amount: number };
  /** 바위 도마뱀: range 안에 들어올 때까지 가만히 있다가 speed배로 ms 동안 굴러 덮침 */
  ambush?: { range: number; speed: number; ms: number };
  /** 용암 민달팽이: every ms마다 지나간 자리에 불길(ms 동안, 반지름 radius, 0.5초마다 atk×mult) */
  trail?: { every: number; ms: number; radius: number; mult: number };
  /** 용암의 수호자: every ms마다 count곳 바닥이 끓어오름(cast ms 뒤 반지름 radius, atk×mult, 막을 수 없음) */
  pools?: { every: number; count: number; cast: number; radius: number; mult: number };
  /** 굳은 껍질: 받는 피해 mult배. breakBy 기술(oath, fang, 각성 중 공격)에 맞으면 깨져 그 뒤로 core배 */
  armor?: { mult: number; core: number; breakBy: string[] };
  /** 결박술사: cooldown마다 range 안의 아군 한 명을 ms 동안 사슬로 묶음 (잠깐 조작 불가). 결박술사가 맞으면 끊김 */
  bind?: { range: number; cast: number; ms: number; cooldown: number };
  /** 마력 방어막: hp만큼 피해를 먼저 막는다 (공격으로 깨야 함) */
  barrier?: { hp: number };
}

/** 전투 튜토리얼 한 단계. goal: hit(적을 벰) block(막기) parry(튕겨 내기) dodge(붉은 범위 피하기) free(자유) */
interface TutStep {
  goal: 'hit' | 'block' | 'parry' | 'dodge' | 'free';
  text: string;
  count?: number;
  /** 이 단계에서 막기를 이만큼 하면 그냥 넘어감 (튕겨 내기가 어려울 때) */
  skipAfterBlocks?: number;
}

/**
 * 지켜야 하는 대상: 체력만 있고 공격하지 않는 아군. 적이 먼저 노리고, 쓰러지면 결과 fall:ID.
 * prop = 전투장 맵의 물건 이름(그 물건 발밑에 놓임, 그림은 맵이 그린다). x, y = 전투장 좌표(prop이 없을 때).
 * sprite = 직접 그릴 그림(없으면 맵의 그림만). crack = 체력이 반 아래일 때 겹쳐 그리는 그림(ex_ 물건 그림 이름).
 * follow = 이 파티원을 따라 걷는다(따라다니는 NPC)
 */
interface ProtectDef {
  id: string;
  name: string;
  hp: number;
  def?: number;
  prop?: string;
  x?: number;
  y?: number;
  sprite?: string;
  crack?: string;
  follow?: string;
  speed?: number;
  /** 몸 반지름 (적이 이만큼 떨어져서도 때릴 수 있다) */
  radius?: number;
  /** 발밑에 그리는 원의 색 (엘리시아의 룬 결계) */
  ring?: string;
}

interface BattleDef {
  title?: string;
  /** map: 맵 파일(src/data/maps) 이름. 그 맵의 arena 구역을 전투장 바닥으로 쓴다 */
  arena: { w: number; h: number; floor: string; tint: string; map?: string; /** 한 맵에 전투장이 여럿이면 그 이름 (없으면 첫 arena) */ zone?: string };
  /** current = 지금 출전하는 파티 (파티 선택 화면. 대기 동료 빼고 최대 4명) */
  party?: string[] | 'current';
  /** 반드시 출전하는 인물 (party: current일 때) */
  force?: string[];
  /** 버티기 전투: 이 초가 지나면 결과 time으로 끝 (이기든 지든). 남은 시간 대신 화면 가장자리가 보랏빛으로 차오름 */
  survive?: number;
  /** 파티가 다 쓰러져도 게임 오버가 아님 (버티기 전투는 결과 time) */
  noGameOver?: boolean;
  /** 끝없이 나오는 적: 그 적이 늘 keep명 있게 채운다. after = 이 초부터 */
  endless?: { enemy: string; keep: number; after?: number }[];
  /** 이 플래그가 켜져 있으면 who의 궁극기 게이지가 가득 찬 채로 시작 (4막 karg_heated) */
  gaugeFull?: { flag: string; who: string };
  /** 처음 한 번 띄우는 안내 (who가 이 전투에 나올 때만) */
  firstGuide?: { key: string; who: string; text: string };
  start?: Record<string, number[]>;
  /** actor = 맵에 서 있던 그 인물이 싸운다 (같은 아군이 여럿일 때) */
  /** vital = 체력바를 화면 위에 따로 표시. blockLight = 막을 수 없는 빛 공격을 오러로 막음 */
  allies?: { id: string; x: number; y: number; actor?: string; vital?: boolean; blockLight?: boolean }[];
  /** actor = 맵에 서 있던 인물 ID. 그 인물이 그 자리에서 그대로 싸운다 (x, y 대신) */
  waves?: { enemy: string; x?: number; y?: number; actor?: string }[][];
  outcomes?: Record<string, OutcomeAction>;
  damage?: number;
  timeLimit?: number;
  guide?: string;
  tutorial?: TutStep[];
  /** 마지막 일격: 보스 체력이 at 이하가 되면 궁극기를 잠시 열어 자동으로 쓰고 체력을 0으로 (대본 연출용) */
  finisher?: { at: number; name: string };
  /** 파티가 쓰러지지 않음 (체력 1에서 멈춤) */
  noFall?: boolean;
  /** 연계 게이지가 가득 찬 채로 시작 (합동 기술을 처음 배우는 전투) */
  comboFull?: boolean;
  /** 연계 게이지 시작값 (0~100) */
  comboStart?: number;
  /** 이 플래그가 켜져 있으면 적이 더 빨라짐 (1막 검문소를 정면으로 뚫으면 추격이 빨라짐). speed = 이동 속도 배율 */
  hurry?: { flag: string; speed: number };
  /** 연계 게이지가 처음 가득 찼을 때 한 번 띄우는 안내 */
  comboGuide?: string;
  /** 지켜야 하는 대상 */
  protect?: ProtectDef;
  /** 휴대폰에서 보여 줄 안내 (없으면 guide) */
  guideTouch?: string;
  /** 안내를 이 기술을 쓸 때까지 띄워 둔다 */
  guideUntil?: 'skill';
  /** 보스 체력이 이 비율 이하가 되면 쓰러뜨리지 않고 무릎 꿇린 채 끝 (결과 finisher, 자동 연출 없음) */
  endAt?: number;
  /** 전투 BGM (assets/audio/{bgm}). 끝나면 앞의 곡으로 */
  bgm?: string;
  /** 보스가 쓰러지면 남은 적도 사라지고 끝 */
  bossEnds?: boolean;
}

/** 인물별 스킬·궁극기 동작 (없는 것은 "준비 중") */
const MOVES: Record<string, Fighter['move']> = {
  'leon:skill': 'thrust',
  'leon:ult': 'oath',
  'elysia:skill': 'rune',
  'elysia:ult': 'overload',
  'karg:skill': 'fang',
  'karg:ult': 'frenzy',
  'galia:skill': 'taunt',
  'galia:ult': 'quake',
  'serena:skill': 'awe',
  'serena:ult': 'command',
};
/** 세레나 황제의 명령: 지속(ms), 아군 공격력 배율, 빠르기 배율(동작·이동), 스킬 재사용 대기 배율 [임시] */
const COMMAND = { ms: 8000, atk: 1.3, speed: 1.15, cooldown: 0.6 };
/** 각인 무기를 얻은 뒤 맹세의 검: 피해·범위 배율 [임시] */
const WEAPON = { mult: 1.15, range: 1.15, tint: 0xdfe8ff };

type State =
  | 'idle' | 'move' | 'attack' | 'guard' | 'hurt' | 'fainted' | 'dead'
  | 'prep' | 'cast' | 'kneel' | 'revive' | 'stagger' | 'skill';

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
  castKind: 'bolt' | 'area' | 'bite' | 'tail' | 'spray' | 'charge' | 'heal' | '' = '';
  castTaken = 0;
  attacks = 0;
  blinkCd = 0;
  area?: { x: number; y: number; r: number; warn: Phaser.GameObjects.Sprite };
  stunUntil = 0;
  exploded = false;
  recoverUntil = 0;
  // 스킬·궁극기
  skillCd = 0;
  move: '' | 'thrust' | 'oath' | 'rune' | 'overload' | 'combo' | 'fang' | 'frenzy' | 'brace' | 'taunt' | 'quake' | 'awe' | 'command' = '';
  /** 사슬에 묶인 동안 (결박술사). by = 묶은 적 */
  boundUntil = 0;
  boundBy: Fighter | null = null;
  /** 결박술사: 다음 사슬까지, 사슬을 거는 중인 대상 */
  bindCd = 0;
  bindPending: Fighter | null = null;
  /** 마력 방어막 남은 양, 그 그림 */
  barrierHp = 0;
  barrierFx?: Phaser.GameObjects.Ellipse;
  /** 굳은 껍질이 깨졌나 */
  armorBroken = false;
  /** 바위 도마뱀: 덮쳤나 */
  ambushed = false;
  /** 민달팽이 불길, 용암 웅덩이까지 */
  trailCd = 0;
  poolCd = 0;
  /** 도발 (갈리아 단장의 호령): 끝나는 때. 받는 피해 감소도 같은 때까지 */
  tauntUntil = 0;
  moveCol = 0;
  /** 여러 번 베는 기술의 몇 번째 */
  moveStep = 0;
  /** 대시를 쓴 때 (카르크) */
  dashUsed: number[] = [];
  /** 각성 (늑대의 피): 끝나는 때, 원래 빠르기, 몸을 두른 이펙트 */
  buffUntil = 0;
  baseSpeed = 0;
  buffFx?: Phaser.GameObjects.Sprite;
  // 기사 (아드리안)
  healed = false;
  chargeX = 0;
  chargeY = 0;
  moveHit = new Set<Fighter>();
  /** 전투장 밖에 서 있던 맵 인물이 전투장 안으로 걸어 들어오는 중 */
  walkUntil = 0;
  /** 화면 위에 체력바를 따로 보이는 NPC 아군 */
  vital = false;
  /** 막을 수 없는 빛을 오러로 막는 NPC 아군 */
  blockLight = false;
  /** 안개 짐승: 다음에 흐려질 때까지 */
  fadeCd = 0;
  /** 부르기를 몇 번 했는지 */
  summoned = 0;
  // 수로의 괴물
  dived = false;
  diveDone = false;
  diveUntil = 0;
  poseCol = 0;
  poseUntil = 0;

  /** 어두운 곳에서 이 인물을 비추는 빛 (보스) */
  light?: Phaser.GameObjects.Light;

  /** 맵 위에서 싸울 때, 이 인물이 맡은 맵 인물 ID (끝나면 그 자리로 돌려놓음) */
  actorId?: string;
  /** 지켜야 하는 대상 */
  protect?: ProtectDef;
  /** 몸 반지름 (큰 물건은 멀리서도 맞는다) */
  radius = 0;
  /** 금 간 모습 (지켜야 하는 대상) */
  crack?: Phaser.GameObjects.Sprite;
  /** 마지막으로 이 적을 때린 인물과 그때 */
  lastHitBy: Fighter | null = null;
  lastHitAt = -1e9;

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
    return this.state !== 'dead' && this.state !== 'fainted' && !this.dived && !(this.enemy?.selfDestruct && this.state === 'prep');
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
/** 레벨 추가 효과가 열리는 레벨 */
const BONUS_LEVELS = [10, 15, 20, 25, 30];
/** 궁극기 마지막 일격 때 느려지는 배율 (0.3 = 약 3배 느리게) */
const FINISH_SLOW = 0.3;
const JUMP_V = 140;
/** 물속 걸음 배율과 잠기는 깊이 (ExploreScene과 같게) */
const WADE_SLOW = 0.55;
const WADE_DEPTH = 12;
/** 점프 중 이동 빠르기 배율 (점프 거리를 정함) */
const AIR_SPEED = 0.7;
const GRAVITY = 620;

const dirOf = (x: number, y: number): Dir => (Math.abs(x) > Math.abs(y) ? (x < 0 ? 'left' : 'right') : y < 0 ? 'up' : 'down');
const TUT_SWAP = '1, 2: 캐릭터 교체. 조작하지 않는 동료는 스스로 싸웁니다';
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
  projectiles: { s: Phaser.GameObjects.Sprite; x: number; y: number; vx: number; vy: number; dmg: number; owner: Fighter; unblockable: boolean; tint?: number }[] = [];
  /** 엘리시아의 룬 결계 */
  runes: { x: number; y: number; r: number; until: number; next: number; owner: Fighter; s: Phaser.GameObjects.Sprite }[] = [];
  /** 합동 기술 휠에서 가리킨 동료 (party 번호, 없으면 -1). HUD가 정한다 */
  comboPick = -1;
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
  /** 마지막 일격 때 장면 전체를 느리게 하는 배율 (setSlow) */
  slowK = 1;
  reviving: { target: Fighter; t: number } | null = null;
  reviveBar?: { frame: Phaser.GameObjects.Image; fill: Phaser.GameObjects.Image };
  bounds = { x0: 12, x1: 436, y0: 50, y1: 282 };
  vin: VirtualInput = { mx: 0, my: 0, attack: false, evade: false, jump: false, skill: false, ult: false, combo: false, interact: false, swap: 0 };
  /** 황제의 명령 (세레나 궁극기)이 끝나는 때 */
  commandUntil = 0;
  /** 바닥의 불길 (민달팽이) */
  fires: { x: number; y: number; r: number; until: number; next: number; owner: Fighter; s: Phaser.GameObjects.Ellipse }[] = [];
  /** 사슬 그림 */
  private chainG?: Phaser.GameObjects.Graphics;
  /** 끝없이 나오는 적: 다음에 채울 때 */
  private endlessCd = 0;
  /** HUD가 읽는 알림 (보여 준 뒤 비움) */
  notices: { kind: 'toast' | 'guide' | 'guideOff' | 'levelup' | 'unlock' | 'word' | 'cutin' | 'ultcut'; text: string; what?: Unlock; ms?: number }[] = [];
  wheelOpen = false;
  /** 기절·게임 오버 규칙을 쓰는지 (체력 0 연출에서는 끔) */
  cutscene = false;
  /** 튜토리얼 진행: 몇 번째 단계, 그 단계에서 몇 번 했는지 */
  tutI = 0;
  tutN = 0;
  tutBlocks = 0;
  finishing = false;

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private attackClick = false;
  /** 맵 위에서 싸우는 중 (전투장 좌표 + ox, oy = 맵 좌표) */
  onMap: ExploreScene | null = null;
  ox = 0;
  oy = 0;
  private lit = false;
  private prevVin: Partial<VirtualInput> = {};
  /** 어두운 맵에서 인물이 들고 다니는 빛 (맵 화면의 빛과 함께 움직인다) */
  private carry: { id: string; light: Phaser.GameObjects.Light; base: number; pulse: boolean } | null = null;

  constructor() {
    super('Battle');
  }

  init(data: BattleStart) {
    this.start = data;
    this.all = [];
    this.party = [];
    this.controlled = null;
    this.projectiles = [];
    this.runes = [];
    this.fires = [];
    this.commandUntil = 0;
    this.endlessCd = 0;
    this.chainG = undefined;
    this.comboPick = -1;
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
    this.slowK = 1;
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    this.reviving = null;
    this.notices = [];
    this.wheelOpen = false;
    this.cutscene = !!data.hpZero;
    this.tutI = 0;
    this.tutN = 0;
    this.tutBlocks = 0;
    this.finishing = false;
    this.vin = { mx: 0, my: 0, attack: false, evade: false, jump: false, skill: false, ult: false, combo: false, interact: false, swap: 0 };
    this.prevVin = {};
    const all = battles as unknown as Record<string, BattleDef>;
    this.bdef = data.hpZero ? all.hpZero : all[data.battle];
    if (!this.bdef) console.error(`[battle] battles.json에 없는 전투: ${data.battle}`);
    // 맵 화면이 떠 있으면 그 맵 위에서 싸운다 (정해 둔 맵과 같을 때, 또는 체력 0 연출)
    const m = data.map;
    this.onMap = m?.currentMap && (data.hpZero || data.at || !this.bdef?.arena.map || this.bdef.arena.map === m.mapId) ? m : null;
    this.lit = false;
    this.carry = null;
  }

  preload() {
    preloadBattle(this);
    if (this.bdef?.arena.map) preloadMapArt(this);
  }

  /** 프롤로그 도트 맵의 arena 구역을 그대로 전투장으로 (벽에 걸린 물건 포함, 밤빛으로 어둡게) */
  private drawMapArena(id: string, tint: number) {
    const md = MAPS[id];
    const ar = md && findObj(md, 'arena', this.bdef?.arena.zone);
    if (!ar) return console.error(`[battle] 맵 ${id}에 arena 구역이 없습니다`);
    makeMapAnims(this);
    const { tm, ts } = makeTilemap(this, id);
    for (const name of ['floor', 'walls']) tm.createLayer(name, ts, -ar.x, -ar.y)?.setDepth(-10);
    for (const o of objectsOf(md)) {
      if (o.type !== 'prop' || !propOf(o, 'wall')) continue;
      const f = footOf(o);
      if (f.x < ar.x - 40 || f.x > ar.x + ar.width + 40 || f.y < ar.y - 120 || f.y > ar.y + ar.height) continue;
      makePropSprite(this, o, -ar.x, -ar.y).setDepth(-9.5);
    }
    // 밤빛: 색을 곱해 어둡게
    this.add.rectangle(-80, -80, ar.width + 160, ar.height + 160, tint).setOrigin(0).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(-9);
  }

  /**
   * 맵 위에서 싸우기: 전투장 = 맵의 arena 구역(체력 0 연출은 레온 둘레). 그림은 맵 화면이 그대로 그리고,
   * 이 장면은 투명한 카메라로 싸우는 인물·이펙트만 그 위에 겹친다. 조명도 맵과 같게
   */
  private setupMap(m: ExploreScene) {
    const md = m.currentMap!;
    const { w, h } = this.bdef.arena;
    const ar = this.start.at ?? (!this.start.hpZero && findObj(md, 'arena', this.bdef?.arena.zone));
    if (ar) {
      this.ox = ar.x;
      this.oy = ar.y;
    } else {
      const l = m.actorInfo(this.start.hpZero?.who ?? 'leon');
      this.ox = Math.round((l?.x ?? w / 2) - w / 2);
      this.oy = Math.round((l?.y ?? h / 2) - h / 2 - 30);
    }
    this.cameras.main.setZoom(ZOOM).setBackgroundColor('rgba(0,0,0,0)');
    this.syncCamera();
    const L = m.lighting();
    this.lit = L.lit;
    if (this.lit) {
      this.lights.enable().setAmbientColor(L.ambient);
      for (const l of L.lights) this.lights.addLight(l.x - this.ox, l.y - this.oy, l.r, l.color, l.intensity);
      const c = m.carrier();
      if (c) this.carry = { id: c.id, light: this.lights.addLight(0, 0, c.r, c.color, c.intensity), base: c.intensity, pulse: c.pulse };
    }
  }

  /** 빛을 든 인물을 따라 빛을 옮긴다 (맵 화면의 바닥 빛도 같이) */
  private updateCarry() {
    const c = this.carry;
    if (!c || !this.onMap) return;
    const f = this.party.find((p) => p.id === c.id && p.alive);
    if (!f) return;
    const x = f.x;
    const y = f.y - 24 - f.z;
    c.light.setPosition(x, y);
    if (c.pulse) {
      const t = this.time.now / 1000;
      c.light.intensity = c.base * (0.75 + 0.25 * Math.max(0, Math.sin(t * 2.4)) ** 3);
    }
    this.onMap.trackCarry(c.id, { x: x + this.ox, y: y + this.oy });
  }

  /** 맵 화면 카메라와 같은 곳을 본다 */
  private syncCamera() {
    const m = this.onMap;
    if (!m) return;
    const c = m.cameras.main;
    this.cameras.main.setScroll(c.scrollX - this.ox, c.scrollY - this.oy);
  }

  /** 맵 인물의 자리 (전투장 좌표) */
  private actorAt(id: string) {
    const a = this.onMap?.actorInfo(id);
    return a ? { x: a.x - this.ox, y: a.y - this.oy, facing: a.facing as Dir } : null;
  }

  /** 전투 전에 흐르던 BGM */
  private prevBgm: string | null = null;

  create() {
    makeBattleAnims(this);
    if (this.bdef.bgm) {
      this.prevBgm = currentLoop('bgm');
      void playLoop(this, 'bgm', this.bdef.bgm);
    }
    // 궁극기 컷인에 쓸 스탠딩 (있는 그림만, 이미 불러온 것은 그대로)
    void loadOptional(this, partyIds().map((id) => ({ key: `${id}_body`, url: `assets/portraits/${id}_body.png` })));
    const { w, h, tint } = this.bdef.arena;
    this.bounds = { x0: 12, x1: w - 12, y0: 50, y1: h - 6 };
    const cam = this.cameras.main;
    if (this.onMap) this.setupMap(this.onMap);
    else {
      cam.setZoom(ZOOM).centerOn(w / 2, h / 2 - 10).setBackgroundColor('#08070c');
      cam.fadeIn(350, 0, 0, 0);
    }

    // 전투장: 돌바닥 + 위쪽 벽 (terrain 타일)
    const t = Phaser.Display.Color.HexStringToColor(tint).color;
    if (this.onMap) {
      // 바닥은 맵 화면이 그린다
    } else if (this.bdef.arena.map) this.drawMapArena(this.bdef.arena.map, t);
    else {
      this.add.tileSprite(0, 0, w, h, 'terrain_tiles', 4).setOrigin(0).setTint(t).setDepth(-10);
      this.add.tileSprite(0, -32, w, 32, 'terrain_tiles', 7).setOrigin(0).setTint(t).setDepth(-9);
      this.add.tileSprite(0, 0, w, 40, 'terrain_tiles', 8).setOrigin(0).setTint(t).setDepth(-9);
    }
    if (!this.onMap) this.add.rectangle(0, h, w, 6, 0x000000, 0.6).setOrigin(0).setDepth(-9);

    if (this.start.hpZero) this.setupHpZero();
    else this.setupBattle();

    // 입력
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,SHIFT,SPACE,E,Q,R,F,ONE,TWO,THREE,FOUR,UP,DOWN,LEFT,RIGHT,F6,F7,F8,F9,F10') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('SPACE,SHIFT,F6,F7,F8,F9,F10');
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.ended || this.cutscene) return;
      // 공격은 캐릭터가 바라보는 쪽(정면)으로 나간다. 클릭 위치는 상관없음
      if (p.leftButtonDown() || p.wasTouch) this.attackClick = true;
    });

    this.scene.launch('BattleHUD', { battle: this });
    if (this.bdef.comboFull) this.comboGauge = 100;
    else if (this.bdef.comboStart) this.comboGauge = this.bdef.comboStart;
    const touch = window.matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');
    const guide = (touch && this.bdef.guideTouch) || this.bdef.guide || '';
    if (this.bdef.tutorial?.length) this.tutShow();
    else this.notices.push({ kind: 'guide', text: guide, ms: this.bdef.guideUntil ? 600000 : 6000 });
    // 동료와 처음 함께 싸울 때: 교체 안내 (전투 안내가 있으면 그 뒤에)
    if (this.party.length >= 2 && !this.cutscene) {
      if (guide && !this.bdef.guideUntil) this.time.delayedCall(6800, () => this.onceGuide('tut:swap', TUT_SWAP));
      else if (!guide) this.onceGuide('tut:swap', TUT_SWAP);
    }
  }

  /** 처음 한 번만 보여 주는 안내 (저장의 once에 기록) */
  private onceGuide(key: string, text: string, ms = 6000) {
    const once = gameState.progress.once;
    if (once.includes(key) || this.ended) return;
    once.push(key);
    this.notices.push({ kind: 'guide', text, ms });
  }

  // ---- 튜토리얼 ----

  /** 지금 단계의 목표 (튜토리얼이 없거나 끝났으면 free) */
  get tutGoal(): TutStep['goal'] {
    return this.bdef.tutorial?.[this.tutI]?.goal ?? 'free';
  }

  get tutorialDone() {
    const t = this.bdef.tutorial;
    return !t || this.tutI >= t.length - 1;
  }

  private tutShow() {
    const st = this.bdef.tutorial?.[this.tutI];
    if (!st) return;
    const c = st.count ?? 1;
    const text = st.goal === 'free' ? st.text : c > 1 ? `${st.text}  (${this.tutN}/${c})` : st.text;
    this.notices.push({ kind: 'guide', text, ms: st.goal === 'free' ? 5000 : 600000 });
  }

  /** 튜토리얼 목표를 한 번 해냄. 지금 단계의 목표였으면 true */
  private tutEvent(goal: TutStep['goal']) {
    const st = this.bdef.tutorial?.[this.tutI];
    if (!st || this.ended) return false;
    if (goal === 'block' && st.skipAfterBlocks && ++this.tutBlocks >= st.skipAfterBlocks && st.goal !== 'block') {
      this.notices.push({ kind: 'toast', text: '괜찮습니다. 튕겨 내기는 싸우면서 익혀도 됩니다' });
      this.tutNext();
      return true;
    }
    if (st.goal !== goal) return false;
    this.tutN++;
    if (this.tutN >= (st.count ?? 1)) {
      this.notices.push({ kind: 'toast', text: goal === 'parry' ? '튕겨 냈습니다!' : '좋습니다!' });
      this.tutNext();
    } else this.tutShow();
    return true;
  }

  private tutNext() {
    this.tutI++;
    this.tutN = 0;
    this.tutBlocks = 0;
    this.time.delayedCall(700, () => this.tutShow());
  }

  // ---------------------------------------------------------------
  // 준비
  // ---------------------------------------------------------------

  private setupBattle() {
    const b = this.bdef;
    // current = 파티 선택 화면에서 고른 출전 파티 (+ 반드시 출전하는 인물)
    let ids = b.party === 'current' ? activeParty() : b.party ?? ['leon'];
    if (b.party === 'current') for (const id of b.force ?? []) if (gameState.progress.party.includes(id) && !ids.includes(id)) ids = [...ids, id];
    for (const id of ids) {
      // 맵 위에서는 서 있던 자리에서 그대로
      const at = this.actorAt(id);
      const pos = at ? [at.x, at.y] : b.start?.[id] ?? [b.arena.w / 2, b.arena.h / 2];
      const f = this.makePartyFighter(id, pos[0], pos[1]);
      if (!f) continue;
      if (at) this.takeActor(f, id, at.facing);
      this.party.push(f);
    }
    this.controlled = this.party[0] ?? null;
    for (const a of b.allies ?? []) {
      const d = (fighters.npc as Record<string, FighterDef>)[a.id];
      if (!d) continue;
      const f = new Fighter(a.id, a.id, 'ally', d);
      Object.assign(f, { hp: d.hp, maxHp: d.hp, atk: d.atk, defense: d.def, speed: d.speed });
      f.vital = !!a.vital;
      f.blockLight = !!a.blockLight;
      const at = this.actorAt(a.actor ?? a.id);
      this.spawn(f, at?.x ?? a.x, at?.y ?? a.y);
      if (at) this.takeActor(f, a.actor ?? a.id, at.facing);
      // 전투장 밖에 서 있었으면 안으로 걸어 들어온다
      const bd = this.bounds;
      if (f.x < bd.x0 || f.x > bd.x1 || f.y < bd.y0 || f.y > bd.y1) {
        const tx = Phaser.Math.Clamp(f.x, bd.x0 + 8, bd.x1 - 8);
        const ty = Phaser.Math.Clamp(f.y, bd.y0 + 8, bd.y1 - 8);
        const ms = Math.max(300, (Math.hypot(tx - f.x, ty - f.y) / Math.max(40, f.speed)) * 1000);
        f.walkUntil = this.now + ms;
        f.facing = dirOf(tx - f.x, ty - f.y);
        this.tweens.add({ targets: f, x: tx, y: ty, duration: ms });
      }
    }
    if (b.protect) this.spawnProtect(b.protect);
    this.spawnWave(0);
    if (b.endless) this.fillEndless();
    // 4막 karg_heated: 게이지를 가득 채운 채 시작
    const gf = b.gaugeFull;
    if (gf && gameState.getFlag(gf.flag)) {
      const f = this.party.find((p) => p.id === gf.who);
      if (f) f.gauge = 100;
    }
    const fg = b.firstGuide;
    if (fg && this.party.some((p) => p.id === fg.who)) this.time.delayedCall(400, () => this.onceGuide(fg.key, fg.text, 9000));
  }

  /** 끝없이 나오는 적: 정한 수보다 적으면 전투장 가장자리에서 채운다 */
  private fillEndless() {
    const b = this.bounds;
    for (const s of this.bdef.endless ?? []) {
      if (this.elapsed < (s.after ?? 0) * 1000) continue;
      const have = this.all.filter((f) => f.team === 'enemy' && f.alive && f.id === s.enemy).length;
      for (let i = have; i < s.keep; i++) {
        const side = Math.random();
        const x = side < 0.5 ? (Math.random() < 0.5 ? b.x0 + 24 : b.x1 - 24) : b.x0 + 24 + Math.random() * (b.x1 - b.x0 - 48);
        const y = side < 0.5 ? b.y0 + 20 + Math.random() * (b.y1 - b.y0 - 40) : Math.random() < 0.5 ? b.y0 + 16 : b.y1 - 12;
        const at = this.freeSpot(x, y);
        this.pendingSpawns++;
        this.time.delayedCall(300 + i * 200, () => {
          this.pendingSpawns--;
          if (!this.ended) this.spawnEnemy(s.enemy, at.x, at.y);
        });
      }
    }
  }

  /** 지켜야 하는 대상을 세운다 */
  private spawnProtect(p: ProtectDef) {
    const d: FighterDef = { name: p.name, speed: p.speed ?? 50, hp: p.hp, atk: 0, def: p.def ?? 0 };
    const f = new Fighter(p.id, p.sprite ?? p.id, 'ally', d);
    Object.assign(f, { hp: p.hp, maxHp: p.hp, atk: 0, defense: p.def ?? 0, speed: d.speed });
    f.protect = p;
    f.radius = p.radius ?? 0;
    let x = p.x ?? this.bdef.arena.w / 2;
    let y = p.y ?? this.bdef.arena.h / 2;
    const mapId = this.onMap?.mapId ?? this.bdef.arena.map;
    const md = mapId ? MAPS[mapId] : undefined;
    const ar = md && findObj(md, 'arena', this.bdef?.arena.zone);
    const o = p.prop && md ? objectsOf(md).find((k) => k.type === 'prop' && k.name === p.prop) : undefined;
    if (o && ar) {
      const ft = footOf(o);
      x = ft.x - ar.x;
      y = ft.y - ar.y;
    }
    const at = p.follow ? null : this.actorAt(p.id);
    if (at) {
      x = at.x;
      y = at.y;
    }
    f.x = x;
    f.y = y;
    f.shadow = this.add.sprite(x, y + 1, 'fx_jump_shadow', 0).setOrigin(0.5, 0.5).setVisible(false);
    const key = p.sprite && this.textures.exists(p.sprite) ? p.sprite : '';
    f.sprite = key ? this.add.sprite(x, y, key, 0).setOrigin(0.5, 1) : this.add.sprite(x, y, '__DEFAULT').setVisible(false);
    if (key && p.follow) f.shadow.setVisible(true);
    if (this.lit && key) f.sprite.setPipeline('Light2D');
    if (at) this.takeActor(f, p.id, at.facing);
    if (p.ring) {
      const c = Phaser.Display.Color.HexStringToColor(p.ring).color;
      const ring = this.add.ellipse(x, y, 52, 26).setStrokeStyle(2, c, 0.9).setFillStyle(c, 0.18).setDepth(-3);
      this.tweens.add({ targets: ring, alpha: 0.55, duration: 900, yoyo: true, repeat: -1 });
      if (this.lit) ring.setPipeline('Light2D');
    }
    if (p.crack && this.textures.exists(p.crack)) {
      f.crack = this.add.sprite(x, y, p.crack, 0).setOrigin(0.5, 1).setDepth(y + 0.5).setVisible(false);
      if (this.lit) f.crack.setPipeline('Light2D');
    }
    f.hpBar = {
      frame: this.add.image(x, y, 'ui_bar_enemy').setOrigin(0.5, 0),
      fill: this.add.image(x, y, 'ui_fill_green_2').setOrigin(0, 0),
    };
    this.all.push(f);
  }

  /** 지켜야 하는 대상 (HUD가 체력바를 그린다) */
  get protectTarget() {
    return this.all.find((f) => f.protect) ?? null;
  }

  /** 체력바를 따로 보이는 NPC 아군 (HUD가 그린다) */
  get vitalAlly() {
    return this.all.find((f) => f.vital) ?? null;
  }

  /** 적이 노릴 인물: 지켜야 하는 대상이 먼저. 방금 자기를 때린 인물이 가까이 있으면 그쪽 */
  private targetOf(e: Fighter) {
    const list = this.all.filter((t) => t.targetable && t.team !== 'enemy');
    if (!list.length) return null;
    const near = (a: Fighter, b: Fighter) => (Math.hypot(a.x - e.x, a.y - e.y) - a.radius < Math.hypot(b.x - e.x, b.y - e.y) - b.radius ? a : b);
    const taunt = list.find((t) => this.now < t.tauntUntil && Math.hypot(t.x - e.x, t.y - e.y) <= (t.def.skill?.radius ?? 90));
    if (taunt) return taunt;
    const pr = list.find((t) => t.protect);
    if (!pr) return list.reduce(near);
    const h = e.lastHitBy;
    if (h && h.targetable && this.now - e.lastHitAt < 2500 && Math.hypot(h.x - e.x, h.y - e.y) < 70) return h;
    return pr;
  }

  /** 지켜야 하는 대상: 따라다니는 NPC면 그 파티원 뒤를 따라 걷는다 */
  private updateProtect(f: Fighter, dt: number) {
    const p = f.protect!;
    if (f.state === 'hurt') {
      f.stateT += dt;
      if (f.stateT > 260) f.state = 'idle';
      return;
    }
    if (!p.follow) return void (f.state = 'idle');
    const lead = this.party.find((x) => x.id === p.follow && x.state !== 'fainted') ?? this.controlled;
    if (!lead) return;
    const dx = lead.x - f.x;
    const dy = lead.y - f.y;
    const d = Math.hypot(dx, dy);
    if (d > 34) {
      f.state = 'move';
      f.facing = dirOf(dx, dy);
      this.moveBy(f, (dx / d) * f.speed * (dt / 1000), (dy / d) * f.speed * (dt / 1000));
    } else f.state = 'idle';
  }

  /** 지켜야 하는 대상 그리기: 그림이 있으면 걷기, 반 아래면 금 간 모습 */
  private renderProtect(f: Fighter) {
    const s = f.sprite;
    if (s.visible) {
      s.setPosition(Math.round(f.x), Math.round(f.y)).setDepth(f.y);
      f.shadow.setPosition(Math.round(f.x), Math.round(f.y)).setDepth(-4);
      const k = f.spriteKey;
      if (f.protect?.follow && this.anims.exists(`${k}-walk-${f.facing}`)) {
        if (f.state === 'move') s.play(`${k}-walk-${f.facing}`, true);
        else s.stop().setFrame(DIRS.indexOf(f.facing) * 5);
      }
      s.setTint(f.state === 'hurt' ? 0xffb0a0 : 0xffffff);
    }
    f.crack?.setPosition(Math.round(f.x), Math.round(f.y)).setVisible(f.hp < f.maxHp * 0.5);
    if (f.hpBar) {
      const top = Math.round(f.y - Math.max(44, (f.crack?.height ?? s.height ?? 0) + 8));
      f.hpBar.frame.setPosition(Math.round(f.x), top).setDepth(10000).setVisible(true);
      f.hpBar.fill.setPosition(Math.round(f.x) - 10, top + 1).setCrop(0, 0, Math.max(0, Math.round((20 * f.hp) / f.maxHp)), 2).setDepth(10001).setVisible(true);
    }
  }

  /** 맵 인물을 숨기고 이 전투 인물이 대신 싸운다 */
  private takeActor(f: Fighter, actorId: string, facing: Dir) {
    f.actorId = actorId;
    f.facing = facing;
    f.aimX = dirVec(facing)[0];
    f.aimY = dirVec(facing)[1];
    this.onMap?.hideActor(actorId, true);
  }

  private makePartyFighter(id: string, x: number, y: number) {
    const d = (fighters.party as Record<string, FighterDef>)[id];
    if (!d) return null;
    const st = statsOf(id)!;
    // 대본의 costume으로 바뀐 겉모습 (그림이 없으면 기본)
    const c = gameState.progress.costume[id];
    const f = new Fighter(id, c && this.textures.exists(c) && this.textures.exists(`bt_${c}`) ? c : id, 'party', d);
    Object.assign(f, { hp: st.hp, maxHp: st.hp, atk: st.atk, defense: st.def, speed: d.speed, stamina: d.stamina ?? 100, maxStamina: d.stamina ?? 100 });
    f.facing = 'right';
    f.aimX = 1;
    f.aimY = 0;
    this.spawn(f, x, y);
    return f;
  }

  private spawnEnemy(key: string, x: number, y: number, quiet = false) {
    const e = (enemies as unknown as Record<string, EnemyDef>)[key];
    if (!e) return console.warn(`[battle] enemies.json에 없는 적: ${key}`);
    const d: FighterDef = {
      name: e.name,
      speed: e.speed,
      hp: e.hp,
      atk: e.atk,
      def: e.def,
      attack: e.attack
        ? {
            chainWindow: 0,
            hits: Array.from({ length: e.attack.hits ?? 1 }, (_, i) => ({
              mult: e.attack!.mult, range: e.attack!.range, arc: 110, windup: i ? Math.round(e.attack!.windup * 0.5) : e.attack!.windup, active: 60,
              recover: e.attack!.recover, step: 4, fx: e.attack!.fx === 'hit' ? '' : e.attack!.fx, cols: i % 2 ? [2, 3] : [0, 1],
            })),
          }
        : undefined,
    };
    const f = new Fighter(key, e.sprite, 'enemy', d, e);
    const hurry = this.bdef?.hurry;
    const fast = hurry && gameState.getFlag(hurry.flag) ? hurry.speed : 1;
    Object.assign(f, { hp: e.hp, maxHp: e.hp, atk: e.atk, defense: e.def, speed: e.speed * fast });
    f.aiCd = 600 + Math.random() * 600;
    f.bindCd = (e.bind?.cooldown ?? 0) * (0.4 + Math.random() * 0.4);
    f.poolCd = e.pools?.every ?? 0;
    this.spawn(f, x, y);
    if (e.barrier) {
      f.barrierHp = e.barrier.hp;
      f.barrierFx = this.add.ellipse(x, y - BODY, 46, 52).setStrokeStyle(2, 0xb48cff, 0.9).setFillStyle(0x8a5cff, 0.16);
      this.tweens.add({ targets: f.barrierFx, alpha: 0.6, duration: 700, yoyo: true, repeat: -1 });
    }
    // 모래 괴물은 모래 속에서 시작
    if (e.burrow) {
      f.dived = true;
      if (!quiet) this.fx('dust_land', x, y - 4, { depth: y + 1 });
      return f;
    }
    // 나타날 때 빛 (맵에 서 있던 인물이 그대로 싸우면 없음)
    if (!quiet) this.fx('gnosis_vanish', x, y - BODY, { depth: y + 1, alpha: 0.8 });
    return f;
  }

  private spawn(f: Fighter, x: number, y: number) {
    f.x = x;
    f.y = y;
    f.shadow = this.add.sprite(x, y + 1, 'fx_jump_shadow', 0).setOrigin(0.5, 0.5);
    // 걷기 그림이 없는 적(수로의 괴물)은 전투 그림으로
    f.sprite = this.textures.exists(f.spriteKey)
      ? this.add.sprite(x, y, f.spriteKey, DIRS.indexOf(f.facing) * 5).setOrigin(0.5, 1)
      : this.add.sprite(x, y, `bt_${f.spriteKey}`, DIRS.indexOf(f.facing) * 12).setOrigin(0.5, 1);
    if (this.lit) {
      f.sprite.setPipeline('Light2D');
      // 어두운 곳의 보스는 희미한 빛을 받아 보이게 (물빛)
      if (f.enemy?.boss) f.light = this.lights.addLight(x, y - 44, 120, 0x7a9ac0, 1.1);
    }
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
    wave.forEach((s, k) => {
      // 맵에 서 있던 인물: 바로 그 자리에서 싸운다
      const at = s.actor ? this.actorAt(s.actor) : null;
      if (at) {
        const e = this.spawnEnemy(s.enemy, at.x, at.y, true);
        if (!e) return;
        this.takeActor(e, s.actor!, at.facing);
        // 전투장 밖에 서 있었으면 정해 둔 자리(없으면 가장자리)까지 걸어 들어온다
        const b = this.bounds;
        const out = at.x < b.x0 || at.x > b.x1 || at.y < b.y0 || at.y > b.y1;
        if (out) {
          const tx = Phaser.Math.Clamp(s.x ?? at.x, b.x0 + 8, b.x1 - 8);
          const ty = Phaser.Math.Clamp(s.y ?? at.y, b.y0 + 8, b.y1 - 8);
          const ms = Math.max(300, (Math.hypot(tx - at.x, ty - at.y) / Math.max(40, e.speed)) * 1000);
          e.walkUntil = this.now + ms;
          e.facing = dirOf(tx - at.x, ty - at.y);
          this.tweens.add({ targets: e, x: tx, y: ty, duration: ms });
        }
        return;
      }
      this.pendingSpawns++;
      let x = s.x ?? this.bdef.arena.w / 2;
      let y = s.y ?? this.bdef.arena.h / 2;
      // 필드 몹: 몹이 있던 자리 둘레, 레온 반대쪽으로 부채꼴
      const fp = this.start.field && this.onMap ? { x: this.start.field.x - this.ox, y: this.start.field.y - this.oy } : null;
      if (fp) {
        const l = this.party[0];
        const base = l ? Math.atan2(fp.y - l.y, fp.x - l.x) : 0;
        const a0 = base + (k - (wave.length - 1) / 2) * 0.75;
        // 막힌 쪽이면 각도를 조금씩 돌려 가며 빈자리를 찾는다 (레온 바로 옆은 피함)
        let found = false;
        for (let i = 0; i < 12 && !found; i++) {
          const a = a0 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.35;
          for (const r of [44, 60, 30]) {
            const px = fp.x + Math.cos(a) * r;
            const py = fp.y + Math.sin(a) * r;
            if (l && Math.hypot(px - l.x, py - l.y) < 36) continue;
            if (this.isFree(px, py)) {
              x = px;
              y = py;
              found = true;
              break;
            }
          }
        }
        if (!found) {
          x = fp.x + Math.cos(a0) * 44;
          y = fp.y + Math.sin(a0) * 44;
        }
      }
      ({ x, y } = this.freeSpot(x, y));
      this.time.delayedCall(400 + k * 220, () => {
        this.pendingSpawns--;
        if (!this.ended) this.spawnEnemy(s.enemy, x, y);
      });
    });
  }

  /** 맵 위 전투에서 (x, y)가 벽·물에 막혔으면 전투장 안의 가장 가까운 빈자리로 */
  private isFree(x: number, y: number) {
    const b = this.bounds;
    return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && !this.onMap?.solidAt(x + this.ox, y + this.oy);
  }

  private freeSpot(x: number, y: number) {
    const ok = (px: number, py: number) => this.isFree(px, py);
    if (!this.onMap || ok(x, y)) return { x, y };
    for (let r = 8; r <= 200; r += 8)
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (ok(px, py)) return { x: px, y: py };
      }
    return { x, y };
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
    // 맵 위라면 레온이 서 있던 자리, 맵에 있던 그 병사들이 그대로 덤빈다
    const me = this.actorAt(who);
    if (me) {
      f.x = me.x;
      f.y = me.y;
      this.takeActor(f, who, 'down');
    }
    const onMapIds = this.onMap?.actorsOf(by) ?? [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.4;
      const at = onMapIds[i] ? this.actorAt(onMapIds[i]) : null;
      const e = at ? this.spawnEnemy(by, at.x, at.y, true) : this.spawnEnemy(by, f.x + Math.cos(a) * 64, f.y + Math.sin(a) * 40);
      if (!e) continue;
      if (at) this.takeActor(e, onMapIds[i], at.facing);
      e.facing = dirOf(f.x - e.x, f.y - e.y);
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
    // 먼저 레온 바로 곁까지 걸어와 둘러싼 뒤 차례로 찌른다
    let longest = 0;
    attackers.forEach((e, i) => {
      const a = (i / attackers.length) * Math.PI * 2 + Math.PI / 4;
      const tx = f.x + Math.cos(a) * 26;
      const ty = f.y + Math.sin(a) * 16;
      const ms = Math.max(200, (Math.hypot(tx - e.x, ty - e.y) / 110) * 1000);
      longest = Math.max(longest, ms);
      e.state = 'move';
      e.facing = dirOf(tx - e.x, ty - e.y);
      this.tweens.add({
        targets: e, x: tx, y: ty, duration: ms,
        onComplete: () => {
          e.state = 'idle';
          e.facing = dirOf(f.x - e.x, f.y - e.y);
        },
      });
    });
    this.time.delayedCall(600 + longest, strikeNext);
  }

  // ---------------------------------------------------------------
  // 매 프레임
  // ---------------------------------------------------------------

  update(_t: number, rawDelta: number) {
    const dt = Math.min(50, rawDelta) * this.timeScale;
    if (this.frozen) {
      this.syncCamera();
      return this.renderAll();
    }
    this.now += dt;
    if (!this.cutscene && !this.ended) {
      this.elapsed += dt;
      this.readInput(dt);
      this.devKeys();
    }
    for (const f of this.all) this.updateFighter(f, dt);
    this.updateProjectiles(dt);
    this.updateRunes();
    this.updateFires();
    this.drawChains();
    this.separate();
    if (!this.cutscene && !this.ended) this.checkOutcome();
    this.updateCarry();
    this.renderAll();
    this.syncCamera();
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
    if (!f || f.state === 'fainted' || f.boundBy) return;

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
      if (len > 0) {
        f.facing = dirOf(mx, my);
        [f.aimX, f.aimY] = dirVec(f.facing);
      }
      return;
    }

    if (press.jump) this.tryJump(f);
    if (press.skill) this.tryMove(f, 'skill');
    if (press.ult) this.tryMove(f, 'ult');

    if (press.attack) this.requestAttack(f);

    // 점프 중에는 땅보다 느리게 움직인다 (점프 거리)
    const sp = f.speed * (f.z > 0 ? AIR_SPEED : 1) * (this.now < this.commandUntil ? COMMAND.speed : 1) * (dt / 1000);
    if (f.state === 'idle' || f.state === 'move') {
      if (len > 0.1) {
        f.state = 'move';
        f.facing = dirOf(mx, my);
        [f.aimX, f.aimY] = dirVec(f.facing); // 공격·기술은 바라보는 쪽(정면)으로
        this.moveBy(f, mx * sp, my * sp);
      } else f.state = 'idle';
    } else if (f.z > 0 && len > 0.1 && f.state !== 'attack') this.moveBy(f, mx * sp, my * sp);
  }

  /** 개발용 단축키: F6 적 전멸, F7 NPC 아군 쓰러뜨리기(쓰러지면 결과가 있는 아군, 없으면 브람), F8 시간 끝, F9 파티 전멸, F10 지켜야 할 것 무너뜨리기 */
  private devKeys() {
    if (!import.meta.env.DEV) return;
    const k = this.keys;
    if (Phaser.Input.Keyboard.JustDown(k.F6)) {
      for (const e of this.all.filter((x) => x.team === 'enemy' && x.alive)) this.kill(e, this.controlled);
      this.waveIdx = (this.bdef.waves?.length ?? 1) - 1;
    }
    if (Phaser.Input.Keyboard.JustDown(k.F7)) {
      const b = this.all.find((x) => x.team === 'ally' && !x.protect && this.bdef.outcomes?.[`fall:${x.id}`]) ?? this.all.find((x) => x.id === 'bram');
      if (b) this.damage(b, null, 9999, { raw: true });
    }
    if (Phaser.Input.Keyboard.JustDown(k.F8)) this.elapsed = (this.bdef.timeLimit ?? this.bdef.survive ?? 0) * 1000 + 1;
    if (Phaser.Input.Keyboard.JustDown(k.F9)) for (const p of this.party) this.damage(p, null, 99999, { raw: true });
    if (Phaser.Input.Keyboard.JustDown(k.F10)) {
      const pr = this.protectTarget;
      if (pr) this.damage(pr, null, 99999, { raw: true });
    }
  }

  private lockedToast(what: Unlock, label: string) {
    this.notices.push({ kind: 'toast', text: `🔒 ${label}은(는) 아직 열리지 않았습니다`, what });
  }

  private tryEvade(f: Fighter) {
    if (!isUnlocked(f.id, 'evade')) return this.lockedToast('evade', '회피');
    const ev = f.def.evade;
    if (!ev) return;
    if (ev.type === 'blink') return this.blink(f);
    if (ev.type === 'dash') return this.dash(f);
    if (ev.type === 'brace') return this.brace(f);
    if (ev.type === 'step') return this.step(f);
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

  /** 버티기 (갈리아): 잠깐 그 자리에서 밀려나지 않고 받는 피해를 줄임. 움직일 수 없음 */
  private brace(f: Fighter) {
    if (this.now < f.guardCd || !this.canAct(f)) return;
    f.state = 'skill';
    f.move = 'brace';
    f.stateT = 0;
    f.hitDone = false;
    f.combo = -1;
    f.moveHit.clear();
  }

  /** 물러서기 (세레나): 뒤로 짧게 물러나며 앞의 적을 밀어냄. 잠깐 맞지 않음 [임시 수치] */
  private step(f: Fighter) {
    if (this.now < f.guardCd || f.airborne) return;
    if (f.state !== 'idle' && f.state !== 'move' && f.state !== 'attack') return;
    const ev = f.def.evade!;
    f.guardCd = this.now + (ev.cooldown ?? 4000);
    const [vx, vy] = dirVec(f.facing);
    for (const e of this.foesOf(f)) {
      const dx = e.x - f.x;
      const dy = e.y - f.y;
      const d = Math.hypot(dx, dy);
      if (d > 46 || dx * vx + dy * vy < -4) continue;
      this.damage(e, f, f.atk * 0.5, { push: 22 });
      // 10레벨: 밀어낸 적이 잠깐 멈춤
      if (this.bonus(f, 10, 'serena') && e.alive && !e.enemy?.boss && e.state !== 'cast') {
        e.state = 'stagger';
        e.stunUntil = this.now + 800;
      }
    }
    this.fx(ev.fx ?? 'serena_step', f.x, f.y - BODY, { angle: Math.atan2(vy, vx), depth: f.y + 2, flipY: vx < -0.01 });
    for (let i = 0; i < 9; i++) this.moveBy(f, -vx * 4, -vy * 4);
    f.invulnUntil = this.now + 250;
    f.state = 'idle';
    f.combo = -1;
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

  /** 순간이동 (엘리시아): 바라보는 쪽으로 짧게. 잠깐 맞지 않음 */
  private blink(f: Fighter) {
    if (this.now < f.guardCd || f.airborne) return;
    if (f.state !== 'idle' && f.state !== 'move' && f.state !== 'attack') return;
    f.guardCd = this.now + (f.def.evade?.cooldown ?? 4000);
    const [vx, vy] = dirVec(f.facing);
    this.fx('elysia_blink', f.x, f.y - BODY, { depth: f.y + 2 });
    const from = { x: f.x, y: f.y };
    // 조금씩 옮겨 벽에서 멈추게
    for (let i = 0; i < 16; i++) this.moveBy(f, vx * 4, vy * 4);
    if (this.bonus(f, 10, 'elysia')) {
      // 10레벨: 떠난 자리에 룬이 터진다
      this.time.delayedCall(120, () => {
        this.fx('elysia_rune', from.x, from.y, { depth: from.y - 1, scale: 0.6 });
        this.fx('elysia_bolt_hit', from.x, from.y - BODY, { depth: from.y + 5, scale: 1.6 });
        for (const e of this.foesOf(f)) if (Math.hypot(e.x - from.x, e.y - from.y) < 34 + e.radius) this.damage(e, f, f.atk * 0.9, { push: 8, from });
      });
    }
    this.fx('elysia_blink', f.x, f.y - BODY, { depth: f.y + 2 });
    f.invulnUntil = this.now + 250;
    f.state = 'idle';
    f.combo = -1;
    this.overloadUse(f, 'blink');
  }

  /** 대시 (카르크): 바라보는 쪽으로 빠르게. charges번까지 연달아, 쓴 것은 하나씩 cooldown 뒤에 다시 참. 잠깐 맞지 않음 */
  private dash(f: Fighter) {
    const ev = f.def.evade!;
    if (f.airborne || (f.state !== 'idle' && f.state !== 'move' && f.state !== 'attack')) return;
    f.dashUsed = f.dashUsed.filter((t) => this.now - t < (ev.cooldown ?? 3000));
    if (f.dashUsed.length >= (ev.charges ?? 1)) return;
    f.dashUsed.push(this.now);
    const [vx, vy] = dirVec(f.facing);
    const from = { x: f.x, y: f.y };
    for (let i = 0; i < 14; i++) this.moveBy(f, vx * 4, vy * 4);
    if (this.bonus(f, 10, 'karg')) {
      // 10레벨: 지나간 길 위의 적을 벤다
      const lx = f.x - from.x;
      const ly = f.y - from.y;
      const l2 = lx * lx + ly * ly || 1;
      for (const e of this.foesOf(f)) {
        const k = Phaser.Math.Clamp(((e.x - from.x) * lx + (e.y - from.y) * ly) / l2, 0, 1);
        if (Math.hypot(e.x - (from.x + lx * k), e.y - (from.y + ly * k)) < 12 + e.radius) this.damage(e, f, f.atk * 0.7, { push: 6, from });
      }
    }
    const ang = Math.atan2(vy, vx);
    this.fx(ev.fx ?? 'karg_dash', f.x, f.y - BODY, { angle: ang, depth: f.y + 2, flipY: Math.cos(ang) < -0.01 });
    f.invulnUntil = this.now + 200;
    f.state = 'idle';
    f.combo = -1;
  }

  /** 각성 (늑대의 피): ms 동안 빠르기 1.35배, 공격 1.5배, 모든 공격이 막기·방패를 찢음 */
  private startBuff(f: Fighter, ms: number) {
    if (this.now >= f.buffUntil) f.baseSpeed = f.speed;
    f.speed = f.baseSpeed * 1.35;
    f.buffUntil = this.now + ms;
    f.buffFx?.destroy();
    f.buffFx = this.fx(f.def.ult?.fx ?? 'karg_frenzy', f.x, f.y - BODY, { loop: true, depth: f.y + 1, alpha: 0.85 });
  }

  private endBuff(f: Fighter) {
    f.speed = f.baseSpeed;
    f.buffUntil = 0;
    f.buffFx?.destroy();
    f.buffFx = undefined;
  }

  /** 과부하: 마법을 쓸 때마다 오르고, 가득 찬 채로 쓰면 체력이 깎인다 (1 아래로는 안 내려감) */
  private overloadUse(f: Fighter, what: 'bolt' | 'blink' | 'skill') {
    const o = f.def.gauge?.overload;
    if (!o) return;
    if (f.gauge < 100) return this.addGauge(f, o[what]);
    const cost = Math.max(1, Math.round(f.maxHp * o.hpCost));
    if (f.hp <= 1) return;
    const n = Math.min(cost, f.hp - 1);
    f.hp -= n;
    this.damageNumber(f, n, true);
  }

  private canAct(f: Fighter) {
    return (f.state === 'idle' || f.state === 'move') && !f.airborne;
  }

  private tryMove(f: Fighter, which: 'skill' | 'ult') {
    const what: Unlock = which;
    const label = which === 'skill' ? '스킬' : '궁극기';
    const me = f === this.controlled;
    if (!isUnlocked(f.id, what)) return me && this.lockedToast(what, label);
    const m = f.def[which];
    const kind = MOVES[`${f.id}:${which}`];
    if (!m || !kind) return me && this.notices.push({ kind: 'toast', text: `${m?.name ?? label}: 아직 준비 중인 기술입니다` });
    if (!this.canAct(f)) return;
    if (which === 'skill' && this.now < f.skillCd) {
      return me && this.notices.push({ kind: 'toast', text: `${m.name}: ${Math.ceil((f.skillCd - this.now) / 1000)}초 뒤에 다시 쓸 수 있습니다` });
    }
    if (which === 'ult' && f.gauge < 100) {
      return me && this.notices.push({ kind: 'toast', text: `${m.name}: ${f.def.gauge?.name ?? '게이지'}이(가) 가득 차야 쓸 수 있습니다` });
    }
    if (which === 'skill') {
      f.skillCd = this.now + (m.cooldown ?? 8000) * (this.now < this.commandUntil ? COMMAND.cooldown : 1);
      if (me && this.bdef.guideUntil === 'skill') this.notices.push({ kind: 'guideOff', text: '' });
    } else {
      f.gauge = 0;
      // 궁극기 컷인 0.5초 (설정에서 끌 수 있음). 그동안 전투는 멈춘다. 스탠딩 그림이 없는 인물은 컷인 없이 바로
      if (save.settings.ultCutin && hasCutin(this, f.id) && !this.frozen) {
        this.frozen = true;
        this.notices.push({ kind: 'ultcut', text: `${f.id},${m.name}` });
        this.time.delayedCall(500, () => (this.frozen = false));
      }
    }
    if (me) [f.aimX, f.aimY] = dirVec(f.facing);
    f.state = 'skill';
    f.move = kind;
    f.stateT = 0;
    f.hitDone = false;
    f.combo = -1;
    f.moveStep = 0;
    f.moveHit.clear();
    if (kind === 'rune') this.overloadUse(f, 'skill');
  }

  private endMove(f: Fighter) {
    f.move = '';
    if (f.state === 'skill') f.state = 'idle';
  }

  /** 스킬·궁극기 진행 */
  private updateMove(f: Fighter, dt: number) {
    f.stateT += dt;
    const t = f.stateT;
    const ang = Math.atan2(f.aimY, f.aimX);
    switch (f.move) {
      case 'thrust': {
        // 오러 찌르기: 앞으로 돌진하며 지나가는 적을 모두 찌름. 막기를 무너뜨림
        const WIND = 80;
        const DASH = 200;
        if (t < WIND) return void (f.moveCol = 4);
        if (!f.hitDone) {
          f.hitDone = true;
          this.fx('leon_thrust', f.x, f.y - BODY, { angle: ang, depth: f.y + (f.aimY < -0.5 ? -1 : 2), flipY: Math.cos(ang) < -0.01 });
        }
        f.moveCol = 5;
        if (t < WIND + DASH) {
          const sp = 330 * (dt / 1000);
          this.moveBy(f, f.aimX * sp, f.aimY * sp);
          for (const e of this.foesOf(f)) {
            if (f.moveHit.has(e) || Math.hypot(e.x - f.x, e.y - f.y) > 22) continue;
            f.moveHit.add(e);
            // 막기 자세(방패를 든 동안)는 처음부터, 늘 든 방패는 15레벨 추가 효과로 무너뜨림
            const ub = e.enemy?.shield?.mode !== 'always' || this.bonus(f, 15, 'leon');
            this.damage(e, f, f.atk * 1.8, { heavy: true, unblockable: ub, push: 10 });
          }
          return;
        }
        if (t > WIND + DASH + 220) this.endMove(f);
        return;
      }
      case 'oath': {
        // 맹세의 검: 오러를 모아 앞을 크게 내려침. 막을 수 없음
        const WIND = 450;
        if (t < WIND) return void (f.moveCol = t < 300 ? 8 : 4);
        if (!f.hitDone) {
          f.hitDone = true;
          const px = f.x + f.aimX * 28;
          const py = f.y + f.aimY * 18;
          // 각인 무기 (4막 장면 7 뒤): 은빛 룬이 겹치고 범위·피해가 조금 오른다
          const wp = f.id === 'leon' && isUnlocked('leon', 'weapon');
          this.fx('leon_oath', px, py + 6, { origin: [0.5, 1], depth: py + 10, scale: wp ? WEAPON.range : undefined });
          if (wp) {
            this.fx('elysia_rune', px, py, { depth: py - 1, scale: 0.9 * WEAPON.range, alpha: 0.9 }).setTint(WEAPON.tint);
            this.fx('leon_oath', px, py + 6, { origin: [0.5, 1], depth: py + 11, alpha: 0.5, scale: WEAPON.range * 1.1 }).setTint(WEAPON.tint);
          }
          this.cameras.main.shake(260, 0.01);
          this.cameras.main.flash(160, 255, 255, 255);
          const r = 60 * (wp ? WEAPON.range : 1);
          for (const e of this.foesOf(f)) {
            if (Math.hypot(e.x - px, (e.y - py) / 0.6) <= r) this.damage(e, f, f.atk * 4 * (wp ? WEAPON.mult : 1), { heavy: true, unblockable: true, area: true, push: 14, from: { x: px, y: py } });
          }
        }
        f.moveCol = 5;
        if (t > WIND + 420) this.endMove(f);
        return;
      }
      case 'rune': {
        // 룬 결계: 발밑에 룬을 그림
        if (!f.hitDone) {
          f.hitDone = true;
          const s = this.fx('elysia_rune', f.x, f.y, { loop: true, depth: -5, scale: 1.1, alpha: 0.9 });
          this.runes.push({ x: f.x, y: f.y, r: 52, until: this.now + 5000, next: this.now + 400, owner: f, s });
        }
        f.moveCol = t < 150 ? 8 : 9;
        if (t > 350) this.endMove(f);
        return;
      }
      case 'overload': {
        // 마력 폭주: 주변 전체 큰 폭발. 쓴 뒤 잠깐 움직이지 못함
        const WIND = 500;
        if (t < WIND) return void (f.moveCol = Math.floor(t / 120) % 2 ? 9 : 8);
        if (!f.hitDone) {
          f.hitDone = true;
          this.fx('elysia_overload', f.x, f.y - BODY, { depth: f.y + 10, scale: 1.6 });
          this.cameras.main.shake(300, 0.012);
          this.cameras.main.flash(200, 164, 124, 255);
          for (const e of this.foesOf(f)) {
            if (Math.hypot(e.x - f.x, (e.y - f.y) / 0.6) <= 110) this.damage(e, f, f.atk * 3.2, { heavy: true, unblockable: true, area: true, push: 16 });
          }
        }
        f.moveCol = 10;
        if (t > WIND + 1200) this.endMove(f);
        return;
      }
      case 'fang': {
        // 송곳니: 달려들며 베고, 그 자리에서 두 번 더 벤 뒤 뒤로 빠진다. 막기·방패를 찢음
        const WIND = 60;
        const DASH = 160;
        const CUT = 90;
        if (t < WIND) return void (f.moveCol = 4);
        if (t < WIND + DASH) {
          f.moveCol = 5;
          const sp = 300 * (dt / 1000);
          this.moveBy(f, f.aimX * sp, f.aimY * sp);
          for (const e of this.foesOf(f)) {
            if (f.moveHit.has(e) || Math.hypot(e.x - f.x, e.y - f.y) > 24 + e.radius) continue;
            f.moveHit.add(e);
            this.damage(e, f, f.atk * 1.0, { unblockable: true, push: 2 });
          }
          return;
        }
        const k = Math.floor((t - WIND - DASH) / CUT);
        if (k < 2) {
          f.moveCol = k ? 3 : 1;
          if (f.moveStep <= k) {
            f.moveStep = k + 1;
            this.fx(f.def.skill?.fx ?? 'karg_fang', f.x + f.aimX * 14, f.y - BODY + f.aimY * 8, { depth: f.y + 3 });
            for (const e of this.foesOf(f)) {
              if (Math.hypot(e.x - f.x, e.y - f.y) <= 30 + e.radius) this.damage(e, f, f.atk * 0.7, { unblockable: true, push: 2 });
            }
          }
          return;
        }
        if (t < WIND + DASH + CUT * 2 + 180) {
          f.moveCol = 0;
          const sp = 240 * (dt / 1000);
          this.moveBy(f, -f.aimX * sp, -f.aimY * sp);
          return;
        }
        this.endMove(f);
        return;
      }
      case 'frenzy': {
        // 늑대의 피: 잠깐 웅크렸다가 각성 (8초)
        if (t < 400) return void (f.moveCol = Math.floor(t / 100) % 2 ? 9 : 8);
        if (!f.hitDone) {
          f.hitDone = true;
          this.cameras.main.flash(160, 200, 90, 60);
          this.startBuff(f, this.bonus(f, 15, 'karg') ? 11000 : 8000);
        }
        f.moveCol = 9;
        if (t > 650) this.endMove(f);
        return;
      }
      case 'brace': {
        // 버티기: 막기 자세로 hold ms 동안 버팀
        const ev = f.def.evade!;
        if (!f.hitDone) {
          f.hitDone = true;
          const g = this.fx(ev.fx ?? 'galia_brace', f.x, f.y, { loop: true, depth: f.y - 1 });
          g.setData('owner', f);
          f.extra.push(g);
        }
        f.moveCol = 6;
        if (t > (ev.hold ?? 1000)) {
          this.clearExtra(f);
          f.guardCd = this.now + (ev.cooldown ?? 3000);
          this.endMove(f);
        }
        return;
      }
      case 'taunt': {
        // 단장의 호령: 주변 적의 공격을 끌어오고, 그동안 받는 피해 감소
        const m = f.def.skill!;
        if (t < 200) return void (f.moveCol = 8);
        if (!f.hitDone) {
          f.hitDone = true;
          this.fx(m.fx ?? 'galia_taunt', f.x, f.y - BODY, { depth: f.y + 5, scale: (m.radius ?? 90) / 32 });
          f.tauntUntil = this.now + (m.hold ?? 4000);
        }
        f.moveCol = 9;
        if (t > 500) this.endMove(f);
        return;
      }
      case 'quake': {
        // 대지 가르기: 대검을 내리꽂아 주변 적을 쓰러뜨리고 잠깐 일어나지 못하게 함
        const m = f.def.ult!;
        const WIND = 500;
        if (t < WIND) return void (f.moveCol = Math.floor(t / 120) % 2 ? 9 : 8);
        if (!f.hitDone) {
          f.hitDone = true;
          this.fx(m.fx ?? 'galia_quake', f.x, f.y + 6, { origin: [0.5, 1], depth: f.y + 10, scale: 1.4 });
          this.cameras.main.shake(300, 0.012);
          const r = m.radius ?? 75;
          for (const e of this.foesOf(f)) {
            if (Math.hypot(e.x - f.x, (e.y - f.y) / 0.6) > r) continue;
            this.damage(e, f, f.atk * (m.mult ?? 3), { heavy: true, unblockable: true, area: true, push: 12 });
            if (e.hp <= 0 || e.enemy?.boss || !e.targetable) continue;
            if (e.state === 'cast') this.endCast(e);
            if (e.state === 'attack') e.combo = -1;
            this.clearExtra(e);
            e.state = 'stagger';
            e.stunUntil = this.now + (m.stun ?? 2000);
          }
        }
        f.moveCol = 5;
        if (t > WIND + 600) this.endMove(f);
        return;
      }
      case 'awe': {
        // 위압: 붉은 금빛 눈으로 둘레의 적을 잠깐 멈춤 [임시 수치]
        const m = f.def.skill!;
        if (t < 180) return void (f.moveCol = 8);
        if (!f.hitDone) {
          f.hitDone = true;
          const r = (m.radius ?? 80) * (this.bonus(f, 15, 'serena') ? 1.3 : 1);
          this.fx(m.fx ?? 'serena_awe', f.x, f.y - BODY, { depth: f.y + 5, scale: r / 48 });
          this.cameras.main.flash(120, 200, 60, 40);
          for (const e of this.foesOf(f)) {
            if (Math.hypot(e.x - f.x, (e.y - f.y) / 0.6) > r) continue;
            if (e.state === 'cast') this.endCast(e);
            if (e.state === 'attack') e.combo = -1;
            this.clearExtra(e);
            e.state = 'stagger';
            e.stunUntil = this.now + (e.enemy?.boss ? 600 : m.stun ?? 1500);
          }
        }
        f.moveCol = 9;
        if (t > 480) this.endMove(f);
        return;
      }
      case 'command': {
        // 황제의 명령: 한동안 아군 전원 공격력·빠르기 상승, 스킬 재사용 대기 단축 [임시 수치]
        if (t < 300) return void (f.moveCol = 8);
        if (!f.hitDone) {
          f.hitDone = true;
          const ms = COMMAND.ms * (this.bonus(f, 20, 'serena') ? 1.3 : 1);
          this.commandUntil = this.now + ms;
          for (const p of this.party) {
            if (!p.alive || p.state === 'fainted') continue;
            this.fx(f.def.ult?.fx ?? 'serena_command', p.x, p.y - BODY, { depth: p.y + 3 });
            if (p.skillCd > this.now) p.skillCd = this.now + (p.skillCd - this.now) * COMMAND.cooldown;
          }
          this.cameras.main.flash(180, 255, 200, 120);
        }
        f.moveCol = 9;
        if (t > 700) this.endMove(f);
        return;
      }
      case 'combo':
        // 합동 기술은 시간 예약으로 움직인다. 혹시 남으면 풀어 줌
        if (t > 3000) this.endMove(f);
        return;
      default:
        this.endMove(f);
    }
  }

  /** 룬 결계: 안의 적은 느려지고 계속 피해 */
  // ---- 4막 적의 버릇 (불길·용암 웅덩이·사슬) ----

  private enemyExtras(e: Fighter, dt: number) {
    const ed = e.enemy!;
    if (this.ended || this.cutscene) return;
    const stunned = e.state === 'stagger' || e.state === 'fainted';
    // 용암 민달팽이: 지나간 자리에 불길
    if (ed.trail) {
      e.trailCd -= dt;
      if (e.trailCd <= 0 && e.state === 'move') {
        e.trailCd = ed.trail.every;
        const s = this.add.ellipse(e.x, e.y, ed.trail.radius * 2, ed.trail.radius * 1.2, 0xff6a1a, 0.4).setDepth(-6);
        this.tweens.add({ targets: s, alpha: 0.25, duration: 400, yoyo: true, repeat: -1 });
        this.fires.push({ x: e.x, y: e.y, r: ed.trail.radius, until: this.now + ed.trail.ms, next: this.now + 500, owner: e, s });
      }
    }
    // 용암의 수호자: 바닥 여러 곳이 끓어오른다 (붉은 표시 뒤 터짐, 막을 수 없음)
    if (ed.pools && !stunned) {
      e.poolCd -= dt;
      if (e.poolCd <= 0) {
        e.poolCd = ed.pools.every;
        const pl = ed.pools;
        const alive = this.party.filter((p) => p.alive && p.state !== 'fainted');
        for (let i = 0; i < pl.count && alive.length; i++) {
          const p = alive[i % alive.length];
          const x = p.x + (Math.random() - 0.5) * 40;
          const y = p.y + (Math.random() - 0.5) * 24;
          const warn = this.fx('warn_area', x, y, { loop: true, depth: -5 });
          warn.setScale(pl.radius / 46).setAlpha(0.9).setTint(0xff5a2a);
          this.time.delayedCall(pl.cast, () => {
            warn.destroy();
            if (this.ended || !e.alive) return;
            const s = this.add.ellipse(x, y, pl.radius * 2, pl.radius * 1.2, 0xff7a2a, 0.75).setDepth(-4);
            this.tweens.add({ targets: s, alpha: 0, scale: 1.25, duration: 420, onComplete: () => s.destroy() });
            this.cameras.main.shake(140, 0.006);
            for (const t of this.party) {
              if (Math.hypot(t.x - x, (t.y - y) / 0.6) <= pl.radius) this.damage(t, e, e.atk * pl.mult, { heavy: true, unblockable: true, area: true, push: 8, from: { x, y } });
            }
          });
        }
      }
    }
    // 결박술사: 아군 한 명에게 사슬
    if (ed.bind) {
      if (stunned) {
        e.bindPending = null;
        return;
      }
      e.bindCd -= dt;
      if (e.bindCd > 0 || e.bindPending) return;
      const bd = ed.bind;
      const cands = this.party.filter((p) => p.alive && p.state !== 'fainted' && !p.boundBy && Math.hypot(p.x - e.x, p.y - e.y) <= bd.range);
      if (!cands.length) return;
      const t = cands.reduce((a, b) => (Math.hypot(a.x - e.x, a.y - e.y) < Math.hypot(b.x - e.x, b.y - e.y) ? a : b));
      e.bindCd = bd.cooldown;
      e.bindPending = t;
      this.fx('warn_area', t.x, t.y, { depth: -5, alpha: 0.8 }).setTint(0x9a5cff).setScale(0.45);
      this.time.delayedCall(bd.cast, () => {
        if (e.bindPending !== t) return;
        e.bindPending = null;
        if (this.ended || !e.alive || !t.alive || t.state === 'fainted') return;
        t.boundBy = e;
        t.boundUntil = this.now + bd.ms;
        if (t.state === 'cast') this.endCast(t);
        t.combo = -1;
        t.state = 'stagger';
      });
    }
  }

  /** 사슬을 끊는다 (결박술사가 맞거나 쓰러지거나, 시간이 다 됨) */
  private releaseBind(binder: Fighter, only?: Fighter) {
    binder.bindPending = null;
    for (const p of this.party) {
      if (p.boundBy !== binder || (only && p !== only)) continue;
      p.boundBy = null;
      p.boundUntil = 0;
      if (p.state === 'stagger') p.state = 'idle';
    }
  }

  private drawChains() {
    const bound = this.party.filter((p) => p.boundBy);
    if (!bound.length) return void this.chainG?.clear();
    if (!this.chainG?.active) this.chainG = this.add.graphics().setDepth(9000);
    const g = this.chainG;
    g.clear();
    for (const p of bound) {
      const b = p.boundBy!;
      g.lineStyle(3, 0x2a1050, 0.7).lineBetween(b.x, b.y - BODY, p.x, p.y - BODY);
      g.lineStyle(1.5, 0xc49aff, 0.95).lineBetween(b.x, b.y - BODY, p.x, p.y - BODY);
      g.strokeEllipse(p.x, p.y - BODY, 22 + Math.sin(this.now / 90) * 2, 12);
    }
  }

  private updateFires() {
    for (const r of [...this.fires]) {
      if (this.now >= r.until || this.ended) {
        this.fires.splice(this.fires.indexOf(r), 1);
        this.tweens.killTweensOf(r.s);
        this.tweens.add({ targets: r.s, alpha: 0, duration: 300, onComplete: () => r.s.destroy() });
        continue;
      }
      if (this.now < r.next) continue;
      r.next += 500;
      for (const t of this.party) {
        if (t.alive && Math.hypot(t.x - r.x, (t.y - r.y) / 0.6) <= r.r) this.damage(t, r.owner, r.owner.atk * (r.owner.enemy?.trail?.mult ?? 0.3), { tick: true, push: 0 });
      }
    }
  }

  private updateRunes() {
    for (const r of [...this.runes]) {
      if (this.now >= r.until || this.ended) {
        this.runes.splice(this.runes.indexOf(r), 1);
        this.tweens.add({ targets: r.s, alpha: 0, duration: 300, onComplete: () => r.s.destroy() });
        continue;
      }
      if (this.now < r.next) continue;
      r.next += 500;
      for (const e of this.foesOf(r.owner)) {
        if (this.inRune(e, r)) this.damage(e, r.owner, r.owner.atk * 0.35, { tick: true, push: 0 });
      }
    }
  }

  private inRune(e: Fighter, r: { x: number; y: number; r: number }) {
    return Math.hypot(e.x - r.x, (e.y - r.y) * 2) <= r.r;
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
      this.comboPick = -1;
      this.timeScale = 0.3; // 시간이 느려짐
    } else if (!held && this.wheelOpen) {
      this.wheelOpen = false;
      this.timeScale = 1;
      const pick = this.party[this.comboPick];
      this.comboPick = -1;
      const toast = (text: string) => this.notices.push({ kind: 'toast', text });
      if (this.comboGauge < 100) return toast('연계 게이지가 아직 차지 않았습니다');
      if (!pick || pick === f) return toast('동료 얼굴을 가리킨 채 R을 떼세요');
      const c = combos.combos.find((k) => k.pair.includes(f.id) && k.pair.includes(pick.id));
      if (!c) return toast(`${pick.def.name}와(과)는 합동 기술이 없습니다`);
      if (pick.state === 'fainted' || f.state === 'fainted') return toast(`${pick.def.name}은(는) 기절해 있습니다`);
      if (c.name !== '룬의 검' && c.name !== '찢고 베기') return toast(`${c.name}: 아직 준비 중인 기술입니다`);
      const leon = f.id === 'leon' ? f : pick;
      const mate = f.id === 'leon' ? pick : f;
      if (c.name === '찢고 베기') this.fangCombo(leon, mate, f);
      else this.runeSword(leon, mate, f);
    }
  }

  /** 합동 기술 「룬의 검」: 엘리시아의 룬이 앞 일직선의 적을 묶고, 레온이 오러로 그 줄을 꿰뚫는다 */
  private runeSword(leon: Fighter, ely: Fighter, by: Fighter) {
    this.lineCombo(leon, ely, by, '룬의 검', (inLine, ax, ay) => {
      const marks: Phaser.GameObjects.Sprite[] = [];
      for (let i = 0; i < 3; i++) {
        const d = 40 + i * 70;
        marks.push(this.fx('elysia_rune', leon.x + ax * d, leon.y + ay * d, { loop: true, depth: -5, scale: 0.8, alpha: 0.9 }));
      }
      for (const e of this.foesOf(leon).filter(inLine)) {
        if (e.state === 'cast') this.endCast(e);
        if (e.state === 'attack') e.combo = -1;
        e.state = 'stagger';
        e.stunUntil = this.now + 1500;
      }
      return () => {
        ely.moveCol = 9;
        return () => {
          for (const m of marks) this.tweens.add({ targets: m, alpha: 0, duration: 300, onComplete: () => m.destroy() });
        };
      };
    });
  }

  /** 합동 기술 「찢고 베기」: 카르크가 앞 일직선을 달려 나가며 막기·방패를 찢고, 레온이 오러로 그 줄을 꿰뚫는다 */
  private fangCombo(leon: Fighter, karg: Fighter, by: Fighter) {
    this.lineCombo(leon, karg, by, '찢고 베기', (inLine, ax, ay) => {
      const targets = this.foesOf(leon).filter(inLine);
      // 레온 옆에서 줄을 따라 달려 나간다
      karg.x = leon.x;
      karg.y = leon.y;
      this.moveBy(karg, -ay * 14, ax * 10);
      karg.facing = leon.facing;
      karg.aimX = ax;
      karg.aimY = ay;
      karg.moveCol = 5;
      for (let i = 0; i < 36; i++) this.moveBy(karg, ax * 4, ay * 4);
      const ang = Math.atan2(ay, ax);
      this.fx('karg_dash', karg.x, karg.y - BODY, { angle: ang, depth: karg.y + 2, flipY: Math.cos(ang) < -0.01 });
      for (const e of targets) {
        if (e.state === 'cast') this.endCast(e);
        if (e.state === 'guard') this.clearExtra(e);
        e.combo = -1;
        this.fx(karg.def.skill?.fx ?? 'karg_fang', e.x, e.y - BODY, { depth: e.y + 3 });
        this.damage(e, karg, karg.atk * 1.2, { unblockable: true, push: 0 });
        if (e.alive && e.state !== 'kneel') {
          e.state = 'stagger';
          e.stunUntil = this.now + 1500;
        }
      }
      return () => {
        karg.moveCol = 0;
        return () => {};
      };
    });
  }

  /**
   * 일직선 합동 기술: bind = 동료가 앞 줄의 적을 묶는다 (레온이 찌를 때 부르는 함수를 돌려주고, 그 함수는 정리 함수를 돌려줌).
   * 0.5초 뒤 레온이 그 줄을 꿰뚫는다. 처음 쓸 때는 두 사람 얼굴이 잠깐 화면을 가로지른다
   */
  private lineCombo(
    leon: Fighter,
    mate: Fighter,
    by: Fighter,
    name: string,
    bind: (inLine: (e: Fighter) => boolean, ax: number, ay: number) => () => () => void,
  ) {
    this.comboGauge = 0;
    for (const p of [leon, mate]) {
      if (p.state === 'guard') this.endGuard(p);
      p.state = 'skill';
      p.move = 'combo';
      p.stateT = 0;
      p.moveCol = 8;
      p.z = 0;
      p.vz = 0;
    }
    // 바라보는 방향: 조작하던 인물의 정면
    const [ax, ay] = dirVec(by.facing);
    leon.facing = by.facing;
    leon.aimX = ax;
    leon.aimY = ay;
    mate.facing = dirOf(leon.x + ax * 80 - mate.x, leon.y + ay * 80 - mate.y);
    const LEN = 210;
    const inLine = (e: Fighter) => {
      const dx = e.x - leon.x;
      const dy = e.y - leon.y;
      const along = dx * ax + dy * ay;
      return along > -12 && along < LEN && Math.abs(-dx * ay + dy * ax) < 26;
    };
    const go = () => {
      const onStrike = bind(inLine, ax, ay);
      this.time.delayedCall(500, () => {
        if (this.ended) return;
        const cleanup = onStrike();
        leon.moveCol = 5;
        const sx = leon.x;
        const sy = leon.y;
        const targets = this.foesOf(leon).filter(inLine);
        for (let i = 0; i < 40; i++) this.moveBy(leon, ax * 4, ay * 4);
        const fl = Math.hypot(leon.x - sx, leon.y - sy);
        const ang = Math.atan2(ay, ax);
        this.fx('leon_thrust', sx, sy - BODY, { angle: ang, depth: sy + 3, flipY: Math.cos(ang) < -0.01, scale: Math.max(1, fl / 70) });
        this.cameras.main.shake(240, 0.01);
        this.cameras.main.flash(180, 220, 200, 255);
        for (const e of targets) this.damage(e, leon, leon.atk * 3 + mate.atk, { unblockable: true, heavy: true, area: true, push: 12, from: { x: sx, y: sy } });
        this.time.delayedCall(450, () => {
          cleanup();
          this.endMove(leon);
          this.endMove(mate);
        });
      });
    };
    const once = gameState.progress.once;
    const key = `cutin:${name}`;
    if (!once.includes(key)) {
      once.push(key);
      this.frozen = true;
      this.notices.push({ kind: 'cutin', text: `${leon.id},${mate.id},${name}` });
      this.time.delayedCall(1100, () => {
        this.frozen = false;
        go();
      });
    } else go();
  }

  private trySwap(i: number) {
    const target = this.party[i];
    if (!target || target === this.controlled) return;
    if (target.state === 'fainted') return this.notices.push({ kind: 'toast', text: `${target.def.name}은(는) 기절해 있습니다` });
    if (this.swapCd > 0) return;
    this.controlled = target;
    this.swapCd = 800; // 교체 직후 짧은 대기 시간
    if (target.def.gauge?.overload) this.onceGuide('tut:elysia', '엘리시아는 마법을 쓸수록 과부하가 찹니다. 가득 찬 채로 쓰면 체력이 깎이고, Q로 마력 폭주');
    this.fx('dust_land', target.x, target.y - 6, { depth: target.y - 1 });
  }

  // ---- 공격 ----

  private requestAttack(f: Fighter) {
    const hits = f.def.attack?.hits;
    if (!hits || f.airborne) return;
    // 캐릭터 정면으로
    [f.aimX, f.aimY] = dirVec(f.facing);
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
      this.overloadUse(f, 'bolt');
      const boost = this.bonus(f, 15, 'elysia') ? 1 + f.gauge / 200 : 1;
      this.shoot(f, f.x + f.aimX * 10, f.y - BODY + f.aimY * 6, f.aimX * h.projectile, f.aimY * h.projectile, h.fx, Math.round(f.atk * h.mult * boost), false);
      return;
    }
    const foes = this.foesOf(f);
    let hit = false;
    for (const t of foes) {
      const dx = t.x - f.x;
      const dy = t.y - f.y;
      const d = Math.hypot(dx, dy);
      if (d > h.range + 8 + t.radius + (t.enemy?.ai === 'eel' ? 18 : 0)) continue;
      const da = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - ang));
      if (d > 10 && da > Phaser.Math.DegToRad(h.arc / 2)) continue;
      const buff = this.now < f.buffUntil;
      hit = this.damage(t, f, f.atk * h.mult * (buff ? 1.5 : 1), { heavy: h.heavy, push: h.push ?? (h.heavy ? 10 : 4), unblockable: buff || !!f.enemy?.attack?.unblockable }) || hit;
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
    o: { heavy?: boolean; push?: number; unblockable?: boolean; area?: boolean; from?: { x: number; y: number }; raw?: boolean; tick?: boolean } = {},
  ): boolean {
    if (!t.targetable || this.ended) return false;
    if (this.finishing && this.bdef.endAt && t.team === 'enemy') return false;
    if (this.now < t.invulnUntil && !o.raw) return false;
    if (t.airborne && !o.area && !o.raw) return false; // 점프 중에는 땅 위 공격이 닿지 않음 (넓은 범위 공격은 맞음)
    const from = o.from ?? (src ? { x: src.x, y: src.y } : { x: t.x, y: t.y - 1 });
    // 황제의 명령: 아군 공격력 상승
    if (src?.team === 'party' && this.now < this.commandUntil && !o.raw) amount *= COMMAND.atk;
    // 결박술사가 맞으면 사슬이 끊긴다
    if (t.enemy?.bind && src && src.team !== 'enemy') this.releaseBind(t);
    // 마력 방어막: 먼저 막는다 (공격으로 깸)
    if (t.barrierHp > 0 && !o.raw) {
      t.barrierHp -= amount;
      this.fx('block', t.x + (from.x > t.x ? 12 : -12), t.y - BODY, { depth: t.y + 5, flipX: from.x > t.x }).setTint(0xb48cff);
      if (t.barrierHp <= 0) {
        t.barrierHp = 0;
        this.word('break', t);
        this.fx('guard_break', t.x, t.y - BODY, { depth: t.y + 5 }).setTint(0xb48cff);
        t.barrierFx?.destroy();
        t.barrierFx = undefined;
      }
      return true;
    }
    // 굳은 껍질: 정해 둔 기술에 맞으면 깨지고, 그 뒤로는 핵이 큰 피해를 받는다
    const am = t.enemy?.armor;
    if (am && src && !o.raw && !o.tick) {
      const how = src.move === 'oath' || src.move === 'fang' ? src.move : this.now < src.buffUntil ? 'frenzy' : '';
      if (!t.armorBroken && how && am.breakBy.includes(how)) {
        t.armorBroken = true;
        this.word('break', t);
        this.fx('guard_break', t.x, t.y - BODY - 6, { depth: t.y + 5, scale: 1.6 });
        this.cameras.main.shake(200, 0.008);
      }
      amount *= t.armorBroken ? am.core : am.mult;
    }

    // 적의 방패·등껍질 (정면에서 온 공격). 넓은 범위 공격과 룬의 지속 피해는 그대로
    let broke = false;
    const ed = t.enemy;
    if (ed && (ed.shield || ed.shell) && !o.raw && !o.tick && !o.area) {
      const fx = from.x - t.x;
      const fy = from.y - t.y;
      const fl = Math.hypot(fx, fy) || 1;
      const front = (fx / fl) * t.aimX + (fy / fl) * t.aimY > 0.3;
      const sh = ed.shield;
      const up = !!sh && (sh.mode === 'always' ? t.state === 'idle' || t.state === 'move' : t.state === 'guard');
      if (front && up) {
        if (!o.unblockable) {
          this.fx('block', t.x + (fx / fl) * 10, t.y - BODY + (fy / fl) * 6, { depth: t.y + 5, flipX: fx > 0 });
          return false;
        }
        // 막을 수 없는 공격: 자세가 무너진다
        broke = true;
        this.word('break', t);
        this.fx('guard_break', t.x, t.y - BODY, { depth: t.y + 5 });
        this.clearExtra(t);
        t.state = 'stagger';
        t.stunUntil = this.now + sh!.stagger;
      } else if (front && ed.shell) amount *= ed.shell;
    }

    // 막기
    if (t.state === 'guard' && !o.raw && t.team !== 'enemy') {
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
          this.addGauge(t, (t.def.gauge?.perParry ?? 20) * (this.bonus(t, 10, 'leon') ? 2 : 1));
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
          if (t === this.controlled) this.tutEvent('parry') || this.tutEvent('block');
          return false;
        } else {
          this.fx('block', t.x + (fx / fl) * 10, t.y - BODY + (fy / fl) * 6, { depth: t.y + 5, flipX: fx > 0 });
          t.stamina -= ev.blockCost ?? 14;
          this.moveBy(t, (-fx / fl) * 3, (-fy / fl) * 3);
          if (t === this.controlled) this.tutEvent('block');
          if (t.stamina <= 0) {
            this.word('break', t);
            this.endGuard(t);
          }
          return false;
        }
      }
    }

    if (t.blockLight && o.unblockable && !o.raw && t.state !== 'fainted') {
      this.fx('block', t.x + ((from.x - t.x) > 0 ? 10 : -10), t.y - BODY, { depth: t.y + 5, flipX: from.x > t.x });
      return false;
    }
    // 버티기·도발 중에는 받는 피해가 줄어듦 (갈리아)
    const bracing = t.move === 'brace' && t.state === 'skill';
    const taunting = this.now < t.tauntUntil;
    if (!o.raw && t.team === 'party' && (bracing || taunting)) {
      const before = amount;
      if (bracing) amount *= 1 - (t.def.evade?.cut ?? 0);
      if (taunting) amount *= 1 - (t.def.skill?.cut ?? 0);
      // 10레벨: 버티기 중 받은 피해 일부를 오러 게이지로
      if (bracing && this.bonus(t, 10, 'galia')) this.addGauge(t, Math.round((before - amount) * (t.def.evade?.gaugeRatio ?? 0.5)));
    }
    // 15레벨: 도발 중에는 넘어지거나 밀려나지 않음
    const steady = bracing || (taunting && this.bonus(t, 15, 'galia'));
    let dmg = o.raw ? amount : Math.max(1, Math.round(amount * (0.9 + Math.random() * 0.2) - t.defense * 0.5));
    // NPC 아군은 쓰러지지 않음 (갈래 전투에서 "그 인물이 쓰러지면"이 있으면 쓰러질 수 있음)
    if (t.team === 'ally' && !this.bdef.outcomes?.[`fall:${t.id}`]) dmg = Math.min(dmg, t.hp - 1);
    // 쓰러지지 않는 전투 (대본상 지면 안 되는 전투)
    if (t.team === 'party' && this.bdef.noFall) dmg = Math.min(dmg, t.hp - 1);
    // 마지막 일격 전에는 보스 체력이 그 아래로 내려가지 않음 (튜토리얼을 다 할 때까지)
    const fin = this.bdef.finisher;
    if (fin && t.enemy?.boss && !this.tutorialDone) dmg = Math.min(dmg, Math.max(0, t.hp - Math.ceil(t.maxHp * fin.at) - 1));
    if (dmg <= 0 && t.team === 'ally') {
      this.fx('hit', t.x, t.y - BODY, { depth: t.y + 5 });
      return true;
    }
    t.hp -= dmg;
    this.damageNumber(t, dmg, t.team !== 'enemy');
    this.fx(o.heavy ? 'hit_heavy' : 'hit', t.x + (Math.random() - 0.5) * 6, t.y - BODY - t.z + (Math.random() - 0.5) * 6, { depth: t.y + 5, scale: o.tick ? 0.6 : undefined });
    // 룬 결계의 지속 피해는 게이지를 채우지 않고, 하던 동작도 끊지 않는다
    if (o.tick) {
      if (t.team === 'enemy') this.damageDealt += dmg;
      if (t.hp <= 0) {
        t.hp = 0;
        if (t.team === 'enemy') this.kill(t, src);
      }
      return true;
    }
    if (src && src.team !== 'enemy') {
      this.addGauge(src, src.def.gauge?.perHit ?? 6);
      const was = this.comboGauge;
      this.comboGauge = Math.min(100, this.comboGauge + 3);
      if (was < 100 && this.comboGauge >= 100 && this.bdef.comboGuide) this.onceGuide(`tut:combo:${this.start.battle}`, this.bdef.comboGuide, 8000);
    }
    if (t.team === 'enemy' && src) {
      t.lastHitBy = src;
      t.lastHitAt = this.now;
    }
    if (t.team === 'enemy') this.damageDealt += dmg;
    if (t.team === 'enemy' && src && src === this.controlled) this.tutEvent('hit');
    // 마지막 일격
    if (fin && t.enemy?.boss && this.tutorialDone && !this.finishing && t.hp <= t.maxHp * fin.at) {
      t.hp = Math.max(1, t.hp);
      this.startFinisher(t);
      return true;
    }
    // 쓰러뜨리지 않고 끝나는 보스
    const endAt = this.bdef.endAt;
    if (endAt && t.enemy?.boss && !this.finishing && t.hp <= t.maxHp * endAt) {
      t.hp = Math.max(1, t.hp);
      this.kneelEnd(t);
      return true;
    }
    // 보스도 강한 베기(3타째)에는 잠깐 휘청인다
    if (t.enemy?.boss && o.heavy && t.state !== 'cast' && t.hp > 0) {
      if (t.state === 'guard') this.clearExtra(t);
      t.state = 'stagger';
      t.stunUntil = this.now + 450;
    }
    if (t.state === 'cast' && (t.castKind === 'area' || t.castKind === 'tail')) t.castTaken += dmg;

    // 밀려남
    const push = steady ? 0 : o.push ?? 4;
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
    } else if (!broke && !steady && t.state !== 'prep' && t.state !== 'cast' && t.state !== 'skill' && !t.enemy?.boss) {
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
    const was = f.gauge;
    f.gauge = Math.min(100, f.gauge + n);
    // 궁극기 게이지가 처음 가득 찼을 때 안내
    if (was < 100 && f.gauge >= 100 && f === this.controlled && f.def.ult && isUnlocked(f.id, 'ult') && MOVES[`${f.id}:ult`]) {
      this.onceGuide(`tut:ult:${f.id}`, `Q: 궁극기 「${f.def.ult.name}」`);
    }
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
    this.endCast(e);
    const bt = `bt_${e.spriteKey}`;
    if ((e.enemy?.faint || e.enemy?.sink) && this.textures.exists(bt)) {
      // 사라지지 않고 쓰러진 모습으로 남음 (괴물은 물속으로 가라앉음)
      e.sprite.stop().setTexture(bt, DIRS.indexOf(e.facing) * 12 + 11).setAlpha(1).clearTint().setDepth(e.y - 2);
      e.shadow.setVisible(false);
      this.fx('dust_land', e.x, e.y - 6, { depth: e.y - 1 });
      if (e.enemy.sink) {
        this.tweens.add({ targets: e.sprite, y: e.sprite.y + 26, alpha: 0, delay: 500, duration: 1400, onComplete: () => e.sprite.destroy() });
        if (e.light) this.tweens.add({ targets: e.light, intensity: 0, delay: 500, duration: 1400 });
        this.cameras.main.shake(400, 0.006);
      }
    } else {
      this.fx('gnosis_vanish', e.x, e.y - BODY, { depth: e.y + 1 });
      e.sprite.destroy();
    }
    e.shadow.destroy();
    e.hpBar?.frame.destroy();
    e.hpBar?.fill.destroy();
    e.glow?.destroy();
    e.signal?.destroy();
    e.barrierFx?.destroy();
    if (e.enemy?.bind) this.releaseBind(e);
    e.area?.warn.destroy();
    this.clearExtra(e);
    if (e.enemy?.boss && this.bdef.bossEnds) {
      for (const o of this.all) if (o !== e && o.team === 'enemy' && o.alive) this.removeEnemy(o, null);
    }
    // 나보다 많이 약한 몹은 경험치를 거의 주지 않는다 (파티 평균 레벨과 적 레벨 차이)
    const ids = this.party.map((p) => p.id);
    const avg = ids.reduce((a, id) => a + levelOf(id), 0) / (ids.length || 1);
    const ex = e.enemy ? EXP_REWARD.enemy(e.id, avg) : 0;
    if (ex && !this.cutscene) this.grantExp(ex);
  }

  /** 경험치: 싸운 파티 전원이 같은 양, 대기 동료는 benchShare 비율. 레벨이 오르면 체력·공격력·방어력이 오르고 알림 */
  grantExp(amount: number) {
    const fought = this.party.map((p) => p.id);
    const bench = partyIds().filter((id) => !fought.includes(id));
    this.showLevelUps([...gainExp(fought, amount), ...gainExp(bench, Math.round(amount * levels.benchShare))]);
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
      const bonus = (levels.bonus as Record<string, Record<string, string>>)[u.id] ?? {};
      for (const lv of BONUS_LEVELS) if (u.from < lv && u.to >= lv && bonus[lv]) this.notices.push({ kind: 'unlock', text: `추가 효과: ${bonus[lv]}` });
    }
  }

  /** 레벨 추가 효과 (levels.json의 bonus): 이 인물이 lv레벨 이상이면 true */
  private bonus(f: Fighter, lv: number, id: string) {
    return f.id === id && f.team !== 'enemy' && levelOf(f.id) >= lv;
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
    // 하얀 빛 신호 + 바닥의 붉은 범위
    e.signal = this.fx('gnosis_signal', e.x, e.y - BODY, { loop: true, depth: e.y + 2 });
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
    if (f.protect) return f.state === 'fainted' ? undefined : this.updateProtect(f, dt);
    if (f.buffUntil && this.now >= f.buffUntil) this.endBuff(f);
    // 황제의 명령: 아군의 동작이 빨라진다
    if (f.team === 'party' && this.now < this.commandUntil) dt *= COMMAND.speed;
    // 사슬에 묶인 동안은 움직이지 못한다
    if (f.boundBy) {
      if (this.now >= f.boundUntil || !f.boundBy.alive) this.releaseBind(f.boundBy, f);
      else return void (f.state = f.state === 'fainted' ? 'fainted' : 'stagger');
    }
    if (f.team === 'enemy' && f.alive) this.enemyExtras(f, dt);
    // 룬 결계 안의 적은 느려진다
    if (f.team === 'enemy' && this.runes.some((r) => this.inRune(f, r))) dt *= 0.5;
    // 전투장 안으로 걸어 들어오는 중
    if (this.now < f.walkUntil) {
      f.state = 'move';
      return;
    }
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
      case 'skill':
        return this.updateMove(f, dt);
      case 'kneel':
        return;
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
    // 동료가 사슬에 묶여 있으면 묶은 적부터 (카르크는 늘 먼저)
    const binder = foes.find((e) => this.party.some((p) => p.boundBy === e));
    const t = binder && (f.id === 'karg' || Math.random() < 0.7) ? binder : foes.reduce((a, b) => (Math.hypot(a.x - f.x, a.y - f.y) < Math.hypot(b.x - f.x, b.y - f.y) ? a : b));
    const dx = t.x - f.x;
    const dy = t.y - f.y;
    const d = Math.hypot(dx, dy);
    const range = (f.def.attack?.hits[0].range ?? 26) - 4;
    f.aimX = dx / (d || 1);
    f.aimY = dy / (d || 1);
    f.facing = dirOf(dx, dy);
    if (this.aiMove(f, d)) return;
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

  /** 동료 AI의 스킬·궁극기 (열려 있고 쓸 수 있을 때). 썼으면 true */
  private aiMove(f: Fighter, d: number) {
    if (f.team !== 'party' || f.airborne) return false;
    const near = (r: number) => this.foesOf(f).filter((e) => Math.hypot(e.x - f.x, (e.y - f.y) / 0.6) <= r).length;
    const ultOk = isUnlocked(f.id, 'ult') && f.gauge >= 100 && MOVES[`${f.id}:ult`];
    const skillOk = isUnlocked(f.id, 'skill') && this.now >= f.skillCd && MOVES[`${f.id}:skill`];
    const use = (w: 'skill' | 'ult') => {
      this.tryMove(f, w);
      return f.state === 'skill';
    };
    if (f.id === 'leon') {
      if (ultOk && d < 46) return use('ult');
      if (skillOk && d > 24 && d < 90 && Math.random() < 0.02) return use('skill');
    } else if (f.id === 'elysia') {
      if (ultOk && (near(100) >= 2 || this.enemiesBoss)) return use('ult');
      if (skillOk && near(60) >= 1) return use('skill');
    } else if (f.id === 'galia') {
      if (ultOk && (near(80) >= 2 || (this.enemiesBoss && d < 50))) return use('ult');
      if (skillOk && near(90) >= 2) return use('skill');
    } else if (f.id === 'serena') {
      if (ultOk && (near(120) >= 2 || this.enemiesBoss)) return use('ult');
      if (skillOk && near(70) >= 2) return use('skill');
    } else if (f.id === 'karg') {
      if (ultOk && (near(90) >= 2 || this.enemiesBoss)) return use('ult');
      if (skillOk && d > 20 && d < 80 && Math.random() < 0.03) return use('skill');
    }
    return false;
  }

  private enemyAI(e: Fighter, dt: number) {
    const ed = e.enemy!;
    if (ed.ai === 'eel') return this.eelAI(e, dt);
    if (ed.ai === 'burrow') return this.burrowAI(e, dt);
    if (ed.ai === 'knight') return this.knightAI(e, dt);
    const t = this.targetOf(e);
    if (!t) {
      e.state = 'idle';
      return;
    }
    const dx = t.x - e.x;
    const dy = t.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.aiCd -= dt;
    e.blinkCd -= dt;

    // 체력이 낮아지면 자폭 신호
    if (ed.selfDestruct && e.hp <= e.maxHp * ed.selfDestruct.below) return this.startSelfDestruct(e);
    if (ed.summon && e.summoned < ed.summon.at.length && e.hp <= e.maxHp * ed.summon.at[e.summoned]) {
      e.summoned++;
      this.summonAround(e, ed.summon.enemy, ed.summon.count);
    }
    // 안개 짐승: 흐려졌다 나타남
    if (ed.fade) {
      e.fadeCd -= dt;
      if (e.dived && this.now >= e.diveUntil) e.dived = false;
      else if (!e.dived && e.fadeCd <= 0) {
        e.dived = true;
        e.diveUntil = this.now + ed.fade.ms;
        e.fadeCd = ed.fade.every;
      }
    }

    if (ed.ai === 'rusher') {
      const a = ed.attack!;
      e.aimX = dx / d;
      e.aimY = dy / d;
      e.facing = dirOf(dx, dy);
      // 바위 도마뱀: 가까이 올 때까지 바위처럼 가만히 있다가 굴러 덮친다
      if (ed.ambush && !e.ambushed) {
        if (d > ed.ambush.range && e.hp >= e.maxHp) return void (e.state = 'idle');
        e.ambushed = true;
        const base = e.speed;
        e.speed = base * ed.ambush.speed;
        this.fx('dust_land', e.x, e.y - 4, { depth: e.y + 1 });
        this.time.delayedCall(ed.ambush.ms, () => (e.speed = base));
      }
      if (d > a.range + t.radius) {
        e.state = 'move';
        this.moveBy(e, (dx / d) * e.speed * (dt / 1000), (dy / d) * e.speed * (dt / 1000));
      } else {
        e.state = 'idle';
        if (e.aiCd <= 0 && !e.dived) {
          e.aiCd = a.cooldown + Math.random() * 500;
          e.attacks++;
          // 몇 번에 한 번 붉은 범위 공격 (사막 전갈의 꼬리 찌르기)
          if (ed.area && e.attacks % ed.area.every === 0) return this.startArea(e, t.x, t.y);
          this.startHit(e, 0);
          if ((a.hits ?? 1) > 1) e.queued = true;
        }
      }
      return;
    }

    // caster (마르키온): 거리를 두고 빛을 쏜다
    const keep = ed.keepAway ?? 80;
    e.facing = dirOf(dx, dy);
    e.aimX = dx / d;
    e.aimY = dy / d;
    const goal = ed.boss && this.bdef.tutorial ? this.tutGoal : 'free';
    // 튜토리얼 첫 단계(베기 연습)에는 가만히 서 있는다
    if (goal === 'hit') {
      e.state = 'idle';
      e.aiCd = Math.max(e.aiCd, 600);
      return;
    }
    // 시전 직후에는 잠깐 멈춰 선다 (반격할 틈)
    if (this.now < e.recoverUntil) e.state = 'idle';
    else if (d < keep) {
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
      // 튜토리얼: 막기 연습엔 빛만, 피하기 연습엔 범위 공격만
      const area = goal === 'dodge' ? !!ed.area : goal === 'block' || goal === 'parry' ? false : ed.area && e.attacks % ed.area.every === 0;
      e.state = 'cast';
      e.stateT = 0;
      e.castKind = area ? 'area' : 'bolt';
      e.castTaken = 0;
      const hand = this.fx('light_cast', e.x + e.aimX * 10, e.y - BODY - 2, { loop: true, depth: e.y + 3 });
      e.extra.push(hand);
      if (area) {
        const warn = this.fx('warn_area', t.x, t.y, { loop: true, depth: -5 });
        warn.setScale(ed.area!.radius / 46).setAlpha(0.9);
        e.area = { x: t.x, y: t.y, r: ed.area!.radius, warn };
      }
    }
  }

  /** 보스가 하수인을 부른다 (보스 둘레) */
  private summonAround(e: Fighter, key: string, count: number) {
    const b = this.bounds;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const x = Phaser.Math.Clamp(e.x + Math.cos(a) * 46, b.x0 + 8, b.x1 - 8);
      const y = Phaser.Math.Clamp(e.y + Math.sin(a) * 30, b.y0 + 8, b.y1 - 8);
      this.spawnEnemy(key, x, y);
    }
  }

  /** 붉은 범위 공격 준비: (x, y)에 예고를 깔고 시전 */
  private startArea(e: Fighter, x: number, y: number) {
    const ar = e.enemy!.area!;
    e.state = 'cast';
    e.stateT = 0;
    e.castKind = 'area';
    e.castTaken = 0;
    const warn = this.fx('warn_area', x, y, { loop: true, depth: -5 });
    warn.setScale(ar.radius / 46).setAlpha(0.9);
    e.area = { x, y, r: ar.radius, warn };
  }

  // ---- 모래 괴물 ----

  /** 모래 속(무적)으로 다가가 튀어나와 물고, 잠깐 드러난 채 서 있다가(틈) 다시 숨는다 */
  private burrowAI(e: Fighter, dt: number) {
    const b = e.enemy!.burrow!;
    const t = this.targetOf(e);
    if (!t) return void (e.state = 'idle');
    const dx = t.x - e.x;
    const dy = t.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.aimX = dx / d;
    e.aimY = dy / d;
    e.facing = dirOf(dx, dy);
    if (!e.dived) {
      e.state = 'idle';
      if (this.now >= e.diveUntil) {
        e.dived = true;
        this.fx('dust_land', e.x, e.y - 4, { depth: e.y + 1 });
      }
      return;
    }
    e.aiCd -= dt;
    if (d > b.range + t.radius) {
      e.state = 'move';
      this.moveBy(e, (dx / d) * e.speed * (dt / 1000), (dy / d) * e.speed * (dt / 1000));
      return;
    }
    if (e.aiCd > 0) return void (e.state = 'idle');
    e.dived = false;
    e.state = 'cast';
    e.castKind = 'bite';
    e.stateT = 0;
    this.fx('dust_land', e.x, e.y - 4, { depth: e.y + 1 });
  }

  private updateBurrowCast(e: Fighter, dt: number) {
    const b = e.enemy!.burrow!;
    e.stateT += dt;
    if (e.stateT < b.emerge) return;
    for (const t of this.foesOf(e)) {
      if (Math.hypot(t.x - e.x, t.y - e.y) <= b.range + 6 + t.radius) this.damage(t, e, e.atk * b.mult, { push: 8 });
    }
    e.state = 'idle';
    e.castKind = '';
    e.diveUntil = this.now + b.open;
    e.aiCd = 300 + Math.random() * 400;
  }

  // ---- 기사 (아드리안) ----

  /** 방패 돌진(멀 때), 베기 / 방패 들고 버티기(가까울 때). 체력이 heal.at 아래면 한 번 치유의 빛 */
  private knightAI(e: Fighter, dt: number) {
    const ed = e.enemy!;
    const t = this.targetOf(e);
    if (!t) return void (e.state = 'idle');
    const dx = t.x - e.x;
    const dy = t.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.aimX = dx / d;
    e.aimY = dy / d;
    e.facing = dirOf(dx, dy);
    if (e.state === 'guard') {
      if (this.now >= e.poseUntil) {
        e.state = 'idle';
        this.clearExtra(e);
      }
      return;
    }
    e.aiCd -= dt;
    if (ed.heal && !e.healed && e.hp <= e.maxHp * ed.heal.at) {
      e.healed = true;
      return this.startKnightCast(e, 'heal');
    }
    if (this.now < e.recoverUntil) return void (e.state = 'idle');
    const reach = (ed.attack?.range ?? 30) + t.radius;
    if (e.aiCd <= 0) {
      if (ed.charge && d > 80) return this.startKnightCast(e, 'charge');
      if (d <= reach + 10) {
        if (ed.block && Math.random() < 0.4) {
          e.state = 'guard';
          e.poseUntil = this.now + ed.block.ms;
          e.aiCd = 300; // 방패를 든 동안은 AI가 쉰다 (poseUntil까지)
          e.extra.push(this.fx('adrian_block', e.x, e.y - BODY, { loop: true }));
          return;
        }
        e.aiCd = (ed.attack?.cooldown ?? 1000) + Math.random() * 400;
        this.startHit(e, 0);
        if ((ed.attack?.hits ?? 1) > 1) e.queued = true;
        return;
      }
    }
    if (d > reach - 4) {
      e.state = 'move';
      this.moveBy(e, (dx / d) * e.speed * (dt / 1000), (dy / d) * e.speed * (dt / 1000));
    } else e.state = 'idle';
  }

  private startKnightCast(e: Fighter, kind: 'charge' | 'heal') {
    const ed = e.enemy!;
    e.state = 'cast';
    e.castKind = kind;
    e.stateT = 0;
    e.hitDone = false;
    e.moveHit.clear();
    if (kind === 'charge') {
      e.chargeX = e.aimX;
      e.chargeY = e.aimY;
      return;
    }
    // 치유의 빛: 금빛 원이 반쯤 차오르다가 깜빡이며 꺼진다
    const s = this.fx('adrian_heal', e.x, e.y - BODY, { loop: true, depth: e.y + 2 });
    e.extra.push(s);
    this.time.delayedCall(ed.heal!.cast * 0.5, () => {
      if (!s.active) return;
      s.anims.pause();
      this.tweens.add({ targets: s, alpha: 0.1, duration: 70, yoyo: true, repeat: 4, onComplete: () => s.destroy() });
    });
  }

  private updateKnightCast(e: Fighter, dt: number) {
    const ed = e.enemy!;
    e.stateT += dt;
    const t = e.stateT;
    if (e.castKind === 'heal') {
      const h = ed.heal!;
      if (t < h.cast) return;
      e.hp = Math.min(e.maxHp, e.hp + Math.round(e.maxHp * h.amount));
      this.endCast(e);
      e.state = 'idle';
      e.castKind = '';
      e.aiCd = 600;
      return;
    }
    // 방패 돌진: 방패를 앞세워 잠깐 버틴 뒤 곧게 달려든다 (막을 수 없음. 옆으로 피한다)
    const c = ed.charge!;
    e.aimX = e.chargeX;
    e.aimY = e.chargeY;
    if (t < c.windup) return;
    if (!e.hitDone) {
      e.hitDone = true;
      e.extra.push(this.fx('adrian_charge', e.x, e.y - BODY, { loop: true, angle: Math.atan2(e.chargeY, e.chargeX) }));
    }
    if (t < c.windup + c.ms) {
      const sp = c.speed * (dt / 1000);
      this.moveBy(e, e.chargeX * sp, e.chargeY * sp);
      for (const f of this.foesOf(e)) {
        if (e.moveHit.has(f) || Math.hypot(f.x - e.x, f.y - e.y) > 22 + f.radius) continue;
        e.moveHit.add(f);
        this.damage(f, e, e.atk * c.mult, { unblockable: true, heavy: true, push: 18 });
      }
      return;
    }
    this.endCast(e);
    e.state = 'idle';
    e.castKind = '';
    e.aiCd = c.cooldown + Math.random() * 400;
    e.recoverUntil = this.now + 600;
  }

  /** 체력이 endAt 아래로 내려간 보스: 쓰러뜨리지 않고 무릎 꿇린 채 전투를 끝낸다 */
  private kneelEnd(e: Fighter) {
    this.finishing = true;
    this.endCast(e);
    for (const p of this.projectiles) p.s.destroy();
    this.projectiles = [];
    e.state = 'kneel';
    e.stunUntil = Infinity;
    this.cameras.main.flash(250, 255, 255, 255);
    this.cameras.main.shake(200, 0.006);
    this.time.delayedCall(300, () => (this.frozen = true));
    this.time.delayedCall(1600, () => this.finish('finisher'));
  }

  private updateCast(e: Fighter, dt: number) {
    const ed = e.enemy!;
    if (ed.ai === 'eel') return this.updateEelCast(e, dt);
    if (ed.ai === 'burrow') return this.updateBurrowCast(e, dt);
    if (ed.ai === 'knight') return this.updateKnightCast(e, dt);
    e.stateT += dt;
    const cast = e.castKind === 'area' ? ed.area!.cast : ed.bolt!.cast;
    // 범위 공격은 일정 피해를 받으면 끊긴다
    if (e.castKind === 'area' && e.castTaken >= ed.area!.breakDamage && this.tutGoal !== 'dodge') {
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
      let hitMe = false;
      for (const t of this.all.filter((a) => a.targetable && a.team !== 'enemy')) {
        if (Math.hypot(t.x - x, (t.y - y) / 0.5) <= r) {
          this.damage(t, e, e.atk * ed.area!.mult, { area: true, unblockable: true, heavy: true, push: 10, from: { x, y } });
          if (t === this.controlled) hitMe = true;
        }
      }
      if (!hitMe) this.tutEvent('dodge');
      else if (this.tutGoal === 'dodge') this.notices.push({ kind: 'toast', text: '붉은 범위 밖으로 걸어 나가세요' });
    } else {
      // 빛을 쏜다 (조준한 쪽으로)
      const t = this.targetOf(e);
      if (t) {
        const dx = t.x - e.x;
        const dy = t.y - e.y;
        const l = Math.hypot(dx, dy) || 1;
        const bo = ed.bolt!;
        const tint = bo.tint ? Phaser.Display.Color.HexStringToColor(bo.tint).color : undefined;
        // 여러 갈래면 조준한 쪽을 가운데로 부채꼴
        const n = bo.count ?? 1;
        const base = Math.atan2(dy / l, dx / l);
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * ((bo.spread ?? 0) * Math.PI) / 180;
          const cx = Math.cos(a);
          const cy = Math.sin(a);
          this.shoot(e, e.x + cx * 10, e.y - BODY, cx * bo.speed, cy * bo.speed, bo.fx ?? 'light_bolt', Math.round(e.atk * bo.mult), !!bo.unblockable, tint);
        }
      }
    }
    this.endCast(e);
    e.state = 'idle';
    e.aiCd = (ed.bolt?.cooldown ?? 1500) + Math.random() * 500;
    e.recoverUntil = this.now + (ed.recover ?? 0);
  }

  // ---- 수로의 괴물 ----

  /** 물속에서 머리만 내민 채 움직이지 않는다. 물기 / 촉수 쓸기 / 점액 뱉기, 체력이 반 아래면 잠수 */
  private eelAI(e: Fighter, dt: number) {
    const ed = e.enemy!;
    if (e.dived) {
      const others = this.all.some((x) => x.alive && x.team === 'enemy' && x !== e);
      if ((!others && this.pendingSpawns === 0) || this.now > e.diveUntil) this.eelSurface(e);
      return;
    }
    if (ed.dive && !e.diveDone && e.hp <= e.maxHp * ed.dive.below) return this.eelDive(e);
    const targets = this.all.filter((t) => t.targetable && t.team !== 'enemy');
    e.state = 'idle';
    if (!targets.length) return;
    const t = targets.reduce((a, b) => (Math.hypot(a.x - e.x, a.y - e.y) < Math.hypot(b.x - e.x, b.y - e.y) ? a : b));
    const dx = t.x - e.x;
    const dy = t.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.facing = dx < 0 ? 'left' : 'right';
    e.aimX = dx / d;
    e.aimY = dy / d;
    e.aiCd -= dt;
    if (e.aiCd > 0) return;
    e.attacks++;
    const kind = ed.tail && e.attacks % ed.tail.every === 0 ? 'tail' : ed.bite && d <= ed.bite.range ? 'bite' : 'spray';
    e.state = 'cast';
    e.stateT = 0;
    e.castKind = kind;
    e.castTaken = 0;
    if (kind === 'bite') {
      e.glow = this.fx('warn_glow', e.x + e.aimX * 20, e.y - 40, { loop: true, depth: e.y + 3 });
    } else if (kind === 'tail') {
      const warn = this.fx('warn_area', e.x, e.y + 40, { loop: true, depth: -5 });
      warn.setScale(ed.tail!.radius / 46).setAlpha(0.9);
      e.area = { x: e.x, y: e.y + 40, r: ed.tail!.radius, warn };
    }
  }

  private updateEelCast(e: Fighter, dt: number) {
    const ed = e.enemy!;
    e.stateT += dt;
    const k = e.castKind;
    // 꼬리 쓸기는 시전 중에 많이 맞으면 끊긴다
    if (k === 'tail' && e.castTaken >= ed.tail!.breakDamage) {
      this.word('break', e);
      this.endCast(e);
      e.state = 'stagger';
      e.stunUntil = this.now + 1000;
      e.aiCd = 1800;
      return;
    }
    const cast = k === 'bite' ? ed.bite!.windup : k === 'tail' ? ed.tail!.cast : ed.spray!.cast;
    if (e.stateT < cast) return;
    const foes = this.all.filter((a) => a.targetable && a.team !== 'enemy');
    if (k === 'bite') {
      // 물기: 앞쪽 가까이 (막을 수 있음)
      for (const t of foes) {
        const dx = t.x - e.x;
        const dy = t.y - e.y;
        if (Math.hypot(dx, dy) > ed.bite!.range) continue;
        if ((dx < 0) !== (e.facing === 'left') && Math.abs(dx) > 16) continue;
        this.damage(t, e, e.atk * ed.bite!.mult, { heavy: true, push: 12 });
      }
      this.fx('hit_heavy', e.x + e.aimX * 30, e.y + 10, { depth: e.y + 20 });
      this.eelPose(e, 2);
    } else if (k === 'tail' && e.area) {
      // 꼬리 쓸기: 넓은 범위, 막을 수 없음
      const { x, y, r } = e.area;
      this.cameras.main.shake(260, 0.008);
      for (let i = 0; i < 5; i++) this.fx('dust_land', x + (i - 2) * r * 0.35, y + (i % 2 ? -10 : 14), { depth: y + 20, scale: 1.4 });
      for (const t of foes) {
        if (Math.hypot(t.x - x, (t.y - y) / 0.5) <= r) this.damage(t, e, e.atk * ed.tail!.mult, { area: true, unblockable: true, heavy: true, push: 16, from: { x, y } });
      }
      this.eelPose(e, 4);
    } else {
      // 점액 뱉기: 가장 가까운 인물 쪽으로 썩은 점액 여럿
      const t = foes.sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
      if (t) {
        const sp = ed.spray!;
        const hx = e.x + (e.facing === 'left' ? -14 : 14);
        const hy = e.y - 46;
        const base = Math.atan2(t.y - BODY - hy, t.x - hx);
        for (let i = 0; i < sp.count; i++) {
          const a = base + (i - (sp.count - 1) / 2) * 0.22;
          this.shoot(e, hx, hy, Math.cos(a) * sp.speed, Math.sin(a) * sp.speed, 'light_bolt', Math.round(e.atk * sp.mult), false, 0x8cb05a);
        }
      }
      this.eelPose(e, 5);
    }
    this.endCast(e);
    e.state = 'idle';
    e.aiCd = (ed.bite?.cooldown ?? 1500) + Math.random() * 500;
  }

  /** 동작 직후의 모습을 잠깐 보여 준다 */
  private eelPose(e: Fighter, col: number) {
    e.poseCol = col;
    e.poseUntil = this.now + 350;
  }

  private eelDive(e: Fighter) {
    const dv = e.enemy!.dive!;
    this.endCast(e);
    e.diveDone = true;
    e.dived = true;
    e.state = 'idle';
    e.diveUntil = this.now + dv.maxMs;
    this.cameras.main.shake(300, 0.006);
    this.fx('dust_land', e.x, e.y - 4, { depth: e.y + 5, scale: 2 });
    this.notices.push({ kind: 'toast', text: '괴물이 물속으로 들어갔습니다. 거머리가 몰려옵니다!' });
    const spots = [[110, 150], [340, 150], [150, 236], [300, 236]];
    for (let i = 0; i < dv.leech; i++) {
      const [x, y] = spots[i % spots.length];
      this.pendingSpawns++;
      this.time.delayedCall(500 + i * 250, () => {
        this.pendingSpawns--;
        // 깊은 물에서는 못 움직이므로 가장 가까운 물가로
        const p = this.freeSpot(x, y);
        if (!this.ended) this.spawnEnemy('sewer_leech', p.x, p.y);
      });
    }
  }

  private eelSurface(e: Fighter) {
    e.dived = false;
    e.aiCd = 900;
    e.attacks = 0;
    this.cameras.main.shake(300, 0.008);
    this.fx('dust_land', e.x, e.y - 4, { depth: e.y + 5, scale: 2 });
    this.notices.push({ kind: 'toast', text: '괴물이 다시 떠올랐습니다!' });
  }

  private endCast(e: Fighter) {
    e.glow?.destroy();
    e.glow = undefined;
    e.area?.warn.destroy();
    e.area = undefined;
    this.clearExtra(e);
  }

  // ---- 날아가는 것 ----

  private shoot(owner: Fighter, x: number, y: number, vx: number, vy: number, fx: string, dmg: number, unblockable: boolean, tint?: number) {
    const s = this.fx(fx, x, y, { loop: true, angle: Math.atan2(vy, vx), depth: 9000 });
    if (tint !== undefined) s.setTint(tint);
    this.projectiles.push({ s, x, y, vx, vy, dmg, owner, unblockable, tint });
  }

  private updateProjectiles(dt: number) {
    for (const p of [...this.projectiles]) {
      p.x += p.vx * (dt / 1000);
      p.y += p.vy * (dt / 1000);
      p.s.setPosition(p.x, p.y);
      const foes = this.foesOf(p.owner);
      const hit = foes.find((t) => (t.enemy?.ai === 'eel' ? Math.abs(t.x - p.x) < 26 && t.y - p.y > -6 && t.y - p.y < 80 : Math.abs(t.x - p.x) < 9 + t.radius && Math.abs(t.y - BODY - p.y) < 14 + t.radius) && !t.airborne);
      const out = p.x < 0 || p.y < 20 || p.x > this.bdef.arena.w || p.y > this.bdef.arena.h;
      if (hit) {
        this.damage(hit, p.owner, p.dmg, { unblockable: p.unblockable, push: 6, from: { x: p.x - p.vx * 0.05, y: p.y + BODY - p.vy * 0.05 } });
        const burst = this.fx(p.owner.team === 'enemy' ? 'light_burst' : 'elysia_bolt_hit', p.x, p.y, { depth: 9000, scale: 0.5 });
        if (p.tint !== undefined) burst.setTint(p.tint);
      }
      if (hit || out) {
        p.s.destroy();
        this.projectiles.splice(this.projectiles.indexOf(p), 1);
      }
    }
  }

  // ---- 이동, 겹침 ----

  private moveBy(f: Fighter, dx: number, dy: number) {
    const m = this.onMap;
    if (!m) {
      f.x = Phaser.Math.Clamp(f.x + dx, this.bounds.x0, this.bounds.x1);
      f.y = Phaser.Math.Clamp(f.y + dy, this.bounds.y0, this.bounds.y1);
      return;
    }
    // 물속에서 걷기는 느리게 (탐색 맵과 같은 배율)
    if (f.state === 'move' && f.z === 0 && m.wadeAt(f.x + this.ox, f.y + this.oy)) {
      dx *= WADE_SLOW;
      dy *= WADE_SLOW;
    }
    // 맵 위: 벽·기둥·가구에 막힌다 (가로, 세로 따로 → 벽을 따라 미끄러짐)
    const nx = Phaser.Math.Clamp(f.x + dx, this.bounds.x0, this.bounds.x1);
    const ny = Phaser.Math.Clamp(f.y + dy, this.bounds.y0, this.bounds.y1);
    if (!m.solidAt(nx + this.ox, f.y + this.oy)) f.x = nx;
    if (!m.solidAt(f.x + this.ox, ny + this.oy)) f.y = ny;
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
        const min = 13 + a.radius + b.radius;
        if (d < min && d > 0.01) {
          const push = (min - d) / 2;
          const bossA = a.enemy?.boss || (a.protect && !a.protect.follow) ? 0 : 1;
          const bossB = b.enemy?.boss || (b.protect && !b.protect.follow) ? 0 : 1;
          this.moveBy(a, (-dx / d) * push * bossA, (-dy / d) * push * 0.6 * bossA);
          this.moveBy(b, (dx / d) * push * bossB, (dy / d) * push * 0.6 * bossB);
        }
      }
  }

  // ---------------------------------------------------------------
  // 결과
  // ---------------------------------------------------------------

  /**
   * 마지막 일격 (대본: 레온이 침입자의 팔을 벤다).
   * 궁극기를 잠시 열어 자동으로 쓰고, 보스 체력을 0으로 만든 뒤 결과 'finisher'로 끝낸다
   */
  private startFinisher(e: Fighter) {
    const fin = this.bdef.finisher!;
    const l = this.controlled ?? this.party[0];
    this.finishing = true;
    this.endCast(e);
    for (const p of this.projectiles) p.s.destroy();
    this.projectiles = [];
    e.state = 'stagger';
    e.stunUntil = Infinity;
    this.frozen = true;
    this.notices.push({ kind: 'unlock', text: `궁극기 「${fin.name}」 일시 개방`, what: 'ult' });
    if (!l) return this.time.delayedCall(1200, () => this.finish('finisher'));
    l.state = 'prep';
    this.fx('unlock', l.x, l.y - BODY, { depth: l.y + 5 });
    this.cameras.main.flash(250, 255, 255, 255);
    this.time.delayedCall(1100, () => {
      // 달려들며 내려친다 — 이때부터 벤 직후까지 시간이 느려진다(궁극기 동작을 보여 주려고)
      this.setSlow(FINISH_SLOW);
      const dx = e.x - l.x;
      const dy = e.y - l.y;
      const dl = Math.hypot(dx, dy) || 1;
      l.aimX = dx / dl;
      l.aimY = dy / dl;
      l.facing = dirOf(dx, dy);
      l.state = 'attack';
      l.combo = 2;
      l.stateT = 0;
      this.tweens.add({ targets: l, x: e.x - (dx / dl) * 20, y: e.y - (dy / dl) * 6, duration: 170, ease: 'Quad.out' });
      this.time.delayedCall(220, strike);
    });
    const strike = () => {
      l.stateT = 9999;
      this.fx(l.def.ult?.fx ?? 'hit_heavy', e.x, e.y - BODY, { depth: e.y + 10 });
      this.fx('hit_heavy', e.x, e.y - BODY, { depth: e.y + 11 });
      this.cameras.main.shake(320, 0.012);
      this.cameras.main.flash(300, 255, 255, 255);
      this.damageNumber(e, e.hp, false);
      e.hp = 0;
      // 무릎 꿇은 모습으로 멈춤
      e.sprite.setTexture(`bt_${e.spriteKey}`, DIRS.indexOf(e.facing) * 12 + 10);
      e.hpBar?.frame.setVisible(false);
      e.hpBar?.fill.setVisible(false);
      // 벤 순간을 조금 더 느리게 보여 준 뒤 원래 빠르기로
      this.time.delayedCall(260, () => {
        this.setSlow(1);
        this.time.delayedCall(900, () => {
          l.state = 'idle';
          this.finish('finisher');
        });
      });
    };
  }

  /** 장면 전체 빠르기 (시간·트윈·이펙트 애니메이션). 1이면 원래대로 */
  private setSlow(k: number) {
    this.time.timeScale = k;
    this.tweens.timeScale = k;
    for (const o of this.children.list) {
      const s = o as Phaser.GameObjects.Sprite;
      if (s.anims) s.anims.timeScale = k;
    }
    this.slowK = k;
  }

  private checkOutcome() {
    const b = this.bdef;
    // 버티기 전투: 시간이 다 되거나 파티가 다 쓰러지면 결과 time (적은 끝없이)
    if (b.survive) {
      if (this.elapsed >= b.survive * 1000) return this.finish('time');
      if (this.party.length && this.party.every((p) => p.state === 'fainted')) return this.finish('time');
      this.endlessCd -= 16;
      if (this.endlessCd <= 0) {
        this.endlessCd = 500;
        this.fillEndless();
      }
      return;
    }
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
    if (this.carry) this.onMap?.trackCarry(this.carry.id, null);
    this.wheelOpen = false;
    this.timeScale = 1;
    this.reviving = null;
    const outs = this.bdef.outcomes ?? {};
    let action: OutcomeAction | undefined = forced ?? outs[outcome];
    if (!action && outcome === 'win') action = { continue: true };
    if ((!action && outcome === 'wipe' && !this.bdef.noGameOver) || action?.gameover) {
      if (outcome.startsWith('fall:')) this.notices.push({ kind: 'toast', text: `${this.all.find((f) => `fall:${f.id}` === outcome)?.def.name ?? ''}이(가) 무너졌습니다` });
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
    // 승리 글자가 먼저, 그다음 레벨 업·해금 (HUD가 차례로 간격을 두고 띄운다)
    if (outcome === 'win') this.notices.push({ kind: 'word', text: 'victory' });
    const bex = EXP_REWARD.battle(this.start.battle);
    const once = gameState.progress.once;
    const bkey = `battle:${this.start.battle}`;
    if (outcome !== 'wipe' && bex && !this.cutscene && !once.includes(bkey)) {
      once.push(bkey);
      this.grantExp(bex);
    }
    if (outcome === 'damage') this.cameras.main.flash(500, 255, 255, 255);
    const wait = outcome === 'done' ? 200 : 1500;
    this.time.delayedCall(wait, () => this.leaveAfterBanners({ outcome, action: done }));
  }

  /** HUD의 큰 글자 알림이 다 지나간 뒤에 전투를 끝낸다 */
  private leaveAfterBanners(r: BattleResult) {
    const hud = this.scene.get('BattleHUD') as unknown as { bannerLeft?: () => number } | null;
    const left = hud?.bannerLeft?.() ?? 0;
    if (left > 0) this.time.delayedCall(left, () => this.leave(r));
    else this.leave(r);
  }

  /** HUD의 게임 오버 화면에서 고름 */
  gameOverChoice(retry: boolean) {
    this.leave({ outcome: 'wipe', action: retry ? 'gameover-retry' : 'gameover-title' });
  }

  private leaving = false;
  private leave(r: BattleResult) {
    if (this.leaving) return;
    this.leaving = true;
    // 전투 BGM을 끄고 앞의 곡으로
    if (this.bdef.bgm) void playLoop(this, 'bgm', this.prevBgm);
    if (this.onMap && typeof r.action !== 'string') {
      // 맵 위: 화면을 바꾸지 않고, 싸운 인물들을 맵의 그 자리로 돌려놓는다
      const m = this.onMap;
      for (const f of this.all) {
        if (!f.actorId) continue;
        // 쓰러진 하수인은 사라진 채로, 아군과 보스(대본에서 계속 나옴)는 그 자리에 다시 세움
        if (f.protect && !f.protect.follow) m.hideActor(f.actorId, false);
        else if (f.team !== 'enemy' || f.alive || f.enemy?.boss) m.putActor(f.actorId, f.x + this.ox, f.y + this.oy, f.facing);
        else if (f.enemy?.faint) m.putActor(f.actorId, f.x + this.ox, f.y + this.oy, f.facing, true);
      }
      this.leaving = false;
      this.scene.stop('BattleHUD');
      this.scene.stop();
      this.start.onEnd(r);
      return;
    }
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
    for (const f of this.all) if (f.alive) (f.protect ? this.renderProtect(f) : this.renderFighter(f));
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
    const hasWalk = this.textures.exists(f.spriteKey);
    const walk = () => {
      if (hasWalk && s.texture.key !== f.spriteKey) s.setTexture(f.spriteKey, row * 5);
    };
    if (f.enemy?.ai === 'eel') return this.renderEel(f, setBt);
    // 모래 괴물: 숨은 동안 10열, 튀어나오는 중 8 → 9열
    if (f.enemy?.burrow && (f.dived || f.state === 'cast')) {
      setBt(f.dived ? 10 : f.stateT < f.enemy.burrow.emerge / 2 ? 8 : 9);
      f.shadow.setVisible(false);
      f.hpBar?.frame.setVisible(false);
      f.hpBar?.fill.setVisible(false);
      return;
    }
    if (!hasWalk && (f.state === 'idle' || f.state === 'move')) return setBt(0);
    switch (f.state) {
      case 'skill':
        setBt(f.moveCol);
        break;
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
        // 기사의 방패 돌진은 방패를 앞세운 모습
        setBt(f.castKind === 'charge' ? 6 : Math.floor(this.now / 150) % 2 ? 9 : 8);
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
    s.setAlpha(f.enemy?.fade && f.dived ? 0.3 : this.now < f.invulnUntil ? (Math.floor(this.now / 80) % 2 ? 0.5 : 1) : 1);
    const charging = (f.state === 'cast' && f.castKind === 'charge' && f.stateT < (f.enemy?.charge?.windup ?? 0)) || (f.state === 'attack' && !f.hitDone && !!f.enemy?.attack?.unblockable);
    f.barrierFx?.setPosition(f.x, f.y - BODY - f.z).setDepth(f.y + 1);
    if ((f.state === 'prep' && f.enemy?.selfDestruct) || charging) s.setTint(Math.floor(this.now / 120) % 2 ? 0xff9a9a : 0xffffff);
    else s.clearTint();
    f.glow?.setPosition(f.x, f.y - 22 - f.z).setDepth(f.y + 1);
    f.signal?.setPosition(f.x, f.y - BODY).setDepth(f.y + 2);
    // 걸어 들어갈 수 있는 물: 아랫몸이 잠기고 물결 띠 (탐색 맵과 같은 깊이)
    const wet = f.z === 0 && f.state !== 'fainted' && !!this.onMap?.wadeAt(f.x + this.ox, f.y + this.oy);
    if (wet) {
      s.setCrop(0, 0, s.frame.width, Math.max(0, Math.round(s.originY * s.frame.height - WADE_DEPTH)));
      f.shadow.setPosition(Math.round(f.x), Math.round(f.y - WADE_DEPTH)).setDepth(f.y + 0.2).setFrame(0).setTint(0xa8c0a0);
    } else if (s.isCropped) {
      s.setCrop();
      f.shadow.clearTint();
    }
    for (const o of f.extra) {
      const sp = o as Phaser.GameObjects.Sprite;
      if (sp.anims?.currentAnim?.key === 'fx_leon_guard') {
        sp.setPosition(f.x, f.y - BODY - f.z).setRotation(Math.atan2(f.aimY, f.aimX)).setDepth(f.y + (f.aimY < -0.5 ? -1 : 2));
      } else if (sp.anims?.currentAnim?.key === 'fx_stun') sp.setPosition(f.x, f.y - 14).setDepth(f.y + 2);
      else if (sp.anims?.currentAnim?.key === 'fx_light_cast') sp.setPosition(f.x + f.aimX * 10, f.y - BODY - 2).setDepth(f.y + 3);
      else if (sp.anims?.currentAnim?.key === 'fx_adrian_block' || sp.anims?.currentAnim?.key === 'fx_adrian_charge') {
        sp.setPosition(f.x, f.y - BODY).setRotation(Math.atan2(f.aimY, f.aimX)).setDepth(f.y + (f.aimY < -0.5 ? -1 : 2));
      } else if (sp.anims?.currentAnim?.key === 'fx_adrian_heal') sp.setPosition(f.x, f.y - BODY).setDepth(f.y + 2);
    }
    f.buffFx?.setPosition(f.x, f.y - BODY - f.z).setDepth(f.y + 1);
    if (f.hpBar) {
      const show = f.hp < f.maxHp && f.state !== 'prep' && !f.dived;
      f.hpBar.frame.setVisible(show).setPosition(Math.round(f.x), Math.round(f.y - 44 - f.z)).setDepth(10000);
      f.hpBar.fill
        .setVisible(show)
        .setPosition(Math.round(f.x) - 10, Math.round(f.y - 43 - f.z))
        .setCrop(0, 0, Math.max(0, Math.round((20 * f.hp) / f.maxHp)), 2)
        .setDepth(10001);
    }
  }

  /** 수로의 괴물 그림: 동작마다 정해 둔 열 */
  private renderEel(f: Fighter, setBt: (col: number) => void) {
    let col = 0;
    if (f.dived) col = 10;
    else if (f.state === 'cast') {
      const k = f.castKind;
      col = k === 'bite' ? 1 : k === 'tail' ? 3 : Math.floor(this.now / 150) % 2 ? 8 : 5;
    } else if (f.state === 'stagger' || f.state === 'hurt') col = 7;
    else if (this.now < f.poseUntil) col = f.poseCol;
    setBt(col);
    f.shadow.setVisible(false);
    if (f.state === 'cast' && f.castKind === 'tail') f.sprite.setTint(Math.floor(this.now / 120) % 2 ? 0xff9a9a : 0xffffff);
    else f.sprite.clearTint();
    f.glow?.setPosition(f.x + f.aimX * 20, f.y - 40).setDepth(f.y + 3);
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
    s.anims.timeScale = this.slowK;
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
