import { describe, expect, it } from 'vitest';
import { getConnectedGamepads } from './GamepadDetector';

describe('connected gamepad discovery', () => {
  it('lists every connected device in slot order and skips empty or disconnected slots', () => {
    const first = { index: 0, id: 'Pad A', connected: true } as Gamepad;
    const second = { index: 2, id: 'Pad B', connected: true } as Gamepad;
    const missing = { index: 1, id: 'Old Pad', connected: false } as Gamepad;

    expect(getConnectedGamepads([first, null, missing, second])).toEqual([first, second]);
  });
});
