import Phaser from 'phaser';

/**
 * 있을 수도, 없을 수도 있는 그림 파일 (스탠딩, CG, 엔딩 일러스트 등).
 * 정해진 경로에 파일을 넣기만 하면 코드 수정 없이 나온다.
 */

/** 파일이 실제 이미지인지 확인 (없는 파일이면 개발 서버가 HTML을 돌려줄 수 있음) */
const existsCache = new Map<string, Promise<boolean>>();
export function imageExists(url: string): Promise<boolean> {
  let p = existsCache.get(url);
  if (!p) {
    p = fetch(url, { method: 'HEAD' })
      .then((r) => r.ok && (r.headers.get('content-type') ?? '').startsWith('image/'))
      .catch(() => false);
    existsCache.set(url, p);
  }
  return p;
}

/** 있는 그림만 불러온다 (고해상도 그림이라 부드럽게 줄이도록 LINEAR). 이미 있는 키는 건너뜀 */
export async function loadOptional(scene: Phaser.Scene, list: { key: string; url: string }[]) {
  const todo = list.filter((w, i) => !scene.textures.exists(w.key) && list.findIndex((x) => x.key === w.key) === i);
  if (!todo.length) return;
  const found = await Promise.all(todo.map((w) => imageExists(w.url)));
  const files = todo.filter((_, i) => found[i]);
  if (!files.length) return;
  await new Promise<void>((resolve) => {
    for (const w of files) scene.load.image(w.key, w.url);
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      for (const w of files) if (scene.textures.exists(w.key)) scene.textures.get(w.key).setFilter(Phaser.Textures.FilterMode.LINEAR);
      resolve();
    });
    scene.load.start();
  });
}

/** 엔딩 일러스트: public/assets/endings/{엔딩 ID}.png (4:3) */
export const endingKey = (id: string) => `ending_${id}`;
export const loadEndingArt = (scene: Phaser.Scene, ids: string[]) =>
  loadOptional(scene, ids.map((id) => ({ key: endingKey(id), url: `assets/endings/${id}.png` })));

/** 비율을 유지한 채 w x h를 꽉 채운다 (넘치는 쪽은 잘림) */
export function coverFit(img: Phaser.GameObjects.Image, w: number, h: number) {
  const k = Math.max(w / img.width, h / img.height);
  return img.setScale(k).setPosition(w / 2, h / 2);
}

/** 비율을 유지한 채 w x h 안에 다 들어가게 */
export function containFit(img: Phaser.GameObjects.Image, w: number, h: number) {
  return img.setScale(Math.min(w / img.width, h / img.height));
}
