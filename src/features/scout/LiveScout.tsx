import { useEffect, useState, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useControllerStore } from '../../core/controller/ControllerStore';
import { useScoutStore } from '../../core/scouting/ScoutStore';
import { intentDispatcher, type ControllerIntent, type RadialCategory } from '../../core/controller/ControllerIntent';
import { getHysteresisSector } from '../../core/controller/RadialSelector';
import { RadialMenu, type RadialOptionItem } from '../radial/RadialMenu';
import { VOLLEYBALL_SKILLS } from '../../core/sports/volleyball/volleyball.skills';
import { VOLLEYBALL_ZONES } from '../../core/sports/volleyball/volleyball.zones';
import { VOLLEYBALL_RESULTS } from '../../core/sports/volleyball/volleyball.rules';
import { ControllerGlyph } from '../../components/ControllerGlyph';
import { hapticManager } from '../../core/controller/HapticManager';
import { db } from '../../core/persistence/database';
import type { ScoutingEvent } from '../../core/scouting/ScoutingEvent';
import { canCommitRadialSelection, getContextAfterDisconnect, routeLiveScoutIntent, type LiveScoutInteractionContext } from './LiveScoutInput';
import styles from './LiveScout.module.css';

type ActiveWheelType = 'SKILL' | 'ZONE' | 'RESULT' | 'TEAM_PLAYER';

