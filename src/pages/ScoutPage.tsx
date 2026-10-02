import { useTranslation } from 'react-i18next';
import { LiveScout } from '../features/scout/LiveScout';
import { useControllerStore } from '../core/controller/ControllerStore';
import styles from './ScoutPage.module.css';

export default function ScoutPage() {
  const { t } = useTranslation();
  const connected = useControllerStore((s) => s.state.connected);

  return (
    <>
      <LiveScout />

      {/* Disconnection Warning Overlay */}
      {!connected && (
        <div className={styles.disconnectNotice} role="status">
          <span className={styles.noticeTitle}>
            {t('controller.disconnected')}
          </span>
          <span className={styles.noticeCopy}>
            {t('controller.reconnect_instruction')}
          </span>
        </div>
      )}
    </>
  );
}
