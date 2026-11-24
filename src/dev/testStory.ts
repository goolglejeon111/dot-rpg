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
