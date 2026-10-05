// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LiveScout } from './LiveScout';
import { useScoutStore } from '../../core/scouting/ScoutStore';
import { useControllerStore } from '../../core/controller/ControllerStore';
import { videoPlayback, type PlaybackAdapter } from '../../core/video/VideoPlayback';
import { intentDispatcher } from '../../core/controller/ControllerIntent';
import '../../i18n';

const renderCounts = vi.hoisted(() => ({ videoPanel: 0 }));
vi.mock('./CourtMap', () => ({ CourtMap: () => <div data-testid="court-map" /> }));
vi.mock('./RallyHistory', () => ({ RallyHistory: () => <div data-testid="rally-history" /> }));
vi.mock('../video/ScoutVideoPanel', () => ({
  ScoutVideoPanel: ({ focusHudHidden }: { focusHudHidden?: boolean }) => {
    renderCounts.videoPanel += 1;
    return <div data-testid="video-panel" data-chrome-hidden={String(focusHudHidden ?? false)} />;
  },
  AudioUnlockButton: () => null
}));

const initialScoutState = useScoutStore.getState();
let detachPlayback: (() => void) | undefined;

function renderLiveScout() {
  return render(<MemoryRouter><LiveScout /></MemoryRouter>);
}

function attachPlayingVideo(playingInitially = true) {
  let playing = playingInitially;
  const adapter: PlaybackAdapter = {
    isReady: () => true,
    getCurrentTimeMs: () => 1000,
    getDurationMs: () => 20_000,
    isPlaying: () => playing,
    getPlaybackRate: () => 1,
    play: () => { playing = true; },
    pause: () => { playing = false; },
    seek: () => {},
    setPlaybackRate: () => {}
  };
  detachPlayback = videoPlayback.attach('focus-test-video', adapter);
}

beforeEach(() => {
  vi.useFakeTimers();
  renderCounts.videoPanel = 0;
  useControllerStore.setState((state) => ({ state: { ...state.state, connected: false } }));
  useScoutStore.setState({
    ...initialScoutState,
    sessionId: null,
    sessionName: 'Test match',
    currentEvent: {},
    allEvents: [],
    recentEvents: [],
    rallies: []
  });
});

afterEach(() => {
  cleanup();
  detachPlayback?.();
  detachPlayback = undefined;
  vi.useRealTimers();
});

