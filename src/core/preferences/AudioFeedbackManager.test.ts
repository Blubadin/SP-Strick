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
    state: 'running',
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
    manager.setEnabled(false);
    manager.playCommitTone();
    expect(factory).not.toHaveBeenCalled();
  });

  it('enables feedback by default and reports readiness after unlocking', async () => {
    const { context } = makeAudioContext();
    const manager = new AudioFeedbackManager(() => context as unknown as AudioContext);
    expect(manager.isEnabled()).toBe(true);
    expect(manager.isReady()).toBe(false);
    expect(await manager.unlock()).toBe(true);
    expect(manager.isReady()).toBe(true);
  });

  it('waits for suspended audio to resume before scheduling a tone', async () => {
    const { context } = makeAudioContext();
    context.state = 'suspended';
    let resolveResume!: () => void;
    context.resume = vi.fn(() => new Promise<void>((resolve) => { resolveResume = () => { context.state = 'running'; resolve(); }; })) as typeof context.resume;
    const manager = new AudioFeedbackManager(() => context as unknown as AudioContext);
    manager.setEnabled(true);
    manager.playCommitTone();
    expect(context.createOscillator).not.toHaveBeenCalled();
    resolveResume(); await Promise.resolve(); await Promise.resolve();
    expect(context.createOscillator).toHaveBeenCalledOnce();
  });

  it('reports blocked audio and safely handles unsupported contexts', async () => {
    const { context } = makeAudioContext(); context.state = 'suspended';
    context.resume = vi.fn(async () => { throw new Error('blocked'); }) as typeof context.resume;
    const manager = new AudioFeedbackManager(() => context as unknown as AudioContext);
    expect(await manager.unlock()).toBe(false);
    manager.playCommitTone(); await Promise.resolve(); await Promise.resolve();
    expect(context.createOscillator).not.toHaveBeenCalled();
    expect(await new AudioFeedbackManager(() => null).unlock()).toBe(false);
  });

  it('clamps volume and uses it for the confirmation tone', () => {
    const { context, gain } = makeAudioContext();
    const manager = new AudioFeedbackManager(() => context as unknown as AudioContext);
    manager.setVolume(0.5); manager.playCommitTone();
    expect(gain.gain.setValueAtTime).toHaveBeenLastCalledWith(0.025, 1);
    manager.setVolume(2); manager.playCommitTone();
    expect(gain.gain.setValueAtTime).toHaveBeenLastCalledWith(0.05, 1);
    manager.setVolume(0); manager.playCommitTone();
    expect(context.createOscillator).toHaveBeenCalledTimes(2);
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
