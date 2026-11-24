import Phaser from 'phaser';
import maps from '../data/explore/maps.json';
import sprites from '../data/explore/sprites.json';
import { preloadBattle, makeBattleAnims } from '../battle/assets';
import { gainOnce, levelOf, levelProgress, isCapped } from '../battle/progress';
import { gameState } from '../game/GameState';

/**
 * 이동 맵: 레온을 움직여 맵을 지나간다.
 *   이동 WASD/방향키 · 살펴보기 F(또는 Space) · 휴대폰은 왼쪽 조이스틱과 오른쪽 살펴보기 버튼
 *   처음 살펴본 물건은 경험치를 준다 (한 번만, 저장에 남음). goal에 닿으면 다음 대사로
 * 맵 데이터: src/data/explore/maps.json, 그림: tools/pixel-art/gen-palace.mjs
 */
export interface ExploreStart {
  map: string;
  onEnd: () => void;
}

type Dir = 'down' | 'left' | 'right' | 'up';
const DIRS: Dir[] = ['down', 'left', 'right', 'up'];
const W = 960;
const H = 720;
const ZOOM = 2;
const SPEED = 92;
const LOOK_RANGE = 30;
const FONT = '"Noto Sans KR", "Malgun Gothic", sans-serif';
const FOOT = { w: 14, h: 8 };

interface PropDef {
  id: string;
  kind: string;
  x: number;
  y: number;
  wall?: boolean;
  exp?: number;
  name?: string;
  look?: string[];
  solid?: number[];
  sprite?: string;
  facing?: string;
}
interface MapDef {
  place: string;
  tint?: string;
  party?: string[];
  rows: string[];
  start: number[];
  facing?: string;
  props: PropDef[];
  npcs?: { id: string; name: string; x: number; y: number; facing: string }[];
  goal: { x: number; y: number; r: number; hint?: string };
  tutorial?: boolean;
}

const TILE_OF: Record<string, string> = { '#': 'wall_top', '|': 'wall_front', W: 'wall_window', '-': 'carpet_top', '=': 'carpet_mid', _: 'carpet_bot' };
const SOLID = new Set(['#', '|', 'W']);
const PROP_SPRITES = sprites.props as Record<string, { file: string; w: number; h: number; frames: number; rate?: number }>;
const TILE_NAMES = sprites.tiles.names;

interface Lookable {
  def: PropDef;
  icon: Phaser.GameObjects.Sprite;
}

export class ExploreScene extends Phaser.Scene {
  private start!: ExploreStart;
  private def!: MapDef;
  private mapW = 0;
  private mapH = 0;
  private player!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private px = 0;
  private py = 0;
  private facing: Dir = 'right';
  private boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  private lookables: Lookable[] = [];
  private near: Lookable | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private worldObjs: Phaser.GameObjects.GameObject[] = [];
  private uiObjs: Phaser.GameObjects.GameObject[] = [];
  // 화면 글자
  private prompt!: Phaser.GameObjects.Text;
  private box!: Phaser.GameObjects.Container;
  private boxText!: Phaser.GameObjects.Text;
  private boxName!: Phaser.GameObjects.Text;
  private guideBox!: Phaser.GameObjects.Container;
  private guideText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private lvText!: Phaser.GameObjects.Text;
  private expFill!: Phaser.GameObjects.Image;
  private countText!: Phaser.GameObjects.Text;
  // 상태
  private reading: Lookable | null = null;
  private ending = false;
  private moved = 0;
  private tutStep = 0;
  private stick = { id: -1, x: 0, y: 0, dx: 0, dy: 0 };
  private stickKnob?: Phaser.GameObjects.Image;
  private touchLook = false;

  constructor() {
    super('Explore');
  }

  init(data: ExploreStart) {
    this.start = data;
    this.def = (maps as unknown as Record<string, MapDef>)[data.map];
    this.boxes = [];
    this.lookables = [];
    this.near = null;
    this.reading = null;
    this.ending = false;
    this.moved = 0;
    this.tutStep = 0;
    this.worldObjs = [];
    this.uiObjs = [];
    this.stick = { id: -1, x: 0, y: 0, dx: 0, dy: 0 };
  }

  preload() {
    preloadBattle(this);
    if (!this.textures.exists('palace_tiles')) this.load.spritesheet('palace_tiles', sprites.tiles.file, { frameWidth: 32, frameHeight: 32 });
    for (const [k, s] of Object.entries(PROP_SPRITES)) {
      if (!this.textures.exists(`ex_${k}`)) this.load.spritesheet(`ex_${k}`, s.file, { frameWidth: s.w, frameHeight: s.h });
    }
  }

