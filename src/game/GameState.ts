import initialState from '../data/initialState.json';
import levels from '../data/battle/levels.json';
import expTable from '../data/exp.json';
import type { Condition, Effects, FlagValue } from './types';

/** 성장 기록: 인물별 경험치, 깬 구간(최대 레벨), 처음 한 번만 주는 경험치를 받은 곳 */
export interface Progress {
  exp: Record<string, number>;
  /** 깬 구간 (src/data/battle/levels.json의 maxLevel 키) */
  stage: string;
  /** 경험치를 이미 받은 조사·이벤트 ID */
  once: string[];
  /** 지금 파티 (대본의 join으로 늘어남) */
  party: string[];
  /** 열린 조작 (대본의 unlock으로 열림. move는 처음부터) */
  unlocks: string[];
  /** 인물별 도트 겉모습 (대본의 costume. 없으면 기본 그림) */
  costume: Record<string, string>;
  /** 임시 동료: 인물 ID → 들어온 순간의 레온 레벨 (경험치를 받지 않고 이 레벨로 고정. 대본의 guest) */
  guests: Record<string, number>;
  /** 대기 동료: 파티에 있지만 출전하지 않는 인물 (파티 선택 화면. 동료가 5명 이상일 때) */
  bench: string[];
}

export interface StateData {
  affection: Record<string, number>;
  flags: Record<string, FlagValue>;
  progress: Progress;
}

export const freshProgress = (): Progress => ({ exp: {}, stage: 'start', once: [], party: ['leon'], unlocks: ['move'], costume: {}, guests: {}, bench: [] });

/** 예전 저장(조작이 레벨로 열리던 때)의 열린 조작: 그때 레온의 레벨로 열려 있던 것 */
function legacyUnlocks(p: Partial<Progress>): string[] {
  const exp = p.exp?.leon ?? 0;
  const table: number[] = expTable.levels;
  let l = 1;
  while (l < table.length && exp >= table[l]) l++;
  l = Math.min(l, (expTable.maxLevel as Record<string, number>)[p.stage ?? 'start'] ?? l);
  return levels.unlocks.filter((u) => u.level <= l).map((u) => u.what);
}

function fresh(): StateData {
  return {
    affection: { ...initialState.affection },
    flags: { ...(initialState.flags as Record<string, FlagValue>) },
    progress: freshProgress(),
  };
}

function compare(a: FlagValue | undefined, op: NonNullable<Condition['op']>, b: FlagValue): boolean {
  switch (op) {
    case '==': return a === b;
    case '!=': return a !== b;
    case '>=': return Number(a) >= Number(b);
    case '<=': return Number(a) <= Number(b);
    case '>': return Number(a) > Number(b);
    case '<': return Number(a) < Number(b);
  }
}

/** 지금 진행 중인 게임의 호감도와 플래그. 저장은 save.ts의 이어하기 지점에 함께 들어간다 */
class GameState {
  private data: StateData = fresh();

  getAffection(key: string): number {
    return this.data.affection[key] ?? 0;
  }

  addAffection(key: string, delta: number) {
    if (!(key in initialState.affection)) {
      console.warn(`[state] 알 수 없는 호감도 키: ${key}`);
    }
    this.data.affection[key] = this.getAffection(key) + delta;
  }

  getFlag(key: string): FlagValue | undefined {
    return this.data.flags[key];
  }

  setFlag(key: string, value: FlagValue) {
    this.data.flags[key] = value;
  }

  applyEffects(e?: Effects) {
    if (!e) return;
    for (const [k, v] of Object.entries(e.affection ?? {})) this.addAffection(k, v);
    for (const [k, v] of Object.entries(e.flags ?? {})) this.setFlag(k, v);
  }

  check(c?: Condition): boolean {
    if (!c) return true;
    if (c.all && !c.all.every((x) => this.check(x))) return false;
    if (c.any && !c.any.some((x) => this.check(x))) return false;
    if (c.affection !== undefined) {
      return compare(this.getAffection(c.affection), c.op ?? '>=', c.value ?? 0);
    }
    if (c.flag !== undefined) {
      return compare(this.getFlag(c.flag), c.op ?? '==', c.value ?? true);
    }
    return true;
  }

  /** 성장 기록 (직접 고치면 바로 반영) */
  get progress(): Progress {
    return this.data.progress;
  }

  /** 현재 상태 사본 */
  snapshot(): StateData {
    return JSON.parse(JSON.stringify(this.data));
  }

  /** 저장해 둔 상태로 되돌린다 (빠진 키는 기본값) */
  restore(s: Partial<StateData>) {
    const base = fresh();
    this.data = {
      affection: { ...base.affection, ...(s.affection ?? {}) },
      flags: { ...base.flags, ...(s.flags ?? {}) },
      progress: { ...base.progress, ...(s.progress ?? {}) },
    };
    // 예전 저장에 없던 값
    const p = this.data.progress;
    if (s.progress && !s.progress.unlocks) p.unlocks = legacyUnlocks(s.progress);
    if (!Array.isArray(p.party) || !p.party.length) p.party = ['leon'];
    if (!p.unlocks.includes('move')) p.unlocks.unshift('move');
    p.costume ??= {};
    p.guests ??= {};
    if (!Array.isArray(p.bench)) p.bench = [];
  }

  reset() {
    this.data = fresh();
  }
}

export const gameState = new GameState();