export function LiveScout() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const ctrlState = useControllerStore(useShallow((s) => ({
    connected: s.state.connected,
    leftStick: s.state.leftStick,
    southReleased: s.state.buttons.FACE_SOUTH.releasedThisFrame,
    westReleased: s.state.buttons.FACE_WEST.releasedThisFrame,
    eastReleased: s.state.buttons.FACE_EAST.releasedThisFrame,
    northReleased: s.state.buttons.FACE_NORTH.releasedThisFrame
  })));
  const profile = useControllerStore((s) => s.profile);
  const scout = useScoutStore(useShallow((s) => ({
    sessionId: s.sessionId,
    sessionName: s.sessionName,
    currentSet: s.currentSet,
    scoreA: s.scoreA,
    scoreB: s.scoreB,
    teamA: s.teamA,
    teamB: s.teamB,
    teamAPlayers: s.teamAPlayers,
    teamBPlayers: s.teamBPlayers,
    activeTeam: s.activeTeam,
    currentEvent: s.currentEvent,
    recentEvents: s.recentEvents,
    lastFeedback: s.lastFeedback,
    saveError: s.saveError,
    setActiveTeam: s.setActiveTeam,
    setSelectedPlayer: s.setSelectedPlayer,
    updateCurrentEvent: s.updateCurrentEvent,
    undoLastEvent: s.undoLastEvent,
    editEvent: s.editEvent,
    endSet: s.endSet,
    endMatch: s.endMatch,
    addBookmark: s.addBookmark
  })));

  const [activeWheel, setActiveWheel] = useState<ActiveWheelType | null>(null);
  const [selectedSectorIdx, setSelectedSectorIdx] = useState<number | null>(null);
  const [isPauseMenuOpen, setIsPauseMenuOpen] = useState(false);
  const [isQuickEditOpen, setIsQuickEditOpen] = useState(false);
  const [quickEditChanges, setQuickEditChanges] = useState<Partial<ScoutingEvent>>({});
  const [quickEditFocusIndex, setQuickEditFocusIndex] = useState(1);
  const [quickEditSaving, setQuickEditSaving] = useState(false);
  const [quickEditError, setQuickEditError] = useState(false);
  const [pauseFocusIndex, setPauseFocusIndex] = useState(0);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [eventCount, setEventCount] = useState<{ sessionId: string | null; count: number }>({ sessionId: null, count: 0 });

  const activeSectorRef = useRef<number | null>(null);
  const activeWheelRef = useRef<ActiveWheelType | null>(null);
  const pauseMenuOpenRef = useRef(false);
  const quickEditOpenRef = useRef(false);
  const contextRef = useRef<LiveScoutInteractionContext>(ctrlState.connected ? 'LIVE_SCOUT' : 'DISCONNECTED');
  const quickEditChangesRef = useRef<Partial<ScoutingEvent>>({});
  const quickEditFocusRef = useRef(1);
  const pauseFocusRef = useRef(0);
  const syncInteractionContext = useCallback(() => {
    if (!useControllerStore.getState().state.connected) {
      contextRef.current = 'DISCONNECTED';
    } else if (pauseMenuOpenRef.current) {
      contextRef.current = 'PAUSE_MENU';
    } else if (quickEditOpenRef.current && activeWheelRef.current) {
      contextRef.current = 'QUICK_EDIT_RADIAL';
    } else if (quickEditOpenRef.current) {
      contextRef.current = 'QUICK_EDIT';
    } else if (activeWheelRef.current) {
      contextRef.current = 'RADIAL';
    } else {
      contextRef.current = 'LIVE_SCOUT';
    }
  }, []);

  const setWheelOpen = useCallback((category: ActiveWheelType | null) => {
    activeWheelRef.current = category;
    activeSectorRef.current = null;
    setActiveWheel(category);
    setSelectedSectorIdx(null);
    syncInteractionContext();
  }, [syncInteractionContext]);

  const setPauseMenuOpen = useCallback((open: boolean) => {
    pauseMenuOpenRef.current = open;
    if (open) {
      setWheelOpen(null);
      if (quickEditOpenRef.current) {
        quickEditOpenRef.current = false;
        setIsQuickEditOpen(false);
        quickEditChangesRef.current = {};
        setQuickEditChanges({});
      }
    }
    setIsPauseMenuOpen(open);
    syncInteractionContext();
  }, [setWheelOpen, syncInteractionContext]);

  const setQuickEditOpen = useCallback((open: boolean) => {
    quickEditOpenRef.current = open;
    if (open) {
      setWheelOpen(null);
      quickEditChangesRef.current = {};
      setQuickEditChanges({});
      quickEditFocusRef.current = 1;
      setQuickEditFocusIndex(1);
      setQuickEditError(false);
    } else {
      setWheelOpen(null);
    }
    setIsQuickEditOpen(open);
    syncInteractionContext();
  }, [setWheelOpen, syncInteractionContext]);

  const stageQuickEdit = useCallback((change: Partial<ScoutingEvent>) => {
    const next = { ...quickEditChangesRef.current, ...change };
    quickEditChangesRef.current = next;
    setQuickEditChanges(next);
  }, []);

  const cancelQuickEdit = useCallback(() => {
    setQuickEditOpen(false);
  }, [setQuickEditOpen]);

  const saveQuickEdit = useCallback(async () => {
    const state = useScoutStore.getState();
    const latestEvent = state.recentEvents[0];
    const changes = quickEditChangesRef.current;
    if (!latestEvent || Object.keys(changes).length === 0) {
      setQuickEditOpen(false);
      return;
    }

    setQuickEditSaving(true);
    setQuickEditError(false);
    try {
      await state.editEvent(latestEvent.id, changes);
      setQuickEditOpen(false);
    } catch {
      setQuickEditError(true);
    } finally {
      setQuickEditSaving(false);
    }
  }, [setQuickEditOpen]);

  const activatePauseMenuItem = useCallback((index = pauseFocusRef.current) => {
    const state = useScoutStore.getState();
    if (index === 0) {
      setPauseMenuOpen(false);
    } else if (index === 1) {
      void state.endSet().then(() => setPauseMenuOpen(false));
    } else if (index === 2) {
      setPauseMenuOpen(false);
      navigate('/review');
    } else if (index === 3) {
      setPauseMenuOpen(false);
      navigate('/controller');
    } else if (index === 4) {
      void state.endMatch().then(() => {
        setPauseMenuOpen(false);
        navigate('/');
      });
    }
  }, [navigate, setPauseMenuOpen]);

  const moveNavigationFocus = useCallback((direction: -1 | 1) => {
    const context = contextRef.current;
    if (context === 'PAUSE_MENU') {
      const next = (pauseFocusRef.current + direction + 5) % 5;
      pauseFocusRef.current = next;
      setPauseFocusIndex(next);
    } else if (context === 'QUICK_EDIT') {
      const next = (quickEditFocusRef.current + direction + 6) % 6;
      quickEditFocusRef.current = next;
      setQuickEditFocusIndex(next);
    }
  }, []);

  const activateQuickEditRadial = useCallback((category: RadialCategory) => {
    const focusIndex = quickEditFocusRef.current;
    if (category === 'SKILL' && focusIndex === 4) {
      void saveQuickEdit();
      return;
    }
    if ((category === 'SKILL' && focusIndex === 5) || (category === 'RESULT' && focusIndex === 5)) {
      cancelQuickEdit();
      return;
    }

    const fieldForCategory: Record<RadialCategory, number> = {
      TEAM_PLAYER: 0,
      SKILL: 1,
      ZONE: 2,
      RESULT: 3
    };
    if (focusIndex === fieldForCategory[category]) setWheelOpen(category);
  }, [cancelQuickEdit, saveQuickEdit, setWheelOpen]);

  const intentHandlerRef = useRef<(intent: ControllerIntent) => void>(() => undefined);

  // 1. Screen Wake Lock implementation follows page visibility and lifecycle.
  useEffect(() => {
    if (typeof navigator === 'undefined' || typeof document === 'undefined') return;

    let wakeLock: any = null;
    let disposed = false;
    let requestInFlight = false;
    let retryWhenReady = false;
    const releaseWakeLock = () => {
      const lock = wakeLock;
      wakeLock = null;
      setWakeLockActive(false);
      if (lock) void lock.release().catch(() => undefined);
    };
    const requestWakeLock = async () => {
      if (disposed || document.visibilityState !== 'visible' || !('wakeLock' in navigator) || wakeLock) return;
      if (requestInFlight) {
        retryWhenReady = true;
        return;
      }
      requestInFlight = true;
      try {
        const lock = await (navigator as any).wakeLock.request('screen');
        if (disposed || document.visibilityState !== 'visible') {
          void lock.release().catch(() => undefined);
          return;
        }
        wakeLock = lock;
        setWakeLockActive(true);
        lock.addEventListener?.('release', () => {
          if (wakeLock === lock) {
            wakeLock = null;
            setWakeLockActive(false);
          }
        });
      } catch {
        // Wake Lock is optional; scouting remains available without it.
      } finally {
        requestInFlight = false;
        const retry = retryWhenReady && !disposed && document.visibilityState === 'visible' && !wakeLock;
        retryWhenReady = false;
        if (retry) void requestWakeLock();
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        retryWhenReady = false;
        releaseWakeLock();
      }
      else void requestWakeLock();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    void requestWakeLock();
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      releaseWakeLock();
    };
  }, []);

  // A session's recentEvents list is intentionally capped; query the full count.
  useEffect(() => {
    let cancelled = false;
    if (!scout.sessionId) return () => { cancelled = true; };
    void db.events.where('sessionId').equals(scout.sessionId).count().then((count) => {
      if (!cancelled) setEventCount({ sessionId: scout.sessionId, count });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [scout.sessionId, scout.recentEvents]);

  // D-pad intents are translated above; the stick navigates the active modal at a steady repeat rate.
  useEffect(() => {
    let previousDirection: -1 | 0 | 1 = 0;
    let lastMoveAt = 0;
    const timer = window.setInterval(() => {
      const context = contextRef.current;
      if (context !== 'PAUSE_MENU' && context !== 'QUICK_EDIT') {
        previousDirection = 0;
        return;
      }
      const y = useControllerStore.getState().state.leftStick.y;
      const direction: -1 | 0 | 1 = y < -0.65 ? -1 : y > 0.65 ? 1 : 0;
      if (direction === 0) {
        previousDirection = 0;
        return;
      }
      const now = Date.now();
      if (direction !== previousDirection || now - lastMoveAt >= 260) {
        moveNavigationFocus(direction);
        previousDirection = direction;
        lastMoveAt = now;
      }
    }, 80);
    return () => window.clearInterval(timer);
  }, [moveNavigationFocus]);

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
      const eventTeam = scout.recentEvents[0]?.teamId;
      const selectedTeam = isQuickEditOpen
        ? String(quickEditChanges.teamId ?? eventTeam ?? scout.activeTeam)
        : scout.activeTeam;
      const items: RadialOptionItem[] = [
        { id: 'TEAM_A', label: scout.teamA || t('team.a') },
        { id: 'TEAM_B', label: scout.teamB || t('team.b') }
      ];

      // If active team has players defined, include them
      const activePlayers =
        selectedTeam === 'A' ? scout.teamAPlayers : scout.teamBPlayers;
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
  }, [activeWheel, isQuickEditOpen, t, scout.teamA, scout.teamB, scout.activeTeam, scout.teamAPlayers, scout.teamBPlayers, scout.recentEvents, quickEditChanges]);

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
      const controllerConnected = useControllerStore.getState().state.connected;
      if (!activeWheelRef.current || !canCommitRadialSelection(contextRef.current, controllerConnected)) return;

      const sectorIdx = activeSectorRef.current;
      if (sectorIdx !== null && wheelOptions[sectorIdx]) {
        const item = wheelOptions[sectorIdx];

        if (quickEditOpenRef.current) {
          if (wheelType === 'SKILL') stageQuickEdit({ skill: item.id });
          else if (wheelType === 'ZONE') stageQuickEdit({ originZone: Number.parseInt(item.id, 10) });
          else if (wheelType === 'RESULT') stageQuickEdit({ evaluation: Number.parseInt(item.id, 10) });
          else if (wheelType === 'TEAM_PLAYER') {
            if (item.id === 'TEAM_A' || item.id === 'TEAM_B') stageQuickEdit({ teamId: item.id.slice(-1), playerId: undefined });
            else if (item.id.startsWith('PLAYER_')) stageQuickEdit({ playerId: item.id.replace('PLAYER_', '') });
          }
        } else if (wheelType === 'SKILL') {
          void scout.updateCurrentEvent({ skill: item.id });
        } else if (wheelType === 'ZONE') {
          void scout.updateCurrentEvent({ originZone: Number.parseInt(item.id, 10) });
        } else if (wheelType === 'RESULT') {
          void scout.updateCurrentEvent({ evaluation: Number.parseInt(item.id, 10) });
        } else if (wheelType === 'TEAM_PLAYER') {
          if (item.id === 'TEAM_A') scout.setActiveTeam('A');
          else if (item.id === 'TEAM_B') scout.setActiveTeam('B');
          else if (item.id.startsWith('PLAYER_')) {
            scout.setSelectedPlayer(item.id.replace('PLAYER_', ''));
          }
        }
      }
      setWheelOpen(null);
    },
    [wheelOptions, scout, setWheelOpen, stageQuickEdit]
  );

  const handleIntent = useCallback((intent: ControllerIntent) => {
    const route = routeLiveScoutIntent(contextRef.current, intent);
    switch (route) {
      case 'OPEN_PAUSE_MENU': setPauseMenuOpen(true); break;
      case 'RESUME_PAUSE_MENU': setPauseMenuOpen(false); break;
      case 'OPEN_QUICK_EDIT':
        if (useScoutStore.getState().recentEvents.length > 0) setQuickEditOpen(true);
        break;
      case 'QUICK_EDIT_CANCEL': cancelQuickEdit(); break;
      case 'PAUSE_NAVIGATE_UP': moveNavigationFocus(-1); break;
      case 'PAUSE_NAVIGATE_DOWN': moveNavigationFocus(1); break;
      case 'PAUSE_SELECT': activatePauseMenuItem(); break;
      case 'PAUSE_BACK': setPauseMenuOpen(false); break;
      case 'QUICK_EDIT_NAVIGATE_UP': moveNavigationFocus(-1); break;
      case 'QUICK_EDIT_NAVIGATE_DOWN': moveNavigationFocus(1); break;
      case 'QUICK_EDIT_OPEN_RADIAL_SKILL': activateQuickEditRadial('SKILL'); break;
      case 'QUICK_EDIT_OPEN_RADIAL_ZONE': activateQuickEditRadial('ZONE'); break;
      case 'QUICK_EDIT_OPEN_RADIAL_RESULT': activateQuickEditRadial('RESULT'); break;
      case 'QUICK_EDIT_OPEN_RADIAL_TEAM_PLAYER': activateQuickEditRadial('TEAM_PLAYER'); break;
      case 'SCOUT_SELECT_TEAM_A': scout.setActiveTeam('A'); break;
      case 'SCOUT_SELECT_TEAM_B': scout.setActiveTeam('B'); break;
      case 'SCOUT_RESULT_POSITIVE': void scout.updateCurrentEvent({ evaluation: 1 }); break;
      case 'SCOUT_RESULT_NEUTRAL': void scout.updateCurrentEvent({ evaluation: 0 }); break;
      case 'SCOUT_RESULT_NEGATIVE': void scout.updateCurrentEvent({ evaluation: -1 }); break;
      case 'SCOUT_UNDO': void scout.undoLastEvent(); break;
      case 'SCOUT_BOOKMARK': void scout.addBookmark(); break;
      case 'OPEN_RADIAL_SKILL':
      case 'OPEN_RADIAL_ZONE':
      case 'OPEN_RADIAL_RESULT':
      case 'OPEN_RADIAL_TEAM_PLAYER': {
        if (!useControllerStore.getState().state.connected) break;
        const category: ActiveWheelType = route === 'OPEN_RADIAL_SKILL' ? 'SKILL'
          : route === 'OPEN_RADIAL_ZONE' ? 'ZONE'
            : route === 'OPEN_RADIAL_RESULT' ? 'RESULT' : 'TEAM_PLAYER';
        setWheelOpen(category);
        break;
      }
      case 'IGNORE': break;
    }
  }, [
    activatePauseMenuItem,
    activateQuickEditRadial,
    cancelQuickEdit,
    moveNavigationFocus,
    scout,
    setPauseMenuOpen,
    setQuickEditOpen,
    setWheelOpen
  ]);
  useLayoutEffect(() => {
    intentHandlerRef.current = handleIntent;
  }, [handleIntent]);

  // Subscribe once; refs keep this dispatcher and disconnect listener stable across renders.
  useEffect(() => {
    contextRef.current = useControllerStore.getState().state.connected ? 'LIVE_SCOUT' : 'DISCONNECTED';
    const unsubscribeIntent = intentDispatcher.subscribe((intent) => intentHandlerRef.current(intent));
    const unsubscribeController = useControllerStore.subscribe((store, previousStore) => {
      const connected = store.state.connected;
      const wasConnected = previousStore.state.connected;
      if (!connected) {
        activeWheelRef.current = null;
        activeSectorRef.current = null;
        setActiveWheel(null);
        setSelectedSectorIdx(null);
        contextRef.current = getContextAfterDisconnect(contextRef.current);
      } else if (!wasConnected) {
        activeWheelRef.current = null;
        activeSectorRef.current = null;
        setActiveWheel(null);
        setSelectedSectorIdx(null);
        syncInteractionContext();
      }
    });
    return () => {
      unsubscribeIntent();
      unsubscribeController();
    };
  }, [syncInteractionContext]);

  // Physical button release is the only path that can commit a radial selection.
  useEffect(() => {
    if (!ctrlState.connected) return;
    if (ctrlState.southReleased && activeWheelRef.current === 'SKILL') {
      handleWheelRelease('SKILL');
    }
    if (ctrlState.westReleased && activeWheelRef.current === 'ZONE') {
      handleWheelRelease('ZONE');
    }
    if (ctrlState.eastReleased && activeWheelRef.current === 'RESULT') {
      handleWheelRelease('RESULT');
    }
    if (ctrlState.northReleased && activeWheelRef.current === 'TEAM_PLAYER') {
      handleWheelRelease('TEAM_PLAYER');
    }
  }, [
    ctrlState.southReleased,
    ctrlState.westReleased,
    ctrlState.eastReleased,
    ctrlState.northReleased,
    ctrlState.connected,
    handleWheelRelease
  ]);

  // 6. Angular Hysteresis Stick Selection while Radial is Open
  useEffect(() => {
    if (!activeWheel || wheelOptions.length === 0 || !ctrlState.connected) return;

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
      activeSectorRef.current = newSector;
      setSelectedSectorIdx(newSector);
    }
  }, [ctrlState.leftStick.angle, ctrlState.leftStick.magnitude, ctrlState.connected, activeWheel, wheelOptions.length]);

  const activeOptionId =
    selectedSectorIdx !== null && wheelOptions[selectedSectorIdx]
      ? wheelOptions[selectedSectorIdx].id
      : null;
  const quickEditEvent = scout.recentEvents[0];
  const quickEditTeamId = String(quickEditChanges.teamId ?? quickEditEvent?.teamId ?? scout.activeTeam);
  const quickEditTeamName = quickEditTeamId === 'A' ? scout.teamA : quickEditTeamId === 'B' ? scout.teamB : quickEditTeamId;
  const quickEditPlayerId = quickEditChanges.playerId ?? quickEditEvent?.playerId;
  const quickEditPlayer = [...scout.teamAPlayers, ...scout.teamBPlayers].find((player) => player.id === quickEditPlayerId);
  const quickEditFields = [
    { index: 0, category: 'TEAM_PLAYER' as const, key: 'scout.team_player', fallback: 'Team / Player', glyph: 'FACE_NORTH' as const, value: quickEditPlayer ? `${quickEditTeamName} · #${quickEditPlayer.number}` : quickEditTeamName },
    { index: 1, category: 'SKILL' as const, key: 'scout.skill', fallback: 'Skill', glyph: 'FACE_SOUTH' as const, value: quickEditChanges.skill ?? quickEditEvent?.skill },
    { index: 2, category: 'ZONE' as const, key: 'scout.zone', fallback: 'Zone', glyph: 'FACE_WEST' as const, value: quickEditChanges.originZone ?? quickEditEvent?.originZone },
    { index: 3, category: 'RESULT' as const, key: 'scout.result', fallback: 'Result', glyph: 'FACE_EAST' as const, value: quickEditChanges.evaluation ?? quickEditEvent?.evaluation }
  ];

  return (
    <div className={styles.liveContainer}>
      {/* Top Bar Navigation / Header */}
      <header className={styles.topBar}>
        <div className={styles.brandGroup}>
          <span className={styles.brandTitle}>SP Stick</span>
          <span className={styles.sportBadge}>{t('sport.volleyball', 'Volleyball')}</span>
        </div>

        {/* Global Match Scoreboard */}
        <div className={styles.scoreboard}>
          <div className={`${styles.teamScore} ${scout.activeTeam === 'A' ? styles.activeScore : ''}`}>
            <span className={styles.teamName}>{scout.teamA}</span>
            <span className={styles.scoreVal}>{scout.scoreA}</span>
          </div>

          <div className={styles.setIndicator}>
            <span className={styles.setLabel}>{t('scout.set', 'Set {{set}}', { set: scout.currentSet })}</span>
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
            onClick={() => setPauseMenuOpen(true)}
            title={t('session.menu_title', 'Session Menu')}
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
              <span>{t('scout.net', 'NET')}</span>
            </div>
            <div className={styles.courtGrid}>
              <div className={styles.zoneMarker}>4</div>
              <div className={styles.zoneMarker}>3</div>
              <div className={styles.zoneMarker}>2</div>
              <div className={styles.zoneMarker}>5</div>
              <div className={styles.zoneMarker}>6</div>
              <div className={styles.zoneMarker}>1</div>
            </div>
            <p className={styles.focusNotice}>{t('app.tagline', 'Eyes on game · Hands on controller')}</p>
          </div>

          {/* Radial Overlay */}
          {activeWheel && !isQuickEditOpen && (
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
              {scout.lastFeedback === 'saved' ? t('scout.event_saved', 'Event saved')
                : scout.lastFeedback === 'undo' ? t('scout.event_undone', 'Last event removed')
                  : t('scout.bookmark_added', 'Bookmark added')}
            </div>
          )}

          {scout.saveError && (
            <div className={styles.floatingError}>
              ⚠️ {t('scout.save_error', 'Could not save the event. Please retry.')}
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
                title={t('scout.undo_action', 'Undo last event')}
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
          {wakeLockActive && <span className={styles.wakeLockBadge}>{t('scout.wake_lock_on', 'Wake lock on')}</span>}
        </div>

        <div className={styles.bottomRight}>
          <span>{t('scout.events_count', 'Events')}: {eventCount.sessionId === scout.sessionId ? eventCount.count : 0}</span>
          <span className={styles.separator}>•</span>
          <button
            className={styles.bookmarkBtn}
            onClick={() => scout.addBookmark()}
            title={t('scout.bookmark_action', 'Bookmark moment')}
          >
            <ControllerGlyph control="RIGHT_STICK_BUTTON" /> 🔖
          </button>
        </div>
      </footer>

      {/* Pause / Session Menu Modal */}
      {isPauseMenuOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="pause-menu-title">
          <div className={styles.modalCard}>
            <h2 id="pause-menu-title">{t('session.menu_title', 'Session Menu')}</h2>
            <p className={styles.modalSubtitle}>{scout.sessionName}</p>
            <p className={styles.modalHint}>{t('session.controller_navigation_hint', 'Use the left stick or D-pad to navigate. South selects, East goes back, and Menu resumes.')}</p>

            <div className={styles.modalActions}>
              <button
                className={`${styles.modalBtnPrimary} ${pauseFocusIndex === 0 ? styles.modalBtnFocused : ''}`}
                onClick={() => activatePauseMenuItem(0)}
                aria-current={pauseFocusIndex === 0 ? 'true' : undefined}
              >
                {t('session.resume', 'Resume Match')}
              </button>

              <button
                className={`${styles.modalBtn} ${pauseFocusIndex === 1 ? styles.modalBtnFocused : ''}`}
                onClick={() => activatePauseMenuItem(1)}
                aria-current={pauseFocusIndex === 1 ? 'true' : undefined}
              >
                {t('session.next_set', 'End Set & Start Next')}
              </button>

              <button
                className={`${styles.modalBtn} ${pauseFocusIndex === 2 ? styles.modalBtnFocused : ''}`}
                onClick={() => activatePauseMenuItem(2)}
                aria-current={pauseFocusIndex === 2 ? 'true' : undefined}
              >
                {t('session.open_review', 'Event Review & Export')}
              </button>

              <button
                className={`${styles.modalBtn} ${pauseFocusIndex === 3 ? styles.modalBtnFocused : ''}`}
                onClick={() => activatePauseMenuItem(3)}
                aria-current={pauseFocusIndex === 3 ? 'true' : undefined}
              >
                {t('session.controller_settings', 'Controller Setup')}
              </button>

              <button
                className={`${styles.modalBtnDanger} ${pauseFocusIndex === 4 ? styles.modalBtnFocused : ''}`}
                onClick={() => activatePauseMenuItem(4)}
                aria-current={pauseFocusIndex === 4 ? 'true' : undefined}
              >
                {t('session.end_match', 'End Match')}
              </button>
            </div>
          </div>
        </div>
      )}

      {isQuickEditOpen && !isPauseMenuOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="quick-edit-title">
          <div className={`${styles.modalCard} ${styles.quickEditCard}`}>
            <h2 id="quick-edit-title">{t('scout.quick_edit_title', 'Quick Edit Last Event')}</h2>
            <p className={styles.modalSubtitle}>{t('scout.quick_edit_hint', 'Choose a field with the left stick or D-pad, then use its face button. Save or cancel to finish.')}</p>

            {quickEditEvent ? (
              <div className={styles.quickEditFields}>
                {quickEditFields.map((field) => (
                  <button
                    key={field.index}
                    type="button"
                    className={`${styles.quickEditField} ${quickEditFocusIndex === field.index ? styles.modalBtnFocused : ''}`}
                    onClick={() => {
                      quickEditFocusRef.current = field.index;
                      setQuickEditFocusIndex(field.index);
                      activateQuickEditRadial(field.category);
                    }}
                    aria-current={quickEditFocusIndex === field.index ? 'true' : undefined}
                  >
                    <span>{t(field.key, field.fallback)}</span>
                    <strong>
                      {field.index === 1 && field.value ? t(`skill.${field.value}`)
                        : field.index === 2 && field.value !== undefined ? `Z${field.value}`
                          : field.index === 3 && field.value !== undefined ? Number(field.value) > 0 ? '+1' : String(field.value)
                            : field.index === 0 ? field.value : '—'}
                    </strong>
                    <ControllerGlyph control={field.glyph} />
                  </button>
                ))}
              </div>
            ) : (
              <p className={styles.modalHint}>{t('scout.no_events', 'No events to edit yet.')}</p>
            )}

            {quickEditError && <p className={styles.quickEditError}>{t('scout.quick_edit_error', 'Could not save this event. Try again.')}</p>}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={`${styles.modalBtnPrimary} ${quickEditFocusIndex === 4 ? styles.modalBtnFocused : ''}`}
                disabled={quickEditSaving || !quickEditEvent}
                onClick={() => { quickEditFocusRef.current = 4; setQuickEditFocusIndex(4); void saveQuickEdit(); }}
                aria-current={quickEditFocusIndex === 4 ? 'true' : undefined}
              >
                {quickEditSaving ? t('common.saving', 'Saving…') : t('common.save', 'Save')}
              </button>
              <button
                type="button"
                className={`${styles.modalBtn} ${quickEditFocusIndex === 5 ? styles.modalBtnFocused : ''}`}
                onClick={() => { quickEditFocusRef.current = 5; setQuickEditFocusIndex(5); cancelQuickEdit(); }}
                aria-current={quickEditFocusIndex === 5 ? 'true' : undefined}
              >
                {t('common.cancel', 'Cancel')}
              </button>
            </div>
          </div>
          {activeWheel && (
            <div className={styles.quickEditRadialLayer}>
              <RadialMenu
                options={wheelOptions}
                activeOptionId={activeOptionId}
                categoryLabel={wheelLabel}
                controllerHint={t('scout.release_hint', 'Release to commit')}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
