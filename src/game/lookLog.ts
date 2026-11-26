import Phaser from 'phaser';
import looksData from '../data/explore/looks.json';
import stageData from '../data/explore/stage.json';
import { EXP_REWARD } from '../battle/progress';
import { FIRST_STORY, stories } from './data';
import { gameState } from './GameState';
import { save, type WalkEntry } from './save';
import { FONT, makeButton } from './ui';

/**
 * 조사 기록 (docs/claude_code/조사_기록.md): 막 → 이동 구간 순서로 조사한 물건을 다시 본다.
 * 대화·이동 중(J, 이번 진행)과 타이틀 "조사 기록"(게임 밖 기록, 수집률)에서 같은 화면을 쓴다
 */

const W = 960;
const H = 720;
const LOOKS = looksData as unknown as Record<string, { name: string; text: string; pickup?: boolean }>;
const SEGS = (stageData as unknown as { segments: Record<string, { looks: string[]; until?: string; need?: string[] }> }).segments;

/** 숨은 곳: 찾기 전에는 목록·숫자에 넣지 않는다 */
const isHidden = (id: string) => id.includes('_hidden_');
/** 이야기 묶음: 줍는 것과 필수 조사 (숫자에 넣지 않음) */
const STORY_LOOKS = new Set<string>([
  ...Object.values(SEGS).flatMap((d) => [...(d.until ? [d.until] : []), ...(d.need ?? [])]),
  ...Object.keys(LOOKS).filter((id) => LOOKS[id].pickup),
]);

export interface LookSeg {
  story: string;
  act: string;
  seg: string;
  place: string;
  /** 숫자에 넣는 물건 */
  counted: string[];
  /** 이야기 묶음 물건 */
  storyLooks: string[];
}

let cache: LookSeg[] | null = null;

/** 대본 순서대로 이동 구간과 그때의 장소 이름 */
export function lookSegments(): LookSeg[] {
  if (cache) return cache;
  const order = [FIRST_STORY, ...Object.keys(stories).filter((k) => k !== FIRST_STORY && !k.startsWith('dev'))];
  const out: LookSeg[] = [];
  const done = new Set<string>();
  for (const sid of order) {
    const st = stories[sid];
    if (!st) continue;
    const act = st.title.split(':')[0].trim();
    for (const sc of st.scenes) {
      let place = sc.place;
      for (const n of sc.nodes) {
        if ('place' in n) place = n.place;
        if (!('explore' in n) || done.has(n.explore)) continue;
        done.add(n.explore);
        const d = SEGS[n.explore];
        if (!d?.looks.length) continue;
        out.push({
          story: sid,
          act,
          seg: n.explore,
          place,
          counted: d.looks.filter((id) => !STORY_LOOKS.has(id)),
          storyLooks: d.looks.filter((id) => STORY_LOOKS.has(id)),
        });
      }
    }
  }
  cache = out;
  return out;
}

/** 이번 진행에서 조사한 것을 게임 밖 기록에도 (예전 저장은 여기서 옮겨진다) */
export function syncLooked() {
  save.markLooked(gameState.progress.once.filter((k) => k.startsWith('look:')).map((k) => k.slice(5)));
}

/** 타이틀의 수집률: 숫자에 넣는 물건 전체 중 한 번이라도 조사한 것 */
export function lookRate() {
  const all = [...new Set(lookSegments().flatMap((s) => s.counted))];
  return { seen: all.filter((id) => save.hasLookedEver(id)).length, all: all.length };
}

export interface LookLogOpts {
  /** 타이틀에서: 게임 밖 기록으로 보고, 다시 걷기는 없음 */
  title?: boolean;
  /** 지금 걷고 있는 구간 */
  current?: string;
  depth?: number;
  onRewalk?: (w: WalkEntry, index: number) => void;
  onClose: () => void;
}

export interface LookLogView {
  root: Phaser.GameObjects.Container;
  scroll: (dy: number) => void;
  close: () => void;
}

