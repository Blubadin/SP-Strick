import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Activity, AudioLines, Check, ChevronRight, CircleHelp, Download, Gamepad2,
  RotateCcw, Save, SlidersHorizontal, Trash2, Upload, Vibrate, X
} from 'lucide-react';
import AppShell from '../components/AppShell';
import { ControllerGlyph } from '../components/ControllerGlyph';
import SettingsSwitch from '../components/SettingsSwitch';
import { useControllerStore } from '../core/controller/ControllerStore';
import { BUILT_IN_PROFILES, STANDARD_PROFILE, getControllerGlyph } from '../core/controller/ControllerProfile';
import { ALL_SEMANTIC_CONTROLS } from '../core/controller/ButtonStateMachine';
import { AxisDeltaDetector, getAssignedButtonIndices, RawButtonCapture } from '../core/controller/GamepadCapture';
import { getRawGamepadSnapshot, subscribeRawGamepadSnapshot, type RawGamepadSnapshot } from '../core/controller/RawGamepadSnapshot';
import { getConnectedGamepads } from '../core/controller/GamepadDetector';
import { rawGamepadSnapshotStore } from '../core/controller/RawGamepadSnapshot';
import { resetPollerState } from '../core/controller/GamepadPoller';
import { hapticManager } from '../core/controller/HapticManager';
import type { ControllerProfile, SemanticControl } from '../core/controller/ControllerTypes';
import { db } from '../core/persistence/database';
import { exportControllerProfile, importControllerProfile } from '../core/controller/ProfilePersistence';
import { GAMEPLAY_ACTION_LABELS, type GameplayBindings } from '../core/controller/GameplayBindings';
import { usePreferencesStore } from '../core/preferences/PreferencesStore';
import styles from './ControllerPage.module.css';

type ControllerSection = 'overview' | 'mapping' | 'sticks' | 'feedback' | 'diagnostics' | 'profiles';
const controlNames: Record<SemanticControl, string> = {
  FACE_SOUTH: 'controller.face_south', FACE_EAST: 'controller.face_east',
  FACE_WEST: 'controller.face_west', FACE_NORTH: 'controller.face_north',
  LEFT_BUMPER: 'controller.left_bumper', RIGHT_BUMPER: 'controller.right_bumper',
  LEFT_TRIGGER: 'controller.left_trigger', RIGHT_TRIGGER: 'controller.right_trigger',
  LEFT_STICK_BUTTON: 'controller.left_stick_button', RIGHT_STICK_BUTTON: 'controller.right_stick_button',
  DPAD_UP: 'controller.dpad_up', DPAD_RIGHT: 'controller.dpad_right',
  DPAD_DOWN: 'controller.dpad_down', DPAD_LEFT: 'controller.dpad_left',
  MENU: 'controller.menu', VIEW: 'controller.view'
};

const sections: { id: ControllerSection; key: string; icon: typeof Gamepad2 }[] = [
  { id: 'overview', key: 'controller.overview', icon: Gamepad2 },
  { id: 'mapping', key: 'controller.mapping', icon: Activity },
  { id: 'sticks', key: 'controller.sticks', icon: SlidersHorizontal },
  { id: 'feedback', key: 'controller.feedback', icon: Vibrate },
  { id: 'diagnostics', key: 'controller.diagnostics', icon: AudioLines },
  { id: 'profiles', key: 'controller.profiles', icon: CircleHelp }
];

function cloneProfile(profile: ControllerProfile): ControllerProfile {
  return { ...profile, buttons: { ...profile.buttons }, leftStick: { ...profile.leftStick }, rightStick: profile.rightStick ? { ...profile.rightStick } : undefined };
}

const nowIso = () => new Date().toISOString();

function controlLabel(control: SemanticControl, t: TFunction) {
  return t(controlNames[control], control.replaceAll('_', ' ').toLowerCase());
}

function controlActionLabel(control: SemanticControl, t: TFunction, bindings: GameplayBindings) {
  const action = bindings[control];
  return t(`controller.gameplay.${action}`, GAMEPLAY_ACTION_LABELS[action]);
}

function StickMeter({ label, rawX, rawY, x, y, deadzone }: { label: string; rawX: number; rawY: number; x: number; y: number; deadzone: number }) {
  const { t } = useTranslation();
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  return <div className={styles.stickMeter}>
    <div className={styles.stickMeterTitle}><strong>{label}</strong><span>{Math.round(deadzone * 100)}% {t('controller.deadzone', 'deadzone')}</span></div>
    <div className={styles.meterPair}>
      <div><small>{t('controller.raw_label', 'RAW')}</small><div className={styles.meterCircle}><i style={{ transform: `translate(${clamp(rawX) * 24}px, ${clamp(rawY) * 24}px)` }} /></div><code>{rawX.toFixed(2)} · {rawY.toFixed(2)}</code></div>
      <div><small>{t('controller.normalized_label', 'NORMALIZED')}</small><div className={styles.meterCircle}><i style={{ transform: `translate(${clamp(x) * 24}px, ${clamp(y) * 24}px)` }} /></div><code>{x.toFixed(2)} · {y.toFixed(2)}</code></div>
    </div>
  </div>;
}

