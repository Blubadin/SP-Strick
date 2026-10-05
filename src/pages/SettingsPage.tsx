import { useRef, useState, useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowDownToLine, ChevronRight, Database, Gamepad2, Languages, ShieldAlert } from 'lucide-react';
import AppShell from '../components/AppShell';
import SettingsSwitch from '../components/SettingsSwitch';
import { useControllerStore } from '../core/controller/ControllerStore';
import { db } from '../core/persistence/database';
import { usePreferencesStore, DEFAULT_PREFERENCES, type Preferences, type PreferenceKey, type WheelSize } from '../core/preferences/PreferencesStore';
import { audioFeedbackManager } from '../core/preferences/AudioFeedbackManager';
import { hapticManager } from '../core/controller/HapticManager';
import { ALL_SEMANTIC_CONTROLS } from '../core/controller/ButtonStateMachine';
import { GAMEPLAY_ACTIONS, GAMEPLAY_ACTION_LABELS, type GameplayAction } from '../core/controller/GameplayBindings';
import { getControllerGlyph } from '../core/controller/ControllerProfile';
import type { ControllerProfile, SemanticControl } from '../core/controller/ControllerTypes';
import { ControllerGlyph } from '../components/ControllerGlyph';
import { useScoutStore } from '../core/scouting/ScoutStore';
import styles from './SettingsPage.module.css';

