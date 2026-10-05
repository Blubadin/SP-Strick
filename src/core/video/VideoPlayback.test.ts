import { afterEach, describe, expect, it, vi } from 'vitest';
import { VideoPlayback, type PlaybackAdapter } from './VideoPlayback';

afterEach(() => vi.useRealTimers());

function adapter(): PlaybackAdapter {
  return { isReady: () => true, getCurrentTimeMs: () => 1250, getDurationMs: () => 0, isPlaying: () => false, getPlaybackRate: () => 1, play: vi.fn(), pause: vi.fn(), seek: vi.fn(), setPlaybackRate: vi.fn() };
}
describe('video event timing and source selection', () => {
  it('reads the player time directly for each committed event', () => {
    const playback = new VideoPlayback();
    const player = adapter(); let time = 1200;
    player.getCurrentTimeMs = () => time;
    playback.attach('video-1', player);
    expect(playback.getEventTiming()).toEqual({ videoTimeMs: 1200, videoSourceId: 'video-1' });
    time = 1954.8;
    expect(playback.getEventTiming()).toEqual({ videoTimeMs: 1955, videoSourceId: 'video-1' });
  });
  it('omits timing for a player that is not ready or returns an invalid time', () => {
    const playback = new VideoPlayback(); const player = adapter();
    expect(playback.getEventTiming()).toEqual({});
    player.isReady = () => false; playback.attach('source', player);
    expect(playback.getEventTiming()).toEqual({});
    player.isReady = () => true; player.getCurrentTimeMs = () => NaN;
    expect(playback.getEventTiming()).toEqual({});
  });
  it('switches to the saved event source before seeking and pausing', async () => {
    const playback = new VideoPlayback(); const first = adapter(); const second = adapter();
    playback.attach('first', first);
    const activate = vi.fn(async (id: string) => { playback.attach(id, second); });
    playback.registerSourceActivator(activate);
    await playback.seekToEvent({ videoSourceId: 'second', videoTimeMs: 6500 });
    expect(activate).toHaveBeenCalledWith('second');
    expect(first.seek).not.toHaveBeenCalled();
    expect(second.seek).toHaveBeenCalledWith(6500);
    expect(second.pause).toHaveBeenCalled();
  });
  it('refuses a missing event source instead of seeking a different video', async () => {
    const playback = new VideoPlayback(); const player = adapter(); playback.attach('first', player);
    await expect(playback.seekToEvent({ videoSourceId: 'missing', videoTimeMs: 1000 })).rejects.toThrow('source');
    expect(player.seek).not.toHaveBeenCalled();
  });
  it('ignores stale detach functions and handles rejected play without throwing', async () => {
    const playback = new VideoPlayback(); const first = adapter(); const second = adapter();
    const detach = playback.attach('first', first); playback.attach('second', second); detach();
    second.play = vi.fn(async () => { throw new Error('blocked'); });
    playback.togglePlayback(); await Promise.resolve();
    expect(second.play).toHaveBeenCalled();
    expect(playback.getEventTiming().videoSourceId).toBe('second');
  });

  it('exposes bounded seek, duration, playing state, and playback rate controls', async () => {
    const playback = new VideoPlayback();
    const player = adapter();
    let current = 1000;
    let playing = false;
    let rate = 1;
    player.getCurrentTimeMs = () => current;
    player.getDurationMs = () => 5000;
    player.isPlaying = () => playing;
    player.play = vi.fn(() => { playing = true; });
    player.pause = vi.fn(() => { playing = false; });
    player.seek = vi.fn((time) => { current = time; });
    player.getPlaybackRate = () => rate;
    player.setPlaybackRate = vi.fn((value) => { rate = value; });
    playback.attach('video', player);

    expect(playback.isReady()).toBe(true);
    expect(playback.getDurationMs()).toBe(5000);
    await playback.seekBy(-3000);
    expect(current).toBe(0);
    await playback.seekTo(9000);
    expect(current).toBe(5000);
    await playback.play();
    expect(playback.isPlaying()).toBe(true);
    playback.pause();
    expect(playback.isPlaying()).toBe(false);
    playback.setPlaybackRate(1.5);
    expect(playback.getPlaybackRate()).toBe(1.5);
    expect(player.setPlaybackRate).toHaveBeenCalledWith(1.5);
  });

  it('notifies active playback subscribers at a bounded rate and stops after unsubscribe', async () => {
    vi.useFakeTimers();
    const playback = new VideoPlayback();
    const listener = vi.fn();
    const unsubscribe = playback.subscribe(listener);
    playback.attach('video', adapter());
    listener.mockClear();

    await vi.advanceTimersByTimeAsync(150);
    expect(listener).toHaveBeenCalled();
    listener.mockClear();
    unsubscribe();
    await vi.advanceTimersByTimeAsync(500);
    expect(listener).not.toHaveBeenCalled();
  });
});
