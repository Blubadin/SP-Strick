import { useNavigate } from 'react-router-dom';
import { useControllerStore } from '../core/controller/ControllerStore';
import { useTranslation } from 'react-i18next';
import styles from './CommonPage.module.css';

export default function ControllerPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const ctrl = useControllerStore();

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>{t('app.controller')}</h1>
        
        {ctrl.state.connected ? (
          <div className={styles.statusBox}>
            <div className={styles.successIcon}>✓</div>
            <h2>{t('controller.connected')}</h2>
            <p>{ctrl.state.id}</p>
          </div>
        ) : (
          <div className={styles.statusBox}>
            <h2>{t('controller.connect_instruction')}</h2>
            <p>{t('controller.press_any')}</p>
          </div>
        )}
        
        <div className={styles.actions}>
           <button onClick={() => navigate('/')} className={styles.secondaryBtn}>Back</button>
        </div>
      </div>
    </div>
  );
}
