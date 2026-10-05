// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { videoPlayback, type PlaybackAdapter } from '../../core/video/VideoPlayback';
import { HudVideoControls } from './HudVideoControls';

afterEach(cleanup);
function setup() {
  let current = 12_000;
  let playing = false;
  let rate = 1;
  const player: PlaybackAdapter = {
    isReady: () => true,
    getCurrentTimeMs: () => current,
    getDurationMs: () => 92_300,
    isPlaying: () => playing,
    getPlaybackRate: () => rate,
    play: vi.fn(() => { playing = true; }),
    pause: vi.fn(() => { playing = false; }),
    seek: vi.fn((time) => { current = time; }),
    setPlaybackRate: vi.fn((value) => { rate = value; })
  };
  const detach = videoPlayback.attach('test-video', player);
  return { player, detach };
}

describe('HUD video controls', () => {
  it('shows precise current and duration time with transport and rate controls', () => {
    const { detach } = setup();
    render(<HudVideoControls />);
    expect(screen.getByRole('slider', { name: 'Video timeline' }).getAttribute('aria-valuetext')).toBe('00:12.0 / 01:32.3');
    expect(screen.getByRole('slider', { name: 'Video timeline' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play video' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Seek back 3 seconds' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Seek back 1 second' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Seek forward 1 second' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Seek forward 3 seconds' })).toBeTruthy();
    expect(screen.getByLabelText('Playback speed')).toBeTruthy();
    detach();
  });

  it('routes play, pause, incremental seeks and speed through the shared playback adapter', async () => {
    const { player, detach } = setup();
    render(<HudVideoControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }));
    expect(player.play).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Seek back 1 second' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seek forward 3 seconds' }));
    expect(player.seek).toHaveBeenNthCalledWith(1, 11_000);
    expect(player.seek).toHaveBeenNthCalledWith(2, 14_000);
    fireEvent.change(screen.getByLabelText('Playback speed'), { target: { value: '1.5' } });
    expect(player.setPlaybackRate).toHaveBeenCalledWith(1.5);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause video' })).toBeTruthy());
    detach();
  });

  it('supports pointer capture scrubbing and clamps the timeline to its duration', async () => {
    const { player, detach } = setup();
    const setCapture = vi.fn();
    const releaseCapture = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: setCapture });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { configurable: true, value: releaseCapture });
    render(<HudVideoControls />);
    const timeline = screen.getByRole('slider', { name: 'Video timeline' });
    vi.spyOn(timeline, 'getBoundingClientRect').mockReturnValue({ left: 10, right: 210, width: 200, top: 0, bottom: 16, height: 16, x: 10, y: 0, toJSON: () => ({}) });

    fireEvent.pointerDown(timeline, { pointerId: 8, clientX: 110 });
    fireEvent.pointerMove(timeline, { pointerId: 8, clientX: 300 });
    fireEvent.pointerUp(timeline, { pointerId: 8, clientX: 300 });
    await act(async () => {});

    expect(setCapture).toHaveBeenCalledWith(8);
    expect(releaseCapture).toHaveBeenCalledWith(8);
    expect(player.seek).toHaveBeenLastCalledWith(92_300);
    detach();
  });
});
