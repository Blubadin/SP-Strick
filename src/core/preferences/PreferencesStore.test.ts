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

  it('defaults to large wheels and enabled audio while preserving a saved mute', () => {
    expect(parsePreferences([])).toMatchObject({ wheelSize: 'large', audioFeedbackEnabled: true, audioVolume: 0.5 });
    expect(parsePreferences([{ key: 'audioFeedbackEnabled', value: false }]).audioFeedbackEnabled).toBe(false);
  });

  it('loads wheel size and volume and rejects invalid ranges', () => {
    expect(parsePreferences([{ key: 'wheelSize', value: 'extraLarge' }, { key: 'audioVolume', value: 0.8 }]))
      .toMatchObject({ wheelSize: 'extraLarge', audioVolume: 0.8 });
    expect(parsePreferences([{ key: 'wheelSize', value: 'tiny' }, { key: 'audioVolume', value: 2 }]))
      .toMatchObject({ wheelSize: 'large', audioVolume: 0.5 });
  });

  it('restores gameplay assignments including repeated actions and rejects unknown actions', async () => {
    const swapped = { ...DEFAULT_PREFERENCES.gameplayBindings, LEFT_TRIGGER: 'BOOKMARK_MOMENT', RIGHT_STICK_BUTTON: 'CLEAR_CURRENT_ACTION' };
    expect(parsePreferences([{ key: 'gameplayBindings', value: swapped }]).gameplayBindings).toEqual(swapped);
    const repeated = { ...swapped, RIGHT_STICK_BUTTON: 'BOOKMARK_MOMENT' };
    expect(parsePreferences([{ key: 'gameplayBindings', value: repeated }]).gameplayBindings).toEqual(repeated);
    const duplicate = { ...swapped, RIGHT_STICK_BUTTON: 'UNKNOWN_ACTION' };
    expect(parsePreferences([{ key: 'gameplayBindings', value: duplicate }]).gameplayBindings).toEqual(DEFAULT_PREFERENCES.gameplayBindings);
    expect(await usePreferencesStore.getState().setPreference('gameplayBindings', duplicate as unknown as typeof DEFAULT_PREFERENCES.gameplayBindings)).toBe(false);
    expect(put).not.toHaveBeenCalled();
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
