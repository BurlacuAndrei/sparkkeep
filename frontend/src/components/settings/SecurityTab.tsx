import React, { useState, useEffect } from 'react';
import { Shield, EyeOff, Eye, AlertCircle, Sparkles, CheckCircle2, Key, ExternalLink } from 'lucide-react';
import * as api from '../../api';
import { LicenseStatus } from '../../types';

export interface SecurityTabProps {
  authToken: string;
  setAuthToken: (val: string) => void;
  confirmAuthToken: string;
  setConfirmAuthToken: (val: string) => void;
  hasAuthToken: boolean;
  showToast: (msg: string) => void;
  onOpenLicenseModal?: () => void;
  onDirtyChange?: () => void;
}

export const SecurityTab: React.FC<SecurityTabProps> = ({
  authToken,
  setAuthToken,
  confirmAuthToken,
  setConfirmAuthToken,
  hasAuthToken,
  showToast,
  onOpenLicenseModal,
  onDirtyChange,
}) => {
  const [showAuthToken, setShowAuthToken] = useState(false);

  // Pro License activation state
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [loadingLicense, setLoadingLicense] = useState(true);
  const [keyInput, setKeyInput] = useState('');
  const [activating, setActivating] = useState(false);
  const [licenseError, setLicenseError] = useState<string | null>(null);

  useEffect(() => {
    api.fetchLicenseStatus()
      .then((res) => {
        if (res.ok) {
          setLicenseStatus(res.status);
        }
      })
      .catch(() => {
        // Fallback or ignore network issue
      })
      .finally(() => {
        setLoadingLicense(false);
      });
  }, []);

  const handleActivateLicense = async () => {
    if (!keyInput.trim()) {
      setLicenseError('Please enter a license key.');
      return;
    }
    setLicenseError(null);
    setActivating(true);
    try {
      const res = await api.activateLicense(keyInput.trim());
      setLicenseStatus(res.status);
      showToast('🎉 Sparkkeep Pro successfully activated!');
      setKeyInput('');
    } catch (err: unknown) {
      setLicenseError(api.getErrorMessage(err));
    } finally {
      setActivating(false);
    }
  };

  const isPro = licenseStatus?.tier === 'pro';

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

      {/* 2. Sparkkeep Pro License Activation */}
      <div className="settings-section" style={{ marginTop: '28px' }}>
        <div className="settings-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} style={{ color: 'var(--accent)' }} />
            <span className="settings-section-title">Sparkkeep Pro License</span>
          </div>
          <span className="settings-section-desc">
            Activate your license key to unlock unlimited AI profiles, scheduled deep-dives, and native Obsidian vault synchronization.
          </span>
        </div>

        {/* Pro Status Card */}
        <div className="settings-status-card" style={{ marginBottom: '16px' }}>
          <div className="settings-status-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="settings-status-title">License Tier</span>
              {isPro && (
                <span className="llm-badge-default">
                  <CheckCircle2 size={11} /> PRO ACTIVE
                </span>
              )}
            </div>
            <span className="settings-status-sub">
              {loadingLicense
                ? 'Checking license status...'
                : isPro
                ? `License activated${licenseStatus?.email ? ` for ${licenseStatus.email}` : ''}${
                    licenseStatus?.is_lifetime ? ' • Lifetime Access' : ''
                  }`
                : 'Community Edition • Basic Features Active'}
            </span>
          </div>
          <span className={`settings-badge ${isPro ? 'success' : 'neutral'}`}>
            <Key size={12} />
            {isPro ? 'Pro Unlocked' : 'Community'}
          </span>
        </div>

        {licenseError && (
          <div className="setup-error-box" style={{ marginBottom: '16px' }}>
            <AlertCircle size={16} />
            <span>{licenseError}</span>
          </div>
        )}

        {!isPro ? (
          <div className="setup-form-group">
            <label htmlFor="settings-license-key">Enter Pro License Key</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                id="settings-license-key"
                type="text"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="setup-input"
                placeholder="SK-PRO-XXXX-XXXX-XXXX"
                style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
              />
              <button
                type="button"
                className="setup-btn-primary"
                onClick={handleActivateLicense}
                disabled={activating || !keyInput.trim()}
                style={{ whiteSpace: 'nowrap' }}
              >
                <Sparkles size={14} />
                <span>{activating ? 'Activating...' : 'Activate License'}</span>
              </button>
            </div>
            <span className="setup-hint">
              Purchased a license on Gumroad or Polar? Paste your key here or manage full license details below.
            </span>
          </div>
        ) : (
          <div
            className="setup-info-box"
            style={{
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              marginBottom: '16px',
            }}
          >
            <CheckCircle2 size={16} style={{ color: 'var(--accent)' }} />
            <div>
              <strong style={{ color: 'var(--accent)' }}>Pro Features Unlocked:</strong>
              <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-dim)' }}>
                Unlimited LLM Profiles • Scheduled Overnight Queue • Playbooks Library • Obsidian 2-Way Vault Sync • Priority Webhook Dispatch
              </div>
            </div>
          </div>
        )}

        {onOpenLicenseModal && (
          <div style={{ marginTop: '12px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onOpenLicenseModal}
              style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <ExternalLink size={13} />
              <span>Open Detailed License Portal</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
