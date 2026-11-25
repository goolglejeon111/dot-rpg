// 대본(md)과 대화 데이터(json)가 한 줄도 빠짐없이 같은지 비교한다.
// 변환기와 따로, md의 글줄을 그대로 뽑아서 json에서 꺼낸 글줄과 순서대로 맞춰 본다.
// 사용법: npm run script:check
import { readFileSync } from 'node:fs';
import { STORIES } from './stories.mjs';

const EXPR = { normal: '기본', smile: '웃음', angry: '화남', sad: '슬픔', surprised: '놀람' };
let bad = 0;

for (const cfg of STORIES) {
  const md = readFileSync(cfg.source, 'utf8').replace(/\r\n?/g, '\n').split('\n');
  const data = JSON.parse(readFileSync(cfg.output, 'utf8'));

  // md: 첫 제목, 표기 규칙(>로 시작하는 머리말), 구분선, 빈 줄, 〔독백〕, 메모 이후는 뺀다
  const a = [];
  let started = false;
  for (const raw of md) {
    const l = raw.trim();
    if (l.startsWith('## ') || l.startsWith('### ')) {
      if (l.slice(l.indexOf(' ') + 1).startsWith(cfg.stopAt)) break;
      started = true;
    }
    if (!started || l === '' || l === '---' || l === '〔독백〕' || l === '> **[선택지]**') continue;
    if (/^> 엔딩 후일담/.test(l)) continue; // 후일담은 엔딩 목록에서 보여 줌 (대사 아님)
    // stories.mjs의 rewrites(게임에서만 바꿔 쓰는 대사)는 바뀐 대사로 맞춰 본다
    const rw = (cfg.rewrites ?? []).find((r) => l.startsWith(`${r.name} (`) && l.endsWith(`): ${r.from}`));
    a.push((rw ? l.slice(0, l.length - rw.from.length) + rw.to : l).replace(/^> /, ''));
  }

  // stories.mjs의 monoEdits(게임에서만 줄이거나 뺀 독백)도 대본 쪽에 똑같이 적용해서 맞춰 본다
  for (const e of cfg.monoEdits ?? []) {
    const i = a.findIndex((_, k) => e.from.every((l, j) => a[k + j] === l));
    if (i >= 0) a.splice(i, e.from.length, ...e.to);
    else console.log(`  줄이거나 뺄 독백을 대본에서 찾지 못함: ${e.from[0]}`);
  }

  // json → 같은 모양의 글줄
  // 인물 ID → 대본 이름 (한 인물에 이름이 여럿이면 처음 적은 것. 다른 이름은 데이터의 name에 남아 있음)
  const names = Object.fromEntries(Object.entries(cfg.names).reverse().map(([k, v]) => [v, k]));
  const b = [];
  for (const s of data.scenes) {
    b.push(`${s.branch ? '###' : '##'} ${s.title}`);
    for (const n of s.nodes) {
      if (n.monologue) b.push(...n.monologue);
      else if (n.text !== undefined) b.push(`${n.speaker ? n.name ?? names[n.speaker] ?? n.speaker : n.name} (${EXPR[n.expression]}): ${n.text}`);
      else if (n.choices) n.choices.forEach((c, i) => b.push(`${i + 1}. ${c.text}`));
      else if (n.ending) b.push(`**${data.endings[n.ending].label}: ${data.endings[n.ending].title}**`);
      else if (n.chapter) b.push(`**${data.chapters[n.chapter].finished}**`);
    }
  }

  let diff = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      if (diff++ < 10) console.log(`  ${i + 1}번째 줄이 다름\n    대본: ${a[i] ?? '(없음)'}\n    데이터: ${b[i] ?? '(없음)'}`);
    }
  }
  console.log(`[${cfg.id}] 대본 ${a.length}줄 / 데이터 ${b.length}줄 → ${diff ? `다른 줄 ${diff}개` : '모두 같음'}`);
  bad += diff;

  // 추가 연출(컷인, 이벤트 CG, 상처 반응)과 강조 문장이 stories.mjs에 적은 자리에 그대로 들어갔는지
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const isLine = (n) => n.monologue || n.text !== undefined || n.choices;
  let fxBad = 0;
  const fxIns = (cfg.inserts ?? []).filter((i) => ['cutin', 'cg', 'wound'].some((k) => k in i.node));
  for (const ins of fxIns) {
    const sc = data.scenes.find((s) => s.id === ins.scene);
    const at = sc?.nodes.findIndex((n) => n.monologue?.[0] === ins.before || n.text === ins.before) ?? -1;
    let ok = false;
    for (let k = at - 1; k >= 0 && !isLine(sc.nodes[k]); k--) if (same(sc.nodes[k], ins.node)) ok = true;
    if (at < 0 || !ok) {
      fxBad++;
      console.log(`  연출이 빠짐: ${ins.scene} / ${ins.before} / ${JSON.stringify(ins.node)}`);
    }
  }
  for (const e of cfg.emphasis ?? []) {
    const sc = data.scenes.find((s) => s.id === e.scene);
    const n = sc?.nodes.find((x) => x.monologue?.includes(e.line) || x.text === e.line);
    const got = !n ? undefined : n.text === e.line ? n.emphasis : n.emphasis?.[n.monologue.indexOf(e.line)];
    if (!same(got, e.style)) {
      fxBad++;
      console.log(`  강조가 다름: ${e.scene} / ${e.line} / 설정 ${JSON.stringify(e.style)} / 데이터 ${JSON.stringify(got)}`);
    }
  }
  // 데이터에만 있는 연출·강조 (설정에서 지웠는데 변환을 안 했을 때)
  const fxCount = data.scenes.flatMap((s) => s.nodes).filter((n) => 'cutin' in n || 'cg' in n || 'wound' in n).length;
  const emCount = data.scenes.flatMap((s) => s.nodes).reduce((c, n) => c + (n.emphasis ? (n.text !== undefined ? 1 : Object.keys(n.emphasis).length) : 0), 0);
  if (fxCount !== fxIns.length || emCount !== (cfg.emphasis ?? []).length) {
    fxBad++;
    console.log(`  연출 수가 다름: 설정 ${fxIns.length}개·강조 ${(cfg.emphasis ?? []).length}개 / 데이터 ${fxCount}개·강조 ${emCount}개`);
  }
  console.log(`[${cfg.id}] 추가 연출 ${fxIns.length}개 · 강조 ${(cfg.emphasis ?? []).length}개 → ${fxBad ? `다른 곳 ${fxBad}개` : '모두 같음'}`);
  bad += fxBad;
}
if (bad) process.exitCode = 1;
