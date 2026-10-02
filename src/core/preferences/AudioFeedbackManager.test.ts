import { describe, expect, it, vi } from 'vitest';
import { AudioFeedbackManager } from './AudioFeedbackManager';

function makeAudioContext() {
  const oscillator = {
    frequency: { value: 0 },
    type: 'sine',
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn()
  };
  const gain = {
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn()
    },
    connect: vi.fn()
  };
  const context = {
    currentTime: 1,
    destination: {},
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => gain),
    resume: vi.fn()
  };
  return { context, oscillator, gain };
}

describe('AudioFeedbackManager', () => {
  it('does not create audio or play a tone while feedback is disabled', () => {
    const factory = vi.fn(() => makeAudioContext().context as unknown as AudioContext);
    const manager = new AudioFeedbackManager(factory);
    manager.playCommitTone();
    expect(factory).not.toHaveBeenCalled();
  });

  it('plays a short quiet confirmation tone when enabled', () => {
    const { context, oscillator, gain } = makeAudioContext();
    const manager = new AudioFeedbackManager(() => context as unknown as AudioContext);
    manager.setEnabled(true);
    manager.playCommitTone();
    expect(context.createOscillator).toHaveBeenCalledOnce();
    expect(oscillator.frequency.value).toBe(740);
    expect(oscillator.start).toHaveBeenCalledOnce();
    expect(oscillator.stop).toHaveBeenCalledWith(1.055);
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.001, 1.055);
  });
});
