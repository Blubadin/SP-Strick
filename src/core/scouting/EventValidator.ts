import type { ScoutingEvent } from './ScoutingEvent';

export interface ValidationResult {
  isValid: boolean;
  missingFields: string[];
}

export class EventValidator {
  /**
   * Checks whether all required fields for the scouting profile are filled.
   */
  public static validate(
    event: Partial<ScoutingEvent>,
    requiredFields: string[] = ['teamId', 'skill', 'originZone', 'evaluation']
  ): ValidationResult {
    const missing: string[] = [];

    for (const field of requiredFields) {
      const val = (event as Record<string, unknown>)[field];
      if (val === undefined || val === null || val === '') {
        missing.push(field);
      }
    }

    return {
      isValid: missing.length === 0,
      missingFields: missing
    };
  }
}
