// 물가 타일 목록. 물 칸 위에 겹쳐 그려 풀 둑을 둥글게 만든다.
// mask 비트(1이면 그쪽이 땅): 위1 오른쪽2 아래4 왼쪽8,
// 대각선 오른위16 오른아래32 왼아래64 왼위128 (양옆이 모두 물일 때만 셈)
export const N = 1, E = 2, S = 4, W = 8, NE = 16, SE = 32, SW = 64, NW = 128;

/** 실제로 다를 수 있는 46가지 조합 (0 = 둑 없음은 제외) */
export const SHORE_MASKS = (() => {
  const set = new Set();
  for (let m = 1; m < 256; m++) set.add(normalizeShore(m));
  set.delete(0);
  return [...set].sort((a, b) => a - b);
})();

/** 양옆 중 하나라도 땅이면 그 대각선은 의미가 없으므로 지운다 */
export function normalizeShore(m) {
  if (m & (N | E)) m &= ~NE;
  if (m & (S | E)) m &= ~SE;
  if (m & (S | W)) m &= ~SW;
  if (m & (N | W)) m &= ~NW;
  return m;
}

export const shoreName = (m) => `shore_${m}`;
