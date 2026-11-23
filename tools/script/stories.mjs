// 대본별 변환 설정. 대본(md)에 없는 정보(장면 ID, 장소 이름, 배경색, 전투 자리)는 여기서 정한다.
export const STORIES = [
  {
    id: 'prologue',
    source: 'docs/대본/프롤로그.md',
    output: 'src/data/dialogue/prologue.json',
    stopAt: '이 대본에 숨겨 둔 복선', // 이 제목부터는 메모라서 읽지 않음
    // 대본의 이름 → 인물 ID (여기 없는 이름은 스탠딩 없이 이름표만)
    names: { 레온: 'leon', 브람: 'bram', 오스발트: 'oswald', 침입자: 'marcion_hooded' },
    // match: 장면 제목의 앞부분, place: 임시 장소 이름, color: 임시 배경색, choice: 몇 번 선택지로 오는 장면인지
    scenes: [
      { match: '여는 독백', id: 'opening', place: '', color: '#08080c' },
      { match: '장면 1.', id: 'scene1', place: '황궁 회랑', color: '#141a2a' },
      { match: '장면 2.', id: 'scene2', place: '황궁 회랑', color: '#1a1424' },
      { match: '장면 3.', id: 'scene3', place: '침소로 이어지는 회랑', color: '#1c1218' },
      { match: '장면 4.', id: 'scene4', place: '황제의 침소', color: '#220e10' },
      { match: '장면 5.', id: 'scene5', place: '침소 앞', color: '#1e1014' },
      { match: '▶ 1.', id: 'choice_draw', choice: 1, place: '침소 앞', color: '#260808' },
      { match: '▶ 2.', id: 'choice_surrender', choice: 2, place: '침소 앞', color: '#16161a' },
      { match: '▶ 3.', id: 'choice_window', choice: 3, place: '침소 앞', color: '#0c1420' },
    ],
    // 대사/독백 앞에 끼워 넣을 것. before = 그 대사나 독백 덩어리의 첫 줄
    inserts: [
      { scene: 'scene2', before: '칼이 부딪친다.', node: { battle: '하수인들', note: '여기에 전투가 들어감 (지금은 건너뜀)' } },
      { scene: 'scene3', before: '발을 내디딘다.', node: { battle: '침입자', note: '여기에 전투가 들어감 (지금은 건너뜀)' } },
      { scene: 'choice_surrender', before: '사흘 동안 지하 감옥에 갇혀 있었다.', node: { place: '지하 감옥' } },
      { scene: 'choice_surrender', before: '광장에 끌려 나왔을 때, 첫눈은 이미 진창이 되어 있었다.', node: { place: '광장' } },
      { scene: 'choice_window', before: '떨어진다.', node: { place: '해자' } },
      { scene: 'choice_window', before: '틈으로 몸을 밀어 넣는다.', node: { place: '지하 수로' } },
    ],
    next: { id: 'act1', title: '1막으로 이어집니다' },
  },
];
