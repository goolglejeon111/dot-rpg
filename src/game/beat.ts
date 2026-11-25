/**
 * 상처 sense의 박자: 2초마다 한 번 맥박 (0~1).
 * 맵의 레온 어깨 빛, 화면 왼쪽 가장자리, 2막 빛의 기둥이 같은 시계(game.loop.time)로 같은 박자를 탄다
 */
export const SENSE_PERIOD = 2000;
export const senseBeat = (ms: number) => Math.max(0, Math.sin((ms / SENSE_PERIOD) * Math.PI * 2)) ** 2;
