import levels from '../data/battle/levels.json';
import expTable from '../data/exp.json';
import fighters from '../data/battle/fighters.json';
import { gameState, type Progress } from '../game/GameState';

/**
 * 레벨과 경험치.
 * 경험치는 넘쳐도 그대로 쌓아 두고, 레벨은 "경험치로 닿는 레벨"과 "지금 구간의 최대 레벨" 중 작은 값.
 * 그래서 최대 레벨에서 넘친 경험치는 다음 구간이 열리면 저절로 반영된다.
 */
export type Unlock = 'move' | 'evade' | 'skill' | 'ult' | 'combo' | 'weapon';

export const PARTY_IDS = Object.keys(fighters.party);
const EXP: number[] = expTable.levels;
const MAX: Record<string, number> = expTable.maxLevel;

/** 경험치 수치 (src/data/exp.json 한 곳에서 고친다) */
export const EXP_REWARD = {
  /** 몹 경험치. 파티 평균 레벨(level)이 몹 레벨보다 많이 높으면 줄어든다 (enemyLevels, weakScale) */
  enemy: (id: string, level?: number) => {
    const base = (expTable.enemies as Record<string, number>)[id] ?? 0;
    const lv = (expTable.enemyLevels as Record<string, number>)[id];
    if (!base || level === undefined || lv === undefined) return base;
    const gap = Math.floor(level - lv);
    const steps = Object.entries(expTable.weakScale as Record<string, number>).map(([k, v]) => [Number(k), v] as const).sort((a, b) => b[0] - a[0]);
    const k = steps.find(([g]) => gap >= g)?.[1] ?? 1;
    return Math.max(1, Math.round(base * k));
  },
  battle: (name: string) => (expTable.battles as Record<string, number>)[name] ?? 0,
  look: (id: string) => (expTable.looks as Record<string, number>)[id] ?? expTable.looks.default,
  ending: (id: string) => (expTable.endings as Record<string, number>)[id] ?? 0,
};

export const maxLevel = (p: Progress = gameState.progress) => MAX[p.stage] ?? MAX.start;
export const expOf = (id: string, p: Progress = gameState.progress) => p.exp[id] ?? 0;

/** 경험치만으로 닿는 레벨 */
export function rawLevel(exp: number) {
  let l = 1;
  while (l < EXP.length && exp >= EXP[l]) l++;
  return l;
}

/** 임시 동료인가 (대본의 guest. 경험치를 받지 않고 레벨이 고정) */
export const isGuest = (id: string, p: Progress = gameState.progress) => p.guests?.[id] !== undefined;

export const levelOf = (id: string, p: Progress = gameState.progress) =>
  Math.min(isGuest(id, p) ? p.guests[id] : rawLevel(expOf(id, p)), maxLevel(p));
export const isCapped = (id: string) => levelOf(id) >= maxLevel();

/** 지금 레벨 안에서의 진행 (0~1). 최대 레벨이면 1 */
export function levelProgress(id: string) {
  const l = levelOf(id);
  if (l >= maxLevel() || l >= EXP.length) return 1;
  const a = EXP[l - 1];
  const b = EXP[l];
  return Math.max(0, Math.min(1, (expOf(id) - a) / (b - a)));
}

/** 조작은 대본의 unlock 지점에서 열린다 (파티 전원 공통). id는 예전 호출과 맞추려고 남겨 둠 */
export const isUnlocked = (_id: string, what: Unlock, p: Progress = gameState.progress) => what === 'move' || p.unlocks.includes(what);

const UNLOCK_KEY: Record<Unlock, string> = { move: '', evade: 'Shift', skill: 'E', ult: 'Q', combo: 'R', weapon: '' };

/** 해금 알림 글. 레온의 기술 이름이 있으면 함께 ("스킬 해금: 오러 찌르기 (E)") */
export function unlockInfo(what: Unlock) {
  // 각인 무기 (4막 장면 7): 알림 글은 4막_연출.md 그대로
  if (what === 'weapon') return { name: '각인 무기', guide: '', banner: '각인 무기: 맹세의 검이 오러를 머금었다' };
  const u = levels.unlocks.find((x) => x.what === what);
  const leon = (fighters.party as Record<string, Record<string, { name?: string }>>).leon;
  const move = what === 'evade' || what === 'skill' || what === 'ult' ? leon?.[what]?.name : undefined;
  const name = u?.name ?? what;
  const key = UNLOCK_KEY[what];
  return { name, guide: u?.guide ?? '', banner: `${name} 해금${move ? `: ${move}` : ''}${key ? ` (${key})` : ''}` };
}

/** 조작을 연다. 처음 열면 true */
export function unlock(what: Unlock, p: Progress = gameState.progress) {
  if (isUnlocked('leon', what, p)) return false;
  p.unlocks.push(what);
  return true;
}

