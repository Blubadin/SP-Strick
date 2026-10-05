import { useControllerStore } from './ControllerStore';
import { ButtonStateMachine, hasButtonFrameEdges } from './ButtonStateMachine';
import { applyDeadzone } from './StickNormalizer';
import { intentDispatcher } from './ControllerIntent';
import { hapticManager } from './HapticManager';
import { rawGamepadSnapshotStore } from './RawGamepadSnapshot';
import { usePreferencesStore } from '../preferences/PreferencesStore';
import { gameplayActionIntent } from './GameplayBindings';
import { ALL_SEMANTIC_CONTROLS } from './ButtonStateMachine';
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

        // Gameplay assignments use semantic controls; physical calibration remains in the profile.
        const bindings = usePreferencesStore.getState().gameplayBindings;
        for (const control of ALL_SEMANTIC_CONTROLS) {
          if (!buttons[control].pressedThisFrame) continue;
          const actionIntent = gameplayActionIntent(bindings[control]);
          const intent = actionIntent.type === 'OPEN_RADIAL' ? { ...actionIntent, control } : actionIntent;
          if (intent.type === 'UNDO_LAST_EVENT') hapticManager.warning(gp);
          else if (intent.type === 'SELECT_TEAM_A' || intent.type === 'SELECT_TEAM_B' || intent.type === 'BOOKMARK_MOMENT') hapticManager.tick(gp);
          intentDispatcher.dispatch(intent);
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
