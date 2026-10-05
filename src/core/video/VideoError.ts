export type VideoErrorCode = 'localPermission' | 'localUnavailable' | 'localUnsupported' | 'localTimeout' | 'youtubeNetwork' | 'youtubeTimeout' | 'youtubeApi' | 'youtubeUnavailable' | 'youtubeEmbedding' | 'youtubePlayback' | 'sourceMissing' | 'sourceNotReady' | 'noEventSource';

/** Stable codes let the UI translate browser and provider failures. */
export class VideoError extends Error {
  readonly code: VideoErrorCode;
  constructor(code: VideoErrorCode, message: string) {
    super(message);
    this.name = 'VideoError';
    this.code = code;
  }
}
