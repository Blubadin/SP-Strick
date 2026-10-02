import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { db, type Session } from '../core/persistence/database';
import type { ScoutingEvent } from '../core/scouting/ScoutingEvent';
import { useScoutStore } from '../core/scouting/ScoutStore';
import styles from './CommonPage.module.css';

export default function ReviewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scout = useScoutStore();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(scout.sessionId || '');
  const [events, setEvents] = useState<ScoutingEvent[]>([]);
  const [filterTeam, setFilterTeam] = useState<string>('ALL');
  const [filterSkill, setFilterSkill] = useState<string>('ALL');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editEvaluation, setEditEvaluation] = useState<number>(0);

  // 1. Load Sessions
  useEffect(() => {
    db.sessions.orderBy('updatedAt').reverse().toArray().then((sessList) => {
      setSessions(sessList);
      if (!selectedSessionId && sessList.length > 0) {
        setSelectedSessionId(sessList[0].id);
      }
    });
  }, [selectedSessionId]);

  // 2. Load Session Events
  useEffect(() => {
    if (selectedSessionId) {
      db.events
        .where('sessionId')
        .equals(selectedSessionId)
        .reverse()
        .sortBy('timestamp')
        .then(setEvents);
    } else {
      setEvents([]);
    }
  }, [selectedSessionId]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId),
    [sessions, selectedSessionId]
  );

  // 3. Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (filterTeam !== 'ALL' && ev.teamId !== filterTeam) return false;
      if (filterSkill !== 'ALL' && ev.skill !== filterSkill) return false;
      return true;
    });
  }, [events, filterTeam, filterSkill]);

  // 4. Export Handlers
  const handleExportJSON = () => {
    if (!activeSession) return;
    const blob = new Blob([JSON.stringify(events, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const safeName = `${activeSession.teamA}-vs-${activeSession.teamB}`
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const filename = `sp-stick-volleyball-${safeName}-${dateStr}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    if (!activeSession) return;
    const headers = [
      'timestamp',
      'setNumber',
      'teamId',
      'playerId',
      'skill',
      'subSkill',
      'originZone',
      'targetZone',
      'evaluation',
      'pointImpact',
      'scoreBeforeA',
      'scoreBeforeB',
      'scoreAfterA',
      'scoreAfterB',
      'inputSource'
    ];

    const rows = events.map((e) => [
      new Date(e.timestamp).toISOString(),
      e.setNumber,
      e.teamId,
      e.playerId || '',
      e.skill,
      e.subSkill || '',
      e.originZone ?? '',
      e.targetZone ?? '',
      e.evaluation ?? '',
      e.pointImpact || '',
      e.scoreBefore?.teamA ?? '',
      e.scoreBefore?.teamB ?? '',
      e.scoreAfter?.teamA ?? '',
      e.scoreAfter?.teamB ?? '',
      e.inputSource
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const safeName = `${activeSession.teamA}-vs-${activeSession.teamB}`
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const filename = `sp-stick-volleyball-${safeName}-${dateStr}.csv`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteEvent = async (id: string) => {
    await scout.deleteEvent(id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const handleSaveEdit = async (id: string) => {
    await scout.editEvent(id, { evaluation: editEvaluation as any });
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, evaluation: editEvaluation } : e))
    );
    setEditingEventId(null);
  };

  return (
    <div className={styles.container} style={{ alignItems: 'flex-start', paddingTop: '32px' }}>
      <div className={styles.card} style={{ maxWidth: '1000px', width: '94%' }}>
        {/* Header */}
        <div className={styles.headerRow}>
          <div>
            <h1>{t('review.title', 'Event Review & History')}</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Filter, edit, and export session analytics
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {scout.sessionId && (
              <button
                onClick={() => navigate('/scout')}
                className={styles.primaryBtn}
                style={{ width: 'auto', marginTop: 0, padding: '8px 16px', fontSize: '0.9rem' }}
              >
                Back to Live Scout
              </button>
            )}
            <button
              onClick={() => navigate('/')}
              className={styles.secondaryBtn}
              style={{ width: 'auto', marginTop: 0, padding: '8px 16px', fontSize: '0.9rem' }}
            >
              {t('common.home', 'Home')}
            </button>
          </div>
        </div>

        {/* Session Selector & Filters */}
        <div className={styles.filterBar}>
          <div className={styles.formGroup} style={{ flex: 2, minWidth: '220px', marginBottom: 0 }}>
            <label style={{ fontSize: '0.75rem' }}>Selected Match Session</label>
            <select
              className={styles.input}
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({new Date(s.createdAt).toLocaleDateString()}) {s.active ? '• Active' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup} style={{ flex: 1, minWidth: '120px', marginBottom: 0 }}>
            <label style={{ fontSize: '0.75rem' }}>Filter Team</label>
            <select
              className={styles.input}
              value={filterTeam}
              onChange={(e) => setFilterTeam(e.target.value)}
            >
              <option value="ALL">All Teams</option>
              <option value="A">{activeSession?.teamA || 'Team A'}</option>
              <option value="B">{activeSession?.teamB || 'Team B'}</option>
            </select>
          </div>

          <div className={styles.formGroup} style={{ flex: 1, minWidth: '120px', marginBottom: 0 }}>
            <label style={{ fontSize: '0.75rem' }}>Filter Skill</label>
            <select
              className={styles.input}
              value={filterSkill}
              onChange={(e) => setFilterSkill(e.target.value)}
            >
              <option value="ALL">All Skills</option>
              <option value="attack">Attack</option>
              <option value="block">Block</option>
              <option value="set">Set</option>
              <option value="receive">Receive</option>
              <option value="serve">Serve</option>
              <option value="dig">Dig</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end' }}>
            <button
              onClick={handleExportCSV}
              className={styles.secondaryBtn}
              style={{ width: 'auto', marginTop: 0, padding: '10px 14px', fontSize: '0.85rem' }}
            >
              Export CSV
            </button>
            <button
              onClick={handleExportJSON}
              className={styles.secondaryBtn}
              style={{ width: 'auto', marginTop: 0, padding: '10px 14px', fontSize: '0.85rem' }}
            >
              Export JSON
            </button>
          </div>
        </div>

        {/* Events Table */}
        <div style={{ overflowX: 'auto', marginTop: '20px' }}>
          {filteredEvents.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              {t('scout.no_events', 'No events found in this session.')}
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Set</th>
                  <th>Team</th>
                  <th>Player</th>
                  <th>Skill</th>
                  <th>Zone</th>
                  <th>Evaluation</th>
                  <th>Impact</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td>{new Date(ev.timestamp).toLocaleTimeString()}</td>
                    <td>Set {ev.setNumber}</td>
                    <td style={{ fontWeight: 700, color: 'var(--accent)' }}>
                      {ev.teamId === 'A' ? activeSession?.teamA || 'A' : activeSession?.teamB || 'B'}
                    </td>
                    <td>{ev.playerId ? `#${ev.playerId}` : '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{ev.skill}</td>
                    <td>{ev.originZone ? `Z${ev.originZone}` : '—'}</td>
                    <td>
                      {editingEventId === ev.id ? (
                        <select
                          value={editEvaluation}
                          onChange={(e) => setEditEvaluation(parseInt(e.target.value, 10))}
                          className={styles.input}
                          style={{ padding: '2px 6px', fontSize: '0.8rem' }}
                        >
                          <option value="1">+1 (Positive)</option>
                          <option value="0">0 (Neutral)</option>
                          <option value="-1">-1 (Negative)</option>
                        </select>
                      ) : (
                        <span
                          style={{
                            fontWeight: 700,
                            color:
                              (ev.evaluation ?? 0) > 0
                                ? '#34C759'
                                : (ev.evaluation ?? 0) < 0
                                ? '#FF3B30'
                                : 'var(--text-secondary)'
                          }}
                        >
                          {(ev.evaluation ?? 0) > 0 ? '+1' : ev.evaluation}
                        </span>
                      )}
                    </td>
                    <td>{ev.pointImpact || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {editingEventId === ev.id ? (
                          <button
                            className={styles.actionBtn}
                            onClick={() => handleSaveEdit(ev.id)}
                            style={{ color: '#34C759' }}
                          >
                            Save
                          </button>
                        ) : (
                          <button
                            className={styles.actionBtn}
                            onClick={() => {
                              setEditingEventId(ev.id);
                              setEditEvaluation(ev.evaluation ?? 0);
                            }}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          className={styles.actionBtn}
                          onClick={() => handleDeleteEvent(ev.id)}
                          style={{ color: '#FF3B30' }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
