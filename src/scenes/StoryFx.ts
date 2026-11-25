import Phaser from 'phaser';
import { hex } from '../game/ui';

/**
 * 맵 없이 대화 화면 위에서 보여 주는 연출 (꿈, 남의 기억, 막간).
 * 무대(stage.json)의 아래 칸을 StoryScene이 넘겨주면 여기서 그린다. 맵 화면(Explore)은 이 칸들을 모른다.
 */
export interface DotSpec {
  /** 필드 걷기 시트({인물}) 또는 전투 시트(bt_{인물}) */
  sprite: string;
  /** 서 있는 그림 번호 (없으면 facing 방향의 서기) */
  frame?: number;
  at?: [number, number];
  walk?: [number, number];
  facing?: 'down' | 'left' | 'right' | 'up';
  /** 걷는 빠르기 (화면 px/초) */
  speed?: number;
}
export interface StoryFxDef {
  /** 남의 기억: 이 컷들이 0.2초씩 번쩍 (그림 assets/memory/{이름}.png, 없으면 실루엣). null이면 뚝 끊김 */
  memory?: string[] | null;
  /** 꿈 화면 가운데 작은 등불: on 켜짐, out 깜빡이다 꺼짐 */
  lantern?: 'on' | 'out';
  /** 화면 위에서 천이 내려온다 (색) */
  cloth?: string;
  /** 화면 오른쪽 끝을 색이 0.3초 스치고 지나간다 */
  sweep?: string;
  /** 위에서 내려오는 빛줄기 */
  rays?: boolean;
  /** 맵 없는 화면에 세우는 도트 인물 (null이면 치움) */
  dots?: Record<string, DotSpec | null>;
  /** 이 도트 둘레에 금빛이 반쯤 차오르다 꺼진다 (아드리안의 치유의 빛) */
  glow?: string;
  /** 바로 뒤 독백 덩어리의 이 번째 줄(0부터)이 나올 때 보여 준다 (덩어리 중간 줄에 맞출 때) */
  line?: number;
}

const W = 960;
const H = 720;
const DOT_SCALE = 3;
const DIRS = ['down', 'left', 'right', 'up'];
/** 남의 기억: 하얗게 타 버린 색 (꿈의 세피아와 다르게 차갑고 밝게) */
const BURN_BG = 0xfbfbf4;
const BURN_INK = 0x24201c;

/** RGB를 세피아로 (꿈 배경) */
function sepia(color: string, amount = 0.75, lift = 1.12) {
  const c = Phaser.Display.Color.HexStringToColor(color);
  const r = Math.min(255, c.red * 0.393 + c.green * 0.769 + c.blue * 0.189);
  const g = Math.min(255, c.red * 0.349 + c.green * 0.686 + c.blue * 0.168);
  const b = Math.min(255, c.red * 0.272 + c.green * 0.534 + c.blue * 0.131);
  const mix = (a: number, s: number) => Math.min(255, Math.round((a * (1 - amount) + s * amount) * lift + 10));
  return Phaser.Display.Color.GetColor(mix(c.red, r), mix(c.green, g), mix(c.blue, b));
}

export class StoryFx {
  private s: Phaser.Scene;
  private layer: Phaser.GameObjects.Container;
  private dreamBg?: Phaser.GameObjects.Rectangle;
  private dreamParts: Phaser.GameObjects.GameObject[] = [];
  private memory?: { root: Phaser.GameObjects.Container; timer: Phaser.Time.TimerEvent };
  private lantern?: Phaser.GameObjects.Image;
  private cloth?: Phaser.GameObjects.Graphics;
  private rays?: Phaser.GameObjects.Graphics;
  private dots = new Map<string, Phaser.GameObjects.Sprite>();
  /** line으로 미룬 연출: 독백 줄이 나올 때마다 하나씩 줄여 0이면 보여 준다 */
  private pending: { left: number; def: StoryFxDef }[] = [];
  /** 남의 기억이 켜지고 꺼질 때 (독백 가림막을 옅게) */
  onMemory: (on: boolean) => void = () => {};

  constructor(scene: Phaser.Scene) {
    this.s = scene;
    // 배경(bg) 위, 스탠딩(2~3) 아래
    this.layer = scene.add.container(0, 0).setDepth(1);
    this.makeTextures();
  }

