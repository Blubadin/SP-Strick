import type { PlaybackAdapter } from './VideoPlayback';
import { VideoError, type VideoErrorCode } from './VideoError';
export interface YouTubePlayer {
  getCurrentTime(): number;
  getPlayerState(): number;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
}
export interface YouTubeApi {
  Player: new (host: HTMLElement, options: { videoId: string; width: string; height: string; playerVars: Record<string, string | number>; events: { onReady: () => void; onError: (event: { data: number }) => void } }) => YouTubePlayer;
}
export type DisposablePlaybackAdapter = PlaybackAdapter & { destroy(): void };
export function createNativeVideoAdapter(video: HTMLVideoElement): PlaybackAdapter {
  return {
    isReady: () => video.readyState >= 1 && !video.error,
    getCurrentTimeMs: () => video.currentTime * 1000,
    isPlaying: () => !video.paused && !video.ended,
    play: () => video.play(),
    pause: () => video.pause(),
    seek: (timeMs) => { video.currentTime = Math.min(Number.isFinite(video.duration) ? video.duration : Infinity, Math.max(0, timeMs / 1000)); }
  };
}

export function waitForNativeVideo(video: HTMLVideoElement, timeoutMs = 15000, signal?: AbortSignal): Promise<void> {
  if (video.readyState >= 1 && !video.error) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timeout); video.removeEventListener('loadedmetadata', ready); video.removeEventListener('error', failed); signal?.removeEventListener('abort', cancelled); };
    const ready = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new VideoError('localUnsupported', 'Unable to open this video. Reselect a supported local video file.')); };
    const cancelled = () => { cleanup(); reject(new DOMException('Video loading cancelled', 'AbortError')); };
    const timeout = setTimeout(() => { cleanup(); reject(new VideoError('localTimeout', 'Local video loading timed out. Retry or reselect the file.')); }, timeoutMs);
    video.addEventListener('loadedmetadata', ready, { once: true });
    video.addEventListener('error', failed, { once: true });
    signal?.addEventListener('abort', cancelled, { once: true });
    if (signal?.aborted) cancelled();
    if (video.error) failed();
  });
}

type YouTubeWindow = Window & { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };
let apiRequest: Promise<YouTubeApi> | null = null;

export function loadYouTubeApi(timeoutMs = 15000): Promise<YouTubeApi> {
  const browser = window as YouTubeWindow;
  if (browser.YT?.Player) return Promise.resolve(browser.YT);
  if (apiRequest) return apiRequest;
  const request = new Promise<YouTubeApi>((resolve, reject) => {
    const previousReady = browser.onYouTubeIframeAPIReady;
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    const cleanup = () => {
      clearTimeout(timeout);
      script.onerror = null;
      if (browser.onYouTubeIframeAPIReady === onReady) browser.onYouTubeIframeAPIReady = previousReady;
    };
    const fail = (code: VideoErrorCode, message: string) => { cleanup(); script.remove(); reject(new VideoError(code, message)); };
    const onReady = () => {
      try { previousReady?.(); } catch { /* Other embeds do not block this player. */ }
      if (browser.YT?.Player) { cleanup(); resolve(browser.YT); }
      else fail('youtubeApi', 'YouTube API is unavailable. Retry the video.');
    };
    const timeout = setTimeout(() => fail('youtubeTimeout', 'YouTube loading timed out. Check your network and retry.'), timeoutMs);
    browser.onYouTubeIframeAPIReady = onReady;
    script.onerror = () => fail('youtubeNetwork', 'YouTube network connection failed. Check your network and retry.');
    document.head.appendChild(script);
  });
  apiRequest = request;
  void request.then(() => { if (apiRequest === request) apiRequest = null; }, () => { if (apiRequest === request) apiRequest = null; });
  return request;
}

export async function createYouTubeVideoAdapter(host: HTMLElement, videoId: string, onError: (error: Error) => void, timeoutMs = 15000, startTimeMs = 0): Promise<DisposablePlaybackAdapter> {
  const api = await loadYouTubeApi(timeoutMs);
  return new Promise((resolve, reject) => {
    let ready = false;
    let player: YouTubePlayer | undefined;
    const fail = (error: Error) => {
      clearTimeout(timeout);
      if (ready) { ready = false; onError(error); }
      else { try { player?.destroy(); } catch { /* Failed iframe. */ } reject(error); }
    };
    const timeout = setTimeout(() => fail(new VideoError('youtubeTimeout', 'YouTube player loading timed out. Check your connection and retry.')), timeoutMs);
    const adapter: DisposablePlaybackAdapter = {
      isReady: () => ready,
      getCurrentTimeMs: () => player!.getCurrentTime() * 1000,
      isPlaying: () => player!.getPlayerState() === 1,
      play: () => player!.playVideo(),
      pause: () => player?.pauseVideo(),
      seek: (timeMs) => { player!.seekTo(Math.max(0, timeMs / 1000), true); player!.pauseVideo(); },
      destroy: () => { ready = false; clearTimeout(timeout); player?.destroy(); }
    };
    try {
      player = new api.Player(host, {
        videoId, width: '100%', height: '100%',
        playerVars: { autoplay: 0, playsinline: 1, controls: 1, origin: window.location.origin, start: Math.floor(Math.max(0, startTimeMs) / 1000) },
        events: {
          onReady: () => { clearTimeout(timeout); ready = true; resolve(adapter); },
          onError: ({ data }) => fail(new VideoError(data === 100 ? 'youtubeUnavailable' : data === 101 || data === 150 ? 'youtubeEmbedding' : 'youtubePlayback',
            data === 100 ? 'This YouTube video is unavailable or private. Choose another video.' :
            data === 101 || data === 150 ? 'This YouTube video does not allow embedding. Choose another video.' :
            'YouTube could not play this video. Check your network and retry or choose another video.'
          ))
        }
      });
    } catch { fail(new VideoError('youtubeApi', 'YouTube player is unavailable. Retry the video.')); }
  });
}
