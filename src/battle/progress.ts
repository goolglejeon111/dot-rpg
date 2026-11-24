import levels from '../data/battle/levels.json';
import fighters from '../data/battle/fighters.json';
import { gameState, type Progress } from '../game/GameState';

/**
 * 레벨과 경험치.
 * 경험치는 넘쳐도 그대로 쌓아 두고, 레벨은 "경험치로 닿는 레벨"과 "지금 구간의 최대 레벨" 중 작은 값.
 * 그래서 최대 레벨에서 넘친 경험치는 다음 구간이 열리면 저절로 반영된다.
 */
export type Unlock = 'move' | 'evade' | 'skill' | 'ult' | 'combo';

export const PARTY_IDS = Object.keys(fighters.party);
const EXP: number[] = levels.exp;
const MAX: Record<string, number> = levels.maxLevel;

export const maxLevel = (p: Progress = gameState.progress) => MAX[p.stage] ?? MAX.start;
export const expOf = (id: string, p: Progress = gameState.progress) => p.exp[id] ?? 0;

/** 경험치만으로 닿는 레벨 */
export function rawLevel(exp: number) {
  let l = 1;
  while (l < EXP.length && exp >= EXP[l]) l++;
  return l;
}

export const levelOf = (id: string, p: Progress = gameState.progress) => Math.min(rawLevel(expOf(id, p)), maxLevel(p));
export const isCapped = (id: string) => levelOf(id) >= maxLevel();

/** 지금 레벨 안에서의 진행 (0~1). 최대 레벨이면 1 */
export function levelProgress(id: string) {
  const l = levelOf(id);
  if (l >= maxLevel() || l >= EXP.length) return 1;
  const a = EXP[l - 1];
  const b = EXP[l];
  return Math.max(0, Math.min(1, (expOf(id) - a) / (b - a)));
}

export const unlockLevel = (what: Unlock) => levels.unlocks.find((u) => u.what === what)?.level ?? 1;
export const isUnlocked = (id: string, what: Unlock) => levelOf(id) >= unlockLevel(what);

export interface LevelUp {
  id: string;
  from: number;
  to: number;
  unlocked: { what: Unlock; name: string; guide: string }[];
}

/** 경험치를 준다. ids = 받는 인물 (파티 전원 같은 양). 레벨이 오르면 그 내용을 돌려준다 */
export function gainExp(ids: string[], amount: number, p: Progress = gameState.progress): LevelUp[] {
  const ups: LevelUp[] = [];
  if (amount <= 0) return ups;
  for (const id of ids) {
    const from = levelOf(id, p);
    p.exp[id] = expOf(id, p) + amount;
    const to = levelOf(id, p);
    if (to > from) ups.push({ id, from, to, unlocked: unlocksBetween(from, to) });
  }
  return ups;
}

const unlocksBetween = (from: number, to: number) =>
  levels.unlocks.filter((u) => u.level > from && u.level <= to) as LevelUp['unlocked'];

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
