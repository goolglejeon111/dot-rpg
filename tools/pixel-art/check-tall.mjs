// 큰 머리 인물 비율 검사 (docs/도트기준.md 2절: 머리 = 키 ÷ 3~3.5 (그림 26~30칸)): node tools/pixel-art/check-tall.mjs
// 머리 폭(머리카락 포함), 어깨 폭(팔 포함), 등신(키 / 머리 길이)을 보기마다 출력
import { drawTall, specOf, FOOT_T, BODY_DOWN } from './hd/tall.mjs';
import { PEOPLE } from './hd/people.mjs';
const width = (L, y0, y1) => {
  let a = 99, b = -1;
  for (let y = y0; y <= y1; y++) for (let x = 0; x < L.d[y].length; x++) if (L.d[y][x]) { a = Math.min(a, x); b = Math.max(b, x); }
  return b - a + 1;
};
let bad = 0;
for (const id of Object.keys(PEOPLE).filter((k) => !k.includes('_v'))) {
  const s = specOf(id);
  const o = s.drop ?? 0;
  const row = [];
  for (const v of ['down', 'right', 'up']) {
    // 맨몸 비율(든 물건·망토 빼고) — battle 모드로 든 물건 숨김
    const L = drawTall(id, v, { battle: true });
    let top = 0;
    while (top < 96 && !L.d[top].some((c, x) => c && x > 16 && x < 48)) top++;
    const chin = 31 + BODY_DOWN + o;
    const head = width(L, 10 + o, 26 + o);
    const sh = width(L, 42 + o, 45 + o);
    const heads = (FOOT_T + 1 - top) / (chin + 1 - top);
    const ratio = sh / head;
    row.push(`${v}: 머리 ${head} 어깨 ${sh} (${ratio.toFixed(2)}배) ${heads.toFixed(2)}등신`);
    if (v === 'down' && !s.hood && !s.helmet && !s.ears && (s.drop ?? 0) < 9 && (ratio < 0.7 || ratio > 1.2 || heads < 2.95 || heads > 3.5)) bad++;
  }
  console.log(id.padEnd(12), row.join(' | '));
}
console.log(bad ? `기준 밖 ${bad}` : '모두 기준 안');
