import Phaser from 'phaser';
import { FONT } from './ui';

/**
 * 이벤트 CG (막마다 1장). 그림 파일은 public/assets/cg/{id}.png (4:3).
 * 파일이 아직 없으면 어두운 판에 제목만 적은 임시 그림을 쓴다.
 */
export const CG_LIST: { id: string; title: string; story: string }[] = [
  { id: 'act1_elysia', title: '수로의 마법사', story: 'act1' },
  { id: 'act2_pillar', title: '지평선의 빛 기둥', story: 'act2' },
];

export const cgKey = (id: string) => `cg_${id}`;
const CG_W = 960;
const CG_H = 720;

/** 파일이 실제 이미지인지 확인 (없는 파일이면 개발 서버가 HTML을 돌려줄 수 있음) */
const existsCache = new Map<string, Promise<boolean>>();
function imageExists(url: string): Promise<boolean> {
  let p = existsCache.get(url);
  if (!p) {
    p = fetch(url, { method: 'HEAD' })
      .then((r) => r.ok && (r.headers.get('content-type') ?? '').startsWith('image/'))
      .catch(() => false);
    existsCache.set(url, p);
  }
  return p;
}

/** 임시 그림: 위아래로 어두워지는 판, 가는 금테, 가운데 제목 */
function makeCgPlaceholder(scene: Phaser.Scene, id: string) {
  const tex = scene.textures.createCanvas(cgKey(id), CG_W, CG_H);
  if (!tex) return;
  const ctx = tex.getContext();
  const grd = ctx.createLinearGradient(0, 0, 0, CG_H);
  grd.addColorStop(0, '#1c1a2a');
  grd.addColorStop(0.55, '#0e0d16');
  grd.addColorStop(1, '#06060a');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, CG_W, CG_H);
  ctx.strokeStyle = 'rgba(205,184,138,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, CG_W - 48, CG_H - 48);
  const title = CG_LIST.find((c) => c.id === id)?.title ?? id;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(224,194,122,0.8)';
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillText(title, CG_W / 2, CG_H / 2 - 40);
  ctx.fillStyle = 'rgba(160,160,170,0.6)';
  ctx.font = `20px ${FONT}`;
  ctx.fillText('(이벤트 CG 준비 중)', CG_W / 2, CG_H / 2 + 4);
  tex.refresh();
}

/** CG 그림을 불러온다. 없는 파일은 임시 그림으로 */
export async function loadCgs(scene: Phaser.Scene, ids: string[]) {
  const todo = [...new Set(ids)].filter((id) => !scene.textures.exists(cgKey(id)));
  if (!todo.length) return;
  const found = await Promise.all(todo.map((id) => imageExists(`assets/cg/${id}.png`)));
  const files = todo.filter((_, i) => found[i]);
  for (const id of todo) if (!files.includes(id)) makeCgPlaceholder(scene, id);
  if (!files.length) return;
  await new Promise<void>((resolve) => {
    for (const id of files) scene.load.image(cgKey(id), `assets/cg/${id}.png`);
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      for (const id of files) scene.textures.get(cgKey(id)).setFilter(Phaser.Textures.FilterMode.LINEAR);
      resolve();
    });
    scene.load.start();
  });
}

/** 화면(w x h)에 4:3 그림을 높이에 맞춰 가운데. 양옆은 검은 띠 */
export function fitCg(img: Phaser.GameObjects.Image, w: number, h: number) {
  const k = Math.min(w / img.width, h / img.height);
  return img.setScale(k).setPosition(w / 2, h / 2);
}