  // ---------------------------------------------------------------
  // 만들기
  // ---------------------------------------------------------------

  create() {
    makeBattleAnims(this);
    for (const [k, s] of Object.entries(PROP_SPRITES)) {
      if (s.frames > 1 && !this.anims.exists(`ex_${k}`)) {
        this.anims.create({ key: `ex_${k}`, frames: this.anims.generateFrameNumbers(`ex_${k}`, { start: 0, end: s.frames - 1 }), frameRate: s.rate ?? 6, repeat: -1 });
      }
    }
    const d = this.def;
    this.mapW = d.rows[0].length * 32;
    this.mapH = d.rows.length * 32;

    const cam = this.cameras.main;
    cam.setZoom(ZOOM).setBackgroundColor('#07060b');
    // 맵이 화면보다 작으면 가운데에 오도록 경계를 넓힌다
    const vw = W / ZOOM;
    const vh = H / ZOOM;
    const bx = Math.min(0, (this.mapW - vw) / 2);
    const by = Math.min(0, (this.mapH - vh) / 2);
    cam.setBounds(bx, by, Math.max(this.mapW, vw), Math.max(this.mapH, vh));
    this.uiCam = this.cameras.add(0, 0, W, H);

    this.drawTiles();
    this.makeProps();
    for (const n of d.npcs ?? []) this.makeNpc(n);

    // 레온
    this.px = d.start[0];
    this.py = d.start[1];
    this.facing = (d.facing as Dir) ?? 'right';
    this.shadow = this.world(this.add.ellipse(this.px, this.py, 16, 6, 0x120e1a, 0.35));
    this.player = this.world(this.add.sprite(this.px, this.py, 'leon', DIRS.indexOf(this.facing) * 5).setOrigin(0.5, 1));
    cam.startFollow(this.player, true, 0.15, 0.15, 0, 20);
    cam.fadeIn(400, 0, 0, 0);

    this.makeUi();
    this.makeInput();
    this.refreshHud();

    if (d.tutorial) this.guide('WASD 또는 방향키로 움직입니다');
    else if (d.goal.hint) this.guide(d.goal.hint, 4000);
  }

