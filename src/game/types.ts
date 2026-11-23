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

/** 나중에 전투가 들어갈 자리 (지금은 건너뜀) */
export interface BattleNode {
  battle: string;
  note?: string;
}

/** 장면 도중 장소 이름 바꾸기 */
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
