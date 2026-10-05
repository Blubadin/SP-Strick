import type { ControllerIntent, RadialCategory } from './ControllerIntent';
import type { SemanticControl } from './ControllerTypes';
import { ALL_SEMANTIC_CONTROLS } from './ButtonStateMachine';

export type GameplayAction = RadialCategory | Exclude<ControllerIntent['type'],
  'OPEN_RADIAL' | 'RADIAL_SELECTION_CHANGED' | 'RADIAL_COMMIT' | 'RADIAL_CANCEL' | 'VIDEO_CONTROL_ENTER' | 'VIDEO_CONTROL_EXIT' | 'VIDEO_CONTROL_SEEK' | 'VIDEO_CONTROL_TOGGLE' | 'VIDEO_CONTROL_CYCLE_RATE' | 'TOGGLE_FOCUS_MODE' | 'VIDEO_ANALOG_SEEK' | 'VIDEO_SEEK_STARTED' | 'VIDEO_SEEK_ENDED'>;
export type GameplayBindings = Record<SemanticControl, GameplayAction>;

export const DEFAULT_GAMEPLAY_BINDINGS: GameplayBindings = Object.freeze({
  FACE_SOUTH: 'SKILL', FACE_WEST: 'ZONE', FACE_EAST: 'RESULT', FACE_NORTH: 'TEAM_PLAYER',
  LEFT_BUMPER: 'SELECT_TEAM_A', RIGHT_BUMPER: 'SELECT_TEAM_B',
  DPAD_UP: 'QUICK_RESULT_POSITIVE', DPAD_RIGHT: 'QUICK_RESULT_NEUTRAL',
  DPAD_DOWN: 'QUICK_RESULT_NEGATIVE', DPAD_LEFT: 'UNDO_LAST_EVENT',
  LEFT_TRIGGER: 'CLEAR_CURRENT_ACTION', RIGHT_TRIGGER: 'QUICK_RESULT_NEUTRAL',
  VIEW: 'TOGGLE_VIDEO_PLAYBACK', MENU: 'PAUSE_SESSION',
  LEFT_STICK_BUTTON: 'EDIT_LAST_EVENT', RIGHT_STICK_BUTTON: 'BOOKMARK_MOMENT'
});

export const GAMEPLAY_ACTIONS = [...new Set(Object.values(DEFAULT_GAMEPLAY_BINDINGS))];
export const GAMEPLAY_ACTION_LABELS: Record<GameplayAction, string> = {
  SKILL: 'Skill wheel', ZONE: 'Zone wheel', RESULT: 'Result wheel', TEAM_PLAYER: 'Team / player wheel',
  SELECT_TEAM_A: 'Select Team A', SELECT_TEAM_B: 'Select Team B',
  QUICK_RESULT_POSITIVE: '+1', QUICK_RESULT_NEUTRAL: 'Pass', QUICK_RESULT_NEGATIVE: '−1',
  UNDO_LAST_EVENT: 'Undo', CLEAR_CURRENT_ACTION: 'Clear current action',
  TOGGLE_VIDEO_PLAYBACK: 'Play / pause video', PAUSE_SESSION: 'Pause session',
  EDIT_LAST_EVENT: 'Edit last event', BOOKMARK_MOMENT: 'Bookmark'
};

export function validateGameplayBindings(value: unknown): value is GameplayBindings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const bindings = value as Record<string, unknown>;
  return Object.keys(bindings).length === ALL_SEMANTIC_CONTROLS.length &&
    ALL_SEMANTIC_CONTROLS.every(control => GAMEPLAY_ACTIONS.includes(bindings[control] as GameplayAction));
}

export function gameplayActionIntent(action: GameplayAction): ControllerIntent {
  if (action === 'SKILL' || action === 'ZONE' || action === 'RESULT' || action === 'TEAM_PLAYER') {
    return { type: 'OPEN_RADIAL', category: action };
  }
  return { type: action };
}
