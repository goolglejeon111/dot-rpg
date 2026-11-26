import hd from '../data/explore/hd_sprites.json';

/**
 * 엑스트라 얼굴 돌려쓰기 (docs/도트기준.md): 같은 옷의 모브는 얼굴만 다른 갈래(_v2~_v4)가 있다.
 * 목록은 hd_sprites.json 의 _faces (tools/pixel-art/gen-hd.mjs 가 만듦).
 * 자리를 아는 경우 가장 가까운 같은 얼굴이 가장 먼 갈래를 고르고, 모르면 차례로 돌려 바로 옆에 같은 얼굴이 서지 않게 한다.
 */
const FACES = ((hd as unknown as Record<string, unknown>)._faces ?? {}) as Record<string, string[]>;

/** 얼굴 갈래 그림 이름 전부 (불러오기 목록용) */
export const FACE_VARIANTS = Object.values(FACES).flat().filter((k) => /_v\d$/.test(k));

/** 갈래의 원래 그림 이름 (mob_paladin_v3 → mob_paladin) */
export const faceBase = (key: string) => key.replace(/_v\d$/, '');

export class FacePicker {
  private placed: { key: string; x: number; y: number }[] = [];
  private turn = new Map<string, number>();

  reset() {
    this.placed = [];
    this.turn.clear();
  }

  /** key가 갈래 있는 모브면 얼굴을 골라 돌려준다. 그 밖은 그대로 */
  pick(key: string, x?: number, y?: number): string {
    const list = FACES[key];
    if (!list || list.length < 2) return key;
    const n = this.turn.get(key) ?? 0;
    this.turn.set(key, n + 1);
    let best = list[n % list.length];
    if (x !== undefined && y !== undefined) {
      let bestD = -1;
      for (let i = 0; i < list.length; i++) {
        const k = list[(n + i) % list.length];
        let d = Infinity;
        for (const p of this.placed) if (p.key === k) d = Math.min(d, Math.hypot(p.x - x, p.y - y));
        if (d > bestD + 0.5) { bestD = d; best = k; }
      }
      this.placed.push({ key: best, x, y });
    }
    return best;
  }
}
