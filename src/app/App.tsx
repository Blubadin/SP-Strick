import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { startGamepadPolling, stopGamepadPolling } from '../core/controller/GamepadPoller';
import { listenForGamepadConnections } from '../core/controller/GamepadDetector';
import { useControllerStore } from '../core/controller/ControllerStore';
import { BUILT_IN_PROFILES } from '../core/controller/ControllerProfile';
import { db } from '../core/persistence/database';
import { usePreferencesStore } from '../core/preferences/PreferencesStore';
import { audioFeedbackManager } from '../core/preferences/AudioFeedbackManager';
import i18n from '../i18n';

export default function App() {
  useEffect(() => {
    let disposed = false;
    let cleanupDetector: (() => void) | undefined;

    const initialize = async () => {
      try {
        const [preferences, profiles] = await Promise.all([
          usePreferencesStore.getState().hydrate(),
          db.customProfiles.toArray()
        ]);
        if (disposed) return;

        useControllerStore.getState().hydrateCustomProfiles(profiles);
        useControllerStore.getState().setHapticsEnabled(preferences.hapticsEnabled);
        audioFeedbackManager.setEnabled(preferences.audioFeedbackEnabled);
        audioFeedbackManager.setVolume(preferences.audioVolume);
        document.documentElement.lang = preferences.language;
        document.documentElement.classList.toggle('reduce-motion', preferences.reducedMotion);
        await i18n.changeLanguage(preferences.language);

        const selected = [...BUILT_IN_PROFILES, ...useControllerStore.getState().customProfiles]
          .find((profile) => profile.id === preferences.activeControllerProfileId);
        if (selected) useControllerStore.getState().setProfile(selected);
        else useControllerStore.getState().useAutoDetectedProfile();
      } catch (error) {
        console.error('Unable to restore saved preferences:', error);
      }

      if (disposed) return;
      cleanupDetector = listenForGamepadConnections();
      startGamepadPolling();
    };

    void initialize();

    return () => {
      disposed = true;
      cleanupDetector?.();
      stopGamepadPolling();
    };
  }, []);

  return <RouterProvider router={router} />;
}
