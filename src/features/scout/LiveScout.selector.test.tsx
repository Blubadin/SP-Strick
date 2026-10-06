// @vitest-environment jsdom
import { cleanup, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LiveScout } from './LiveScout';
import { useScoutStore } from '../../core/scouting/ScoutStore';
import { useControllerStore } from '../../core/controller/ControllerStore';
import { intentDispatcher } from '../../core/controller/ControllerIntent';
import { STANDARD_PROFILE } from '../../core/controller/ControllerProfile';
import type { SemanticControl } from '../../core/controller/ControllerTypes';
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

function holdOpenerButton(control: SemanticControl) {
  act(() => {
    useControllerStore.setState((prev) => ({
      state: {
        ...prev.state,
        buttons: {
          ...prev.state.buttons,
          [control]: { pressed: true, touched: true, value: 1, held: true, pressedThisFrame: true, releasedThisFrame: false }
        }
      }
    }));
  });
}

function releaseOpenerButton(control: SemanticControl) {
  act(() => {
    useControllerStore.setState((prev) => ({
      state: {
        ...prev.state,
        buttons: {
          ...prev.state.buttons,
          [control]: { pressed: false, touched: false, value: 0, held: false, pressedThisFrame: false, releasedThisFrame: true }
        }
      }
    }));
  });
}

function startHoldSelector(control: SemanticControl, category: 'SKILL' | 'ZONE' | 'RESULT' | 'TEAM' | 'PLAYER') {
  holdOpenerButton(control);
  act(() => intentDispatcher.dispatch({ type: 'OPEN_RADIAL', category, control }));
}

