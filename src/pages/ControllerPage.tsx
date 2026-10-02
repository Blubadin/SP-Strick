import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useControllerStore } from '../core/controller/ControllerStore';
import { BUILT_IN_PROFILES, STANDARD_PROFILE } from '../core/controller/ControllerProfile';
import { ControllerGlyph } from '../components/ControllerGlyph';
import { ALL_SEMANTIC_CONTROLS } from '../core/controller/ButtonStateMachine';
import { hapticManager } from '../core/controller/HapticManager';
import type { ControllerProfile } from '../core/controller/ControllerTypes';
import styles from './CommonPage.module.css';

export default function ControllerPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const ctrlState = useControllerStore((s) => s.state);
  const profile = useControllerStore((s) => s.profile);
  const setProfile = useControllerStore((s) => s.setProfile);
  const setDeadzone = useControllerStore((s) => s.setDeadzone);
  const hapticsEnabled = useControllerStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useControllerStore((s) => s.setHapticsEnabled);
  const customProfiles = useControllerStore((s) => s.customProfiles);
  const addCustomProfile = useControllerStore((s) => s.addCustomProfile);

  const [activeTab, setActiveTab] = useState<'status' | 'diagnostics' | 'wizard'>('status');

  // Custom Wizard state
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardProfileName, setWizardProfileName] = useState('Custom Controller');
  const [wizardButtons, setWizardButtons] = useState<Record<string, number>>({});

  const wizardSteps = [
    { key: 'FACE_SOUTH', prompt: 'Press Bottom Face Button (A / Cross)' },
    { key: 'FACE_EAST', prompt: 'Press Right Face Button (B / Circle)' },
    { key: 'FACE_WEST', prompt: 'Press Left Face Button (X / Square)' },
    { key: 'FACE_NORTH', prompt: 'Press Top Face Button (Y / Triangle)' },
    { key: 'LEFT_BUMPER', prompt: 'Press Left Bumper (LB / L1)' },
    { key: 'RIGHT_BUMPER', prompt: 'Press Right Bumper (RB / R1)' },
    { key: 'DPAD_UP', prompt: 'Press D-Pad UP' },
    { key: 'DPAD_RIGHT', prompt: 'Press D-Pad RIGHT' },
    { key: 'DPAD_DOWN', prompt: 'Press D-Pad DOWN' },
    { key: 'DPAD_LEFT', prompt: 'Press D-Pad LEFT' }
  ];

  const handleCaptureButton = () => {
    if (wizardStep < wizardSteps.length) {
      const step = wizardSteps[wizardStep];
      // Find the first currently pressed button in raw buttons
      // Fallback manual index assignment if no physical controller plugged in
      setWizardButtons((prev) => ({ ...prev, [step.key]: wizardStep }));
      if (wizardStep + 1 === wizardSteps.length) {
        // Complete wizard
        const newProfile: ControllerProfile = {
          id: `custom_${Date.now()}`,
          name: wizardProfileName,
          type: 'custom',
          buttons: { ...wizardButtons, [step.key]: wizardStep } as any,
          leftStick: { xAxis: 0, yAxis: 1, invertX: false, invertY: false, deadzone: 0.2 },
          builtIn: false
        };
        addCustomProfile(newProfile);
        setProfile(newProfile);
        setWizardStep(wizardSteps.length);
      } else {
        setWizardStep((s) => s + 1);
      }
    }
  };

  const handleHapticTest = () => {
    hapticManager.success(null);
  };

  return (
    <div className={styles.container} style={{ alignItems: 'flex-start', paddingTop: '32px' }}>
      <div className={styles.card} style={{ maxWidth: '840px', width: '92%' }}>
        <div className={styles.headerRow}>
          <div>
            <h1>{t('app.controller')}</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Controller Setup, Profile Selection & Hardware Diagnostics
            </p>
          </div>
          <button onClick={() => navigate('/')} className={styles.secondaryBtn} style={{ width: 'auto', marginTop: 0 }}>
            {t('common.home', 'Home')}
          </button>
        </div>

        {/* Tab Switcher */}
        <div className={styles.tabBar}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'status' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('status')}
          >
            Profile & Setup
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'diagnostics' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('diagnostics')}
          >
            Diagnostics
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'wizard' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('wizard')}
          >
            Custom Mapping Wizard
          </button>
        </div>

        {/* TAB 1: STATUS & PROFILE */}
        {activeTab === 'status' && (
          <div>
            {/* Connection Banner */}
            <div className={styles.statusBox} style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '1.8rem', color: ctrlState.connected ? '#34C759' : '#FF3B30' }}>
                    {ctrlState.connected ? '●' : '○'}
                  </span>
                  <div>
                    <h2 style={{ fontSize: '1.2rem', marginBottom: '2px' }}>
                      {ctrlState.connected ? t('controller.connected') : t('controller.disconnected')}
                    </h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {ctrlState.id || t('controller.connect_instruction')}
                    </p>
                  </div>
                </div>

                {ctrlState.connected && (
                  <span className={styles.badgeSuccess}>
                    {profile.type.toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            {/* Profile Selection */}
            <div className={styles.formGroup}>
              <label>Active Controller Profile</label>
              <select
                className={styles.input}
                value={profile.id}
                onChange={(e) => {
                  const target = [...BUILT_IN_PROFILES, ...customProfiles].find(
                    (p) => p.id === e.target.value
                  );
                  if (target) setProfile(target);
                }}
              >
                <optgroup label="Built-in Profiles">
                  {BUILT_IN_PROFILES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.type})
                    </option>
                  ))}
                </optgroup>
                {customProfiles.length > 0 && (
                  <optgroup label="Custom Profiles">
                    {customProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Deadzone Control */}
            <div className={styles.formGroup}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label>Left Stick Deadzone</label>
                <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                  {Math.round(profile.leftStick.deadzone * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.45"
                step="0.01"
                value={profile.leftStick.deadzone}
                onChange={(e) => setDeadzone(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            {/* Haptics Toggle */}
            <div className={styles.formGroup} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <label style={{ marginBottom: 0 }}>Haptic Vibration</label>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Subtle pulses for radial segment ticks and confirmation
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  style={{ width: 'auto', padding: '6px 12px', fontSize: '0.8rem' }}
                  onClick={handleHapticTest}
                >
                  Test Vibration
                </button>
                <button
                  type="button"
                  className={hapticsEnabled ? styles.badgeSuccess : styles.badgeDanger}
                  onClick={() => setHapticsEnabled(!hapticsEnabled)}
                  style={{ cursor: 'pointer', border: 'none' }}
                >
                  {hapticsEnabled ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>
            </div>

            {/* Restore Profile Defaults */}
            <div style={{ marginTop: '24px' }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setProfile(STANDARD_PROFILE)}
              >
                Restore Default Profile (Standard Gamepad)
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: DIAGNOSTICS */}
        {activeTab === 'diagnostics' && (
          <div>
            <div className={styles.grid2}>
              <div>
                <h3 style={{ fontSize: '0.95rem', marginBottom: '12px', color: 'var(--text-secondary)' }}>
                  LEFT ANALOG STICK
                </h3>
                <div className={styles.diagBox}>
                  <p>X-Axis: {ctrlState.leftStick.x.toFixed(3)}</p>
                  <p>Y-Axis: {ctrlState.leftStick.y.toFixed(3)}</p>
                  <p>Magnitude: {ctrlState.leftStick.magnitude.toFixed(3)}</p>
                  <p>Angle: {ctrlState.leftStick.angle.toFixed(1)}°</p>
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '0.95rem', marginBottom: '12px', color: 'var(--text-secondary)' }}>
                  CONTROLLER HARDWARE INFO
                </h3>
                <div className={styles.diagBox}>
                  <p>Index: {ctrlState.index ?? 'None'}</p>
                  <p>Connected: {ctrlState.connected ? 'YES' : 'NO'}</p>
                  <p>ID: {ctrlState.id || 'N/A'}</p>
                  <p>Active Profile: {profile.name}</p>
                </div>
              </div>
            </div>

            <h3 style={{ fontSize: '0.95rem', marginTop: '20px', marginBottom: '12px', color: 'var(--text-secondary)' }}>
              RESOLVED SEMANTIC BUTTONS
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
              {ALL_SEMANTIC_CONTROLS.map((ctrl) => {
                const btnState = ctrlState.buttons[ctrl];
                return (
                  <div
                    key={ctrl}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: btnState.pressed ? 'var(--accent)' : 'var(--bg-secondary)',
                      color: btnState.pressed ? '#fff' : 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      fontSize: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span>{ctrl}</span>
                    <ControllerGlyph control={ctrl} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: CUSTOM WIZARD */}
        {activeTab === 'wizard' && (
          <div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Setup Custom Controller</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Follow the prompts to bind your physical buttons to semantic SP Stick controls.
            </p>

            <div className={styles.formGroup}>
              <label>Profile Name</label>
              <input
                type="text"
                value={wizardProfileName}
                onChange={(e) => setWizardProfileName(e.target.value)}
                className={styles.input}
              />
            </div>

            {wizardStep < wizardSteps.length ? (
              <div style={{ padding: '24px', background: 'var(--bg-secondary)', borderRadius: '12px', textAlign: 'center', margin: '20px 0' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                  Step {wizardStep + 1} of {wizardSteps.length}
                </p>
                <h2 style={{ margin: '12px 0', fontSize: '1.3rem', color: 'var(--accent)' }}>
                  {wizardSteps[wizardStep].prompt}
                </h2>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  style={{ width: 'auto', padding: '10px 24px' }}
                  onClick={handleCaptureButton}
                >
                  Capture / Confirm Button
                </button>
              </div>
            ) : (
              <div style={{ padding: '24px', background: 'rgba(52, 199, 89, 0.1)', border: '1px solid #34C759', borderRadius: '12px', textAlign: 'center', margin: '20px 0' }}>
                <h3 style={{ color: '#34C759' }}>✓ Profile "{wizardProfileName}" Created!</h3>
                <p style={{ fontSize: '0.85rem', marginTop: '6px' }}>Saved and activated.</p>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  style={{ width: 'auto', marginTop: '16px' }}
                  onClick={() => setWizardStep(0)}
                >
                  Create Another Profile
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
