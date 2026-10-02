import type { ControllerIntent, RadialCategory } from '../../core/controller/ControllerIntent';

export type LiveScoutInteractionContext =
  | 'LIVE_SCOUT'
  | 'RADIAL'
  | 'PAUSE_MENU'
  | 'QUICK_EDIT'
  | 'QUICK_EDIT_RADIAL'
  | 'DISCONNECTED';

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
  | 'OPEN_RADIAL_SKILL'
  | 'OPEN_RADIAL_ZONE'
  | 'OPEN_RADIAL_RESULT'
  | 'OPEN_RADIAL_TEAM_PLAYER';

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

export function routeLiveScoutIntent(
  context: LiveScoutInteractionContext,
  intent: ControllerIntent
): LiveScoutIntentRoute {
  if (context === 'DISCONNECTED') return 'IGNORE';

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
    return 'IGNORE';
  }

  if (context === 'QUICK_EDIT_RADIAL') {
    if (intent.type === 'PAUSE_SESSION') return 'QUICK_EDIT_CANCEL';
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
