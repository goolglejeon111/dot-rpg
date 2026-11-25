import Phaser from 'phaser';
import combos from '../data/battle/combos.json';
import { FONT, makeButton } from '../game/ui';
import type { BattleScene, Fighter, VirtualInput } from './BattleScene';
import { isCapped, isGuest, isUnlocked, levelOf, levelProgress, maxLevel, type Unlock } from './progress';

const W = 960;
const H = 720;
const S = 2; // UI 도트 배율
/** 큰 글자 알림(승리·레벨 업·해금) 하나가 보이는 시간과, 다음 알림까지 쉬는 시간 (ms) */
const BANNER_SHOW = 1800;
const BANNER_GAP = 400;
/** 휴대폰·태블릿 (주소 끝에 ?touch=1을 붙이면 PC에서도 휴대폰 버튼을 볼 수 있음) */
const isTouch = () => window.matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');

type Bar = { frame: Phaser.GameObjects.Image; fill: Phaser.GameObjects.Image; inner: number };

interface ActionIcon {
  what: Unlock | 'attack' | 'jump' | 'interact';
  slot: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  lock: Phaser.GameObjects.Image;
  cd: Phaser.GameObjects.Graphics;
  size: number;
  x: number;
  y: number;
}

/** 전투 화면 위의 UI: 파티 초상화, 체력·기력·고유 게이지, 기술 아이콘, 경험치, 보스 체력, 알림, 게임 오버 */
export class BattleHUD extends Phaser.Scene {
  private b!: BattleScene;
  private slots: { slot: Phaser.GameObjects.Image; face: Phaser.GameObjects.Image; hp: Bar; num: Phaser.GameObjects.Text }[] = [];
  private nameText!: Phaser.GameObjects.Text;
  private hpBar!: Bar;
  private hpText!: Phaser.GameObjects.Text;
  private spBar!: Bar;
  private gaugeBar!: Bar;
  private gaugeText!: Phaser.GameObjects.Text;
  private icons: ActionIcon[] = [];
  private comboBar!: Bar;
  private expBar!: Bar;
  private lvText!: Phaser.GameObjects.Text;
  private expText!: Phaser.GameObjects.Text;
  private boss?: { bar: Bar; name: Phaser.GameObjects.Text };
  private guard?: { bar: Bar; name: Phaser.GameObjects.Text };
  private timerText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private guideBox!: Phaser.GameObjects.Container;
  private guideText!: Phaser.GameObjects.Text;
  private wheel?: Phaser.GameObjects.Container;
  /** 휠의 동료 칸: party 번호, 각도, 칸 그림 */
  private wheelSlots: { i: number; a: number; ok: boolean; slot: Phaser.GameObjects.Image; face: Phaser.GameObjects.Image }[] = [];
  /** 휴대폰: 합동 버튼을 누른 손가락과 누른 자리 */
  private comboTouch?: { id: number; x: number; y: number };
  private gameOver = false;
  /** 큰 글자 알림 줄: 다음 알림을 띄울 수 있는 때, 마지막으로 잡힌 알림이 뜨는 때 */
  private bannerFreeAt = 0;
  private lastBannerAt = 0;
  private touch = false;
  private stick?: { base: Phaser.GameObjects.Image; knob: Phaser.GameObjects.Image; id: number; x: number; y: number };

  constructor() {
    super('BattleHUD');
  }

  init(data: { battle: BattleScene }) {
    this.b = data.battle;
    this.slots = [];
    this.icons = [];
    this.boss = undefined;
    this.guard = undefined;
    this.wheel = undefined;
    this.wheelSlots = [];
    this.comboTouch = undefined;
    this.gameOver = false;
    this.stick = undefined;
  }

  /** 줄 서 있는 큰 글자 알림이 모두 끝날 때까지 남은 시간(ms). 전투를 끝내기 전에 기다린다 */
  bannerLeft() {
    return Math.max(0, this.bannerFreeAt - BANNER_GAP - this.time.now);
  }

