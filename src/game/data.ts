import charactersJson from '../data/characters.json';
import { TEST_STORY } from '../dev/testStory';
import type { CharacterDef, EndingDef, StoryData } from './types';

export const characters: Record<string, CharacterDef> = {};
for (const c of charactersJson.characters as CharacterDef[]) characters[c.id] = c;

/** src/data/dialogue/ 안의 JSON(대본에서 만든 이야기)을 모두 자동으로 불러온다 */
const modules = import.meta.glob<StoryData>('../data/dialogue/*.json', {
  eager: true,
  import: 'default',
});

export const stories: Record<string, StoryData> = {};
for (const [path, d] of Object.entries(modules)) {
  if (!d?.id || !Array.isArray(d.scenes)) {
    console.warn(`[data] 이야기 형식이 아닌 파일: ${path}`);
    continue;
  }
  stories[d.id] = d;
}

// 개발 중에만: 시험 이야기 (타이틀의 "개발 시험" 메뉴)
if (import.meta.env.DEV) stories[TEST_STORY.id] = TEST_STORY;

/** 첫 이야기 (새 게임이 시작하는 곳) */
export const FIRST_STORY = 'prologue';

/** 모든 이야기의 엔딩을 순서대로 (엔딩 목록 화면용) */
export function allEndings(): (EndingDef & { id: string })[] {
  const order = [FIRST_STORY, ...Object.keys(stories).filter((k) => k !== FIRST_STORY)];
  return order.flatMap((k) =>
    stories[k] ? Object.entries(stories[k].endings).map(([id, e]) => ({ id, ...e })) : [],
  );
}
