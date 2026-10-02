import { useEffect } from 'react';
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
