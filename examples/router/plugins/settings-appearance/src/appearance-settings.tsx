import type { ThemeRuntime } from '@react-cordis/theme';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './appearance-settings.module.css';
import darkPreview from './assets/theme-preview-dark.svg';
import lightPreview from './assets/theme-preview-light.svg';
import systemPreview from './assets/theme-preview-system.svg';

const themePreviews = { dark: darkPreview, light: lightPreview, system: systemPreview } as const;

export function AppearanceSettings({ theme }: { theme: ThemeRuntime }) {
  const { t } = useTranslation('settings-appearance');
  const snapshot = useSyncExternalStore(theme.subscribe, () => theme.snapshot);

  return (
    <fieldset className={styles.panel}>
      <legend>{t('appearance.title')}</legend>
      <div className={styles.themeOptions}>
        {(['system', 'light', 'dark'] as const).map(value => (
          <label key={value} className={styles.themeOption}>
            <input
              className={styles.themeInput}
              checked={snapshot.preference === value}
              name="theme"
              type="radio"
              value={value}
              onChange={() => theme.setTheme(value)}
            />
            <span className={styles.preview} data-theme-preview={value} aria-hidden="true">
              <img alt="" src={themePreviews[value]} />
            </span>
            <span>{t(`appearance.preference.${value}`)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
