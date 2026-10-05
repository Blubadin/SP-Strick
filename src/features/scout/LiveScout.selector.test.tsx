// @vitest-environment jsdom
import { cleanup, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LiveScout } from './LiveScout';
import { useScoutStore } from '../../core/scouting/ScoutStore';
import { useControllerStore } from '../../core/controller/ControllerStore';
import { intentDispatcher } from '../../core/controller/ControllerIntent';
import { STANDARD_PROFILE } from '../../core/controller/ControllerProfile';
import '../../i18n';

vi.mock('./CourtMap', () => ({ CourtMap: () => <div data-testid="court-map" /> }));
vi.mock('./RallyHistory', () => ({ RallyHistory: () => <div data-testid="rally-history" /> }));
vi.mock('../video/ScoutVideoPanel', () => ({
  ScoutVideoPanel: () => <div data-testid="video-panel" />,
  AudioUnlockButton: () => null
}));

const initialScoutState = useScoutStore.getState();

function renderLiveScout() {
  return render(
    <MemoryRouter>
      <LiveScout />
    </MemoryRouter>
  );
}

function updateControllerSticks(left: { x: number; y: number; magnitude: number; angle: number }, right: { x: number; y: number; magnitude: number; angle: number }) {
  act(() => {
    useControllerStore.setState((prev) => ({
      state: {
        ...prev.state,
        leftStick: left,
        rightStick: right
      }
    }));
  });
}

const neutralStick = { x: 0, y: 0, magnitude: 0, angle: 0 };

