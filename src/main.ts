import Phaser from 'phaser';
import { gameState } from './game/GameState';
import { TestMapScene } from './scenes/TestMapScene';
import { DialogueScene } from './scenes/DialogueScene';
import { TitleCardScene } from './scenes/TitleCardScene';

gameState.load();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 720,
  pixelArt: true, // 도트가 흐려지지 않도록
  backgroundColor: '#1a1a1a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TestMapScene, DialogueScene, TitleCardScene],
});

// 개발 중에만 콘솔에서 확인할 수 있게 노출
if (import.meta.env.DEV) {
  Object.assign(window, { game, gameState });
}
