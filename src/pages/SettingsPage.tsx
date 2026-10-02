import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useControllerStore } from '../core/controller/ControllerStore';
import { useScoutStore } from '../core/scouting/ScoutStore';
import styles from './CommonPage.module.css';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const profile = useControllerStore((s) => s.profile);
  const deadzone = useControllerStore((s) => s.profile.leftStick.deadzone);
  const setDeadzone = useControllerStore((s) => s.setDeadzone);
  const hapticsEnabled = useControllerStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useControllerStore((s) => s.setHapticsEnabled);

  const scout = useScoutStore();
  const [audioFeedback, setAudioFeedback] = useState(false);

  return (
    <div className={styles.container} style={{ alignItems: 'flex-start', paddingTop: '32px' }}>
      <div className={styles.card} style={{ maxWidth: '640px', width: '92%' }}>
        <div className={styles.headerRow}>
          <h1>{t('app.settings')}</h1>
          <button onClick={() => navigate('/')} className={styles.secondaryBtn} style={{ width: 'auto', marginTop: 0 }}>
            {t('common.home', 'Home')}
          </button>
        </div>

        {/* SECTION 1: GENERAL */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--accent)', marginBottom: '12px' }}>
            {t('settings.general', 'General')}
          </h3>
          <div className={styles.formGroup}>
            <label>{t('app.language')}</label>
            <select
              value={i18n.language}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className={styles.input}
            >
              <option value="en">English</option>
              <option value="th">ภาษาไทย</option>
            </select>
          </div>
        </div>

        {/* SECTION 2: CONTROLLER */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--accent)', marginBottom: '12px' }}>
            {t('app.controller')}
          </h3>
          <div className={styles.formGroup}>
            <label>Active Profile</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                readOnly
                value={`${profile.name} (${profile.type})`}
                className={styles.input}
                style={{ opacity: 0.8 }}
              />
              <button
                type="button"
                className={styles.secondaryBtn}
                style={{ width: 'auto', marginTop: 0, whiteSpace: 'nowrap' }}
                onClick={() => navigate('/controller')}
              >
                Manage
              </button>
            </div>
          </div>

          <div className={styles.formGroup}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label>Analog Stick Deadzone</label>
              <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                {Math.round(deadzone * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.45"
              step="0.01"
              value={deadzone}
              onChange={(e) => setDeadzone(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* SECTION 3: SCOUTING */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--accent)', marginBottom: '12px' }}>
            Scouting Rules
          </h3>
          <div className={styles.formGroup}>
            <label>Active Sport</label>
            <input
              type="text"
              readOnly
              value="Volleyball (Standard 6-Zone)"
              className={styles.input}
              style={{ opacity: 0.8 }}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Scouting Profile</label>
            <input
              type="text"
              readOnly
              value="Volleyball Basic (Skill + Zone + Eval)"
              className={styles.input}
              style={{ opacity: 0.8 }}
            />
          </div>

          <div className={styles.formGroup} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <label style={{ marginBottom: 0 }}>Auto-Score on Terminal Events</label>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Award point impact automatically on Ace, Kill, or Error
              </p>
            </div>
            <button
              type="button"
              className={scout.autoScoreEnabled ? styles.badgeSuccess : styles.badgeDanger}
              onClick={() => useScoutStore.setState({ autoScoreEnabled: !scout.autoScoreEnabled })}
              style={{ cursor: 'pointer', border: 'none' }}
            >
              {scout.autoScoreEnabled ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>
        </div>

        {/* SECTION 4: FEEDBACK */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--accent)', marginBottom: '12px' }}>
            Feedback & Haptics
          </h3>
          <div className={styles.formGroup} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <label style={{ marginBottom: 0 }}>Haptic Vibration</label>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Vibration ticks for radial selection and commit
              </p>
            </div>
            <button
              type="button"
              className={hapticsEnabled ? styles.badgeSuccess : styles.badgeDanger}
              onClick={() => setHapticsEnabled(!hapticsEnabled)}
              style={{ cursor: 'pointer', border: 'none' }}
            >
              {hapticsEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className={styles.formGroup} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <label style={{ marginBottom: 0 }}>Audio Feedback</label>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Subtle audible click on event commit
              </p>
            </div>
            <button
              type="button"
              className={audioFeedback ? styles.badgeSuccess : styles.badgeDanger}
              onClick={() => setAudioFeedback(!audioFeedback)}
              style={{ cursor: 'pointer', border: 'none' }}
            >
              {audioFeedback ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* SECTION 5: APPEARANCE */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--accent)', marginBottom: '12px' }}>
            Appearance
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Theme: <strong>Dark Instrument Mode</strong> (optimized for low-fatigue live match scouting)
          </p>
        </div>

        <button onClick={() => navigate('/')} className={styles.secondaryBtn}>
          {t('common.back', 'Back')}
        </button>
      </div>
    </div>
  );
}
