import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ClipboardList, Gamepad2, Play, Plus } from 'lucide-react';
import AppShell from '../components/AppShell';
import { db, type Session } from '../core/persistence/database';
import { useScoutStore } from '../core/scouting/ScoutStore';
import styles from './HomePage.module.css';

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const loadSession = useScoutStore((s) => s.loadSession);
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  useEffect(() => {
    let current = true;
    void db.sessions.orderBy('updatedAt').reverse().toArray().then((sessions) => {
      const active = sessions.find((session) => session.status === 'active' || (session.status == null && session.active !== false));
      if (current) setActiveSession(active || null);
    });
    return () => { current = false; };
  }, []);

  const handleResume = async () => {
    if (!activeSession) return;
    const restored = await loadSession(activeSession.id);
    if (restored) navigate('/scout');
  };

  return (
    <AppShell>
      <div className={styles.page}>
        <section className={styles.intro}>
          <div className={styles.introCopy}>
            <p className={styles.eyebrow}>{t('home.eyebrow')}</p>
            <h1>{t('home.title')}</h1>
            <p className={styles.description}>{t('home.description')}</p>
          </div>
          <div className={styles.principle}>
            <span className={styles.principleRule} />
            <span>{t('app.tagline')}</span>
          </div>
        </section>

        {activeSession ? (
          <section className={styles.resumeSection} aria-labelledby="resume-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>{t('home.in_progress')}</p>
                <h2 id="resume-heading">{activeSession.name}</h2>
              </div>
              <button className={styles.resumeAction} onClick={handleResume}>
                <Play aria-hidden="true" size={16} fill="currentColor" />
                {t('app.resume_session')}
                <ArrowRight aria-hidden="true" size={16} />
              </button>
            </div>
            <div className={styles.matchMeta}>
              <span>{t('scout.set', { set: activeSession.currentSet })}</span>
              <span className={styles.metaDivider} />
              <span>{activeSession.teamA}</span>
              <strong>{activeSession.scoreA} <span>:</span> {activeSession.scoreB}</strong>
              <span>{activeSession.teamB}</span>
            </div>
          </section>
        ) : (
          <section className={styles.firstRun}>
            <span className={styles.firstRunIndex}>01</span>
            <div>
              <h2>{t('home.ready_title')}</h2>
              <p>{t('home.ready_description')}</p>
            </div>
          </section>
        )}

        <section className={styles.actions} aria-label={t('home.actions')}>
          <button className={styles.primaryAction} onClick={() => navigate('/setup')}>
            <span className={styles.actionIcon}><Plus aria-hidden="true" size={19} /></span>
            <span className={styles.actionText}>
              <strong>{t('app.new_session')}</strong>
              <small>{t('home.new_match_description')}</small>
            </span>
            <ArrowRight aria-hidden="true" size={18} />
          </button>
          <button className={styles.secondaryAction} onClick={() => navigate('/review')}>
            <ClipboardList aria-hidden="true" size={19} />
            <span className={styles.actionText}>
              <strong>{t('app.sessions')}</strong>
              <small>{t('home.review_description')}</small>
            </span>
            <ArrowRight aria-hidden="true" size={18} />
          </button>
        </section>

        <div className={styles.utilityLinks}>
          <button onClick={() => navigate('/controller')}><Gamepad2 aria-hidden="true" size={16} />{t('home.controller_link')}</button>
          <span />
          <button onClick={() => navigate('/settings')}>{t('home.settings_link')}</button>
        </div>
      </div>
    </AppShell>
  );
}
