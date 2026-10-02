/**
 * Manages subtle haptic feedback for controller interactions with feature detection.
 */

class HapticManager {
  private enabled: boolean = true;
  private gamepadResolver: () => Gamepad | null = () => null;

  public setGamepadResolver(resolver: () => Gamepad | null): void {
    this.gamepadResolver = resolver;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public isAvailable(gamepad?: Gamepad | null): boolean {
    const target = this.resolveGamepad(gamepad);
    if (!target?.connected) return false;
    const candidate = target as unknown as {
      vibrationActuator?: { playEffect?: unknown };
      hapticActuators?: Array<{ pulse?: unknown }>;
    };
    return typeof candidate.vibrationActuator?.playEffect === 'function' ||
      Boolean(candidate.hapticActuators?.some((actuator) => typeof actuator.pulse === 'function'));
  }

  /**
   * Safe execution of dual-rumble vibration effect.
   */
  public async pulse(
    gamepad: Gamepad | null = null,
    durationMs: number = 80,
    weakMagnitude: number = 0.3,
    strongMagnitude: number = 0.3
  ): Promise<void> {
    const target = this.resolveGamepad(gamepad);
    if (!this.enabled || !target?.connected) return;

    // Feature detection for vibrationActuator or hapticActuators
    const gpWithVibe = target as unknown as {
      vibrationActuator?: {
        playEffect: (
          type: string,
          params: { startDelay: number; duration: number; weakMagnitude: number; strongMagnitude: number }
        ) => Promise<string>;
      };
      hapticActuators?: Array<{
        pulse: (value: number, duration: number) => Promise<boolean>;
      }>;
    };

    try {
      if (gpWithVibe.vibrationActuator?.playEffect) {
        await gpWithVibe.vibrationActuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: durationMs,
          weakMagnitude,
          strongMagnitude
        });
      } else if (gpWithVibe.hapticActuators && gpWithVibe.hapticActuators.length > 0) {
        await gpWithVibe.hapticActuators[0].pulse(strongMagnitude, durationMs);
      }
    } catch {
      // Gracefully ignore devices that reject or disconnect mid-vibration
    }
  }

  /**
   * Extremely light tick when rotating through radial sectors
   */
  public tick(gamepad: Gamepad | null = null): void {
    this.pulse(gamepad, 30, 0.15, 0.05);
  }

  /**
   * Confirmation pulse when an event or action commits
   */
  public success(gamepad: Gamepad | null = null): void {
    this.pulse(gamepad, 90, 0.4, 0.3);
  }

  /**
   * Distinct warning pulse on cancel or undo
   */
  public warning(gamepad: Gamepad | null = null): void {
    this.pulse(gamepad, 120, 0.5, 0.2);
  }

  private resolveGamepad(gamepad?: Gamepad | null): Gamepad | null {
    if (gamepad) return gamepad;
    try {
      return this.gamepadResolver();
    } catch {
      return null;
    }
  }
}

export const hapticManager = new HapticManager();
