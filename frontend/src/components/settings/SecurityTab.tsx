import React, { useState } from 'react';
import { Shield, EyeOff, Eye, AlertCircle } from 'lucide-react';

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
  const [showAuthToken, setShowAuthToken] = useState(false);

  return (
    <div className="settings-panel" role="tabpanel">
      {/* 1. Master Passphrase & Access Security */}
      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-title">Master Access Security</span>
          <span className="settings-section-desc">
            Control dashboard authorization and master bearer token authentication
          </span>
        </div>

        {/* Security Status Card */}
        <div className="settings-status-card">
          <div className="settings-status-info">
            <span className="settings-status-title">Instance Protection</span>
            <span className="settings-status-sub">
              Master passphrase required to unlock the dashboard and query APIs
            </span>
          </div>
          <span className={`settings-badge ${hasAuthToken ? 'success' : 'neutral'}`}>
            <Shield size={12} />
            {hasAuthToken ? 'Passphrase Protected' : 'Open Access'}
          </span>
        </div>

        {/* New Master Token */}
        <div className="setup-form-group">
          <label htmlFor="settings-auth-token">
            New Master Passphrase {hasAuthToken ? '(Leave blank to retain current)' : ''}
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
                  ? 'Enter new passphrase to replace existing...'
                  : 'Create master passphrase...'
              }
            />
            <button
              type="button"
              className="setup-eye-btn"
              onClick={() => setShowAuthToken(!showAuthToken)}
              aria-label={showAuthToken ? 'Hide passphrase' : 'Show passphrase'}
              tabIndex={-1}
            >
              {showAuthToken ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Confirm Token */}
        {authToken.trim().length > 0 && (
          <div className="setup-form-group">
            <label htmlFor="settings-confirm-token">Confirm New Passphrase</label>
            <input
              id="settings-confirm-token"
              type={showAuthToken ? 'text' : 'password'}
              value={confirmAuthToken}
              onChange={(e) => {
                setConfirmAuthToken(e.target.value);
                onDirtyChange?.();
              }}
              className="setup-input"
              placeholder="Re-type new passphrase to confirm..."
            />
          </div>
        )}

        <div className="setup-info-box">
          <AlertCircle size={16} />
          <span>
            Updating your master passphrase will invalidate active tokens across other browser tabs and sessions.
          </span>
        </div>
      </div>
    </div>
  );
};
