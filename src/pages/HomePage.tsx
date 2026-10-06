import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  ClipboardList,
  Gamepad2,
  Play,
  Plus,
  Sliders,
  Radio
} from 'lucide-react';
import AppShell from '../components/AppShell';
import { ControllerGlyph } from '../components/ControllerGlyph';
import { db, type Session } from '../core/persistence/database';
import { useScoutStore } from '../core/scouting/ScoutStore';
import { useControllerStore } from '../core/controller/ControllerStore';
import { hapticManager } from '../core/controller/HapticManager';
import styles from './HomePage.module.css';

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const loadSession = useScoutStore((s) => s.loadSession);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const selectedIndexRef = useRef(0);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  const ctrlState = useControllerStore((s) => s.state);
  const profile = useControllerStore((s) => s.profile);

  useEffect(() => {
    let current = true;
    void db.sessions.orderBy('updatedAt').reverse().toArray().then((sessions) => {
      const active = sessions.find(
        (session) => session.status === 'active' || (session.status == null && session.active !== false)
      );
      if (current) setActiveSession(active || null);
    });
    return () => {
      current = false;
    };
  }, []);

  const handleResume = useCallback(async () => {
    if (activeSession) {
      const restored = await loadSession(activeSession.id);
      if (restored) navigate('/scout');
    } else {
      navigate('/scout');
    }
  }, [activeSession, loadSession, navigate]);

  const handleNewSession = useCallback(() => {
    navigate('/setup');
  }, [navigate]);

  const handleReview = useCallback(() => {
    navigate('/review');
  }, [navigate]);

  const handleControllerStation = useCallback(() => {
    navigate('/controller');
  }, [navigate]);

  const handleSettings = useCallback(() => {
    navigate('/settings');
  }, [navigate]);

  const executeCardAction = useCallback((index: number) => {
    switch (index) {
      case 0:
        void handleResume();
        break;
      case 1:
        handleNewSession();
        break;
      case 2:
        handleReview();
        break;
      case 3:
        handleControllerStation();
        break;
    }
  }, [handleResume, handleNewSession, handleReview, handleControllerStation]);

  const selectIndex = useCallback((nextIndex: number) => {
    if (nextIndex !== selectedIndexRef.current) {
      setSelectedIndex(nextIndex);
      void hapticManager.pulse(null, 25, 0.15, 0.15);
    }
  }, []);

  // Keyboard navigation support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const curr = selectedIndexRef.current;
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (curr === 2) selectIndex(0);
          else if (curr === 3) selectIndex(1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (curr === 0) selectIndex(2);
          else if (curr === 1) selectIndex(3);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (curr === 1) selectIndex(0);
          else if (curr === 3) selectIndex(2);
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (curr === 0) selectIndex(1);
          else if (curr === 2) selectIndex(3);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          executeCardAction(curr);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectIndex, executeCardAction]);

  // Gamepad controller navigation support
  const stickDebounceRef = useRef(0);
  useEffect(() => {
    const unsubscribe = useControllerStore.subscribe((store) => {
      const state = store.state;
      if (!state.connected) return;

      const curr = selectedIndexRef.current;
      const now = Date.now();

      // D-Pad navigation
      if (state.buttons.DPAD_UP?.pressedThisFrame) {
        if (curr === 2) selectIndex(0);
        else if (curr === 3) selectIndex(1);
      } else if (state.buttons.DPAD_DOWN?.pressedThisFrame) {
        if (curr === 0) selectIndex(2);
        else if (curr === 1) selectIndex(3);
      } else if (state.buttons.DPAD_LEFT?.pressedThisFrame) {
        if (curr === 1) selectIndex(0);
        else if (curr === 3) selectIndex(2);
      } else if (state.buttons.DPAD_RIGHT?.pressedThisFrame) {
        if (curr === 0) selectIndex(1);
        else if (curr === 2) selectIndex(3);
      }

      // Analog Left Stick flick navigation (250ms cooldown)
      if (now - stickDebounceRef.current > 250) {
        const ls = state.leftStick;
        if (ls.y < -0.5) {
          if (curr === 2) { selectIndex(0); stickDebounceRef.current = now; }
          else if (curr === 3) { selectIndex(1); stickDebounceRef.current = now; }
        } else if (ls.y > 0.5) {
          if (curr === 0) { selectIndex(2); stickDebounceRef.current = now; }
          else if (curr === 1) { selectIndex(3); stickDebounceRef.current = now; }
        } else if (ls.x < -0.5) {
          if (curr === 1) { selectIndex(0); stickDebounceRef.current = now; }
          else if (curr === 3) { selectIndex(2); stickDebounceRef.current = now; }
        } else if (ls.x > 0.5) {
          if (curr === 0) { selectIndex(1); stickDebounceRef.current = now; }
          else if (curr === 2) { selectIndex(3); stickDebounceRef.current = now; }
        }
      }

      // Face button and shortcut actions
      if (state.buttons.FACE_SOUTH?.pressedThisFrame) {
        executeCardAction(curr);
      } else if (state.buttons.FACE_NORTH?.pressedThisFrame) {
        handleControllerStation();
      } else if (state.buttons.MENU?.pressedThisFrame) {
        handleSettings();
      }
    });

    return () => unsubscribe();
  }, [selectIndex, executeCardAction, handleControllerStation, handleSettings]);

  return (
    <AppShell>
      <div className={styles.page}>
        {/* Mini Controller HUD Widget */}
        <section className={styles.controllerHudWidget} aria-label={t('home.controller_ready')}>
          <div className={styles.hudLeft}>
            <div className={`${styles.statusDot} ${ctrlState.connected ? styles.dotConnected : styles.dotStandby}`} />
            <div className={styles.hudInfo}>
              <span className={styles.hudStatusLabel}>
                {ctrlState.connected ? t('home.controller_ready') : t('home.controller_standby')}
              </span>
              <span className={styles.hudDeviceName}>
                {ctrlState.connected ? (profile.name || 'GAMEPAD DETECTED') : t('home.controller_connect_hint')}
              </span>
            </div>
          </div>
          <div className={styles.hudRight}>
            <button
              type="button"
              className={styles.hudTestBtn}
              onClick={handleControllerStation}
            >
              <Sliders size={14} aria-hidden="true" />
              <span>{t('home.test_controller')}</span>
              <ControllerGlyph control="FACE_NORTH" size="small" />
            </button>
          </div>
        </section>

        {/* Hero / Intro Header */}
        <section className={styles.intro}>
          <div className={styles.introCopy}>
            <p className={styles.eyebrow}>{t('home.eyebrow')}</p>
            <h1>{t('home.title')}</h1>
            <p className={styles.description}>{t('home.description')}</p>
          </div>
          <div className={styles.tacticalCourtMark}>
            <div className={styles.courtLines} aria-hidden="true">
              <span className={styles.courtNet} />
              <span className={styles.courtAttackLine} />
            </div>
            <span className={styles.tacticalBadge}>TACTICAL HUD</span>
          </div>
        </section>

        {/* Tactical Game Hub Grid (2x2) */}
        <section className={styles.hubGrid} aria-label={t('home.actions')}>
          {/* Card 0: Resume or Quick Scout */}
          <button
            type="button"
            className={`${styles.hubCard} ${selectedIndex === 0 ? styles.cardActive : ''}`}
            onClick={() => { setSelectedIndex(0); void handleResume(); }}
            onMouseEnter={() => setSelectedIndex(0)}
          >
            <div className={styles.cardHeader}>
              <div className={styles.cardIconWrap}>
                <Play size={20} fill="currentColor" />
              </div>
              <span className={`${styles.cardBadge} ${activeSession ? styles.badgeLive : ''}`}>
                {activeSession ? (
                  <>
                    <Radio size={12} className={styles.livePulse} />
                    {t('home.in_progress')}
                  </>
                ) : (
                  'QUICK'
                )}
              </span>
            </div>

            <div className={styles.cardContent}>
              <h2 className={styles.cardTitle}>
                {activeSession ? activeSession.name : t('home.card_quick_title')}
              </h2>
              {activeSession ? (
                <div className={styles.liveMatchSnippet}>
                  <div className={styles.matchTeams}>
                    <span>{activeSession.teamA}</span>
                    <strong className={styles.score}>{activeSession.scoreA} : {activeSession.scoreB}</strong>
                    <span>{activeSession.teamB}</span>
                  </div>
                  <span className={styles.setTag}>{t('scout.set', { set: activeSession.currentSet })}</span>
                </div>
              ) : (
                <p className={styles.cardDesc}>{t('home.card_quick_desc')}</p>
              )}
            </div>

            <div className={styles.cardFooter}>
              <span className={styles.controllerPrompt}>
                <ControllerGlyph control="FACE_SOUTH" size="small" />
                <span>{activeSession ? t('app.resume_session') : t('home.card_quick_title')}</span>
              </span>
              <ArrowRight size={16} className={styles.actionArrow} />
            </div>
          </button>

          {/* Card 1: New Match Setup */}
          <button
            type="button"
            className={`${styles.hubCard} ${selectedIndex === 1 ? styles.cardActive : ''}`}
            onClick={() => { setSelectedIndex(1); handleNewSession(); }}
            onMouseEnter={() => setSelectedIndex(1)}
          >
            <div className={styles.cardHeader}>
              <div className={styles.cardIconWrap}>
                <Plus size={20} />
              </div>
              <span className={styles.cardBadge}>MATCH SETUP</span>
            </div>

            <div className={styles.cardContent}>
              <h2 className={styles.cardTitle}>{t('home.card_setup_title')}</h2>
              <p className={styles.cardDesc}>{t('home.card_setup_desc')}</p>
            </div>

            <div className={styles.cardFooter}>
              <span className={styles.controllerPrompt}>
                <ControllerGlyph control="FACE_SOUTH" size="small" />
                <span>{t('app.new_session')}</span>
              </span>
              <ArrowRight size={16} className={styles.actionArrow} />
            </div>
          </button>

          {/* Card 2: Analytics & Review */}
          <button
            type="button"
            className={`${styles.hubCard} ${selectedIndex === 2 ? styles.cardActive : ''}`}
            onClick={() => { setSelectedIndex(2); handleReview(); }}
            onMouseEnter={() => setSelectedIndex(2)}
          >
            <div className={styles.cardHeader}>
              <div className={styles.cardIconWrap}>
                <ClipboardList size={20} />
              </div>
              <span className={styles.cardBadge}>DATABASE</span>
            </div>

            <div className={styles.cardContent}>
              <h2 className={styles.cardTitle}>{t('home.card_review_title')}</h2>
              <p className={styles.cardDesc}>{t('home.card_review_desc')}</p>
            </div>

            <div className={styles.cardFooter}>
              <span className={styles.controllerPrompt}>
                <ControllerGlyph control="FACE_SOUTH" size="small" />
                <span>{t('app.sessions')}</span>
              </span>
              <ArrowRight size={16} className={styles.actionArrow} />
            </div>
          </button>

          {/* Card 3: Controller Station */}
          <button
            type="button"
            className={`${styles.hubCard} ${selectedIndex === 3 ? styles.cardActive : ''}`}
            onClick={() => { setSelectedIndex(3); handleControllerStation(); }}
            onMouseEnter={() => setSelectedIndex(3)}
          >
            <div className={styles.cardHeader}>
              <div className={styles.cardIconWrap}>
                <Gamepad2 size={20} />
              </div>
              <span className={styles.cardBadge}>CALIBRATE</span>
            </div>

            <div className={styles.cardContent}>
              <h2 className={styles.cardTitle}>{t('home.card_controller_title')}</h2>
              <p className={styles.cardDesc}>{t('home.card_controller_desc')}</p>
            </div>

            <div className={styles.cardFooter}>
              <span className={styles.controllerPrompt}>
                <ControllerGlyph control="FACE_SOUTH" size="small" />
                <span>{t('home.card_controller_title')}</span>
              </span>
              <ArrowRight size={16} className={styles.actionArrow} />
            </div>
          </button>
        </section>

        {/* Controller Guide Bar (Bottom Navigation HUD) */}
        <footer className={styles.controllerGuideBar}>
          <div className={styles.guideItems}>
            <div className={styles.guideItem}>
              <div className={styles.guideGlyphs}>
                <ControllerGlyph control="DPAD_UP" size="small" />
                <ControllerGlyph control="DPAD_DOWN" size="small" />
              </div>
              <span>{t('home.guide_navigate')}</span>
            </div>
            <div className={styles.guideDivider} />
            <div className={styles.guideItem}>
              <ControllerGlyph control="FACE_SOUTH" size="small" />
              <span>{t('home.guide_select')}</span>
            </div>
            <div className={styles.guideDivider} />
            <div className={styles.guideItem}>
              <ControllerGlyph control="FACE_NORTH" size="small" />
              <span>{t('home.guide_controller')}</span>
            </div>
            <div className={styles.guideDivider} />
            <button
              type="button"
              className={styles.guideBtn}
              onClick={handleSettings}
            >
              <ControllerGlyph control="MENU" size="small" />
              <span>{t('home.guide_settings')}</span>
            </button>
          </div>
        </footer>
      </div>
    </AppShell>
  );
}
