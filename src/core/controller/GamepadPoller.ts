import { useControllerStore } from './ControllerStore';
import { ButtonStateMachine, hasButtonFrameEdges } from './ButtonStateMachine';
import { applyDeadzone } from './StickNormalizer';
import { intentDispatcher } from './ControllerIntent';
import { hapticManager } from './HapticManager';
import { rawGamepadSnapshotStore } from './RawGamepadSnapshot';
import type { AxisState } from './ControllerTypes';

let pollingFrame: number | null = null;
const buttonStateMachine = new ButtonStateMachine();
let lastLeftStick: AxisState = { x: 0, y: 0, magnitude: 0, angle: 0 };
let lastRightStick: AxisState = { x: 0, y: 0, magnitude: 0, angle: 0 };
let lastControllerKey: string | null = null;

function stickSignificantlyChanged(current: AxisState, previous: AxisState): boolean {
  return Math.abs(current.x - previous.x) > 0.02 || Math.abs(current.y - previous.y) > 0.02;
}

export function startGamepadPolling(): void {
  if (pollingFrame !== null) return;

  const poll = () => {
    const { state, profile, updateState } = useControllerStore.getState();

    if (state.connected && state.index !== null && typeof navigator !== 'undefined') {
      const gamepads = navigator.getGamepads();
      const gp = gamepads[state.index];

      if (gp && gp.connected) {
        rawGamepadSnapshotStore.publish(gp);

        const controllerKey = `${gp.index}:${gp.id}:${profile.id}`;
        if (controllerKey !== lastControllerKey) {
          buttonStateMachine.reset();
          lastLeftStick = { x: 0, y: 0, magnitude: 0, angle: 0 };
          lastRightStick = { x: 0, y: 0, magnitude: 0, angle: 0 };
          lastControllerKey = controllerKey;
        }

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

        // Track both sticks locally; only the selected controller snapshot is updated.
        const leftStickChanged = stickSignificantlyChanged(leftStick, lastLeftStick);
        const rightStickChanged = stickSignificantlyChanged(rightStick, lastRightStick);

        if (leftStickChanged) lastLeftStick = leftStick;
        if (rightStickChanged) lastRightStick = rightStick;

        // Frame flags are one-poll events; publish one clearing snapshot after each edge.
        if (buttonsChanged || leftStickChanged || rightStickChanged || hasButtonFrameEdges(state.buttons)) {
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
        resetPollerState();
        rawGamepadSnapshotStore.reset();
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
  lastLeftStick = { x: 0, y: 0, magnitude: 0, angle: 0 };
  lastRightStick = { x: 0, y: 0, magnitude: 0, angle: 0 };
  lastControllerKey = null;
}
