import { describe, expect, it } from 'vitest';
import { STANDARD_PROFILE } from './ControllerProfile';
import { exportControllerProfile, importControllerProfile } from './ProfilePersistence';

const custom = { ...STANDARD_PROFILE, id: 'custom_test', type: 'custom' as const, builtIn: false, name: 'Test pad' };

describe('controller profile file format', () => {
  it('exports and imports a validated versioned profile', () => {
    const encoded = exportControllerProfile(custom);
    expect(JSON.parse(encoded).schemaVersion).toBe(1);
    expect(importControllerProfile(encoded)).toEqual(custom);
  });

  it('rejects malformed profiles, built-ins, and conflicting mappings', () => {
    expect(importControllerProfile('{"profile":{}}')).toBeNull();
    expect(importControllerProfile(JSON.stringify({ schemaVersion: 1, profile: STANDARD_PROFILE }))).toBeNull();
    expect(importControllerProfile(JSON.stringify({
      schemaVersion: 1,
      profile: { ...custom, buttons: { ...custom.buttons, FACE_EAST: custom.buttons.FACE_SOUTH } }
    }))).toBeNull();
  });
});