  create() {
    this.bannerFreeAt = 0;
    this.lastBannerAt = 0;
    this.touch = isTouch();
    this.input.addPointer(3);
    this.cameras.main.fadeIn(350, 0, 0, 0);
    const cut = this.b.cutscene;

    // ---- 위: 파티 초상화 (숫자 = 교체 키) ----
    this.b.party.forEach((f, i) => {
      const x = 16 + i * 92;
      const y = 14;
      const slot = this.img(x, y, 'ui_slot');
      const face = this.img(x + 2 * S, y + 2 * S, `ui_face_${f.id}`);
      const hp = this.bar(x, y + 22 * S + 4, 'hp_s', 'green_3');
      const num = this.add.text(x + 22 * S + 4, y + 2, `${i + 1}`, { fontFamily: FONT, fontSize: '18px', color: '#f3e7c4', fontStyle: 'bold' }).setShadow(0, 2, '#000', 2);
      slot.setInteractive().on('pointerdown', (_p: unknown, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        this.b.vin.swap = i + 1;
      });
      // 임시 동료 표시
      if (isGuest(f.id))
        this.add
          .text(x + 11 * S, y + 20 * S, '임시', { fontFamily: FONT, fontSize: '13px', color: '#ffe0a0', backgroundColor: '#5a3a18', padding: { x: 3, y: 0 } })
          .setOrigin(0.5, 1)
          .setDepth(2);
      this.slots.push({ slot, face, hp, num });
    });

    // ---- 조작 중인 인물: 이름, 체력, 기력, 고유 게이지 ----
    const px = 16;
    const py = 82;
    this.nameText = this.add.text(px, py, '', { fontFamily: FONT, fontSize: '19px', color: '#ffffff', fontStyle: 'bold' }).setShadow(0, 2, '#000', 3);
    this.hpBar = this.bar(px, py + 28, 'hp_l', 'red_6');
    this.hpText = this.add.text(px + 124 * S + 8, py + 25, '', { fontFamily: FONT, fontSize: '16px', color: '#ffdede' }).setShadow(0, 2, '#000', 2);
    this.spBar = this.bar(px, py + 50, 'sp', 'gold_3');
    this.add.text(px + 124 * S + 8, py + 44, '기력', { fontFamily: FONT, fontSize: '14px', color: '#e8d590' }).setShadow(0, 2, '#000', 2).setVisible(!cut);
    this.gaugeBar = this.bar(px, py + 66, 'gauge', 'white_3');
    this.gaugeText = this.add.text(px + 124 * S + 8, py + 60, '', { fontFamily: FONT, fontSize: '14px', color: '#ffffff' }).setShadow(0, 2, '#000', 2);
    if (cut) for (const o of [this.spBar.frame, this.spBar.fill, this.gaugeBar.frame, this.gaugeBar.fill, this.gaugeText]) o.setVisible(false);

    // ---- 아래 가운데: 경험치, 레벨 ----
    this.expBar = this.bar(W / 2 - 122 * S, H - 22, 'exp', 'sky_3');
    this.lvText = this.add.text(W / 2 - 122 * S - 10, H - 30, '', { fontFamily: FONT, fontSize: '17px', color: '#e0c27a', fontStyle: 'bold' }).setOrigin(1, 0).setShadow(0, 2, '#000', 2);
    this.expText = this.add.text(W / 2 + 122 * S + 10, H - 30, '', { fontFamily: FONT, fontSize: '15px', color: '#cfe8ee' }).setShadow(0, 2, '#000', 2);
    if (cut) for (const o of [this.expBar.frame, this.expBar.fill, this.lvText, this.expText]) o.setVisible(false);

    this.timerText = this.add.text(W / 2, 16, '', { fontFamily: FONT, fontSize: '22px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5, 0).setShadow(0, 2, '#000', 3);

    // ---- 기술 아이콘 (PC) 또는 휴대폰 버튼 ----
    if (!cut) {
      if (this.touch) this.makeTouchControls();
      else this.makeIconRow();
    }

    // ---- 알림 ----
    this.toastText = this.add
      .text(W / 2, 262, '', { fontFamily: FONT, fontSize: '21px', color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 14, y: 8 } })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(20);
    const gbg = this.add.rectangle(0, 0, 720, 56, 0x0c0a14, 0.85).setStrokeStyle(2, 0xcdb88a);
    this.guideText = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '18px', color: '#f3e7c4', align: 'center', wordWrap: { width: 690, useAdvancedWrap: true } })
      .setOrigin(0.5);
    this.guideBox = this.add.container(W / 2, H - 120, [gbg, this.guideText]).setAlpha(0).setDepth(19);
    if (this.touch) this.guideBox.setY(250);

