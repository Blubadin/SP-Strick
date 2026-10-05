import type { ScoutingEvent } from '../scouting/ScoutingEvent';
import { VideoError } from './VideoError';

export interface PlaybackAdapter {
  isReady(): boolean;
  getCurrentTimeMs(): number;
  getDurationMs(): number;
  isPlaying(): boolean;
  getPlaybackRate(): number;
  play(): void | Promise<void>;
  pause(): void;
  seek(timeMs: number): void | Promise<void>;
  setPlaybackRate(rate: number): void;
}
export class VideoPlayback {
  private active: { sourceId: string; adapter: PlaybackAdapter } | null = null;
  private activate: ((id: string) => Promise<void>) | null = null;
  private listeners = new Set<() => void>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  private publish(): void {
    for (const listener of this.listeners) {
      try { listener(); } catch { /* One surface cannot block other subscribers. */ }
    }
  }

  private syncPolling(): void {
    const shouldPoll = Boolean(this.listeners.size && this.active);
    if (shouldPoll && this.pollTimer === null) {
      this.pollTimer = setInterval(() => this.publish(), 150);
    } else if (!shouldPoll && this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    this.syncPolling();
    return () => {
      this.listeners.delete(listener);
      this.syncPolling();
    };
  }

  attach(sourceId: string, adapter: PlaybackAdapter): () => void {
    this.pause();
    const active = { sourceId, adapter };
    this.active = active;
    this.syncPolling();
    this.publish();
    return () => {
      if (this.active === active) {
        try { active.adapter.pause(); } catch { /* Media may already be removed. */ }
        this.active = null;
        this.syncPolling();
        this.publish();
      }
    };
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

  isReady(): boolean {
    try { return Boolean(this.active?.adapter.isReady()); } catch { return false; }
  }

  getCurrentTimeMs(): number {
    try {
      const time = this.active?.adapter.getCurrentTimeMs();
      return typeof time === 'number' && Number.isFinite(time) && time >= 0 ? time : 0;
    } catch { return 0; }
  }

  getDurationMs(): number {
    try {
      const duration = this.active?.adapter.getDurationMs();
      return typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : 0;
    } catch { return 0; }
  }

  isPlaying(): boolean {
    try { return Boolean(this.active?.adapter.isReady() && this.active.adapter.isPlaying()); } catch { return false; }
  }

  getPlaybackRate(): number {
    try {
      const rate = this.active?.adapter.getPlaybackRate();
      return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : 1;
    } catch { return 1; }
  }

  async play(): Promise<void> {
    const adapter = this.active?.adapter;
    if (!adapter?.isReady()) return;
    try { await adapter.play(); } catch { /* Autoplay and media failures do not affect scouting. */ }
    this.publish();
  }

  togglePlayback(): void {
    try {
      const adapter = this.active?.adapter;
      if (!adapter?.isReady()) return;
      if (adapter.isPlaying()) adapter.pause();
      else void this.play();
      this.publish();
    } catch { /* Video is optional during scouting. */ }
  }

  pause(): void {
    try { this.active?.adapter.pause(); } catch { /* Media may have been removed. */ }
    this.publish();
  }

  async seekTo(timeMs: number): Promise<void> {
    const adapter = this.active?.adapter;
    if (!adapter?.isReady() || !Number.isFinite(timeMs)) return;
    const duration = this.getDurationMs();
    const target = Math.max(0, duration > 0 ? Math.min(duration, timeMs) : timeMs);
    await adapter.seek(target);
    this.publish();
  }

  async seekBy(deltaMs: number): Promise<void> {
    if (!Number.isFinite(deltaMs)) return;
    await this.seekTo(this.getCurrentTimeMs() + deltaMs);
  }

  setPlaybackRate(rate: number): void {
    if (!Number.isFinite(rate) || rate < 0.25 || rate > 2) return;
    try {
      const adapter = this.active?.adapter;
      if (!adapter?.isReady()) return;
      adapter.setPlaybackRate(rate);
      this.publish();
    } catch { /* Unsupported playback-rate APIs degrade to the player default. */ }
  }

  async seekToEvent(event: Pick<ScoutingEvent, 'videoTimeMs' | 'videoSourceId'>): Promise<void> {
    if (event.videoTimeMs === undefined || !Number.isFinite(event.videoTimeMs) || event.videoTimeMs < 0) return;
    if (!event.videoSourceId) throw new VideoError('noEventSource', 'This event has no saved video source.');
    if (event.videoSourceId !== this.active?.sourceId) {
      if (!this.activate) throw new VideoError('sourceMissing', 'Video source is unavailable.');
      await this.activate(event.videoSourceId);
    }
    const active = this.active;
    if (active?.sourceId !== event.videoSourceId || !active.adapter.isReady()) throw new VideoError('sourceNotReady', 'Video source is not ready. Retry or reselect it.');
    await this.seekTo(event.videoTimeMs);
    this.pause();
  }
}
export const videoPlayback = new VideoPlayback();
