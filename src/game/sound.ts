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

/**
 * BGM·환경음: 한 갈래(bgm / amb)에 하나씩 반복 재생. 다른 이름이 오면 앞의 것을 멈추고, null이면 끈다.
 * 파일이 없으면 무음. 소리는 게임 전체(scene.sound)에 걸리므로 장면이 바뀌어도 이어진다
 */
const loops: Record<'bgm' | 'amb', { name: string | null; snd?: Phaser.Sound.BaseSound }> = { bgm: { name: null }, amb: { name: null } };

export const currentLoop = (ch: 'bgm' | 'amb') => loops[ch].name;

export async function playLoop(scene: Phaser.Scene, ch: 'bgm' | 'amb', name: string | null) {
  const cur = loops[ch];
  if (cur.name === name) return;
  cur.snd?.stop();
  cur.snd?.destroy();
  cur.snd = undefined;
  cur.name = name;
  if (!name) return;
  const key = `loop_${name}`;
  if (!scene.cache.audio.exists(key)) {
    const url = await findAudio(name);
    if (!url || !scene.sys.isActive()) return;
    await new Promise<void>((resolve) => {
      scene.load.audio(key, url);
      scene.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
      scene.load.start();
    });
  }
  // 불러오는 사이에 다른 곡으로 바뀌었으면 틀지 않는다
  if (cur.name !== name || !scene.cache.audio.exists(key)) return;
  cur.snd = scene.sound.add(key, { loop: true, volume: ch === 'bgm' ? 0.6 : 0.4 });
  cur.snd.play();
}
export const playBgm = (scene: Phaser.Scene, name: string | null) => playLoop(scene, 'bgm', name);
