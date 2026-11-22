import Phaser from 'phaser';
import { characters } from '../game/data';
import type { DialogueSceneData } from './DialogueScene';

/** 화면 배율: 32px 타일을 2배로 보여 준다 (960x720 화면에 월드 480x360) */
const ZOOM = 2;
const SPEED = 90; // 초당 픽셀
const TALK_RANGE = 44;

type Dir = 'down' | 'left' | 'right' | 'up';
const DIRS: Dir[] = ['down', 'left', 'right', 'up']; // 스프라이트 시트 행 순서
const WATER = [6, 7]; // terrain 타일 번호 + 1 (Tiled는 1부터 셈)

/** 오브젝트 종류별 그림과 발밑 충돌 상자 (발밑 가운데 기준, 픽셀) */
const PROPS: Record<string, { key: string; foot: [number, number] | null; shadow?: string; dy?: number }> = {
  tree: { key: 'tree', foot: [14, 8], shadow: 'shadow_large', dy: 4 },
  house: { key: 'house', foot: [82, 38], dy: 4 },
  crate: { key: 'crate', foot: [24, 12], shadow: 'shadow', dy: 2 },
  sign: { key: 'sign', foot: [8, 5], dy: 1 },
};

interface Npc {
  sprite: Phaser.GameObjects.Sprite;
  dialogue: string;
  facing: Dir;
}

