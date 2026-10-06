import { useEffect, useState, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useControllerStore } from '../../core/controller/ControllerStore';
import { setDirectVideoSeekEnabled, setVideoModifierContextEnabled } from '../../core/controller/GamepadPoller';
import { useScoutStore, setVideoTimingProvider } from '../../core/scouting/ScoutStore';
import type { ScoutingEvent } from '../../core/scouting/ScoutingEvent';
import { intentDispatcher, type ControllerIntent, type RadialCategory } from '../../core/controller/ControllerIntent';
import { getHysteresisSector } from '../../core/controller/RadialSelector';
import { RadialMenu, type RadialOptionItem } from '../radial/RadialMenu';
import { ZoneGridMenu } from './ZoneGridMenu';
import { getGridZone } from './ZoneGridSelector';
import { CourtMap } from './CourtMap';
import { RallyHistory } from './RallyHistory';
import { skillKey, formatVideoTime } from './rallyDisplay';
import { ScoutVideoPanel, AudioUnlockButton } from '../video/ScoutVideoPanel';
import { videoPlayback } from '../../core/video/VideoPlayback';
import { usePreferencesStore } from '../../core/preferences/PreferencesStore';
import type { SemanticControl } from '../../core/controller/ControllerTypes';
import { audioFeedbackManager } from '../../core/preferences/AudioFeedbackManager';
import { VOLLEYBALL_SKILLS } from '../../core/sports/volleyball/volleyball.skills';
import { VOLLEYBALL_ZONES } from '../../core/sports/volleyball/volleyball.zones';
import { VOLLEYBALL_RESULTS } from '../../core/sports/volleyball/volleyball.rules';
import { ControllerGlyph } from '../../components/ControllerGlyph';
import { getContextAfterDisconnect, nextVideoPlaybackRate, routeLiveScoutIntent, type LiveScoutInteractionContext } from './LiveScoutInput';
import { getScoutingSelectorStick } from '../../core/controller/StickNormalizer';
import { HoldSelectorEngine } from './holdSelector';
import { getActiveCourtPlayers } from '../../core/scouting/players';
import { ControllerHudFeedback, type ActionFlash, type ControllerBadge, type SeekHudState } from './ControllerHudFeedback';
import styles from './LiveScout.module.css';

type ActiveWheelType = 'SKILL' | 'ZONE' | 'RESULT' | 'TEAM' | 'PLAYER';

