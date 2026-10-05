import type { ControllerIntent, RadialCategory } from '../../core/controller/ControllerIntent';

export type LiveScoutInteractionContext =
  | 'LIVE_SCOUT'
  | 'RADIAL'
  | 'PAUSE_MENU'
  | 'QUICK_EDIT'
  | 'QUICK_EDIT_RADIAL'
  | 'DISCONNECTED'
  | 'VIDEO_CONTROL';

export type LiveScoutIntentRoute =
  | 'IGNORE'
  | 'OPEN_PAUSE_MENU'
  | 'RESUME_PAUSE_MENU'
  | 'OPEN_QUICK_EDIT'
  | 'QUICK_EDIT_CANCEL'
  | 'PAUSE_NAVIGATE_UP'
  | 'PAUSE_NAVIGATE_DOWN'
  | 'PAUSE_SELECT'
  | 'PAUSE_BACK'
  | 'QUICK_EDIT_NAVIGATE_UP'
  | 'QUICK_EDIT_NAVIGATE_DOWN'
  | 'QUICK_EDIT_OPEN_RADIAL_SKILL'
  | 'QUICK_EDIT_OPEN_RADIAL_ZONE'
  | 'QUICK_EDIT_OPEN_RADIAL_RESULT'
  | 'QUICK_EDIT_OPEN_RADIAL_TEAM_PLAYER'
  | 'SCOUT_SELECT_TEAM_A'
  | 'SCOUT_SELECT_TEAM_B'
  | 'SCOUT_RESULT_POSITIVE'
  | 'SCOUT_RESULT_NEUTRAL'
  | 'SCOUT_RESULT_NEGATIVE'
  | 'SCOUT_UNDO'
  | 'SCOUT_BOOKMARK'
  | 'SCOUT_CLEAR_ACTION'
  | 'SCOUT_TOGGLE_VIDEO'
  | 'ENTER_VIDEO_CONTROL'
  | 'EXIT_VIDEO_CONTROL'
  | 'VIDEO_CONTROL_COMMAND'
  | 'OPEN_RADIAL_SKILL'
  | 'OPEN_RADIAL_ZONE'
  | 'OPEN_RADIAL_RESULT'
  | 'OPEN_RADIAL_TEAM_PLAYER'
  | 'TOGGLE_FOCUS_MODE';

const RADIAL_OPEN_ROUTES: Record<RadialCategory, LiveScoutIntentRoute> = {
  SKILL: 'OPEN_RADIAL_SKILL',
  ZONE: 'OPEN_RADIAL_ZONE',
  RESULT: 'OPEN_RADIAL_RESULT',
  TEAM_PLAYER: 'OPEN_RADIAL_TEAM_PLAYER'
};

const QUICK_EDIT_RADIAL_ROUTES: Record<RadialCategory, LiveScoutIntentRoute> = {
  SKILL: 'QUICK_EDIT_OPEN_RADIAL_SKILL',
  ZONE: 'QUICK_EDIT_OPEN_RADIAL_ZONE',
  RESULT: 'QUICK_EDIT_OPEN_RADIAL_RESULT',
  TEAM_PLAYER: 'QUICK_EDIT_OPEN_RADIAL_TEAM_PLAYER'
};

const VIDEO_PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export function nextVideoPlaybackRate(currentRate: number): number {
  const currentIndex = VIDEO_PLAYBACK_RATES.findIndex(rate => Math.abs(rate - currentRate) < 0.001);
  if (currentIndex >= 0) return VIDEO_PLAYBACK_RATES[(currentIndex + 1) % VIDEO_PLAYBACK_RATES.length];
  return VIDEO_PLAYBACK_RATES.find(rate => rate > currentRate) ?? VIDEO_PLAYBACK_RATES[0];
}

