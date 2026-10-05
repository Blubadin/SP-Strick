export type AudioContextFactory = () => AudioContext | null;

function createBrowserAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextConstructor = window.AudioContext;
  return AudioContextConstructor ? new AudioContextConstructor() : null;
}

export class AudioFeedbackManager {
  private enabled = true;
  private volume = 0.7;
  private listeners = new Set<() => void>();
  private context: AudioContext | null = null;
  private readonly createContext: AudioContextFactory;

  constructor(createContext: AudioContextFactory = createBrowserAudioContext) {
    this.createContext = createContext;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setVolume(volume: number): void {
    if (Number.isFinite(volume)) this.volume = Math.min(1, Math.max(0, volume));
  }

  isReady(): boolean { return this.context?.state === 'running'; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void { this.listeners.forEach((listener) => listener()); }

  private getContext(): AudioContext | null {
    if (!this.context) {
      this.context = this.createContext();
      this.context?.addEventListener?.('statechange', () => this.notify());
    }
    return this.context;
  }

  async unlock(): Promise<boolean> {
    try {
      const context = this.getContext();
      if (context && context.state !== 'running') await context.resume();
      this.notify();
      return this.isReady();
    } catch { this.notify(); return false; }
  }

  playCommitTone(): void {
    if (!this.enabled || this.volume === 0) return;

    try {
      const context = this.getContext();
      if (!context) return;
      if (context.state !== 'running') {
        void this.unlock().then((ready) => { if (ready && this.enabled && this.volume > 0) this.scheduleTone(context); });
        return;
      }
      this.scheduleTone(context);
    } catch { this.notify(); }
  }

  private scheduleTone(context: AudioContext): void {
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime;
      const endAt = startAt + 0.055;

      oscillator.type = 'sine';
      oscillator.frequency.value = 740;
      gain.gain.setValueAtTime(0.05 * this.volume, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, endAt);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(endAt);
    } catch {
      // Audio feedback is optional and must never interfere with a saved event.
    }
  }
}

export const audioFeedbackManager = new AudioFeedbackManager();
