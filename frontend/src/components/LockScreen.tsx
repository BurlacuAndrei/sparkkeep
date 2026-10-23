import React, { useState } from 'react';
import { Lock, Sparkles, Eye, EyeOff, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { useLocale } from '../i18n';

export interface LockScreenProps {
  onUnlock: (token: string) => Promise<boolean>;
}

export const LockScreen: React.FC<LockScreenProps> = ({ onUnlock }) => {
  const { t } = useLocale();
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;

    setError(null);
    setSubmitting(true);

    try {
      const success = await onUnlock(token.trim());
      if (!success) {
        setError(t('shell.lock.incorrect'));
        setShake(true);
        setTimeout(() => setShake(false), 500);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('shell.lock.failed'));
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="lockscreen-container" role="main" aria-label={t('shell.lock.aria')}>
      <div className={`lockscreen-card ${shake ? 'shake' : ''}`}>
        {/* Brand / Logo Header */}
        <div className="lockscreen-header">
          <div className="lockscreen-badge">
            <Sparkles size={24} className="lockscreen-sparkle" />
          </div>
          <h1 className="lockscreen-title">Sparkkeep</h1>
          <div className="lockscreen-status-pill">
            <Lock size={12} strokeWidth={2.5} />
            <span>{t('shell.lock.protected')}</span>
          </div>
        </div>

        <p className="lockscreen-desc">{t('shell.lock.desc')}</p>

        {/* Error Alert */}
        {error && (
          <div className="lockscreen-error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="lockscreen-form">
          <div className="setup-form-group">
            <label htmlFor="master-passphrase-input">{t('shell.lock.passphraseLabel')}</label>
            <div className="setup-input-wrapper">
              <input
                id="master-passphrase-input"
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={t('shell.lock.passphrasePlaceholder')}
                className="setup-input"
                autoFocus
                disabled={submitting}
                required
              />
              <button
                type="button"
                className="setup-eye-btn"
                onClick={() => setShowToken(!showToken)}
                aria-label={showToken ? t('settings.security.hide') : t('settings.security.show')}
                tabIndex={-1}
              >
                {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="setup-btn-primary lockscreen-submit-btn"
            disabled={!token.trim() || submitting}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="spin" />
                <span>{t('shell.lock.verifying')}</span>
              </>
            ) : (
              <>
                <span>{t('shell.lock.unlock')}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="lockscreen-footer-note">
          <Lock size={12} />
          <span>{t('shell.lock.footer')}</span>
        </div>
      </div>
    </div>
  );
};
