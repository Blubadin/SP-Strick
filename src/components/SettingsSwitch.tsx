import styles from './SettingsSwitch.module.css';

interface SettingsSwitchProps {
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export default function SettingsSwitch({
  title,
  description,
  checked,
  disabled = false,
  onChange
}: SettingsSwitchProps) {
  return (
    <div className={styles.row}>
      <div className={styles.copy}>
        <span className={styles.title}>{title}</span>
        {description && <span className={styles.description}>{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-label={title}
        aria-checked={checked}
        disabled={disabled}
        className={styles.switch}
        data-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.thumb} />
      </button>
    </div>
  );
}
