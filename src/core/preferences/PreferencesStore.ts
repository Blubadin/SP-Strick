import { create } from 'zustand';
import { db, type AppSetting } from '../persistence/database';
import i18n from '../../i18n';
import { audioFeedbackManager } from './AudioFeedbackManager';

import { DEFAULT_GAMEPLAY_BINDINGS, validateGameplayBindings, type GameplayBindings } from '../controller/GameplayBindings';

export type WheelSize = 'normal' | 'large' | 'extraLarge';
export type AppLanguage = 'en' | 'th';

export interface Preferences {
  language: AppLanguage;
  hapticsEnabled: boolean;
  audioFeedbackEnabled: boolean;
  autoScoreEnabled: boolean;
  wheelSize: WheelSize;
  audioVolume: number;
  gameplayBindings: GameplayBindings;
  reducedMotion: boolean;
  activeControllerProfileId: string;
}

export type PreferenceKey = keyof Preferences;

export const DEFAULT_PREFERENCES: Preferences = {
  language: 'en',
  hapticsEnabled: true,
  audioFeedbackEnabled: true,
  audioVolume: 0.5,
  wheelSize: 'large',
  gameplayBindings: DEFAULT_GAMEPLAY_BINDINGS,
  autoScoreEnabled: false,
  reducedMotion: false,
  activeControllerProfileId: 'auto'
};

const preferenceKeys = Object.keys(DEFAULT_PREFERENCES) as PreferenceKey[];

export function parsePreferences(records: AppSetting[]): Preferences {
  const values = new Map(records.map(({ key, value }) => [key, value]));
  const next = { ...DEFAULT_PREFERENCES };

  for (const key of preferenceKeys) {
    const value = values.get(key);
    if (key === 'language') {
      if (value === 'en' || value === 'th') next.language = value;
    } else if (key === 'activeControllerProfileId') {
      if (typeof value === 'string' && value.length > 0) next.activeControllerProfileId = value;
    } else if (key === 'wheelSize') {
      if (value === 'normal' || value === 'large' || value === 'extraLarge') next.wheelSize = value;
    } else if (key === 'audioVolume') {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1) next.audioVolume = value;
    } else if (key === 'gameplayBindings') {
      if (validateGameplayBindings(value)) next.gameplayBindings = { ...value };
    } else if (typeof value === 'boolean') {
      next[key] = value;
    }
  }

  return next;
}

export async function loadPreferences(): Promise<Preferences> {
  return parsePreferences(await db.settings.toArray());
}

export async function savePreference<K extends PreferenceKey>(key: K, value: Preferences[K]): Promise<void> {
  await db.settings.put({ key, value });
}

interface PreferencesState extends Preferences {
  hydrated: boolean;
  hydrate: () => Promise<Preferences>;
  setPreference: <K extends PreferenceKey>(key: K, value: Preferences[K]) => Promise<boolean>;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  ...DEFAULT_PREFERENCES,
  hydrated: false,

  hydrate: async () => {
    const preferences = await loadPreferences();
    set({ ...preferences, hydrated: true });
    return preferences;
  },

  setPreference: async (key, value) => {
    if (key === 'gameplayBindings' && !validateGameplayBindings(value)) return false;
    if (key === 'audioVolume' && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)) return false;
    if (key === 'wheelSize' && value !== 'normal' && value !== 'large' && value !== 'extraLarge') return false;
    try {
      await savePreference(key, value);
      set({ [key]: value } as Pick<PreferencesState, typeof key>);
      if (key === 'language') await i18n.changeLanguage(value as AppLanguage);
      if (key === 'audioVolume') audioFeedbackManager.setVolume(value as number);
      if (key === 'audioFeedbackEnabled') audioFeedbackManager.setEnabled(value as boolean);
      if (key === 'reducedMotion' && typeof document !== 'undefined') {
        document.documentElement.classList.toggle('reduce-motion', value as boolean);
      }
      return true;
    } catch (error) {
      console.error(`Unable to save preference ${key}:`, error);
      return false;
    }
  }
}));
