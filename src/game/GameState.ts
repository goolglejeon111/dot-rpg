import initialState from '../data/initialState.json';
import type { Condition, Effects, FlagValue } from './types';

const SAVE_KEY = 'dot-rpg/save/v1';

interface SaveData {
  version: 1;
  affection: Record<string, number>;
  flags: Record<string, FlagValue>;
}

function fresh(): SaveData {
  return {
    version: 1,
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

/** 호감도와 플래그. localStorage에 저장하며, 저장이 안 되는 환경에서도 멈추지 않는다. */
class GameState {
  private data: SaveData = fresh();

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

  /** 현재 상태 사본 (디버그, 화면 표시용) */
  snapshot(): SaveData {
    return JSON.parse(JSON.stringify(this.data));
  }

  save(): boolean {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
      return true;
    } catch (err) {
      console.warn('[state] 저장 실패 (게임은 계속 진행됩니다)', err);
      return false;
    }
  }

  load(): boolean {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const base = fresh();
      this.data = {
        version: 1,
        affection: { ...base.affection, ...(parsed.affection ?? {}) },
        flags: { ...base.flags, ...(parsed.flags ?? {}) },
      };
      return true;
    } catch (err) {
      console.warn('[state] 불러오기 실패, 새 게임으로 시작합니다', err);
      this.data = fresh();
      return false;
    }
  }

  reset() {
    this.data = fresh();
    this.save();
  }
}

export const gameState = new GameState();
