import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LiveScout } from '../features/scout/LiveScout';
import { useScoutStore } from '../core/scouting/ScoutStore';
import { useControllerStore } from '../core/controller/ControllerStore';

export default function ScoutPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scout = useScoutStore();
  const ctrl = useControllerStore((s) => s.state);
  const [isInitializing, setIsInitializing] = useState(true);
  const [reconnectedToast, setReconnectedToast] = useState(false);
  const [hadController, setHadController] = useState(ctrl.connected);

  // 1. Session verification & auto-restore
  useEffect(() => {
    const checkSession = async () => {
      if (!scout.sessionId) {
        // Try restoring latest active session
        const restored = await scout.restoreActiveSession();
        if (!restored) {
          // If no active session exists, redirect to match setup!
          navigate('/setup', { replace: true });
          return;
        }
      }
      setIsInitializing(false);
    };

    checkSession();
  }, [scout, navigate]);

  // 2. Track reconnect transition for gentle feedback
  useEffect(() => {
    if (!hadController && ctrl.connected) {
      setReconnectedToast(true);
      const timer = setTimeout(() => setReconnectedToast(false), 2000);
      return () => clearTimeout(timer);
    }
    setHadController(ctrl.connected);
  }, [ctrl.connected, hadController]);

  if (isInitializing) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0B0D10',
        color: '#9CA3AF'
      }}>
        <span>Loading Match Session...</span>
      </div>
    );
  }

  return (
    <>
      <LiveScout />

      {/* Disconnection Warning Overlay */}
      {!ctrl.connected && (
        <div style={{
          position: 'fixed',
          bottom: '48px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(255, 59, 48, 0.95)',
          color: '#FFFFFF',
          padding: '12px 24px',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          zIndex: 1500,
          pointerEvents: 'none'
        }}>
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
            {t('controller.disconnected')}
          </span>
          <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>
            {t('controller.reconnect_instruction')}
          </span>
        </div>
      )}

      {/* Reconnected Toast */}
      {reconnectedToast && (
        <div style={{
          position: 'fixed',
          bottom: '48px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#34C759',
          color: '#000000',
          padding: '10px 20px',
          borderRadius: '10px',
          fontWeight: 700,
          fontSize: '0.9rem',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
          zIndex: 1500,
          pointerEvents: 'none'
        }}>
          ✓ {t('controller.reconnected', 'Controller Reconnected')}
        </div>
      )}
    </>
  );
}
