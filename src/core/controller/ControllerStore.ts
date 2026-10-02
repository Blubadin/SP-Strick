import { create } from 'zustand';
import type { ControllerState, ControllerProfile } from './ControllerTypes';
import { BUILT_IN_PROFILES, STANDARD_PROFILE, detectProfile, validateControllerProfile } from './ControllerProfile';
import { createInitialButtonMap } from './ButtonStateMachine';
import { hapticManager } from './HapticManager';

export type ProfileSelectionMode = 'automatic' | 'manual';

interface ControllerStoreState {
  state: ControllerState;
  profile: ControllerProfile;
  profileSelectionMode: ProfileSelectionMode;
  customProfiles: ControllerProfile[];
  hapticsEnabled: boolean;

  setConnected: (
    connected: boolean,
    id: string | null,
    index: number | null,
    haptic: GamepadHapticActuator | null,
    mapping?: Gamepad['mapping']
  ) => void;
  setProfile: (profile: ControllerProfile) => void;
  useAutoDetectedProfile: () => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setDeadzone: (deadzone: number) => void;
  addCustomProfile: (profile: ControllerProfile) => boolean;
  hydrateCustomProfiles: (profiles: unknown) => number;
  updateCustomProfile: (profile: ControllerProfile) => boolean;
  deleteCustomProfile: (id: string) => boolean;
  updateState: (newState: Partial<ControllerState>) => void;
}

export const useControllerStore = create<ControllerStoreState>((set, get) => ({
  state: {
    connected: false,
    id: null,
    index: null,
    mapping: null,
    buttons: createInitialButtonMap(),
    leftStick: { x: 0, y: 0, magnitude: 0, angle: 0 },
    rightStick: { x: 0, y: 0, magnitude: 0, angle: 0 },
    hapticActuator: null
  },
  profile: STANDARD_PROFILE,
  profileSelectionMode: 'automatic',
  customProfiles: [],
  hapticsEnabled: true,

  setConnected: (connected, id, index, haptic, mapping = '') => {
    if (connected && id) {
      const current = get();
      const detected = detectProfile(id, mapping, current.customProfiles);
      set((s) => ({
        profile: s.profileSelectionMode === 'automatic' ? detected : s.profile,
        state: {
          ...s.state,
          connected: true,
          id,
          index,
          mapping,
          buttons: createInitialButtonMap(),
          leftStick: { x: 0, y: 0, magnitude: 0, angle: 0 },
          rightStick: { x: 0, y: 0, magnitude: 0, angle: 0 },
          hapticActuator: haptic
        }
      }));
    } else {
      set((s) => ({
        state: {
          ...s.state,
          connected: false,
          id: null,
          index: null,
          mapping: null,
          buttons: createInitialButtonMap(),
          leftStick: { x: 0, y: 0, magnitude: 0, angle: 0 },
          rightStick: { x: 0, y: 0, magnitude: 0, angle: 0 },
          hapticActuator: null
        }
      }));
    }
  },

  setProfile: (profile) => {
    if (!profile.builtIn && !validateControllerProfile(profile).valid) return;
    set({ profile, profileSelectionMode: 'manual' });
  },

  useAutoDetectedProfile: () => {
    const { state, customProfiles } = get();
    if (!state.connected || !state.id) {
      set({ profileSelectionMode: 'automatic' });
      return;
    }
    set({
      profileSelectionMode: 'automatic',
      profile: detectProfile(state.id, state.mapping ?? '', customProfiles)
    });
  },

  setHapticsEnabled: (enabled) => {
    hapticManager.setEnabled(enabled);
    set({ hapticsEnabled: enabled });
  },

  setDeadzone: (deadzone) => {
    if (!Number.isFinite(deadzone) || deadzone < 0 || deadzone >= 1) return;
    const p = get().profile;
    const updated = {
      ...p,
      leftStick: { ...p.leftStick, deadzone }
    };
    set((s) => ({
      profile: updated,
      customProfiles: p.builtIn
        ? s.customProfiles
        : s.customProfiles.map((item) => (item.id === p.id ? updated : item))
    }));
  },

  addCustomProfile: (profile) => {
    if (
      profile.builtIn ||
      BUILT_IN_PROFILES.some((item) => item.id === profile.id) ||
      !validateControllerProfile(profile).valid ||
      get().customProfiles.some((item) => item.id === profile.id)
    ) {
      return false;
    }
    set((s) => ({ customProfiles: [...s.customProfiles, profile] }));
    return true;
  },

  hydrateCustomProfiles: (profiles) => {
    if (!Array.isArray(profiles)) return 0;
    const accepted: ControllerProfile[] = [];
    const seenIds = new Set<string>();
    for (const candidate of profiles) {
      if (!validateControllerProfile(candidate).valid) continue;
      const profile = candidate as ControllerProfile;
      if (
        profile.builtIn ||
        BUILT_IN_PROFILES.some((item) => item.id === profile.id) ||
        seenIds.has(profile.id)
      ) continue;
      accepted.push(profile);
      seenIds.add(profile.id);
    }

    set((s) => {
      const selectedCustom = accepted.find((profile) => profile.id === s.profile.id);
      const profile = s.profileSelectionMode === 'automatic' && s.state.connected && s.state.id
        ? detectProfile(s.state.id, s.state.mapping ?? '', accepted)
        : selectedCustom ?? s.profile;
      return { customProfiles: accepted, profile };
    });
    return accepted.length;
  },

  updateCustomProfile: (profile) => {
    const current = get().customProfiles.find((item) => item.id === profile.id);
    if (!current || current.builtIn || profile.builtIn || !validateControllerProfile(profile).valid) return false;
    set((s) => ({
      customProfiles: s.customProfiles.map((p) => (p.id === profile.id ? profile : p)),
      profile: s.profile.id === profile.id ? profile : s.profile
    }));
    return true;
  },

  deleteCustomProfile: (id) => {
    const target = get().customProfiles.find((item) => item.id === id);
    if (!target || target.builtIn) return false;
    set((s) => ({
      customProfiles: s.customProfiles.filter((p) => p.id !== id),
      profile: s.profile.id === id
        ? detectProfile(s.state.id ?? '', s.state.mapping ?? '', s.customProfiles.filter((p) => p.id !== id))
        : s.profile,
      profileSelectionMode: s.profile.id === id ? 'automatic' : s.profileSelectionMode
    }));
    return true;
  },

  updateState: (newState) =>
    set((s) => ({
      state: { ...s.state, ...newState }
    }))
}));

// HapticManager remains independent of Zustand, while resolving the live Gamepad lazily.
hapticManager.setGamepadResolver(() => {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
  const { connected, index } = useControllerStore.getState().state;
  if (!connected || index === null) return null;
  return navigator.getGamepads()[index] ?? null;
});