function downloadBackup(value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `sp-stick-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const preferences = usePreferencesStore(useShallow((state) => ({
    language: state.language,
    hapticsEnabled: state.hapticsEnabled,
    audioFeedbackEnabled: state.audioFeedbackEnabled,
    wheelSize: state.wheelSize,
    audioVolume: state.audioVolume,
    gameplayBindings: state.gameplayBindings,
    reducedMotion: state.reducedMotion
  })));
  const savePreference = usePreferencesStore((state) => state.setPreference);
  const profile = useControllerStore((state) => state.profile);
  const connected = useControllerStore((state) => state.state.connected);
  const audioReady = useSyncExternalStore(
    (listener) => audioFeedbackManager.subscribe(listener),
    () => audioFeedbackManager.isReady(),
    () => false
  );
  const setHapticsEnabled = useControllerStore((state) => state.setHapticsEnabled);
  const [confirmClear, setConfirmClear] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('');
  const controllerWrites = useRef<Promise<unknown>>(Promise.resolve());

  const enqueueControllerWrite = (command: () => Promise<unknown>) => {
    const next = controllerWrites.current.then(command);
    controllerWrites.current = next.catch(() => undefined);
    return next;
  };

  const setPreference = async <K extends PreferenceKey>(key: K, value: Preferences[K]) => {
    const saved = await savePreference(key, value);
    if (!saved) setNotice(t('settings.save_error', 'Could not save this preference. Try again.'));
    else setNotice('');
    return saved;
  };

  const changeShortcut = (control: SemanticControl, action: GameplayAction) =>
    enqueueControllerWrite(() => setPreference('gameplayBindings', { ...usePreferencesStore.getState().gameplayBindings, [control]: action }));

  const saveDeadzone = async (deadzone: number) => {
    const current = useControllerStore.getState().profile;
    const now = new Date().toISOString();
    const updated: ControllerProfile = {
      ...current,
      ...(current.builtIn ? { id: `custom_${crypto.randomUUID()}`, type: 'custom', builtIn: false, name: `${current.name} · ${t('controller.custom_suffix', 'Custom')}`, createdAt: now } : {}),
      leftStick: { ...current.leftStick, deadzone },
      updatedAt: now
    };
    try {
      await db.customProfiles.put(updated);
      const store = useControllerStore.getState();
      const accepted = current.builtIn ? store.addCustomProfile(updated) : store.updateCustomProfile(updated);
      if (!accepted) throw new Error('Invalid calibration');
      if (!await setPreference('activeControllerProfileId', updated.id)) return;
      store.setProfile(updated);
    } catch {
      setNotice(t('settings.save_error', 'Could not save this preference. Try again.'));
    }
  };

  const changeDeadzone = (deadzone: number) => enqueueControllerWrite(() => saveDeadzone(deadzone));

  const testAudio = async () => {
    audioFeedbackManager.setEnabled(preferences.audioFeedbackEnabled);
    audioFeedbackManager.setVolume(preferences.audioVolume);
    if (await audioFeedbackManager.unlock()) {
      audioFeedbackManager.playCommitTone();
      setNotice(t('settings.audio_test_done', 'Audio confirmation played.'));
    } else setNotice(t('settings.audio_test_unavailable', 'Audio is unavailable in this browser.'));
  };

  const changeHaptics = async (enabled: boolean) => {
    const saved = await savePreference('hapticsEnabled', enabled);
    if (saved) setHapticsEnabled(enabled);
    else setNotice(t('settings.save_error', 'Could not save this preference. Try again.'));
  };

  const exportSessions = async () => {
    setWorking(true);
    try {
      const [sessions, events, bookmarks, rallies, videoSources] = await Promise.all([
        db.sessions.toArray(), db.events.toArray(), db.bookmarks.toArray(), db.rallies.toArray(), db.videoSources.toArray()
      ]);
      downloadBackup({ format: 'sp-stick-backup', version: 2, exportedAt: new Date().toISOString(), sessions, events, bookmarks, rallies,
        videoSources: videoSources.map(({ fileHandle: _fileHandle, ...metadata }) => metadata)
      });
      setNotice(t('settings.export_done', 'Match data exported.'));
    } catch {
      setNotice(t('settings.export_error', 'Export failed. Please try again.'));
    } finally {
      setWorking(false);
    }
  };

  const clearLocalData = async () => {
    setWorking(true);
    try {
      await db.transaction('rw', [db.sessions, db.events, db.bookmarks, db.rallies, db.videoSources], async () => {
        await Promise.all([db.sessions.clear(), db.events.clear(), db.bookmarks.clear(), db.rallies.clear(), db.videoSources.clear()]);
      });
      useScoutStore.setState({
        status: 'IDLE', sessionId: null, matchId: null, sessionName: '', currentSet: 1,
        scoreA: 0, scoreB: 0, teamA: t('team.a', 'Team A'), teamB: t('team.b', 'Team B'),
        teamAPlayers: [], teamBPlayers: [], activeTeam: 'A', selectedPlayerId: undefined,
        currentEvent: {}, allEvents: [], recentEvents: [], rallies: [], currentRallyId: null, bookmarks: [], lastFeedback: null, saveError: null
      });
      setConfirmClear(false);
      setNotice(t('settings.clear_done', 'Saved match data was removed from this device.'));
    } catch {
      setNotice(t('settings.clear_error', 'Could not clear local match data.'));
    } finally {
      setWorking(false);
    }
  };

  return (
    <AppShell>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div><p className={styles.eyebrow}>{t('settings.eyebrow', 'PREFERENCES')}</p><h1>{t('app.settings')}</h1><p>{t('settings.description', 'Tune the scouting experience for your match day setup.')}</p></div>
        </header>

        <section className={styles.section} aria-labelledby="general-title">
          <div className={styles.sectionTitle}><Languages size={18} /><div><h2 id="general-title">{t('settings.general', 'General')}</h2><p>{t('settings.general_hint', 'Language and on-screen behavior.')}</p></div></div>
          <div className={styles.rows}>
            <label className={styles.selectRow}><span><strong>{t('app.language')}</strong><small>{t('settings.language_hint', 'Used throughout SP Stick.')}</small></span><select value={preferences.language} onChange={(event) => void setPreference('language', event.target.value as 'en' | 'th')}><option value="en">English</option><option value="th">ภาษาไทย</option></select></label>
            <SettingsSwitch title={t('settings.reduce_motion', 'Reduce motion')} description={t('settings.reduce_motion_hint', 'Limit interface movement and transitions.')} checked={preferences.reducedMotion} onChange={(checked) => void setPreference('reducedMotion', checked)} />
          </div>
        </section>

        <section className={styles.section} aria-labelledby="scouting-title">
          <div className={styles.sectionTitle}><Gamepad2 size={18} /><div><h2 id="scouting-title">{t('settings.match_behavior', 'Match behavior')}</h2><p>{t('settings.match_behavior_hint', 'The current sport and scoring rules are selected for volleyball.')}</p></div></div>
          <div className={styles.rows}>
            <div className={styles.infoRow}><span><strong>{t('app.controller')}</strong><small>{t('settings.active_profile', 'Active input profile')}</small></span><button type="button" className={styles.linkButton} onClick={() => navigate('/controller')}>{profile.name}<ChevronRight size={16} /></button></div>
            <label className={styles.selectRow}><span><strong>{t('settings.wheel_size', 'Wheel size')}</strong><small>{t('settings.wheel_size_hint', 'Larger wheels make live choices easier to read.')}</small></span><select aria-label={t('settings.wheel_size', 'Wheel size')} value={preferences.wheelSize} onChange={(event) => void setPreference('wheelSize', event.target.value as WheelSize)}><option value="normal">{t('settings.wheel_normal', 'Normal')}</option><option value="large">{t('settings.wheel_large', 'Large')}</option><option value="extraLarge">{t('settings.wheel_extra_large', 'Extra large')}</option></select></label>
            <label className={styles.selectRow}><span><strong>{t('settings.stick_deadzone', 'Stick deadzone')}</strong><small>{t('settings.stick_deadzone_hint', 'Ignore small movements around the left stick center.')}</small></span><span className={styles.rangeControl}><input aria-label={t('settings.stick_deadzone', 'Stick deadzone')} type="range" min="0.05" max="0.45" step="0.01" value={profile.leftStick.deadzone} onChange={(event) => void changeDeadzone(Number(event.target.value))} /><output>{Math.round(profile.leftStick.deadzone * 100)}%</output></span></label>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="shortcuts-title">
          <div className={styles.sectionTitle}><Gamepad2 size={18} /><div><h2 id="shortcuts-title">{t('settings.gameplay_shortcuts', 'Gameplay shortcuts')}</h2><p>{t('settings.gameplay_shortcuts_hint', 'Choose an action for each button. Physical calibration is saved in your controller profile.')}</p></div></div>
          <div className={styles.shortcutGrid}>{ALL_SEMANTIC_CONTROLS.map(control => <label key={control} className={styles.shortcutRow}><span><ControllerGlyph control={control} size="small" /><strong>{getControllerGlyph(control, profile.type)}</strong></span><select aria-label={t('settings.shortcut_action', '{{button}} action', { button: getControllerGlyph(control, profile.type) })} value={preferences.gameplayBindings[control]} onChange={event => void changeShortcut(control, event.target.value as GameplayAction)}>{GAMEPLAY_ACTIONS.map(action => <option key={action} value={action}>{t(`controller.gameplay.${action}`, GAMEPLAY_ACTION_LABELS[action])}</option>)}</select></label>)}</div>
          <div className={styles.shortcutFooter}><button type="button" className={styles.actionButton} onClick={() => void enqueueControllerWrite(() => setPreference('gameplayBindings', { ...DEFAULT_PREFERENCES.gameplayBindings }))}>{t('settings.reset_shortcuts', 'Reset shortcuts')}</button></div>
        </section>

        <section className={styles.section} aria-labelledby="feedback-title">
          <div className={styles.sectionTitle}><span className={styles.soundIcon}>◖</span><div><h2 id="feedback-title">{t('settings.feedback', 'Feedback')}</h2><p>{t('settings.feedback_hint', 'Optional confirmation cues during live scouting.')}</p></div></div>
          <div className={styles.rows}>
            <SettingsSwitch title={t('settings.haptics', 'Haptic feedback')} description={t('settings.haptics_hint', 'Subtle controller vibration for selection and confirmation.')} checked={preferences.hapticsEnabled} onChange={(checked) => void changeHaptics(checked)} />
            <div className={styles.infoRow}><span><strong>{t('settings.haptic_test', 'Test vibration')}</strong><small>{connected && hapticManager.isAvailable() ? t('controller.haptics_available', 'Vibration capability detected') : t('controller.haptics_unavailable', 'This controller or browser does not report vibration support')}</small></span><button type="button" className={styles.actionButton} disabled={!connected || !preferences.hapticsEnabled || !hapticManager.isAvailable()} onClick={() => hapticManager.success()}>{t('controller.test_vibration', 'Test vibration')}</button></div>
            <SettingsSwitch title={t('settings.audio', 'Audio confirmation')} description={t('settings.audio_hint', 'A quiet tone after an event is saved.')} checked={preferences.audioFeedbackEnabled} onChange={(checked) => { void setPreference('audioFeedbackEnabled', checked); if (checked) void audioFeedbackManager.unlock(); }} />
            <label className={styles.selectRow}><span><strong>{t('settings.audio_volume', 'Audio volume')}</strong><small>{t('settings.audio_volume_hint', 'Confirmation tone loudness.')}</small></span><span className={styles.rangeControl}><input aria-label={t('settings.audio_volume', 'Audio volume')} type="range" min="0" max="1" step="0.05" value={preferences.audioVolume} onChange={event => void setPreference('audioVolume', Number(event.target.value))} /><output>{Math.round(preferences.audioVolume * 100)}%</output></span></label>
            <div className={styles.infoRow}><span><strong>{t('settings.audio_test', 'Test audio')}</strong><small>{audioReady ? t('settings.audio_ready', 'Audio ready') : t('settings.audio_locked', 'Press Test audio to enable sound in this browser.')}</small></span><button type="button" className={styles.actionButton} disabled={!preferences.audioFeedbackEnabled || preferences.audioVolume === 0} onClick={() => void testAudio()}>{t('settings.audio_test', 'Test audio')}</button></div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="data-title">
          <div className={styles.sectionTitle}><Database size={18} /><div><h2 id="data-title">{t('settings.data', 'Local match data')}</h2><p>{t('settings.local_storage', 'SP Stick MVP stores scouting data locally in this browser and on this device.')}</p></div></div>
          <div className={styles.dataActions}>
            <div><strong>{t('settings.export_title', 'Export sessions')}</strong><small>{t('settings.export_hint', 'Download a JSON backup with saved matches, events, and bookmarks.')}</small></div>
            <button type="button" className={styles.actionButton} disabled={working} onClick={() => void exportSessions()}><ArrowDownToLine size={16} />{working ? t('common.working', 'Working…') : t('settings.export', 'Export backup')}</button>
          </div>
          <div className={`${styles.dataActions} ${styles.dangerRow}`}>
            <div><strong>{t('settings.clear_title', 'Clear local match data')}</strong><small>{t('settings.clear_hint', 'Remove saved matches, events, and bookmarks from this device.')}</small></div>
            <button type="button" className={styles.dangerButton} onClick={() => setConfirmClear(true)}><ShieldAlert size={16} />{t('settings.clear_button', 'Clear data')}</button>
          </div>
        </section>

        {notice && <p className={styles.notice} role="status">{notice}</p>}
        <p className={styles.footerNote}>{t('settings.version_note', 'Dark match mode · Volleyball · Stored on this device')}</p>
      </div>

      {confirmClear && <div className={styles.modalBackdrop}><section className={styles.confirmDialog} role="alertdialog" aria-modal="true" aria-labelledby="clear-dialog-title" aria-describedby="clear-dialog-copy">
        <div className={styles.dangerIcon}><ShieldAlert size={20} /></div><p className={styles.eyebrow}>{t('settings.confirm_eyebrow', 'LOCAL DATA')}</p><h2 id="clear-dialog-title">{t('settings.confirm_title', 'Clear saved match data?')}</h2><p id="clear-dialog-copy">{t('settings.confirm_copy', 'This permanently removes saved matches, recorded events, and bookmarks from this device.')}</p>
        <div className={styles.dialogActions}><button type="button" className={styles.actionButton} disabled={working} onClick={() => setConfirmClear(false)}>{t('common.cancel', 'Cancel')}</button><button type="button" className={styles.dangerButton} disabled={working} onClick={() => void clearLocalData()}>{t('settings.clear_confirm', 'Clear local data')}</button></div>
      </section></div>}
    </AppShell>
  );
}
