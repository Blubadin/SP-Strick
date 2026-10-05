// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNativeVideoAdapter, createYouTubeVideoAdapter, loadYouTubeApi, waitForNativeVideo, type YouTubeApi } from './videoAdapters';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); document.querySelectorAll('script').forEach((script) => script.remove()); });
describe('native video adapter', () => {
  it('shares millisecond timing and play/pause/seek controls', async () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { value: 1 });
    const play = vi.spyOn(video, 'play').mockResolvedValue();
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
    video.playbackRate = 1;
    video.currentTime = 1.234;
    const adapter = createNativeVideoAdapter(video);
    expect(adapter.isReady()).toBe(true);
    expect(adapter.getCurrentTimeMs()).toBe(1234);
    expect(adapter.getDurationMs()).toBe(10000);
    await adapter.play(); adapter.pause(); await adapter.seek(5678);
    adapter.setPlaybackRate(1.5);
    expect(video.currentTime).toBe(5.678);
    expect(adapter.getPlaybackRate()).toBe(1.5);
    expect(play).toHaveBeenCalledOnce(); expect(pause).toHaveBeenCalled();
  });
  it('reports a missing/unsupported file through media readiness failure', async () => {
    const video = document.createElement('video');
    const ready = waitForNativeVideo(video);
    video.dispatchEvent(new Event('error'));
    await expect(ready).rejects.toThrow('video');
  });
  it('times out instead of leaving a source activation hanging', async () => {
    vi.useFakeTimers();
    const ready = waitForNativeVideo(document.createElement('video'), 50);
    const assertion = expect(ready).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(51); await assertion;
  });
});
describe('YouTube adapter', () => {
  it('exposes ready playback without starting video and reports embed failures', async () => {
    const player = { getCurrentTime: () => 3.25, getDuration: () => 45, getPlaybackRate: () => 1, getPlayerState: () => 2, setPlaybackRate: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn(), seekTo: vi.fn(), destroy: vi.fn() };
    let error!: (event: { data: number }) => void;
    const Player = vi.fn(function (_host, options) { error = options.events.onError; queueMicrotask(options.events.onReady); return player; });
    vi.stubGlobal('YT', { Player } as unknown as YouTubeApi);
    const onError = vi.fn();
    const adapter = await createYouTubeVideoAdapter(document.createElement('div'), 'dQw4w9WgXcQ', onError);
    expect(adapter.isReady()).toBe(true); expect(adapter.getCurrentTimeMs()).toBe(3250);
    expect(adapter.getDurationMs()).toBe(45000);
    adapter.setPlaybackRate(0.5); expect(player.setPlaybackRate).toHaveBeenCalledWith(0.5);
    expect(player.playVideo).not.toHaveBeenCalled();
    adapter.seek(6250); expect(player.seekTo).toHaveBeenCalledWith(6.25, true);
    error({ data: 150 }); expect(adapter.isReady()).toBe(false); expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'youtubeEmbedding' }));
    adapter.destroy(); expect(player.destroy).toHaveBeenCalled();
  });
  it('times out and destroys a player that never becomes ready', async () => {
    vi.useFakeTimers(); const destroy = vi.fn();
    vi.stubGlobal('YT', { Player: vi.fn(function () { return { destroy }; }) });
    const ready = createYouTubeVideoAdapter(document.createElement('div'), 'dQw4w9WgXcQ', vi.fn(), 50);
    const assertion = expect(ready).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(51); await assertion; expect(destroy).toHaveBeenCalled();
  });
  it('allows a fresh API retry after network failure', async () => {
    const ready = loadYouTubeApi(50);
    document.querySelector('script')?.dispatchEvent(new Event('error'));
    await expect(ready).rejects.toThrow('network');
    const retry = loadYouTubeApi(50);
    vi.stubGlobal('YT', { Player: vi.fn() });
    (window as unknown as { onYouTubeIframeAPIReady: () => void }).onYouTubeIframeAPIReady();
    expect(await retry).toHaveProperty('Player');
  });
  it('prepares the saved position through player parameters without seeking or autoplay', async () => {
    const seekTo = vi.fn();
    const Player = vi.fn(function (_host, options) { queueMicrotask(options.events.onReady); return { seekTo, destroy: vi.fn() }; });
    vi.stubGlobal('YT', { Player });
    const adapter = await createYouTubeVideoAdapter(document.createElement('div'), 'dQw4w9WgXcQ', vi.fn(), 50, 12345);
    expect(Player.mock.calls[0][1].playerVars).toMatchObject({ autoplay: 0, controls: 0, start: 12 });
    expect(seekTo).not.toHaveBeenCalled(); adapter.destroy();
  });
});
