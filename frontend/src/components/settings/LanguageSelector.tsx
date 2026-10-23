import { useLocale } from '../../i18n';
import type { Locale } from '../../i18n';

/**
 * Language switcher for Settings → Appearance. Native `<select>` so the
 * existing `pref-select` styling and change-event tests keep working.
 */
export function LanguageSelector() {
  const { locale, setLocale, locales, t } = useLocale();

  return (
    <div className="pref-item-card">
      <div className="pref-item-text">
        <span className="pref-item-title">{t('settings.appearance.language')}</span>
        <span className="pref-item-desc">{t('settings.appearance.languageHint')}</span>
      </div>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="pref-select"
        aria-label={t('settings.appearance.language')}
      >
        {locales.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
