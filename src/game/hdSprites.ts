import hd from '../data/explore/hd_sprites.json';

/** 새 도트(32x48) 인물. 없으면 예전 도트(32x40) */
type Hd = { w: number; h: number; foot: number; rise: number };
const LIST = hd as unknown as Record<string, Hd | string>;
const info = (id: string) => {
  const v = LIST[id];
  return typeof v === 'object' ? v : undefined;
};

/** 필드 시트 한 칸 크기 */
export const fieldFrame = (id: string) => {
  const v = info(id);
  return { frameWidth: v?.w ?? 32, frameHeight: v?.h ?? 40 };
};

/** 발끝 기준점(스프라이트 origin y): 새 도트는 발끝이 칸 아래에서 foot칸 위 */
export const footOrigin = (key: string) => {
  const v = info(key);
  return v ? 1 - v.foot / v.h : 1;
};

/** 예전 도트보다 키가 큰 만큼 (머리 위 표시·체력바를 이만큼 올림). bt_ 전투 시트도 같은 인물로 봄 */
export const rise = (key: string) => info(key.replace(/^bt_/, ''))?.rise ?? 0;

export const isHd = (id: string) => !!info(id);
