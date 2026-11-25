import Phaser from 'phaser';

/**
 * 효과음: public/assets/audio/{이름}.ogg (또는 .mp3, .wav). 파일이 없으면 소리 없이 넘어간다.
 * 소리 이름은 연출 문서의 역할 이름 그대로 (예: se_wound_pulse)
 */
const EXTS = ['ogg', 'mp3', 'wav'];
const found = new Map<string, Promise<string | null>>();

function findAudio(name: string): Promise<string | null> {
  let p = found.get(name);
  if (!p) {
    p = (async () => {
      for (const ext of EXTS) {
        const url = `assets/audio/${name}.${ext}`;
        const ok = await fetch(url, { method: 'HEAD' })
          .then((r) => r.ok && (r.headers.get('content-type') ?? '').startsWith('audio/'))
          .catch(() => false);
        if (ok) return url;
      }
      return null;
    })();
    found.set(name, p);
  }
  return p;
}

export async function playSe(scene: Phaser.Scene, name: string) {
  const key = `se_${name}`;
  if (!scene.cache.audio.exists(key)) {
    const url = await findAudio(name);
    if (!url || !scene.sys.isActive()) return;
    await new Promise<void>((resolve) => {
      scene.load.audio(key, url);
      scene.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
      scene.load.start();
    });
  }
  if (scene.cache.audio.exists(key)) scene.sound.play(key);
}
