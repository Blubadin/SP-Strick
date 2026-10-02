import { describe, expect, it } from 'vitest';
import { RawGamepadSnapshotStore } from './RawGamepadSnapshot';

describe('RawGamepadSnapshotStore', () => {
  it('publishes detached raw buttons, axes, mapping, identity, and timestamp', () => {
    const store = new RawGamepadSnapshotStore();
    const listeners: unknown[] = [];
    store.subscribe(() => listeners.push(store.getSnapshot()));
    const gamepad = {
      id: 'Unmapped USB Pad',
      index: 2,
      mapping: '',
      connected: true,
      buttons: [
        { pressed: true, value: 0.75, touched: true },
        { pressed: false, value: 0, touched: false }
      ],
      axes: [-0.2, 0.8]
    } as unknown as Gamepad;

    const result = store.publish(gamepad, 1234);
    (gamepad as unknown as { axes: number[] }).axes[0] = 0.6;

    expect(result).toEqual({
      id: 'Unmapped USB Pad',
      index: 2,
      mapping: '',
      connected: true,
      timestamp: 1234,
      buttons: [
        { pressed: true, value: 0.75, touched: true },
        { pressed: false, value: 0, touched: false }
      ],
      axes: [-0.2, 0.8]
    });
    expect(store.getSnapshot()).toBe(result);
    expect(listeners).toEqual([result]);
  });

  it('notifies subscribers and clears the snapshot when the controller disconnects', () => {
    const store = new RawGamepadSnapshotStore();
    let notifications = 0;
    store.subscribe(() => notifications++);
    store.publish({
      id: 'Pad', index: 0, mapping: 'standard', connected: true, buttons: [], axes: []
    } as unknown as Gamepad, 1);

    store.reset();

    expect(store.getSnapshot()).toBeNull();
    expect(notifications).toBe(2);
  });
});
