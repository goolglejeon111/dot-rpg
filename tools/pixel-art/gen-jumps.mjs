// 점프 장애물 그림 시트: public/assets/explore/jumps.png (한 줄에 4칸, 칸 64x64 = 논리 32x32의 2배)
// 실행: node tools/pixel-art/gen-jumps.mjs (gen-hd.mjs 도 끝에서 같은 그림을 만든다)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finish, putRGBA } from './hd/hicv.mjs';
import { K } from './hd/layer.mjs';
import { encodePNG } from './png.mjs';
import { JUMP_ART } from './hd/jumps.mjs';

export function jumpSheet() {
  const layers = Object.values(JUMP_ART).map((f) => finish(f(), { grain: 0.03 }));
  const cols = 4;
  const cw = 32 * K;
  const W = cw * cols;
  const H = cw * Math.ceil(layers.length / cols);
  const d = new Uint8Array(W * H * 4);
  layers.forEach((L, n) => putRGBA(d, W, L, (n % cols) * cw, Math.floor(n / cols) * cw));
  return encodePNG(W, H, d);
}

if (process.argv[1]?.endsWith('gen-jumps.mjs')) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  writeFileSync(join(root, 'public/assets/explore/jumps.png'), jumpSheet());
  console.log('만듦 public/assets/explore/jumps.png', Object.keys(JUMP_ART).join(', '));
}
