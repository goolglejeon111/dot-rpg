import Phaser from 'phaser';
import hd from '../data/explore/hd_sprites.json';

/**
 * 고해상도 도트 (docs/도트기준.md 0절)
 * 그림 파일은 K배(2배) 해상도로 그리고, 게임 안에서는 예전 크기(32px 타일, 32x48 인물)로 다룬다.
 * 그래서 좌표·충돌·맵·대본은 그대로이고, 화면 배율 2배에서 그림 한 칸이 화면 한 칸으로 또렷하게 보인다.
 * 방법: 텍스처가 들어오면 원본 크기를 1/K로 알리고 칸을 다시 나눈다(UV만 바뀜).
 * 어떤 파일이 고해상도인지는 hd_sprites.json의 _hd(파일 경로 → 배수)에 있다.
 */
const HD = ((hd as unknown as { _hd?: Record<string, number> })._hd ?? {}) as Record<string, number>;

/** 텍스처 키 → 불러온 파일 경로 (로더가 blob 주소로 읽어 들여서 원래 경로를 따로 적어 둠) */
const URLS = new Map<string, string>();
const scaleOf = (key: string) => {
  const url = URLS.get(key) ?? '';
  for (const [path, k] of Object.entries(HD)) if (url === path || url.endsWith('/' + path)) return k;
  return 1;
};

function shrink(key: string, tex: Phaser.Textures.Texture) {
  const src = tex.source[0];
  if (!src || (src as unknown as { _hdDone?: boolean })._hdDone) return;
  const k = scaleOf(key);
  if (k === 1) return;
  (src as unknown as { _hdDone?: boolean })._hdDone = true;
  const names = tex.getFrameNames(false);
  const first = names.length ? tex.get(names.includes('0') ? '0' : names[0]) : null;
  const sheet = names.length > 1 && first;
  const fw = sheet ? first.cutWidth : 0;
  const fh = sheet ? first.cutHeight : 0;
  src.width /= k;
  src.height /= k;
  const gl = src.glTexture as unknown as { width: number; height: number } | null;
  if (gl) {
    gl.width = src.width;
    gl.height = src.height;
  }
  // 칸 다시 나누기: 로더는 논리 크기(예: 32x48) 칸으로 큰 그림을 잘랐으므로, 줄인 원본을 같은 칸 크기로 다시 나눔
  for (const n of names) tex.remove(n);
  const base = tex.get('__BASE');
  base.setSize(src.width, src.height, 0, 0);
  if (sheet) (Phaser.Textures.Parsers as unknown as { SpriteSheet: (...a: unknown[]) => void }).SpriteSheet(tex, 0, 0, 0, src.width, src.height, { frameWidth: fw, frameHeight: fh });
  // remove()는 frameTotal을 줄이지 않으므로 다시 셈
  tex.frameTotal = Object.keys(tex.frames).length;
}

/** 게임 시작 때 한 번: 텍스처가 들어올 때마다 고해상도면 줄여 알림 */
export function installHdTextures(game: Phaser.Game) {
  const proto = Phaser.Loader.LoaderPlugin.prototype as unknown as { addFile: (f: unknown) => unknown };
  const add = proto.addFile;
  proto.addFile = function (this: unknown, file: unknown) {
    for (const one of Array.isArray(file) ? file : [file]) {
      const o = one as { key?: string; url?: unknown; type?: string };
      if (o?.key && typeof o.url === 'string' && (o.type === 'image' || o.type === 'spritesheet')) URLS.set(o.key, o.url.replace(/^\.?\//, ''));
    }
    return add.call(this, file);
  };
  game.textures.on(Phaser.Textures.Events.ADD, (key: string, tex: Phaser.Textures.Texture) => shrink(key, tex));
}
