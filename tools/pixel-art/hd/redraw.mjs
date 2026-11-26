// 예전 그림 코드를 고해상도 캔버스(hicv.mjs)로 다시 실행해 타일·물건·생물을 새로 그린다.
// gen-palace.mjs(타일·물건)와 creatures.mjs(생물)의 그리는 코드는 그대로 두고, 캔버스만 HiCv로 바꿔 불러온다.
// (파일을 쓰는 끝부분은 잘라 내고 목록만 받는다)
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const HI = new URL('./hicv.mjs', import.meta.url).href;
const BASE = new URL('../', import.meta.url);

async function load(file, cut, exportLine) {
  let src = readFileSync(new URL(file, BASE), 'utf8');
  src = src.replace(/import \{([^}]*)\} from '\.\/cv\.mjs';/, (_, names) => {
    const list = names.split(',').map((s) => s.trim()).filter(Boolean).map((n) => (n === 'Cv' ? 'HiCv as Cv' : n));
    return `import { ${list.join(', ')} } from '${HI}';`;
  });
  src = src.replace(/from '\.\/([^']+)'/g, (_, f) => `from '${new URL(f, BASE).href}'`);
  // 격자로 찍던 점 무늬((x + y * 3) % 23 === 0 같은 것, 7칸 이상 간격)는 2배에서 사선 줄로 드러나므로 흩뿌림으로 바꿈
  src = src.replace(/\(([^()]*\bx\b[^()]*\by\b[^()]*)\) % (\d+) === 0/g, (m, e, n) => (+n >= 7 ? `__scatter(x, y, ${n}, '${e}')` : m));
  src = `import { scatter as __scatter } from '${HI}';\n` + src;
  if (cut) {
    const i = src.indexOf(cut);
    if (i < 0) throw new Error(`${file}: 자를 곳 "${cut}" 없음`);
    src = src.slice(0, i);
  }
  src += `\n${exportLine}\n`;
  const out = join(tmpdir(), `dotrpg_hi_${file.replace(/\W/g, '_')}.mjs`);
  writeFileSync(out, src);
  return import(pathToFileURL(out).href + `?t=${Date.now()}`);
}

/** { TILES: [{key, cv}], PROPS: [{key, w, h, frames}], ITEMS } (gen-palace.mjs 그림, 고해상도) */
export const palaceHi = () => load('gen-palace.mjs', '// 파일 쓰기', 'export { TILES, PROPS, ITEMS };');
/** { CREATURES } (creatures.mjs 그림, 고해상도) */
export const creaturesHi = () => load('creatures.mjs', null, '');
