import { describe, expect, it } from 'vitest';
import type { ControllerIntent } from '../../core/controller/ControllerIntent';
import {
  canCommitRadialSelection,
  getContextAfterDisconnect,
  routeLiveScoutIntent,
  type LiveScoutInteractionContext
} from './LiveScoutInput';

describe('LiveScout interaction context routing', () => {
  it('turns pause-menu direction inputs into navigation instead of scouting mutations', () => {
    expect(routeLiveScoutIntent('PAUSE_MENU', { type: 'QUICK_RESULT_POSITIVE' })).toBe('PAUSE_NAVIGATE_UP');
    expect(routeLiveScoutIntent('PAUSE_MENU', { type: 'QUICK_RESULT_NEGATIVE' })).toBe('PAUSE_NAVIGATE_DOWN');
    expect(routeLiveScoutIntent('PAUSE_MENU', { type: 'OPEN_RADIAL', category: 'SKILL' })).toBe('PAUSE_SELECT');
    expect(routeLiveScoutIntent('PAUSE_MENU', { type: 'OPEN_RADIAL', category: 'RESULT' })).toBe('PAUSE_BACK');
    expect(routeLiveScoutIntent('PAUSE_MENU', { type: 'SELECT_TEAM_A' })).toBe('IGNORE');
    expect(routeLiveScoutIntent('PAUSE_MENU', { type: 'UNDO_LAST_EVENT' })).toBe('IGNORE');
    expect(routeLiveScoutIntent('PAUSE_MENU', { type: 'BOOKMARK_MOMENT' })).toBe('IGNORE');
    expect(routeLiveScoutIntent('PAUSE_MENU', { type: 'QUICK_RESULT_POSITIVE' })).not.toMatch(/^SCOUT_/);
  });

  it('keeps quick-edit navigation away from the live event builder', () => {
    expect(routeLiveScoutIntent('QUICK_EDIT', { type: 'QUICK_RESULT_NEGATIVE' }))
      .toBe('QUICK_EDIT_NAVIGATE_DOWN');
    expect(routeLiveScoutIntent('QUICK_EDIT', { type: 'SELECT_TEAM_A' })).toBe('IGNORE');
    expect(routeLiveScoutIntent('QUICK_EDIT', { type: 'UNDO_LAST_EVENT' })).toBe('IGNORE');
    expect(routeLiveScoutIntent('QUICK_EDIT', { type: 'BOOKMARK_MOMENT' })).toBe('IGNORE');
    expect(routeLiveScoutIntent('QUICK_EDIT_RADIAL', { type: 'QUICK_RESULT_POSITIVE' })).toBe('IGNORE');
    expect(canCommitRadialSelection('QUICK_EDIT_RADIAL', true)).toBe(true);
  });

  it('cancels radial commit eligibility on disconnect', () => {
    const context: LiveScoutInteractionContext = 'RADIAL';
    const disconnected = getContextAfterDisconnect(context);

    expect(disconnected).toBe('DISCONNECTED');
    expect(canCommitRadialSelection(disconnected, true)).toBe(false);
    expect(canCommitRadialSelection('RADIAL', false)).toBe(false);
    expect(routeLiveScoutIntent(disconnected, { type: 'OPEN_RADIAL', category: 'SKILL' })).toBe('IGNORE');
  });

  it('routes L3 and Menu intents to their live and pause actions', () => {
    const editIntent: ControllerIntent = { type: 'EDIT_LAST_EVENT' };
    const menuIntent: ControllerIntent = { type: 'PAUSE_SESSION' };

    expect(routeLiveScoutIntent('LIVE_SCOUT', editIntent)).toBe('OPEN_QUICK_EDIT');
    expect(routeLiveScoutIntent('LIVE_SCOUT', menuIntent)).toBe('OPEN_PAUSE_MENU');
    expect(routeLiveScoutIntent('PAUSE_MENU', menuIntent)).toBe('RESUME_PAUSE_MENU');
    expect(routeLiveScoutIntent('QUICK_EDIT', menuIntent)).toBe('QUICK_EDIT_CANCEL');
  });
});
