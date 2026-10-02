import { useMemo } from 'react';
import styles from './RadialMenu.module.css';

export interface RadialOptionItem {
  id: string;
  label: string;
  subLabel?: string;
}

interface RadialMenuProps {
  options: RadialOptionItem[];
  activeOptionId: string | null;
  categoryLabel: string;
  controllerHint?: string;
}

export function RadialMenu({
  options,
  activeOptionId,
  categoryLabel,
  controllerHint = 'Release to confirm'
}: RadialMenuProps) {
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
    <div className={styles.overlay}>
      <div className={styles.wheelContainer}>
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
              <div className={styles.sectorContent}>
                <span className={styles.sectorLabel}>{sec.label}</span>
                {sec.subLabel && <span className={styles.sectorSubLabel}>{sec.subLabel}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