  /** 월드 카메라에만 보이게 */
  private world<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.worldObjs.push(o);
    this.uiCam?.ignore(o);
    return o;
  }

  /** 화면(UI) 카메라에만 보이게 */
  private ui<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.uiObjs.push(o);
    this.cameras.main.ignore(o);
    return o;
  }

  private drawTiles() {
    const tint = Phaser.Display.Color.HexStringToColor(this.def.tint ?? '#ffffff').color;
    this.def.rows.forEach((row, ty) =>
      [...row].forEach((ch, tx) => {
        const name = TILE_OF[ch] ?? ((tx + ty) % 3 === 0 ? 'floor2' : 'floor');
        const frame = Math.max(0, TILE_NAMES.indexOf(name));
        this.world(this.add.image(tx * 32, ty * 32, 'palace_tiles', frame).setOrigin(0).setDepth(-10).setTint(tint));
        if (SOLID.has(ch)) this.boxes.push({ x0: tx * 32, y0: ty * 32, x1: tx * 32 + 32, y1: ty * 32 + 32 });
      }),
    );
  }

  private makeProps() {
    const tint = Phaser.Display.Color.HexStringToColor(this.def.tint ?? '#ffffff').color;
    for (const p of this.def.props) {
      if (p.kind === 'body') {
        // 쓰러진 인물: 전투 동작 그림의 "쓰러짐" 칸
        const row = Math.max(0, DIRS.indexOf((p.facing as Dir) ?? 'down'));
        this.world(this.add.sprite(p.x, p.y + 6, `bt_${p.sprite}`, row * 12 + 11).setOrigin(0.5, 1).setDepth(p.y - 10));
        p.solid ??= [20, 8];
      } else if (p.kind !== 'spot') {
        const s = this.world(this.add.sprite(p.x, p.y, `ex_${p.kind}`, 0).setOrigin(0.5, 1).setDepth(p.wall ? -5 : p.y));
        if (this.anims.exists(`ex_${p.kind}`)) s.play({ key: `ex_${p.kind}`, startFrame: Math.floor(Math.random() * 3) });
        if (p.kind !== 'torch') s.setTint(tint);
        if (p.kind === 'torch') {
          // 횃불 불빛
          const glow = this.world(this.add.ellipse(p.x, p.y - 12, 44, 30, 0xc49a4a, 0.18).setDepth(-6).setBlendMode(Phaser.BlendModes.ADD));
          this.tweens.add({ targets: glow, alpha: 0.55, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        }
      }
      if (p.solid) this.boxes.push({ x0: p.x - p.solid[0] / 2, y0: p.y - p.solid[1], x1: p.x + p.solid[0] / 2, y1: p.y });
      if (p.look?.length) {
        const top = p.kind === 'spot' ? p.y - 22 : p.kind === 'body' ? p.y - 18 : p.y - (PROP_SPRITES[p.kind]?.h ?? 20) - 4;
        const icon = this.world(this.add.sprite(p.x, top, 'ex_look', 0).setDepth(9000).play('ex_look'));
        icon.setVisible(!this.seen(p));
        this.tweens.add({ targets: icon, y: top - 3, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        this.lookables.push({ def: p, icon });
      }
    }
  }

  private makeNpc(n: { id: string; name: string; x: number; y: number; facing: string }) {
    const row = Math.max(0, DIRS.indexOf(n.facing as Dir));
    this.world(this.add.ellipse(n.x, n.y, 16, 6, 0x120e1a, 0.35).setDepth(-4));
    this.world(this.add.sprite(n.x, n.y, n.id, row * 5).setOrigin(0.5, 1).setDepth(n.y));
    this.world(
      this.add
        .text(n.x, n.y - 44, n.name, { fontFamily: FONT, fontSize: '10px', color: '#f3e7c4', stroke: '#000000', strokeThickness: 3, resolution: 4 })
        .setOrigin(0.5, 1)
        .setDepth(9001),
    );
    this.boxes.push({ x0: n.x - 8, y0: n.y - 6, x1: n.x + 8, y1: n.y });
  }

  private makeUi() {
    const d = this.def;
    // 장소 이름
    this.ui(this.add.text(24, 20, `◆ ${d.place}`, { fontFamily: FONT, fontSize: '20px', color: '#cdb88a' }).setShadow(0, 2, '#000', 3));
    // 레벨, 경험치
    this.lvText = this.ui(this.add.text(24, 54, '', { fontFamily: FONT, fontSize: '17px', color: '#e0c27a', fontStyle: 'bold' }).setShadow(0, 2, '#000', 2));
    this.ui(this.add.image(100, 64, 'ui_bar_exp').setOrigin(0, 0.5).setScale(1, 2));
    this.expFill = this.ui(this.add.image(101, 64, 'ui_fill_sky_3').setOrigin(0, 0.5).setScale(1, 2));
    this.countText = this.ui(this.add.text(W - 24, 20, '', { fontFamily: FONT, fontSize: '17px', color: '#bbbbbb' }).setOrigin(1, 0).setShadow(0, 2, '#000', 2));

    // 살펴보기 안내 (가까운 물건 위)
    this.prompt = this.ui(
      this.add
        .text(0, 0, '', { fontFamily: FONT, fontSize: '17px', color: '#ffffff', backgroundColor: '#000000bb', padding: { x: 10, y: 5 } })
        .setOrigin(0.5, 1)
        .setVisible(false),
    );

    // 독백 상자
    const bg = this.add.rectangle(0, 0, 860, 150, 0x0c0a14, 0.92).setStrokeStyle(2, 0xcdb88a);
    this.boxName = this.add.text(-410, -60, '', { fontFamily: FONT, fontSize: '18px', color: '#e0c27a' });
    this.boxText = this.add.text(-410, -28, '', {
      fontFamily: FONT, fontSize: '21px', color: '#e8e4f0', lineSpacing: 8, wordWrap: { width: 820, useAdvancedWrap: true },
    });
    const more = this.add.text(410, 60, '▼', { fontFamily: FONT, fontSize: '16px', color: '#cdb88a' }).setOrigin(1, 1);
    this.tweens.add({ targets: more, alpha: 0.2, duration: 500, yoyo: true, repeat: -1 });
    this.box = this.ui(this.add.container(W / 2, H - 100, [bg, this.boxName, this.boxText, more]).setVisible(false).setDepth(30));

    // 안내 상자
    const gbg = this.add.rectangle(0, 0, 820, 52, 0x0c0a14, 0.85).setStrokeStyle(2, 0xcdb88a);
    this.guideText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '18px', color: '#f3e7c4', align: 'center', wordWrap: { width: 790, useAdvancedWrap: true } }).setOrigin(0.5);
    this.guideBox = this.ui(this.add.container(W / 2, 120, [gbg, this.guideText]).setAlpha(0).setDepth(25));

    this.toastText = this.ui(
      this.add
        .text(W / 2, 190, '', { fontFamily: FONT, fontSize: '21px', color: '#ffe9a8', backgroundColor: '#000000aa', padding: { x: 14, y: 8 } })
        .setOrigin(0.5)
        .setAlpha(0)
        .setDepth(26),
    );

    // 이미 만든 월드 물체는 UI 카메라에서 감춘다
    this.uiCam.ignore(this.worldObjs);
  }

  private makeInput() {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,F,SPACE,ENTER,Z') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
    const confirm = () => this.confirm();
    for (const k of ['F', 'SPACE', 'ENTER', 'Z']) this.keys[k].on('down', confirm);

    const touch = this.sys.game.device.input.touch || new URLSearchParams(location.search).has('touch');
    if (touch) {
      const base = this.ui(this.add.image(130, H - 150, 'ui_stick_base').setScale(2).setAlpha(0.85));
      this.stickKnob = this.ui(this.add.image(130, H - 150, 'ui_stick_knob').setScale(2));
      const btn = this.ui(this.add.image(W - 110, H - 150, 'ui_btn', 0).setScale(2).setInteractive());
      this.ui(this.add.image(W - 110, H - 150, 'ui_icon_interact').setScale(2));
      this.ui(this.add.text(W - 110, H - 100, '살펴보기', { fontFamily: FONT, fontSize: '16px', color: '#ffffff' }).setOrigin(0.5).setShadow(0, 2, '#000', 2));
      btn.on('pointerdown', () => {
        btn.setFrame(1);
        this.touchLook = true;
      });
      btn.on('pointerup', () => btn.setFrame(0));
      btn.on('pointerout', () => btn.setFrame(0));
      this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.x < W / 2 && this.stick.id < 0) this.stick = { id: p.id, x: base.x, y: base.y, dx: 0, dy: 0 };
      });
      this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (p.id !== this.stick.id) return;
        let dx = p.x - this.stick.x;
        let dy = p.y - this.stick.y;
        const l = Math.hypot(dx, dy);
        if (l > 50) {
          dx = (dx / l) * 50;
          dy = (dy / l) * 50;
        }
        this.stick.dx = dx / 50;
        this.stick.dy = dy / 50;
        this.stickKnob!.setPosition(this.stick.x + dx, this.stick.y + dy);
      });
      const up = (p: Phaser.Input.Pointer) => {
        if (p.id !== this.stick.id) return;
        this.stick = { id: -1, x: 0, y: 0, dx: 0, dy: 0 };
        this.stickKnob!.setPosition(base.x, base.y);
      };
      this.input.on('pointerup', up);
      this.input.on('pointerupoutside', up);
    } else {
      // PC: 독백 상자는 클릭으로도 넘김
      this.input.on('pointerdown', () => this.reading && this.confirm());
    }
  }

  // ---------------------------------------------------------------
  // 매 프레임
  // ---------------------------------------------------------------

  update(_t: number, rawDelta: number) {
    const dt = Math.min(50, rawDelta);
    if (this.touchLook) {
      this.touchLook = false;
      this.confirm();
    }
    if (!this.reading && !this.ending) this.move(dt);
    else this.player.anims.stop();
    this.player.setPosition(Math.round(this.px), Math.round(this.py)).setDepth(this.py);
    this.shadow.setPosition(Math.round(this.px), Math.round(this.py)).setDepth(-4);
    this.findNear();
    this.checkGoal();
  }

  private move(dt: number) {
    const k = this.keys;
    let mx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0) + this.stick.dx;
    let my = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0) + this.stick.dy;
    const l = Math.hypot(mx, my);
    if (l < 0.2) {
      this.player.anims.stop();
      this.player.setTexture('leon', DIRS.indexOf(this.facing) * 5);
      return;
    }
    if (l > 1) {
      mx /= l;
      my /= l;
    }
    this.facing = Math.abs(mx) > Math.abs(my) ? (mx > 0 ? 'right' : 'left') : my > 0 ? 'down' : 'up';
    this.player.play(`leon-walk-${this.facing}`, true);
    const step = SPEED * (dt / 1000);
    const ox = this.px;
    const oy = this.py;
    if (!this.blocked(this.px + mx * step, this.py)) this.px += mx * step;
    if (!this.blocked(this.px, this.py + my * step)) this.py += my * step;
    this.moved += Math.hypot(this.px - ox, this.py - oy);
    if (this.def.tutorial && this.tutStep === 0 && this.moved > 60) {
      this.tutStep = 1;
      this.guide('반짝이는 물건 가까이에서 F를 누르면 살펴봅니다. 처음 살펴보면 경험치를 얻습니다');
    }
  }

  private blocked(x: number, y: number) {
    const a = { x0: x - FOOT.w / 2, y0: y - FOOT.h, x1: x + FOOT.w / 2, y1: y };
    if (a.x0 < 0 || a.x1 > this.mapW || a.y0 < 0 || a.y1 > this.mapH) return true;
    return this.boxes.some((b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0);
  }

  /** 가장 가까운 살펴볼 물건 */
  private findNear() {
    let best: Lookable | null = null;
    let bd = LOOK_RANGE;
    if (!this.reading && !this.ending) {
      for (const l of this.lookables) {
        const p = l.def;
        // 벽에 걸린 것은 벽 바로 아래에서 살펴본다
        const ty = p.wall || p.kind === 'spot' ? Math.max(p.y, 64) + 8 : p.y;
        const d = Math.hypot(p.x - this.px, (ty - this.py) * 1.3);
        if (d < bd) {
          bd = d;
          best = l;
        }
      }
    }
    this.near = best;
    if (!best) return this.prompt.setVisible(false);
    const cam = this.cameras.main;
    const top = best.icon.y - 6;
    const sx = (best.def.x - cam.worldView.x) * ZOOM;
    const sy = (top - cam.worldView.y) * ZOOM;
    const key = this.stickKnob ? '살펴보기' : 'F';
    this.prompt.setText(`${key}  ${best.def.name ?? '살펴보기'}`).setPosition(sx, sy).setVisible(true);
  }

  private checkGoal() {
    if (this.ending || this.reading) return;
    const g = this.def.goal;
    if (Math.hypot(this.px - g.x, (this.py - g.y) * 1.2) > g.r) return;
    this.ending = true;
    this.player.anims.stop();
    this.prompt.setVisible(false);
    this.cameras.main.fadeOut(450, 0, 0, 0);
    this.uiCam.fadeOut(450, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.stop();
      this.start.onEnd();
    });
  }

  // ---------------------------------------------------------------
  // 살펴보기
  // ---------------------------------------------------------------

  private seenKey = (p: PropDef) => `look:${this.start.map}:${p.id}`;
  private seen = (p: PropDef) => gameState.progress.once.includes(this.seenKey(p));

  private confirm() {
    if (this.ending) return;
    if (this.reading) return this.closeLook();
    if (!this.near) return;
    const l = this.near;
    this.reading = l;
    // 바라보는 쪽
    const dx = l.def.x - this.px;
    const dy = l.def.y - this.py;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) this.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    this.player.setTexture('leon', DIRS.indexOf(this.facing) * 5);
    this.boxName.setText(l.def.name ?? '');
    this.boxText.setText((l.def.look ?? []).join('\n'));
    this.box.setVisible(true);
    this.prompt.setVisible(false);
  }

  private closeLook() {
    const l = this.reading!;
    this.reading = null;
    this.box.setVisible(false);
    const party = this.def.party ?? ['leon'];
    const first = !this.seen(l.def);
    if (first) {
      const ups = gainOnce(this.seenKey(l.def), party, l.def.exp ?? 0);
      l.icon.setVisible(false);
      if (l.def.exp) {
        const capped = party.every((id) => isCapped(id));
        this.toast(`경험치 +${l.def.exp}${capped && !ups.length ? '  (최대 레벨: 다음 구간이 열리면 반영)' : ''}`);
      }
      for (const u of ups) this.time.delayedCall(900, () => this.toast(`레벨 업!  Lv ${u.from} → Lv ${u.to}`));
      this.refreshHud();
    }
    if (this.def.tutorial && this.tutStep === 1) {
      this.tutStep = 2;
      const hint = this.def.goal.hint ?? '';
      this.guide(`잘했습니다. 다른 물건도 둘러보세요. ${hint}`, 6000);
    }
  }

  private refreshHud() {
    const id = (this.def.party ?? ['leon'])[0];
    this.lvText.setText(`Lv ${levelOf(id)}`);
    const t = levelProgress(id);
    this.expFill.setCrop(0, 0, Math.round(242 * t), 10);
    const all = this.lookables.length;
    const done = this.lookables.filter((l) => this.seen(l.def)).length;
    this.countText.setText(all ? `살펴본 것 ${done} / ${all}` : '');
  }

  private guide(text: string, ms = 0) {
    this.tweens.killTweensOf(this.guideBox);
    this.guideText.setText(text);
    this.guideBox.setAlpha(1);
    if (ms) this.tweens.add({ targets: this.guideBox, alpha: 0, delay: ms, duration: 600 });
  }

  private toast(text: string) {
    this.tweens.killTweensOf(this.toastText);
    this.toastText.setText(text).setAlpha(1);
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: 1700, duration: 500 });
  }
}
