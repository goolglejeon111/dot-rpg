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
      { scene: 'scene2', before: '칼이 부딪친다.', node: { battle: '하수인들' } },
      { scene: 'scene3', before: '발을 내디딘다.', node: { battle: '침입자' } },
      // 체력 0 연출: 근위기사들이 레온을 공격해 체력바가 0이 되고 쓰러진 뒤 데드엔딩 독백으로
      { scene: 'choice_draw', before: '첫 번째 칼날이 옆구리를 갈랐다.', node: { hpZero: 'leon', by: 'mob_royal_knight', count: 4 } },
      { scene: 'choice_surrender', before: '사흘 동안 지하 감옥에 갇혀 있었다.', node: { place: '지하 감옥' } },
      { scene: 'choice_surrender', before: '광장에 끌려 나왔을 때, 첫눈은 이미 진창이 되어 있었다.', node: { place: '광장' } },
      { scene: 'choice_window', before: '떨어진다.', node: { place: '해자' } },
      { scene: 'choice_window', before: '틈으로 몸을 밀어 넣는다.', node: { place: '지하 수로' } },
    ],
    // 대본(docs)은 그대로 두고 게임에서만 바꿔 쓰는 대사. name: 대본의 이름, from: 대본 대사, to: 게임 대사
    // 레온은 동료(브람)에게 반말로 말한다
    rewrites: [
      { name: '레온', from: '오늘 밤은 너랑 같이 돌라는 명령이다.', to: '오늘 밤은 너랑 같이 돌라는 명령이야.' },
      { name: '레온', from: '…들었다.', to: '…들었어.' },
      { name: '레온', from: '네 번이다.', to: '네 번이야.' },
      {
        name: '레온',
        from: '네 번이야. 마지막 사절단엔 우리 마을 촌장님도 계셨어. 흉년에 공물까지 바치면 겨울을 못 넘긴다고. 황궁 문 앞에서 열흘을 기다리다가 그냥 돌아가셨다.',
        to: '네 번이라고. 마지막 사절단엔 우리 마을 촌장님도 계셨어. 흉년에 공물까지 바치면 겨울을 못 넘긴다고. 황궁 문 앞에서 열흘을 기다리다가 그냥 돌아가셨어.',
      },
      { name: '레온', from: '내가 맹세한 건 폐하가 아니라 근위기사의 검이야. 그 맹세는 지킨다.', to: '내가 맹세한 건 폐하가 아니라 근위기사의 검이야. 그 맹세는 지킬 거야.' },
      { name: '레온', from: '브람, 저놈이 우두머리야. 침소로 간다!', to: '브람, 저놈이 우두머리야. 침소로 가자!' },
      { name: '레온', from: '…미안하다, 브람. 지금은 잡혀 줄 수 없어.', to: '…미안해, 브람. 지금은 잡혀 줄 수 없어.' },
    ],
    // 엔딩 목록에서 쓰는 것: hint(못 본 엔딩의 힌트 한 줄), exp(보상 경험치. 트루·히든은 0),
    // epilogue(짧은 후일담, 없으면 빈칸), illust(일러스트 파일. 없으면 임시 화면)
    endingExtras: {
      prologue_dead: { hint: '침소 앞에서, 칼끝들을 향해 검을 뽑는다면.', exp: 80, epilogue: '' },
      prologue_bad: { hint: '침소 앞에서, 조사를 믿고 검을 내려놓는다면.', exp: 80, epilogue: '' },
    },
    next: { id: 'act1', title: '1막으로 이어집니다' },
  },
];
