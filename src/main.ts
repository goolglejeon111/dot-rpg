import Phaser from 'phaser';
import { TestMapScene } from './scenes/TestMapScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 320,
  height: 240,
  zoom: 3,
  pixelArt: true, // 도트가 흐려지지 않도록
  backgroundColor: '#1a1a1a',
  scene: [TestMapScene],
});
