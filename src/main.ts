import Phaser from 'phaser';
import { gameState } from './game/GameState';
import { FieldScene } from './scenes/FieldScene';
import { StoryScene } from './scenes/StoryScene';
import { TitleScene } from './scenes/TitleScene';

const WIDTH = 960;
const HEIGHT = 720;
/** 터치 기기(휴대폰·태블릿)인지 */
const isTouch = window.matchMedia('(pointer: coarse)').matches;
/**
 * 창 크기에 맞는 배율. 보통은 정수 배율(최소 1배)로 픽셀이 고르게 보이게 한다.
 * 단, 터치 기기에서 화면이 게임보다 작으면 화면 전체가 보이도록 비율대로 줄인다.
 */
const fitZoom = () => {
  const fit = Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT);
  if (isTouch && fit < 1) return fit;
  return Math.max(1, Math.floor(fit));
};

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  pixelArt: true, // 도트가 흐려지지 않도록
  roundPixels: true,
  backgroundColor: '#1a1a1a',
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: {
    mode: Phaser.Scale.NONE,
    zoom: fitZoom(),
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // 첫 장면 = 타이틀. 필드(FieldScene)는 1막에서 이어 붙일 예정
  scene: [TitleScene, StoryScene, FieldScene],
});

window.addEventListener('resize', () => game.scale.setZoom(fitZoom()));

// 개발 중에만 콘솔에서 확인할 수 있게 노출
if (import.meta.env.DEV) {
  Object.assign(window, { game, gameState });
}
