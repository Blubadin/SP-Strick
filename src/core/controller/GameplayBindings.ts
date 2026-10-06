import type { ControllerIntent, RadialCategory } from './ControllerIntent';
import type { SemanticControl } from './ControllerTypes';
import { ALL_SEMANTIC_CONTROLS } from './ButtonStateMachine';

export type GameplayAction =
  | RadialCategory
  | 'SELECT_TEAM_A'
  | 'SELECT_TEAM_B'
  | 'QUICK_RESULT_POSITIVE'
  | 'QUICK_RESULT_NEUTRAL'
  | 'QUICK_RESULT_NEGATIVE'
  | 'UNDO_LAST_EVENT'
  | 'CLEAR_CURRENT_ACTION'
  | 'TOGGLE_VIDEO_PLAYBACK'
  | 'PAUSE_SESSION'
  | 'EDIT_LAST_EVENT'
  | 'BOOKMARK_MOMENT';

export type GameplayBindings = Record<SemanticControl, GameplayAction>;

export const DEFAULT_GAMEPLAY_BINDINGS: GameplayBindings = Object.freeze({
  FACE_SOUTH: 'SKILL',
  FACE_WEST: 'ZONE',
  FACE_EAST: 'RESULT',
  FACE_NORTH: 'TEAM',
  LEFT_TRIGGER: 'PLAYER',
  LEFT_BUMPER: 'SELECT_TEAM_A',
  RIGHT_BUMPER: 'SELECT_TEAM_B',
  DPAD_UP: 'QUICK_RESULT_POSITIVE',
  DPAD_RIGHT: 'QUICK_RESULT_NEUTRAL',
  DPAD_DOWN: 'QUICK_RESULT_NEGATIVE',
  DPAD_LEFT: 'UNDO_LAST_EVENT',
  RIGHT_TRIGGER: 'QUICK_RESULT_NEUTRAL',
  VIEW: 'TOGGLE_VIDEO_PLAYBACK',
  MENU: 'PAUSE_SESSION',
  LEFT_STICK_BUTTON: 'EDIT_LAST_EVENT',
  RIGHT_STICK_BUTTON: 'BOOKMARK_MOMENT'
});

export const GAMEPLAY_ACTIONS: readonly GameplayAction[] = Object.freeze([
  'SKILL',
  'ZONE',
  'RESULT',
  'TEAM',
  'PLAYER',
  'SELECT_TEAM_A',
  'SELECT_TEAM_B',
  'QUICK_RESULT_POSITIVE',
  'QUICK_RESULT_NEUTRAL',
  'QUICK_RESULT_NEGATIVE',
  'UNDO_LAST_EVENT',
  'CLEAR_CURRENT_ACTION',
  'TOGGLE_VIDEO_PLAYBACK',
  'PAUSE_SESSION',
  'EDIT_LAST_EVENT',
  'BOOKMARK_MOMENT'
]);

export const GAMEPLAY_ACTION_LABELS: Record<GameplayAction, string> = {
  SKILL: 'Skill wheel',
  ZONE: 'Position selector',
  RESULT: 'Result wheel',
  TEAM: 'Team wheel',
  PLAYER: 'Player wheel',
  SELECT_TEAM_A: 'Select Team A',
  SELECT_TEAM_B: 'Select Team B',
  QUICK_RESULT_POSITIVE: '+1',
  QUICK_RESULT_NEUTRAL: 'Pass',
  QUICK_RESULT_NEGATIVE: '−1',
  UNDO_LAST_EVENT: 'Undo',
  CLEAR_CURRENT_ACTION: 'Clear current action',
  TOGGLE_VIDEO_PLAYBACK: 'Play / pause video',
  PAUSE_SESSION: 'Pause session',
  EDIT_LAST_EVENT: 'Edit last event',
  BOOKMARK_MOMENT: 'Bookmark'
};

export function migrateGameplayBindings(raw: unknown): GameplayBindings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_GAMEPLAY_BINDINGS };
  }
  const source = raw as Record<string, unknown>;
  const migrated: GameplayBindings = { ...DEFAULT_GAMEPLAY_BINDINGS };

  const hasUnknownAction = ALL_SEMANTIC_CONTROLS.some((control) => {
    const action = source[control];
    if (action === undefined) return false;
    if (action === 'TEAM_PLAYER') return false;
    return typeof action !== 'string' || !(GAMEPLAY_ACTIONS as readonly string[]).includes(action);
  });

  if (hasUnknownAction) {
    return { ...DEFAULT_GAMEPLAY_BINDINGS };
  }

  for (const control of ALL_SEMANTIC_CONTROLS) {
    let action = source[control];
    // Legacy migration: TEAM_PLAYER -> TEAM
    if (action === 'TEAM_PLAYER') {
      action = 'TEAM';
    }
    // If LEFT_TRIGGER was old default CLEAR_CURRENT_ACTION, migrate to PLAYER
    if (control === 'LEFT_TRIGGER' && action === 'CLEAR_CURRENT_ACTION') {
      action = 'PLAYER';
    }

    if (typeof action === 'string' && (GAMEPLAY_ACTIONS as readonly string[]).includes(action)) {
      migrated[control] = action as GameplayAction;
    }
  }

  return migrated;
}

export function validateGameplayBindings(value: unknown): value is GameplayBindings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const bindings = value as Record<string, unknown>;
  return (
    Object.keys(bindings).length === ALL_SEMANTIC_CONTROLS.length &&
    ALL_SEMANTIC_CONTROLS.every(control =>
      (GAMEPLAY_ACTIONS as readonly string[]).includes(bindings[control] as string)
    )
  );
}

export function gameplayActionIntent(action: GameplayAction): ControllerIntent {
  if (
    action === 'SKILL' ||
    action === 'ZONE' ||
    action === 'RESULT' ||
    action === 'TEAM' ||
    action === 'PLAYER'
  ) {
    return { type: 'OPEN_RADIAL', category: action };
  }
  return { type: action };
}
