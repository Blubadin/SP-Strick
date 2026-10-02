import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { db, type Session } from '../core/persistence/database';
import { useScoutStore } from '../core/scouting/ScoutStore';
import styles from './HomePage.module.css';

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const scout = useScoutStore();
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  useEffect(() => {
    // Check if there is an active match session that can be resumed
    const checkActiveSession = async () => {
      const active = await db.sessions
        .where('active')
        .equals(1 as any)
        .or('active')
        .equals(true as any)
        .reverse()
        .sortBy('updatedAt');

      if (active.length > 0) {
        setActiveSession(active[0]);
      } else {
        const latest = await db.sessions.orderBy('updatedAt').reverse().first();
        if (latest && latest.active !== false) {
          setActiveSession(latest);
        }
      }
    };

    checkActiveSession();
  }, []);

  const handleResume = async () => {
    if (activeSession) {
      await scout.loadSession(activeSession.id);
      navigate('/scout');
    }
  };

  const toggleLanguage = () => {
    const next = i18n.language === 'en' ? 'th' : 'en';
    i18n.changeLanguage(next);
  };

  return (
    <div className={styles.container}>
      <header className={styles.topNav}>
        <button className={styles.langBtn} onClick={toggleLanguage}>
          {i18n.language === 'en' ? '🇹🇭 ภาษาไทย' : '🇺🇸 English'}
        </button>
      </header>

      <main className={styles.content}>
        <div className={styles.brandBox}>
          <img
            src="/branding/sp-stick-logo.jpg"
            alt="SP Stick Logo"
            className={styles.logo}
          />
          <h1 className={styles.title}>SP Stick</h1>
          <p className={styles.tagline}>Eyes on Game • Hands on Controller</p>
        </div>

        <div className={styles.menu}>
          {activeSession && (
            <button className={styles.resumeBtn} onClick={handleResume}>
              <span className={styles.resumeIcon}>▶</span>
              <div className={styles.resumeInfo}>
                <span className={styles.resumeTitle}>{t('app.resume_session')}</span>
                <span className={styles.resumeMeta}>
                  {activeSession.name} • Set {activeSession.currentSet}
                </span>
              </div>
            </button>
          )}

          <button className={styles.btnPrimary} onClick={() => navigate('/setup')}>
            {t('app.new_session')}
          </button>

          <button className={styles.btn} onClick={() => navigate('/review')}>
            {t('app.sessions', 'Sessions & Review')}
          </button>

          <button className={styles.btn} onClick={() => navigate('/controller')}>
            {t('app.controller')}
          </button>

          <button className={styles.btn} onClick={() => navigate('/settings')}>
            {t('app.settings')}
          </button>
        </div>
      </main>

      <footer className={styles.footer}>
        <span>v0.1.0 MVP • Controller-First Sports Scouting</span>
      </footer>
    </div>
  );
}
