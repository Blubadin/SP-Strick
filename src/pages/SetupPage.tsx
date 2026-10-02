import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScoutStore } from '../core/scouting/ScoutStore';
import styles from './CommonPage.module.css';

export default function SetupPage() {
  const navigate = useNavigate();
  const scout = useScoutStore();
  const [teamA, setTeamA] = useState('Team A');
  const [teamB, setTeamB] = useState('Team B');

  const handleStart = async () => {
    await scout.createSession(teamA, teamB);
    navigate('/scout');
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>Match Setup</h1>
        <div className={styles.formGroup}>
          <label>Team A</label>
          <input value={teamA} onChange={e => setTeamA(e.target.value)} className={styles.input} />
        </div>
        <div className={styles.formGroup}>
          <label>Team B</label>
          <input value={teamB} onChange={e => setTeamB(e.target.value)} className={styles.input} />
        </div>
        <button onClick={handleStart} className={styles.primaryBtn}>Start Match</button>
        <button onClick={() => navigate('/')} className={styles.secondaryBtn}>Back</button>
      </div>
    </div>
  );
}
