import Phaser from 'phaser';
import mapData from '../data/testMap.json';
import type { DialogueSceneData } from './DialogueScene';

const ZOOM = 3;

/** 테스트용: 회색 네모 캐릭터가 방향키로 타일 단위 이동. 노란 칸에 닿으면 대화 시작 */
export class TestMapScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private tileX = 0;
  private tileY = 0;
  private moving = false;

  constructor() {
    super('TestMap');
  }

  create() {
    const s = mapData.tileSize;
    this.tileX = mapData.start.x;
    this.tileY = mapData.start.y;
    this.moving = false;

    // 도트 맵은 320x240 크기로 그리고 카메라를 3배 확대한다
    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.centerOn((mapData.tiles[0].length * s) / 2, (mapData.tiles.length * s) / 2);

    mapData.tiles.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const wall = ch === '#';
        this.add
          .rectangle(x * s, y * s, s, s, wall ? 0x3b3b52 : 0x4f7a3a)
          .setOrigin(0)
          .setStrokeStyle(1, wall ? 0x2a2a3a : 0x446a32);
      });
    });

    for (const t of mapData.triggers) {
      const marker = this.add
        .rectangle(t.x * s, t.y * s, s, s, 0xd9b44a)
        .setOrigin(0)
        .setStrokeStyle(1, 0xf5dc8a);
      this.tweens.add({ targets: marker, alpha: 0.5, duration: 600, yoyo: true, repeat: -1 });
    }

    this.player = this.add
      .rectangle(this.tileX * s + s / 2, this.tileY * s + s / 2, s - 4, s - 4, 0x9e9e9e)
      .setStrokeStyle(1, 0x5e5e5e);

    this.cursors = this.input.keyboard!.createCursorKeys();

    // 대화에서 돌아오면 눌려 있던 키 상태를 지운다
    const onResume = () => this.input.keyboard!.resetKeys();
    this.events.on(Phaser.Scenes.Events.RESUME, onResume);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.RESUME, onResume));
    this.cameras.main.fadeIn(200, 0, 0, 0);
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
      onComplete: () => {
        this.moving = false;
        this.checkTrigger();
      },
    });
  }

  private checkTrigger() {
    const t = mapData.triggers.find((tr) => tr.x === this.tileX && tr.y === this.tileY);
    if (!t) return;
    const data: DialogueSceneData = { dialogueId: t.dialogue, returnTo: this.scene.key };
    this.scene.pause();
    this.scene.launch('Dialogue', data);
  }
}
