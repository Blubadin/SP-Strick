// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScoutVideoPanel } from './ScoutVideoPanel';
import { videoPlayback } from '../../core/video/VideoPlayback';

const state = vi.hoisted(() => ({ sources: [] as Record<string, unknown>[], settings: new Map(), player: { isReady: () => true, getCurrentTimeMs: () => 2500, isPlaying: () => false, play: vi.fn(), pause: vi.fn(), seek: vi.fn(), destroy: vi.fn() } }));
vi.mock('../../core/persistence/database', () => ({ db: {
  videoSources: { where: () => ({ equals: (id: string) => ({ toArray: async () => state.sources.filter((source) => source.sessionId === id) }) }), get: async (id: string) => state.sources.find((source) => source.id === id), put: vi.fn(async (source) => { state.sources = [...state.sources.filter((item) => item.id !== source.id), source]; }), update: vi.fn(async () => 1) },
  settings: { get: async (key: string) => state.settings.get(key), put: async (entry: { key: string; value: unknown }) => state.settings.set(entry.key, entry) }
} }));
vi.mock('../../core/video/videoAdapters', async (importOriginal) => ({ ...await importOriginal(), createYouTubeVideoAdapter: vi.fn(async () => state.player) }));
beforeEach(() => { state.sources = []; state.settings.clear(); vi.clearAllMocks(); vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('ScoutVideoPanel', () => {
  it('rejects invalid YouTube URLs without saving a source', async () => {
    render(<ScoutVideoPanel sessionId="session" />);
    fireEvent.change(screen.getByLabelText('YouTube URL'), { target: { value: 'https://evil.test/watch?v=dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add YouTube video' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(state.sources).toHaveLength(0);
  });
  it('saves a session YouTube source and leaves playback to the user', async () => {
    render(<ScoutVideoPanel sessionId="session" />);
    fireEvent.change(screen.getByLabelText('YouTube URL'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add YouTube video' }));
    await waitFor(() => expect(videoPlayback.getEventTiming().videoSourceId).toBe(state.sources[0]?.id));
    expect(state.sources[0]).toMatchObject({ sessionId: 'session', kind: 'youtube', videoId: 'dQw4w9WgXcQ' });
    expect(state.player.play).not.toHaveBeenCalled();
  });
  it('offers reselect on a persisted local file without a reusable handle', async () => {
    state.sources = [{ id: 'local', sessionId: 'session', kind: 'local', name: 'match.mp4', fileName: 'match.mp4', fileSize: 100, createdAt: '2026-10-05' }];
    render(<ScoutVideoPanel sessionId="session" />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reselect file' })).toBeTruthy();
    expect(videoPlayback.getEventTiming()).toEqual({});
  });
  it('activates the saved source for review and pauses after seeking', async () => {
    state.sources = ['first', 'second'].map((id) => ({ id, sessionId: 'session', kind: 'youtube', name: id, videoId: 'dQw4w9WgXcQ', createdAt: id }));
    render(<ScoutVideoPanel sessionId="session" />);
    await waitFor(() => expect(videoPlayback.getEventTiming().videoSourceId).toBe('second'));
    await act(async () => { await videoPlayback.seekToEvent({ videoSourceId: 'first', videoTimeMs: 9000 }); });
    expect(videoPlayback.getEventTiming().videoSourceId).toBe('first');
    expect(state.player.seek).toHaveBeenCalledWith(9000);
    expect(state.player.pause).toHaveBeenCalled();
  });
  it('keeps the player host mounted when the source becomes selected', async () => {
    const { container } = render(<ScoutVideoPanel sessionId="session" />);
    const originalHost = container.querySelector('[data-video-host]');
    fireEvent.change(screen.getByLabelText('YouTube URL'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add YouTube video' }));
    await waitFor(() => expect(videoPlayback.getEventTiming().videoSourceId).toBeTruthy());
    expect(container.querySelector('[data-video-host]')).toBe(originalHost);
    expect(originalHost?.children).toHaveLength(1);
  });
  it('revokes a pending local object URL immediately on unmount', async () => {
    const createObjectURL = vi.fn(() => 'blob:match'); const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const { container, unmount } = render(<ScoutVideoPanel sessionId="session" />);
    const file = new File(['video'], 'match.mp4', { type: 'video/mp4' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(file));
    expect(container.querySelector('video')?.autoplay).toBe(false);
    unmount(); expect(revokeObjectURL).toHaveBeenCalledWith('blob:match');
  });
});