beforeEach(() => {
  vi.useFakeTimers();
  useControllerStore.setState((prev) => ({
    profile: STANDARD_PROFILE,
    state: {
      ...prev.state,
      connected: true,
      leftStick: neutralStick,
      rightStick: neutralStick
    }
  }));
  useScoutStore.setState({
    ...initialScoutState,
    sessionId: 'test-session',
    sessionName: 'Test match',
    teamA: 'Thunder',
    teamB: 'Storm',
    activeTeam: 'A',
    currentEvent: {},
    allEvents: [],
    recentEvents: [],
    rallies: []
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('LiveScout Left Stick scouting selection and Right Stick isolation', () => {
  it('opens Skill on A: RS movement is ignored; LS selects and neutral commits', async () => {
    renderLiveScout();
    const surface = screen.getByTestId('live-scout-surface');

    // Tap A -> Skill selector opens
    act(() => intentDispatcher.dispatch({ type: 'OPEN_RADIAL', category: 'SKILL', control: 'FACE_SOUTH' }));
    expect(surface.getAttribute('data-wheel-open')).toBe('true');
    expect(document.querySelector('span[class*="categoryTitle"]')?.textContent).toBe('Skill');

    // Move RIGHT STICK decisively to the right (X=1, Y=0, angle=0)
    updateControllerSticks(neutralStick, { x: 1, y: 0, magnitude: 1, angle: 0 });
    // Selection should remain unselected (no preview in center hub)
    expect(document.querySelector('span[class*="selectionPreview"]')).toBeNull();

    // Now move LEFT STICK to the right (X=1, Y=0, angle=0 => Attack)
    updateControllerSticks({ x: 1, y: 0, magnitude: 1, angle: 0 }, neutralStick);
    // Attack should be highlighted/previewed in the hub
    expect(document.querySelector('span[class*="selectionPreview"]')?.textContent).toBe('Attack');

    // Return LEFT STICK to neutral
    updateControllerSticks(neutralStick, neutralStick);
    await act(async () => { vi.advanceTimersByTime(95); });

    // Selector commits and closes immediately
    expect(surface.getAttribute('data-wheel-open')).toBe('false');
    expect(useScoutStore.getState().currentEvent.skill).toBe('attack');
  });

  it('opens Area on X: RS movement is ignored; LS selects zone and neutral commits', async () => {
    renderLiveScout();
    const surface = screen.getByTestId('live-scout-surface');

    // Tap X -> Area selector opens
    act(() => intentDispatcher.dispatch({ type: 'OPEN_RADIAL', category: 'ZONE', control: 'FACE_WEST' }));
    expect(surface.getAttribute('data-wheel-open')).toBe('true');
    expect(screen.getByText('Choose court zone')).toBeTruthy();

    // Move RIGHT STICK upper-left (X=-0.8, Y=-0.8 => Zone 4 if it were active)
    updateControllerSticks(neutralStick, { x: -0.8, y: -0.8, magnitude: 1.13, angle: 225 });
    // Z4 button should NOT be pressed/selected
    const zone4Btn = screen.getByRole('button', { name: /Z4/ });
    expect(zone4Btn.getAttribute('aria-pressed')).toBe('false');

    // Move LEFT STICK upper-left (X=-0.8, Y=-0.8)
    updateControllerSticks({ x: -0.8, y: -0.8, magnitude: 1.13, angle: 225 }, neutralStick);
    expect(zone4Btn.getAttribute('aria-pressed')).toBe('true');

    // Return LEFT STICK to neutral
    updateControllerSticks(neutralStick, neutralStick);
    await act(async () => { vi.advanceTimersByTime(95); });

    // Commits Z4 and closes selector
    expect(surface.getAttribute('data-wheel-open')).toBe('false');
    expect(useScoutStore.getState().currentEvent.originZone).toBe(4);
  });

  it('opens Result on B: RS movement is ignored; LS selects and neutral commits', async () => {
    renderLiveScout();
    const surface = screen.getByTestId('live-scout-surface');

    // Tap B -> Result selector opens
    act(() => intentDispatcher.dispatch({ type: 'OPEN_RADIAL', category: 'RESULT', control: 'FACE_EAST' }));
    expect(surface.getAttribute('data-wheel-open')).toBe('true');
    expect(document.querySelector('span[class*="categoryTitle"]')?.textContent).toBe('Result');

    // RS movement ignored
    updateControllerSticks(neutralStick, { x: 1, y: 0, magnitude: 1, angle: 0 });
    expect(document.querySelector('span[class*="selectionPreview"]')).toBeNull();

    // Move LS to 0 deg (right => +1)
    updateControllerSticks({ x: 1, y: 0, magnitude: 1, angle: 0 }, neutralStick);
    expect(document.querySelector('span[class*="selectionPreview"]')?.textContent).toBe('+1');

    // Return LS to neutral
    updateControllerSticks(neutralStick, neutralStick);
    await act(async () => { vi.advanceTimersByTime(95); });

    expect(surface.getAttribute('data-wheel-open')).toBe('false');
    expect(useScoutStore.getState().currentEvent.evaluation).toBe(1);
  });

  it('opens Team/Player on Y: RS movement is ignored; LS selects and neutral commits', async () => {
    renderLiveScout();
    const surface = screen.getByTestId('live-scout-surface');

    // Tap Y -> Team/Player selector opens
    act(() => intentDispatcher.dispatch({ type: 'OPEN_RADIAL', category: 'TEAM_PLAYER', control: 'FACE_NORTH' }));
    expect(surface.getAttribute('data-wheel-open')).toBe('true');
    expect(document.querySelector('span[class*="categoryTitle"]')?.textContent).toBe('Team / Player');

    // RS movement ignored
    updateControllerSticks(neutralStick, { x: -1, y: 0, magnitude: 1, angle: 180 });
    expect(document.querySelector('span[class*="selectionPreview"]')).toBeNull();

    // Move LS to 180 deg (left => Storm / Team B)
    updateControllerSticks({ x: -1, y: 0, magnitude: 1, angle: 180 }, neutralStick);
    expect(document.querySelector('span[class*="selectionPreview"]')?.textContent).toBe('Storm');

    // Return LS to neutral
    updateControllerSticks(neutralStick, neutralStick);
    await act(async () => { vi.advanceTimersByTime(95); });

    expect(surface.getAttribute('data-wheel-open')).toBe('false');
    expect(useScoutStore.getState().activeTeam).toBe('B');
  });

  it('does NOT commit on button release: only LS returning to neutral commits', () => {
    renderLiveScout();
    const surface = screen.getByTestId('live-scout-surface');

    // Tap A
    act(() => intentDispatcher.dispatch({ type: 'OPEN_RADIAL', category: 'SKILL', control: 'FACE_SOUTH' }));
    expect(surface.getAttribute('data-wheel-open')).toBe('true');

    // Button release: nothing happens (radial remains open, no selection committed)
    act(() => {
      useControllerStore.setState((prev) => ({
        state: {
          ...prev.state,
          buttons: {
            ...prev.state.buttons,
            FACE_SOUTH: { pressed: false, touched: false, value: 0, held: false, pressedThisFrame: false, releasedThisFrame: true }
          }
        }
      }));
    });
    expect(surface.getAttribute('data-wheel-open')).toBe('true');
    expect(useScoutStore.getState().currentEvent.skill).toBeUndefined();
  });

  it('auto-cancels selector after 1000ms idle timeout if LS is not moved', () => {
    renderLiveScout();
    const surface = screen.getByTestId('live-scout-surface');

    act(() => intentDispatcher.dispatch({ type: 'OPEN_RADIAL', category: 'SKILL', control: 'FACE_SOUTH' }));
    expect(surface.getAttribute('data-wheel-open')).toBe('true');

    // Wait 999ms
    act(() => { vi.advanceTimersByTime(999); });
    expect(surface.getAttribute('data-wheel-open')).toBe('true');

    // Wait 1ms (total 1000ms)
    act(() => { vi.advanceTimersByTime(1); });
    expect(surface.getAttribute('data-wheel-open')).toBe('false');
    expect(useScoutStore.getState().currentEvent.skill).toBeUndefined();
  });

  it('prioritizes VIDEO_CONTROL: while VIEW is held, LS does not open or interact with radials', () => {
    renderLiveScout();
    const surface = screen.getByTestId('live-scout-surface');

    // Hold VIEW in LIVE_SCOUT -> enters VIDEO_CONTROL
    act(() => intentDispatcher.dispatch({ type: 'VIDEO_CONTROL_ENTER' }));
    expect(surface.getAttribute('data-wheel-open')).toBe('false');

    // While in VIDEO_CONTROL, LS movements do not open or interact with radials
    updateControllerSticks({ x: 1, y: 0, magnitude: 1, angle: 0 }, neutralStick);
    expect(surface.getAttribute('data-wheel-open')).toBe('false');
    expect(useScoutStore.getState().currentEvent.skill).toBeUndefined();
  });

  it('handles Quick Edit: opens Skill field radial with A, ignores RS, selects with LS, and neutral commits edit', async () => {
    useScoutStore.setState({
      recentEvents: [{
        id: 'ev-1',
        sport: 'volleyball',
        sessionId: 'test-session',
        matchId: 'test-session',
        setNumber: 1,
        teamId: 'A',
        skill: 'serve',
        timestamp: 1000,
        createdAt: '2026-10-05T00:00:00.000Z',
        inputSource: 'controller'
      }]
    });
    renderLiveScout();
    const surface = screen.getByTestId('live-scout-surface');

    // Press L3 -> Open Quick Edit
    act(() => intentDispatcher.dispatch({ type: 'EDIT_LAST_EVENT' }));

    // Press A on Skill field (focus is index 1 = skill)
    act(() => intentDispatcher.dispatch({ type: 'OPEN_RADIAL', category: 'SKILL', control: 'FACE_SOUTH' }));
    expect(surface.getAttribute('data-wheel-open')).toBe('true');

    // RS ignored
    updateControllerSticks(neutralStick, { x: 1, y: 0, magnitude: 1, angle: 0 });
    expect(document.querySelector('span[class*="selectionPreview"]')).toBeNull();

    // LS selects Attack (x: 1, y: 0)
    updateControllerSticks({ x: 1, y: 0, magnitude: 1, angle: 0 }, neutralStick);
    expect(document.querySelector('span[class*="selectionPreview"]')?.textContent).toBe('Attack');

    // Neutral commits
    updateControllerSticks(neutralStick, neutralStick);
    await act(async () => { vi.advanceTimersByTime(95); });

    expect(surface.getAttribute('data-wheel-open')).toBe('false');
  });
});
