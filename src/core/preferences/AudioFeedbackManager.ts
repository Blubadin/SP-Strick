export type AudioContextFactory = () => AudioContext | null;

function createBrowserAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextConstructor = window.AudioContext;
  return AudioContextConstructor ? new AudioContextConstructor() : null;
}

export class AudioFeedbackManager {
  private enabled = false;
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

  playCommitTone(): void {
    if (!this.enabled) return;

    try {
      this.context ||= this.createContext();
      if (!this.context) return;
      const context = this.context;
      if (context.state === 'suspended') void context.resume();

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime;
      const endAt = startAt + 0.055;

      oscillator.type = 'sine';
      oscillator.frequency.value = 740;
      gain.gain.setValueAtTime(0.035, startAt);
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