/** 마을 필드: 8방향 이동, 발밑 충돌, y 깊이 정렬, NPC에게 말 걸기 */
export class FieldScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerShadow!: Phaser.GameObjects.Image;
  private playerTag!: Phaser.GameObjects.Text;
  private facing: Dir = 'down';
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'space' | 'z', Phaser.Input.Keyboard.Key>;
  private npcs: Npc[] = [];
  private talkIcon!: Phaser.GameObjects.Image;
  private nearNpc: Npc | null = null;

  constructor() {
    super('Field');
  }

  preload() {
    this.load.tilemapTiledJSON('village', 'assets/maps/village.json');
    this.load.image('terrain', 'assets/tilesets/terrain.png');
    this.load.spritesheet('leon', 'assets/sprites/leon.png', { frameWidth: 32, frameHeight: 40 });
    this.load.spritesheet('guard', 'assets/sprites/guard.png', { frameWidth: 32, frameHeight: 40 });
    for (const k of ['tree', 'house', 'crate', 'sign', 'shadow', 'shadow_large', 'talk_icon']) {
      this.load.image(k, `assets/sprites/${k}.png`);
    }
  }

  create() {
    this.npcs = [];
    this.nearNpc = null;

    // ---- 타일맵 ----
    const map = this.make.tilemap({ key: 'village' });
    const tileset = map.addTilesetImage('terrain', 'terrain')!;
    const ground = map.createLayer('ground', tileset)!.setDepth(-3);
    map.createLayer('shore', tileset)?.setDepth(-2.5); // 물가 둑 (물 위에 겹침)
    const walls = map.createLayer('walls', tileset)!.setDepth(-2);
    ground.setCollisionByProperty({ collides: true });
    walls.setCollisionByProperty({ collides: true });

    // 물 2프레임 번갈아 바꾸기
    const water = ground.filterTiles((t: Phaser.Tilemaps.Tile) => WATER.includes(t.index));
    let wf = 0;
    this.time.addEvent({
      delay: 600,
      loop: true,
      callback: () => {
        wf ^= 1;
        for (const t of water) t.index = WATER[wf];
      },
    });

    const W = map.widthInPixels;
    const H = map.heightInPixels;
    this.physics.world.setBounds(0, 0, W, H);

    // ---- 오브젝트 ----
    const solids = this.physics.add.staticGroup();
    const addFoot = (x: number, y: number, w: number, h: number) => {
      const z = this.add.zone(x, y - h / 2, w, h);
      this.physics.add.existing(z, true);
      solids.add(z);
    };
    let spawn = { x: W / 2, y: H / 2 };
    const objs = map.getObjectLayer('objects')?.objects ?? [];
    for (const o of objs) {
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      const prop = (name: string) => (o.properties as { name: string; value: unknown }[] | undefined)?.find((p) => p.name === name)?.value;
      if (o.type === 'spawn') {
        spawn = { x, y };
      } else if (o.type === 'npc') {
        const facing = (prop('facing') as Dir) ?? 'down';
        const key = (prop('sprite') as string) ?? 'guard';
        const sprite = this.add.sprite(x, y, key, DIRS.indexOf(facing)).setOrigin(0.5, 1).setDepth(y);
        this.add.image(x, y + 1, 'shadow').setOrigin(0.5, 1).setDepth(-1);
        this.nameTag(x, y, characters[prop('character') as string]?.name ?? o.name ?? '');
        addFoot(x, y, 14, 8);
        this.npcs.push({ sprite, dialogue: prop('dialogue') as string, facing });
      } else if (PROPS[o.type]) {
        const p = PROPS[o.type];
        if (p.shadow) this.add.image(x, y + 2, p.shadow).setOrigin(0.5, 1).setDepth(-1);
        this.add.image(x, y + (p.dy ?? 0), p.key).setOrigin(0.5, 1).setDepth(y);
        if (p.foot) addFoot(x, y, p.foot[0], p.foot[1]);
      }
    }

    // ---- 레온 ----
    this.makeAnims();
    this.player = this.physics.add.sprite(spawn.x, spawn.y, 'leon', 0).setOrigin(0.5, 1);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(14, 8).setOffset(9, 31); // 발밑 작은 상자만 부딪힌다
    this.player.setCollideWorldBounds(true);
    this.playerShadow = this.add.image(0, 0, 'shadow').setOrigin(0.5, 1).setDepth(-1);
    this.playerTag = this.nameTag(0, 0, characters.leon?.name ?? '레온');
    this.physics.add.collider(this.player, ground);
    this.physics.add.collider(this.player, walls);
    this.physics.add.collider(this.player, solids);

    this.talkIcon = this.add.image(0, 0, 'talk_icon').setOrigin(0.5, 1).setDepth(100001).setVisible(false);

    // ---- 카메라: 레온을 부드럽게 따라가고 맵 끝에서 멈춤 ----
    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.setBounds(0, 0, W, H);
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setRoundPixels(true);

    // ---- 입력 ----
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({
      up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT,
      w: K.W, a: K.A, s: K.S, d: K.D, space: K.SPACE, z: K.Z,
    }) as FieldScene['keys'];

    // 대화에서 돌아오면 눌려 있던 키 상태를 지운다
    const onResume = () => {
      this.input.keyboard!.resetKeys();
      this.stand();
    };
    this.events.on(Phaser.Scenes.Events.RESUME, onResume);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.RESUME, onResume));
    this.followPlayer();
    cam.fadeIn(200, 0, 0, 0);
  }

  update() {
    const k = this.keys;
    let dx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    let dy = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);

    if (dx || dy) {
      // 대각선도 같은 속도가 되도록 정규화
      const len = Math.hypot(dx, dy);
      this.player.setVelocity((dx / len) * SPEED, (dy / len) * SPEED);
      // 지금 보는 방향이 눌린 방향 중 하나면 유지, 아니면 새 방향
      const want: Dir[] = [];
      if (dx < 0) want.push('left');
      if (dx > 0) want.push('right');
      if (dy < 0) want.push('up');
      if (dy > 0) want.push('down');
      if (!want.includes(this.facing)) this.facing = dx ? want[0] : want[want.length - 1];
      this.player.anims.play(`leon-walk-${this.facing}`, true);
    } else {
      this.stand();
    }

    this.followPlayer();
    this.updateTalk();
  }

  private stand() {
    this.player.setVelocity(0, 0);
    this.player.anims.stop();
    this.player.setFrame(DIRS.indexOf(this.facing) * 5);
  }

  /** 깊이(발밑 y), 그림자, 이름표를 레온 위치에 맞춘다 */
  private followPlayer() {
    const { x, y } = this.player;
    this.player.setDepth(y);
    this.playerShadow.setPosition(x, y + 1);
    this.playerTag.setPosition(Math.round(x), Math.round(y - 41));
  }

  private updateTalk() {
    const p = this.player;
    let best: Npc | null = null;
    let bestD = TALK_RANGE;
    for (const n of this.npcs) {
      const d = Phaser.Math.Distance.Between(p.x, p.y, n.sprite.x, n.sprite.y);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    this.nearNpc = best;
    this.talkIcon.setVisible(!!best);
    if (!best) return;
    // 이름표(발밑에서 41~51px 위) 바로 위에 띄운다
    this.talkIcon.setPosition(best.sprite.x, best.sprite.y - 53 - (Math.floor(this.time.now / 400) % 2));

    const k = this.keys;
    if (Phaser.Input.Keyboard.JustDown(k.space) || Phaser.Input.Keyboard.JustDown(k.z)) this.talk(best);
  }

  private talk(npc: Npc) {
    // 서로 마주 보게 한다
    const dx = this.player.x - npc.sprite.x;
    const dy = this.player.y - npc.sprite.y;
    const toPlayer: Dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    const opposite: Record<Dir, Dir> = { left: 'right', right: 'left', up: 'down', down: 'up' };
    npc.sprite.setFrame(DIRS.indexOf(toPlayer));
    this.facing = opposite[toPlayer];
    this.stand();
    this.talkIcon.setVisible(false);

    const data: DialogueSceneData = { dialogueId: npc.dialogue, returnTo: this.scene.key };
    this.scene.pause();
    this.scene.launch('Dialogue', data);
  }

  private nameTag(x: number, y: number, name: string) {
    // 16px로 그려 0.5배 → 카메라 2배에서 글자가 또렷하게 보인다
    return this.add
      .text(Math.round(x), Math.round(y - 41), name, {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#1a1622',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setScale(0.5)
      .setDepth(100000);
  }

  private makeAnims() {
    DIRS.forEach((dir, row) => {
      const key = `leon-walk-${dir}`;
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers('leon', { start: row * 5 + 1, end: row * 5 + 4 }),
        frameRate: 8,
        repeat: -1,
      });
    });
  }
}
