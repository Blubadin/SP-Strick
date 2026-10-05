import { VideoError } from './VideoError';

export function parseYouTubeUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === 'youtu.be') id = url.pathname.split('/')[1];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else if (/^\/(embed|shorts|live)\//.test(url.pathname)) id = url.pathname.split('/')[2];
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
export interface LocalVideoHandle {
  getFile(): Promise<File>;
  queryPermission?: (options: { mode: 'read' }) => Promise<string>;
  requestPermission?: (options: { mode: 'read' }) => Promise<string>;
}
export async function restoreLocalVideo(handle: unknown, requestPermission = false): Promise<File> {
  if (!handle || typeof (handle as LocalVideoHandle).getFile !== 'function') throw new VideoError('localUnavailable', 'Please reselect this local video.');
  const fileHandle = handle as LocalVideoHandle;
  if (fileHandle.queryPermission) {
    let permission = await fileHandle.queryPermission({ mode: 'read' });
    if (permission !== 'granted' && requestPermission && fileHandle.requestPermission) permission = await fileHandle.requestPermission({ mode: 'read' });
    if (permission !== 'granted') throw new VideoError('localPermission', 'Local video permission is needed. Retry or reselect the file.');
  }
  try { return await fileHandle.getFile(); }
  catch { throw new VideoError('localUnavailable', 'This local video is unavailable. Please reselect it.'); }
}
