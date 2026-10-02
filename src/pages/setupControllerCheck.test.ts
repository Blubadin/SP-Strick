import { describe, expect, it } from 'vitest';
import {
  advanceControllerCheck,
  getSetupSkillSelection,
  initialControllerCheck,
  type ControllerCheckEvent
} from './setupControllerCheck';

describe('setup controller check gesture', () => {
  it('maps the rightward radial sector to Attack', () => {
    expect(getSetupSkillSelection(0, 0.8, null)).toEqual({
      sectorIndex: 0,
      skillId: 'attack'
    });
  });

  it('does not select a sector below the radial activation threshold', () => {
    expect(getSetupSkillSelection(0, 0.4, null)).toEqual({
      sectorIndex: null,
      skillId: null
    });
  });

  it('arms only from a physical FACE_SOUTH skill-wheel press', () => {
    const ignoredIntent = advanceControllerCheck(initialControllerCheck, {
      type: 'OPEN_SKILL_RADIAL',
      physicalPress: false
    });

    expect(ignoredIntent.status).toBe('waiting');

    const physicalIntent = advanceControllerCheck(ignoredIntent, {
      type: 'OPEN_SKILL_RADIAL',
      physicalPress: true
    });

    expect(physicalIntent).toEqual({ status: 'holding', selectedSkillId: null });
  });

  it('completes only after selecting Attack and physically releasing FACE_SOUTH', () => {
    const sequence: ControllerCheckEvent[] = [
      { type: 'OPEN_SKILL_RADIAL', physicalPress: true },
      { type: 'STICK_SELECTION', skillId: 'attack' },
      { type: 'FACE_SOUTH_RELEASE', physicalRelease: false }
    ];

    const held = sequence.reduce(advanceControllerCheck, initialControllerCheck);
    expect(held.status).toBe('holding');

    const released = advanceControllerCheck(held, {
      type: 'FACE_SOUTH_RELEASE',
      physicalRelease: true
    });
    expect(released.status).toBe('complete');
  });

  it('does not complete for another skill and returns to waiting on release', () => {
    const holding = advanceControllerCheck(initialControllerCheck, {
      type: 'OPEN_SKILL_RADIAL',
      physicalPress: true
    });
    const selectedBlock = advanceControllerCheck(holding, {
      type: 'STICK_SELECTION',
      skillId: 'block'
    });

    const released = advanceControllerCheck(selectedBlock, {
      type: 'FACE_SOUTH_RELEASE',
      physicalRelease: true
    });

    expect(released).toEqual(initialControllerCheck);
  });

  it('cancels an incomplete gesture on disconnect', () => {
    const holding = advanceControllerCheck(initialControllerCheck, {
      type: 'OPEN_SKILL_RADIAL',
      physicalPress: true
    });
    const selectedAttack = advanceControllerCheck(holding, {
      type: 'STICK_SELECTION',
      skillId: 'attack'
    });

    const disconnected = advanceControllerCheck(selectedAttack, { type: 'DISCONNECT' });

    expect(disconnected).toEqual(initialControllerCheck);
  });
});
