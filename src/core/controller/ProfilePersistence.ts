import type { ControllerProfile } from './ControllerTypes';
import { BUILT_IN_PROFILES, validateControllerProfile } from './ControllerProfile';

export interface ProfileExportFile {
  format: 'sp-stick-controller-profile';
  schemaVersion: 1;
  profile: ControllerProfile;
}

export function exportControllerProfile(profile: ControllerProfile): string {
  if (profile.builtIn || !validateControllerProfile(profile).valid) {
    throw new Error('Only a valid custom controller profile can be exported.');
  }
  const file: ProfileExportFile = { format: 'sp-stick-controller-profile', schemaVersion: 1, profile };
  return JSON.stringify(file, null, 2);
}

export function importControllerProfile(source: string): ControllerProfile | null {
  try {
    const parsed: unknown = JSON.parse(source);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Partial<ProfileExportFile>;
    if (record.format !== 'sp-stick-controller-profile' || record.schemaVersion !== 1) return null;
    const profile = record.profile;
    if (!profile || profile.builtIn || BUILT_IN_PROFILES.some((builtIn) => builtIn.id === profile.id)) return null;
    return validateControllerProfile(profile).valid ? profile : null;
  } catch {
    return null;
  }
}
