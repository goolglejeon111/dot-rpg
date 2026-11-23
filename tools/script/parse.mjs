// 대본 md → 대화 데이터(JSON) 변환. convert.mjs, check.mjs가 함께 쓴다.
//
// 대본 표기
//   ## 제목 / ### ▶ N. 선택지     → 장면 하나
//   이름 (표정): 대사              → 대사
//   〔독백〕 다음 줄들              → 독백 (빈 줄로 나뉜 덩어리 = 한 화면)
//   > **[선택지]** + > 1. 내용      → 선택지
//   **DEAD END: 이름** / **BAD END: 이름** / **프롤로그 끝** → 엔딩

const EXPRESSIONS = { 기본: 'normal', 웃음: 'smile', 화남: 'angry', 슬픔: 'sad', 놀람: 'surprised' };
const LINE_RE = /^(.+?) \((기본|웃음|화남|슬픔|놀람)\): (.*)$/;
const ENDING_RE = /^\*\*(DEAD END|BAD END): (.+)\*\*$/;
const FINISH_RE = /^\*\*(.+) 끝\*\*$/;

/**
 * @param {string} md 대본 내용
 * @param {object} cfg 대본별 설정 (stories.mjs)
 */
export function parseScript(md, cfg) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const story = { id: cfg.id, title: '', source: cfg.source, endings: {}, chapters: {}, scenes: [] };
  const warnings = [];
  let scene = null;
  let mono = null; // 지금 모으는 독백 덩어리
  let inMono = false;
  let choice = null;
  let stopped = false;
  const endingCount = {};

  const flushMono = () => {
    if (mono && mono.length) scene.nodes.push({ monologue: mono });
    mono = null;
  };
  const push = (node) => {
    flushMono();
    scene.nodes.push(node);
  };

  for (const raw of lines) {
    if (stopped) break;
    const line = raw.trim();

    if (line.startsWith('# ') && !story.title) {
      story.title = line.slice(2).trim();
      continue;
    }
    const h = /^(##|###) (.+)$/.exec(line);
    if (h) {
      flushMono();
      inMono = false;
      const title = h[2].trim();
      if (cfg.stopAt && title.startsWith(cfg.stopAt)) {
        stopped = true;
        break;
      }
      const sc = cfg.scenes.find((s) => title.startsWith(s.match));
      if (!sc) warnings.push(`설정에 없는 장면 제목: ${title}`);
      scene = {
        id: sc?.id ?? `scene_${story.scenes.length}`,
        title,
        place: sc?.place ?? '',
        color: sc?.color ?? '#101018',
        ...(h[1] === '###' ? { branch: true } : {}),
        nodes: [],
      };
      story.scenes.push(scene);
      continue;
    }
    if (!scene) continue; // 제목 아래 표기 규칙 등
    if (line === '---') continue;

    // 선택지 블록
    if (line.startsWith('>')) {
      const body = line.replace(/^>\s?/, '').trim();
      if (/^\*\*\[선택지\]\*\*$/.test(body)) {
        flushMono();
        inMono = false;
        choice = { choices: [] };
        scene.nodes.push(choice);
        continue;
      }
      const opt = /^(\d+)\. (.+)$/.exec(body);
      if (choice && opt) {
        const n = Number(opt[1]);
        const target = cfg.scenes.find((s) => s.choice === n);
        if (!target) warnings.push(`선택지 ${n}번이 갈 장면이 설정에 없음`);
        choice.choices.push({
          text: opt[2],
          next: target?.id,
          flags: { [`${cfg.id}_choice`]: target?.id ?? String(n) },
        });
        continue;
      }
      warnings.push(`알 수 없는 인용 줄: ${line}`);
      continue;
    }
    choice = null;

    if (line === '') {
      if (inMono) flushMono();
      continue;
    }
    if (line === '〔독백〕') {
      flushMono();
      inMono = true;
      continue;
    }
    const end = ENDING_RE.exec(line);
    if (end) {
      inMono = false;
      const type = end[1] === 'DEAD END' ? 'dead' : 'bad';
      endingCount[type] = (endingCount[type] ?? 0) + 1;
      const id = `${cfg.id}_${type}${endingCount[type] > 1 ? `_${endingCount[type]}` : ''}`;
      story.endings[id] = { type, label: end[1], title: end[2] };
      push({ ending: id });
      continue;
    }
    const fin = FINISH_RE.exec(line);
    if (fin) {
      inMono = false;
      story.chapters[cfg.next.id] = { title: cfg.next.title, finished: `${fin[1]} 끝` };
      push({ chapter: cfg.next.id });
      continue;
    }
    const m = LINE_RE.exec(line);
    if (m) {
      inMono = false;
      const [, name, expr, text] = m;
      const id = cfg.names[name];
      push(id ? { speaker: id, expression: EXPRESSIONS[expr], text } : { name, expression: EXPRESSIONS[expr], text });
      continue;
    }
    if (inMono) {
      (mono ??= []).push(line);
      continue;
    }
    warnings.push(`처리하지 못한 줄: ${line}`);
  }
  flushMono();

  // 나중에 넣을 요소(전투, 장소 변경)를 표시한다
  for (const ins of cfg.inserts ?? []) {
    const sc = story.scenes.find((s) => s.id === ins.scene);
    const i = sc?.nodes.findIndex((n) => n.monologue?.[0] === ins.before || n.text === ins.before) ?? -1;
    if (!sc || i < 0) {
      warnings.push(`끼워 넣을 자리를 찾지 못함: ${ins.scene} / ${ins.before}`);
      continue;
    }
    sc.nodes.splice(i, 0, ins.node);
  }
  return { story, warnings };
}
