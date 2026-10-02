import { useControllerStore } from './ControllerStore';

export function listenForGamepadConnections() {
  window.addEventListener("gamepadconnected", (e) => {
    const gp = e.gamepad;
    // @ts-ignore
    const haptic = gp.vibrationActuator || null;
    useControllerStore.getState().setConnected(true, gp.id, gp.index, haptic);
  });

  window.addEventListener("gamepaddisconnected", (e) => {
    const state = useControllerStore.getState().state;
    if (state.index === e.gamepad.index) {
      useControllerStore.getState().setConnected(false, null, null, null);
    }
  });
}
