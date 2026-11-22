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

interface BaseNode {
  id?: string;
}

export interface LineNode extends BaseNode, Effects {
  speaker?: string;
  expression?: Expression;
  position?: Side;
  text: string;
  next?: string;
}

export interface ChoiceOption extends Effects {
  text: string;
  next?: string;
  condition?: Condition;
}

export interface ChoiceNode extends BaseNode {
  choices: ChoiceOption[];
}

export interface BranchNode extends BaseNode {
  branch: { if: Condition; next: string }[];
  else?: string;
}

export interface EndNode extends BaseNode, Effects {
  end: true;
}

export interface EndingNode extends BaseNode, Effects {
  ending: string;
}

export interface ChapterNode extends BaseNode, Effects {
  chapter: string;
}

export interface GotoNode extends BaseNode {
  goto: string;
}

export type DialogueNode =
  | LineNode
  | ChoiceNode
  | BranchNode
  | EndNode
  | EndingNode
  | ChapterNode
  | GotoNode;

export interface DialogueData {
  id: string;
  title?: string;
  nodes: DialogueNode[];
}

export interface TitleCardDef {
  type?: 'dead' | 'bad' | 'true' | 'hidden';
  title: string;
  subtitle?: string;
  text?: string;
}
