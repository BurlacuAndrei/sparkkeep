import React, { useState } from 'react';
import { Shield, EyeOff, Eye, AlertCircle } from 'lucide-react';
import { useLocale } from '../../i18n';

export interface SecurityTabProps {
  authToken: string;
  setAuthToken: (val: string) => void;
  confirmAuthToken: string;
  setConfirmAuthToken: (val: string) => void;
  hasAuthToken: boolean;
  showToast: (msg: string) => void;
  onDirtyChange?: () => void;
}

export const SecurityTab: React.FC<SecurityTabProps> = ({
  authToken,
  setAuthToken,
  confirmAuthToken,
  setConfirmAuthToken,
  hasAuthToken,
  showToast: _showToast,
  onDirtyChange,
}) => {
  const { t } = useLocale();
  const [showAuthToken, setShowAuthToken] = useState(false);

  return (
    <div className="settings-panel" role="tabpanel">
      {/* 1. Master Passphrase & Access Security */}
      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-title">{t('settings.security.title')}</span>
          <span className="settings-section-desc">
            {t('settings.security.desc')}
          </span>
        </div>

        {/* Security Status Card */}
        <div className="settings-status-card">
          <div className="settings-status-info">
            <span className="settings-status-title">{t('settings.security.statusTitle')}</span>
            <span className="settings-status-sub">
              {t('settings.security.statusSub')}
            </span>
          </div>
          <span className={`settings-badge ${hasAuthToken ? 'success' : 'neutral'}`}>
            <Shield size={12} />
            {hasAuthToken ? t('settings.security.protected') : t('settings.security.openAccess')}
          </span>
        </div>

        {/* New Master Token */}
        <div className="setup-form-group">
          <label htmlFor="settings-auth-token">
            {t('settings.security.newPassphrase')}{' '}
            {hasAuthToken ? t('settings.security.leaveBlank') : ''}
          </label>
          <div className="setup-input-wrapper">
            <input
              id="settings-auth-token"
              type={showAuthToken ? 'text' : 'password'}
              value={authToken}
              onChange={(e) => {
                setAuthToken(e.target.value);
                onDirtyChange?.();
              }}
              className="setup-input"
              placeholder={
                hasAuthToken
                  ? t('settings.security.replacePlaceholder')
                  : t('settings.security.createPlaceholder')
              }
            />
            <button
              type="button"
              className="setup-eye-btn"
              onClick={() => setShowAuthToken(!showAuthToken)}
              aria-label={showAuthToken ? t('settings.security.hide') : t('settings.security.show')}
              tabIndex={-1}
            >
              {showAuthToken ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Confirm Token */}
        {authToken.trim().length > 0 && (
          <div className="setup-form-group">
            <label htmlFor="settings-confirm-token">{t('settings.security.confirm')}</label>
            <input
              id="settings-confirm-token"
              type={showAuthToken ? 'text' : 'password'}
              value={confirmAuthToken}
              onChange={(e) => {
                setConfirmAuthToken(e.target.value);
                onDirtyChange?.();
              }}
              className="setup-input"
              placeholder={t('settings.security.confirmPlaceholder')}
            />
          </div>
        )}

        <div className="setup-info-box">
          <AlertCircle size={16} />
          <span>
            {t('settings.security.warning')}
          </span>
        </div>
      </div>
    </div>
  );
};