    const title = (this.b.bdef as { title?: string }).title;
    if (title && !cut) {
      const t = this.add.text(W / 2, 220, title, { fontFamily: FONT, fontSize: '34px', color: '#e0c27a', fontStyle: 'bold' }).setOrigin(0.5).setShadow(0, 3, '#000', 6);
      this.tweens.add({ targets: t, alpha: 0, delay: 1400, duration: 700, onComplete: () => t.destroy() });
    }
  }

  // ---------------------------------------------------------------

  private img(x: number, y: number, key: string, frame = 0) {
    return this.add.image(x, y, key, frame).setOrigin(0).setScale(S);
  }

  /** 테두리 + 채움 (채움은 잘라서 길이를 바꿈) */
  private bar(x: number, y: number, kind: string, fill: string): Bar {
    const frame = this.img(x, y, `ui_bar_${kind}`);
    const f = this.img(x + S, y + S, `ui_fill_${fill}`);
    return { frame, fill: f, inner: frame.width - 2 };
  }

  private setBar(b: Bar, t: number) {
    const h = b.fill.height;
    b.fill.setCrop(0, 0, Math.max(0, Math.round(b.inner * Phaser.Math.Clamp(t, 0, 1))), h);
  }

  private makeIcon(what: ActionIcon['what'], iconKey: string, x: number, y: number, key: string, big = false): ActionIcon {
    const size = big ? 44 : 22;
    const slot = big ? this.img(x - 44, y - 44, 'ui_btn') : this.img(x - 22, y - 22, 'ui_slot');
    const icon = this.add.image(x, y, `ui_${iconKey}`).setScale(S);
    const cd = this.add.graphics();
    const lock = this.add.image(x + size - 12, y + size - 14, 'ui_icon_lock').setScale(S).setVisible(false);
    if (key) {
      this.add
        .text(x, y + size + (big ? -4 : 4), key, { fontFamily: FONT, fontSize: big ? '15px' : '14px', color: '#f3e7c4', fontStyle: 'bold' })
        .setOrigin(0.5, 0)
        .setShadow(0, 2, '#000', 2);
    }
    const ic: ActionIcon = { what, slot, icon, lock, cd, size, x, y };
    this.icons.push(ic);
    return ic;
  }

  /** PC: 오른쪽 아래 아이콘 줄 (회피 Shift, 스킬 E, 궁극기 Q, 합동 R) */
  private makeIconRow() {
    const y = H - 92;
    const xs = [W - 270, W - 206, W - 142, W - 78];
    this.makeIcon('evade', 'icon_guard', xs[0], y, 'Shift');
    this.makeIcon('skill', 'icon_skill', xs[1], y, 'E');
    this.makeIcon('ult', 'icon_ult', xs[2], y, 'Q');
    this.makeIcon('combo', 'icon_combo', xs[3], y, 'R');
    this.comboBar = this.bar(xs[3] - 64, y + 44, 'combo', 'gold_4');
    this.add
      .text(W - 16, H - 150, '이동 WASD · 공격 왼쪽 클릭 · 점프 Space · 깨우기 F(누르기) · 교체 1~4', { fontFamily: FONT, fontSize: '14px', color: '#aaaaaa' })
      .setOrigin(1, 0.5)
      .setShadow(0, 2, '#000', 2);
  }

  /** 휴대폰: 왼쪽 조이스틱, 오른쪽 버튼 (PC와 같은 조작) */
  private makeTouchControls() {
    const base = this.add.image(120, H - 210, 'ui_stick_base').setScale(S).setAlpha(0.85);
    const knob = this.add.image(120, H - 210, 'ui_stick_knob').setScale(S);
    this.stick = { base, knob, id: -1, x: 120, y: H - 210 };
    const btn = (what: ActionIcon['what'], icon: string, x: number, y: number, label: string, key: keyof VirtualInput, pulse = false) => {
      const ic = this.makeIcon(what, icon, x, y, label, true);
      ic.slot.setInteractive(new Phaser.Geom.Circle(22, 22, 22), Phaser.Geom.Circle.Contains);
      const set = (v: boolean) => ((this.b.vin as unknown as Record<string, boolean>)[key] = v);
      ic.slot.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        if (key === 'combo') this.comboTouch = { id: p.id, x: p.x, y: p.y };
        set(true);
        ic.slot.setFrame(1);
        if (pulse) this.time.delayedCall(60, () => set(false));
      });
      const up = () => {
        set(false);
        ic.slot.setFrame(0);
      };
      ic.slot.on('pointerup', up);
      // 합동 버튼은 누른 채 동료 쪽으로 밀기 때문에, 버튼 밖으로 나가도 떼기 전까지 누른 것으로 본다
      if (key === 'combo') {
        this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
          if (this.comboTouch?.id === p.id) up();
        });
      } else ic.slot.on('pointerout', up);
    };
    btn('attack', 'icon_attack', W - 80, H - 190, '공격', 'attack', true);
    btn('evade', 'icon_guard', W - 185, H - 140, '회피', 'evade');
    btn('jump', 'icon_jump', W - 80, H - 295, '점프', 'jump', true);
    btn('skill', 'icon_skill', W - 195, H - 248, '스킬', 'skill', true);
    btn('ult', 'icon_ult', W - 175, H - 355, '궁극기', 'ult', true);
    btn('combo', 'icon_combo', W - 80, H - 400, '합동', 'combo');
    btn('interact', 'icon_interact', W - 290, H - 175, '상호작용', 'interact');
    this.comboBar = this.bar(W - 80 - 64, H - 400 + 60, 'combo', 'gold_4');

    // 조이스틱
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const s = this.stick!;
      if (s.id < 0 && Math.hypot(p.x - s.x, p.y - s.y) < 150) s.id = p.id;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const s = this.stick!;
      if (p.id !== s.id) return;
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      const l = Math.hypot(dx, dy);
      const k = l > 44 ? 44 / l : 1;
      s.knob.setPosition(s.x + dx * k, s.y + dy * k);
      this.b.vin.mx = l > 8 ? (dx * k) / 44 : 0;
      this.b.vin.my = l > 8 ? (dy * k) / 44 : 0;
    });
    const release = (p: Phaser.Input.Pointer) => {
      const s = this.stick!;
      if (p.id !== s.id) return;
      s.id = -1;
      s.knob.setPosition(s.x, s.y);
      this.b.vin.mx = 0;
      this.b.vin.my = 0;
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  // ---------------------------------------------------------------

  update() {
    const b = this.b;
    if (!b || !b.sys.isActive()) return;
    const f = b.controlled;

    // 파티 초상화
    b.party.forEach((p, i) => {
      const s = this.slots[i];
      const out = p.state === 'fainted';
      s.slot.setFrame(out ? 2 : p === f ? 1 : 0);
      s.face.setFrame(out ? 1 : 0);
      s.num.setColor(out ? '#777777' : '#f3e7c4');
      this.setBar(s.hp, p.hp / p.maxHp);
    });

    if (f) {
      const lv = levelOf(f.id);
      this.nameText.setText(`${f.def.name}  Lv ${lv}`);
      this.setBar(this.hpBar, f.hp / f.maxHp);
      this.hpText.setText(`${Math.ceil(f.hp)} / ${f.maxHp}`);
      this.setBar(this.spBar, f.stamina / f.maxStamina);
      this.setBar(this.gaugeBar, f.gauge / 100);
      this.gaugeText.setText(f.def.gauge?.name ?? '');
      if (f.def.gauge) this.gaugeBar.fill.setTexture(`ui_fill_${f.def.gauge.fill}_3`);
      // 경험치
      this.setBar(this.expBar, levelProgress(f.id));
      this.lvText.setText(`Lv ${lv}`);
      this.expText.setText(isCapped(f.id) ? `최대 레벨 (${maxLevel()})` : `${Math.floor(levelProgress(f.id) * 100)}%`);
      this.expText.setColor(isCapped(f.id) ? '#e0c27a' : '#cfe8ee');

      // 기술 아이콘: 잠금, 쿨타임
      for (const ic of this.icons) {
        const locked = ic.what === 'attack' || ic.what === 'jump' || ic.what === 'interact' ? false : !isUnlocked(f.id, ic.what);
        ic.icon.setAlpha(locked ? 0.35 : 1);
        ic.lock.setVisible(locked);
        let cd = 0;
        if (ic.what === 'evade' && !locked) {
          const total = f.def.evade?.cooldown ?? 1000;
          cd = Math.max(0, (f.guardCd - b.now) / total);
          if (f.state === 'guard') ic.slot.setFrame(1);
          else if (!this.touch) ic.slot.setFrame(0);
        }
        if (ic.what === 'skill' && !locked) cd = Math.max(0, (f.skillCd - b.now) / (f.def.skill?.cooldown ?? 1));
        if (ic.what === 'ult' && !locked) cd = f.gauge >= 100 ? 0 : 1 - f.gauge / 100;
        if (ic.what === 'combo' && !locked) cd = b.comboGauge >= 100 ? 0 : 1 - b.comboGauge / 100;
        ic.cd.clear();
        if (cd > 0) {
          const s = ic.size * S - 4;
          ic.cd.fillStyle(0x000000, 0.6).fillRect(ic.x - s / 2, ic.y - s / 2, s, s * Math.min(1, cd));
        }
      }
    }
    if (this.comboBar) this.setBar(this.comboBar, b.comboGauge / 100);

    // 보스 체력
    const boss = b.enemiesBoss;
    if (boss && !this.boss) {
      // 위쪽 오른편 (왼쪽 위 파티 칸과 겹치지 않게)
      const bx = W - 16 - 324 * S;
      const bar = this.bar(bx, 44, 'boss', 'red_8');
      const name = this.add.text(bx + 162 * S, 38, boss.def.name, { fontFamily: FONT, fontSize: '19px', color: '#f4dede', fontStyle: 'bold' }).setOrigin(0.5, 1).setShadow(0, 2, '#000', 3);
      this.boss = { bar, name };
    }
    if (this.boss) this.setBar(this.boss.bar, boss ? boss.hp / boss.maxHp : 0);

    // 지켜야 하는 대상의 체력 (위쪽 가운데)
    const pr = b.protectTarget;
    if (pr && !this.guard) {
      const gx = W / 2 - 162 * S;
      const bar = this.bar(gx, 44, 'boss', 'green_8');
      const name = this.add.text(W / 2, 38, '지켜야 할 것: ' + pr.def.name, { fontFamily: FONT, fontSize: '17px', color: '#dff4de', fontStyle: 'bold' }).setOrigin(0.5, 1).setShadow(0, 2, '#000', 3);
      this.guard = { bar, name };
    }
    if (this.guard) this.setBar(this.guard.bar, pr ? pr.hp / pr.maxHp : 0);

    const tl = b.timeLeft;
    this.timerText.setText(tl === null ? '' : `남은 시간 ${Math.ceil(tl)}`);

    // 합동 기술 휠
    if (b.wheelOpen && !this.wheel && f) this.openWheel(f);
    if (!b.wheelOpen && this.wheel) {
      this.wheel.destroy();
      this.wheel = undefined;
      this.wheelSlots = [];
    }
    if (this.wheel) this.pickInWheel();

    // 알림
    while (b.notices.length) {
      const n = b.notices.shift()!;
      if (n.kind === 'toast') this.toast(n.text);
      else if (n.kind === 'guide' && n.text) {
        // 큰 글자 알림이 줄 서 있으면, 바로 앞 알림(예: 해금)이 뜰 때 같이 뜬다
        const text = n.text;
        const ms = n.ms ?? 5000;
        const wait = this.lastBannerAt - this.time.now;
        if (wait > 0) this.time.delayedCall(wait, () => this.guide(text, ms));
        else this.guide(text, ms);
      } else if (n.kind === 'levelup') this.banner('ui_word_levelup', n.text, '#e0c27a');
      else if (n.kind === 'unlock') this.banner('ui_word_unlock', n.text, '#ffffff', n.what);
      else if (n.kind === 'word' && n.text === 'victory') this.banner('ui_word_victory', '', '#ffffff');
      else if (n.kind === 'word' && n.text === 'gameover') this.showGameOver();
      else if (n.kind === 'guideOff') {
        this.tweens.killTweensOf(this.guideBox);
        this.tweens.add({ targets: this.guideBox, alpha: 0, duration: 400 });
      } else if (n.kind === 'cutin') this.cutIn(n.text);
      else if (n.kind === 'ultcut') this.ultCut(n.text);
    }
  }

  private toast(text: string) {
    this.tweens.killTweensOf(this.toastText);
    this.toastText.setText(text).setAlpha(1);
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: 1600, duration: 500 });
  }

  private guide(text: string, ms: number) {
    this.tweens.killTweensOf(this.guideBox);
    this.guideText.setText(text);
    this.guideBox.setAlpha(1);
    this.tweens.add({ targets: this.guideBox, alpha: 0, delay: ms, duration: 600 });
  }

  /**
   * VICTORY, LEVEL UP, UNLOCK 같은 큰 글자.
   * 같은 자리에 겹치지 않도록 줄을 세워, 앞 알림이 사라진 뒤 BANNER_GAP만큼 쉬고 다음 알림을 띄운다
   */
  private banner(key: string, text: string, color: string, what?: Unlock) {
    const now = this.time.now;
    const start = Math.max(now, this.bannerFreeAt);
    this.lastBannerAt = start;
    this.bannerFreeAt = start + BANNER_SHOW + BANNER_GAP;
    this.time.delayedCall(start - now, () => {
      const im = this.add.image(W / 2, 290, key).setScale(4).setAlpha(0);
      const t = this.add.text(W / 2, 336, text, { fontFamily: FONT, fontSize: '24px', color, fontStyle: 'bold' }).setOrigin(0.5).setShadow(0, 2, '#000', 4).setAlpha(0);
      this.tweens.add({ targets: [im, t], alpha: 1, duration: 200 });
      this.tweens.add({ targets: im, scale: { from: 5, to: 4 }, duration: 250, ease: 'Back.easeOut' });
      this.tweens.add({ targets: [im, t], alpha: 0, delay: BANNER_SHOW - 500, duration: 500, onComplete: () => (im.destroy(), t.destroy()) });
      // 해금된 아이콘을 반짝
      const ic = this.icons.find((i) => i.what === what);
      if (ic) {
        const fx = this.add.sprite(ic.x, ic.y, 'fx_unlock').setScale(S).play('fx_unlock');
        fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
      }
    });
  }

  /** R을 누르는 동안: 동료 얼굴이 원형으로. 조합이 없는 동료는 어둡게 */
  private openWheel(f: Fighter) {
    const c = this.add.container(W / 2, H / 2).setDepth(30);
    c.add(this.add.rectangle(0, 0, W, H, 0x000000, 0.35));
    c.add(this.add.image(0, 0, 'ui_wheel').setScale(S));
    const others = this.b.party.filter((p) => p !== f);
    const has = (id: string) => combos.combos.some((k) => k.pair.includes(f.id) && k.pair.includes(id));
    if (!others.length) {
      c.add(this.add.text(0, 0, '함께 싸우는\n동료가 없습니다', { fontFamily: FONT, fontSize: '18px', color: '#dddddd', align: 'center' }).setOrigin(0.5));
    }
    this.wheelSlots = [];
    others.forEach((p, i) => {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / Math.max(3, others.length);
      const x = Math.cos(a) * 74;
      const y = Math.sin(a) * 74;
      const ok = has(p.id) && p.state !== 'fainted';
      const slot = this.add.image(x, y, 'ui_wheel_slot', ok ? 0 : 1).setScale(S);
      const face = this.add.image(x, y, `ui_face_${p.id}`, ok ? 0 : 1).setScale(S);
      c.add(slot);
      c.add(face);
      this.wheelSlots.push({ i: this.b.party.indexOf(p), a, ok, slot, face });
      const name = combos.combos.find((k) => k.pair.includes(f.id) && k.pair.includes(p.id))?.name ?? '조합 없음';
      c.add(this.add.text(x, y + 34, name, { fontFamily: FONT, fontSize: '14px', color: ok ? '#f3e7c4' : '#777777' }).setOrigin(0.5, 0));
    });
    const hint = this.touch ? '동료 쪽으로 밀었다 떼면 발동' : '마우스로 동료를 가리키고 R을 떼면 발동';
    c.add(this.add.text(0, 140, hint, { fontFamily: FONT, fontSize: '16px', color: '#cccccc' }).setOrigin(0.5));
    this.wheel = c;
  }

  /** 휠에서 가리킨 동료: PC는 화면 가운데에서 마우스 쪽, 휴대폰은 누른 자리에서 민 쪽 */
  private pickInWheel() {
    let dx = 0;
    let dy = 0;
    let min = 40;
    const t = this.comboTouch;
    const tp = t ? this.input.manager.pointers.find((p) => p.id === t.id && p.isDown) : undefined;
    if (t && tp) {
      dx = tp.x - t.x;
      dy = tp.y - t.y;
      min = 24;
    } else {
      const p = this.input.activePointer;
      dx = p.x - W / 2;
      dy = p.y - H / 2;
    }
    let pick = -1;
    if (Math.hypot(dx, dy) >= min && this.wheelSlots.length) {
      const ang = Math.atan2(dy, dx);
      const best = this.wheelSlots.reduce((a, b) => (Math.abs(Phaser.Math.Angle.Wrap(a.a - ang)) < Math.abs(Phaser.Math.Angle.Wrap(b.a - ang)) ? a : b));
      pick = best.i;
    }
    this.b.comboPick = pick;
    for (const s of this.wheelSlots) {
      const on = s.i === pick;
      s.slot.setScale(on ? S * 1.25 : S);
      s.face.setScale(on ? S * 1.25 : S);
    }
  }

  /** 합동 기술 첫 발동: 두 사람 얼굴이 화면을 가로지른다 (text = "id1,id2,기술 이름") */
  private cutIn(text: string) {
    const [a, b, name] = text.split(',');
    const band = (id: string, y: number, from: number) => {
      const bg = this.add.rectangle(0, y, W, 120, 0x000000, 0.75).setOrigin(0, 0.5).setDepth(35);
      const face = this.add.image(W / 2 + from, y, `ui_face_${id}`, 0).setScale(S * 3).setDepth(36);
      this.tweens.add({ targets: face, x: W / 2 + from * 0.15, duration: 260, ease: 'Quad.out' });
      this.tweens.add({ targets: [bg, face], alpha: 0, delay: 900, duration: 200, onComplete: () => (bg.destroy(), face.destroy()) });
    };
    band(a, H / 2 - 80, -360);
    band(b, H / 2 + 80, 360);
    const t = this.add.text(W / 2, H / 2, name ?? '', { fontFamily: FONT, fontSize: '30px', color: '#f3e7c4', fontStyle: 'bold' }).setOrigin(0.5).setShadow(0, 2, '#000', 4).setDepth(37);
    this.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 200, onComplete: () => t.destroy() });
  }

  /** 궁극기 컷인: 가운데 띠 하나에 얼굴과 기술 이름이 0.6초 스친다 (전투는 계속) */
  private ultCut(text: string) {
    const [id, name] = text.split(',');
    const y = H / 2 - 40;
    const bg = this.add.rectangle(0, y, W, 96, 0x000000, 0.7).setOrigin(0, 0.5).setDepth(35).setScale(1, 0);
    const face = this.add.image(W / 2 - 220, y, `ui_face_${id}`, 0).setScale(S * 2.4).setDepth(36).setAlpha(0);
    const t = this.add.text(W / 2 + 40, y, name ?? '', { fontFamily: FONT, fontSize: '30px', color: '#f3e7c4', fontStyle: 'bold' }).setOrigin(0, 0.5).setShadow(0, 2, '#000', 4).setDepth(37).setAlpha(0);
    this.tweens.add({ targets: bg, scaleY: 1, duration: 90, ease: 'Quad.out' });
    this.tweens.add({ targets: face, alpha: 1, x: face.x + 40, duration: 200, ease: 'Quad.out' });
    this.tweens.add({ targets: t, alpha: 1, x: t.x - 20, duration: 200, delay: 60, ease: 'Quad.out' });
    this.tweens.add({ targets: [bg, face, t], alpha: 0, delay: 520, duration: 140, onComplete: () => (bg.destroy(), face.destroy(), t.destroy()) });
  }

  /** 파티 전멸: 데드엔딩처럼 화면이 붉게 어두워지고 GAME OVER */
  private showGameOver() {
    if (this.gameOver) return;
    this.gameOver = true;
    const shade = this.add.rectangle(0, 0, W, H, 0x2a0000, 1).setOrigin(0).setAlpha(0).setInteractive().setDepth(40);
    const word = this.add.image(W / 2, H / 2 - 90, 'ui_word_gameover').setScale(6).setAlpha(0).setDepth(41);
    const sub = this.add
      .text(W / 2, H / 2 - 10, '가장 최근 저장 지점부터 다시 시작합니다', { fontFamily: FONT, fontSize: '20px', color: '#e8c8c8' })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(41);
    const opt = { w: 280, h: 52, fontSize: 21, fill: [0x2a0c0c, 0x5a1a1a] as [number, number], stroke: 0xc05050, depth: 42 };
    const retry = makeButton(this, W / 2, H / 2 + 70, '다시 하기 (Enter)', () => go(true), opt).setAlpha(0);
    const title = makeButton(this, W / 2, H / 2 + 136, '타이틀로', () => go(false), opt).setAlpha(0);
    let chosen = false;
    const go = (r: boolean) => {
      if (chosen) return;
      chosen = true;
      this.b.gameOverChoice(r);
    };
    this.tweens.add({ targets: shade, alpha: 0.92, duration: 900 });
    this.tweens.add({ targets: [word, sub, retry, title], alpha: 1, duration: 700, delay: 700 });
    this.time.delayedCall(900, () => this.input.keyboard!.once('keydown-ENTER', () => go(true)));
  }
}

