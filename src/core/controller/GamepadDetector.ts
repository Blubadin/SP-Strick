import { useControllerStore } from './ControllerStore';
import { resetPollerState } from './GamepadPoller';
import { rawGamepadSnapshotStore } from './RawGamepadSnapshot';

export function getConnectedGamepads(gamepads: ArrayLike<Gamepad | null>): Gamepad[] {
  return Array.from(gamepads).filter((gamepad): gamepad is Gamepad => Boolean(gamepad?.connected));
}

/**
 * Scans for gamepads and sets up lifecycle-safe listeners.
 * Returns a cleanup function that must be called on unmount.
 */
export function listenForGamepadConnections(): () => void {
  const scanExistingGamepads = () => {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const gp = getConnectedGamepads(navigator.getGamepads())[0];
    if (gp) {
      resetPollerState();
      rawGamepadSnapshotStore.reset();
      // @ts-ignore - vibrationActuator is in W3C Gamepad Extensions
      const haptic = gp.vibrationActuator || null;
      useControllerStore.getState().setConnected(true, gp.id, gp.index, haptic, gp.mapping);
    }
  };

  // Immediate check on startup
  scanExistingGamepads();

  const handleConnected = (e: GamepadEvent) => {
    const gp = e.gamepad;
    if (useControllerStore.getState().state.connected) return;
    resetPollerState();
    rawGamepadSnapshotStore.reset();
    // @ts-ignore
    const haptic = gp.vibrationActuator || null;
    useControllerStore.getState().setConnected(true, gp.id, gp.index, haptic, gp.mapping);
  };

  const handleDisconnected = (e: GamepadEvent) => {
    const state = useControllerStore.getState().state;
    if (state.index === e.gamepad.index) {
      resetPollerState();
      rawGamepadSnapshotStore.reset();
      useControllerStore.getState().setConnected(false, null, null, null);
      // Check if another gamepad is still connected
      scanExistingGamepads();
    }
  };

  window.addEventListener('gamepadconnected', handleConnected);
  window.addEventListener('gamepaddisconnected', handleDisconnected);

  return () => {
    window.removeEventListener('gamepadconnected', handleConnected);
    window.removeEventListener('gamepaddisconnected', handleDisconnected);
  };
}
