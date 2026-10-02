import os

base_dir = "c:/Users/Sport-Science-R3909/Documents/Sp strick"

files = {
    "src/features/scout/LiveScout.tsx": """
import React, { useEffect, useState, useMemo } from 'react';
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
               {e.teamId} / {e.skill} / Z{e.originZone} / {e.evaluation > 0 ? '+1' : e.evaluation}
             </li>
           ))}
         </ul>
      </aside>
    </div>
  );
}
""",
    "src/features/scout/LiveScout.module.css": """
.container {
  display: grid;
  grid-template-columns: 1fr 300px;
  grid-template-rows: 64px 1fr;
  height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.header {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.brand {
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}

.scoreBoard {
  display: flex;
  gap: 24px;
  font-size: 1.5rem;
  font-weight: 700;
}

.setNum {
  color: var(--text-secondary);
  font-size: 1rem;
  align-self: center;
}

.activeTeam {
  color: var(--accent);
}

.status {
  font-size: 1.2rem;
}

.connected { color: var(--success); }
.disconnected { color: var(--danger); }

.main {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.sidebar {
  border-left: 1px solid var(--border);
  background: var(--surface);
  padding: 24px;
}

.historyList {
  list-style: none;
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.historyItem {
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 8px;
  font-family: monospace;
  font-size: 0.9rem;
}

.eventBuilder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.eventBuilder h2 {
  font-size: 2rem;
  color: var(--text-secondary);
}

.builderRow {
  display: flex;
  gap: 16px;
}

.builderRow span {
  padding: 12px 24px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 1.2rem;
  font-weight: 500;
  min-width: 100px;
  text-align: center;
}

.builderRow .empty {
  color: var(--text-secondary);
  border-style: dashed;
}

.builderRow .filled {
  color: var(--text-primary);
  border-color: var(--accent);
}

.savedFeedback {
  position: absolute;
  top: 40px;
  background: var(--success);
  color: #000;
  padding: 8px 24px;
  border-radius: 20px;
  font-weight: 600;
  animation: fadeOut 1s forwards;
}

@keyframes fadeOut {
  0% { opacity: 1; transform: translateY(0); }
  70% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-10px); }
}

@media (max-width: 768px) {
  .container {
    grid-template-columns: 1fr;
    grid-template-rows: 64px 1fr 200px;
  }
  .sidebar {
    border-left: none;
    border-top: 1px solid var(--border);
  }
}
""",
    "src/pages/ScoutPage.tsx": """
import React, { useEffect } from 'react';
import { LiveScout } from '../features/scout/LiveScout';
import { useScoutStore } from '../core/scouting/ScoutStore';
import { useTranslation } from 'react-i18next';
import { useControllerStore } from '../core/controller/ControllerStore';

export default function ScoutPage() {
  const scout = useScoutStore();
  const ctrl = useControllerStore();
  const { t } = useTranslation();

  // Create temporary session if none exists
  useEffect(() => {
    if (!scout.sessionId) {
      scout.createSession("Team A", "Team B");
    }
  }, [scout]);

  return (
    <>
      <LiveScout />
      {!ctrl.state.connected && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--danger)', padding: '12px 24px', borderRadius: 8, fontWeight: 'bold'
        }}>
          {t('controller.disconnected')}
        </div>
      )}
    </>
  );
}
"""
}

for path, content in files.items():
    full_path = os.path.join(base_dir, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
