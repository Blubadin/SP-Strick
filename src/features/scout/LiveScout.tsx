import { useEffect, useState, useMemo } from 'react';
import { useControllerStore } from '../../core/controller/ControllerStore';
import { useScoutStore } from '../../core/scouting/ScoutStore';
import { RadialMenu } from '../radial/RadialMenu';
import { useTranslation } from 'react-i18next';
import styles from './LiveScout.module.css';

const SKILLS = ['Attack', 'Block', 'Set', 'Receive', 'Serve', 'Dig', 'Freeball', 'Other'];
const ZONES = ['1', '6', '5', '4', '3', '2'];
const RESULTS = ['+1', '0', '-1'];

function getActiveSegment(angle: number, magnitude: number, optionsCount: number): number | null {
  if (magnitude < 0.55) return null;
  // Options are laid out circularly. 
  // Let's assume angle 0 is Right (option 0), angle increases clockwise.
  const segmentAngle = 360 / optionsCount;
  // Shift by half segment so option 0 is centered at 0 degrees
  let shiftedAngle = (angle + segmentAngle / 2) % 360;
  if (shiftedAngle < 0) shiftedAngle += 360;
  return Math.floor(shiftedAngle / segmentAngle) % optionsCount;
}

export function LiveScout() {
  const { t } = useTranslation();
  const { state: ctrl } = useControllerStore();
  const scout = useScoutStore();

  const [activeWheel, setActiveWheel] = useState<'SKILL' | 'ZONE' | 'RESULT' | null>(null);
  const [wheelSelection, setWheelSelection] = useState<string | null>(null);

  // Wheel configuration
  const wheelConfig = useMemo(() => {
    switch (activeWheel) {
      case 'SKILL': return { options: SKILLS, label: t('scout.skill') };
      case 'ZONE': return { options: ZONES, label: t('scout.zone') };
      case 'RESULT': return { options: RESULTS, label: t('scout.result') };
      default: return null;
    }
  }, [activeWheel, t]);

  // Handle D-Pad shortcuts
  useEffect(() => {
    if (ctrl.buttons.DPAD_UP.pressedThisFrame) {
      scout.updateCurrentEvent({ evaluation: 1 });
      scout.commitEvent();
    }
    if (ctrl.buttons.DPAD_RIGHT.pressedThisFrame) {
      scout.updateCurrentEvent({ evaluation: 0 });
      scout.commitEvent();
    }
    if (ctrl.buttons.DPAD_DOWN.pressedThisFrame) {
      scout.updateCurrentEvent({ evaluation: -1 });
      scout.commitEvent();
    }
    if (ctrl.buttons.DPAD_LEFT.pressedThisFrame) {
      scout.undoLastEvent();
    }
    if (ctrl.buttons.LEFT_BUMPER.pressedThisFrame) {
      scout.setActiveTeam('A');
    }
    if (ctrl.buttons.RIGHT_BUMPER.pressedThisFrame) {
      scout.setActiveTeam('B');
    }
  }, [ctrl.buttons.DPAD_UP.pressedThisFrame, ctrl.buttons.DPAD_RIGHT.pressedThisFrame, ctrl.buttons.DPAD_DOWN.pressedThisFrame, ctrl.buttons.DPAD_LEFT.pressedThisFrame, ctrl.buttons.LEFT_BUMPER.pressedThisFrame, ctrl.buttons.RIGHT_BUMPER.pressedThisFrame]);

  // Handle radial menu open/close
  useEffect(() => {
    if (ctrl.buttons.FACE_SOUTH.pressedThisFrame) setActiveWheel('SKILL');
    if (ctrl.buttons.FACE_WEST.pressedThisFrame) setActiveWheel('ZONE');
    if (ctrl.buttons.FACE_EAST.pressedThisFrame) setActiveWheel('RESULT');

    const handleRelease = (wheelType: 'SKILL'|'ZONE'|'RESULT') => {
      if (activeWheel === wheelType && wheelSelection) {
        if (wheelType === 'SKILL') scout.updateCurrentEvent({ skill: wheelSelection });
        if (wheelType === 'ZONE') scout.updateCurrentEvent({ originZone: parseInt(wheelSelection) });
        if (wheelType === 'RESULT') {
            const evalNum = wheelSelection === '+1' ? 1 : wheelSelection === '0' ? 0 : -1;
            scout.updateCurrentEvent({ evaluation: evalNum });
            scout.commitEvent();
        }
      }
      setActiveWheel(null);
      setWheelSelection(null);
    };

    if (ctrl.buttons.FACE_SOUTH.releasedThisFrame) handleRelease('SKILL');
    if (ctrl.buttons.FACE_WEST.releasedThisFrame) handleRelease('ZONE');
    if (ctrl.buttons.FACE_EAST.releasedThisFrame) handleRelease('RESULT');
  }, [
    ctrl.buttons.FACE_SOUTH.pressedThisFrame, ctrl.buttons.FACE_SOUTH.releasedThisFrame,
    ctrl.buttons.FACE_WEST.pressedThisFrame, ctrl.buttons.FACE_WEST.releasedThisFrame,
    ctrl.buttons.FACE_EAST.pressedThisFrame, ctrl.buttons.FACE_EAST.releasedThisFrame,
    activeWheel, wheelSelection
  ]);

  // Handle radial menu selection
  useEffect(() => {
    if (activeWheel && wheelConfig) {
      const idx = getActiveSegment(ctrl.leftStick.angle, ctrl.leftStick.magnitude, wheelConfig.options.length);
      if (idx !== null) {
        setWheelSelection(wheelConfig.options[idx]);
      } else {
        // Optionally keep previous selection for hysteresis, but simple threshold for now
        // setWheelSelection(null); 
      }
    }
  }, [ctrl.leftStick.angle, ctrl.leftStick.magnitude, activeWheel, wheelConfig]);


  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.brand}>SP Stick &bull; Volleyball</div>
        <div className={styles.scoreBoard}>
           <span className={scout.activeTeam === 'A' ? styles.activeTeam : ''}>A: {scout.scoreA}</span>
           <span className={styles.setNum}>SET {scout.currentSet}</span>
           <span className={scout.activeTeam === 'B' ? styles.activeTeam : ''}>B: {scout.scoreB}</span>
        </div>
        <div className={styles.status}>
          {ctrl.connected ? <span className={styles.connected}>●</span> : <span className={styles.disconnected}>○</span>}
        </div>
      </header>

      <main className={styles.main}>
        {activeWheel && wheelConfig && (
          <RadialMenu 
            options={wheelConfig.options}
            label={wheelConfig.label}
            activeOption={wheelSelection}
          />
        )}
        
        {scout.status === 'SAVED' && (
          <div className={styles.savedFeedback}>✓ {t('scout.saved')}</div>
        )}

        {!activeWheel && (
          <div className={styles.eventBuilder}>
            <h2>{scout.activeTeam === 'A' ? t('team.a') : t('team.b')}</h2>
            <div className={styles.builderRow}>
               <span className={scout.currentEvent.skill ? styles.filled : styles.empty}>{scout.currentEvent.skill || t('scout.skill')}</span>
               <span className={scout.currentEvent.originZone ? styles.filled : styles.empty}>{scout.currentEvent.originZone ? `Z${scout.currentEvent.originZone}` : t('scout.zone')}</span>
               <span className={scout.currentEvent.evaluation !== undefined ? styles.filled : styles.empty}>{scout.currentEvent.evaluation !== undefined ? scout.currentEvent.evaluation : t('scout.result')}</span>
            </div>
          </div>
        )}
      </main>
      
      <aside className={styles.sidebar}>
         <h3>Recent</h3>
         <ul className={styles.historyList}>
           {scout.recentEvents.map(e => (
             <li key={e.id} className={styles.historyItem}>
               {e.teamId} / {e.skill} / Z{e.originZone} / {(e.evaluation ?? 0) > 0 ? '+1' : (e.evaluation ?? 0)}
             </li>
           ))}
         </ul>
      </aside>
    </div>
  );
}
