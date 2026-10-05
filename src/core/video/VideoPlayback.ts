import type { ScoutingEvent } from '../scouting/ScoutingEvent';
import { VideoError } from './VideoError';

export interface PlaybackAdapter {
  isReady(): boolean;
  getCurrentTimeMs(): number;
  isPlaying(): boolean;
  play(): void | Promise<void>;
  pause(): void;
  seek(timeMs: number): void | Promise<void>;
}
export class VideoPlayback {
  private active: { sourceId: string; adapter: PlaybackAdapter } | null = null;
  private activate: ((id: string) => Promise<void>) | null = null;

  attach(sourceId: string, adapter: PlaybackAdapter): () => void {
    this.pause();
    const active = { sourceId, adapter };
    this.active = active;
    return () => { if (this.active === active) { this.pause(); this.active = null; } };
  }

  registerSourceActivator(activate: (id: string) => Promise<void>): () => void {
    this.activate = activate;
    return () => { if (this.activate === activate) this.activate = null; };
  }

  getEventTiming(): { videoTimeMs?: number; videoSourceId?: string } {
    try {
      if (!this.active?.adapter.isReady()) return {};
      const time = this.active.adapter.getCurrentTimeMs();
      if (!Number.isFinite(time) || time < 0) return {};
      return { videoTimeMs: Math.round(time), videoSourceId: this.active.sourceId };
    } catch { return {}; }
  }

  togglePlayback(): void {
    try {
      const adapter = this.active?.adapter;
      if (!adapter?.isReady()) return;
      if (adapter.isPlaying()) adapter.pause();
      else void Promise.resolve(adapter.play()).catch(() => {});
    } catch { /* Video is optional during scouting. */ }
  }

  pause(): void { try { this.active?.adapter.pause(); } catch { /* Media may have been removed. */ } }

  async seekToEvent(event: Pick<ScoutingEvent, 'videoTimeMs' | 'videoSourceId'>): Promise<void> {
    if (event.videoTimeMs === undefined || !Number.isFinite(event.videoTimeMs) || event.videoTimeMs < 0) return;
    if (!event.videoSourceId) throw new VideoError('noEventSource', 'This event has no saved video source.');
    if (event.videoSourceId !== this.active?.sourceId) {
      if (!this.activate) throw new VideoError('sourceMissing', 'Video source is unavailable.');
      await this.activate(event.videoSourceId);
    }
    const active = this.active;
    if (active?.sourceId !== event.videoSourceId || !active.adapter.isReady()) throw new VideoError('sourceNotReady', 'Video source is not ready. Retry or reselect it.');
    this.pause();
    await active.adapter.seek(event.videoTimeMs);
    active.adapter.pause();
  }
}
export const videoPlayback = new VideoPlayback();
