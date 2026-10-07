import type { SemanticControl, ButtonState } from './ControllerTypes';

export function createDefaultButtonState(): ButtonState {
  return {
    pressed: false,
    pressedThisFrame: false,
    releasedThisFrame: false,
    held: false
  };
}

export const ALL_SEMANTIC_CONTROLS: SemanticControl[] = [
  'FACE_SOUTH',
  'FACE_EAST',
  'FACE_WEST',
  'FACE_NORTH',
  'LEFT_BUMPER',
  'RIGHT_BUMPER',
  'LEFT_TRIGGER',
  'RIGHT_TRIGGER',
  'LEFT_STICK_BUTTON',
  'RIGHT_STICK_BUTTON',
  'DPAD_UP',
  'DPAD_RIGHT',
  'DPAD_DOWN',
  'DPAD_LEFT',
  'MENU',
  'VIEW',
  'PADDLE_LEFT',
  'PADDLE_RIGHT'
];

export function createInitialButtonMap(): Record<SemanticControl, ButtonState> {
  const map = {} as Record<SemanticControl, ButtonState>;
  for (const control of ALL_SEMANTIC_CONTROLS) {
    map[control] = createDefaultButtonState();
  }
  return map;
}

export function hasButtonFrameEdges(buttons: Record<SemanticControl, ButtonState>): boolean {
  return Object.values(buttons).some((state) => state.pressedThisFrame || state.releasedThisFrame);
}

export type InputButton = GamepadButton | number | { pressed: boolean; value?: number; touched?: boolean };

export class ButtonStateMachine {
  private previousRawState: Map<number, boolean> = new Map();

  /**
   * Resets all internal button history. Call on disconnect, profile switch, or session reset.
   */
  public reset(): void {
    this.previousRawState.clear();
  }

  /**
   * Updates state for semantic controls given a Gamepad buttons array and mapping.
   */
  public update(
    gamepadButtons: readonly InputButton[],
    mapping: Partial<Record<SemanticControl, number>>
  ): {
    buttons: Record<SemanticControl, ButtonState>;
    hasChanged: boolean;
  } {
    const buttons = createInitialButtonMap();
    let hasChanged = false;
    const currentRawState = new Map<number, boolean>();

    for (const control of ALL_SEMANTIC_CONTROLS) {
      const physicalIndex = mapping[control];
      if (physicalIndex === undefined) continue;

      let isPressed = currentRawState.get(physicalIndex);
      if (isPressed === undefined) {
        const rawBtn = gamepadButtons[physicalIndex];
        isPressed = rawBtn
          ? typeof rawBtn === 'object'
            ? rawBtn.pressed
            : rawBtn > 0.5
          : false;
        currentRawState.set(physicalIndex, isPressed);
      }

      const wasPressed = this.previousRawState.get(physicalIndex) ?? false;

      const pressedThisFrame = isPressed && !wasPressed;
      const releasedThisFrame = !isPressed && wasPressed;
      const held = isPressed && wasPressed;

      if (pressedThisFrame || releasedThisFrame) {
        hasChanged = true;
      }

      buttons[control] = {
        pressed: isPressed,
        pressedThisFrame,
        releasedThisFrame,
        held
      };
    }

    // Update history after resolving every semantic control so duplicate mappings
    // receive the same press/release edge instead of depending on iteration order.
    for (const [physicalIndex, isPressed] of currentRawState) {
      this.previousRawState.set(physicalIndex, isPressed);
    }

    return { buttons, hasChanged };
  }
}
