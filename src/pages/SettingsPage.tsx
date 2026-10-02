import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowDownToLine, ChevronRight, Database, Gamepad2, Languages, ShieldAlert } from 'lucide-react';
import AppShell from '../components/AppShell';
import SettingsSwitch from '../components/SettingsSwitch';
import { useControllerStore } from '../core/controller/ControllerStore';
import { db } from '../core/persistence/database';
import { usePreferencesStore } from '../core/preferences/PreferencesStore';
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
    autoScoreEnabled: state.autoScoreEnabled,
    reducedMotion: state.reducedMotion
  })));
  const savePreference = usePreferencesStore((state) => state.setPreference);
  const profile = useControllerStore((state) => state.profile);
  const setHapticsEnabled = useControllerStore((state) => state.setHapticsEnabled);
  const [confirmClear, setConfirmClear] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('');

  const setPreference = async (key: 'language' | 'audioFeedbackEnabled' | 'autoScoreEnabled' | 'reducedMotion', value: 'en' | 'th' | boolean) => {
    const saved = key === 'language'
      ? await savePreference('language', value as 'en' | 'th')
      : await savePreference(key, value as boolean);
    if (!saved) setNotice(t('settings.save_error', 'Could not save this preference. Try again.'));
    else setNotice('');
    return saved;
  };

  const changeHaptics = async (enabled: boolean) => {
    const saved = await savePreference('hapticsEnabled', enabled);
    if (saved) setHapticsEnabled(enabled);
    else setNotice(t('settings.save_error', 'Could not save this preference. Try again.'));
  };

  const exportSessions = async () => {
    setWorking(true);
    try {
      const [sessions, events, bookmarks] = await Promise.all([
        db.sessions.toArray(), db.events.toArray(), db.bookmarks.toArray()
      ]);
      downloadBackup({ format: 'sp-stick-backup', version: 1, exportedAt: new Date().toISOString(), sessions, events, bookmarks });
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
      await db.transaction('rw', [db.sessions, db.events, db.bookmarks], async () => {
        await Promise.all([db.sessions.clear(), db.events.clear(), db.bookmarks.clear()]);
      });
      useScoutStore.setState({
        status: 'IDLE', sessionId: null, matchId: null, sessionName: '', currentSet: 1,
        scoreA: 0, scoreB: 0, teamA: t('team.a', 'Team A'), teamB: t('team.b', 'Team B'),
        teamAPlayers: [], teamBPlayers: [], activeTeam: 'A', selectedPlayerId: undefined,
        currentEvent: {}, recentEvents: [], bookmarks: [], lastFeedback: null, saveError: null
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
            <SettingsSwitch title={t('settings.auto_score', 'Automatic point impact')} description={t('settings.auto_score_hint', 'Apply point impact for terminal volleyball results. You can adjust it in Review.')} checked={preferences.autoScoreEnabled} onChange={async (checked) => { const saved = await setPreference('autoScoreEnabled', checked); if (saved) useScoutStore.setState({ autoScoreEnabled: checked }); }} />
          </div>
        </section>

        <section className={styles.section} aria-labelledby="feedback-title">
          <div className={styles.sectionTitle}><span className={styles.soundIcon}>◖</span><div><h2 id="feedback-title">{t('settings.feedback', 'Feedback')}</h2><p>{t('settings.feedback_hint', 'Optional confirmation cues during live scouting.')}</p></div></div>
          <div className={styles.rows}>
            <SettingsSwitch title={t('settings.haptics', 'Haptic feedback')} description={t('settings.haptics_hint', 'Subtle controller vibration for selection and confirmation.')} checked={preferences.hapticsEnabled} onChange={(checked) => void changeHaptics(checked)} />
            <SettingsSwitch title={t('settings.audio', 'Audio confirmation')} description={t('settings.audio_hint', 'A quiet tone after an event is saved.')} checked={preferences.audioFeedbackEnabled} onChange={(checked) => void setPreference('audioFeedbackEnabled', checked)} />
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
