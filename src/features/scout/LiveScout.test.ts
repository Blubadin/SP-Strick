import { describe, expect, it } from 'vitest';
import type { ControllerIntent } from '../../core/controller/ControllerIntent';
import {
  canCommitRadialSelection,
  getContextAfterDisconnect,
  routeLiveScoutIntent,
  nextVideoPlaybackRate,
  type LiveScoutInteractionContext
} from './LiveScoutInput';

describe('LiveScout interaction context routing', () => {
  it('routes draft clearing and video playback only in live context', () => {
    expect(routeLiveScoutIntent('LIVE_SCOUT', {type:'CLEAR_CURRENT_ACTION'})).toBe('SCOUT_CLEAR_ACTION');
    expect(routeLiveScoutIntent('LIVE_SCOUT', {type:'TOGGLE_VIDEO_PLAYBACK'})).toBe('SCOUT_TOGGLE_VIDEO');
    for (const context of ['PAUSE_MENU','QUICK_EDIT','QUICK_EDIT_RADIAL','RADIAL','DISCONNECTED'] as LiveScoutInteractionContext[]) {
      expect(routeLiveScoutIntent(context, {type:'CLEAR_CURRENT_ACTION'})).toBe('IGNORE');
      expect(routeLiveScoutIntent(context, {type:'TOGGLE_VIDEO_PLAYBACK'})).toBe('IGNORE');
    }
  });
  it('keeps video modifier actions isolated from scouting and modal contexts', () => {
    const enter = { type: 'VIDEO_CONTROL_ENTER' } as ControllerIntent;
    const exit = { type: 'VIDEO_CONTROL_EXIT' } as ControllerIntent;
    const seek = { type: 'VIDEO_CONTROL_SEEK', deltaMs: -3000 } as ControllerIntent;
    const toggle = { type: 'VIDEO_CONTROL_TOGGLE' } as ControllerIntent;
    const cycleRate = { type: 'VIDEO_CONTROL_CYCLE_RATE' } as ControllerIntent;
    expect(routeLiveScoutIntent('LIVE_SCOUT', enter)).toBe('ENTER_VIDEO_CONTROL');
    expect(routeLiveScoutIntent('VIDEO_CONTROL', exit)).toBe('EXIT_VIDEO_CONTROL');
    expect(routeLiveScoutIntent('LIVE_SCOUT', { type: 'TOGGLE_VIDEO_PLAYBACK' })).toBe('SCOUT_TOGGLE_VIDEO');
    for (const intent of [seek, toggle, cycleRate]) {
      expect(routeLiveScoutIntent('VIDEO_CONTROL', intent)).toBe('VIDEO_CONTROL_COMMAND');
    }
    for (const context of ['PAUSE_MENU', 'RADIAL', 'QUICK_EDIT', 'QUICK_EDIT_RADIAL', 'DISCONNECTED'] as LiveScoutInteractionContext[]) {
      for (const intent of [enter, exit, seek, toggle, cycleRate]) {
        expect(routeLiveScoutIntent(context, intent)).toBe('IGNORE');
      }
    }
  });
  it('cycles playback rates through the supported sequence', () => {
    expect(nextVideoPlaybackRate(0.25)).toBe(0.5);
    expect(nextVideoPlaybackRate(0.5)).toBe(0.75);
    expect(nextVideoPlaybackRate(0.75)).toBe(1);
    expect(nextVideoPlaybackRate(1)).toBe(1.25);
    expect(nextVideoPlaybackRate(1.25)).toBe(1.5);
    expect(nextVideoPlaybackRate(1.5)).toBe(2);
    expect(nextVideoPlaybackRate(2)).toBe(0.25);
  });
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
