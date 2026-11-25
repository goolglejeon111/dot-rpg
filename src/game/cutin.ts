import Phaser from 'phaser';
import { characters } from './data';
import { PORTRAIT_W } from './placeholders';

/** 스탠딩 그림({id}_body.png)이 실제로 있고(회색 실루엣이 아니고) 눈 자리(characters.json의 cutin)가 있는지 */
export function hasCutin(scene: Phaser.Scene, id: string) {
  const key = `${id}_body`;
  return !!characters[id]?.cutin && scene.textures.exists(key) && scene.textures.get(key).getSourceImage().width !== PORTRAIT_W;
}

/** 띠 안에 눈매를 잘라 넣은 그림 (띠 가운데가 0,0). 컷인이 없으면 null */
export function eyeImage(scene: Phaser.Scene, id: string, bandW: number, bandH: number) {
  const eye = characters[id]?.cutin;
  if (!eye || !hasCutin(scene, id)) return null;
  const k = eye.scale;
  const cw = bandW / k;
  const ch = bandH / k;
  const x0 = eye.x - cw / 2;
  const y0 = eye.y - ch / 2;
  return scene.add
    .image(0, 0, `${id}_body`)
    .setOrigin(0, 0)
    .setCrop(x0, y0, cw, ch)
    .setScale(k)
    .setPosition(-bandW / 2 - x0 * k, -bandH / 2 - y0 * k);
}
