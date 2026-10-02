import { useControllerStore } from './ControllerStore';
import type { SemanticControl, AxisState } from './ControllerTypes';

let pollingFrame: number | null = null;
let lastButtons: Record<number, boolean> = {};

function applyDeadzone(x: number, y: number, deadzone: number): AxisState {
  let mag = Math.sqrt(x*x + y*y);
  if (mag < deadzone) {
    return { x: 0, y: 0, magnitude: 0, angle: 0 };
  }
  let normalizedMag = (mag - deadzone) / (1 - deadzone);
  if (normalizedMag > 1) normalizedMag = 1;
  let angle = Math.atan2(y, x) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  // Gamepad Y is inverted (up is -1). We usually want Up as 270 or 90 depending on convention.
  // Standard Math.atan2: Right=0, Down=90, Left=180, Up=270 (if y is positive-down).
  return { x: (x/mag)*normalizedMag, y: (y/mag)*normalizedMag, magnitude: normalizedMag, angle };
}

export function startGamepadPolling() {
  const poll = () => {
    const { state, profile, updateState } = useControllerStore.getState();
    if (state.connected && state.index !== null) {
      const gp = navigator.getGamepads()[state.index];
      if (gp) {
        const newButtons = { ...state.buttons };
        
        Object.entries(profile.mapping).forEach(([semantic, physical]) => {
          const physIdx = physical as number;
          const btn = gp.buttons[physIdx];
          const isPressed = btn ? (typeof btn === 'object' ? btn.pressed : btn > 0) : false;
          const wasPressed = lastButtons[physIdx] || false;
          
          newButtons[semantic as SemanticControl] = {
            pressed: isPressed,
            pressedThisFrame: isPressed && !wasPressed,
            releasedThisFrame: !isPressed && wasPressed,
            held: isPressed && wasPressed
          };
          
          lastButtons[physIdx] = isPressed;
        });

        const leftX = gp.axes[profile.leftStickIndexX] || 0;
        const leftY = gp.axes[profile.leftStickIndexY] || 0;
        const rightX = gp.axes[profile.rightStickIndexX] || 0;
        const rightY = gp.axes[profile.rightStickIndexY] || 0;

        const leftStick = applyDeadzone(leftX, leftY, profile.deadzone);
        const rightStick = applyDeadzone(rightX, rightY, profile.deadzone);

        updateState({ buttons: newButtons, leftStick, rightStick });
        
        // Dispatch custom events for semantic intents if needed, or state machine will read from store
      }
    }
    pollingFrame = requestAnimationFrame(poll);
  };
  pollingFrame = requestAnimationFrame(poll);
}

export function stopGamepadPolling() {
  if (pollingFrame !== null) {
    cancelAnimationFrame(pollingFrame);
    pollingFrame = null;
  }
}

export function triggerHaptic(duration: number = 100, strong: number = 0.5, weak: number = 0.5) {
  const state = useControllerStore.getState().state;
  if (state.hapticActuator) {
    // @ts-ignore
    state.hapticActuator.playEffect("dual-rumble", {
      startDelay: 0,
      duration: duration,
      weakMagnitude: weak,
      strongMagnitude: strong
    }).catch(() => {}); // ignore if failed
  }
}