export function routeLiveScoutIntent(
  context: LiveScoutInteractionContext,
  intent: ControllerIntent
): LiveScoutIntentRoute {
  if (context === 'DISCONNECTED') return 'IGNORE';

  if (intent.type === 'VIDEO_CONTROL_ENTER') {
    return context === 'LIVE_SCOUT' ? 'ENTER_VIDEO_CONTROL' : 'IGNORE';
  }
  if (intent.type === 'VIDEO_CONTROL_EXIT') {
    return context === 'VIDEO_CONTROL' ? 'EXIT_VIDEO_CONTROL' : 'IGNORE';
  }
  if (context === 'VIDEO_CONTROL') {
    if (intent.type === 'TOGGLE_FOCUS_MODE') return 'TOGGLE_FOCUS_MODE';
    return intent.type === 'VIDEO_CONTROL_SEEK'
      || intent.type === 'VIDEO_CONTROL_TOGGLE'
      || intent.type === 'VIDEO_CONTROL_CYCLE_RATE'
      || intent.type === 'VIDEO_ANALOG_SEEK'
      || intent.type === 'VIDEO_SEEK_STARTED'
      || intent.type === 'VIDEO_SEEK_ENDED'
      ? 'VIDEO_CONTROL_COMMAND'
      : 'IGNORE';
  }

  if (context === 'PAUSE_MENU') {
    if (intent.type === 'PAUSE_SESSION') return 'RESUME_PAUSE_MENU';
    if (intent.type === 'QUICK_RESULT_POSITIVE') return 'PAUSE_NAVIGATE_UP';
    if (intent.type === 'QUICK_RESULT_NEGATIVE') return 'PAUSE_NAVIGATE_DOWN';
    if (intent.type === 'OPEN_RADIAL' && intent.category === 'SKILL') return 'PAUSE_SELECT';
    if (intent.type === 'OPEN_RADIAL' && intent.category === 'RESULT') return 'PAUSE_BACK';
    return 'IGNORE';
  }

  if (context === 'RADIAL') {
    if (intent.type === 'PAUSE_SESSION') return 'OPEN_PAUSE_MENU';
    if (intent.type === 'BOOKMARK_MOMENT') return 'SCOUT_BOOKMARK';
    if (intent.type === 'OPEN_RADIAL') return RADIAL_OPEN_ROUTES[intent.category];
    return 'IGNORE';
  }

  if (context === 'QUICK_EDIT_RADIAL') {
    if (intent.type === 'PAUSE_SESSION') return 'QUICK_EDIT_CANCEL';
    if (intent.type === 'OPEN_RADIAL') return QUICK_EDIT_RADIAL_ROUTES[intent.category];
    return 'IGNORE';
  }

  if (context === 'QUICK_EDIT') {
    if (intent.type === 'PAUSE_SESSION') return 'QUICK_EDIT_CANCEL';
    if (intent.type === 'QUICK_RESULT_POSITIVE') return 'QUICK_EDIT_NAVIGATE_UP';
    if (intent.type === 'QUICK_RESULT_NEGATIVE') return 'QUICK_EDIT_NAVIGATE_DOWN';
    if (intent.type === 'OPEN_RADIAL') return QUICK_EDIT_RADIAL_ROUTES[intent.category];
    return 'IGNORE';
  }

  switch (intent.type) {
    case 'PAUSE_SESSION': return 'OPEN_PAUSE_MENU';
    case 'EDIT_LAST_EVENT': return 'OPEN_QUICK_EDIT';
    case 'OPEN_RADIAL': return RADIAL_OPEN_ROUTES[intent.category];
    case 'SELECT_TEAM_A': return 'SCOUT_SELECT_TEAM_A';
    case 'SELECT_TEAM_B': return 'SCOUT_SELECT_TEAM_B';
    case 'QUICK_RESULT_POSITIVE': return 'SCOUT_RESULT_POSITIVE';
    case 'QUICK_RESULT_NEUTRAL': return 'SCOUT_RESULT_NEUTRAL';
    case 'QUICK_RESULT_NEGATIVE': return 'SCOUT_RESULT_NEGATIVE';
    case 'UNDO_LAST_EVENT': return 'SCOUT_UNDO';
    case 'BOOKMARK_MOMENT': return 'SCOUT_BOOKMARK';
    case 'CLEAR_CURRENT_ACTION': return 'SCOUT_CLEAR_ACTION';
    case 'TOGGLE_VIDEO_PLAYBACK': return 'SCOUT_TOGGLE_VIDEO';
    case 'TOGGLE_FOCUS_MODE': return 'TOGGLE_FOCUS_MODE';
    default: return 'IGNORE';
  }
}

export function getContextAfterDisconnect(
  _context: LiveScoutInteractionContext
): LiveScoutInteractionContext {
  return 'DISCONNECTED';
}

export function canCommitRadialSelection(
  context: LiveScoutInteractionContext,
  connected: boolean
): boolean {
  return connected && (context === 'RADIAL' || context === 'QUICK_EDIT_RADIAL');
}
