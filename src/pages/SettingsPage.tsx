import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './CommonPage.module.css';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>{t('app.settings')}</h1>
        
        <div className={styles.formGroup}>
          <label>{t('app.language')}</label>
          <select 
             value={i18n.language} 
             onChange={e => i18n.changeLanguage(e.target.value)}
             className={styles.input}
          >
             <option value="en">English</option>
             <option value="th">ภาษาไทย</option>
          </select>
        </div>
        
        <button onClick={() => navigate('/')} className={styles.secondaryBtn}>Back</button>
      </div>
    </div>
  );
}
