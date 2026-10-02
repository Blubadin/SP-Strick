import { create } from 'zustand';
import type { ControllerState, ControllerProfile } from './ControllerTypes';
import { STANDARD_PROFILE, detectProfile } from './ControllerProfile';
import { createInitialButtonMap } from './ButtonStateMachine';

interface ControllerStoreState {
  state: ControllerState;
  profile: ControllerProfile;
  customProfiles: ControllerProfile[];
  hapticsEnabled: boolean;

  setConnected: (
    connected: boolean,
    id: string | null,
    index: number | null,
    haptic: GamepadHapticActuator | null
  ) => void;
  setProfile: (profile: ControllerProfile) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setDeadzone: (deadzone: number) => void;
  addCustomProfile: (profile: ControllerProfile) => void;
  updateCustomProfile: (profile: ControllerProfile) => void;
  deleteCustomProfile: (id: string) => void;
  updateState: (newState: Partial<ControllerState>) => void;
}

export const useControllerStore = create<ControllerStoreState>((set, get) => ({
  state: {
    connected: false,
    id: null,
    index: null,
    buttons: createInitialButtonMap(),
    leftStick: { x: 0, y: 0, magnitude: 0, angle: 0 },
    rightStick: { x: 0, y: 0, magnitude: 0, angle: 0 },
    hapticActuator: null
  },
  profile: STANDARD_PROFILE,
  customProfiles: [],
  hapticsEnabled: true,

  setConnected: (connected, id, index, haptic) => {
    if (connected && id) {
      const detected = detectProfile(id, 'standard', get().customProfiles);
      set((s) => ({
        profile: detected,
        state: {
          ...s.state,
          connected: true,
          id,
          index,
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
          buttons: createInitialButtonMap(),
          leftStick: { x: 0, y: 0, magnitude: 0, angle: 0 },
          rightStick: { x: 0, y: 0, magnitude: 0, angle: 0 },
          hapticActuator: null
        }
      }));
    }
  },

  setProfile: (profile) => set({ profile }),

  setHapticsEnabled: (enabled) => set({ hapticsEnabled: enabled }),

  setDeadzone: (deadzone) => {
    const p = get().profile;
    set({
      profile: {
        ...p,
        leftStick: { ...p.leftStick, deadzone }
      }
    });
  },

  addCustomProfile: (profile) =>
    set((s) => ({ customProfiles: [...s.customProfiles, profile] })),

  updateCustomProfile: (profile) =>
    set((s) => ({
      customProfiles: s.customProfiles.map((p) => (p.id === profile.id ? profile : p)),
      profile: s.profile.id === profile.id ? profile : s.profile
    })),

  deleteCustomProfile: (id) =>
    set((s) => ({
      customProfiles: s.customProfiles.filter((p) => p.id !== id),
      profile: s.profile.id === id ? STANDARD_PROFILE : s.profile
    })),

  updateState: (newState) =>
    set((s) => ({
      state: { ...s.state, ...newState }
    }))
}));
