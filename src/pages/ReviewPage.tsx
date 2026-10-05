import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowDownToLine, ArrowLeft, Check, Pencil, Trash2, X } from 'lucide-react';
import AppShell from '../components/AppShell';
import { db, type Session } from '../core/persistence/database';
import type { ScoutingEvent } from '../core/scouting/ScoutingEvent';
import { useScoutStore } from '../core/scouting/ScoutStore';
import { formatVideoTime } from '../features/scout/rallyDisplay';
import { jsonForEvents, csvForEvents, resolvePlayer, sessionExportFilename } from './reviewData';
import styles from './ReviewPage.module.css';

type EventDraft = Pick<ScoutingEvent, 'teamId' | 'playerId' | 'skill' | 'originZone' | 'evaluation' | 'pointImpact'>;

const downloadText = (text: string, filename: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export default function ReviewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const liveSessionId = useScoutStore((state) => state.sessionId);
  const editEvent = useScoutStore((state) => state.editEvent);
  const deleteEvent = useScoutStore((state) => state.deleteEvent);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState(liveSessionId ?? '');
  const [events, setEvents] = useState<ScoutingEvent[]>([]);
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [skillFilter, setSkillFilter] = useState('ALL');
  const [editing, setEditing] = useState<ScoutingEvent | null>(null);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    void db.sessions.orderBy('updatedAt').reverse().toArray().then((list) => {
      if (!mounted) return;
      setSessions(list);
      setSelectedSessionId((current) => current || liveSessionId || list[0]?.id || '');
    });
    return () => { mounted = false; };
  }, [liveSessionId]);

  useEffect(() => {
    let mounted = true;
    if (!selectedSessionId) {
      return () => { mounted = false; };
    }
    void db.events.where('sessionId').equals(selectedSessionId).sortBy('timestamp').then((list) => {
      if (mounted) setEvents(list);
    });
    return () => { mounted = false; };
  }, [selectedSessionId]);

  const session = sessions.find((item) => item.id === selectedSessionId);
  const filteredEvents = useMemo(() => events.filter((event) =>
    (teamFilter === 'ALL' || event.teamId === teamFilter) &&
    (skillFilter === 'ALL' || event.skill === skillFilter)
  ), [events, teamFilter, skillFilter]);
  const eventCount = events.length;

  const exportEvents = (format: 'csv' | 'json') => {
    if (!session) return;
    const filename = sessionExportFilename(session, format);
    downloadText(
      format === 'csv' ? csvForEvents(events, session) : jsonForEvents(events),
      filename,
      format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'
    );
  };

  const beginEdit = (event: ScoutingEvent) => {
    setEditing(event);
    setDraft({
      teamId: event.teamId,
      playerId: event.playerId,
      skill: event.skill,
      originZone: event.originZone,
      evaluation: event.evaluation ?? 0,
      pointImpact: event.pointImpact ?? null
    });
  };

  const saveEdit = async () => {
    if (!editing || !draft) return;
    setSaving(true);
    try {
      await editEvent(editing.id, draft);
      const [refreshed, refreshedSessions] = await Promise.all([
        db.events.where('sessionId').equals(selectedSessionId).sortBy('timestamp'),
        db.sessions.orderBy('updatedAt').reverse().toArray()
      ]);
      setEvents(refreshed);
      setSessions(refreshedSessions);
      setEditing(null);
      setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  const removeEvent = async (event: ScoutingEvent) => {
    const player = resolvePlayer(session, event);
    if (!window.confirm(t('review.delete_confirm', 'Delete this event? This will update the match score history.') + `\n${t(`skill.${event.skill}`, event.skill)} · ${player}`)) return;
    await deleteEvent(event.id);
    setEvents((current) => current.filter((item) => item.id !== event.id));
    setSessions(await db.sessions.orderBy('updatedAt').reverse().toArray());
  };

  const teamName = (id: string) => id === 'A' ? session?.teamA ?? t('team.a') : session?.teamB ?? t('team.b');
  const options = [
    ['attack', 'skill.attack'], ['block', 'skill.block'], ['set', 'skill.set'],
    ['receive', 'skill.receive'], ['serve', 'skill.serve'], ['dig', 'skill.dig'], ['freeball', 'skill.freeball'], ['other', 'skill.other']
  ];
  const players = draft?.teamId === 'A' ? session?.teamAPlayers ?? [] : session?.teamBPlayers ?? [];

  return (
    <AppShell>
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>{t('review.eyebrow', 'MATCH RECORD')}</p>
            <h1>{t('review.title', 'Event Review')}</h1>
            <p className={styles.description}>{t('review.description', 'Review the recorded actions, adjust event details, and export the match record.')}</p>
          </div>
          <div className={styles.headerActions}>
            {liveSessionId && <button type="button" className={styles.button} onClick={() => navigate('/scout')}><ArrowLeft size={16} />{t('review.back_to_match', 'Back to live match')}</button>}
          </div>
        </header>

        <section className={styles.summary} aria-label={t('review.summary', 'Match summary')}>
          <label className={styles.sessionSelect}>
            <span>{t('review.match', 'Match')}</span>
            <select value={selectedSessionId} onChange={(event) => setSelectedSessionId(event.target.value)}>
              {!sessions.length && <option value="">{t('review.no_sessions', 'No saved matches')}</option>}
              {sessions.map((item) => <option key={item.id} value={item.id}>{item.teamA} vs {item.teamB} · {new Date(item.createdAt).toLocaleDateString()}</option>)}
            </select>
          </label>
          <div className={styles.scoreSummary}>
            <span className={styles.summaryLabel}>{t('review.final_score', 'Current set score')}</span>
            <strong>{session?.scoreA ?? 0}<span>–</span>{session?.scoreB ?? 0}</strong>
            <small>{t('scout.set', 'Set {{set}}', { set: session?.currentSet ?? 1 })}</small>
          </div>
          <div className={styles.eventSummary}>
            <strong>{eventCount}</strong><span>{t('scout.events_count', 'Events')}</span>
          </div>
          <div className={styles.exportActions}>
            <button type="button" className={styles.button} disabled={!session} onClick={() => exportEvents('csv')}><ArrowDownToLine size={15} />CSV</button>
            <button type="button" className={styles.button} disabled={!session} onClick={() => exportEvents('json')}><ArrowDownToLine size={15} />JSON</button>
          </div>
        </section>

        <section className={styles.eventsSection} aria-labelledby="events-title">
          <div className={styles.sectionHeader}>
            <div><h2 id="events-title">{t('review.events', 'Events')}</h2><span>{t('review.event_count', '{{count}} recorded', { count: filteredEvents.length })}</span></div>
            <div className={styles.filters}>
              <label><span>{t('review.filter_team', 'Team')}</span><select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}><option value="ALL">{t('review.all_teams', 'All teams')}</option><option value="A">{teamName('A')}</option><option value="B">{teamName('B')}</option></select></label>
              <label><span>{t('review.filter_skill', 'Skill')}</span><select value={skillFilter} onChange={(event) => setSkillFilter(event.target.value)}><option value="ALL">{t('review.all_skills', 'All skills')}</option>{options.map(([id, key]) => <option key={id} value={id}>{t(key, id)}</option>)}</select></label>
            </div>
          </div>

          {!filteredEvents.length ? (
            <div className={styles.emptyState}><div className={styles.emptyMark}>—</div><h3>{t('review.empty_title', 'No events to show')}</h3><p>{events.length ? t('review.empty_filter', 'Try changing the filters.') : t('review.empty_match', 'Events recorded for this match will appear here.')}</p></div>
          ) : (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>{t('review.time', 'Time')}</th><th>{t('review.set', 'Set')}</th><th>{t('review.team', 'Team')}</th><th>{t('review.player', 'Player')}</th><th>{t('review.skill', 'Skill')}</th><th>{t('review.zone', 'Zone')}</th><th>{t('review.result', 'Result')}</th><th>{t('review.point', 'Point')}</th><th><span className={styles.srOnly}>{t('review.actions', 'Actions')}</span></th></tr></thead>
                  <tbody>{filteredEvents.map((event) => <tr key={event.id}>
                    <td><div className={styles.timeDetails}><time>{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
                      {event.rallyNumber !== undefined && <small>{t('scout.rally_number', 'Rally {{number}}', { number: event.rallyNumber })} · #{event.actionIndex ?? '—'}</small>}
                      {event.videoTimeMs !== undefined && <small>▶ {formatVideoTime(event.videoTimeMs)}</small>}
                      {event.scoreBefore && <small>{event.scoreBefore.teamA}–{event.scoreBefore.teamB} → {event.scoreAfter?.teamA ?? event.scoreBefore.teamA}–{event.scoreAfter?.teamB ?? event.scoreBefore.teamB}</small>}
                    </div></td>
                    <td>{event.setNumber}</td><td><span className={styles.teamBadge} data-team={event.teamId}>{teamName(event.teamId)}</span></td>
                    <td>{resolvePlayer(session, event)}</td><td>{t(`skill.${event.skill}`, event.skill)}</td><td>{event.originZone ? `Z${event.originZone}` : '—'}</td>
                    <td><span className={styles.evaluation} data-value={event.evaluation ?? 0}>{event.evaluation === 0 ? t('result.pass', 'Pass') : event.evaluation === 1 ? '+1' : event.evaluation === -1 ? '−1' : '—'}</span></td>
                    <td>{event.pointImpact ? teamName(event.pointImpact === 'TEAM_A' ? 'A' : 'B') : '—'}</td>
                    <td><div className={styles.rowActions}><button type="button" aria-label={`${t('common.edit', 'Edit')} ${t(`skill.${event.skill}`, event.skill)}`} onClick={() => beginEdit(event)}><Pencil size={15} /></button><button type="button" aria-label={`${t('common.delete', 'Delete')} ${t(`skill.${event.skill}`, event.skill)}`} onClick={() => void removeEvent(event)}><Trash2 size={15} /></button></div></td>
                  </tr>)}</tbody>
                </table>
              </div>
              <div className={styles.mobileEvents}>{filteredEvents.map((event) => <article className={styles.eventCard} key={event.id}>
                <div className={styles.eventCardTop}><span>{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span><span>{t('review.set', 'Set')} {event.setNumber}{event.rallyNumber !== undefined ? ` · R${event.rallyNumber} #${event.actionIndex ?? '—'}` : ''}</span><span className={styles.teamBadge} data-team={event.teamId}>{teamName(event.teamId)}</span></div>
                <div className={styles.eventCardMain}><strong>{t(`skill.${event.skill}`, event.skill)}</strong><span>{event.originZone ? `Z${event.originZone}` : '—'} · {event.evaluation === 0 ? t('result.pass', 'Pass') : event.evaluation === 1 ? '+1' : event.evaluation === -1 ? '−1' : '—'}</span></div>
                {(event.videoTimeMs !== undefined || event.scoreBefore) && <div className={styles.mobileEventMeta}>{event.videoTimeMs !== undefined && <span>▶ {formatVideoTime(event.videoTimeMs)}</span>}{event.scoreBefore && <span>{event.scoreBefore.teamA}–{event.scoreBefore.teamB} → {event.scoreAfter?.teamA ?? event.scoreBefore.teamA}–{event.scoreAfter?.teamB ?? event.scoreBefore.teamB}</span>}</div>}
                <div className={styles.eventCardBottom}><span>{resolvePlayer(session, event)}</span><div className={styles.rowActions}><button type="button" aria-label={`${t('common.edit', 'Edit')} ${t(`skill.${event.skill}`, event.skill)}`} onClick={() => beginEdit(event)}><Pencil size={15} /></button><button type="button" aria-label={`${t('common.delete', 'Delete')} ${t(`skill.${event.skill}`, event.skill)}`} onClick={() => void removeEvent(event)}><Trash2 size={15} /></button></div></div>
              </article>)}</div>
            </>
          )}
        </section>
      </div>

      {editing && draft && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setEditing(null); setDraft(null); } }}>
        <section className={styles.editDialog} role="dialog" aria-modal="true" aria-labelledby="edit-event-title">
          <header><div><p className={styles.eyebrow}>{t('review.edit_eyebrow', 'EVENT DETAILS')}</p><h2 id="edit-event-title">{t('review.edit_title', 'Edit event')}</h2></div><button type="button" className={styles.closeButton} aria-label={t('common.close', 'Close')} onClick={() => { setEditing(null); setDraft(null); }}><X size={18} /></button></header>
          <div className={styles.editGrid}>
            <label><span>{t('review.team', 'Team')}</span><select value={draft.teamId} onChange={(event) => setDraft({ ...draft, teamId: event.target.value, playerId: undefined })}><option value="A">{teamName('A')}</option><option value="B">{teamName('B')}</option></select></label>
            <label><span>{t('review.player', 'Player')}</span><select value={draft.playerId ?? ''} onChange={(event) => setDraft({ ...draft, playerId: event.target.value || undefined })}><option value="">—</option>{players.map((player) => <option key={player.id} value={player.id}>#{player.number}{player.name ? ` ${player.name}` : ''}</option>)}</select></label>
            <label><span>{t('review.skill', 'Skill')}</span><select value={draft.skill} onChange={(event) => setDraft({ ...draft, skill: event.target.value })}>{options.map(([id, key]) => <option key={id} value={id}>{t(key, id)}</option>)}</select></label>
            <label><span>{t('review.zone', 'Zone')}</span><select value={draft.originZone ?? ''} onChange={(event) => setDraft({ ...draft, originZone: event.target.value ? Number(event.target.value) : undefined })}><option value="">—</option>{[1, 2, 3, 4, 5, 6].map((zone) => <option key={zone} value={zone}>Z{zone}</option>)}</select></label>
            <label><span>{t('review.result', 'Evaluation')}</span><select value={draft.evaluation ?? 0} onChange={(event) => setDraft({ ...draft, evaluation: Number(event.target.value) })}><option value="1">+1 · {t('result.positive', 'Positive')}</option><option value="0">0 · {t('result.neutral', 'Neutral')}</option><option value="-1">-1 · {t('result.negative', 'Negative')}</option></select></label>
            {editing.rallyId ? <label><span>{t('review.point_impact', 'Point impact')}</span><div className={styles.computedImpact}>{draft.evaluation === 0 ? t('review.no_point', 'No point') : teamName((draft.evaluation === 1 ? draft.teamId : draft.teamId === 'A' ? 'B' : 'A') ?? 'A')}</div></label> : <label><span>{t('review.point_impact', 'Point impact')}</span><select value={draft.pointImpact ?? ''} onChange={(event) => setDraft({ ...draft, pointImpact: (event.target.value || null) as EventDraft['pointImpact'] })}><option value="">{t('review.no_point', 'No point')}</option><option value="TEAM_A">{teamName('A')}</option><option value="TEAM_B">{teamName('B')}</option></select></label>}
          </div>
          <footer><button type="button" className={styles.button} onClick={() => { setEditing(null); setDraft(null); }}>{t('common.cancel', 'Cancel')}</button><button type="button" className={styles.primaryButton} disabled={saving} onClick={() => void saveEdit()}>{saving ? t('common.saving', 'Saving…') : <><Check size={16} />{t('common.save', 'Save changes')}</>}</button></footer>
        </section>
      </div>}
    </AppShell>
  );
}
