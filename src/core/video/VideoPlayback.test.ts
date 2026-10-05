import { describe, expect, it, vi } from 'vitest';
import { VideoPlayback, type PlaybackAdapter } from './VideoPlayback';

function adapter(): PlaybackAdapter {
  return { isReady: () => true, getCurrentTimeMs: () => 1250, isPlaying: () => false, play: vi.fn(), pause: vi.fn(), seek: vi.fn() };
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
});
