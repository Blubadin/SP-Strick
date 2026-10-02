import { VOLLEYBALL_SKILLS } from './volleyball.skills';
import { VOLLEYBALL_ZONES } from './volleyball.zones';
import { VOLLEYBALL_RESULTS } from './volleyball.rules';

export interface SportConfig {
  sportId: 'volleyball';
  nameKey: string;
  skills: typeof VOLLEYBALL_SKILLS;
  zones: typeof VOLLEYBALL_ZONES;
  results: typeof VOLLEYBALL_RESULTS;
  requiredFields: Array<'teamId' | 'skill' | 'originZone' | 'evaluation'>;
  defaultProfileId: string;
}

export const VOLLEYBALL_SPORT_CONFIG: SportConfig = {
  sportId: 'volleyball',
  nameKey: 'sport.volleyball',
  skills: VOLLEYBALL_SKILLS,
  zones: VOLLEYBALL_ZONES,
  results: VOLLEYBALL_RESULTS,
  requiredFields: ['teamId', 'skill', 'originZone', 'evaluation'],
  defaultProfileId: 'volleyball_basic'
};
