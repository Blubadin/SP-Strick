import os

base_dir = "c:/Users/Sport-Science-R3909/Documents/Sp strick"

files = {
    "src/pages/SetupPage.tsx": """
import React, { useState } from 'react';
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
""",
    "src/pages/ControllerPage.tsx": """
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useControllerStore } from '../core/controller/ControllerStore';
import { useTranslation } from 'react-i18next';
import styles from './CommonPage.module.css';

export default function ControllerPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const ctrl = useControllerStore();

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>{t('app.controller')}</h1>
        
        {ctrl.state.connected ? (
          <div className={styles.statusBox}>
            <div className={styles.successIcon}>✓</div>
            <h2>{t('controller.connected')}</h2>
            <p>{ctrl.state.id}</p>
          </div>
        ) : (
          <div className={styles.statusBox}>
            <h2>{t('controller.connect_instruction')}</h2>
            <p>{t('controller.press_any')}</p>
          </div>
        )}
        
        <div className={styles.actions}>
           <button onClick={() => navigate('/')} className={styles.secondaryBtn}>Back</button>
        </div>
      </div>
    </div>
  );
}
""",
    "src/pages/ReviewPage.tsx": """
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../core/persistence/database';
import { ScoutingEvent } from '../core/scouting/ScoutingEvent';
import styles from './CommonPage.module.css';

export default function ReviewPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<ScoutingEvent[]>([]);

  useEffect(() => {
    db.events.orderBy('timestamp').reverse().toArray().then(setEvents);
  }, []);

  return (
    <div className={styles.container} style={{ alignItems: 'flex-start', paddingTop: 64 }}>
      <div className={styles.card} style={{ width: '90%', maxWidth: 1000 }}>
        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 24}}>
            <h1>Review</h1>
            <button onClick={() => navigate('/')} className={styles.secondaryBtn}>Home</button>
        </div>
        
        <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
            <thead>
                <tr>
                    <th>Time</th>
                    <th>Team</th>
                    <th>Skill</th>
                    <th>Zone</th>
                    <th>Result</th>
                </tr>
            </thead>
            <tbody>
                {events.map(ev => (
                    <tr key={ev.id}>
                        <td>{new Date(ev.timestamp).toLocaleTimeString()}</td>
                        <td>{ev.teamId}</td>
                        <td>{ev.skill}</td>
                        <td>{ev.originZone}</td>
                        <td>{ev.evaluation}</td>
                    </tr>
                ))}
            </tbody>
            </table>
        </div>
      </div>
    </div>
  );
}
""",
    "src/pages/SettingsPage.tsx": """
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './CommonPage.module.css';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>{t('app.settings')}</h1>
        
        <div className={styles.formGroup}>
          <label>{t('app.language')}</label>
          <select 
             value={i18n.language} 
             onChange={e => i18n.changeLanguage(e.target.value)}
             className={styles.input}
          >
             <option value="en">English</option>
             <option value="th">ภาษาไทย</option>
          </select>
        </div>
        
        <button onClick={() => navigate('/')} className={styles.secondaryBtn}>Back</button>
      </div>
    </div>
  );
}
""",
    "src/pages/CommonPage.module.css": """
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 32px;
  width: 100%;
  max-width: 480px;
  box-shadow: 0 8px 16px rgba(0,0,0,0.2);
}

.card h1 {
  margin-bottom: 24px;
  font-size: 1.5rem;
}

.formGroup {
  margin-bottom: 20px;
}

.formGroup label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-secondary);
}

.input {
  width: 100%;
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: 8px;
  font-size: 1rem;
}

.input:focus {
  outline: none;
  border-color: var(--accent);
}

.primaryBtn, .secondaryBtn {
  width: 100%;
  padding: 14px;
  border-radius: 8px;
  font-size: 1.1rem;
  font-weight: 500;
  margin-top: 12px;
  transition: all 0.2s;
}

.primaryBtn {
  background: var(--accent);
  color: #fff;
  border: none;
}

.primaryBtn:hover {
  filter: brightness(1.1);
}

.secondaryBtn {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.secondaryBtn:hover {
  background: var(--surface-hover);
}

.statusBox {
  text-align: center;
  padding: 32px 0;
}

.successIcon {
  font-size: 3rem;
  color: var(--success);
  margin-bottom: 16px;
}

.table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 16px;
}

.table th {
  text-align: left;
  padding: 12px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
}

.table td {
  padding: 12px;
  border-bottom: 1px solid var(--border);
}
"""
}

for path, content in files.items():
    full_path = os.path.join(base_dir, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
