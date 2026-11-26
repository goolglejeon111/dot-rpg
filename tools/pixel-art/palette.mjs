// 새 도트(32x48 인물, 새 타일)가 함께 쓰는 팔레트 (64색 이하). 기준: docs/도트기준.md
// 색마다 밝음 → 어둠 순서. 외곽선은 검정 대신 같은 묶음에서 두 단계 어두운 색.
// 그림자 쪽은 회색이 아니라 푸른 보라 쪽으로 기울인다.
// 인물의 가장 어두운 색도 순수 검정 근처로 내려가지 않게 한다(가장 어두운 칸 = 짙은 남색 #1d2735 정도).
// 예전 도트(palette.json 글자 격자)는 다 바꿀 때까지 그대로 둔다.

const ramps = {
  skin: ['#fff3e6', '#fedec9', '#f0b4a0', '#c8808a', '#8a4a5e'],
  hair: ['#b08468', '#83583f', '#634030', '#47302a', '#2e2425'], // 짙은 갈색 머리 (레온)
  navy: ['#4a7ab8', '#2e5a94', '#21426e', '#1d3050', '#1d2735'], // 근위기사 남색 (기본 = 1, 그림자 = 3, 외곽선 = 4)
  white: ['#ffffff', '#eef0f6', '#c0c6d8', '#8a90aa', '#545a78'], // 흰 옷, 은 (0 = 반짝임)
  gold: ['#ffeaa0', '#e8b850', '#b8843a', '#6a4020'],
  slate: ['#5a6478', '#3c4558', '#2a3142', '#1d2735'], // 바지·구두, 어두운 돌 (가장 어두운 칸도 짙은 남색)
  red: ['#ff8a7a', '#e0383a', '#a81c34', '#5a0c24'], // 진홍, 세레나 눈
  ivory: ['#fffaf0', '#ece2d4', '#d8ccc0', '#b4a09c', '#857080'], // 대리석, 백금색 머리 (#e0d8d0 계열)
  wood: ['#d49a5e', '#a8703e', '#7a4a30', '#4a2a2a'],
  sky: ['#a8d8f8', '#70a8e0', '#4a70b8', '#2e3e80'], // 유리, 물, 하늘
  green: ['#a8e070', '#6ab850', '#3e8a4a', '#24563e'],
  fire: ['#fff6c0', '#ffc850', '#f07a30', '#b83a2a'],
  violet: ['#a898e0', '#6a5aa8', '#463c7a', '#2c2650', '#1a172a'], // 로브, 마탑, 룬
  sand: ['#f0dca8', '#d8b878', '#b08a58', '#7a5a3a'], // 모래, 가죽 밝은 쪽
  ash: ['#a8a4b8', '#6e6a84', '#3c4558', '#2a3142', '#1d2735'], // 회색 머리·털, 쇠 (어두운 쪽은 slate와 같은 색)
};

/** 묶음 이름. 예전 이름(silver, black, stone, plat)은 같은 묶음을 가리킴 */
export const RAMPS = { ...ramps, silver: ramps.white, black: ramps.slate, stone: ramps.ivory, plat: ramps.ivory };

/** 반투명 색: 발밑 그림자, 벽 아래 그림자 띠 */
export const ALPHA = {
  shadow: ['#2a1a48', 0.35],
};

/** 이름 'skin.1' → '#fedec9' */
export function color(name) {
  const [r, i] = name.split('.');
  return RAMPS[r]?.[Number(i)];
}

export const COUNT = new Set(Object.values(ramps).flat()).size + Object.keys(ALPHA).length;
