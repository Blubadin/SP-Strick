import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useScoutStore } from '../core/scouting/ScoutStore';
import { useControllerStore } from '../core/controller/ControllerStore';
import { ControllerGlyph } from '../components/ControllerGlyph';
import type { Player } from '../core/persistence/database';
import styles from './CommonPage.module.css';

export default function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scout = useScoutStore();
  const ctrl = useControllerStore((s) => s.state);
  const profile = useControllerStore((s) => s.profile);

  const [teamA, setTeamA] = useState('Team A');
  const [teamB, setTeamB] = useState('Team B');
  const [teamAPlayersRaw, setTeamAPlayersRaw] = useState('');
  const [teamBPlayersRaw, setTeamBPlayersRaw] = useState('');
  const [showPlayerSetup, setShowPlayerSetup] = useState(false);
  const [testCompleted, setTestCompleted] = useState(false);

  const parsePlayers = (raw: string): Player[] => {
    if (!raw.trim()) return [];
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((item, idx) => {
        const numMatch = item.match(/\d+/);
        const number = numMatch ? parseInt(numMatch[0], 10) : idx + 1;
        const name = item.replace(/\d+/, '').trim() || undefined;
        return {
          id: crypto.randomUUID(),
          number,
          name
        };
      });
  };

  const handleStart = async () => {
    const playersA = parsePlayers(teamAPlayersRaw);
    const playersB = parsePlayers(teamBPlayersRaw);
    await scout.createSession(teamA.trim() || 'Team A', teamB.trim() || 'Team B', playersA, playersB);
    navigate('/scout');
  };

  return (
    <div className={styles.container}>
      <div className={styles.card} style={{ maxWidth: '520px' }}>
        <div className={styles.headerRow}>
          <h1>{t('setup.title', 'Match Setup')}</h1>
          <span className={styles.sportBadge}>Volleyball</span>
        </div>

        {/* Team Setup */}
        <div className={styles.grid2}>
          <div className={styles.formGroup}>
            <label>{t('setup.team_a', 'Team A Name')}</label>
            <input
              type="text"
              value={teamA}
              onChange={(e) => setTeamA(e.target.value)}
              className={styles.input}
              placeholder="e.g. Thailand"
            />
          </div>

          <div className={styles.formGroup}>
            <label>{t('setup.team_b', 'Team B Name')}</label>
            <input
              type="text"
              value={teamB}
              onChange={(e) => setTeamB(e.target.value)}
              className={styles.input}
              placeholder="e.g. Japan"
            />
          </div>
        </div>

        {/* Optional Player Setup Toggle */}
        <div style={{ marginBottom: '16px' }}>
          <button
            type="button"
            className={styles.toggleLink}
            onClick={() => setShowPlayerSetup((prev) => !prev)}
          >
            {showPlayerSetup ? '▲ Hide Player Setup' : '▼ Optional Player Setup (Roster)'}
          </button>

          {showPlayerSetup && (
            <div className={styles.playerSetupBox}>
              <div className={styles.formGroup}>
                <label style={{ fontSize: '0.8rem' }}>
                  {t('setup.players_a', 'Team A Players (comma-separated numbers/names)')}
                </label>
                <input
                  type="text"
                  value={teamAPlayersRaw}
                  onChange={(e) => setTeamAPlayersRaw(e.target.value)}
                  className={styles.input}
                  placeholder="e.g. 3 Pleumjit, 5 Pleumjit, 7 Hattaya, 10"
                />
              </div>

              <div className={styles.formGroup}>
                <label style={{ fontSize: '0.8rem' }}>
                  {t('setup.players_b', 'Team B Players (comma-separated numbers/names)')}
                </label>
                <input
                  type="text"
                  value={teamBPlayersRaw}
                  onChange={(e) => setTeamBPlayersRaw(e.target.value)}
                  className={styles.input}
                  placeholder="e.g. 1, 2, 4, 8, 12"
                />
              </div>
            </div>
          )}
        </div>

        {/* Controller Status & Test Preview */}
        <div className={styles.controllerPreviewCard}>
          <div className={styles.controllerHeader}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
              {ctrl.connected ? profile.name : t('controller.disconnected')}
            </span>
            <span className={ctrl.connected ? styles.badgeSuccess : styles.badgeDanger}>
              {ctrl.connected ? t('controller.connected') : t('controller.disconnected')}
            </span>
          </div>

          <div className={styles.quickTestRow}>
            <span>{t('setup.quick_test_hint', 'Quick Controller Test')}:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ControllerGlyph control="FACE_SOUTH" />
              <span>+ Left Stick</span>
              <button
                type="button"
                className={styles.testBtn}
                onClick={() => setTestCompleted(true)}
              >
                {testCompleted ? '✓ Controller Ready' : 'Test Pass'}
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <button onClick={handleStart} className={styles.primaryBtn}>
          {t('setup.start_match', 'Start Scouting Match')}
        </button>

        <button onClick={() => navigate('/')} className={styles.secondaryBtn}>
          {t('common.back', 'Back to Home')}
        </button>
      </div>
    </div>
  );
}
