import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './RadialMenu.module.css';

export interface RadialOptionItem {
  id: string;
  label: string;
  subLabel?: string;
}

const wheelSizes: Record<NonNullable<RadialMenuProps['size']>, string> = {
  normal: '280px',
  large: '300px',
  extraLarge: '320px',
};

interface RadialMenuProps {
  options: RadialOptionItem[];
  activeOptionId: string | null;
  categoryLabel: string;
  controllerHint?: string;
  size?: 'normal' | 'large' | 'extraLarge';
  onChoose?: (item:RadialOptionItem) => void;
  onCancel?: () => void;
}

export function RadialMenu({
  options,
  activeOptionId,
  categoryLabel,
  controllerHint = 'Move LS · release to confirm',
  size = 'large', onChoose, onCancel
}: RadialMenuProps) {
  const {t} = useTranslation();
  const count = options.length;

  const sectors = useMemo(() => {
    return options.map((opt, i) => {
      // 0 degrees is Right (X > 0, Y = 0)
      const angleDeg = i * (360 / count);
      const angleRad = (angleDeg * Math.PI) / 180;

      return {
        ...opt,
        index: i,
        angleDeg,
        cos: Math.cos(angleRad),
        sin: Math.sin(angleRad)
      };
    });
  }, [options, count]);

  const activeOption = options.find((o) => o.id === activeOptionId);

  return (
    <div className={styles.overlay} style={{ '--backdrop-opacity': 0.12 } as React.CSSProperties}>
      <div
        className={styles.wheelContainer}
        data-size={size}
        style={{ '--preferred-size': wheelSizes[size] } as React.CSSProperties}
      >
        {/* Subtle backdrop disc */}
        <div className={styles.wheelRing} />

        {/* Center hub */}
        <div className={styles.centerHub}>
          <span className={styles.categoryTitle}>{categoryLabel}</span>
          {activeOption ? (
            <span className={styles.selectionPreview}>{activeOption.label}</span>
          ) : (
            <span className={styles.controllerHint}>{controllerHint}</span>
          )}
          {onCancel && <button type="button" className={styles.cancelButton} onClick={onCancel}>{t('common.cancel','Cancel')}</button>}
        </div>

        {/* Radial items */}
        {sectors.map((sec) => {
          const isActive = sec.id === activeOptionId;

          return (
            <div
              key={sec.id}
              className={`${styles.sectorWrapper} ${isActive ? styles.sectorActive : ''}`}
              style={
                {
                  '--cos': sec.cos,
                  '--sin': sec.sin,
                  '--scale': isActive ? 1.08 : 1
                } as React.CSSProperties
              }
            >
              <button type="button" className={styles.sectorContent} aria-pressed={isActive} onClick={() => onChoose?.(options[sec.index])}>
                <span className={styles.sectorLabel}>{sec.label}</span>
                {sec.subLabel && <span className={styles.sectorSubLabel}>{sec.subLabel}</span>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
