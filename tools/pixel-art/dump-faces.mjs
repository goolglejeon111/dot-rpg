// 큰 얼굴 지도를 faces/{id}.mjs 에 적는다 (이미 big 이 있는 파일은 --force 없이는 건드리지 않음)
// 인상은 docs/캐릭터디자인.md 를 옮긴 표(LOOK). 적은 뒤에는 파일을 손으로 다듬는다.
import { readFileSync, writeFileSync } from 'node:fs';
import { make, makeSide } from './hd/bigface.mjs';

const LOOK = {
  leon: { eyes: 'sharp', brow: 'flat', mouth: 'line' }, // 날카로운 회청색 눈, 진지한 일자 눈썹
  serena: { eyes: 'round', brow: 'soft', mouth: 'small', girl: true, blush: true }, // 큰 붉은 눈, 앳된 얼굴
  elysia: { eyes: 'calm', brow: 'soft', mouth: 'small', girl: true, blush: true }, // 부드럽고 약간 처진 눈매
  karg: { eyes: 'fierce', brow: 'fierce', mouth: 'fang' }, // 치켜뜬 사나운 눈, 송곳니
  adrian: { eyes: 'sharp', brow: 'flat', mouth: 'line' },
  galia: { eyes: 'sharp', brow: 'sharp', mouth: 'line', girl: true, scar: true }, // 초록 눈, 왼뺨 흉터
  bram: { eyes: 'round', brow: 'flat', mouth: 'smirk' }, // 자신만만한 웃음
  oswald: { eyes: 'sharp', brow: 'heavy', mouth: 'frown' }, // 찌푸린 얼굴
  aldric: { eyes: 'calm', brow: 'soft', mouth: 'small', wrinkle: true }, // 야위고 지친 얼굴, 눈 밑 그늘
  marcion: { eyes: 'narrow', brow: 'flat', mouth: 'line' },
  ignatius: { eyes: 'calm', brow: 'soft', mouth: 'smile', wrinkle: true }, // 온화한 얼굴
  herman: { eyes: 'narrow', brow: 'flat', mouth: 'smirk' }, // 가는 눈, 비열한 미소
  cassius: { eyes: 'sharp', brow: 'plain', mouth: 'line', wrinkle: true },
  ursha: { eyes: 'calm', brow: 'soft', mouth: 'smile', girl: true, wrinkle: true }, // 주름진 온화한 얼굴
  blacksmith: { eyes: 'small', brow: 'heavy', mouth: 'frown', wrinkle: true }, // 무뚝뚝한 얼굴
  dwarf_smith: { eyes: 'round', brow: 'flat', mouth: 'grin', girl: true, freckles: true }, // 호박색 눈, 주근깨, 자신만만한 웃음
  dwarf_gatekeeper: { eyes: 'small', brow: 'heavy', mouth: 'line' },
  dwarf_kid: { eyes: 'round', brow: 'thin', mouth: 'smile', freckles: true },
  dwarf_kid2: { eyes: 'round', brow: 'soft', mouth: 'smile', blush: true },
  dwarf_kid3: { eyes: 'small', brow: 'thin', mouth: 'grin' },
  extra_a: { eyes: 'sharp', brow: 'flat', mouth: 'line' },
  extra_b: { eyes: 'small', brow: 'heavy', mouth: 'frown' },
  extra_c: { eyes: 'narrow', brow: 'plain', mouth: 'small' },
  extra_d: { eyes: 'round', brow: 'thin', mouth: 'line' },
  wolf_a: { eyes: 'fierce', brow: 'sharp', mouth: 'line' },
  wolf_b: { eyes: 'narrow', brow: 'flat', mouth: 'fang' },
  wolf_c: { eyes: 'small', brow: 'soft', mouth: 'smile' },
};
const force = process.argv.includes('--force');
const fmt = (m) => `{ at: [${m.at.join(', ')}], rows: [\n${m.rows.map((r) => `      '${r}',`).join('\n')}\n    ] }`;
for (const [id, o] of Object.entries(LOOK)) {
  const f = new URL(`./hd/faces/${id}.mjs`, import.meta.url);
  let src = readFileSync(f, 'utf8');
  if (src.includes('  big: {')) {
    if (!force) continue;
    src = src.replace(/\n {2}big: \{[\s\S]*?\n {2}\},\n/, '\n');
  }
  const big = `  big: {\n    down: ${fmt(make(o))},\n    right: ${fmt(makeSide(o))},\n  },\n`;
  src = src.replace(/export default \{\n/, `export default {\n${big}`);
  writeFileSync(f, src);
  console.log('적음', id);
}