/**
 * 파티 합류. 경험치는 그때 파티(임시 동료 빼고)의 평균으로 맞춰 들어온다 (docs/전투.md: 나중에 합류하는 동료는 파티 평균 레벨).
 * 임시 동료였으면 정식 파티원으로 바뀐다
 */
export function joinParty(id: string, p: Progress = gameState.progress) {
  const wasGuest = isGuest(id, p);
  if (p.party.includes(id) && !wasGuest) return false;
  const members = p.party.filter((m) => m !== id && !isGuest(m, p));
  const avg = members.length ? Math.round(members.reduce((s, m) => s + expOf(m, p), 0) / members.length) : 0;
  if (wasGuest) delete p.guests[id];
  if (!p.party.includes(id)) p.party.push(id);
  p.exp[id] = Math.max(expOf(id, p), avg);
  return true;
}

/** 임시 동료로 넣는다: 조작과 교체는 되지만 경험치를 받지 않고, 레벨은 들어온 순간의 레온 레벨로 고정 */
export function addGuest(id: string, p: Progress = gameState.progress) {
  if (p.party.includes(id)) return false;
  p.guests ??= {};
  p.guests[id] = levelOf('leon', p);
  p.party.push(id);
  return true;
}

/** 파티 이탈: 파티와 대기 목록에서 뺀다. 경험치 기록은 남김 (다시 합류할 수 있음) */
export function leaveParty(id: string, p: Progress = gameState.progress) {
  if (!p.party.includes(id)) return false;
  p.party = p.party.filter((m) => m !== id);
  p.bench = (p.bench ?? []).filter((m) => m !== id);
  if (p.guests) delete p.guests[id];
  return true;
}

/** 한 번에 출전하는 인원 */
export const ACTIVE_MAX = 4;

/** 출전하는 파티 (대기 동료 빼고 최대 4명, 레온은 늘 맨 앞) */
export function activeParty(p: Progress = gameState.progress) {
  const all = p.party?.length ? p.party : ['leon'];
  const on = all.filter((id) => id === 'leon' || !(p.bench ?? []).includes(id));
  const list = ['leon', ...on.filter((id) => id !== 'leon')].filter((id) => all.includes(id) || id === 'leon');
  return list.slice(0, ACTIVE_MAX);
}

/** 출전할 사람을 정한다 (나머지는 대기). 레온은 늘 들어간다 */
export function setActive(ids: string[], p: Progress = gameState.progress) {
  const keep = new Set(['leon', ...ids]);
  p.bench = p.party.filter((id) => !keep.has(id));
}

/** 지금 파티에서 경험치를 받는 인물 (조사, 전투 이벤트, 선택지 경험치. 임시 동료는 빠짐) */
export const partyIds = (p: Progress = gameState.progress) => (p.party?.length ? p.party.filter((id) => !isGuest(id, p)) : ['leon']);

export interface LevelUp {
  id: string;
  from: number;
  to: number;
}

/** 경험치를 준다. ids = 받는 인물 (파티 전원 같은 양). 레벨이 오르면 그 내용을 돌려준다 */
export function gainExp(ids: string[], amount: number, p: Progress = gameState.progress): LevelUp[] {
  const ups: LevelUp[] = [];
  if (amount <= 0) return ups;
  for (const id of ids) {
    if (isGuest(id, p)) continue;
    const from = levelOf(id, p);
    p.exp[id] = expOf(id, p) + amount;
    const to = levelOf(id, p);
    if (to > from) ups.push({ id, from, to });
  }
  return ups;
}

/** 처음 한 번만 주는 경험치 (조사, 의뢰, 단련, 전투 이벤트). 이미 받았으면 [] */
export function gainOnce(key: string, ids: string[], amount: number): LevelUp[] {
  const p = gameState.progress;
  if (p.once.includes(key)) return [];
  p.once.push(key);
  return gainExp(ids, amount);
}

/** 이야기를 끝까지 보면 다음 구간(최대 레벨)이 열린다 */
export function clearStory(storyId: string) {
  const stage = (levels.stageAfterStory as Record<string, string>)[storyId];
  if (!stage) return;
  const order = Object.keys(MAX);
  if (order.indexOf(stage) > order.indexOf(gameState.progress.stage)) gameState.progress.stage = stage;
}

/** 레벨에 따른 능력치 */
export function statsOf(id: string, level = levelOf(id)) {
  const d = (fighters.party as Record<string, { hp: number; atk: number; def: number; grow: { hp: number; atk: number; def: number } }>)[id];
  if (!d) return null;
  const n = level - 1;
  return { hp: d.hp + d.grow.hp * n, atk: d.atk + d.grow.atk * n, def: d.def + d.grow.def * n };
}