export function LiveScout() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const ctrlState = useControllerStore(useShallow((s) => ({
    connected: s.state.connected,
    leftStick: s.state.leftStick
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
    selectedPlayerId: s.selectedPlayerId,
    currentEvent: s.currentEvent,
    recentEvents: s.recentEvents,
    allEvents: s.allEvents,
    rallies: s.rallies,
    currentRallyId: s.currentRallyId,
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
  const wheelSize = usePreferencesStore(s => s.wheelSize);
  const [inspectedEvent, setInspectedEvent] = useState<ScoutingEvent | null>(null);
  const [pendingEnd, setPendingEnd] = useState<'set' | 'match' | null>(null);
  const pendingEndRef = useRef<'set' | 'match' | null>(null);
  const openingControlRef = useRef<SemanticControl | null>(null);
  const openerObservedPressedRef = useRef(false);

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
  const [interactionContext, setInteractionContext] = useState<LiveScoutInteractionContext>('DISCONNECTED');
  const [focusMode, setFocusMode] = useState(false);
  const [hudHidden, setHudHidden] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(() => videoPlayback.isPlaying());
  const [videoSourceId, setVideoSourceId] = useState(() => videoPlayback.getEventTiming().videoSourceId);
  const focusHudTimerRef = useRef<number | null>(null);
  const revealFocusHudRef = useRef<() => void>(() => {});

  const [controllerBadge, setControllerBadge] = useState<ControllerBadge | null>(null);
  const badgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [seekState, setSeekState] = useState<SeekHudState | null>(null);
  const seekClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [actionFlash, setActionFlash] = useState<ActionFlash | null>(null);
  const actionFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerActionFlash = useCallback((category: string, value: string, secondary?: string) => {
    if (actionFlashTimerRef.current !== null) {
      clearTimeout(actionFlashTimerRef.current);
    }
    setActionFlash({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category,
      value,
      secondary
    });
    actionFlashTimerRef.current = setTimeout(() => {
      setActionFlash(null);
      actionFlashTimerRef.current = null;
    }, 1000);
  }, []);

  const showBadge = useCallback((badge: ControllerBadge) => {
    if (badgeTimerRef.current !== null) clearTimeout(badgeTimerRef.current);
    setControllerBadge(badge);
    badgeTimerRef.current = setTimeout(() => {
      setControllerBadge(null);
      badgeTimerRef.current = null;
    }, 850);
  }, []);

  const scheduleSeekClear = useCallback(() => {
    if (seekClearTimerRef.current !== null) clearTimeout(seekClearTimerRef.current);
    seekClearTimerRef.current = setTimeout(() => {
      setSeekState(null);
      seekClearTimerRef.current = null;
    }, 600);
  }, []);

  const clearSeekTimer = useCallback(() => {
    if (seekClearTimerRef.current !== null) clearTimeout(seekClearTimerRef.current);
    seekClearTimerRef.current = null;
  }, []);

  const clearFocusHudTimer = useCallback(() => {
    if (focusHudTimerRef.current !== null) window.clearTimeout(focusHudTimerRef.current);
    focusHudTimerRef.current = null;
  }, []);

  const toggleFocusMode = useCallback(() => {
    setFocusMode((prev) => {
      const next = !prev;
      if (!next) {
        clearFocusHudTimer();
        setHudHidden(false);
      } else {
        setHudHidden(false);
      }
      showBadge({
        title: 'FOCUS',
        value: next ? t('scout.focus_on', 'HUD FOCUS ON') : t('scout.focus_off', 'HUD FOCUS OFF')
      });
      return next;
    });
  }, [clearFocusHudTimer, showBadge, t]);

  const activeSectorRef = useRef<number | null>(null);
  const activeWheelRef = useRef<ActiveWheelType | null>(null);
  const selectorEngineRef = useRef<HoldSelectorEngine<RadialOptionItem> | null>(null);
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
    } else if (contextRef.current !== 'VIDEO_CONTROL') {
      contextRef.current = 'LIVE_SCOUT';
    }
    const isLiveScout = contextRef.current === 'LIVE_SCOUT';
    setInteractionContext(contextRef.current);
    setVideoModifierContextEnabled(isLiveScout || contextRef.current === 'VIDEO_CONTROL');
    // Direct RS seek is enabled ONLY in LIVE_SCOUT when no selector / menu / modal is open
    setDirectVideoSeekEnabled(isLiveScout && !activeWheelRef.current && !pauseMenuOpenRef.current && !quickEditOpenRef.current);
  }, []);

  const setWheelOpen = useCallback((category: ActiveWheelType | null, control?: SemanticControl) => {
    openingControlRef.current = control ?? null;
    openerObservedPressedRef.current = control ? Boolean(useControllerStore.getState().state.buttons[control]?.pressed) : false;
    activeWheelRef.current = category;
    activeSectorRef.current = null;
    setActiveWheel(category);
    setSelectedSectorIdx(null);
    syncInteractionContext();
    if (category) {
      selectorEngineRef.current?.open(category, control ?? 'FACE_SOUTH', category === 'ZONE');
      const catLabel =
        category === 'ZONE' ? t('scout.zone', 'Zone')
        : category === 'SKILL' ? t('scout.skill', 'Skill')
        : category === 'RESULT' ? t('scout.result', 'Result')
        : category === 'TEAM' ? t('scout.team', 'Team')
        : t('scout.player', 'Player');
      showBadge({ title: catLabel });
    } else {
      selectorEngineRef.current?.cancel();
    }
  }, [syncInteractionContext, showBadge, t]);

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
    if (!open) { pendingEndRef.current = null; setPendingEnd(null); }
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
    const target = scout.recentEvents[0];
    if (!target) return;
    setQuickEditSaving(true);
    setQuickEditError(false);
    try {
      await scout.editEvent(target.id, quickEditChangesRef.current);
      setQuickEditOpen(false);
    } catch {
      setQuickEditError(true);
    } finally {
      setQuickEditSaving(false);
    }
  }, [scout, setQuickEditOpen]);

  const activatePauseMenuItem = useCallback((targetIndex?: number) => {
    const index = targetIndex ?? pauseFocusRef.current;
    const state = useScoutStore.getState();
    const finishEnd = (kind: 'set' | 'match') => {
      void (kind === 'set' ? state.endSet() : state.endMatch()).then(() => {
        setPauseMenuOpen(false);
        setInspectedEvent(null);
        if (kind === 'match') navigate('/');
      });
    };
    if (pendingEndRef.current) {
      if (index === 1) finishEnd(pendingEndRef.current);
      else { pendingEndRef.current = null; setPendingEnd(null); }
      return;
    }
    const requestEnd = (kind: 'set' | 'match') => {
      if (state.currentRallyId || state.currentEvent.skill || state.currentEvent.originZone || state.currentEvent.evaluation !== undefined) {
        pendingEndRef.current = kind; setPendingEnd(kind);
        pauseFocusRef.current = 0; setPauseFocusIndex(0);
      } else finishEnd(kind);
    };
    if (index === 0) {
      setPauseMenuOpen(false);
    } else if (index === 1) {
      requestEnd('set');
    } else if (index === 2) {
      setPauseMenuOpen(false);
      navigate('/review');
    } else if (index === 3) {
      setPauseMenuOpen(false);
      navigate('/controller');
    } else if (index === 4) {
      requestEnd('match');
    }
  }, [navigate, setPauseMenuOpen]);

  const moveNavigationFocus = useCallback((direction: -1 | 1) => {
    const context = contextRef.current;
    if (context === 'PAUSE_MENU') {
      const count = pendingEndRef.current ? 2 : 5;
      const next = (pauseFocusRef.current + direction + count) % count;
      pauseFocusRef.current = next;
      setPauseFocusIndex(next);
    } else if (context === 'QUICK_EDIT') {
      // 5 fields (Team, Player, Skill, Zone, Result) + 2 actions (Save, Cancel) = 7 items
      const count = 7;
      const next = (quickEditFocusRef.current + direction + count) % count;
      quickEditFocusRef.current = next;
      setQuickEditFocusIndex(next);
    }
  }, []);

  const activateQuickEditRadial = useCallback((category: RadialCategory, control?: SemanticControl) => {
    const focusIndex = quickEditFocusRef.current;
    if (category === 'SKILL' && focusIndex === 5) {
      void saveQuickEdit();
      return;
    }
    if ((category === 'SKILL' && focusIndex === 6) || (category === 'RESULT' && focusIndex === 6)) {
      cancelQuickEdit();
      return;
    }

    const fieldForCategory: Record<RadialCategory, number> = {
      TEAM: 0,
      PLAYER: 1,
      SKILL: 2,
      ZONE: 3,
      RESULT: 4
    };
    if (focusIndex === fieldForCategory[category]) setWheelOpen(category, control);
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

  useEffect(() => {
    setVideoTimingProvider(() => videoPlayback.getEventTiming());
    return () => setVideoTimingProvider(() => ({}));
  }, []);

  useEffect(() => videoPlayback.subscribe(() => {
    setVideoPlaying(videoPlayback.isPlaying());
    setVideoSourceId(videoPlayback.getEventTiming().videoSourceId);
  }), []);

  const scheduleFocusHudHide = useCallback(() => {
    clearFocusHudTimer();
    if (!focusMode || !videoPlaying) return;
    focusHudTimerRef.current = window.setTimeout(() => {
      focusHudTimerRef.current = null;
      setHudHidden(true);
    }, 3000);
  }, [clearFocusHudTimer, focusMode, videoPlaying]);

  useEffect(() => {
    if (focusMode && videoPlaying && !hudHidden) scheduleFocusHudHide();
    else clearFocusHudTimer();
    return clearFocusHudTimer;
  }, [focusMode, videoPlaying, hudHidden, scheduleFocusHudHide, clearFocusHudTimer]);

  useEffect(() => {
    if (!focusMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFocusMode(false);
        setHudHidden(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusMode]);

  const revealFocusHud = useCallback(() => {
    if (!focusMode) return;
    setHudHidden(false);
    scheduleFocusHudHide();
  }, [focusMode, scheduleFocusHudHide]);
  const exitFocusMode = useCallback(() => {
    clearFocusHudTimer();
    setFocusMode(false);
    setHudHidden(false);
  }, [clearFocusHudTimer]);

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
    if (activeWheel === 'TEAM') {
      return [
        { id: 'A', label: scout.teamA || t('team.a', 'Team A') },
        { id: 'B', label: scout.teamB || t('team.b', 'Team B') }
      ];
    }
    if (activeWheel === 'PLAYER') {
      const selectedTeam = isQuickEditOpen
        ? String(quickEditChanges.teamId ?? scout.recentEvents[0]?.teamId ?? scout.activeTeam)
        : scout.activeTeam;
      const rawPlayers = selectedTeam === 'A' ? scout.teamAPlayers : scout.teamBPlayers;
      const activePlayers = getActiveCourtPlayers(rawPlayers);
      return activePlayers.map((p) => ({
        id: p.id,
        label: `#${p.number}`,
        subLabel: p.name
      }));
    }
    return [];
  }, [activeWheel, isQuickEditOpen, t, scout.teamA, scout.teamB, scout.activeTeam, scout.teamAPlayers, scout.teamBPlayers, scout.recentEvents, quickEditChanges]);

  const wheelLabel = useMemo(() => {
    if (activeWheel === 'SKILL') return t('scout.skill', 'Skill');
    if (activeWheel === 'ZONE') return t('scout.zone', 'Zone');
    if (activeWheel === 'RESULT') return t('scout.result', 'Result');
    if (activeWheel === 'TEAM') return t('scout.team', 'Team');
    if (activeWheel === 'PLAYER') return t('scout.player', 'Player');
    return '';
  }, [activeWheel, t]);

  const chooseOption = useCallback((wheelType: ActiveWheelType, item: RadialOptionItem) => {
    if (quickEditOpenRef.current) {
      if (wheelType === 'SKILL') stageQuickEdit({ skill: item.id });
      else if (wheelType === 'ZONE') stageQuickEdit({ originZone: Number(item.id) });
      else if (wheelType === 'RESULT') stageQuickEdit({ evaluation: Number(item.id) });
      else if (wheelType === 'TEAM') stageQuickEdit({ teamId: item.id as 'A' | 'B', playerId: undefined });
      else if (wheelType === 'PLAYER') stageQuickEdit({ playerId: item.id });
    } else {
      setInspectedEvent(null);
      if (wheelType === 'SKILL') {
        void scout.updateCurrentEvent({ skill: item.id });
        triggerActionFlash(t('scout.skill', 'SKILL'), item.label.toUpperCase());
      } else if (wheelType === 'ZONE') {
        void scout.updateCurrentEvent({ originZone: Number(item.id) });
        triggerActionFlash(t('scout.position', 'POSITION'), `ZONE ${item.id}`);
      } else if (wheelType === 'RESULT') {
        const val = Number(item.id) as -1 | 0 | 1;
        void scout.updateCurrentEvent({ evaluation: val });
        const resText = val === 1 ? '+1 POINT' : val === -1 ? '−1 POINT' : t('result.pass', 'PASS');
        triggerActionFlash(t('scout.result', 'RESULT'), resText);
      } else if (wheelType === 'TEAM') {
        const teamSide = item.id as 'A' | 'B';
        scout.setActiveTeam(teamSide);
        const name = teamSide === 'A' ? (scout.teamA || t('team.a', 'Team A')) : (scout.teamB || t('team.b', 'Team B'));
        triggerActionFlash(t('scout.team', 'TEAM'), name.toUpperCase());
      } else if (wheelType === 'PLAYER') {
        scout.setSelectedPlayer(item.id);
        const rawPlayers = scout.activeTeam === 'A' ? scout.teamAPlayers : scout.teamBPlayers;
        const player = rawPlayers.find((p) => p.id === item.id);
        const jersey = player ? `#${player.number}` : item.label;
        triggerActionFlash(t('scout.player', 'PLAYER'), jersey, player?.name?.toUpperCase());
      }
    }
    selectorEngineRef.current?.destroy();
    activeWheelRef.current = null;
    activeSectorRef.current = null;
    setActiveWheel(null);
    setSelectedSectorIdx(null);
    syncInteractionContext();
  }, [scout, stageQuickEdit, syncInteractionContext, triggerActionFlash, t]);

  const wheelOptionsRef = useRef<RadialOptionItem[]>([]);
  const wheelLabelRef = useRef('');
  const chooseOptionRef = useRef(chooseOption);
  const syncInteractionContextRef = useRef(syncInteractionContext);

  useEffect(() => {
    wheelOptionsRef.current = wheelOptions;
    wheelLabelRef.current = wheelLabel;
    chooseOptionRef.current = chooseOption;
    syncInteractionContextRef.current = syncInteractionContext;
  });

  useEffect(() => {
    const engine = new HoldSelectorEngine<RadialOptionItem>({
      onCommit: (item) => {
        const cat = activeWheelRef.current;
        if (cat) {
          chooseOptionRef.current(cat, item);
        }
      },
      onCancel: () => {
        activeWheelRef.current = null;
        activeSectorRef.current = null;
        setActiveWheel(null);
        setSelectedSectorIdx(null);
        syncInteractionContextRef.current();
      },
      onHighlight: (item) => {
        if (!item) {
          activeSectorRef.current = null;
          setSelectedSectorIdx(null);
        } else {
          const idx = wheelOptionsRef.current.findIndex((o) => o.id === item.id);
          activeSectorRef.current = idx >= 0 ? idx : null;
          setSelectedSectorIdx(idx >= 0 ? idx : null);
        }
      }
    });
    selectorEngineRef.current = engine;
    return () => {
      engine.destroy();
      selectorEngineRef.current = null;
    };
  }, []);

  const handleIntent = useCallback((intent: ControllerIntent) => {
    revealFocusHud();
    const route = routeLiveScoutIntent(contextRef.current, intent);
    switch (route) {
      case 'OPEN_PAUSE_MENU':
        if (activeWheelRef.current) {
          selectorEngineRef.current?.cancel();
          setWheelOpen(null);
        }
        exitFocusMode();
        setPauseMenuOpen(true);
        break;
      case 'RESUME_PAUSE_MENU': setPauseMenuOpen(false); break;
      case 'OPEN_QUICK_EDIT': setQuickEditOpen(true); break;
      case 'QUICK_EDIT_CANCEL': cancelQuickEdit(); break;
      case 'PAUSE_NAVIGATE_UP': moveNavigationFocus(-1); break;
      case 'PAUSE_NAVIGATE_DOWN': moveNavigationFocus(1); break;
      case 'PAUSE_SELECT': activatePauseMenuItem(); break;
      case 'PAUSE_BACK': setPauseMenuOpen(false); break;
      case 'QUICK_EDIT_NAVIGATE_UP': moveNavigationFocus(-1); break;
      case 'QUICK_EDIT_NAVIGATE_DOWN': moveNavigationFocus(1); break;
      case 'QUICK_EDIT_OPEN_RADIAL_SKILL': activateQuickEditRadial('SKILL', intent.type === 'OPEN_RADIAL' ? intent.control : undefined); break;
      case 'QUICK_EDIT_OPEN_RADIAL_ZONE': activateQuickEditRadial('ZONE', intent.type === 'OPEN_RADIAL' ? intent.control : undefined); break;
      case 'QUICK_EDIT_OPEN_RADIAL_RESULT': activateQuickEditRadial('RESULT', intent.type === 'OPEN_RADIAL' ? intent.control : undefined); break;
      case 'QUICK_EDIT_OPEN_RADIAL_TEAM': activateQuickEditRadial('TEAM', intent.type === 'OPEN_RADIAL' ? intent.control : undefined); break;
      case 'QUICK_EDIT_OPEN_RADIAL_PLAYER': activateQuickEditRadial('PLAYER', intent.type === 'OPEN_RADIAL' ? intent.control : undefined); break;
      case 'SCOUT_SELECT_TEAM_A': {
        scout.setActiveTeam('A');
        triggerActionFlash(t('scout.team', 'TEAM'), (scout.teamA || t('team.a', 'Team A')).toUpperCase());
        break;
      }
      case 'SCOUT_SELECT_TEAM_B': {
        scout.setActiveTeam('B');
        triggerActionFlash(t('scout.team', 'TEAM'), (scout.teamB || t('team.b', 'Team B')).toUpperCase());
        break;
      }
      case 'SCOUT_TOGGLE_TEAM': {
        const next = scout.activeTeam === 'A' ? 'B' : 'A';
        scout.setActiveTeam(next);
        setInspectedEvent(null);
        const name = next === 'A' ? (scout.teamA || t('team.a', 'Team A')) : (scout.teamB || t('team.b', 'Team B'));
        triggerActionFlash(t('scout.team', 'TEAM'), name.toUpperCase());
        break;
      }
      case 'SCOUT_RESULT_POSITIVE': {
        void scout.updateCurrentEvent({ evaluation: 1 });
        triggerActionFlash(t('scout.result', 'RESULT'), '+1 POINT');
        break;
      }
      case 'SCOUT_RESULT_NEUTRAL': {
        void scout.updateCurrentEvent({ evaluation: 0 });
        triggerActionFlash(t('scout.result', 'RESULT'), t('result.pass', 'PASS').toUpperCase());
        break;
      }
      case 'SCOUT_RESULT_NEGATIVE': {
        void scout.updateCurrentEvent({ evaluation: -1 });
        triggerActionFlash(t('scout.result', 'RESULT'), '−1 POINT');
        break;
      }
      case 'SCOUT_UNDO': void scout.undoLastEvent(); break;
      case 'SCOUT_BOOKMARK': void scout.addBookmark(); break;
      case 'SCOUT_CLEAR_ACTION': void useScoutStore.getState().clearCurrentEvent(); setInspectedEvent(null); break;
      case 'SCOUT_TOGGLE_VIDEO': videoPlayback.togglePlayback(); break;
      case 'TOGGLE_FOCUS_MODE': toggleFocusMode(); break;
      case 'ENTER_VIDEO_CONTROL':
        if (activeWheelRef.current) {
          selectorEngineRef.current?.cancel();
          setWheelOpen(null);
        }
        contextRef.current = 'VIDEO_CONTROL';
        setVideoModifierContextEnabled(true);
        break;
      case 'EXIT_VIDEO_CONTROL':
        if (contextRef.current === 'VIDEO_CONTROL') contextRef.current = 'LIVE_SCOUT';
        syncInteractionContext();
        break;
      case 'VIDEO_CONTROL_COMMAND':
        if (intent.type === 'VIDEO_CONTROL_SEEK') {
          void videoPlayback.seekBy(intent.deltaMs).catch(() => undefined);
        } else if (intent.type === 'VIDEO_ANALOG_SEEK') {
          void videoPlayback.seekBy(intent.deltaMs).catch(() => undefined);
          setSeekState({
            direction: intent.direction,
            deltaMs: intent.accumulatedDeltaMs,
            speedMultiplier: intent.speedMultiplier,
            currentTimeMs: videoPlayback.getCurrentTimeMs() + intent.deltaMs
          });
        } else if (intent.type === 'VIDEO_SEEK_STARTED') {
          clearSeekTimer();
        } else if (intent.type === 'VIDEO_SEEK_ENDED') {
          scheduleSeekClear();
        } else if (intent.type === 'VIDEO_CONTROL_TOGGLE') {
          videoPlayback.togglePlayback();
        } else if (intent.type === 'VIDEO_CONTROL_CYCLE_RATE') {
          videoPlayback.setPlaybackRate(nextVideoPlaybackRate(videoPlayback.getPlaybackRate()));
        }
        break;
      case 'OPEN_RADIAL_SKILL':
      case 'OPEN_RADIAL_ZONE':
      case 'OPEN_RADIAL_RESULT':
      case 'OPEN_RADIAL_TEAM':
      case 'OPEN_RADIAL_PLAYER': {
        if (!useControllerStore.getState().state.connected) break;
        // Hold selector ownership: ignore competing OPEN_RADIAL intents if a selector is already held!
        if (activeWheelRef.current !== null) {
          break;
        }
        const category: ActiveWheelType =
          route === 'OPEN_RADIAL_SKILL' ? 'SKILL'
          : route === 'OPEN_RADIAL_ZONE' ? 'ZONE'
          : route === 'OPEN_RADIAL_RESULT' ? 'RESULT'
          : route === 'OPEN_RADIAL_TEAM' ? 'TEAM'
          : 'PLAYER';
        setWheelOpen(category, intent.type === 'OPEN_RADIAL' ? intent.control : undefined);
        break;
      }
      case 'IGNORE': break;
    }
  }, [
    activatePauseMenuItem,
    activateQuickEditRadial,
    cancelQuickEdit,
    clearSeekTimer,
    moveNavigationFocus,
    scout,
    exitFocusMode,
    revealFocusHud,
    scheduleSeekClear,
    setPauseMenuOpen,
    setQuickEditOpen,
    setWheelOpen,
    toggleFocusMode,
    triggerActionFlash,
    syncInteractionContext,
    t
  ]);

  useLayoutEffect(() => {
    intentHandlerRef.current = handleIntent;
    revealFocusHudRef.current = revealFocusHud;
  }, [handleIntent, revealFocusHud]);

  // Subscribe once; refs keep this dispatcher and disconnect listener stable across renders.
  useEffect(() => {
    contextRef.current = useControllerStore.getState().state.connected ? 'LIVE_SCOUT' : 'DISCONNECTED';
    syncInteractionContext();

    const unsubscribeIntent = intentDispatcher.subscribe((intent) => intentHandlerRef.current(intent));
    const unsubscribeController = useControllerStore.subscribe((store, previousStore) => {
      const connected = store.state.connected;
      const wasConnected = previousStore.state.connected;
      if (connected && (store.state.buttons !== previousStore.state.buttons
        || store.state.leftStick.x !== previousStore.state.leftStick.x
        || store.state.leftStick.y !== previousStore.state.leftStick.y
        || store.state.rightStick.x !== previousStore.state.rightStick.x
        || store.state.rightStick.y !== previousStore.state.rightStick.y)) {
        revealFocusHudRef.current();
      }
      if (!connected) {
        selectorEngineRef.current?.destroy();
        activeWheelRef.current = null;
        activeSectorRef.current = null;
        setActiveWheel(null);
        setSelectedSectorIdx(null);
        contextRef.current = getContextAfterDisconnect(contextRef.current);
        setVideoModifierContextEnabled(false);
        setDirectVideoSeekEnabled(false);
      } else if (!wasConnected) {
        selectorEngineRef.current?.destroy();
        activeWheelRef.current = null;
        activeSectorRef.current = null;
        setActiveWheel(null);
        setSelectedSectorIdx(null);
        syncInteractionContext();
      }

      // Check selector stick updates and physical opener button release
      if (connected && activeWheelRef.current && selectorEngineRef.current?.isOpen() && contextRef.current !== 'VIDEO_CONTROL') {
        const stick = getScoutingSelectorStick(store.state);
        const currentCat = activeWheelRef.current;
        selectorEngineRef.current.updateStick(stick, (s) => {
          if (currentCat === 'ZONE') {
            const zoneNum = getGridZone(s.x, s.y);
            if (zoneNum === null) return null;
            return wheelOptionsRef.current.find((o) => o.id === String(zoneNum)) ?? null;
          }
          const count = wheelOptionsRef.current.length;
          if (count === 0) return null;
          const sectorIdx = getHysteresisSector(
            s.angle,
            s.magnitude,
            count,
            activeSectorRef.current,
            { activationThreshold: 0.45, deactivationThreshold: 0.20, hysteresisDegrees: 6 }
          );
          if (sectorIdx === null || !wheelOptionsRef.current[sectorIdx]) return null;
          return wheelOptionsRef.current[sectorIdx];
        });

        // Release check: physical button release commits highlighted selection (or cancels if none)
        const opener = openingControlRef.current;
        if (opener) {
          const isPressed = Boolean(store.state.buttons[opener]?.pressed);
          const wasReleased = Boolean(store.state.buttons[opener]?.releasedThisFrame);
          if (isPressed) {
            openerObservedPressedRef.current = true;
          }
          if (wasReleased || (openerObservedPressedRef.current && !isPressed)) {
            openerObservedPressedRef.current = false;
            openingControlRef.current = null;
            selectorEngineRef.current.onOpenerReleased();
            activeWheelRef.current = null;
            activeSectorRef.current = null;
            setActiveWheel(null);
            setSelectedSectorIdx(null);
            syncInteractionContext();
          }
        }
      }
    });

    return () => {
      unsubscribeIntent();
      unsubscribeController();
      setVideoModifierContextEnabled(false);
      setDirectVideoSeekEnabled(false);
    };
  }, [syncInteractionContext]);

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
    { index: 0, category: 'TEAM' as const, key: 'scout.team', fallback: 'Team', glyph: 'FACE_NORTH' as const, value: quickEditTeamName },
    { index: 1, category: 'PLAYER' as const, key: 'scout.player', fallback: 'Player', glyph: 'LEFT_BUMPER' as const, value: quickEditPlayer ? `#${quickEditPlayer.number}${quickEditPlayer.name ? ` ${quickEditPlayer.name}` : ''}` : '—' },
    { index: 2, category: 'SKILL' as const, key: 'scout.skill', fallback: 'Skill', glyph: 'FACE_SOUTH' as const, value: quickEditChanges.skill ?? quickEditEvent?.skill },
    { index: 3, category: 'ZONE' as const, key: 'scout.zone', fallback: 'Zone', glyph: 'FACE_WEST' as const, value: quickEditChanges.originZone ?? quickEditEvent?.originZone },
    { index: 4, category: 'RESULT' as const, key: 'scout.result', fallback: 'Result', glyph: 'FACE_EAST' as const, value: quickEditChanges.evaluation ?? quickEditEvent?.evaluation }
  ];

  const inspected = scout.allEvents.find(event => event.id === inspectedEvent?.id);
  const inspectAction = (event: ScoutingEvent) => {
    setInspectedEvent(event);
    void videoPlayback.seekToEvent(event).catch(() => undefined);
  };

  const getSelectorHint = (cat: ActiveWheelType) => {
    switch (cat) {
      case 'SKILL': return t('scout.hint_skill', 'HOLD A · LS TO SELECT · RELEASE A TO CONFIRM');
      case 'ZONE': return t('scout.hint_zone', 'HOLD X · LS SELECT · RELEASE X CONFIRM');
      case 'RESULT': return t('scout.hint_result', 'HOLD B · LS TO SELECT · RELEASE B TO CONFIRM');
      case 'TEAM': return t('scout.hint_team', 'HOLD Y · LS TO SELECT · RELEASE Y TO CONFIRM');
      case 'PLAYER': return t('scout.hint_player', 'HOLD L1 · LS TO SELECT · RELEASE L1 TO CONFIRM');
    }
  };

  const renderSelection = () => {
    if (!activeWheel) return null;
    if (activeWheel === 'ZONE') {
      return (
        <ZoneGridMenu
          selectedZone={activeOptionId ? Number(activeOptionId) : null}
          onChoose={(zone) => chooseOption('ZONE', { id: String(zone), label: `Z${zone}` })}
          onCancel={() => setWheelOpen(null)}
        />
      );
    }
    return (
      <RadialMenu
        options={wheelOptions}
        activeOptionId={activeOptionId}
        categoryLabel={wheelLabel}
        size={wheelSize}
        onChoose={(item) => chooseOption(activeWheel, item)}
        onCancel={() => setWheelOpen(null)}
        controllerHint={getSelectorHint(activeWheel)}
      />
    );
  };

  const focusPlayer = (scout.activeTeam === 'A' ? scout.teamAPlayers : scout.teamBPlayers)
    .find(player => player.id === (scout.currentEvent.playerId ?? scout.selectedPlayerId));
  const focusPlayerLabel = focusPlayer ? `#${focusPlayer.number}${focusPlayer.name ? ` ${focusPlayer.name}` : ''}`
    : t('scout.no_player_selected', 'No player selected');

  return (
    <div
      className={`${styles.surface} ${focusMode ? styles.focusMode : ''} ${focusMode && hudHidden ? styles.focusHudHidden : ''}`}
      data-testid="live-scout-surface"
      data-focus-mode={String(focusMode)}
      data-controller-connected={String(ctrlState.connected)}
      data-hud-hidden={String(hudHidden)}
      data-wheel-open={Boolean(activeWheel)}
      data-wheel-type={activeWheel ?? ''}
      data-interaction-context={interactionContext}
      onPointerMove={revealFocusHud}
      onPointerDown={revealFocusHud}
      onTouchStart={revealFocusHud}
      onKeyDown={revealFocusHud}
    >
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
            className={`${styles.pauseBtn} ${focusMode ? styles.focusActive : ''}`}
            onClick={toggleFocusMode}
            aria-pressed={focusMode}
            aria-label={t('scout.focus_mode', 'Focus mode')}
            title={t('scout.focus_mode', 'Focus mode')}
          >
            {t('scout.focus_mode', 'Focus mode')}
          </button>
          <button
            className={styles.pauseBtn}
            onClick={() => setPauseMenuOpen(true)}
            title={t('session.menu_title', 'Session Menu')}
          >
            <ControllerGlyph control="MENU" />
          </button>
          <div className={styles.connectionStatus} role="status">
            <span className={ctrlState.connected ? styles.dotConnected : styles.dotDisconnected} />
            <span className={styles.controllerName}>
              {ctrlState.connected ? profile.name : t('controller.disconnected')}
            </span>
            {wakeLockActive && <span className={styles.wakeLockBadge}>{t('scout.wake_lock_on', 'Wake lock on')}</span>}
          </div>
        </div>
      </header>

      {/* Main Scouting Surface */}
      <main className={styles.mainGrid}>
        {/* Match Focus / Video Area */}
        <section className={styles.matchFocusArea}>
          {focusMode && <>
            <div className={styles.focusScoreboard} aria-label={t('scout.score', 'Score')}>
              <div className={styles.focusTeam} data-active={scout.activeTeam === 'A'}><span>{scout.teamA}</span><strong>{scout.scoreA}</strong></div>
              <span className={styles.focusSet}>{t('scout.set', 'Set {{set}}', { set: scout.currentSet })}</span>
              <div className={styles.focusTeam} data-active={scout.activeTeam === 'B'}><strong>{scout.scoreB}</strong><span>{scout.teamB}</span></div>
            </div>
            <div className={styles.focusCurrentEvent}>
              <span>{t('scout.current_event', 'CURRENT EVENT')}</span>
              <strong>{scout.activeTeam} · {scout.activeTeam === 'A' ? scout.teamA : scout.teamB} · {focusPlayerLabel} · {scout.currentEvent.skill ? t(skillKey(scout.currentEvent.skill)) : t('scout.skill', 'Skill') + ' —'} · {scout.currentEvent.originZone ? `Z${scout.currentEvent.originZone}` : t('scout.zone', 'Zone') + ' —'} · {scout.currentEvent.evaluation !== undefined ? scout.currentEvent.evaluation > 0 ? '+1' : scout.currentEvent.evaluation === 0 ? t('result.pass', 'Pass') : '−1' : t('scout.result', 'Result') + ' —'}</strong>
            </div>
            <button className={styles.focusExit} type="button" onClick={exitFocusMode}>{t('scout.exit_focus', 'Exit focus mode')}</button>
            {!videoSourceId && <div className={styles.focusEmpty}>{t('video.focus_empty', 'Add a video or continue scouting without one.')}</div>}
          </>}

          {/* Integrated Video Panel */}
          <div className={focusMode ? styles.focusVideoPanel : undefined}>
            <ScoutVideoPanel
              sessionId={scout.sessionId ?? ''}
              focusMode={focusMode}
              focusHudHidden={focusMode && hudHidden}
              onToggleFocus={toggleFocusMode}
            />
          </div>

          {/* Full Two-Sided Court Heatmap */}
          {!focusMode && <>
            <div className={styles.mapToolbar}>
              <span>{t('scout.court_heatmap', 'Court Heatmap')}</span>
              {inspected && <button type="button" onClick={() => setInspectedEvent(null)}>{t('scout.back_to_live', 'Back to live')}</button>}
            </div>
            <CourtMap
              events={scout.allEvents}
              teamId={scout.activeTeam}
              teamName={scout.activeTeam === 'A' ? scout.teamA : scout.teamB}
              teamA={scout.teamA}
              teamB={scout.teamB}
              draft={inspected ? {} : scout.currentEvent}
              previewZone={!inspected && activeWheel === 'ZONE' && activeOptionId ? Number(activeOptionId) : undefined}
              selectedEventId={inspected?.id}
              onInspect={inspectAction}
            />
            {inspected && (
              <div className={styles.inspectionNotice}>
                <strong>{t('scout.inspected_action', 'Selected action')} · {inspected.actionIndex ?? '—'}</strong>
                <span>{inspected.teamId === 'A' ? scout.teamA : scout.teamB} · {t(skillKey(inspected.skill))} · Z{inspected.originZone} · {inspected.evaluation === 0 ? t('result.pass', 'Pass') : inspected.evaluation === 1 ? '+1' : '−1'}</span>
                {inspected.videoTimeMs !== undefined && <span>{t('video.title', 'Match video')} · {formatVideoTime(inspected.videoTimeMs)}</span>}
              </div>
            )}
          </>}

          {/* Controller HUD Feedback (Action Confirmation Flash & Video Seek HUD) */}
          <ControllerHudFeedback badge={controllerBadge} seekState={seekState} actionFlash={actionFlash} />


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
              <button type="button" onClick={() => void useScoutStore.getState().retrySave()}>{t('common.retry', 'Retry')}</button>
            </div>
          )}
        </section>

        {/* Live Event Feedback Panel */}
        {!focusMode && <aside className={styles.sidePanel}>
          {/* Active Team Selector Banner */}
          <div className={styles.activeTeamBanner}>
            <span className={styles.panelSectionTitle}>{t('scout.active_team', 'ACTIVE TEAM')}</span>
            <div className={styles.teamToggleRow}>
              <button
                className={`${styles.teamToggleBtn} ${scout.activeTeam === 'A' ? styles.teamBtnActive : ''}`}
                onClick={() => { scout.setActiveTeam('A'); setInspectedEvent(null); }}
              >
                <ControllerGlyph control="LEFT_BUMPER" />
                <span>{scout.teamA}</span>
              </button>
              <button
                className={`${styles.teamToggleBtn} ${scout.activeTeam === 'B' ? styles.teamBtnActive : ''}`}
                onClick={() => { scout.setActiveTeam('B'); setInspectedEvent(null); }}
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
              {/* Team Slot */}
              <button
                type="button"
                onClick={() => setWheelOpen('TEAM')}
                className={`${styles.eventSlot} ${styles.slotFilled}`}
              >
                <span className={styles.slotLabel}>{t('scout.team', 'Team')}</span>
                <span className={styles.slotValue}>
                  {scout.activeTeam === 'A' ? (scout.teamA || t('team.a', 'Team A')) : (scout.teamB || t('team.b', 'Team B'))}
                </span>
                <ControllerGlyph control="FACE_NORTH" className={styles.slotGlyph} />
              </button>

              {/* Player Slot */}
              <button
                type="button"
                onClick={() => setWheelOpen('PLAYER')}
                className={`${styles.eventSlot} ${(scout.currentEvent.playerId ?? scout.selectedPlayerId) ? styles.slotFilled : styles.slotEmpty}`}
              >
                <span className={styles.slotLabel}>{t('scout.player', 'Player')}</span>
                <span className={styles.slotValue}>
                  {focusPlayer ? `#${focusPlayer.number}${focusPlayer.name ? ` ${focusPlayer.name}` : ''}` : '—'}
                </span>
                <ControllerGlyph control="LEFT_BUMPER" className={styles.slotGlyph} />
              </button>

              {/* Skill Slot */}
              <button
                type="button"
                onClick={() => { void audioFeedbackManager.unlock(); setWheelOpen('SKILL'); }}
                className={`${styles.eventSlot} ${scout.currentEvent.skill ? styles.slotFilled : styles.slotEmpty}`}
              >
                <span className={styles.slotLabel}>{t('scout.skill', 'Skill')}</span>
                <span className={styles.slotValue}>
                  {scout.currentEvent.skill
                    ? t(skillKey(scout.currentEvent.skill))
                    : '—'}
                </span>
                <ControllerGlyph control="FACE_SOUTH" className={styles.slotGlyph} />
              </button>

              {/* Zone Slot */}
              <button
                type="button"
                onClick={() => setWheelOpen('ZONE')}
                className={`${styles.eventSlot} ${scout.currentEvent.originZone ? styles.slotFilled : styles.slotEmpty}`}
              >
                <span className={styles.slotLabel}>{t('scout.zone', 'Zone')}</span>
                <span className={styles.slotValue}>
                  {scout.currentEvent.originZone ? `Z${scout.currentEvent.originZone}` : '—'}
                </span>
                <ControllerGlyph control="FACE_WEST" className={styles.slotGlyph} />
              </button>

              {/* Result Slot */}
              <button
                type="button"
                onClick={() => setWheelOpen('RESULT')}
                className={`${styles.eventSlot} ${
                  scout.currentEvent.evaluation !== undefined ? styles.slotFilled : styles.slotEmpty
                }`}
              >
                <span className={styles.slotLabel}>{t('scout.result', 'Result')}</span>
                <span className={styles.slotValue}>
                  {scout.currentEvent.evaluation !== undefined
                    ? scout.currentEvent.evaluation > 0
                      ? '+1'
                      : scout.currentEvent.evaluation === 0 ? t('result.pass', 'Pass') : '−1'
                    : '—'}
                </span>
                <ControllerGlyph control="FACE_EAST" className={styles.slotGlyph} />
              </button>
            </div>

            <div className={styles.quickActions}>
              <button
                type="button"
                onClick={() => {
                  void useScoutStore.getState().clearCurrentEvent();
                  setInspectedEvent(null);
                }}
              >
                {t('scout.clear_action', 'Clear')}
              </button>
              <button
                type="button"
                onClick={() => {
                  void audioFeedbackManager.unlock();
                  void scout.updateCurrentEvent({ evaluation: 0 });
                }}
              >
                <ControllerGlyph control="RIGHT_TRIGGER" />
                {t('result.pass', 'Pass')}
              </button>
            </div>
            <AudioUnlockButton />
          </div>

          {/* Recent Events (3-6 latest) */}
          <div className={styles.recentSection}>
            <div className={styles.recentHeader}>
              <span className={styles.panelSectionTitle}>{t('scout.rallies', 'RALLIES & ACTIONS')}</span>
              <button
                className={styles.undoBtn}
                onClick={() => scout.undoLastEvent()}
                title={t('scout.undo_action', 'Undo last event')}
              >
                <ControllerGlyph control="DPAD_LEFT" />
                <span>{t('scout.undo_short', 'Undo')}</span>
              </button>
            </div>

            <RallyHistory
              events={scout.allEvents}
              teamA={scout.teamA}
              teamB={scout.teamB}
              teamAPlayers={scout.teamAPlayers}
              teamBPlayers={scout.teamBPlayers}
              selectedEventId={inspected?.id}
              onInspect={inspectAction}
              incompleteRallyIds={scout.rallies.filter((rally) => rally.status === 'incomplete').map((rally) => rally.id)}
            />
          </div>
        </aside>}
      </main>

      {/* Controller Guide Footer */}
      <footer className={styles.footerBar}>
        <div className={styles.footerShortcuts}>
          <button type="button" className={styles.shortcutItem} onClick={() => setWheelOpen('SKILL')}>
            <ControllerGlyph control="FACE_SOUTH" /> {t('scout.skill', 'Skill')}
          </button>
          <button type="button" className={styles.shortcutItem} onClick={() => setWheelOpen('ZONE')}>
            <ControllerGlyph control="FACE_WEST" /> {t('scout.zone', 'Zone')}
          </button>
          <button type="button" className={styles.shortcutItem} onClick={() => setWheelOpen('RESULT')}>
            <ControllerGlyph control="FACE_EAST" /> {t('scout.result', 'Result')}
          </button>
          <button type="button" className={styles.shortcutItem} onClick={() => setWheelOpen('TEAM')}>
            <ControllerGlyph control="FACE_NORTH" /> {t('scout.team', 'Team')}
          </button>
          <button type="button" className={styles.shortcutItem} onClick={() => setWheelOpen('PLAYER')}>
            <ControllerGlyph control="LEFT_BUMPER" /> {t('scout.player', 'Player')}
          </button>
          <button type="button" className={styles.shortcutItem} onClick={() => {
            const next = scout.activeTeam === 'A' ? 'B' : 'A';
            scout.setActiveTeam(next);
            setInspectedEvent(null);
          }}>
            <ControllerGlyph control="LEFT_TRIGGER" /> {t('scout.toggle_team', 'Team A/B')}
          </button>
          <button type="button" className={styles.shortcutItem} onClick={() => videoPlayback.togglePlayback()}>
            <ControllerGlyph control="RIGHT_BUMPER" /> {t('video.play_pause', 'Play/Pause')}
          </button>
          <button type="button" className={styles.shortcutItem} onClick={toggleFocusMode}>
            <ControllerGlyph control="VIEW" /> {t('scout.focus_hud', 'Focus HUD')}
          </button>
          <button type="button" className={styles.shortcutItem} onClick={() => setQuickEditOpen(true)}>
            <ControllerGlyph control="LEFT_STICK_BUTTON" /> {t('scout.edit_last_short', 'Edit Last')}
          </button>
          <button type="button" className={styles.shortcutItem} onClick={() => scout.addBookmark()}>
            <ControllerGlyph control="RIGHT_STICK_BUTTON" /> 🔖
          </button>
        </div>
      </footer>

      {/* Radial / Area Selection Overlay (Fixed Viewport Layer) */}
      {activeWheel && renderSelection()}

      {/* Pause / Session Menu Modal */}
      {isPauseMenuOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="pause-menu-title">
          <div className={styles.modalCard}>
            <h2 id="pause-menu-title">{t('session.menu_title', 'Session Menu')}</h2>
            <p className={styles.modalSubtitle}>{scout.sessionName}</p>
            <p className={styles.modalHint}>{t('session.controller_navigation_hint', 'Use the left stick or D-pad to navigate. South selects, East goes back, and Menu resumes.')}</p>

            {pendingEnd ? <div className={styles.modalActions}>
              <p className={styles.modalHint}>{t('session.incomplete_warning', 'This rally is unfinished. Saved actions will remain marked incomplete and no point will be awarded. Continue?')}</p>
              <button type="button" className={`${styles.modalBtn} ${pauseFocusIndex === 0 ? styles.modalBtnFocused : ''}`} onClick={() => activatePauseMenuItem(0)}>{t('common.back', 'Back')}</button>
              <button type="button" className={`${styles.modalBtnDanger} ${pauseFocusIndex === 1 ? styles.modalBtnFocused : ''}`} onClick={() => activatePauseMenuItem(1)}>{pendingEnd === 'set' ? t('session.next_set', 'End Set & Start Next') : t('session.end_match', 'End Match')}</button>
            </div> : <div className={styles.modalActions}>
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
            </div>}
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
                      {field.index === 0 ? field.value
                        : field.index === 1 ? field.value
                        : field.index === 2 && field.value ? t(skillKey(String(field.value)))
                        : field.index === 3 && field.value !== undefined ? `Z${field.value}`
                        : field.index === 4 && field.value !== undefined ? Number(field.value) > 0 ? '+1' : Number(field.value) === 0 ? t('result.pass', 'Pass') : '−1'
                        : '—'}
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
                className={`${styles.modalBtnPrimary} ${quickEditFocusIndex === 5 ? styles.modalBtnFocused : ''}`}
                onClick={() => void saveQuickEdit()}
                disabled={quickEditSaving}
                aria-current={quickEditFocusIndex === 5 ? 'true' : undefined}
              >
                {quickEditSaving ? t('common.saving', 'Saving...') : t('common.save', 'Save Changes')}
              </button>
              <button
                type="button"
                className={`${styles.modalBtn} ${quickEditFocusIndex === 6 ? styles.modalBtnFocused : ''}`}
                onClick={cancelQuickEdit}
                aria-current={quickEditFocusIndex === 6 ? 'true' : undefined}
              >
                {t('common.cancel', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
