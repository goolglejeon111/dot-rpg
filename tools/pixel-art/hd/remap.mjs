// 예전 그림을 새 팔레트(palette.mjs, 64색)로 옮겨 칠하기.
// 모양은 그대로 두고 색만 가장 가까운 새 팔레트 색으로 바꾼다.
// 검정에 가까운 외곽선은 팔레트의 가장 어두운 칸(짙은 남색 #1d2735)으로 들어간다.
// 새로 다시 그리지 않은 타일·물건·생물에 쓴다(docs/도트기준.md).
import { RAMPS } from '../palette.mjs';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const COLORS = [...new Set(Object.values(RAMPS).flat())].map(hex);

const cache = new Map();
/** 사람 눈에 가까운 거리(redmean)로 가장 가까운 색 */
export function nearest(r, g, b) {
  const key = (r << 16) | (g << 8) | b;
  const hit = cache.get(key);
  if (hit) return hit;
  let best = COLORS[0];
  let bd = Infinity;
  for (const c of COLORS) {
    const rm = (r + c[0]) / 2;
    const dr = r - c[0];
    const dg = g - c[1];
    const db = b - c[2];
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  cache.set(key, best);
  return best;
}

/** RGBA 바이트 배열을 새 팔레트로 (반투명 칸은 알파를 그대로 둠) */
export function remapData(data) {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (!a) continue;
    const [r, g, b] = nearest(data[i], data[i + 1], data[i + 2]);
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = a;
  }
  return out;
}
