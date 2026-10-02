import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './HomePage.module.css';

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className={styles.container}>
      <img src="/branding/sp-stick-logo.jpg" alt="SP Stick Logo" className={styles.logo} />
      <h1 className={styles.title}>{t('app.name')}</h1>
      
      <div className={styles.menu}>
        <button className={styles.btn} onClick={() => navigate('/setup')}>{t('app.new_session')}</button>
        <button className={styles.btn} onClick={() => navigate('/controller')}>{t('app.controller')}</button>
        <button className={styles.btn} onClick={() => navigate('/settings')}>{t('app.settings')}</button>
      </div>
    </div>
  );
}
