import expTable from '../data/exp.json';
import { stories } from '../game/data';
import { gameState } from '../game/GameState';
import { leaveParty } from './progress';

/**
 * 이야기 중간에서 시작할 때(개발 시험 메뉴·건너뛰기) 진행 기록을 그 자리의 이야기에 맞춘다 (docs/claude_code/점검_피드백.md 1절)
 * - 파티: 그 자리보다 앞에서 대본의 join/guest로 들어온 인물만 (나중에 들어올 동료는 뺌)
 * - 최대 레벨: 그 막의 최대치 (뒤 막을 깬 기록이 있어도 그 막 기준으로 자름. 경험치는 그대로 두므로 뒤로 가면 다시 반영)
 * 새 게임부터 차례로 진행하면 이미 이 상태와 같아서 바뀌는 것이 없다
 */
const ORDER = ['prologue', 'act1', 'act2', 'act3', 'act4', 'act5', 'final'];

/** story의 scene·node 자리보다 앞에서 파티에 들어온 인물 */
function joinedBefore(storyId: string, sceneId?: string, node = 0) {
  const ids = new Set<string>(['leon']);
  const at = ORDER.indexOf(storyId);
  for (const sid of ORDER.slice(0, at + 1)) {
    const st = stories[sid];
    if (!st) continue;
    const here = sid === storyId;
    const stop = here ? (sceneId ? st.scenes.findIndex((s) => s.id === sceneId) : 0) : st.scenes.length;
    st.scenes.forEach((sc, i) => {
      if (stop >= 0 && i > stop) return;
      sc.nodes.forEach((n, j) => {
        if (here && i === stop && j >= node) return;
        if ('join' in n && n.join) ids.add(n.join);
        if ('guest' in n && n.guest) ids.add(n.guest);
      });
    });
  }
  return ids;
}

export function fitToStory(storyId: string, sceneId?: string, node?: number, partyToo = true) {
  const at = ORDER.indexOf(storyId);
  if (at < 0) return;
  const p = gameState.progress;
  // 이 막을 하는 동안의 최대 레벨 = 앞 막을 깬 구간 (프롤로그는 start)
  const stages = Object.keys(expTable.maxLevel);
  const want = at === 0 ? 'start' : ORDER[at - 1];
  if (stages.indexOf(p.stage) > stages.indexOf(want)) {
    p.stage = want;
    p.hp = {};
  }
  if (!partyToo) return;
  const ok = joinedBefore(storyId, sceneId, node ?? 0);
  for (const id of [...p.party]) if (!ok.has(id)) leaveParty(id, p);
}
