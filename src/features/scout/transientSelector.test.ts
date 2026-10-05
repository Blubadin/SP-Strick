import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransientSelectorEngine, TRANSIENT_SELECTOR_CONFIG } from './transientSelector';

describe('TransientSelectorEngine', () => {
  let onCommit: ReturnType<typeof vi.fn<(item: string) => void>>;
  let onCancel: ReturnType<typeof vi.fn<() => void>>;
  let onHighlight: ReturnType<typeof vi.fn<(item: string | null) => void>>;
  let engine: TransientSelectorEngine<string>;

  beforeEach(() => {
    vi.useFakeTimers();
    onCommit = vi.fn<(item: string) => void>();
    onCancel = vi.fn<() => void>();
    onHighlight = vi.fn<(item: string | null) => void>();
    engine = new TransientSelectorEngine<string>({
      onCommit,
      onCancel,
      onHighlight
    });
  });

  afterEach(() => {
    engine.destroy();
    vi.useRealTimers();
  });

  it('starts in CLOSED state and opens to OPEN_WAITING without auto-selection', () => {
    expect(engine.getPhase()).toBe('CLOSED');
    expect(engine.isOpen()).toBe(false);

    engine.open('SKILL');
    expect(engine.getPhase()).toBe('OPEN_WAITING');
    expect(engine.isOpen()).toBe(true);
    expect(engine.getCategory()).toBe('SKILL');
    expect(engine.getCurrentSelection()).toBeNull();
    expect(engine.getLastValidSelection()).toBeNull();
    expect(onHighlight).toHaveBeenCalledWith(null);
  });

  it('cancels automatically after 1000ms idle timeout if stick is not moved', () => {
    engine.open('SKILL');
    expect(engine.isOpen()).toBe(true);

    vi.advanceTimersByTime(999);
    expect(engine.isOpen()).toBe(true);
    expect(onCancel).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(engine.isOpen()).toBe(false);
    expect(engine.getPhase()).toBe('CLOSED');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('arms when stick magnitude meets arm threshold and cancels idle timeout', () => {
    engine.open('SKILL');

    // Sub-threshold movement (< 0.55) does not arm
    engine.updateStick({ x: 0.3, y: 0.3, magnitude: 0.42, angle: 45 }, () => 'option-1');
    expect(engine.getPhase()).toBe('OPEN_WAITING');

    // Intentional movement (>= 0.55) arms
    engine.updateStick({ x: 0.6, y: 0.6, magnitude: 0.85, angle: 45 }, () => 'option-1');
    expect(engine.getPhase()).toBe('ARMED');
    expect(engine.getCurrentSelection()).toBe('option-1');
    expect(engine.getLastValidSelection()).toBe('option-1');
    expect(onHighlight).toHaveBeenCalledWith('option-1');

    // Advance past 1000ms idle timeout — should NOT cancel because armed
    vi.advanceTimersByTime(1500);
    expect(engine.isOpen()).toBe(true);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('commits last valid selection when armed stick returns to neutral for 90ms', () => {
    engine.open('SKILL');
    // Arm
    engine.updateStick({ x: 0.7, y: 0, magnitude: 0.7, angle: 0 }, () => 'attack');
    expect(engine.getPhase()).toBe('ARMED');

    // Return to neutral (< 0.22)
    engine.updateStick({ x: 0.1, y: 0.05, magnitude: 0.11, angle: 0 }, () => null);
    expect(engine.getPhase()).toBe('RETURNING');

    // Before 90ms, not committed yet
    vi.advanceTimersByTime(89);
    expect(onCommit).not.toHaveBeenCalled();
    expect(engine.isOpen()).toBe(true);

    // At 90ms, commits immediately and closes
    vi.advanceTimersByTime(1);
    expect(onCommit).toHaveBeenCalledWith('attack');
    expect(engine.isOpen()).toBe(false);
    expect(engine.getPhase()).toBe('CLOSED');
  });

  it('cancels return to neutral if stick moves out of neutral before 90ms', () => {
    engine.open('SKILL');
    engine.updateStick({ x: 0.7, y: 0, magnitude: 0.7, angle: 0 }, () => 'attack');
    expect(engine.getPhase()).toBe('ARMED');

    // Return to neutral
    engine.updateStick({ x: 0, y: 0, magnitude: 0, angle: 0 }, () => null);
    expect(engine.getPhase()).toBe('RETURNING');

    // Before 90ms expires, stick is moved back out to a new option
    vi.advanceTimersByTime(50);
    engine.updateStick({ x: -0.8, y: 0, magnitude: 0.8, angle: 180 }, () => 'block');
    expect(engine.getPhase()).toBe('ARMED');
    expect(engine.getLastValidSelection()).toBe('block');

    // Even after another 50ms, no commit occurred from earlier neutral
    vi.advanceTimersByTime(50);
    expect(onCommit).not.toHaveBeenCalled();

    // Now return to neutral again
    engine.updateStick({ x: 0, y: 0, magnitude: 0, angle: 0 }, () => null);
    expect(engine.getPhase()).toBe('RETURNING');

    vi.advanceTimersByTime(90);
    expect(onCommit).toHaveBeenCalledWith('block');
  });

  it('uses zone-specific lower arm threshold (0.35) when isZone is true', () => {
    engine.open('ZONE', true);

    // 0.40 is >= 0.35, so it arms
    engine.updateStick({ x: 0.4, y: 0.1, magnitude: 0.41, angle: 0 }, () => '4');
    expect(engine.getPhase()).toBe('ARMED');
    expect(engine.getLastValidSelection()).toBe('4');
  });

  it('triggers failsafe timeout after 3500ms of being armed without neutral return', () => {
    engine.open('SKILL');
    engine.updateStick({ x: 0.8, y: 0, magnitude: 0.8, angle: 0 }, () => 'serve');
    expect(engine.getPhase()).toBe('ARMED');

    vi.advanceTimersByTime(TRANSIENT_SELECTOR_CONFIG.FAILSAFE_TIMEOUT_MS);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(engine.isOpen()).toBe(false);
  });

  it('explicitly cancels when cancel() is called', () => {
    engine.open('SKILL');
    engine.cancel();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(engine.isOpen()).toBe(false);
  });
});
