/**
 * Manages subtle haptic feedback for controller interactions with feature detection.
 */

class HapticManager {
  private enabled: boolean = true;

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Safe execution of dual-rumble vibration effect.
   */
  public async pulse(
    gamepad: Gamepad | null,
    durationMs: number = 80,
    weakMagnitude: number = 0.3,
    strongMagnitude: number = 0.3
  ): Promise<void> {
    if (!this.enabled || !gamepad) return;

    // Feature detection for vibrationActuator or hapticActuators
    const gpWithVibe = gamepad as unknown as {
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
  public tick(gamepad: Gamepad | null): void {
    this.pulse(gamepad, 30, 0.15, 0.05);
  }

  /**
   * Confirmation pulse when an event or action commits
   */
  public success(gamepad: Gamepad | null): void {
    this.pulse(gamepad, 90, 0.4, 0.3);
  }

  /**
   * Distinct warning pulse on cancel or undo
   */
  public warning(gamepad: Gamepad | null): void {
    this.pulse(gamepad, 120, 0.5, 0.2);
  }
}

export const hapticManager = new HapticManager();
