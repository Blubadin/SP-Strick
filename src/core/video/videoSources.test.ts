import { describe, expect, it, vi } from 'vitest';
import { parseYouTubeUrl, restoreLocalVideo } from './videoSources';

describe('YouTube URL parsing', () => {
  it.each(['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=50', 'https://youtu.be/dQw4w9WgXcQ?si=abc', 'https://youtube.com/embed/dQw4w9WgXcQ', 'https://m.youtube.com/shorts/dQw4w9WgXcQ', 'https://youtube.com/live/dQw4w9WgXcQ'])('accepts supported URL %s', (url) => {
    expect(parseYouTubeUrl(url)).toBe('dQw4w9WgXcQ');
  });
  it.each(['https://evil.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ', 'javascript:alert(1)', 'https://youtube.com/watch?v=bad', 'https://example.com/dQw4w9WgXcQ'])('rejects %s', (url) => expect(parseYouTubeUrl(url)).toBeNull());
});
describe('local video recovery', () => {
  it('reads a saved handle with granted permission', async () => {
    const file = { name: 'match.mp4' } as File;
    expect(await restoreLocalVideo({ queryPermission: async () => 'granted', getFile: async () => file })).toBe(file);
  });
  it('does not request permission during automatic reload', async () => {
    const requestPermission = vi.fn(async () => 'granted');
    await expect(restoreLocalVideo({ queryPermission: async () => 'prompt', requestPermission, getFile: vi.fn() })).rejects.toMatchObject({ code: 'localPermission' });
    expect(requestPermission).not.toHaveBeenCalled();
  });
  it('allows permission from an explicit user retry', async () => {
    const file = {} as File;
    expect(await restoreLocalVideo({ queryPermission: async () => 'prompt', requestPermission: async () => 'granted', getFile: async () => file }, true)).toBe(file);
  });
  it('fails recoverably for missing handles or missing files', async () => {
    await expect(restoreLocalVideo(undefined)).rejects.toThrow('reselect');
    await expect(restoreLocalVideo({ getFile: async () => { throw new Error('deleted'); } })).rejects.toThrow('reselect');
  });
});
