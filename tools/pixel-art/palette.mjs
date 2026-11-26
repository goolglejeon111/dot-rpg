// 새 도트(32x48 인물, 새 타일)가 함께 쓰는 팔레트 64색. 기준: docs/도트기준.md
// 색마다 밝음 → 어둠 순서. 마지막 칸이 그 색의 외곽선(검정 대신 두 단계 어두운 색).
// 그림자 쪽은 회색이 아니라 푸른 보라 쪽으로 기울인다.
// 예전 도트(palette.json 글자 격자)는 다 바꿀 때까지 그대로 둔다.

export const RAMPS = {
  skin: ['#fff3e6', '#fedec9', '#f0b4a0', '#c8808a', '#8a4a5e'],
  hair: ['#8a6660', '#5a4040', '#403030', '#2e2228', '#1a1220'], // 레온 짙은 갈색 (0 = 반짝임)
  plat: ['#fffcf6', '#f0e8de', '#d4c8c6', '#a698aa', '#6a5a78'], // 세레나 백금색
  navy: ['#3a6aa0', '#1a4878', '#0a3358', '#08213e', '#040f22'], // 레온 제복·망토
  silver: ['#ffffff', '#eef0f6', '#b4b8c8', '#80849a', '#4a4c66'],
  gold: ['#ffeaa0', '#e8b850', '#b8843a', '#6a4020'],
  white: ['#ffffff', '#f2f4fa', '#c8d0e6', '#8a92b4', '#545a80'], // 흰 옷 (0 = 반짝임)
  black: ['#4a5468', '#2a3346', '#1a2030', '#0a0e18'], // 바지·구두
  red: ['#ff8a7a', '#e0383a', '#a81c34', '#5a0c24'], // 진홍, 세레나 눈
  stone: ['#fbf7ef', '#ece2d2', '#d6c6b4', '#b4a0a0', '#8a7890'], // 대리석·밝은 벽돌
  wood: ['#d49a5e', '#a8703e', '#7a4a30', '#4a2a2a'],
  sky: ['#a8d8f8', '#70a8e0', '#4a70b8', '#2e3e80'], // 유리, 하늘
  green: ['#a8e070', '#6ab850', '#3e8a4a', '#24563e'],
  fire: ['#fff6c0', '#ffc850', '#f07a30', '#b83a2a'],
};

/** 반투명 색: 발밑 그림자, 벽 아래 그림자 띠 */
export const ALPHA = {
  shadow: ['#2a1a48', 0.35],
};

/** 이름 'skin.1' → '#fedec9' */
export function color(name) {
  const [r, i] = name.split('.');
  return RAMPS[r]?.[Number(i)];
}

export const COUNT = Object.values(RAMPS).reduce((n, r) => n + r.length, 0) + Object.keys(ALPHA).length;
