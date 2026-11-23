import Phaser from 'phaser';
import { gameState } from './game/GameState';
import { FieldScene } from './scenes/FieldScene';
import { StoryScene } from './scenes/StoryScene';
import { TitleScene } from './scenes/TitleScene';

const WIDTH = 960;
const HEIGHT = 720;
/** 창 크기에 맞는 정수 배율 (픽셀이 고르지 않게 늘어나는 것을 막음) */
const fitZoom = () => Math.max(1, Math.floor(Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT)));

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
