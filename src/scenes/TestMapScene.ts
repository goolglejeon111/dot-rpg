import Phaser from 'phaser';
import mapData from '../data/testMap.json';

/** 테스트용: 회색 네모 캐릭터가 방향키로 타일 단위 이동 */
export class TestMapScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private tileX = mapData.start.x;
  private tileY = mapData.start.y;
  private moving = false;

  constructor() {
    super('TestMap');
  }

  create() {
    const s = mapData.tileSize;
    mapData.tiles.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const wall = ch === '#';
        this.add
          .rectangle(x * s, y * s, s, s, wall ? 0x3b3b52 : 0x4f7a3a)
          .setOrigin(0)
          .setStrokeStyle(1, wall ? 0x2a2a3a : 0x446a32);
      });
    });

    this.player = this.add
      .rectangle(this.tileX * s + s / 2, this.tileY * s + s / 2, s - 4, s - 4, 0x9e9e9e)
      .setStrokeStyle(1, 0x5e5e5e);

    this.cursors = this.input.keyboard!.createCursorKeys();
  }

  update() {
    if (this.moving) return;
    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown) dx = -1;
    else if (this.cursors.right.isDown) dx = 1;
    else if (this.cursors.up.isDown) dy = -1;
    else if (this.cursors.down.isDown) dy = 1;
    if (dx === 0 && dy === 0) return;

    const nx = this.tileX + dx;
    const ny = this.tileY + dy;
    if (mapData.tiles[ny]?.[nx] !== '.') return;

    const s = mapData.tileSize;
    this.tileX = nx;
    this.tileY = ny;
    this.moving = true;
    this.tweens.add({
      targets: this.player,
      x: nx * s + s / 2,
      y: ny * s + s / 2,
      duration: 140,
      onComplete: () => (this.moving = false),
    });
  }
}