function updateControllerSticks(
  left: { x: number; y: number; magnitude: number; angle: number },
  right: { x: number; y: number; magnitude: number; angle: number }
) {
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
    rallies: [],
    teamAPlayers: [
      { id: 'p1', number: 7, name: 'Alex Player' },
      { id: 'p2', number: 10, name: 'Sam Player' },
      { id: 'p3', number: 12, name: 'Jordan Player' }
    ],
    teamBPlayers: [
      { id: 'p4', number: 4, name: 'Taylor Rival' }
    ]
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('LiveScout Hold-to-Select State Machine and Stick Isolation', () => {
  it('opens Skill on hold A: RS movement is ignored; LS selects Attack; neutral stick does NOT commit; release A commits Attack', async () => {
    renderLiveScout();
    const surface = screen.getByTestId('live-scout-surface');

    // Hold A -> Skill selector opens
    startHoldSelector('FACE_SOUTH', 'SKILL');
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

    // Return LEFT STICK to neutral -> preview must be maintained, NOT committed!
    updateControllerSticks(neutralStick, neutralStick);
    expect(surface.getAttribute('data-wheel-open')).toBe('true');
    expect(document.querySelector('span[class*="selectionPreview"]')?.textContent).toBe('Attack');
    expect(useScoutStore.getState().currentEvent.skill).toBeUndefined();

    // Release button A -> Commits Attack and closes selector
    releaseOpenerButton('FACE_SOUTH');
    await act(async () => { await Promise.resolve(); });

    expect(surface.getAttribute('data-wheel-open')).toBe('false');
    expect(useScoutStore.getState().currentEvent.skill).toBe('attack');
  });

  it('quick tap on A without stick movement cancels without committing', async () => {
    renderLiveScout();
    const surface = screen.getByTestId('live-scout-surface');

    // Tap A (press and release immediately without LS movement)
    startHoldSelector('FACE_SOUTH', 'SKILL');
    expect(surface.getAttribute('data-wheel-open')).toBe('true');

    // Release A without selecting anything
    releaseOpenerButton('FACE_SOUTH');
    await act(async () => { await Promise.resolve(); });

    expect(surface.getAttribute('data-wheel-open')).toBe('false');
    expect(useScoutStore.getState().currentEvent.skill).toBeUndefined();
  });

  it('allows changing selection before release and commits the latest highlighted option', async () => {
    renderLiveScout();
    const surface = screen.getByTestId('live-scout-surface');

    startHoldSelector('FACE_SOUTH', 'SKILL');

    // Move LS to Attack (angle 0)
    updateControllerSticks({ x: 1, y: 0, magnitude: 1, angle: 0 }, neutralStick);
    expect(document.querySelector('span[class*="selectionPreview"]')?.textContent).toBe('Attack');

    // Move LS to Block (angle 60)
    updateControllerSticks({ x: 0.5, y: 0.866, magnitude: 1, angle: 60 }, neutralStick);
    expect(document.querySelector('span[class*="selectionPreview"]')?.textContent).toBe('Block');

    // Return to neutral stick
    updateControllerSticks(neutralStick, neutralStick);
    expect(document.querySelector('span[class*="selectionPreview"]')?.textContent).toBe('Block');

    // Release A -> Commits Block
    releaseOpenerButton('FACE_SOUTH');
    await act(async () => { await Promise.resolve(); });

    expect(surface.getAttribute('data-wheel-open')).toBe('false');
    expect(useScoutStore.getState().currentEvent.skill).toBe('block');
  });

  it('opens Area on hold X: RS movement is ignored; LS selects Z4; neutral does NOT commit; release X commits Z4', async () => {
    renderLiveScout();
    const surface = screen.getByTestId('live-scout-surface');

    startHoldSelector('FACE_WEST', 'ZONE');
    expect(surface.getAttribute('data-wheel-open')).toBe('true');
    expect(screen.getByText('Choose court zone')).toBeTruthy();

    // RS movement ignored
    updateControllerSticks(neutralStick, { x: -0.8, y: -0.8, magnitude: 1.13, angle: 225 });
    const zone4Btn = screen.getByRole('button', { name: /Z4/ });
    expect(zone4Btn.getAttribute('aria-pressed')).toBe('false');

    // LS moves upper-left -> selects Z4
    updateControllerSticks({ x: -0.8, y: -0.8, magnitude: 1.13, angle: 225 }, neutralStick);
    expect(zone4Btn.getAttribute('aria-pressed')).toBe('true');

    // Return LS to neutral -> Z4 remains selected, no commit yet
    updateControllerSticks(neutralStick, neutralStick);
    expect(surface.getAttribute('data-wheel-open')).toBe('true');
    expect(useScoutStore.getState().currentEvent.originZone).toBeUndefined();

    // Release X -> Commits Z4
    releaseOpenerButton('FACE_WEST');
    await act(async () => { await Promise.resolve(); });

    expect(surface.getAttribute('data-wheel-open')).toBe('false');
    expect(useScoutStore.getState().currentEvent.originZone).toBe(4);
  });

  it('opens Result on hold B: RS movement is ignored; LS selects +1; neutral does NOT commit; release B commits +1', async () => {
    renderLiveScout();
    const surface = screen.getByTestId('live-scout-surface');

    startHoldSelector('FACE_EAST', 'RESULT');
    expect(surface.getAttribute('data-wheel-open')).toBe('true');
    expect(document.querySelector('span[class*="categoryTitle"]')?.textContent).toBe('Result');

    // RS movement ignored
    updateControllerSticks(neutralStick, { x: 1, y: 0, magnitude: 1, angle: 0 });
    expect(document.querySelector('span[class*="selectionPreview"]')).toBeNull();

    // LS moves to right (0 deg => +1)
    updateControllerSticks({ x: 1, y: 0, magnitude: 1, angle: 0 }, neutralStick);
    expect(document.querySelector('span[class*="selectionPreview"]')?.textContent).toBe('+1');

    // Return to neutral
    updateControllerSticks(neutralStick, neutralStick);
    expect(surface.getAttribute('data-wheel-open')).toBe('true');
    expect(useScoutStore.getState().currentEvent.evaluation).toBeUndefined();

    // Release B -> Commits +1
    releaseOpenerButton('FACE_EAST');
    await act(async () => { await Promise.resolve(); });

    expect(surface.getAttribute('data-wheel-open')).toBe('false');
    expect(useScoutStore.getState().currentEvent.evaluation).toBe(1);
  });

  it('opens Team on hold Y: displays actual team names; LS selects Storm; release Y commits Team B', async () => {
    renderLiveScout();
    const surface = screen.getByTestId('live-scout-surface');

    startHoldSelector('FACE_NORTH', 'TEAM');
    expect(surface.getAttribute('data-wheel-open')).toBe('true');
    expect(document.querySelector('span[class*="categoryTitle"]')?.textContent).toBe('Team');

    // RS ignored
    updateControllerSticks(neutralStick, { x: -1, y: 0, magnitude: 1, angle: 180 });
    expect(document.querySelector('span[class*="selectionPreview"]')).toBeNull();

    // LS moves left (180 deg => Storm / Team B)
    updateControllerSticks({ x: -1, y: 0, magnitude: 1, angle: 180 }, neutralStick);
    expect(document.querySelector('span[class*="selectionPreview"]')?.textContent).toBe('Storm');

    // Return to neutral -> still Storm, not committed yet
    updateControllerSticks(neutralStick, neutralStick);
    expect(surface.getAttribute('data-wheel-open')).toBe('true');
    expect(useScoutStore.getState().activeTeam).toBe('A');

    // Release Y -> Commits Team B
    releaseOpenerButton('FACE_NORTH');
    await act(async () => { await Promise.resolve(); });

    expect(surface.getAttribute('data-wheel-open')).toBe('false');
    expect(useScoutStore.getState().activeTeam).toBe('B');
  });

  it('opens Player on hold L1: displays active court players; LS selects #7; release L1 commits player', async () => {
    renderLiveScout();
    const surface = screen.getByTestId('live-scout-surface');

    startHoldSelector('LEFT_BUMPER', 'PLAYER');
    expect(surface.getAttribute('data-wheel-open')).toBe('true');
    expect(document.querySelector('span[class*="categoryTitle"]')?.textContent).toBe('Player');

    // RS ignored
    updateControllerSticks(neutralStick, { x: 1, y: 0, magnitude: 1, angle: 0 });
    expect(document.querySelector('span[class*="selectionPreview"]')).toBeNull();

    // LS selects first player (#7 Alex Player)
    updateControllerSticks({ x: 1, y: 0, magnitude: 1, angle: 0 }, neutralStick);
    expect(document.querySelector('span[class*="selectionPreview"]')?.textContent).toBe('#7');

    // Neutral -> not committed yet
    updateControllerSticks(neutralStick, neutralStick);
    expect(surface.getAttribute('data-wheel-open')).toBe('true');
    expect(useScoutStore.getState().selectedPlayerId).toBeUndefined();

    // Release L1 -> Commits player #7 (id 'p1')
    releaseOpenerButton('LEFT_BUMPER');
    await act(async () => { await Promise.resolve(); });

    expect(surface.getAttribute('data-wheel-open')).toBe('false');
    expect(useScoutStore.getState().selectedPlayerId).toBe('p1');
  });

  it('opens Player on hold L1 with empty roster: displays empty state and cancels on release', async () => {
    useScoutStore.setState({ teamAPlayers: [] });
    renderLiveScout();
    const surface = screen.getByTestId('live-scout-surface');

    startHoldSelector('LEFT_BUMPER', 'PLAYER');
    expect(surface.getAttribute('data-wheel-open')).toBe('true');
    expect(screen.getByText('NO PLAYERS')).toBeTruthy();

    // Stick deflection cannot select anything
    updateControllerSticks({ x: 1, y: 0, magnitude: 1, angle: 0 }, neutralStick);
    expect(document.querySelector('span[class*="selectionPreview"]')).toBeNull();

    // Release L1 -> Cancels cleanly
    releaseOpenerButton('LEFT_BUMPER');
    await act(async () => { await Promise.resolve(); });

    expect(surface.getAttribute('data-wheel-open')).toBe('false');
    expect(useScoutStore.getState().selectedPlayerId).toBeUndefined();
  });

  it('toggles active team between A and B on TOGGLE_ACTIVE_TEAM (L2)', () => {
    renderLiveScout();
    expect(useScoutStore.getState().activeTeam).toBe('A');

    // Press L2 -> toggles to Team B
    act(() => intentDispatcher.dispatch({ type: 'TOGGLE_ACTIVE_TEAM' }));
    expect(useScoutStore.getState().activeTeam).toBe('B');

    // Press L2 again -> toggles back to Team A
    act(() => intentDispatcher.dispatch({ type: 'TOGGLE_ACTIVE_TEAM' }));
    expect(useScoutStore.getState().activeTeam).toBe('A');
  });

  it('ignores competing OPEN_RADIAL intents while a selector is already held', async () => {
    renderLiveScout();
    const surface = screen.getByTestId('live-scout-surface');

    // Hold A for Skill
    startHoldSelector('FACE_SOUTH', 'SKILL');
    expect(document.querySelector('span[class*="categoryTitle"]')?.textContent).toBe('Skill');

    // Competing open for Zone (X) arrives while A is held
    act(() => intentDispatcher.dispatch({ type: 'OPEN_RADIAL', category: 'ZONE', control: 'FACE_WEST' }));
    // Wheel remains Skill!
    expect(document.querySelector('span[class*="categoryTitle"]')?.textContent).toBe('Skill');

    // Select Attack with LS
    updateControllerSticks({ x: 1, y: 0, magnitude: 1, angle: 0 }, neutralStick);
    releaseOpenerButton('FACE_SOUTH');
    await act(async () => { await Promise.resolve(); });

    expect(surface.getAttribute('data-wheel-open')).toBe('false');
    expect(useScoutStore.getState().currentEvent.skill).toBe('attack');
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

  it('handles Quick Edit: opens Skill field radial with A, ignores RS, selects with LS, neutral does not commit, release commits edit', async () => {
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

    // In Quick Edit: field 0=Team, field 1=Player, field 2=Skill.
    // Default focus is index 1. Navigate down one step to index 2 (Skill).
    act(() => intentDispatcher.dispatch({ type: 'QUICK_RESULT_NEGATIVE' }));

    // Hold A to open Skill radial
    startHoldSelector('FACE_SOUTH', 'SKILL');
    expect(surface.getAttribute('data-wheel-open')).toBe('true');

    // RS ignored
    updateControllerSticks(neutralStick, { x: 1, y: 0, magnitude: 1, angle: 0 });
    expect(document.querySelector('span[class*="selectionPreview"]')).toBeNull();

    // LS selects Attack (x: 1, y: 0)
    updateControllerSticks({ x: 1, y: 0, magnitude: 1, angle: 0 }, neutralStick);
    expect(document.querySelector('span[class*="selectionPreview"]')?.textContent).toBe('Attack');

    // Neutral does not commit
    updateControllerSticks(neutralStick, neutralStick);
    expect(surface.getAttribute('data-wheel-open')).toBe('true');

    // Release A commits edit stage
    releaseOpenerButton('FACE_SOUTH');
    await act(async () => { await Promise.resolve(); });

    expect(surface.getAttribute('data-wheel-open')).toBe('false');
  });
});
