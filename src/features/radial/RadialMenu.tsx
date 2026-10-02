import { useMemo } from 'react';
import styles from './RadialMenu.module.css';

interface RadialMenuProps {
  options: string[];
  activeOption: string | null;
  label: string;
}

export function RadialMenu({ options, activeOption, label }: RadialMenuProps) {
  const segmentCount = options.length;
  
  const segments = useMemo(() => {
    return options.map((opt, i) => {
      // Simple circular positioning
      const angle = (i * (360 / segmentCount)) * (Math.PI / 180);
      const radius = 120;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      return { opt, x, y };
    });
  }, [options, segmentCount]);

  return (
    <div className={styles.container}>
      <div className={styles.centerLabel}>{label}</div>
      {segments.map(({ opt, x, y }) => (
        <div 
          key={opt}
          className={`${styles.segment} ${activeOption === opt ? styles.active : ''}`}
          style={{ transform: `translate(${x}px, ${y}px)` }}
        >
          {opt}
        </div>
      ))}
    </div>
  );
}
