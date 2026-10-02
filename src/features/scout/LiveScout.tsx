import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useControllerStore } from '../../core/controller/ControllerStore';
import { useScoutStore } from '../../core/scouting/ScoutStore';
import { intentDispatcher, type ControllerIntent } from '../../core/controller/ControllerIntent';
import { getHysteresisSector } from '../../core/controller/RadialSelector';
import { RadialMenu, type RadialOptionItem } from '../radial/RadialMenu';
import { VOLLEYBALL_SKILLS } from '../../core/sports/volleyball/volleyball.skills';
import { VOLLEYBALL_ZONES } from '../../core/sports/volleyball/volleyball.zones';
import { VOLLEYBALL_RESULTS } from '../../core/sports/volleyball/volleyball.rules';
import { ControllerGlyph } from '../../components/ControllerGlyph';
import { hapticManager } from '../../core/controller/HapticManager';
import styles from './LiveScout.module.css';

type ActiveWheelType = 'SKILL' | 'ZONE' | 'RESULT' | 'TEAM_PLAYER';

export function LiveScout() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const ctrlState = useControllerStore((s) => s.state);
  const profile = useControllerStore((s) => s.profile);
  const scout = useScoutStore();

  const [activeWheel, setActiveWheel] = useState<ActiveWheelType | null>(null);
  const [selectedSectorIdx, setSelectedSectorIdx] = useState<number | null>(null);
  const [isPauseMenuOpen, setIsPauseMenuOpen] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  const activeSectorRef = useRef<number | null>(null);
  useEffect(() => {
    activeSectorRef.current = selectedSectorIdx;
  }, [selectedSectorIdx]);

  // 1. Screen Wake Lock implementation
  useEffect(() => {
    let wakeLock: any = null;
    const requestLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          setWakeLockActive(true);
        } catch {
          // Gracefully continue without wake lock
        }
      }
    };
    requestLock();

    return () => {
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, []);

  // 2. Options for radial wheels
  const wheelOptions: RadialOptionItem[] = useMemo(() => {
    if (activeWheel === 'SKILL') {
      return VOLLEYBALL_SKILLS.map((s) => ({
        id: s.id,
        label: t(s.i18nKey)
      }));
    }
    if (activeWheel === 'ZONE') {
      return VOLLEYBALL_ZONES.map((z) => ({
        id: z.id.toString(),
        label: `Z${z.id}`,
        subLabel: t(z.i18nKey)
      }));
    }
    if (activeWheel === 'RESULT') {
      return VOLLEYBALL_RESULTS.map((r) => ({
        id: r.value.toString(),
        label: r.label
      }));
    }
    if (activeWheel === 'TEAM_PLAYER') {
      const items: RadialOptionItem[] = [
        { id: 'TEAM_A', label: scout.teamA || t('team.a') },
        { id: 'TEAM_B', label: scout.teamB || t('team.b') }
      ];

      // If active team has players defined, include them
      const activePlayers =
        scout.activeTeam === 'A' ? scout.teamAPlayers : scout.teamBPlayers;
      if (activePlayers && activePlayers.length > 0) {
        for (const p of activePlayers.slice(0, 6)) {
          items.push({
            id: `PLAYER_${p.id}`,
            label: `#${p.number}`,
            subLabel: p.name
          });
        }
      }
      return items;
    }
    return [];
  }, [activeWheel, t, scout.teamA, scout.teamB, scout.activeTeam, scout.teamAPlayers, scout.teamBPlayers]);

  const wheelLabel = useMemo(() => {
    if (activeWheel === 'SKILL') return t('scout.skill');
    if (activeWheel === 'ZONE') return t('scout.zone');
    if (activeWheel === 'RESULT') return t('scout.result');
    if (activeWheel === 'TEAM_PLAYER') return t('scout.team_player', 'Team / Player');
    return '';
  }, [activeWheel, t]);

  // 3. Radial Commit / Cancel handler
  const handleWheelRelease = useCallback(
    (wheelType: ActiveWheelType) => {
      const sectorIdx = activeSectorRef.current;
      if (sectorIdx !== null && wheelOptions[sectorIdx]) {
        const item = wheelOptions[sectorIdx];

        if (wheelType === 'SKILL') {
          scout.updateCurrentEvent({ skill: item.id });
        } else if (wheelType === 'ZONE') {
          scout.updateCurrentEvent({ originZone: parseInt(item.id, 10) });
        } else if (wheelType === 'RESULT') {
          scout.updateCurrentEvent({ evaluation: parseInt(item.id, 10) as any });
        } else if (wheelType === 'TEAM_PLAYER') {
          if (item.id === 'TEAM_A') scout.setActiveTeam('A');
          else if (item.id === 'TEAM_B') scout.setActiveTeam('B');
          else if (item.id.startsWith('PLAYER_')) {
            scout.setSelectedPlayer(item.id.replace('PLAYER_', ''));
          }
        }
      }
      setActiveWheel(null);
      setSelectedSectorIdx(null);
    },
    [wheelOptions, scout]
  );

  // 4. Intent Dispatcher Subscriptions (Quick controls, D-Pad, Undo, Bookmarks)
  useEffect(() => {
    const unsubscribe = intentDispatcher.subscribe((intent: ControllerIntent) => {
      switch (intent.type) {
        case 'SELECT_TEAM_A':
          scout.setActiveTeam('A');
          break;
        case 'SELECT_TEAM_B':
          scout.setActiveTeam('B');
          break;
        case 'QUICK_RESULT_POSITIVE':
          scout.updateCurrentEvent({ evaluation: 1 });
          break;
        case 'QUICK_RESULT_NEUTRAL':
          scout.updateCurrentEvent({ evaluation: 0 });
          break;
        case 'QUICK_RESULT_NEGATIVE':
          scout.updateCurrentEvent({ evaluation: -1 });
          break;
        case 'UNDO_LAST_EVENT':
          scout.undoLastEvent();
          break;
        case 'PAUSE_SESSION':
          setIsPauseMenuOpen((prev) => !prev);
          break;
        case 'BOOKMARK_MOMENT':
          scout.addBookmark();
          break;
        case 'OPEN_RADIAL':
          setActiveWheel(intent.category);
          setSelectedSectorIdx(null);
          break;
      }
    });

    return unsubscribe;
  }, [scout]);

  // 5. Button Releases (Trigger Commit / Cancel)
  useEffect(() => {
    if (ctrlState.buttons.FACE_SOUTH.releasedThisFrame && activeWheel === 'SKILL') {
      handleWheelRelease('SKILL');
    }
    if (ctrlState.buttons.FACE_WEST.releasedThisFrame && activeWheel === 'ZONE') {
      handleWheelRelease('ZONE');
    }
    if (ctrlState.buttons.FACE_EAST.releasedThisFrame && activeWheel === 'RESULT') {
      handleWheelRelease('RESULT');
    }
    if (ctrlState.buttons.FACE_NORTH.releasedThisFrame && activeWheel === 'TEAM_PLAYER') {
      handleWheelRelease('TEAM_PLAYER');
    }
  }, [
    ctrlState.buttons.FACE_SOUTH.releasedThisFrame,
    ctrlState.buttons.FACE_WEST.releasedThisFrame,
    ctrlState.buttons.FACE_EAST.releasedThisFrame,
    ctrlState.buttons.FACE_NORTH.releasedThisFrame,
    activeWheel,
    handleWheelRelease
  ]);

  // 6. Angular Hysteresis Stick Selection while Radial is Open
  useEffect(() => {
    if (!activeWheel || wheelOptions.length === 0) return;

    const newSector = getHysteresisSector(
      ctrlState.leftStick.angle,
      ctrlState.leftStick.magnitude,
      wheelOptions.length,
      activeSectorRef.current
    );

    if (newSector !== activeSectorRef.current) {
      if (newSector !== null) {
        hapticManager.tick(null);
      }
      setSelectedSectorIdx(newSector);
    }
  }, [ctrlState.leftStick.angle, ctrlState.leftStick.magnitude, activeWheel, wheelOptions.length]);

  const activeOptionId =
    selectedSectorIdx !== null && wheelOptions[selectedSectorIdx]
      ? wheelOptions[selectedSectorIdx].id
      : null;

  return (
    <div className={styles.liveContainer}>
      {/* Top Bar Navigation / Header */}
      <header className={styles.topBar}>
        <div className={styles.brandGroup}>
          <span className={styles.brandTitle}>SP Stick</span>
          <span className={styles.sportBadge}>Volleyball</span>
        </div>

        {/* Global Match Scoreboard */}
        <div className={styles.scoreboard}>
          <div className={`${styles.teamScore} ${scout.activeTeam === 'A' ? styles.activeScore : ''}`}>
            <span className={styles.teamName}>{scout.teamA}</span>
            <span className={styles.scoreVal}>{scout.scoreA}</span>
          </div>

          <div className={styles.setIndicator}>
            <span className={styles.setLabel}>SET {scout.currentSet}</span>
          </div>

          <div className={`${styles.teamScore} ${scout.activeTeam === 'B' ? styles.activeScore : ''}`}>
            <span className={styles.scoreVal}>{scout.scoreB}</span>
            <span className={styles.teamName}>{scout.teamB}</span>
          </div>
        </div>

        {/* Controller Status Indicator */}
        <div className={styles.topActions}>
          <button
            className={styles.pauseBtn}
            onClick={() => setIsPauseMenuOpen(true)}
            title="Session Menu"
          >
            <ControllerGlyph control="MENU" />
          </button>
          <div className={styles.connectionStatus}>
            <span className={ctrlState.connected ? styles.dotConnected : styles.dotDisconnected} />
            <span className={styles.controllerName}>
              {ctrlState.connected ? profile.name : t('controller.disconnected')}
            </span>
          </div>
        </div>
      </header>

      {/* Main Scouting Surface */}
      <main className={styles.mainGrid}>
        {/* Match Focus / Video Area */}
        <section className={styles.matchFocusArea}>
          <div className={styles.courtFocus}>
            <div className={styles.netLine}>
              <span>NET</span>
            </div>
            <div className={styles.courtGrid}>
              <div className={styles.zoneMarker}>4</div>
              <div className={styles.zoneMarker}>3</div>
              <div className={styles.zoneMarker}>2</div>
              <div className={styles.zoneMarker}>5</div>
              <div className={styles.zoneMarker}>6</div>
              <div className={styles.zoneMarker}>1</div>
            </div>
            <p className={styles.focusNotice}>EYES ON GAME • HANDS ON CONTROLLER</p>
          </div>

          {/* Radial Overlay */}
          {activeWheel && (
            <RadialMenu
              options={wheelOptions}
              activeOptionId={activeOptionId}
              categoryLabel={wheelLabel}
              controllerHint={t('scout.release_hint', 'Release to commit')}
            />
          )}

          {/* Transient Save / Undo Toast Notification */}
          {scout.lastFeedback && (
            <div className={styles.floatingFeedback}>
              {scout.lastFeedback}
            </div>
          )}

          {scout.saveError && (
            <div className={styles.floatingError}>
              ⚠️ {scout.saveError}
            </div>
          )}
        </section>

        {/* Live Event Feedback Panel */}
        <aside className={styles.sidePanel}>
          {/* Active Team Selector Banner */}
          <div className={styles.activeTeamBanner}>
            <span className={styles.panelSectionTitle}>{t('scout.active_team', 'ACTIVE TEAM')}</span>
            <div className={styles.teamToggleRow}>
              <button
                className={`${styles.teamToggleBtn} ${scout.activeTeam === 'A' ? styles.teamBtnActive : ''}`}
                onClick={() => scout.setActiveTeam('A')}
              >
                <ControllerGlyph control="LEFT_BUMPER" />
                <span>{scout.teamA}</span>
              </button>
              <button
                className={`${styles.teamToggleBtn} ${scout.activeTeam === 'B' ? styles.teamBtnActive : ''}`}
                onClick={() => scout.setActiveTeam('B')}
              >
                <ControllerGlyph control="RIGHT_BUMPER" />
                <span>{scout.teamB}</span>
              </button>
            </div>
          </div>

          {/* Current Event Buffer Feedback */}
          <div className={styles.currentEventCard}>
            <span className={styles.panelSectionTitle}>{t('scout.current_event', 'CURRENT EVENT')}</span>
            <div className={styles.eventRowSlots}>
              {/* Skill Slot */}
              <div className={`${styles.eventSlot} ${scout.currentEvent.skill ? styles.slotFilled : styles.slotEmpty}`}>
                <span className={styles.slotLabel}>{t('scout.skill')}</span>
                <span className={styles.slotValue}>
                  {scout.currentEvent.skill
                    ? t(`skill.${scout.currentEvent.skill}`)
                    : '—'}
                </span>
                <ControllerGlyph control="FACE_SOUTH" className={styles.slotGlyph} />
              </div>

              {/* Zone Slot */}
              <div className={`${styles.eventSlot} ${scout.currentEvent.originZone ? styles.slotFilled : styles.slotEmpty}`}>
                <span className={styles.slotLabel}>{t('scout.zone')}</span>
                <span className={styles.slotValue}>
                  {scout.currentEvent.originZone ? `Z${scout.currentEvent.originZone}` : '—'}
                </span>
                <ControllerGlyph control="FACE_WEST" className={styles.slotGlyph} />
              </div>

              {/* Result Slot */}
              <div
                className={`${styles.eventSlot} ${
                  scout.currentEvent.evaluation !== undefined ? styles.slotFilled : styles.slotEmpty
                }`}
              >
                <span className={styles.slotLabel}>{t('scout.result')}</span>
                <span className={styles.slotValue}>
                  {scout.currentEvent.evaluation !== undefined
                    ? scout.currentEvent.evaluation > 0
                      ? '+1'
                      : scout.currentEvent.evaluation
                    : '—'}
                </span>
                <ControllerGlyph control="FACE_EAST" className={styles.slotGlyph} />
              </div>
            </div>
          </div>

          {/* Recent Events (3-6 latest) */}
          <div className={styles.recentSection}>
            <div className={styles.recentHeader}>
              <span className={styles.panelSectionTitle}>{t('scout.recent', 'RECENT')}</span>
              <button
                className={styles.undoBtn}
                onClick={() => scout.undoLastEvent()}
                title="Undo Last Event"
              >
                <ControllerGlyph control="DPAD_LEFT" />
                <span>{t('scout.undo_short', 'Undo')}</span>
              </button>
            </div>

            <div className={styles.recentList}>
              {scout.recentEvents.length === 0 ? (
                <div className={styles.emptyRecent}>{t('scout.no_events')}</div>
              ) : (
                scout.recentEvents.slice(0, 5).map((ev) => (
                  <div key={ev.id} className={styles.recentRow}>
                    <span className={styles.recentTeamBadge}>{ev.teamId}</span>
                    <span className={styles.recentSkill}>{t(`skill.${ev.skill}`)}</span>
                    <span className={styles.recentZone}>{ev.originZone ? `Z${ev.originZone}` : ''}</span>
                    <span
                      className={`${styles.recentEval} ${
                        (ev.evaluation ?? 0) > 0
                          ? styles.evalPos
                          : (ev.evaluation ?? 0) < 0
                          ? styles.evalNeg
                          : styles.evalNeu
                      }`}
                    >
                      {(ev.evaluation ?? 0) > 0 ? '+1' : ev.evaluation}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </main>

      {/* Bottom Status Bar */}
      <footer className={styles.bottomBar}>
        <div className={styles.bottomLeft}>
          <span className={styles.ctrlProfile}>{profile.name}</span>
          <span className={styles.separator}>•</span>
          <span className={ctrlState.connected ? styles.textSuccess : styles.textDanger}>
            {ctrlState.connected ? t('controller.connected') : t('controller.disconnected')}
          </span>
          {wakeLockActive && <span className={styles.wakeLockBadge}>WakeLock On</span>}
        </div>

        <div className={styles.bottomRight}>
          <span>{t('scout.events_count', 'Events')}: {scout.recentEvents.length}</span>
          <span className={styles.separator}>•</span>
          <button
            className={styles.bookmarkBtn}
            onClick={() => scout.addBookmark()}
            title="Bookmark Moment"
          >
            <ControllerGlyph control="RIGHT_STICK_BUTTON" /> 🔖
          </button>
        </div>
      </footer>

      {/* Pause / Session Menu Modal */}
      {isPauseMenuOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <h2>{t('session.menu_title', 'Session Menu')}</h2>
            <p className={styles.modalSubtitle}>{scout.sessionName}</p>

            <div className={styles.modalActions}>
              <button
                className={styles.modalBtnPrimary}
                onClick={() => setIsPauseMenuOpen(false)}
              >
                {t('session.resume', 'Resume Match')}
              </button>

              <button
                className={styles.modalBtn}
                onClick={async () => {
                  await scout.endSet();
                  setIsPauseMenuOpen(false);
                }}
              >
                {t('session.next_set', 'End Set & Start Next')}
              </button>

              <button
                className={styles.modalBtn}
                onClick={() => navigate('/review')}
              >
                {t('session.open_review', 'Event Review & Export')}
              </button>

              <button
                className={styles.modalBtn}
                onClick={() => navigate('/controller')}
              >
                {t('session.controller_settings', 'Controller Setup')}
              </button>

              <button
                className={styles.modalBtnDanger}
                onClick={async () => {
                  await scout.endMatch();
                  navigate('/');
                }}
              >
                {t('session.end_match', 'End Match')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
