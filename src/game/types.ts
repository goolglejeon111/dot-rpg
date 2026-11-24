export type Expression = 'normal' | 'smile' | 'angry' | 'sad' | 'surprised';
export type Side = 'left' | 'right';
export type FlagValue = boolean | number | string;

export interface CharacterDef {
  id: string;
  name: string;
  expressions: Expression[];
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

/** 대사. speaker(인물 ID)가 있으면 스탠딩을 보여 주고, name만 있으면 이름표만 */
export interface LineNode extends Effects {
  speaker?: string;
  name?: string;
  expression?: Expression;
  /** 생략하면 레온은 왼쪽, 나머지는 오른쪽 */
  position?: Side;
  text: string;
}

/** 독백 덩어리(한 화면). 줄은 누를 때마다 하나씩 나타난다 */
export interface MonologueNode {
  monologue: string[];
}

export interface ChoiceOption extends Effects {
  text: string;
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
