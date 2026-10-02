import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toArray, put } = vi.hoisted(() => ({
  toArray: vi.fn(),
  put: vi.fn()
}));

vi.mock('../persistence/database', () => ({
  db: { settings: { toArray, put } }
}));

import { DEFAULT_PREFERENCES, loadPreferences, parsePreferences, savePreference, usePreferencesStore } from './PreferencesStore';
import i18n from '../../i18n';
import { audioFeedbackManager } from './AudioFeedbackManager';

describe('application preferences persistence', () => {
  beforeEach(() => {
    toArray.mockReset();
    put.mockReset();
  });

  it('loads persisted supported preferences and defaults invalid values', async () => {
    toArray.mockResolvedValue([
      { key: 'language', value: 'th' },
      { key: 'audioFeedbackEnabled', value: true },
      { key: 'hapticsEnabled', value: 'on' },
      { key: 'unknown', value: 'ignored' }
    ]);

    await expect(loadPreferences()).resolves.toEqual({
      ...DEFAULT_PREFERENCES,
      language: 'th',
      audioFeedbackEnabled: true
    });
  });

  it('parses preference records without losing false values', () => {
    expect(parsePreferences([
      { key: 'autoScoreEnabled', value: false },
      { key: 'reducedMotion', value: true }
    ])).toMatchObject({ autoScoreEnabled: false, reducedMotion: true });
  });

  it('writes a preference as a keyed Dexie setting', async () => {
    put.mockResolvedValue('audioFeedbackEnabled');
    await savePreference('audioFeedbackEnabled', true);
    expect(put).toHaveBeenCalledWith({ key: 'audioFeedbackEnabled', value: true });
  });

  it('applies language and audio preference changes immediately', async () => {
    const languageSpy = vi.spyOn(i18n, 'changeLanguage');
    const audioSpy = vi.spyOn(audioFeedbackManager, 'setEnabled');
    put.mockResolvedValue(undefined);

    await usePreferencesStore.getState().setPreference('language', 'th');
    await usePreferencesStore.getState().setPreference('audioFeedbackEnabled', true);

    expect(languageSpy).toHaveBeenCalledWith('th');
    expect(audioSpy).toHaveBeenCalledWith(true);
    languageSpy.mockRestore();
    audioSpy.mockRestore();
  });
});
