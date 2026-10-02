import { useControllerStore } from './ControllerStore';

/**
 * Scans for gamepads and sets up lifecycle-safe listeners.
 * Returns a cleanup function that must be called on unmount.
 */
export function listenForGamepadConnections(): () => void {
  const scanExistingGamepads = () => {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (gp && gp.connected) {
        // @ts-ignore - vibrationActuator is in W3C Gamepad Extensions
        const haptic = gp.vibrationActuator || null;
        useControllerStore.getState().setConnected(true, gp.id, gp.index, haptic);
        break; // Attach primary gamepad
      }
    }
  };

  // Immediate check on startup
  scanExistingGamepads();

  const handleConnected = (e: GamepadEvent) => {
    const gp = e.gamepad;
    // @ts-ignore
    const haptic = gp.vibrationActuator || null;
    useControllerStore.getState().setConnected(true, gp.id, gp.index, haptic);
  };

  const handleDisconnected = (e: GamepadEvent) => {
    const state = useControllerStore.getState().state;
    if (state.index === e.gamepad.index) {
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
