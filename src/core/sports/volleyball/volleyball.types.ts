export type VolleyballSkillId =
  | 'serve'
  | 'receive'
  | 'set'
  | 'attack'
  | 'block'
  | 'dig'
  | 'free_ball'
  | 'other';

export type VolleyballZone = 1 | 2 | 3 | 4 | 5 | 6;

export type VolleyballEvaluation = -1 | 0 | 1;

export interface SkillOption {
  id: VolleyballSkillId;
  i18nKey: string;
  order: number;
}

export interface ZoneOption {
  id: VolleyballZone;
  i18nKey: string;
  gridRow: number;
  gridCol: number;
  order: number;
}

export interface ResultOption {
  id: string;
  value: VolleyballEvaluation;
  label: string;
}
