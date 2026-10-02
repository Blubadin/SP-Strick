import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../core/persistence/database';
import type { ScoutingEvent } from '../core/scouting/ScoutingEvent';
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
