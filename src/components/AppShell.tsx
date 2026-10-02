import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ClipboardList, Gamepad2, House, Settings2, Volleyball } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useControllerStore } from '../core/controller/ControllerStore';
import { usePreferencesStore } from '../core/preferences/PreferencesStore';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
}

const navigation = [
  { to: '/', key: 'nav.home', icon: House },
  { to: '/setup', key: 'nav.match', icon: Volleyball },
  { to: '/controller', key: 'nav.controller', icon: Gamepad2 },
  { to: '/review', key: 'nav.review', icon: ClipboardList },
  { to: '/settings', key: 'nav.settings', icon: Settings2 }
];

function NavigationLinks({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      {navigation.map(({ to, key, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navActive : ''}`}
          aria-label={compact ? t(key) : undefined}
        >
          <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
          <span>{t(key)}</span>
        </NavLink>
      ))}
    </>
  );
}

export default function AppShell({ children }: AppShellProps) {
  const { t, i18n } = useTranslation();
  const connected = useControllerStore((s) => s.state.connected);
  const controllerId = useControllerStore((s) => s.state.id);
  const setPreference = usePreferencesStore((s) => s.setPreference);

  const toggleLanguage = () => void setPreference('language', i18n.language.startsWith('th') ? 'en' : 'th');

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <NavLink to="/" className={styles.brand} aria-label={t('app.name')}>
          <img src="/branding/sp-stick-logo.jpg" alt="" />
          <span>SP Stick</span>
        </NavLink>
        <div className={styles.topTools}>
          <div className={styles.connection} aria-live="polite">
            <span className={`${styles.connectionDot} ${connected ? styles.isConnected : ''}`} />
            <span className={styles.connectionText}>
              {connected ? controllerId || t('controller.connected') : t('controller.disconnected')}
            </span>
          </div>
          <button type="button" className={styles.languageButton} onClick={toggleLanguage}>
            {i18n.language.startsWith('th') ? 'TH' : 'EN'}
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <nav className={styles.sidebar} aria-label={t('nav.primary')}>
          <div className={styles.navCaption}>{t('nav.workspace')}</div>
          <NavigationLinks />
          <div className={styles.sidebarFooter}>{t('app.tagline')}</div>
        </nav>
        <div className={styles.mainColumn}>
          <nav className={styles.mobileNav} aria-label={t('nav.primary')}>
            <NavigationLinks compact />
          </nav>
          <main className={styles.main} id="main-content">
            <div className={styles.content}>{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
