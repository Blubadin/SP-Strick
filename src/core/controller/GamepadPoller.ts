import { useControllerStore } from './ControllerStore';
import { ButtonStateMachine, hasButtonFrameEdges, ALL_SEMANTIC_CONTROLS } from './ButtonStateMachine';
import { applyDeadzone } from './StickNormalizer';
import { intentDispatcher, type ControllerIntent } from './ControllerIntent';
import { hapticManager } from './HapticManager';
import { rawGamepadSnapshotStore } from './RawGamepadSnapshot';
import { usePreferencesStore } from '../preferences/PreferencesStore';
import { DEFAULT_GAMEPLAY_BINDINGS, gameplayActionIntent } from './GameplayBindings';
import type { AxisState, SemanticControl } from './ControllerTypes';

let pollingFrame: number | null = null;
const buttonStateMachine = new ButtonStateMachine();
let lastLeftStick: AxisState = { x: 0, y: 0, magnitude: 0, angle: 0 };
let lastRightStick: AxisState = { x: 0, y: 0, magnitude: 0, angle: 0 };
let lastControllerKey: string | null = null;
let videoModifierActive = false;
let videoModifierStartedAt = 0;
let videoModifierChordUsed = false;
let videoModifierContextEnabled = true;

const VIDEO_CONTROL_INTENTS: Partial<Record<SemanticControl, ControllerIntent>> = {
  DPAD_LEFT: { type: 'VIDEO_CONTROL_SEEK', deltaMs: -3000 },
  DPAD_RIGHT: { type: 'VIDEO_CONTROL_SEEK', deltaMs: 3000 },
  FACE_WEST: { type: 'VIDEO_CONTROL_SEEK', deltaMs: -1000 },
  FACE_EAST: { type: 'VIDEO_CONTROL_SEEK', deltaMs: 1000 },
  FACE_SOUTH: { type: 'VIDEO_CONTROL_TOGGLE' },
  FACE_NORTH: { type: 'VIDEO_CONTROL_CYCLE_RATE' }
};

function stickSignificantlyChanged(current: AxisState, previous: AxisState): boolean {
  return Math.abs(current.x - previous.x) > 0.02 || Math.abs(current.y - previous.y) > 0.02;
}

function endVideoModifier(): void {
  if (!videoModifierActive) return;
  videoModifierActive = false;
  videoModifierStartedAt = 0;
  videoModifierChordUsed = false;
  intentDispatcher.dispatch({ type: 'VIDEO_CONTROL_EXIT' });
}

export function setVideoModifierContextEnabled(enabled: boolean): void {
  videoModifierContextEnabled = enabled;
}

export function startGamepadPolling(): void {
  if (pollingFrame !== null) return;

  const poll = (timestamp: number) => {
    const { state, profile, updateState } = useControllerStore.getState();

    if (state.connected && state.index !== null && typeof navigator !== 'undefined') {
      const gamepads = navigator.getGamepads();
      const gp = gamepads[state.index];

      if (gp && gp.connected) {
        rawGamepadSnapshotStore.publish(gp);

        const controllerKey = `${gp.index}:${gp.id}:${profile.id}`;
        if (controllerKey !== lastControllerKey) {
          resetPollerState();
          lastLeftStick = { x: 0, y: 0, magnitude: 0, angle: 0 };
          lastRightStick = { x: 0, y: 0, magnitude: 0, angle: 0 };
          lastControllerKey = controllerKey;
        }

        const { buttons, hasChanged: buttonsChanged } = buttonStateMachine.update(
          gp.buttons,
          profile.buttons
        );
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

        const leftStickChanged = stickSignificantlyChanged(leftStick, lastLeftStick);
        const rightStickChanged = stickSignificantlyChanged(rightStick, lastRightStick);
        if (leftStickChanged) lastLeftStick = leftStick;
        if (rightStickChanged) lastRightStick = rightStick;

        if (buttonsChanged || leftStickChanged || rightStickChanged || hasButtonFrameEdges(state.buttons)) {
          updateState({ buttons, leftStick, rightStick });
        }

        const bindings = usePreferencesStore.getState().gameplayBindings;
        const defaultViewBinding = bindings.VIEW === DEFAULT_GAMEPLAY_BINDINGS.VIEW;
        const viewButton = buttons.VIEW;
        if (defaultViewBinding && videoModifierContextEnabled && !videoModifierActive && viewButton.pressedThisFrame) {
          videoModifierActive = true;
          videoModifierStartedAt = timestamp;
          videoModifierChordUsed = false;
          intentDispatcher.dispatch({ type: 'VIDEO_CONTROL_ENTER' });
        }

        const consumeAsVideoModifier = videoModifierActive && videoModifierContextEnabled;
        if (videoModifierActive) {
          if (videoModifierContextEnabled) for (const control of ALL_SEMANTIC_CONTROLS) {
            if (control === 'VIEW' || !buttons[control].pressedThisFrame) continue;
            const intent = VIDEO_CONTROL_INTENTS[control];
            if (intent) {
              videoModifierChordUsed = true;
              intentDispatcher.dispatch(intent);
            }
          }
          if (viewButton.releasedThisFrame) {
            const shouldToggleTap = videoModifierContextEnabled && !videoModifierChordUsed && timestamp - videoModifierStartedAt < 250;
            endVideoModifier();
            if (shouldToggleTap) intentDispatcher.dispatch({ type: 'TOGGLE_VIDEO_PLAYBACK' });
          }
        }

        // Gameplay assignments use semantic controls; physical calibration remains in the profile.
        for (const control of ALL_SEMANTIC_CONTROLS) {
          if (!buttons[control].pressedThisFrame || (consumeAsVideoModifier && control !== 'VIEW')) continue;
          if (control === 'VIEW' && defaultViewBinding) continue;
          const actionIntent = gameplayActionIntent(bindings[control]);
          const intent = actionIntent.type === 'OPEN_RADIAL' ? { ...actionIntent, control } : actionIntent;
          if (intent.type === 'UNDO_LAST_EVENT') hapticManager.warning(gp);
          else if (intent.type === 'SELECT_TEAM_A' || intent.type === 'SELECT_TEAM_B' || intent.type === 'BOOKMARK_MOMENT') hapticManager.tick(gp);
          intentDispatcher.dispatch(intent);
        }
      } else {
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
  resetPollerState();
}

/** Resets poller internal button history and exits any active video modifier. */
export function resetPollerState(): void {
  endVideoModifier();
  buttonStateMachine.reset();
  lastLeftStick = { x: 0, y: 0, magnitude: 0, angle: 0 };
  lastRightStick = { x: 0, y: 0, magnitude: 0, angle: 0 };
  lastControllerKey = null;
}