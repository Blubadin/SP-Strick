import { getHysteresisSector } from '../core/controller/RadialSelector';
import { VOLLEYBALL_SKILLS } from '../core/sports/volleyball/volleyball.skills';

export type ControllerCheckState =
  | { status: 'waiting' }
  | { status: 'holding'; selectedSkillId: string | null }
  | { status: 'complete' };

export type ControllerCheckEvent =
  | { type: 'OPEN_SKILL_RADIAL'; physicalPress: boolean }
  | { type: 'STICK_SELECTION'; skillId: string | null }
  | { type: 'FACE_SOUTH_RELEASE'; physicalRelease: boolean }
  | { type: 'DISCONNECT' };

export const initialControllerCheck: ControllerCheckState = { status: 'waiting' };

export function getSetupSkillSelection(
  angle: number,
  magnitude: number,
  currentSector: number | null
): { sectorIndex: number | null; skillId: string | null } {
  const sectorIndex = getHysteresisSector(
    angle,
    magnitude,
    VOLLEYBALL_SKILLS.length,
    currentSector
  );
  return {
    sectorIndex,
    skillId: sectorIndex === null ? null : VOLLEYBALL_SKILLS[sectorIndex]?.id ?? null
  };
}

/** Pure state transition for the setup controller gesture. */
export function advanceControllerCheck(
  state: ControllerCheckState,
  event: ControllerCheckEvent
): ControllerCheckState {
  if (state.status === 'complete') return state;

  if (event.type === 'DISCONNECT') return initialControllerCheck;

  if (state.status === 'waiting') {
    if (event.type === 'OPEN_SKILL_RADIAL' && event.physicalPress) {
      return { status: 'holding', selectedSkillId: null };
    }
    return state;
  }

  if (event.type === 'STICK_SELECTION') {
    return { status: 'holding', selectedSkillId: event.skillId };
  }

  if (event.type === 'FACE_SOUTH_RELEASE' && event.physicalRelease) {
    return state.selectedSkillId === 'attack' ? { status: 'complete' } : initialControllerCheck;
  }

  return state;
}
