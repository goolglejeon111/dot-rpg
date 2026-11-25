export type Expression = 'normal' | 'smile' | 'angry' | 'sad' | 'surprised';
export type Side = 'left' | 'right';
export type FlagValue = boolean | number | string;

export interface CharacterDef {
  id: string;
  name: string;
  expressions: Expression[];
  /** 컷인 눈매: 스탠딩 그림({id}_body.png)에서 두 눈 사이 가운데 좌표(픽셀)와 띠 안에서 키울 배율. 없으면 컷인 생략 */
  cutin?: { x: number; y: number; scale: number };
  /** false면 스탠딩 그림이 없을 때 회색 실루엣 없이 이름표만 */
  silhouette?: boolean;
}

export interface Condition {
  affection?: string;
  flag?: string;
  op?: '>=' | '<=' | '>' | '<' | '==' | '!=';
  value?: FlagValue;
  all?: Condition[];
  any?: Condition[];
}

/** 호감도 변화와 플래그 설정 */
export interface Effects {
  affection?: Record<string, number>;
  flags?: Record<string, FlagValue>;
}

/** 강조 문장: big = 화면 가운데에 크게, slow = 한 글자씩 느리게(다 나온 뒤 잠깐 머묾), shake = 나타날 때 글자와 화면이 흔들림 */
export type Emphasis = 'big' | 'slow' | 'shake';
/** 강조 하나 또는 여러 개를 겹쳐서 */
export type EmphasisStyle = Emphasis | Emphasis[];

/** 대사. speaker(인물 ID)가 있으면 스탠딩을 보여 주고, name만 있으면 이름표만 */
export interface LineNode extends Effects {
  speaker?: string;
  name?: string;
  expression?: Expression;
  /** 생략하면 레온은 왼쪽, 나머지는 오른쪽 */
  position?: Side;
  text: string;
  emphasis?: EmphasisStyle;
}

/** 독백 덩어리(한 화면). 줄은 누를 때마다 하나씩 나타난다 */
export interface MonologueNode {
  monologue: string[];
  /** 줄 번호(0부터) → 강조 */
  emphasis?: Record<string, EmphasisStyle>;
}

/** 컷인: 화면 가운데를 가로지르는 띠에 인물의 눈매 (0.8초). caption = 띠 아래 끝 글, tint gold = 붉은 금빛 눈매와 번쩍임 */
export interface CutinNode {
  cutin: string;
  caption?: string;
  tint?: 'gold';
}

/** 이벤트 CG: 대사창 뒤 화면 전체 그림 (null이면 닫기). 장면이 바뀌면 저절로 닫힌다 */
export interface CgNode {
  cg: string | null;
}

/** 레온의 상처 반응: flicker = 희미하게 한 번, flare = 크게 맥박, sense = 계속 맥박(장면이 바뀌거나 off까지) */
export interface WoundNode {
  wound: 'flicker' | 'flare' | 'sense' | 'off';
}

export interface ChoiceOption extends Effects {
  text: string;
  /** 고르면 파티 전원이 받는 경험치 (처음 한 번) */
  exp?: number;
  /** 이동할 장면 ID */
  next?: string;
  condition?: Condition;
}

export interface ChoiceNode {
  choices: ChoiceOption[];
}

/** 전투. battle = src/data/battle/battles.json의 전투 이름 */
export interface BattleNode {
  battle: string;
  note?: string;
}

/** 이동 구간: 레온을 움직여 맵을 지나간다 (물건 살펴보기, 경험치). explore = src/data/explore/stage.json의 segments 이름 */
export interface ExploreNode {
  explore: string;
}

/**
 * 체력 0 연출: 대사창을 닫고 who가 공격을 맞아 체력바가 0까지 떨어지며 쓰러진다 (조작 없음).
 * 기절·게임 오버 규칙을 따르지 않는다. 끝나면 다음 대사로
 */
export interface HpZeroNode {
  hpZero: string;
  /** 공격하는 쪽 (전투 동작 그림이 있는 인물 ID) */
  by?: string;
  /** 공격하는 수 */
  count?: number;
}

/** 맵 위 무대 바꾸기 (인물 위치, 카메라, 피 웅덩이). stage = src/data/explore/stage.json의 stages 이름 */
export interface StageNode {
  stage: string;
}

/** 장면 도중 장소 이름 바꾸기 (stage.json의 places에 있으면 맵도 바뀐다) */
export interface PlaceNode {
  place: string;
}

/** 조작 해금 (회피, 스킬, 궁극기, 합동 기술). 화면 가운데 알림 뒤 다음으로 */
export interface UnlockNode {
  unlock: 'evade' | 'skill' | 'ult' | 'combo';
}

/** 파티 합류 (임시 동료였으면 정식 파티원으로) */
export interface JoinNode {
  join: string;
}

/** 임시 동료로 파티에 넣기 (경험치를 받지 않고 레벨 고정, 초상화에 "임시") */
export interface GuestNode {
  guest: string;
}

/** 도트 겉모습 바꾸기 (필드·전투). costume = 그림 이름 (예: leon_hood). who 없으면 레온 */
export interface CostumeNode {
  costume: string;
  who?: string;
}

/** 화면 가운데 아이템 그림 확대 (null이면 닫기) */
export interface ItemNode {
  item: string | null;
}

export interface EndingNode extends Effects {
  ending: string;
}

export interface ChapterNode extends Effects {
  chapter: string;
}

export type StoryNode =
  | LineNode
  | MonologueNode
  | ChoiceNode
  | BattleNode
  | ExploreNode
  | StageNode
  | HpZeroNode
  | PlaceNode
  | UnlockNode
  | JoinNode
  | GuestNode
  | CostumeNode
  | ItemNode
  | CutinNode
  | CgNode
  | WoundNode
  | EndingNode
  | ChapterNode;

export interface StorySceneData {
  id: string;
  title: string;
  /** 임시 장소 이름 (배경 그림 대신) */
  place: string;
  /** 임시 배경색 */
  color: string;
  /** 선택지로만 들어오는 장면 (앞 장면에서 이어서 들어오지 않음) */
  branch?: boolean;
  /** 장면에 들어갈 때 적용하는 효과 (전투 결과로 들어가는 장면 등, 선택지가 아닌 길로 들어오는 장면) */
  effects?: Effects;
  nodes: StoryNode[];
}

export interface EndingDef {
  type: 'dead' | 'bad' | 'true' | 'hidden';
  /** DEAD END, BAD END 등 */
  label: string;
  title: string;
  /** 못 본 엔딩에 보이는 힌트 한 줄 */
  hint?: string;
  /** 보상 경험치 (트루·히든엔딩은 없음) */
  exp?: number;
  /** 짧은 후일담 (없으면 빈칸) */
  epilogue?: string;
  /** 엔딩 일러스트 파일 (없으면 임시 화면) */
  illust?: string;
}

export interface ChapterDef {
  title: string;
  finished?: string;
}

export interface StoryData {
  id: string;
  title: string;
  source?: string;
  endings: Record<string, EndingDef>;
  chapters: Record<string, ChapterDef>;
  scenes: StorySceneData[];
}
