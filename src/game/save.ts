import type { FlagValue } from './types';

/**
 * 게임 밖에 남는 기록 (localStorage).
 * 저장이 안 되는 환경(시크릿 창, 저장 공간 차단 등)에서도 멈추지 않도록 모두 try/catch로 감싼다.
 */
const KEY = 'dot-rpg/meta/v1';

export interface Settings {
  /** 한 글자당 ms (0이면 바로 표시) */
  textDelay: number;
  /** 자동 진행: 글이 다 나온 뒤 기다리는 ms */
  autoDelay: number;
}

export interface Checkpoint {
  story: string;
  scene: string;
  /** 장면 안의 대사 번호 (없으면 장면 처음) */
  node?: number;
  /** 이야기를 끝까지 봤으면 true (이어하기 → 다음 막 안내 화면) */
  finished?: boolean;
  affection: Record<string, number>;
  flags: Record<string, FlagValue>;
}

interface Meta {
  settings: Settings;
  endings: string[];
  read: string[];
  checkpoint: Checkpoint | null;
}

export const TEXT_SPEEDS = [
  { label: '느리게', value: 50 },
  { label: '보통', value: 30 },
  { label: '빠르게', value: 12 },
  { label: '즉시', value: 0 },
];
export const AUTO_SPEEDS = [
  { label: '느리게', value: 2600 },
  { label: '보통', value: 1600 },
  { label: '빠르게', value: 800 },
];

const fresh = (): Meta => ({
  settings: { textDelay: 30, autoDelay: 1600 },
  endings: [],
  read: [],
  checkpoint: null,
});

function load(): Meta {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return fresh();
    const p = JSON.parse(raw) as Partial<Meta>;
    const base = fresh();
    return {
      settings: { ...base.settings, ...(p.settings ?? {}) },
      endings: Array.isArray(p.endings) ? p.endings : [],
      read: Array.isArray(p.read) ? p.read : [],
      checkpoint: p.checkpoint ?? null,
    };
  } catch (err) {
    console.warn('[save] 기록을 읽지 못했습니다. 새로 시작합니다', err);
    return fresh();
  }
}

const meta = load();
const readSet = new Set(meta.read);
let writeTimer: number | undefined;

function write() {
  try {
    meta.read = [...readSet];
    window.localStorage.setItem(KEY, JSON.stringify(meta));
  } catch (err) {
    console.warn('[save] 저장하지 못했습니다 (게임은 계속 진행됩니다)', err);
  }
}

/** 읽은 대사처럼 자주 바뀌는 것은 모아서 저장 */
function writeSoon() {
  if (writeTimer !== undefined) return;
  writeTimer = window.setTimeout(() => {
    writeTimer = undefined;
    write();
  }, 500);
}

export const save = {
  get settings(): Settings {
    return { ...meta.settings };
  },
  setSettings(s: Partial<Settings>) {
    Object.assign(meta.settings, s);
    write();
  },

  hasSeenEnding: (id: string) => meta.endings.includes(id),
  markEnding(id: string) {
    if (!meta.endings.includes(id)) meta.endings.push(id);
    write();
  },

  isRead: (key: string) => readSet.has(key),
  markRead(key: string) {
    if (readSet.has(key)) return;
    readSet.add(key);
    writeSoon();
  },

  get checkpoint(): Checkpoint | null {
    return meta.checkpoint ? JSON.parse(JSON.stringify(meta.checkpoint)) : null;
  },
  setCheckpoint(c: Checkpoint) {
    meta.checkpoint = JSON.parse(JSON.stringify(c));
    write();
  },
};
