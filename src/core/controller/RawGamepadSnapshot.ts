export interface RawGamepadButtonSnapshot {
  pressed: boolean;
  value: number;
  touched: boolean;
}

export interface RawGamepadSnapshot {
  id: string;
  index: number;
  mapping: Gamepad['mapping'];
  connected: boolean;
  timestamp: number;
  buttons: RawGamepadButtonSnapshot[];
  axes: number[];
}

export type RawGamepadSnapshotListener = () => void;

/** A small external store for raw hardware state, independent from semantic intents. */
export class RawGamepadSnapshotStore {
  private snapshot: RawGamepadSnapshot | null = null;
  private listeners = new Set<RawGamepadSnapshotListener>();

  public getSnapshot = (): RawGamepadSnapshot | null => this.snapshot;

  public subscribe = (listener: RawGamepadSnapshotListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public publish(gamepad: Gamepad, timestamp: number = Date.now()): RawGamepadSnapshot {
    const snapshot: RawGamepadSnapshot = {
      id: gamepad.id,
      index: gamepad.index,
      mapping: gamepad.mapping,
      connected: gamepad.connected,
      timestamp,
      buttons: Array.from(gamepad.buttons, (button) => ({
        pressed: button.pressed,
        value: button.value,
        touched: button.touched
      })),
      axes: Array.from(gamepad.axes)
    };
    this.snapshot = snapshot;
    this.notify();
    return snapshot;
  }

  public reset(): void {
    this.snapshot = null;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error('Error in raw gamepad snapshot listener:', error);
      }
    }
  }
}

export const rawGamepadSnapshotStore = new RawGamepadSnapshotStore();
export const getRawGamepadSnapshot = rawGamepadSnapshotStore.getSnapshot;
export const subscribeRawGamepadSnapshot = rawGamepadSnapshotStore.subscribe;
