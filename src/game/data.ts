import charactersJson from '../data/characters.json';
import endingsJson from '../data/endings.json';
import type { CharacterDef, DialogueData, TitleCardDef } from './types';

export const characters: Record<string, CharacterDef> = {};
for (const c of charactersJson.characters as CharacterDef[]) characters[c.id] = c;

export const endings = endingsJson.endings as Record<string, TitleCardDef>;
export const chapters = endingsJson.chapters as Record<string, TitleCardDef>;

/** src/data/dialogue/ 안의 JSON을 모두 자동으로 불러온다 */
const modules = import.meta.glob<DialogueData>('../data/dialogue/*.json', {
  eager: true,
  import: 'default',
});

export const dialogues: Record<string, DialogueData> = {};
for (const [path, d] of Object.entries(modules)) {
  if (!d?.id) {
    console.warn(`[data] id가 없는 대화 파일: ${path}`);
    continue;
  }
  dialogues[d.id] = d;
}
