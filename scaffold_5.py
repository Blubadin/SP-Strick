import os

base_dir = "c:/Users/Sport-Science-R3909/Documents/Sp strick"

files = {
    "src/features/radial/RadialMenu.tsx": """
import React, { useMemo } from 'react';
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
""",
    "src/features/radial/RadialMenu.module.css": """
.container {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  z-index: 100;
  display: flex;
  justify-content: center;
  align-items: center;
}

.centerLabel {
  position: absolute;
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  text-shadow: 0 2px 4px rgba(0,0,0,0.5);
  transform: translate(-50%, -50%);
}

.segment {
  position: absolute;
  transform-origin: center;
  padding: 8px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-weight: 500;
  white-space: nowrap;
  transition: all 0.15s ease-out;
  box-shadow: 0 4px 6px rgba(0,0,0,0.3);
  /* The inline style handles the translate, we need to counter center it */
  margin-top: -20px;
  margin-left: -40px; 
}

.segment.active {
  background: var(--accent);
  color: #fff;
  transform: scale(1.05); /* overridden by inline style though, need to fix */
  border-color: transparent;
  box-shadow: 0 0 15px rgba(41, 151, 255, 0.4);
}
""",
    "src/pages/HomePage.tsx": """
import React from 'react';
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
""",
    "src/pages/HomePage.module.css": """
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
}

.logo {
  width: 120px;
  height: 120px;
  border-radius: 24px;
  margin-bottom: 1rem;
}

.title {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 3rem;
  letter-spacing: -0.02em;
}

.menu {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 320px;
}

.btn {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 16px;
  border-radius: 12px;
  font-size: 1.1rem;
  font-weight: 500;
  transition: background 0.2s;
}

.btn:hover {
  background: var(--surface-hover);
}
"""
}

for path, content in files.items():
    full_path = os.path.join(base_dir, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
