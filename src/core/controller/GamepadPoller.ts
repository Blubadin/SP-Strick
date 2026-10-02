import { useControllerStore } from './ControllerStore';
import { ButtonStateMachine } from './ButtonStateMachine';
import { applyDeadzone } from './StickNormalizer';
import { intentDispatcher } from './ControllerIntent';
import { hapticManager } from './HapticManager';

let pollingFrame: number | null = null;
const buttonStateMachine = new ButtonStateMachine();

let lastLeftAngle = 0;
let lastLeftMag = 0;

export function startGamepadPolling(): void {
  if (pollingFrame !== null) return;

  const poll = () => {
    const { state, profile, updateState } = useControllerStore.getState();

    if (state.connected && state.index !== null && typeof navigator !== 'undefined') {
      const gamepads = navigator.getGamepads();
      const gp = gamepads[state.index];

      if (gp && gp.connected) {
        // 1. Process Buttons with edge detection
        const { buttons, hasChanged: buttonsChanged } = buttonStateMachine.update(
          gp.buttons,
          profile.buttons
        );

        // 2. Process Sticks with deadzone and inversion
        const leftStick = applyDeadzone(
          gp.axes[profile.leftStick.xAxis] ?? 0,
          gp.axes[profile.leftStick.yAxis] ?? 0,
          profile.leftStick.deadzone,
          profile.leftStick.invertX,
          profile.leftStick.invertY
        );

        const rightStick = profile.rightStick
          ? applyDeadzone(
              gp.axes[profile.rightStick.xAxis] ?? 0,
              gp.axes[profile.rightStick.yAxis] ?? 0,
              profile.rightStick.deadzone,
              profile.rightStick.invertX,
              profile.rightStick.invertY
            )
          : { x: 0, y: 0, magnitude: 0, angle: 0 };

        // 3. Stick movement significance check (to prevent 60fps renders when idle)
        const stickSignificantlyChanged =
          Math.abs(leftStick.magnitude - lastLeftMag) > 0.02 ||
          (leftStick.magnitude > 0.1 && Math.abs(leftStick.angle - lastLeftAngle) > 2) ||
          (lastLeftMag > 0 && leftStick.magnitude === 0);

        if (stickSignificantlyChanged) {
          lastLeftMag = leftStick.magnitude;
          lastLeftAngle = leftStick.angle;
        }

        // 4. Update React store ONLY when there is a meaningful state change
        if (buttonsChanged || stickSignificantlyChanged) {
          updateState({
            buttons,
            leftStick,
            rightStick
          });
        }

        // 5. Emit semantic intents
        if (buttons.FACE_SOUTH.pressedThisFrame) {
          intentDispatcher.dispatch({ type: 'OPEN_RADIAL', category: 'SKILL' });
        }
        if (buttons.FACE_WEST.pressedThisFrame) {
          intentDispatcher.dispatch({ type: 'OPEN_RADIAL', category: 'ZONE' });
        }
        if (buttons.FACE_EAST.pressedThisFrame) {
          intentDispatcher.dispatch({ type: 'OPEN_RADIAL', category: 'RESULT' });
        }
        if (buttons.FACE_NORTH.pressedThisFrame) {
          intentDispatcher.dispatch({ type: 'OPEN_RADIAL', category: 'TEAM_PLAYER' });
        }

        // Quick Controls
        if (buttons.LEFT_BUMPER.pressedThisFrame) {
          hapticManager.tick(gp);
          intentDispatcher.dispatch({ type: 'SELECT_TEAM_A' });
        }
        if (buttons.RIGHT_BUMPER.pressedThisFrame) {
          hapticManager.tick(gp);
          intentDispatcher.dispatch({ type: 'SELECT_TEAM_B' });
        }

        if (buttons.DPAD_UP.pressedThisFrame) {
          intentDispatcher.dispatch({ type: 'QUICK_RESULT_POSITIVE' });
        }
        if (buttons.DPAD_RIGHT.pressedThisFrame) {
          intentDispatcher.dispatch({ type: 'QUICK_RESULT_NEUTRAL' });
        }
        if (buttons.DPAD_DOWN.pressedThisFrame) {
          intentDispatcher.dispatch({ type: 'QUICK_RESULT_NEGATIVE' });
        }

        if (buttons.DPAD_LEFT.pressedThisFrame || buttons.VIEW.pressedThisFrame) {
          hapticManager.warning(gp);
          intentDispatcher.dispatch({ type: 'UNDO_LAST_EVENT' });
        }

        if (buttons.MENU.pressedThisFrame) {
          intentDispatcher.dispatch({ type: 'PAUSE_SESSION' });
        }

        if (buttons.LEFT_STICK_BUTTON.pressedThisFrame) {
          intentDispatcher.dispatch({ type: 'EDIT_LAST_EVENT' });
        }

        if (buttons.RIGHT_STICK_BUTTON.pressedThisFrame) {
          hapticManager.tick(gp);
          intentDispatcher.dispatch({ type: 'BOOKMARK_MOMENT' });
        }
      } else {
        // Disconnected mid-polling
        buttonStateMachine.reset();
      }
    }

    pollingFrame = requestAnimationFrame(poll);
  };

  pollingFrame = requestAnimationFrame(poll);
}

export function stopGamepadPolling(): void {
  if (pollingFrame !== null) {
    cancelAnimationFrame(pollingFrame);
    pollingFrame = null;
  }
  buttonStateMachine.reset();
}

/**
 * Resets poller internal button history.
 */
export function resetPollerState(): void {
  buttonStateMachine.reset();
  lastLeftAngle = 0;
  lastLeftMag = 0;
}
