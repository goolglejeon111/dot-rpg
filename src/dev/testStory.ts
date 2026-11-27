import type { StoryData } from '../game/types';

/**
 * 개발용 시험 이야기 (실제 대본에는 없음). 타이틀의 "개발 시험" 메뉴에서만 열린다 (npm run dev 일 때).
 * 갈래 전투(battles.json의 test_branch) 결과에 따라 다른 장면이나 엔딩으로 간다.
 */
const line = (text: string) => ({ name: '시험', text });

export const TEST_STORY: StoryData = {
  id: 'dev_test',
  title: '시험: 갈래 전투',
  endings: {
    test_dead: { type: 'dead', label: 'DEAD END', title: '시험장의 전멸', hint: '시험 전투에서 파티가 모두 쓰러진다면.', exp: 50, epilogue: '시험용 후일담입니다. 보상 받기 화면이 제대로 나오는지 확인합니다.' },
  },
  chapters: { end: { title: '시험 끝', finished: '갈래 전투 시험' } },
  scenes: [
    {
      id: 'test_intro',
      title: '갈래 전투 시험',
      place: '시험장',
      color: '#101820',
      nodes: [
        line('갈래 전투 시험입니다. 결과에 따라 다른 장면으로 갑니다.'),
        line('이기기 → 승리 장면 / 브람이 쓰러짐 → 다른 장면 / 60초가 지남 → 시간 끝 장면 / 파티 전멸 → 데드엔딩'),
        line('전투 중 F6 적 전멸, F7 브람 쓰러뜨리기, F8 시간 끝, F9 파티 전멸로 바로 시험할 수 있습니다.'),
        { battle: 'test_branch' },
        line('(이 줄이 보이면 잘못된 것입니다)'),
      ],
    },
    { id: 'test_win', title: '결과: 승리', place: '시험장', color: '#102018', branch: true, nodes: [line('결과: 적을 모두 쓰러뜨렸습니다.'), { chapter: 'end' }] },
    { id: 'test_fall', title: '결과: 브람 쓰러짐', place: '시험장', color: '#201810', branch: true, nodes: [line('결과: 브람이 쓰러졌습니다. 이 결과로 다른 장면이 이어집니다.'), { chapter: 'end' }] },
    { id: 'test_timeout', title: '결과: 시간 끝', place: '시험장', color: '#181020', branch: true, nodes: [line('결과: 제한 시간이 지났습니다.'), { chapter: 'end' }] },
  ],
};

/**
 * 5막 준비 시험 (실제 대본·데이터·맵은 만들지 않음, docs/claude_code/점검_피드백.md 6절).
 * 1) noJump 구간: 빈민가 골목에서 점프하면 안내 글, 근처 엑스트라가 돌아봄
 * 2) kit: 아드리안 기술 묶음을 adrian_blade로 (지금은 같은 기술을 복사해 둠)
 * 3) blocker: 공격하지 않고 쓰러지지 않는 적 + 보통 적 하나 (보통 적만 쓰러뜨리면 이김, 막는 적은 경험치 없음)
 */
export const TEST_ACT5: StoryData = {
  id: 'dev_act5',
  title: '시험: 5막 준비',
  endings: {},
  chapters: { end: { title: '시험 끝', finished: '5막 준비 시험' } },
  scenes: [
    {
      id: 'act5_prep',
      title: '5막 준비 시험',
      place: '시험장',
      color: '#101820',
      nodes: [
        line('5막 준비 시험입니다. 골목에서 점프해 보세요 (안내 글, 행인이 돌아봄).'),
        { kit: { adrian: 'adrian_blade' } },
        { explore: 'dev_pilgrim' },
        line('다음 전투: 방패병은 공격하지 않고 쓰러지지 않습니다. 창병만 쓰러뜨리면 이깁니다.'),
        { battle: 'dev_blocker' },
        line('끝. 방패병에게서는 경험치가 오르지 않았어야 합니다.'),
        { chapter: 'end' },
      ],
    },
  ],
};

/** 시험용 구간·전투·적 (개발 중에만 데이터에 더함) */
export function addAct5Test(stage: { segments: Record<string, unknown> }, battles: Record<string, unknown>, enemies: Record<string, unknown>) {
  stage.segments.dev_pilgrim ??= { map: 'slum_alley', looks: [], goal: 'goal_exit', hint: '점프해 보기 (순례자 시험)', place: '시험: 순례자 길', noJump: '순례자는 뛰지 않는다' };
  enemies.dev_blocker ??= { name: '막는 방패병 (시험)', sprite: 'pursuit_shield', hp: 195, atk: 0, def: 9, speed: 0, ai: 'rusher', faint: true, blocker: true };
  battles.dev_blocker ??= {
    title: '막는 적 시험',
    arena: { w: 448, h: 288, floor: 'grass', tint: '#ffffff', map: 'slum_alley' },
    party: 'current',
    waves: [[{ enemy: 'dev_blocker', x: 300, y: 140 }, { enemy: 'dev_blocker', x: 300, y: 180 }, { enemy: 'imperial_spear', x: 380, y: 160 }]],
  };
}
