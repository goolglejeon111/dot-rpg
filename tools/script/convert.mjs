// 대본(docs/대본/*.md) → 대화 데이터(src/data/dialogue/*.json)
// 사용법: npm run script
import { readFileSync, writeFileSync } from 'node:fs';
import { parseScript } from './parse.mjs';
import { STORIES } from './stories.mjs';

let failed = false;
for (const cfg of STORIES) {
  const { story, warnings } = parseScript(readFileSync(cfg.source, 'utf8'), cfg);
  for (const w of warnings) console.warn(`[${cfg.id}] 경고: ${w}`);
  if (warnings.length) failed = true;
  writeFileSync(cfg.output, `${format(story)}\n`);
  const count = story.scenes.reduce((a, s) => a + s.nodes.length, 0);
  console.log(`${cfg.source} → ${cfg.output} (장면 ${story.scenes.length}개, 항목 ${count}개)`);
}
if (failed) process.exitCode = 1;

/** 노드는 한 줄에 하나씩 써서 사람이 고치기 쉽게 */
function format(story) {
  const j = (v) => JSON.stringify(v);
  const scenes = story.scenes.map((s) => {
    const { nodes, ...head } = s;
    const body = nodes.map((n) => `        ${j(n)}`).join(',\n');
    const headStr = Object.entries(head).map(([k, v]) => `"${k}": ${j(v)}`).join(', ');
    return `    {\n      ${headStr},\n      "nodes": [\n${body}\n      ]\n    }`;
  });
  const obj = (o) => `{\n${Object.entries(o).map(([k, v]) => `    "${k}": ${j(v)}`).join(',\n')}\n  }`;
  return [
    '{',
    `  "id": ${j(story.id)},`,
    `  "title": ${j(story.title)},`,
    `  "source": ${j(story.source)},`,
    `  "endings": ${obj(story.endings)},`,
    `  "chapters": ${obj(story.chapters)},`,
    `  "scenes": [\n${scenes.join(',\n')}\n  ]`,
    '}',
  ].join('\n');
}