export default function ControllerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const controllerState = useControllerStore((state) => state.state);
  const profile = useControllerStore((state) => state.profile);
  const profileMode = useControllerStore((state) => state.profileSelectionMode);
  const customProfiles = useControllerStore((state) => state.customProfiles);
  const setProfile = useControllerStore((state) => state.setProfile);
  const activateAutoDetectedProfile = useControllerStore((state) => state.useAutoDetectedProfile);
  const addCustomProfile = useControllerStore((state) => state.addCustomProfile);
  const updateCustomProfile = useControllerStore((state) => state.updateCustomProfile);
  const deleteCustomProfile = useControllerStore((state) => state.deleteCustomProfile);
  const setHapticsEnabled = useControllerStore((state) => state.setHapticsEnabled);
  const gameplayBindings = usePreferencesStore((state) => state.gameplayBindings);
  const preferenceHaptics = usePreferencesStore((state) => state.hapticsEnabled);
  const savePreference = usePreferencesStore((state) => state.setPreference);

  const [section, setSection] = useState<ControllerSection>('overview');
  const [availableGamepads, setAvailableGamepads] = useState<Gamepad[]>([]);
  const [selectedControl, setSelectedControl] = useState<SemanticControl | null>('FACE_SOUTH');
  const [draftState, setDraftState] = useState(() => ({ profileId: profile.id, value: cloneProfile(profile) }));
  const draft = draftState.profileId === profile.id ? draftState.value : cloneProfile(profile);
  const draftRef = useRef({ profileId: profile.id, value: cloneProfile(profile) });
  const [rawSnapshot, setRawSnapshot] = useState<RawGamepadSnapshot | null>(() => getRawGamepadSnapshot());
  const [listeningControl, setListeningControl] = useState<SemanticControl | null>(null);
  const listeningRef = useRef<SemanticControl | null>(null);
  const captureRef = useRef<RawButtonCapture | null>(null);
  const [pendingConflict, setPendingConflict] = useState<{ control: SemanticControl; index: number; other: SemanticControl } | null>(null);
  const [captureMessage, setCaptureMessage] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [calibrating, setCalibrating] = useState<'left' | 'right' | null>(null);
  const calibrationTargetRef = useRef<'left' | 'right' | null>(null);
  const axisDetectorRef = useRef(new AxisDeltaDetector());
  const [wizardStarted, setWizardStarted] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardName, setWizardName] = useState('Custom Controller');
  const wizardNameRef = useRef(wizardName);
  const [wizardButtons, setWizardButtons] = useState<Partial<Record<SemanticControl, number>>>({});
  const wizardButtonsRef = useRef(wizardButtons);
  const [showDelete, setShowDelete] = useState(false);
  const lastUiUpdateRef = useRef(0);
  const captureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const refreshGamepads = () => {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    const found = getConnectedGamepads(navigator.getGamepads());
    setAvailableGamepads((current) => current.length === found.length && current.every((item, index) => item.index === found[index]?.index && item.id === found[index]?.id) ? current : found);
  };

  const selectGamepad = (index: number) => {
    const gamepad = typeof navigator !== 'undefined' ? navigator.getGamepads()[index] : null;
    if (!gamepad?.connected) {
      refreshGamepads();
      return;
    }
    resetPollerState();
    rawGamepadSnapshotStore.reset();
    const haptic = (gamepad as Gamepad & { vibrationActuator?: GamepadHapticActuator }).vibrationActuator ?? null;
    useControllerStore.getState().setConnected(true, gamepad.id, gamepad.index, haptic, gamepad.mapping);
    refreshGamepads();
  };

  useEffect(() => {
    const initialScan = window.setTimeout(refreshGamepads, 0);
    const interval = window.setInterval(refreshGamepads, 1200);
    return () => { window.clearTimeout(initialScan); window.clearInterval(interval); };
  }, []);

  const updateDraft = useCallback((next: ControllerProfile | ((value: ControllerProfile) => ControllerProfile)) => {
    const activeProfile = useControllerStore.getState().profile;
    const current = draftRef.current.profileId === activeProfile.id
      ? draftRef.current.value
      : cloneProfile(activeProfile);
    const value = typeof next === 'function' ? next(current) : next;
    draftRef.current = { profileId: activeProfile.id, value };
    setDraftState({ profileId: activeProfile.id, value });
  }, []);
  const updateWizard = (value: Partial<Record<SemanticControl, number>>) => {
    wizardButtonsRef.current = value;
    setWizardButtons(value);
  };

  const createWizardProfile = useCallback(async (buttons: Partial<Record<SemanticControl, number>>) => {
    const now = nowIso();
    const sourceProfile = useControllerStore.getState().profile;
    const created: ControllerProfile = {
      ...cloneProfile(sourceProfile), id: `custom_${crypto.randomUUID()}`,
      name: wizardNameRef.current.trim() || t('controller.custom_profile', 'Custom Controller'),
      type: 'custom', buttons, builtIn: false, createdAt: now, updatedAt: now
    };
    if (!useControllerStore.getState().addCustomProfile(created)) {
      setCaptureMessage(t('controller.profile_create_error', 'Could not create a profile. Check that each captured input is unique.'));
      return;
    }
    try {
      await db.customProfiles.put(created);
      useControllerStore.getState().setProfile(created);
      await usePreferencesStore.getState().setPreference('activeControllerProfileId', created.id);
      updateDraft(cloneProfile(created));
      setWizardStarted(false);
      setSection('overview');
      setCaptureMessage(t('controller.profile_created', 'Custom profile saved and activated. Calibrate the sticks before scouting.'));
    } catch {
      useControllerStore.getState().deleteCustomProfile(created.id);
      setCaptureMessage(t('controller.profile_create_error', 'Could not save the custom profile.'));
    }
  }, [t, updateDraft]);

  useEffect(() => {
    const unsubscribe = subscribeRawGamepadSnapshot(() => {
      const snapshot = getRawGamepadSnapshot();
      if (!snapshot) {
        if (lastUiUpdateRef.current > 0) setRawSnapshot(null);
        return;
      }
      if (snapshot.timestamp - lastUiUpdateRef.current >= 33) {
        lastUiUpdateRef.current = snapshot.timestamp;
        setRawSnapshot(snapshot);
      }

      if (calibrationTargetRef.current) {
        const movement = axisDetectorRef.current.detect(snapshot.axes, 0.6);
        if (movement) {
          const stick = calibrationTargetRef.current;
          const pairStart = movement.axisIndex < 2 ? 0 : 2;
          updateDraft((value) => ({
            ...value,
            [stick === 'left' ? 'leftStick' : 'rightStick']: {
              ...(stick === 'left' ? value.leftStick : value.rightStick ?? value.leftStick),
              xAxis: pairStart,
              yAxis: pairStart + 1,
              ...(movement.axisIndex === pairStart ? { invertX: movement.inverted } : { invertY: movement.inverted })
            }
          }));
          calibrationTargetRef.current = null;
          setCalibrating(null);
          setCaptureMessage(t('controller.axis_detected', 'Axis movement detected. Review the calibration, then apply changes.'));
        }
      }

      const target = listeningRef.current;
      if (!target || !captureRef.current) return;
      const currentButtons = wizardStarted
        ? wizardButtonsRef.current
        : (draftRef.current.profileId === useControllerStore.getState().profile.id
          ? draftRef.current.value
          : cloneProfile(useControllerStore.getState().profile)).buttons;
      const assigned = getAssignedButtonIndices(currentButtons, target);
      const captured = captureRef.current.update(snapshot, assigned);
      if (!captured) return;
      if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
      captureRef.current = null;
      listeningRef.current = null;
      setListeningControl(null);
      if (captured.kind === 'duplicate') {
        if (wizardStarted) {
          setCaptureMessage(t('controller.wizard_duplicate', 'That button was already captured. Release it, then capture a different control.'));
          return;
        }
        const activeDraft = draftRef.current.profileId === useControllerStore.getState().profile.id
          ? draftRef.current.value
          : cloneProfile(useControllerStore.getState().profile);
        const conflict = ALL_SEMANTIC_CONTROLS.find((control) => control !== target && activeDraft.buttons[control] === captured.index);
        if (conflict) setPendingConflict({ control: target, index: captured.index, other: conflict });
        setCaptureMessage(t('controller.binding_conflict', 'That button is already assigned. Choose Replace, Swap, or Cancel.'));
        return;
      }
      if (wizardStarted) {
        const next = { ...wizardButtonsRef.current, [ALL_SEMANTIC_CONTROLS[wizardStep]]: captured.index };
        updateWizard(next);
        if (wizardStep + 1 >= ALL_SEMANTIC_CONTROLS.length) {
          void createWizardProfile(next);
        } else {
          setWizardStep((step) => step + 1);
          setCaptureMessage(t('controller.capture_success', 'Input captured. Release it before the next step.'));
        }
        return;
      }
      updateDraft((value) => ({ ...value, buttons: { ...value.buttons, [target]: captured.index } }));
      setCaptureMessage(t('controller.capture_success', 'Input captured. Apply changes to save the mapping.'));
    });
    return () => unsubscribe();
  }, [wizardStarted, wizardStep, t, createWizardProfile, updateDraft]);

  useEffect(() => () => {
    if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
  }, []);

  const startListening = (control: SemanticControl) => {
    if (!controllerState.connected) {
      setCaptureMessage(t('controller.connect_to_capture', 'Connect a controller before capturing a button.'));
      return;
    }
    if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
    const capture = new RawButtonCapture();
    capture.begin(getRawGamepadSnapshot());
    captureRef.current = capture;
    listeningRef.current = control;
    setListeningControl(control);
    setPendingConflict(null);
    setCaptureMessage(t('controller.listening', 'Press a new button on the controller…'));
    captureTimeoutRef.current = setTimeout(() => {
      captureRef.current = null;
      listeningRef.current = null;
      setListeningControl(null);
      setCaptureMessage(t('controller.listen_timeout', 'Listening timed out. Select Change binding to try again.'));
    }, 10000);
  };

  const cancelListening = () => {
    if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
    captureRef.current = null;
    listeningRef.current = null;
    setListeningControl(null);
    setPendingConflict(null);
    setCaptureMessage('');
  };

  const startWizard = () => {
    setWizardStarted(true);
    setWizardStep(0);
    updateWizard({});
    setCaptureMessage(t('controller.wizard_intro', 'Capture each physical control in order. Release each one before continuing.'));
    startListening(ALL_SEMANTIC_CONTROLS[0]);
  };

  const applyDraft = async () => {
    const now = nowIso();
    const next: ControllerProfile = profile.builtIn
      ? { ...draftRef.current.value, id: `custom_${crypto.randomUUID()}`, name: `${profile.name} · ${t('controller.custom_suffix', 'Custom')}`, type: 'custom', builtIn: false, createdAt: now, updatedAt: now }
      : { ...draftRef.current.value, updatedAt: now };
    try {
      if (profile.builtIn) {
        if (!addCustomProfile(next)) throw new Error('Profile validation failed.');
      } else if (!updateCustomProfile(next)) {
        throw new Error('Profile validation failed.');
      }
      await db.customProfiles.put(next);
      setProfile(next);
      updateDraft(cloneProfile(next));
      await savePreference('activeControllerProfileId', next.id);
      setSavedMessage(t('controller.profile_saved', 'Profile changes saved.'));
      setCaptureMessage('');
    } catch {
      if (profile.builtIn) deleteCustomProfile(next.id);
      else {
        updateCustomProfile(profile);
        setProfile(profile);
      }
      setSavedMessage(t('controller.profile_save_error', 'Could not save profile changes. Resolve duplicate inputs and try again.'));
    }
  };

  const discardDraft = () => {
    cancelListening();
    updateDraft(cloneProfile(profile));
    setSavedMessage('');
  };

  const selectProfile = async (next: ControllerProfile) => {
    cancelListening();
    setProfile(next);
    updateDraft(cloneProfile(next));
    await savePreference('activeControllerProfileId', next.id);
    setSavedMessage('');
  };

  const handleAutomaticProfile = async () => {
    activateAutoDetectedProfile();
    updateDraft(cloneProfile(useControllerStore.getState().profile));
    await savePreference('activeControllerProfileId', 'auto');
    setSavedMessage(t('controller.auto_detection', 'Automatic profile detection is enabled.'));
  };

  const handleConflict = (choice: 'replace' | 'swap' | 'cancel') => {
    if (!pendingConflict) return;
    const { control, index, other } = pendingConflict;
    if (choice === 'replace') {
      updateDraft((value) => {
        const buttons = { ...value.buttons };
        delete buttons[other];
        buttons[control] = index;
        return { ...value, buttons };
      });
    } else if (choice === 'swap') {
      updateDraft((value) => {
        const buttons = { ...value.buttons, [control]: index };
        if (value.buttons[control] === undefined) delete buttons[other];
        else buttons[other] = value.buttons[control];
        return { ...value, buttons };
      });
    }
    setPendingConflict(null);
    if (choice !== 'cancel') setCaptureMessage(t('controller.capture_success', 'Input captured. Apply changes to save the mapping.'));
    else setCaptureMessage('');
  };

  const startCalibration = (stick: 'left' | 'right') => {
    const current = getRawGamepadSnapshot();
    if (!controllerState.connected || !current) {
      setCaptureMessage(t('controller.connect_to_calibrate', 'Connect a controller before calibrating.'));
      return;
    }
    calibrationTargetRef.current = stick;
    axisDetectorRef.current.begin(current.axes);
    setCalibrating(stick);
    setCaptureMessage(t('controller.move_stick', 'Move the stick decisively in any direction (more than 60%).'));
  };

  const pressed = (control: SemanticControl) => Boolean(controllerState.buttons[control]?.pressed);
  const selectedBinding = selectedControl ? draft.buttons[selectedControl] : undefined;
  const leftRawX = rawSnapshot?.axes[draft.leftStick.xAxis] ?? 0;
  const leftRawY = rawSnapshot?.axes[draft.leftStick.yAxis] ?? 0;
  const rightConfig = draft.rightStick ?? { xAxis: 2, yAxis: 3, invertX: false, invertY: false, deadzone: draft.leftStick.deadzone };
  const rightRawX = rawSnapshot?.axes[rightConfig.xAxis] ?? 0;
  const rightRawY = rawSnapshot?.axes[rightConfig.yAxis] ?? 0;
  const isDirty = JSON.stringify(draft) !== JSON.stringify(profile);
  const sectionLabel = (id: ControllerSection) => t(sections.find((item) => item.id === id)?.key ?? id, id);
  const mappedControls = useMemo(() => ALL_SEMANTIC_CONTROLS.filter((control) => draft.buttons[control] !== undefined), [draft]);

  const exportProfile = (target: ControllerProfile) => {
    try {
      const url = URL.createObjectURL(new Blob([exportControllerProfile(target)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${target.name.normalize('NFKC').replace(/[^\p{L}\p{M}\p{N}-]+/gu, '-').toLowerCase() || 'controller-profile'}.json`;
      link.click(); URL.revokeObjectURL(url);
    } catch {
      setCaptureMessage(t('controller.export_error', 'Only valid custom profiles can be exported.'));
    }
  };

  const importProfile = async (file?: File) => {
    if (!file) return;
    const imported = importControllerProfile(await file.text());
    if (!imported) {
      setCaptureMessage(t('controller.import_error', 'That profile file is invalid or uses conflicting button assignments.'));
      return;
    }
    const now = nowIso();
    const importedProfile = { ...imported, id: `custom_${crypto.randomUUID()}`, name: `${imported.name} · ${t('controller.imported', 'Imported')}`, type: 'custom' as const, createdAt: now, updatedAt: now };
    if (!addCustomProfile(importedProfile)) {
      setCaptureMessage(t('controller.import_error', 'That profile could not be added.'));
      return;
    }
    try {
      await db.customProfiles.put(importedProfile);
      await selectProfile(importedProfile);
      setSection('overview');
      setCaptureMessage(t('controller.import_success', 'Profile imported and activated.'));
    } catch {
      deleteCustomProfile(importedProfile.id);
      setCaptureMessage(t('controller.import_error', 'That profile could not be saved.'));
    }
  };

  const duplicateProfile = async (target: ControllerProfile) => {
    const now = nowIso();
    const copy: ControllerProfile = { ...cloneProfile(target), id: `custom_${crypto.randomUUID()}`, name: `${target.name} · ${t('controller.copy', 'Copy')}`, type: 'custom', builtIn: false, createdAt: now, updatedAt: now };
    if (!addCustomProfile(copy)) return;
    try { await db.customProfiles.put(copy); await selectProfile(copy); }
    catch { deleteCustomProfile(copy.id); setCaptureMessage(t('controller.profile_save_error', 'Could not save profile changes.')); }
  };

  const deleteProfile = async () => {
    if (profile.builtIn) return;
    const current = profile;
    if (!deleteCustomProfile(current.id)) return;
    try {
      await db.customProfiles.delete(current.id);
      updateDraft(cloneProfile(useControllerStore.getState().profile));
      await savePreference('activeControllerProfileId', 'auto');
      setShowDelete(false);
      setSavedMessage(t('controller.profile_deleted', 'Custom profile deleted.'));
    } catch {
      addCustomProfile(current);
      setProfile(current);
      updateDraft(cloneProfile(current));
      setCaptureMessage(t('controller.profile_save_error', 'Could not delete profile.'));
    }
  };

  const controllerPoints: { control: SemanticControl; x: number; y: number; label: string; shape?: 'rect' }[] = [
    { control: 'LEFT_BUMPER', x: 154, y: 75, label: getControllerGlyph('LEFT_BUMPER', profile.type), shape: 'rect' },
    { control: 'RIGHT_BUMPER', x: 486, y: 75, label: getControllerGlyph('RIGHT_BUMPER', profile.type), shape: 'rect' },
    { control: 'LEFT_TRIGGER', x: 154, y: 39, label: getControllerGlyph('LEFT_TRIGGER', profile.type), shape: 'rect' },
    { control: 'RIGHT_TRIGGER', x: 486, y: 39, label: getControllerGlyph('RIGHT_TRIGGER', profile.type), shape: 'rect' },
    { control: 'VIEW', x: 275, y: 112, label: getControllerGlyph('VIEW', profile.type) },
    { control: 'MENU', x: 365, y: 112, label: getControllerGlyph('MENU', profile.type) },
    { control: 'DPAD_UP', x: 196, y: 160, label: '↑' },
    { control: 'DPAD_RIGHT', x: 216, y: 180, label: '→' },
    { control: 'DPAD_DOWN', x: 196, y: 200, label: '↓' },
    { control: 'DPAD_LEFT', x: 176, y: 180, label: '←' },
    { control: 'FACE_NORTH', x: 444, y: 150, label: getControllerGlyph('FACE_NORTH', profile.type) },
    { control: 'FACE_EAST', x: 466, y: 180, label: getControllerGlyph('FACE_EAST', profile.type) },
    { control: 'FACE_SOUTH', x: 444, y: 210, label: getControllerGlyph('FACE_SOUTH', profile.type) },
    { control: 'FACE_WEST', x: 422, y: 180, label: getControllerGlyph('FACE_WEST', profile.type) }
  ];

  const controlElement = (control: SemanticControl, x: number, y: number, label: string, shape?: 'rect') => {
    const selected = selectedControl === control;
    const active = pressed(control);
    return <g key={control} role="button" tabIndex={0} aria-label={`${controlLabel(control, t)} · ${label}`} aria-pressed={selected} className={`${styles.svgControl} ${active ? styles.svgPressed : ''} ${selected ? styles.svgSelected : ''}`} transform={shape === 'rect' ? `translate(${x - 25} ${y - 11})` : `translate(${x} ${y})`} onClick={() => { setSelectedControl(control); setSection('mapping'); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedControl(control); setSection('mapping'); } }}>
      {shape === 'rect' ? <rect width="50" height="22" rx="7" /> : <circle r="13" />}
      <text textAnchor="middle" dominantBaseline="central">{label}</text>
    </g>;
  };

  return (
    <AppShell>
      <div className={styles.page}>
        <header className={styles.hero}>
          <div><p className={styles.eyebrow}>{t('controller.instrument', 'INPUT CONFIGURATION')}</p><h1>{t('app.controller')}</h1><p>{t('controller.description', 'Tune your controls, confirm every input, and keep your attention on the court.')}</p></div>
          <div className={styles.heroTools}>
            {availableGamepads.length > 1 && <label className={styles.deviceSelect}><span>{t('controller.active_device', 'Active controller')}</span><select aria-label={t('controller.active_device', 'Active controller')} value={controllerState.index ?? ''} onChange={(event) => selectGamepad(Number(event.target.value))}>{availableGamepads.map((gamepad) => <option key={gamepad.index} value={gamepad.index}>{gamepad.id}</option>)}</select></label>}
            <div className={styles.heroStatus} data-connected={controllerState.connected}>
              <span className={styles.statusDot} /><div><strong>{controllerState.connected ? profile.name : t('controller.disconnected')}</strong><small>{controllerState.connected ? t('controller.connected') : t('controller.connect_instruction')}</small></div>
            </div>
          </div>
        </header>

        <div className={styles.workspace}>
          <nav className={styles.sectionNav} aria-label={t('controller.sections', 'Controller settings')}>
            <p>{t('controller.sections', 'CONTROLLER')}</p>
            {sections.map(({ id, icon: Icon }) => <button type="button" key={id} aria-current={section === id ? 'page' : undefined} className={section === id ? styles.navActive : ''} onClick={() => setSection(id)}><Icon size={17} /><span>{sectionLabel(id)}</span><ChevronRight size={15} /></button>)}
            <div className={styles.navProfile}><small>{t('controller.active_profile', 'ACTIVE PROFILE')}</small><strong>{profile.name}</strong><span>{t(`controller.type_${profile.type}`, profile.type)}</span></div>
          </nav>

          <main className={styles.centerPane}>
            {section === 'overview' && <>
              <div className={styles.panelTitle}><div><p className={styles.eyebrow}>{t('controller.live_input', 'LIVE INPUT')}</p><h2>{t('controller.controller_test', 'Controller test')}</h2></div><span className={controllerState.connected ? styles.onlineTag : styles.offlineTag}>{controllerState.connected ? t('controller.online', 'CONNECTED') : t('controller.waiting', 'WAITING')}</span></div>
              <div className={styles.controllerStage}>
                <svg viewBox="0 0 640 300" role="group" aria-label={t('controller.diagram_label', 'Interactive controller diagram. Select a control to inspect its mapping.')} className={styles.diagram}>
                  <path className={styles.controllerBody} d="M151 69C164 31 201 20 249 43c24 12 47 17 71 17s47-5 71-17c48-23 85-12 98 26l35 106c13 40-12 59-39 40l-54-39c-20-14-39-20-61-20H231c-22 0-41 6-61 20l-54 39c-27 19-52 0-39-40z" />
                  <path className={styles.gripLine} d="M134 100c-8 35-19 73-26 94M506 100c8 35 19 73 26 94" />
                  <circle className={styles.stickBase} cx="266" cy="168" r="30" /><circle className={styles.stickBase} cx="374" cy="168" r="30" />
                  <circle role="button" tabIndex={0} aria-label={controlLabel('LEFT_STICK_BUTTON', t)} aria-pressed={selectedControl === 'LEFT_STICK_BUTTON'} className={`${styles.stickButton} ${selectedControl === 'LEFT_STICK_BUTTON' ? styles.svgSelected : ''} ${pressed('LEFT_STICK_BUTTON') ? styles.stickPressed : ''}`} cx="266" cy="168" r="22" onClick={() => { setSelectedControl('LEFT_STICK_BUTTON'); setSection('mapping'); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedControl('LEFT_STICK_BUTTON'); setSection('mapping'); } }} />
                  <circle role="button" tabIndex={0} aria-label={controlLabel('RIGHT_STICK_BUTTON', t)} aria-pressed={selectedControl === 'RIGHT_STICK_BUTTON'} className={`${styles.stickButton} ${selectedControl === 'RIGHT_STICK_BUTTON' ? styles.svgSelected : ''} ${pressed('RIGHT_STICK_BUTTON') ? styles.stickPressed : ''}`} cx="374" cy="168" r="22" onClick={() => { setSelectedControl('RIGHT_STICK_BUTTON'); setSection('mapping'); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedControl('RIGHT_STICK_BUTTON'); setSection('mapping'); } }} />
                  <circle className={styles.stickDot} cx={266 + controllerState.leftStick.x * 15} cy={168 + controllerState.leftStick.y * 15} r="7" />
                  <circle className={styles.stickDot} cx={374 + controllerState.rightStick.x * 15} cy={168 + controllerState.rightStick.y * 15} r="7" />
                  <text className={styles.stickLabel} x="266" y="213" textAnchor="middle">L3</text><text className={styles.stickLabel} x="374" y="213" textAnchor="middle">R3</text>
                  {controllerPoints.map(({ control, x, y, label, shape }) => controlElement(control, x, y, label, shape))}
                  <rect className={styles.triggerFill} x="129" y="27" width="50" height="8" rx="4" style={{ transform: `scaleX(${rawSnapshot?.buttons[draft.buttons.LEFT_TRIGGER ?? -1]?.value ?? 0})`, transformOrigin: 'left center' }} />
                  <rect className={styles.triggerFill} x="461" y="27" width="50" height="8" rx="4" style={{ transform: `scaleX(${rawSnapshot?.buttons[draft.buttons.RIGHT_TRIGGER ?? -1]?.value ?? 0})`, transformOrigin: 'left center' }} />
                </svg>
                <div className={styles.diagramCaption}><span>{t('controller.physical_feedback', 'Live physical input')}</span><span>{t('controller.select_control', 'Select a control to inspect')}</span></div>
              </div>
              <div className={styles.stickPreviewGrid}>
                <StickMeter label={t('controller.left_stick', 'Left stick')} rawX={leftRawX} rawY={leftRawY} x={controllerState.leftStick.x} y={controllerState.leftStick.y} deadzone={draft.leftStick.deadzone} />
                <StickMeter label={t('controller.right_stick', 'Right stick')} rawX={rightRawX} rawY={rightRawY} x={controllerState.rightStick.x} y={controllerState.rightStick.y} deadzone={rightConfig.deadzone} />
              </div>
              <button type="button" className={styles.textAction} onClick={() => setSection('mapping')}>{t('controller.open_mapping', 'Review button mapping')}<ChevronRight size={16} /></button>
            </>}

            {section === 'mapping' && <>
              <div className={styles.panelTitle}><div><p className={styles.eyebrow}>{t('controller.bindings', 'BUTTON ASSIGNMENTS')}</p><h2>{t('controller.mapping', 'Mapping')}</h2></div><span className={styles.mappingCount}>{mappedControls.length} {t('controller.inputs', 'inputs')}</span></div>
              <div className={styles.mappingList}>{ALL_SEMANTIC_CONTROLS.map((control) => <button type="button" key={control} className={`${styles.mappingRow} ${selectedControl === control ? styles.mappingSelected : ''} ${pressed(control) ? styles.mappingPressed : ''}`} onClick={() => setSelectedControl(control)}><ControllerGlyph control={control} size="small" pressed={pressed(control)} type={profile.type} /><span>{controlLabel(control, t)}</span><span className={styles.mappingHint}>{controlActionLabel(control, t, gameplayBindings)}</span><strong>{draft.buttons[control] === undefined ? '—' : getControllerGlyph(control, profile.type)}</strong></button>)}</div>
            </>}

            {section === 'sticks' && <>
              <div className={styles.panelTitle}><div><p className={styles.eyebrow}>{t('controller.calibration', 'CALIBRATION')}</p><h2>{t('controller.sticks', 'Sticks')}</h2></div></div>
              <div className={styles.calibrationStack}>
                <section className={styles.calibrationCard}><div className={styles.calibrationHead}><div><h3>{t('controller.left_stick', 'Left stick')}</h3><p>{t('controller.left_stick_help', 'Calibrate raw axes and set a comfortable drift boundary.')}</p></div><button type="button" className={styles.button} disabled={!controllerState.connected} onClick={() => startCalibration('left')}>{calibrating === 'left' ? t('controller.move_now', 'Move now…') : t('controller.detect_axes', 'Detect axes')}</button></div><StickMeter label={t('controller.live_reading', 'Live reading')} rawX={leftRawX} rawY={leftRawY} x={controllerState.leftStick.x} y={controllerState.leftStick.y} deadzone={draft.leftStick.deadzone} /><label className={styles.rangeRow}><span>{t('controller.deadzone', 'Deadzone')}</span><input aria-label={`${t('controller.left_stick', 'Left stick')} ${t('controller.deadzone', 'Deadzone')}`} type="range" min="0.05" max="0.45" step="0.01" value={draft.leftStick.deadzone} onChange={(event) => updateDraft((value) => ({ ...value, leftStick: { ...value.leftStick, deadzone: Number(event.target.value) } }))} /><strong>{Math.round(draft.leftStick.deadzone * 100)}%</strong></label><div className={styles.inversionRow}><SettingsSwitch title={t('controller.invert_x', 'Invert horizontal axis')} checked={draft.leftStick.invertX} onChange={(checked) => updateDraft((value) => ({ ...value, leftStick: { ...value.leftStick, invertX: checked } }))} /><SettingsSwitch title={t('controller.invert_y', 'Invert vertical axis')} checked={draft.leftStick.invertY} onChange={(checked) => updateDraft((value) => ({ ...value, leftStick: { ...value.leftStick, invertY: checked } }))} /></div></section>
                <section className={styles.calibrationCard}><div className={styles.calibrationHead}><div><h3>{t('controller.right_stick', 'Right stick')}</h3><p>{t('controller.right_stick_help', 'Calibrate the second stick independently.')}</p></div><button type="button" className={styles.button} disabled={!controllerState.connected} onClick={() => startCalibration('right')}>{calibrating === 'right' ? t('controller.move_now', 'Move now…') : t('controller.detect_axes', 'Detect axes')}</button></div><StickMeter label={t('controller.live_reading', 'Live reading')} rawX={rightRawX} rawY={rightRawY} x={controllerState.rightStick.x} y={controllerState.rightStick.y} deadzone={rightConfig.deadzone} /><label className={styles.rangeRow}><span>{t('controller.deadzone', 'Deadzone')}</span><input aria-label={`${t('controller.right_stick', 'Right stick')} ${t('controller.deadzone', 'Deadzone')}`} type="range" min="0.05" max="0.45" step="0.01" value={rightConfig.deadzone} onChange={(event) => updateDraft((value) => ({ ...value, rightStick: { ...rightConfig, deadzone: Number(event.target.value) } }))} /><strong>{Math.round(rightConfig.deadzone * 100)}%</strong></label><div className={styles.inversionRow}><SettingsSwitch title={t('controller.invert_x', 'Invert horizontal axis')} checked={rightConfig.invertX} onChange={(checked) => updateDraft((value) => ({ ...value, rightStick: { ...rightConfig, invertX: checked } }))} /><SettingsSwitch title={t('controller.invert_y', 'Invert vertical axis')} checked={rightConfig.invertY} onChange={(checked) => updateDraft((value) => ({ ...value, rightStick: { ...rightConfig, invertY: checked } }))} /></div></section>
              </div>
            </>}

            {section === 'feedback' && <>
              <div className={styles.panelTitle}><div><p className={styles.eyebrow}>{t('controller.response', 'DEVICE RESPONSE')}</p><h2>{t('controller.feedback', 'Feedback')}</h2></div></div>
              <div className={styles.feedbackCard}><div className={styles.feedbackIcon}><Vibrate size={20} /></div><div className={styles.feedbackCopy}><h3>{t('settings.haptics', 'Haptic feedback')}</h3><p>{t('settings.haptics_hint', 'Subtle controller vibration for selection and confirmation.')}</p><span className={hapticManager.isAvailable() ? styles.capable : styles.unavailable}>{hapticManager.isAvailable() ? t('controller.haptics_available', 'Vibration capability detected') : t('controller.haptics_unavailable', 'This controller or browser does not report vibration support')}</span></div><button type="button" className={styles.button} disabled={!controllerState.connected || !preferenceHaptics || !hapticManager.isAvailable()} onClick={() => hapticManager.success()}>{t('controller.test_vibration', 'Test vibration')}</button></div>
              <div className={styles.switchPanel}><SettingsSwitch title={t('settings.haptics', 'Haptic feedback')} description={t('settings.haptics_hint', 'Subtle controller vibration for selection and confirmation.')} checked={preferenceHaptics} onChange={async (checked) => { if (await savePreference('hapticsEnabled', checked)) setHapticsEnabled(checked); }} /></div>
              <div className={styles.noticeCard}><strong>{t('controller.input_note_title', 'Input confirmation')}</strong><p>{t('controller.input_note', 'The controller diagram highlights physical button presses. Stick markers show raw movement and the normalized value used by scouting.')}</p></div>
            </>}

            {section === 'diagnostics' && <>
              <div className={styles.panelTitle}><div><p className={styles.eyebrow}>{t('controller.raw_signal', 'HARDWARE SIGNAL')}</p><h2>{t('controller.diagnostics', 'Diagnostics')}</h2></div><span className={styles.timestamp}>{rawSnapshot ? new Date(rawSnapshot.timestamp).toLocaleTimeString() : '—'}</span></div>
              <div className={styles.hardwareSummary}><div><small>{t('controller.device', 'DEVICE')}</small><strong>{rawSnapshot?.id ?? controllerState.id ?? t('controller.not_connected', 'Not connected')}</strong></div><div><small>{t('controller.index', 'GAMEPAD INDEX')}</small><strong>{rawSnapshot?.index ?? controllerState.index ?? '—'}</strong></div><div><small>{t('controller.mapping_type', 'MAPPING')}</small><strong>{rawSnapshot?.mapping || t('controller.custom_mapping', 'Custom / unknown')}</strong></div></div>
              <div className={styles.diagnosticSection}><h3>{t('controller.raw_buttons', 'Raw buttons')}</h3>{rawSnapshot ? <div className={styles.rawButtonGrid}>{rawSnapshot.buttons.map((button, index) => <div key={index} className={button.pressed ? styles.rawButtonPressed : styles.rawButton}><span>B{index}</span><strong>{button.value.toFixed(2)}</strong></div>)}</div> : <p className={styles.emptyHint}>{t('controller.connect_instruction')}</p>}</div>
              <div className={styles.diagnosticSection}><h3>{t('controller.raw_axes', 'Raw axes')}</h3>{rawSnapshot ? <div className={styles.axisGrid}>{rawSnapshot.axes.map((value, index) => <div key={index} className={styles.axisRow}><span>Axis {index}</span><div className={styles.axisTrack}><i style={{ left: `${((value + 1) / 2) * 100}%` }} /></div><code>{value.toFixed(3)}</code></div>)}</div> : <p className={styles.emptyHint}>{t('controller.connect_instruction')}</p>}</div>
            </>}

            {section === 'profiles' && <>
              <div className={styles.panelTitle}><div><p className={styles.eyebrow}>{t('controller.saved_setup', 'SAVED SETUPS')}</p><h2>{t('controller.profiles', 'Profiles')}</h2></div><button type="button" className={styles.button} onClick={() => void handleAutomaticProfile()}>{t('controller.auto_detect', 'Auto detect')}</button></div>
              <p className={styles.profileHint}>{t('controller.compatible_layout', 'WGP12S layout with A/B/X/Y labels. Controllers with the same layout are supported; use a custom profile to calibrate physical inputs.')}</p>
              <div className={styles.profileList}>{[...BUILT_IN_PROFILES, ...customProfiles].map((item) => <div key={item.id} className={`${styles.profileRow} ${item.id === profile.id ? styles.profileCurrent : ''}`}><button type="button" className={styles.profilePick} onClick={() => void selectProfile(item)}><span className={styles.profileGlyph}><Gamepad2 size={19} /></span><span><strong>{item.name}</strong><small>{t(`controller.type_${item.type}`, item.type)} {item.builtIn ? `· ${t('controller.built_in', 'Built-in')}` : `· ${t('controller.custom', 'Custom')}`}</small></span>{item.id === profile.id && <Check size={17} />}</button>{!item.builtIn && <button type="button" className={styles.iconAction} aria-label={`${t('controller.export', 'Export')} ${item.name}`} onClick={() => exportProfile(item)}><Download size={15} /></button>}</div>)}</div>
              <div className={styles.profileActions}><button type="button" className={styles.button} onClick={startWizard}><Gamepad2 size={16} />{t('controller.create_custom', 'Create custom profile')}</button><button type="button" className={styles.button} onClick={() => importInputRef.current?.click()}><Upload size={15} />{t('controller.import', 'Import')}</button><input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => { void importProfile(event.target.files?.[0]); event.currentTarget.value = ''; }} /></div>
              {wizardStarted && <section className={styles.wizardCard}><div className={styles.wizardHead}><div><p className={styles.eyebrow}>{t('controller.custom_wizard', 'CUSTOM PROFILE WIZARD')}</p><h3>{t('controller.step_of', 'Step {{step}} of {{total}}', { step: wizardStep + 1, total: ALL_SEMANTIC_CONTROLS.length })}</h3></div><button type="button" className={styles.iconAction} aria-label={t('common.cancel', 'Cancel')} onClick={() => { setWizardStarted(false); cancelListening(); }}><X size={17} /></button></div><label className={styles.wizardName}><span>{t('controller.profile_name', 'Profile name')}</span><input value={wizardName} onChange={(event) => { setWizardName(event.target.value); wizardNameRef.current = event.target.value; }} maxLength={48} /></label><p>{t('controller.press_control', 'Press the physical control for:')} <strong>{controlLabel(ALL_SEMANTIC_CONTROLS[wizardStep], t)}</strong></p><div className={styles.wizardProgress}><i style={{ width: `${(wizardStep / ALL_SEMANTIC_CONTROLS.length) * 100}%` }} /></div><button type="button" className={styles.button} disabled={!controllerState.connected || Boolean(listeningControl)} onClick={() => startListening(ALL_SEMANTIC_CONTROLS[wizardStep])}>{listeningControl ? t('controller.listening', 'Listening…') : t('controller.capture_input', 'Listen for input')}</button></section>}
              {!profile.builtIn && <div className={styles.profileManage}><label className={styles.renameField}><span>{t('controller.profile_name', 'Profile name')}</span><input value={draft.name} onChange={(event) => updateDraft((value) => ({ ...value, name: event.target.value }))} maxLength={48} /></label><button type="button" className={styles.button} onClick={() => void duplicateProfile(profile)}>{t('controller.duplicate', 'Duplicate')}</button><button type="button" className={styles.dangerButton} onClick={() => setShowDelete(true)}><Trash2 size={15} />{t('controller.delete_profile', 'Delete')}</button></div>}
            </>}
          </main>

          <aside className={styles.inspector}>
            {section === 'mapping' && selectedControl ? <>
              <p className={styles.eyebrow}>{t('controller.selected_input', 'SELECTED INPUT')}</p>
              <div className={styles.inspectorInput}><ControllerGlyph control={selectedControl} pressed={pressed(selectedControl)} type={profile.type} /><strong>{getControllerGlyph(selectedControl, profile.type)}</strong><span>{controlLabel(selectedControl, t)}</span></div>
              <div className={styles.inspectorRow}><span>{t('controller.current_action', 'Current assignment')}</span><strong>{controlActionLabel(selectedControl, t, gameplayBindings)}</strong></div>
              <div className={styles.inspectorRow}><span>{t('controller.binding_status', 'Binding')}</span><strong>{selectedBinding === undefined ? t('controller.unassigned', 'Unassigned') : t('controller.assigned', 'Assigned')}</strong></div>
              <button type="button" className={styles.primaryButton} disabled={!controllerState.connected || Boolean(listeningControl)} onClick={() => startListening(selectedControl)}>{listeningControl === selectedControl ? t('controller.listening', 'Listening…') : t('controller.change_binding', 'Change binding')}</button>
              <button type="button" className={styles.secondaryButton} onClick={() => updateDraft((value) => ({ ...value, buttons: { ...value.buttons, [selectedControl]: STANDARD_PROFILE.buttons[selectedControl] } }))}><RotateCcw size={14} />{t('controller.reset_binding', 'Reset binding')}</button>
              {listeningControl === selectedControl && <button type="button" className={styles.cancelCapture} onClick={cancelListening}><X size={14} />{t('common.cancel', 'Cancel')}</button>}
              {pendingConflict && <div className={styles.conflictBox}><strong>{t('controller.binding_conflict', 'Button already assigned')}</strong><span>{controlLabel(pendingConflict.other, t)} · {t('controller.button', 'Button')} {pendingConflict.index}</span><button type="button" onClick={() => handleConflict('replace')}>{t('controller.replace', 'Replace')}</button><button type="button" onClick={() => handleConflict('swap')}>{t('controller.swap', 'Swap')}</button><button type="button" onClick={() => handleConflict('cancel')}>{t('common.cancel', 'Cancel')}</button></div>}
            </> : <>
              <p className={styles.eyebrow}>{t('controller.profile_snapshot', 'PROFILE SNAPSHOT')}</p>
              <div className={styles.inspectorProfile}><Gamepad2 size={20} /><div><strong>{profile.name}</strong><span>{profile.builtIn ? t('controller.built_in_locked', 'Built-in · protected') : t('controller.custom_profile', 'Custom profile')}</span></div></div>
              <div className={styles.inspectorRow}><span>{t('controller.profile_type', 'Controller type')}</span><strong>{t(`controller.type_${profile.type}`, profile.type)}</strong></div>
              <div className={styles.inspectorRow}><span>{t('controller.detection', 'Profile selection')}</span><strong>{profileMode === 'automatic' ? t('controller.automatic', 'Automatic') : t('controller.manual', 'Manual')}</strong></div>
              <div className={styles.inspectorRow}><span>{t('controller.button_bindings', 'Button assignments')}</span><strong>{mappedControls.length}</strong></div>
              {savedMessage && <p className={styles.savedNotice} role="status"><Check size={15} />{savedMessage}</p>}
              {captureMessage && <p className={styles.captureNotice} role="status">{captureMessage}</p>}
              {isDirty && <div className={styles.applyBar}><button type="button" className={styles.primaryButton} onClick={() => void applyDraft()}><Save size={15} />{t('controller.apply_changes', 'Apply changes')}</button><button type="button" className={styles.secondaryButton} onClick={discardDraft}>{t('controller.discard', 'Discard')}</button></div>}
              {section !== 'overview' && <button type="button" className={styles.secondaryButton} onClick={() => navigate('/settings')}>{t('controller.more_settings', 'Open app settings')}<ChevronRight size={15} /></button>}
            </>}
            {section === 'overview' && <div className={styles.quickInputs}><p className={styles.eyebrow}>{t('controller.quick_map', 'QUICK MAP')}</p>{ALL_SEMANTIC_CONTROLS.slice(0, 8).map((control) => <button type="button" key={control} onClick={() => { setSelectedControl(control); setSection('mapping'); }} className={pressed(control) ? styles.quickPressed : ''}><ControllerGlyph control={control} size="small" type={profile.type} /><span>{controlLabel(control, t)}</span></button>)}<button type="button" className={styles.textAction} onClick={() => setSection('mapping')}>{t('controller.all_mappings', 'All assignments')}<ChevronRight size={14} /></button></div>}
          </aside>
        </div>

        <footer className={styles.bottomStrip}><span>{controllerState.connected ? `${profile.name} · ${t('controller.connected')}` : t('controller.connect_instruction')}</span><div>{controllerPoints.slice(4).map(({ control, label }) => <button type="button" key={control} className={pressed(control) ? styles.bottomControlPressed : styles.bottomControl} onClick={() => { setSelectedControl(control); setSection('mapping'); }}><b>{label}</b><span>{controlLabel(control, t)}</span></button>)}</div></footer>
      </div>

      {captureMessage && listeningControl && <div className={styles.listenBanner} role="status"><span className={styles.listenPulse} /><strong>{t('controller.listening', 'Press a controller button…')}</strong><span>{controlLabel(listeningControl, t)}</span><button type="button" aria-label={t('common.cancel', 'Cancel')} onClick={cancelListening}><X size={16} /></button></div>}
      {showDelete && <div className={styles.modalBackdrop}><section className={styles.deleteDialog} role="alertdialog" aria-modal="true" aria-labelledby="delete-profile-title"><p className={styles.eyebrow}>{t('controller.custom_profile', 'CUSTOM PROFILE')}</p><h2 id="delete-profile-title">{t('controller.delete_confirm_title', 'Delete this profile?')}</h2><p>{t('controller.delete_confirm_copy', 'This removes the saved custom profile from this device.')}</p><div><button type="button" className={styles.secondaryButton} onClick={() => setShowDelete(false)}>{t('common.cancel', 'Cancel')}</button><button type="button" className={styles.dangerButton} onClick={() => void deleteProfile()}>{t('controller.delete_profile', 'Delete profile')}</button></div></section></div>}
    </AppShell>
  );
}
