import initialState from '../data/initialState.json';
import type { Condition, Effects, FlagValue } from './types';

export interface StateData {
  affection: Record<string, number>;
  flags: Record<string, FlagValue>;
}

function fresh(): StateData {
  return {
    affection: { ...initialState.affection },
    flags: { ...(initialState.flags as Record<string, FlagValue>) },
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
    };
  }

  reset() {
    this.data = fresh();
  }
}

export const gameState = new GameState();