  /** 부드러운 빛 알갱이, 둥근 빛, 가장자리 흐림 그림을 한 번 만든다 */
  private makeTextures() {
    const tex = this.s.textures;
    const radial = (key: string, size: number, stops: [number, string][]) => {
      if (tex.exists(key)) return;
      const c = tex.createCanvas(key, size, size);
      if (!c) return;
      const ctx = c.getContext();
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      for (const [o, col] of stops) g.addColorStop(o, col);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      c.refresh();
    };
    radial('story_mote', 16, [[0, 'rgba(255,248,224,1)'], [0.4, 'rgba(255,240,200,0.6)'], [1, 'rgba(255,240,200,0)']]);
    radial('story_glow', 128, [[0, 'rgba(255,236,180,1)'], [0.25, 'rgba(255,210,120,0.75)'], [1, 'rgba(255,190,90,0)']]);
    // 가장자리 흐림: 꿈은 누런 빛, 남의 기억은 하얗게 날아간 빛
    for (const [key, rgb] of [['story_vignette', '236,218,178'], ['story_burn', '255,255,255']]) {
      if (tex.exists(key)) continue;
      const c = tex.createCanvas(key, W, H);
      if (!c) continue;
      const ctx = c.getContext();
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, W * 0.62);
      g.addColorStop(0, `rgba(${rgb},0)`);
      g.addColorStop(0.55, `rgba(${rgb},0.35)`);
      g.addColorStop(1, `rgba(${rgb},0.9)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      c.refresh();
    }
  }

  // ---------- 꿈 화면 ----------

  /** 꿈 화면: 장면 배경색에 세피아, 가장자리 흐림, 떠다니는 빛 알갱이 */
  setDream(color: string | null) {
    for (const o of this.dreamParts) o.destroy();
    this.dreamParts = [];
    this.dreamBg = undefined;
    if (!color) return;
    const s = this.s;
    this.dreamBg = s.add.rectangle(0, 0, W, H, sepia(color)).setOrigin(0);
    const vignette = s.add.image(0, 0, 'story_vignette').setOrigin(0).setAlpha(0.85);
    const motes = s.add.particles(0, 0, 'story_mote', {
      x: { min: 0, max: W },
      y: { min: 40, max: H },
      lifespan: { min: 5000, max: 8000 },
      speedX: { min: -6, max: 6 },
      speedY: { min: -18, max: -6 },
      scale: { min: 0.5, max: 1.3 },
      alpha: { onEmit: () => 0, onUpdate: (_p: unknown, _k: string, t: number) => Math.sin(t * Math.PI) * 0.8 },
      frequency: 180,
      blendMode: 'ADD',
    });
    motes.fastForward(6000);
    // 알갱이는 흐림 위에 (가장자리에서도 보이게)
    this.layer.addAt([this.dreamBg, vignette, motes], 0);
    this.dreamParts = [this.dreamBg, vignette, motes];
  }

  // ---------- 무대 칸 적용 ----------

  apply(d: StoryFxDef, instant = false) {
    if (d.line !== undefined && !instant) {
      this.pending.push({ left: d.line, def: { ...d, line: undefined } });
      return;
    }
    if (d.memory !== undefined) {
      if (d.memory && !instant) this.startMemory(d.memory);
      else this.stopMemory();
    }
    if (d.lantern) this.setLantern(d.lantern, instant);
    if (d.cloth) this.dropCloth(d.cloth, instant);
    if (d.sweep && !instant) this.sweep(d.sweep);
    if (d.rays !== undefined) this.setRays(d.rays);
    for (const [id, spec] of Object.entries(d.dots ?? {})) this.setDot(id, spec, instant);
    if (d.glow && !instant) this.glow(d.glow);
  }

  /** 독백 한 줄이 나올 때 (StoryScene이 부른다) */
  onLine() {
    const due = this.pending.filter((p) => p.left-- <= 0);
    this.pending = this.pending.filter((p) => p.left >= 0);
    for (const p of due) this.apply(p.def);
  }

  /** 장면이 바뀔 때 모두 치운다 */
  clear() {
    this.pending = [];
    this.stopMemory();
    this.setDream(null);
    this.lantern?.destroy();
    this.lantern = undefined;
    this.cloth?.destroy();
    this.cloth = undefined;
    this.setRays(false);
    for (const d of this.dots.values()) d.destroy();
    this.dots.clear();
  }

  // ---------- 남의 기억 ----------

  private startMemory(cuts: string[]) {
    this.stopMemory();
    const s = this.s;
    // 대사창(5) 뒤, 스탠딩(2~3) 위
    const root = s.add.container(0, 0).setDepth(4.5);
    root.add(s.add.rectangle(0, 0, W, H, BURN_BG).setOrigin(0));
    const frames = cuts.map((name) => {
      const c = s.add.container(0, 0).setVisible(false);
      const key = `memory_${name.replace(/^memory_/, '')}`;
      if (s.textures.exists(key)) {
        const img = s.add.image(W / 2, H / 2, key);
        img.setScale(Math.max(W / img.width, H / img.height));
        c.add(img);
      } else c.add(this.silhouette(name));
      root.add(c);
      return c;
    });
    // 하얗게 날아간 가장자리
    root.add(s.add.image(0, 0, 'story_burn').setOrigin(0));
    this.onMemory(true);
    // 세 컷을 0.2초씩 번쩍 → 옅은 잔상 → 다시
    let step = 0;
    const tick = () => {
      const k = step % (frames.length + 3);
      frames.forEach((f, i) => f.setVisible(i === Math.min(k, frames.length - 1)));
      root.setAlpha(k < frames.length ? 1 : 0.22);
      step++;
    };
    tick();
    const timer = s.time.addEvent({ delay: 200, loop: true, callback: tick });
    this.memory = { root, timer };
  }

  private stopMemory() {
    if (!this.memory) return;
    this.memory.timer.remove();
    this.memory.root.destroy();
    this.memory = undefined;
    this.onMemory(false);
  }

  /** 그림이 없을 때의 검은 실루엣 (금관 / 무너지는 성벽 / 빛에 녹는 사람들, 그 밖은 사람 하나) */
  private silhouette(name: string) {
    const g = this.s.add.graphics();
    g.fillStyle(BURN_INK, 0.92);
    const cx = W / 2;
    if (name.includes('back')) {
      // 금관을 쓴 사람의 뒷모습 (얼굴은 보이지 않음): 어깨·머리 위에 관
      const foot = 620;
      g.fillPoints([new Phaser.Geom.Point(cx - 170, foot), new Phaser.Geom.Point(cx - 150, 430), new Phaser.Geom.Point(cx - 70, 390), new Phaser.Geom.Point(cx + 70, 390), new Phaser.Geom.Point(cx + 150, 430), new Phaser.Geom.Point(cx + 170, foot)], true);
      g.fillRect(cx - 34, 340, 68, 60);
      g.fillEllipse(cx, 290, 150, 170);
      const y = 190;
      g.fillPoints(
        [{ x: cx - 70, y: y + 40 }, { x: cx - 78, y: y - 14 }, { x: cx - 40, y: y + 12 }, { x: cx - 22, y: y - 34 }, { x: cx, y: y + 4 }, { x: cx + 22, y: y - 34 }, { x: cx + 40, y: y + 12 }, { x: cx + 78, y: y - 14 }, { x: cx + 70, y: y + 40 }].map((p) => new Phaser.Geom.Point(p.x, p.y)),
        true,
      );
    } else if (name.includes('crown')) {
      const y = 300;
      g.fillPoints(
        [
          { x: cx - 190, y: y + 110 }, { x: cx - 210, y: y - 40 }, { x: cx - 110, y: y + 30 }, { x: cx - 60, y: y - 90 },
          { x: cx, y: y + 10 }, { x: cx + 60, y: y - 90 }, { x: cx + 110, y: y + 30 }, { x: cx + 210, y: y - 40 }, { x: cx + 190, y: y + 110 },
        ].map((p) => new Phaser.Geom.Point(p.x, p.y)),
        true,
      );
      g.fillRect(cx - 200, y + 120, 400, 40);
      g.fillStyle(BURN_BG, 1);
      for (const dx of [-110, 0, 110]) g.fillCircle(cx + dx, y + 140, 10);
    } else if (name.includes('wall')) {
      // 기울어진 성벽: 톱니 윗단 + 갈라진 틈
      const base = 470;
      for (let i = 0; i < 9; i++) {
        const x = 120 + i * 82;
        const tilt = i > 4 ? (i - 4) * 18 : 0;
        g.fillRect(x, 210 + tilt, 74, base - 210 - tilt);
        if (i % 2 === 0) g.fillRect(x, 170 + tilt, 74, 44);
      }
      g.fillRect(100, base, W - 200, 60);
      g.fillStyle(BURN_BG, 1);
      g.fillTriangle(500, 200, 470, 520, 540, 520);
      for (const [x, y, r] of [[600, 140, 22], [690, 120, 14], [760, 170, 18], [650, 90, 10]]) g.fillCircle(x, y, r);
      g.fillStyle(BURN_INK, 0.92);
      for (const [x, y, r] of [[600, 140, 16], [690, 120, 9], [760, 170, 12]]) g.fillRect(x - r / 2, y - r / 2, r, r);
    } else if (name.includes('people')) {
      // 하얀 빛 속으로 녹는 사람들: 서 있는 사람 모양 위를 하얀 빛이 지워 간다
      const foot = 500;
      [220, 330, 440, 540, 650, 760].forEach((x, i) => {
        const h = 230 + (i % 3) * 24;
        const top = foot - h;
        g.fillCircle(x, top + 22, 22);
        g.fillPoints([new Phaser.Geom.Point(x - 30, top + 50), new Phaser.Geom.Point(x + 30, top + 50), new Phaser.Geom.Point(x + 42, foot), new Phaser.Geom.Point(x - 42, foot)], true);
      });
      g.fillGradientStyle(BURN_BG, BURN_BG, BURN_BG, BURN_BG, 1, 1, 0, 0);
      g.fillRect(0, 150, W, 260);
      g.fillStyle(BURN_BG, 1);
      g.fillRect(0, 0, W, 150);
    } else {
      g.fillCircle(cx, 220, 40);
      g.fillRect(cx - 60, 265, 120, 220);
    }
    return g;
  }

  // ---------- 꿈 속 작은 연출 ----------

  private setLantern(mode: 'on' | 'out', instant: boolean) {
    if (mode === 'on') {
      if (this.lantern) return;
      const l = this.s.add.image(W / 2, 300, 'story_glow').setBlendMode(Phaser.BlendModes.ADD).setScale(1.2);
      this.s.tweens.add({ targets: l, scale: 1.32, alpha: 0.85, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.layer.add(l);
      this.lantern = l;
      return;
    }
    const l = this.lantern;
    this.lantern = undefined;
    if (!l) return;
    this.s.tweens.killTweensOf(l);
    if (instant) return l.destroy();
    // 깜빡이다 꺼짐
    this.s.tweens.chain({
      targets: l,
      tweens: [
        { alpha: 0.2, duration: 90, yoyo: true, repeat: 3 },
        { alpha: 0.5, scale: 0.9, duration: 260 },
        { alpha: 0.1, duration: 80, yoyo: true, repeat: 1 },
        { alpha: 0, scale: 0.6, duration: 500 },
      ],
      onComplete: () => l.destroy(),
    });
  }

  /** 위에서 천이 천천히 내려와 화면 윗부분을 덮는다 */
  private dropCloth(color: string, instant: boolean) {
    this.cloth?.destroy();
    const g = this.s.add.graphics();
    const c = hex(color);
    g.fillStyle(c, 1);
    // 아래 끝이 물결진 천
    const pts: Phaser.Geom.Point[] = [new Phaser.Geom.Point(-40, -400), new Phaser.Geom.Point(W + 40, -400)];
    for (let x = W + 40; x >= -40; x -= 40) pts.push(new Phaser.Geom.Point(x, 150 + Math.sin(x / 70) * 22));
    g.fillPoints(pts, true);
    g.lineStyle(6, Phaser.Display.Color.IntegerToColor(c).darken(25).color, 0.8);
    for (let x = 80; x < W; x += 150) g.lineBetween(x, -400, x + 20, 140 + Math.sin(x / 70) * 22);
    // 꿈 화면 위, 스탠딩 뒤
    g.setAlpha(0.8);
    this.layer.add(g);
    this.cloth = g;
    if (instant) return;
    g.setY(-360);
    this.s.tweens.add({ targets: g, y: 0, duration: 1700, ease: 'Sine.easeOut' });
    this.s.tweens.add({ targets: g, x: { from: -18, to: 0 }, duration: 1700, ease: 'Sine.easeInOut' });
  }

  /** 화면 오른쪽 끝을 색 띠가 0.3초 스치고 지나간다 */
  private sweep(color: string) {
    const r = this.s.add.rectangle(W + 10, 0, 70, H, hex(color), 0.92).setOrigin(0).setDepth(1.5);
    this.s.tweens.add({ targets: r, x: W - 70, duration: 150, yoyo: true, ease: 'Sine.easeOut', onComplete: () => r.destroy() });
  }

  // ---------- 막간 ----------

  /** 높은 창에서 내려오는 빛줄기 몇 줄 */
  private setRays(on: boolean) {
    if (!on) {
      this.rays?.destroy();
      this.rays = undefined;
      return;
    }
    if (this.rays) return;
    const g = this.s.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    for (const [x, w, a] of [[250, 60, 0.1], [390, 90, 0.16], [560, 70, 0.13], [700, 50, 0.08]]) {
      g.fillStyle(0xffe6a8, a);
      g.fillPoints([new Phaser.Geom.Point(x, 0), new Phaser.Geom.Point(x + w, 0), new Phaser.Geom.Point(x + w * 2.4 - 60, H), new Phaser.Geom.Point(x + w * 0.6 - 60, H)], true);
    }
    this.s.tweens.add({ targets: g, alpha: 0.7, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.layer.add(g);
    this.rays = g;
  }

  private standFrame(spec: DotSpec) {
    if (spec.frame !== undefined) return spec.frame;
    return Math.max(0, DIRS.indexOf(spec.facing ?? 'down')) * 5;
  }

  private setDot(id: string, spec: DotSpec | null, instant: boolean) {
    const old = this.dots.get(id);
    if (!spec) {
      old?.destroy();
      this.dots.delete(id);
      return;
    }
    if (!this.s.textures.exists(spec.sprite)) {
      console.warn(`[story] 도트 그림이 없습니다: ${spec.sprite}`);
      return;
    }
    let d = old;
    if (!d || d.texture.key !== spec.sprite) {
      old?.destroy();
      d = this.s.add.sprite(0, 0, spec.sprite, this.standFrame(spec)).setOrigin(0.5, 1).setScale(DOT_SCALE);
      this.layer.add(d);
      this.dots.set(id, d);
    }
    this.s.tweens.killTweensOf(d);
    d.anims.stop();
    d.setFrame(this.standFrame(spec));
    if (spec.at) d.setPosition(spec.at[0], spec.at[1]);
    if (spec.walk) {
      if (instant) d.setPosition(spec.walk[0], spec.walk[1]);
      else {
        const anim = `${spec.sprite}-walk-${spec.facing ?? 'down'}`;
        if (this.s.anims.exists(anim)) d.play(anim);
        const dist = Phaser.Math.Distance.Between(d.x, d.y, spec.walk[0], spec.walk[1]);
        const sprite = d;
        this.s.tweens.add({
          targets: d,
          x: spec.walk[0],
          y: spec.walk[1],
          duration: (dist / (spec.speed ?? 90)) * 1000,
          onComplete: () => {
            sprite.anims.stop();
            sprite.setFrame(this.standFrame(spec));
          },
        });
      }
    }
    // 아래에 있는 인물이 앞에
    this.layer.sort('y');
    this.keepBackdrop();
  }

  /** 정렬 뒤에도 배경(꿈 화면, 빛줄기)은 맨 뒤 */
  private keepBackdrop() {
    for (const o of [this.rays, ...this.dreamParts].reverse()) if (o) this.layer.sendToBack(o);
  }

  /** 금빛이 반쯤 차오르다 깜빡이며 꺼진다 (보스전의 치유의 빛과 같은 그림) */
  private glow(id: string) {
    const d = this.dots.get(id);
    if (!d || !this.s.textures.exists('fx_adrian_heal')) return;
    const fx = this.s.add.sprite(d.x, d.y - (d.displayHeight * 0.4), 'fx_adrian_heal').setScale(DOT_SCALE).setDepth(1.5);
    if (this.s.anims.exists('fx_adrian_heal')) fx.play({ key: 'fx_adrian_heal', repeat: -1 });
    this.s.time.delayedCall(700, () => {
      if (!fx.active) return;
      fx.anims.pause();
      this.s.tweens.add({ targets: fx, alpha: 0.1, duration: 70, yoyo: true, repeat: 4, onComplete: () => fx.destroy() });
    });
  }
}
