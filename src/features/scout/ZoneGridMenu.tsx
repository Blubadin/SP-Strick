import { useTranslation } from 'react-i18next';
import { VolleyballCourt } from './court/VolleyballCourt';
import styles from './RallyDisplay.module.css';

export interface ZoneGridMenuProps {
  selectedZone: number | null;
  onChoose: (zone: number) => void;
  onCancel: () => void;
}

export function ZoneGridMenu({ selectedZone, onChoose, onCancel }: ZoneGridMenuProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.gridOverlay}>
      <section className={styles.gridMenu} aria-label={t('scout.choose_zone', 'Choose court zone')}>
        <div className={styles.gridMenuHeading}>
          <strong>{t('scout.choose_zone', 'Choose court zone')}</strong>
          <button type="button" onClick={onCancel} aria-label={t('common.cancel', 'Cancel')}>
            ×
          </button>
        </div>
        <div className={styles.areaCourtWrapper}>
          <VolleyballCourt
            mode="interactive-selector"
            selectedZone={selectedZone}
            previewZone={selectedZone}
            onZoneSelect={onChoose}
          />
        </div>
        <p className={styles.areaHint}>
          {t('scout.hint_zone', 'HOLD X · LS SELECT · RELEASE X CONFIRM')}
        </p>
      </section>
    </div>
  );
}