describe('LiveScout focus mode', () => {
  it('keeps the active team and selected player visible in the action summary', () => {
    useScoutStore.setState({ activeTeam: 'B', selectedPlayerId: 'b-7',
      teamBPlayers: [{ id: 'b-7', number: 7, name: 'Mai' }],
      currentEvent: { skill: 'block', originZone: 2, evaluation: 0 } });
    renderLiveScout();
    fireEvent.click(screen.getByRole('button', { name: 'Focus mode' }));
    expect(screen.getByText('B · Team B · #7 Mai · Block · Z2 · Pass')).toBeTruthy();
  });

  it('enters focus mode and exits with Escape while keeping score and event summary visible', () => {
    renderLiveScout();

    fireEvent.click(screen.getByRole('button', { name: 'Focus mode' }));
    const liveSurface = screen.getByTestId('live-scout-surface');

    expect(liveSurface.getAttribute('data-focus-mode')).toBe('true');
    expect(screen.getByRole('button', { name: 'Exit focus mode' })).toBeTruthy();
    expect(screen.getByText('CURRENT EVENT')).toBeTruthy();
    expect(screen.queryByTestId('court-map')).toBeNull();
    expect(screen.queryByTestId('rally-history')).toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(liveSurface.getAttribute('data-focus-mode')).toBe('false');
    expect(screen.getByTestId('court-map')).toBeTruthy();
  });

  it('can enter without a selected video and shows a setup prompt with a working exit', () => {
    renderLiveScout();
    fireEvent.click(screen.getByRole('button', { name: 'Focus mode' }));

    expect(screen.getByText('Add a video or continue scouting without one.')).toBeTruthy();
    act(() => attachPlayingVideo(false));
    expect(screen.queryByText('Add a video or continue scouting without one.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Exit focus mode' }));
    expect(screen.getByTestId('live-scout-surface').getAttribute('data-focus-mode')).toBe('false');
  });

  it('exits focus mode before opening the controller session menu', () => {
    useControllerStore.setState((state) => ({ state: { ...state.state, connected: true } }));
    renderLiveScout();
    fireEvent.click(screen.getByRole('button', { name: 'Focus mode' }));

    act(() => intentDispatcher.dispatch({ type: 'PAUSE_SESSION' }));

    expect(screen.getByTestId('live-scout-surface').getAttribute('data-focus-mode')).toBe('false');
    expect(screen.getByRole('dialog', { name: 'Session Menu' })).toBeTruthy();
  });

  it('hides noncritical controls after playback and reveals them on input', () => {
    attachPlayingVideo();
    useScoutStore.setState({ sessionId: 'focus-test-session' });
    renderLiveScout();
    fireEvent.click(screen.getByRole('button', { name: 'Focus mode' }));
    const liveSurface = screen.getByTestId('live-scout-surface');

    act(() => { vi.advanceTimersByTime(3100); });
    expect(liveSurface.getAttribute('data-hud-hidden')).toBe('true');
    expect(screen.getByTestId('video-panel').getAttribute('data-chrome-hidden')).toBe('true');
    expect(screen.getByRole('button', { name: 'Exit focus mode' })).toBeTruthy();

    fireEvent.pointerMove(liveSurface);
    expect(liveSurface.getAttribute('data-hud-hidden')).toBe('false');
    expect(screen.getByTestId('video-panel').getAttribute('data-chrome-hidden')).toBe('false');
  });

  it('restarts the three-second inactivity timeout after each interaction', () => {
    attachPlayingVideo();
    useControllerStore.setState((state) => ({ state: { ...state.state, connected: true } }));
    renderLiveScout();
    fireEvent.click(screen.getByRole('button', { name: 'Focus mode' }));
    const liveSurface = screen.getByTestId('live-scout-surface');

    act(() => { vi.advanceTimersByTime(2000); });
    fireEvent.pointerMove(liveSurface);
    act(() => { vi.advanceTimersByTime(1100); });
    fireEvent.touchStart(liveSurface);
    act(() => { vi.advanceTimersByTime(1100); });
    fireEvent.keyDown(liveSurface, { key: 'a' });
    act(() => { vi.advanceTimersByTime(1100); });
    act(() => intentDispatcher.dispatch({ type: 'SELECT_TEAM_A' }));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(liveSurface.getAttribute('data-hud-hidden')).toBe('false');

    act(() => { vi.advanceTimersByTime(1100); });
    expect(liveSurface.getAttribute('data-hud-hidden')).toBe('true');
  });

  it('does not rerender main content for pointer moves while the HUD is visible', () => {
    useScoutStore.setState({ sessionId: 'focus-test-session' });
    renderLiveScout();
    fireEvent.click(screen.getByRole('button', { name: 'Focus mode' }));
    const liveSurface = screen.getByTestId('live-scout-surface');
    const panelRenders = renderCounts.videoPanel;

    fireEvent.pointerMove(liveSurface);
    fireEvent.pointerMove(liveSurface);
    fireEvent.pointerMove(liveSurface);

    expect(renderCounts.videoPanel).toBe(panelRenders);
  });

  it('reveals hidden controls and restarts inactivity after analog controller input', () => {
    attachPlayingVideo();
    useControllerStore.setState((state) => ({ state: { ...state.state, connected: true } }));
    renderLiveScout();
    fireEvent.click(screen.getByRole('button', { name: 'Focus mode' }));
    const liveSurface = screen.getByTestId('live-scout-surface');
    act(() => { vi.advanceTimersByTime(3100); });
    expect(liveSurface.getAttribute('data-hud-hidden')).toBe('true');

    act(() => useControllerStore.setState((state) => ({ state: {
      ...state.state, leftStick: { x: 0.7, y: 0, magnitude: 0.7, angle: 0 }
    } })));
    expect(liveSurface.getAttribute('data-hud-hidden')).toBe('false');
    act(() => { vi.advanceTimersByTime(3100); });
    expect(liveSurface.getAttribute('data-hud-hidden')).toBe('true');
  });
});
