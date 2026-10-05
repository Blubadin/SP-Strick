import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, ChevronUp, Gamepad2, MoveRight, Users } from 'lucide-react';
import AppShell from '../components/AppShell';
import { ControllerGlyph } from '../components/ControllerGlyph';
import { intentDispatcher } from '../core/controller/ControllerIntent';
import { useControllerStore } from '../core/controller/ControllerStore';
import type { Player } from '../core/persistence/database';
import { useScoutStore } from '../core/scouting/ScoutStore';
import { audioFeedbackManager } from '../core/preferences/AudioFeedbackManager';
import {
  advanceControllerCheck,
  getSetupSkillSelection,
  initialControllerCheck,
  type ControllerCheckEvent
} from './setupControllerCheck';
import styles from './SetupPage.module.css';

interface StickSample {
  x: number;
  y: number;
}

function parsePlayers(raw: string): Player[] {
  if (!raw.trim()) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((item, index) => {
      const numberMatch = item.match(/\d+/);
      const number = numberMatch ? Number.parseInt(numberMatch[0], 10) : index + 1;
      const name = item.replace(/\d+/, '').trim() || undefined;
      return { id: crypto.randomUUID(), number, name };
    });
}

export default function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createSession = useScoutStore((state) => state.createSession);
  const ctrlState = useControllerStore((state) => state.state);
  const profile = useControllerStore((state) => state.profile);

  const [teamA, setTeamA] = useState(() => t('team.a', 'Team A'));
  const [teamB, setTeamB] = useState(() => t('team.b', 'Team B'));
  const [teamAPlayersRaw, setTeamAPlayersRaw] = useState('');
  const [teamBPlayersRaw, setTeamBPlayersRaw] = useState('');
  const [showPlayerSetup, setShowPlayerSetup] = useState(false);
  const [controllerCheck, setControllerCheck] = useState(initialControllerCheck);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState(false);

  const controllerCheckRef = useRef(controllerCheck);
  const transitionCheck = useCallback((event: ControllerCheckEvent) => {
    const next = advanceControllerCheck(controllerCheckRef.current, event);
    controllerCheckRef.current = next;
    setControllerCheck(next);
  }, []);

  const lastStickSampleRef = useRef<StickSample | null>(null);
  const movedStickAfterOpenRef = useRef(false);
  const selectedSectorRef = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribeIntent = intentDispatcher.subscribe((intent) => {
      if (intent.type !== 'OPEN_RADIAL' || intent.category !== 'SKILL') return;

      // GamepadPoller publishes the fresh semantic press edge before dispatching
      // OPEN_RADIAL. Requiring that edge keeps synthetic intents and UI clicks out.
      const liveState = useControllerStore.getState().state;
      if (!liveState.connected || !liveState.buttons.FACE_SOUTH.pressedThisFrame) return;

      lastStickSampleRef.current = {
        x: liveState.leftStick.x,
        y: liveState.leftStick.y
      };
      movedStickAfterOpenRef.current = false;
      selectedSectorRef.current = null;
      transitionCheck({ type: 'OPEN_SKILL_RADIAL', physicalPress: true });
    });

    // Subscribe to the external store directly so the one-frame release edge
    // cannot be lost to React render batching.
    const unsubscribeController = useControllerStore.subscribe((store) => {
      const liveState = store.state;
      if (!liveState.connected) {
        lastStickSampleRef.current = null;
        movedStickAfterOpenRef.current = false;
        selectedSectorRef.current = null;
        transitionCheck({ type: 'DISCONNECT' });
        return;
      }

      if (controllerCheckRef.current.status !== 'holding') return;

      const sample = { x: liveState.leftStick.x, y: liveState.leftStick.y };
      const previousSample = lastStickSampleRef.current;
      if (
        previousSample &&
        Math.hypot(sample.x - previousSample.x, sample.y - previousSample.y) >= 0.12
      ) {
        movedStickAfterOpenRef.current = true;
      }
      lastStickSampleRef.current = sample;

      let selectedSkillId: string | null = null;
      if (movedStickAfterOpenRef.current) {
        const selection = getSetupSkillSelection(
          liveState.leftStick.angle,
          liveState.leftStick.magnitude,
          selectedSectorRef.current
        );
        selectedSectorRef.current = selection.sectorIndex;
        selectedSkillId = selection.skillId;
      }

      transitionCheck({ type: 'STICK_SELECTION', skillId: selectedSkillId });
      if (liveState.buttons.FACE_SOUTH.releasedThisFrame) {
        transitionCheck({ type: 'FACE_SOUTH_RELEASE', physicalRelease: true });
      }
    });

    return () => {
      unsubscribeIntent();
      unsubscribeController();
    };
  }, [transitionCheck]);

  const handleStart = async (skipControllerCheck = false) => {
    if (!skipControllerCheck && controllerCheckRef.current.status !== 'complete') return;
    void audioFeedbackManager.unlock();
    setIsStarting(true);
    setStartError(false);
    const fallbackTeamA = t('team.a', 'Team A');
    const fallbackTeamB = t('team.b', 'Team B');

    try {
      await createSession(
        teamA.trim() || fallbackTeamA,
        teamB.trim() || fallbackTeamB,
        parsePlayers(teamAPlayersRaw),
        parsePlayers(teamBPlayersRaw)
      );
      navigate('/scout');
    } catch {
      setIsStarting(false);
      setStartError(true);
    }
  };

  const attackSelected =
    controllerCheck.status === 'holding' && controllerCheck.selectedSkillId === 'attack';
  const isCheckComplete = controllerCheck.status === 'complete';
  const checkMessage = !ctrlState.connected
    ? t('setup.controller_connect_instruction', 'Connect a controller to run this check. You can skip it and start scouting without one.')
    : isCheckComplete
      ? t('setup.controller_passed', 'Controller check passed. You are ready to scout.')
      : attackSelected
        ? t('setup.controller_release_instruction', 'Attack selected. Release the face button to finish the check.')
        : controllerCheck.status === 'holding'
          ? t('setup.controller_move_instruction', 'Keep the face button held and flick the left stick toward Attack.')
          : t('setup.controller_wait_instruction', 'Hold the face button to open the skill wheel, then select Attack with the left stick.');

  const attackLabel = t('skill.attack', 'Attack');

  return (
    <AppShell>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>{t('setup.eyebrow', 'MATCH DAY')}</p>
            <h1>{t('setup.title', 'Match Setup')}</h1>
            <p className={styles.pageDescription}>
              {t('setup.description', 'Set the two sides, then confirm the controller gesture you will use during live scouting.')}
            </p>
          </div>
          <div className={styles.sportMark}>
            <span className={styles.sportMarkIcon}><Gamepad2 size={17} /></span>
            <span>{t('sport.volleyball', 'Volleyball')}</span>
          </div>
        </header>

        <div className={styles.setupGrid}>
          <section className={styles.panel} aria-labelledby="match-details-title">
            <div className={styles.panelHeading}>
              <div className={styles.headingIcon}><Users size={18} /></div>
              <div>
                <h2 id="match-details-title">{t('setup.match_details', 'Match details')}</h2>
                <p>{t('setup.match_details_hint', 'Name the sides as they appear on the scoreboard.')}</p>
              </div>
            </div>

            <div className={styles.teamFields}>
              <div className={styles.field}>
                <label htmlFor="team-a">{t('setup.team_a', 'Team A')}</label>
                <input
                  id="team-a"
                  type="text"
                  value={teamA}
                  onChange={(event) => setTeamA(event.target.value)}
                  placeholder={t('setup.team_name_placeholder', 'Enter team name')}
                  maxLength={48}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="team-b">{t('setup.team_b', 'Team B')}</label>
                <input
                  id="team-b"
                  type="text"
                  value={teamB}
                  onChange={(event) => setTeamB(event.target.value)}
                  placeholder={t('setup.team_name_placeholder', 'Enter team name')}
                  maxLength={48}
                />
              </div>
            </div>

            <div className={styles.rosterSection}>
              <button
                type="button"
                className={styles.rosterToggle}
                aria-expanded={showPlayerSetup}
                aria-controls="player-rosters"
                onClick={() => setShowPlayerSetup((visible) => !visible)}
              >
                <span className={styles.rosterToggleText}>
                  <Users size={16} />
                  {t('setup.roster_toggle', 'Add player rosters')}
                  <span className={styles.optionalLabel}>{t('common.optional', 'OPTIONAL')}</span>
                </span>
                {showPlayerSetup ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
              </button>
              <p className={styles.rosterHint}>
                {t('setup.roster_hint', 'You can skip this and add player details during review.')}
              </p>

              {showPlayerSetup && (
                <div className={styles.rosterFields} id="player-rosters">
                  <div className={styles.field}>
                    <label htmlFor="team-a-players">{t('setup.players_a', 'Team A players')}</label>
                    <input
                      id="team-a-players"
                      type="text"
                      value={teamAPlayersRaw}
                      onChange={(event) => setTeamAPlayersRaw(event.target.value)}
                      placeholder={t('setup.players_placeholder', '3 Name, 5 Name, 7')}
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="team-b-players">{t('setup.players_b', 'Team B players')}</label>
                    <input
                      id="team-b-players"
                      type="text"
                      value={teamBPlayersRaw}
                      onChange={(event) => setTeamBPlayersRaw(event.target.value)}
                      placeholder={t('setup.players_placeholder', '3 Name, 5 Name, 7')}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className={styles.checkPanel} aria-labelledby="controller-check-title">
            <div className={styles.panelHeading}>
              <div className={styles.headingIcon}><Gamepad2 size={18} /></div>
              <div>
                <h2 id="controller-check-title">{t('setup.controller_check_title', 'Controller check')}</h2>
                <p>{t('setup.controller_check_hint', 'Try the live scouting gesture once before the match.')}</p>
              </div>
            </div>

            <div className={styles.controllerIdentity}>
              <span className={`${styles.connectionDot} ${ctrlState.connected ? styles.isConnected : ''}`} />
              <div className={styles.controllerIdentityText}>
                <span className={styles.controllerName}>
                  {ctrlState.connected ? profile.name : t('controller.disconnected', 'Disconnected')}
                </span>
                <span className={styles.controllerMeta}>
                  {ctrlState.connected
                    ? t('setup.controller_connected_ready', 'Controller connected')
                    : t('setup.controller_connect_hint', 'USB or Bluetooth · Press any button after connecting')}
                </span>
              </div>
              {isCheckComplete && <Check className={styles.passedIcon} size={19} aria-hidden="true" />}
            </div>

            <div className={styles.gestureArea}>
              <div className={styles.targetVisual} aria-hidden="true">
                <div className={styles.targetRing}>
                  <span className={styles.targetUp} />
                  <span className={styles.targetDown} />
                  <span className={styles.targetLeft} />
                  <span className={`${styles.attackTarget} ${attackSelected || isCheckComplete ? styles.targetActive : ''}`}>
                    {attackLabel}
                  </span>
                  <span className={styles.targetCenter}>
                    <span className={styles.stickDot} />
                  </span>
                </div>
                <span className={styles.targetCaption}>{t('setup.attack_sector_hint', 'RIGHT · ATTACK SECTOR')}</span>
              </div>

              <ol className={styles.steps}>
                <li className={controllerCheck.status !== 'waiting' ? styles.stepDone : styles.stepCurrent}>
                  <span className={styles.stepIndex}>{controllerCheck.status !== 'waiting' ? <Check size={14} /> : '1'}</span>
                  <span className={styles.stepCopy}>
                    <strong>{t('setup.controller_step_hold', 'Hold')}</strong>
                    <span><ControllerGlyph control="FACE_SOUTH" size="small" /> {t('setup.controller_step_hold_detail', 'the face button')}</span>
                  </span>
                </li>
                <li className={attackSelected || isCheckComplete ? styles.stepDone : controllerCheck.status === 'holding' ? styles.stepCurrent : styles.stepPending}>
                  <span className={styles.stepIndex}>{attackSelected || isCheckComplete ? <Check size={14} /> : '2'}</span>
                  <span className={styles.stepCopy}>
                    <strong>{t('setup.controller_step_move', 'Flick')}</strong>
                    <span>{t('setup.controller_step_move_detail', 'the left stick right to Attack')}</span>
                  </span>
                </li>
                <li className={isCheckComplete ? styles.stepDone : attackSelected ? styles.stepCurrent : styles.stepPending}>
                  <span className={styles.stepIndex}>{isCheckComplete ? <Check size={14} /> : '3'}</span>
                  <span className={styles.stepCopy}>
                    <strong>{t('setup.controller_step_release', 'Release')}</strong>
                    <span><ControllerGlyph control="FACE_SOUTH" size="small" /> {t('setup.controller_step_release_detail', 'to confirm')}</span>
                  </span>
                </li>
              </ol>
            </div>

            <div className={`${styles.instruction} ${isCheckComplete ? styles.instructionSuccess : ''}`} role="status" aria-live="polite">
              {isCheckComplete && <Check size={17} aria-hidden="true" />}
              <span>{checkMessage}</span>
              {!ctrlState.connected && <MoveRight size={16} aria-hidden="true" />}
            </div>
          </section>
        </div>

        <footer className={styles.actions}>
          <div className={styles.actionCopy}>
            {startError ? (
              <p className={styles.errorMessage} role="alert">{t('setup.start_error', 'Could not create the scouting session. Please try again.')}</p>
            ) : (
              <p>{t('setup.start_note', 'Your match and event data are saved on this device.')}</p>
            )}
          </div>
          <div className={styles.actionButtons}>
            <button
              type="button"
              className={styles.skipButton}
              disabled={isStarting}
              onClick={() => void handleStart(true)}
            >
              {t('setup.skip_controller_check', 'Skip controller check')}
            </button>
            <button
              type="button"
              className={styles.startButton}
              disabled={!isCheckComplete || isStarting}
              onClick={() => void handleStart()}
            >
              {isStarting ? t('setup.starting', 'Starting…') : t('setup.start_match', 'Start scouting')}
              <MoveRight size={17} aria-hidden="true" />
            </button>
          </div>
        </footer>
      </div>
    </AppShell>
  );
}
