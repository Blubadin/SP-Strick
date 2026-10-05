export interface ZoneGridMenuProps {
  selectedZone: number | null; onChoose:(zone:number)=>void; onCancel:()=>void;
}
export function ZoneGridMenu({selectedZone,onChoose,onCancel}: ZoneGridMenuProps) {
  const {t} = useTranslation();
  return <div className={styles.gridOverlay}>
    <section className={styles.gridMenu} aria-label={t('scout.choose_zone','Choose court zone')}>
      <div className={styles.gridMenuHeading}><strong>{t('scout.choose_zone','Choose court zone')}</strong><button type="button" onClick={onCancel} aria-label={t('common.cancel','Cancel')}>×</button></div>
      <div className={styles.net}>{t('scout.net','NET')}</div>
      <div className={styles.zoneChoices}>{COURT_ZONE_ORDER.map(zone => <button key={zone} type="button" aria-pressed={selectedZone === zone} onClick={() => onChoose(zone)}><b>Z{zone}</b><span>{t(`zone.${zone}`)}</span></button>)}</div>
      <p>{t('scout.grid_hint','Hold X, move the left stick to a cell, then release. Center the stick to cancel, or tap a cell.')}</p>
    </section>
  </div>;
}
import { useTranslation } from 'react-i18next';
import { COURT_ZONE_ORDER } from './rallyDisplay';
import styles from './RallyDisplay.module.css';
