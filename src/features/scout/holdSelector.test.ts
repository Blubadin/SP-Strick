import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HoldSelectorEngine } from './holdSelector';

describe('HoldSelectorEngine', () => {
  let onCommit: ReturnType<typeof vi.fn<(item: string) => void>>;
  let onCancel: ReturnType<typeof vi.fn<() => void>>;
  let onHighlight: ReturnType<typeof vi.fn<(item: string | null) => void>>;
  let engine: HoldSelectorEngine<string>;

  beforeEach(() => {
    onCommit = vi.fn<(item: string) => void>();
    onCancel = vi.fn<() => void>();
    onHighlight = vi.fn<(item: string | null) => void>();
    engine = new HoldSelectorEngine<string>({
      onCommit,
      onCancel,
      onHighlight
    });
  });

  it('starts in CLOSED state and opens to HOLDING_IDLE without auto-selection', () => {
    expect(engine.getPhase()).toBe('CLOSED');
    expect(engine.isOpen()).toBe(false);

    engine.open('SKILL', 'FACE_SOUTH');
    expect(engine.getPhase()).toBe('HOLDING_IDLE');
    expect(engine.isOpen()).toBe(true);
    expect(engine.getCategory()).toBe('SKILL');
    expect(engine.getOpenerControl()).toBe('FACE_SOUTH');
    expect(engine.getCurrentSelection()).toBeNull();
    expect(engine.getLastHighlightedOption()).toBeNull();
    expect(onHighlight).toHaveBeenCalledWith(null);
  });

  it('stays open without any arbitrary auto-close timers while button is held', () => {
    engine.open('SKILL', 'FACE_SOUTH');
    expect(engine.isOpen()).toBe(true);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('previews selection when stick meets threshold and transitions to HOLDING_SELECTION', () => {
    engine.open('SKILL', 'FACE_SOUTH');

    // Sub-threshold movement (< 0.45)
    engine.updateStick({ x: 0.2, y: 0.2, magnitude: 0.28, angle: 45 }, () => 'attack');
    expect(engine.getPhase()).toBe('HOLDING_IDLE');
    expect(engine.getLastHighlightedOption()).toBeNull();

    // Intentional movement (>= 0.45)
    engine.updateStick({ x: 0.7, y: 0, magnitude: 0.7, angle: 0 }, () => 'attack');
    expect(engine.getPhase()).toBe('HOLDING_SELECTION');
    expect(engine.getLastHighlightedOption()).toBe('attack');
    expect(onHighlight).toHaveBeenCalledWith('attack');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('DOES NOT commit or clear selection when stick returns to neutral', () => {
    engine.open('SKILL', 'FACE_SOUTH');
    engine.updateStick({ x: 0.8, y: 0, magnitude: 0.8, angle: 0 }, () => 'attack');
    expect(engine.getLastHighlightedOption()).toBe('attack');

    // Stick returns to center (neutral)
    engine.updateStick({ x: 0, y: 0, magnitude: 0, angle: 0 }, () => null);

    // Hard requirement: must remain previewing attack, must NOT commit
    expect(engine.isOpen()).toBe(true);
    expect(engine.getLastHighlightedOption()).toBe('attack');
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('updates preview if stick moves to another option after returning neutral', () => {
    engine.open('SKILL', 'FACE_SOUTH');
    engine.updateStick({ x: 0.8, y: 0, magnitude: 0.8, angle: 0 }, () => 'attack');
    expect(engine.getLastHighlightedOption()).toBe('attack');

    // Return to neutral
    engine.updateStick({ x: 0, y: 0, magnitude: 0, angle: 0 }, () => null);
    expect(engine.getLastHighlightedOption()).toBe('attack');

    // Move to block
    engine.updateStick({ x: -0.8, y: 0, magnitude: 0.8, angle: 180 }, () => 'block');
    expect(engine.getLastHighlightedOption()).toBe('block');
    expect(onHighlight).toHaveBeenCalledWith('block');

    // Return to neutral again
    engine.updateStick({ x: 0, y: 0, magnitude: 0, angle: 0 }, () => null);
    expect(engine.getLastHighlightedOption()).toBe('block');

    // Releasing opener commits 'block'
    engine.onOpenerReleased();
    expect(onCommit).toHaveBeenCalledWith('block');
    expect(engine.isOpen()).toBe(false);
  });

  it('commits last highlighted option only when opener button is released', () => {
    engine.open('SKILL', 'FACE_SOUTH');
    engine.updateStick({ x: 0.7, y: 0, magnitude: 0.7, angle: 0 }, () => 'attack');
    expect(onCommit).not.toHaveBeenCalled();

    // Release face button A
    engine.onOpenerReleased();
    expect(onCommit).toHaveBeenCalledWith('attack');
    expect(engine.isOpen()).toBe(false);
    expect(engine.getPhase()).toBe('CLOSED');
  });

  it('cancels without committing on quick tap when no stick selection was made', () => {
    engine.open('SKILL', 'FACE_SOUTH');
    // Button pressed and immediately released without moving stick
    engine.onOpenerReleased();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    expect(engine.isOpen()).toBe(false);
    expect(engine.getPhase()).toBe('CLOSED');
  });

  it('uses zone-specific threshold (0.35) when isZone is true', () => {
    engine.open('ZONE', 'FACE_WEST', true);

    // 0.40 is >= 0.35
    engine.updateStick({ x: 0.4, y: 0.1, magnitude: 0.41, angle: 0 }, () => '4');
    expect(engine.getPhase()).toBe('HOLDING_SELECTION');
    expect(engine.getLastHighlightedOption()).toBe('4');

    engine.onOpenerReleased();
    expect(onCommit).toHaveBeenCalledWith('4');
  });

  it('explicitly cancels when cancel() is called (e.g. MENU press or disconnect)', () => {
    engine.open('SKILL', 'FACE_SOUTH');
    engine.updateStick({ x: 0.8, y: 0, magnitude: 0.8, angle: 0 }, () => 'attack');

    engine.cancel();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    expect(engine.isOpen()).toBe(false);
  });
});
