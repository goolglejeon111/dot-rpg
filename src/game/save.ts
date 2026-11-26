import type { Progress } from './GameState';
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
  /** 전투 궁극기 컷인 */
  ultCutin: boolean;
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
  /** 성장 기록 (예전 저장에는 없음) */
  progress?: Progress;
}

interface Meta {
  settings: Settings;
  endings: string[];
  /** 보상을 받은 엔딩 */
  rewards: string[];
  read: string[];
  /** 한 번 본 이벤트 CG (타이틀의 CG 회상) */
  cgs: string[];
  checkpoint: Checkpoint | null;
  /** 장면의 첫 선택지를 처음 볼 때의 상태 ("이야기:장면" → 상태). 엔딩의 retry가 그 선택지 앞으로 돌아갈 때 쓴다 */
  choices: Record<string, ChoiceState>;
  /** 지나온 선택지 (선택지 기록 C). 고를 때마다 하나씩, 그 선택지 화면으로 돌아갈 때 쓴다 */
  choiceLog: ChoiceLogEntry[];
  /** 한 번이라도 고른 적 있는 선택지 ("이야기:장면:대사번호:선택지 글") */
  chosen: string[];
}

/** 선택지 기록 하나: 그 선택지 화면을 다시 만들 수 있는 값 */
export interface ChoiceLogEntry {
  story: string;
  scene: string;
  node: number;
  place: string;
  /** 고른 선택지 글 */
  text: string;
  /** 선택지가 뜰 때의 상태 (경험치, 레벨, 파티, 해금 포함) */
  state: ChoiceState;
  /** 그때의 화면: 인물, 마지막 글, CG, 상처 맥박 */
  view: unknown;
}

export interface ChoiceState {
  affection: Record<string, number>;
  flags: Record<string, FlagValue>;
  progress?: Progress;
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
  settings: { textDelay: 30, autoDelay: 1600, ultCutin: true },
  endings: [],
  rewards: [],
  read: [],
  cgs: [],
  checkpoint: null,
  choices: {},
  choiceLog: [],
  chosen: [],
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
      rewards: Array.isArray(p.rewards) ? p.rewards : [],
      read: Array.isArray(p.read) ? p.read : [],
      cgs: Array.isArray(p.cgs) ? p.cgs : [],
      checkpoint: p.checkpoint ?? null,
      choices: p.choices && typeof p.choices === 'object' ? p.choices : {},
      // 예전 저장에는 없음 → 빈 기록
      choiceLog: Array.isArray(p.choiceLog) ? p.choiceLog : [],
      chosen: Array.isArray(p.chosen) ? p.chosen : [],
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

  hasReward: (id: string) => meta.rewards.includes(id),
  /** 엔딩 보상 받기 표시. 경험치는 최신 저장(이어하기 지점)에 넣는다 */
  claimReward(id: string, apply: (cp: Checkpoint) => void) {
    if (meta.rewards.includes(id)) return false;
    meta.rewards.push(id);
    if (meta.checkpoint) apply(meta.checkpoint);
    write();
    return true;
  },

  hasCg: (id: string) => meta.cgs.includes(id),
  markCg(id: string) {
    if (meta.cgs.includes(id)) return;
    meta.cgs.push(id);
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
  /** 선택지 앞 상태 (엔딩의 retry). 같은 장면이면 새로 덮는다 */
  choiceState: (key: string): ChoiceState | null => (meta.choices[key] ? JSON.parse(JSON.stringify(meta.choices[key])) : null),
  setChoiceState(key: string, s: ChoiceState) {
    meta.choices[key] = JSON.parse(JSON.stringify(s));
    write();
  },
  get choiceCount() {
    return meta.choiceLog.length;
  },
  get choiceLog(): ChoiceLogEntry[] {
    return JSON.parse(JSON.stringify(meta.choiceLog));
  },
  addChoice(e: ChoiceLogEntry) {
    meta.choiceLog.push(JSON.parse(JSON.stringify(e)));
    if (!meta.chosen.includes(`${e.story}:${e.scene}:${e.node}:${e.text}`)) meta.chosen.push(`${e.story}:${e.scene}:${e.node}:${e.text}`);
    write();
  },
  /** 선택지 기록을 n개만 남긴다 (되감기·돌아가기로 그 뒤 진행이 사라질 때) */
  trimChoices(n: number) {
    if (meta.choiceLog.length <= n) return;
    meta.choiceLog.length = Math.max(0, n);
    write();
  },
  /** 이 이야기를 처음부터 다시 시작할 때: 그 이야기의 기록을 지운다 (프롤로그면 전부) */
  clearChoices(story: string, all = false) {
    meta.choiceLog = all ? [] : meta.choiceLog.filter((e) => e.story !== story);
    write();
  },
  hasChosen: (key: string) => meta.chosen.includes(key),
  setCheckpoint(c: Checkpoint) {
    meta.checkpoint = JSON.parse(JSON.stringify(c));
    write();
  },
};