export function openLookLog(scene: Phaser.Scene, o: LookLogOpts): LookLogView {
  syncLooked();
  const once = gameState.progress.once;
  const seen = (id: string) => (o.title ? save.hasLookedEver(id) : once.includes(`look:${id}`));
  const walks = save.walks;
  const segs = lookSegments().filter((s) =>
    o.title
      ? save.hasWalkedEver(s.seg) || s.counted.some(seen)
      : s.seg === o.current || walks.some((w) => w.story === s.story && w.seg === s.seg) || s.counted.some(seen) || s.storyLooks.some(seen),
  );
  const top = 96;
  const bottom = H - 92;
  const rowH = 34;
  const depth = o.depth ?? 20;

  const shade = scene.add.rectangle(0, 0, W, H, 0x05050a, 0.95).setOrigin(0).setInteractive();
  const rate = lookRate();
  const head = scene.add
    .text(W / 2, 46, o.title ? `조사 기록 — 수집률 ${rate.seen} / ${rate.all}` : '조사 기록', { fontFamily: FONT, fontSize: '26px', color: '#e0c27a' })
    .setOrigin(0.5);
  const help = scene.add
    .text(W / 2, H - 30, '구간을 누르면 펼치기 / 물건을 누르면 독백 / 휠·↑↓로 넘기기 / Esc로 닫기', { fontFamily: FONT, fontSize: '15px', color: '#888888' })
    .setOrigin(0.5);
  const line = scene.add.rectangle(462, top, 2, bottom - top, 0x3a3448).setOrigin(0.5, 0);
  // 오른쪽: 고른 물건의 독백
  const rName = scene.add.text(490, top + 4, '', { fontFamily: FONT, fontSize: '24px', color: '#e0c27a', fontStyle: 'bold' });
  const rMeta = scene.add.text(490, top + 42, '', { fontFamily: FONT, fontSize: '16px', color: '#a8a090' });
  const rBody = scene.add.text(490, top + 76, '', {
    fontFamily: FONT,
    fontSize: '20px',
    color: '#e8e8e8',
    lineSpacing: 8,
    wordWrap: { width: W - 540, useAdvancedWrap: true },
  });
  const list = scene.add.container(0, 0);
  const maskShape = scene.make.graphics({}, false).fillRect(0, top, 462, bottom - top);
  list.setMask(maskShape.createGeometryMask());
  const closeBtn = makeButton(scene, W / 2, H - 62, '닫기', () => close(), { w: 160, h: 36, fontSize: 18, depth });
  const root = scene.add.container(0, 0, [shade, head, help, line, rName, rMeta, rBody, list, closeBtn]).setDepth(depth);

  let open: string | null = o.current ?? walks.at(-1)?.seg ?? segs.at(-1)?.seg ?? null;
  let sel: string | null = null;
  let asking: Phaser.GameObjects.Container | null = null;
  let height = 0;
  const inView = (p: Phaser.Input.Pointer) => p.y >= top && p.y <= bottom;

  const showItem = (id: string | null) => {
    sel = id;
    if (!id) {
      rName.setText('');
      rMeta.setText('');
      rBody.setText(segs.length ? '왼쪽에서 조사한 물건을 고르세요' : '아직 조사한 곳이 없습니다').setColor('#888888');
      return;
    }
    rName.setText(LOOKS[id]?.name.replace(/ 줍기$/, '') ?? id);
    const meta = [EXP_REWARD.look(id) ? `경험치 +${EXP_REWARD.look(id)}` : '', isHidden(id) ? '숨은 곳' : '', STORY_LOOKS.has(id) ? '이야기' : ''].filter(Boolean);
    rMeta.setText(meta.join('  ·  '));
    rBody.setText((LOOKS[id]?.text ?? '').replace(/\n\n+/g, '\n\n')).setColor('#e8e8e8');
  };

  const row = (y: number, x: number, text: string, color: string, size: number, onClick?: () => void) => {
    const t = scene.add.text(x, y + 4, text, { fontFamily: FONT, fontSize: `${size}px`, color });
    list.add(t);
    if (onClick) {
      t.setInteractive({ useHandCursor: true });
      t.on('pointerover', () => t.setColor('#ffe9a8'));
      t.on('pointerout', () => t.setColor(color));
      t.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        if (!asking && inView(p)) onClick();
      });
    }
    return t;
  };

  const draw = () => {
    list.removeAll(true);
    let y = 0;
    let openY = 0;
    let act = '';
    const acts = [...new Set(segs.map((s) => s.story))];
    for (const sid of acts) {
      const group = segs.filter((s) => s.story === sid);
      if (group[0].act !== act) {
        act = group[0].act;
        row(y, 40, act, '#cdb88a', 20);
        y += rowH;
      }
      for (const s of group) {
        const shown = s.counted.filter((id) => !isHidden(id) || seen(id));
        const done = shown.filter(seen).length;
        const full = shown.length > 0 && done === shown.length;
        const isOpen = open === s.seg;
        if (isOpen) openY = y;
        const now = s.seg === o.current ? '  (지금)' : '';
        row(y, 56, `${isOpen ? '▾' : '▸'} ${s.act} · ${s.place}${now}`, isOpen ? '#ffffff' : '#d8d8d8', 19, () => {
          open = isOpen ? null : s.seg;
          draw();
        });
        row(y, 300, `${full ? '✓ ' : ''}${done} / ${shown.length}`, full ? '#e0c27a' : '#a8a8a8', 18);
        // 다시 걷기: 지나온 구간에 ???가 남았고 그 구간의 시작 스냅샷이 있을 때
        const wi = walks.findIndex((w) => w.story === s.story && w.seg === s.seg);
        if (!o.title && done < shown.length && s.seg !== o.current && wi >= 0) {
          const b = makeButton(scene, 412, y + 17, '다시 걷기', () => !asking && ask(wi), { w: 88, h: 28, fontSize: 14, depth });
          list.add(b);
        }
        y += rowH;
        if (!isOpen) continue;
        for (const id of shown) {
          if (seen(id)) row(y, 84, `${isHidden(id) ? '◆' : '·'} ${LOOKS[id]?.name ?? id}`, sel === id ? '#ffe9a8' : '#e8e8e8', 18, () => (showItem(id), draw()));
          else row(y, 84, '· ???', '#777777', 18);
          y += rowH - 4;
        }
        if (!shown.length) {
          row(y, 84, '· (이 구간에는 둘러볼 물건이 없습니다)', '#777777', 16);
          y += rowH - 4;
        }
        y += 6;
      }
      // 이야기 묶음: 줍는 것, 필수 조사 (조사한 것만)
      const storyIds = [...new Set(group.flatMap((s) => s.storyLooks))].filter(seen);
      if (storyIds.length) {
        const key = `story:${sid}`;
        const isOpen = open === key;
        row(y, 56, `${isOpen ? '▾' : '▸'} ${group[0].act} · 이야기`, '#c8b8e8', 19, () => {
          open = isOpen ? null : key;
          draw();
        });
        y += rowH;
        if (isOpen) {
          for (const id of storyIds) {
            row(y, 84, `· ${LOOKS[id]?.name.replace(/ 줍기$/, '') ?? id}`, sel === id ? '#ffe9a8' : '#e8e8e8', 18, () => (showItem(id), draw()));
            y += rowH - 4;
          }
          y += 6;
        }
      }
    }
    if (!segs.length) row(0, 56, '아직 걸어 본 이동 구간이 없습니다', '#888888', 18);
    height = y;
    return openY;
  };

  const minY = () => Math.min(top, bottom - height);
  const scroll = (dy: number) => {
    if (!asking) list.setY(Phaser.Math.Clamp(list.y - dy, minY(), top));
  };
  showItem(null);
  // 지금 구간(없으면 마지막으로 걸은 구간)을 펼쳐 맨 위에
  const openY = draw();
  list.setY(Phaser.Math.Clamp(top - openY + (open ? rowH : 0), minY(), top));

  const ask = (wi: number) => {
    const box = scene.add.graphics();
    box.fillStyle(0x14121e, 0.98);
    box.fillRoundedRect(W / 2 - 290, H / 2 - 110, 580, 220, 14);
    box.lineStyle(3, 0xcdb88a, 1);
    box.strokeRoundedRect(W / 2 - 290, H / 2 - 110, 580, 220, 14);
    const msg = scene.add
      .text(W / 2, H / 2 - 44, '이 구간의 시작으로 돌아갑니다.\n이후의 진행은 사라집니다', { fontFamily: FONT, fontSize: '22px', color: '#ffffff', align: 'center', lineSpacing: 8 })
      .setOrigin(0.5);
    const no = () => {
      asking?.destroy();
      asking = null;
    };
    const yes = makeButton(scene, W / 2 - 110, H / 2 + 56, '돌아가기 (Enter)', () => go(wi), { w: 190, h: 46, fontSize: 19, depth });
    const cancel = makeButton(scene, W / 2 + 110, H / 2 + 56, '취소 (Esc)', no, { w: 190, h: 46, fontSize: 19, depth });
    const blocker = scene.add.rectangle(0, 0, W, H, 0x000000, 0.45).setOrigin(0).setInteractive();
    asking = scene.add.container(0, 0, [blocker, box, msg, yes, cancel]);
    asking.setData('wi', wi);
    root.add(asking);
  };
  const go = (wi: number) => {
    const w = walks[wi];
    close();
    if (w) o.onRewalk?.(w, wi);
  };
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    scene.input.keyboard?.off('keydown', onKey);
    root.destroy();
    maskShape.destroy();
    o.onClose();
  };
  const onKey = (ev: KeyboardEvent) => {
    if (asking) {
      if (ev.key === 'Escape') {
        asking.destroy();
        asking = null;
      } else if (ev.key === 'Enter') go(asking.getData('wi') as number);
      return;
    }
    if (ev.key === 'Escape' || ev.key.toLowerCase() === 'j') close();
    else if (ev.key === 'ArrowUp') scroll(-60);
    else if (ev.key === 'ArrowDown') scroll(60);
  };
  // 연 키(J)가 바로 닫지 않도록 다음 틱부터
  window.setTimeout(() => !closed && scene.input.keyboard?.on('keydown', onKey), 0);
  return { root, scroll, close };
}
