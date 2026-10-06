import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, CheckCircle2, ShieldCheck, Key, FolderSync, Send, AlertCircle, ExternalLink } from 'lucide-react';
import { LicenseStatus } from '../types';
import * as api from '../api';

interface LicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  licenseStatus: LicenseStatus | null;
  onLicenseUpdated: (newStatus: LicenseStatus) => void;
  onToast: (msg: string) => void;
}

export function LicenseModal({
  isOpen,
  onClose,
  licenseStatus,
  onLicenseUpdated,
  onToast,
}: LicenseModalProps) {
  const [keyInput, setKeyInput] = useState('');
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pro features actions state
  const [vaultPath, setVaultPath] = useState('');
  const [syncingObsidian, setSyncingObsidian] = useState(false);

  const [webhookUrl, setWebhookUrl] = useState('');
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const isPro = licenseStatus?.tier === 'pro';

  const handleActivate = async () => {
    if (!keyInput.trim()) {
      setError('Please enter a license key.');
      return;
    }
    setError(null);
    setActivating(true);
    try {
      const res = await api.activateLicense(keyInput.trim());
      onLicenseUpdated(res.status);
      onToast('🎉 Sparkkeep Pro successfully activated!');
      setKeyInput('');
    } catch (err: unknown) {
      setError(api.getErrorMessage(err));
    } finally {
      setActivating(false);
    }
  };

  const handleSyncObsidian = async () => {
    setSyncingObsidian(true);
    try {
      const res = await api.syncObsidian(vaultPath.trim() || undefined);
      onToast(`📁 Synced ${res.written} notes to ${res.vault_path}`);
    } catch (err: unknown) {
      onToast(`Error syncing to vault: ${api.getErrorMessage(err)}`);
    } finally {
      setSyncingObsidian(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl.trim()) return;
    setTestingWebhook(true);
    setWebhookResult(null);
    try {
      const res = await api.testWebhook(webhookUrl.trim());
      if (res.ok) {
        setWebhookResult(`✅ Success (HTTP ${res.status_code})`);
      } else {
        setWebhookResult(`❌ Error (HTTP ${res.status_code}): ${res.error || 'Failed'}`);
      }
    } catch (err: unknown) {
      setWebhookResult(`❌ Error: ${api.getErrorMessage(err)}`);
    } finally {
      setTestingWebhook(false);
    }
  };

  return createPortal(
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 99999,
        background: 'rgba(5, 7, 12, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        className="license-modal-card"
        style={{
          width: '100%',
          maxWidth: '540px',
          maxHeight: '90vh',
          overflowY: 'auto',
          margin: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="license-modal-header">
          <div className="license-title-group">
            <div className={`license-icon-badge ${isPro ? 'pro' : ''}`}>
              <Sparkles size={22} />
            </div>
            <div>
              <h2 className="license-title">
                {isPro ? 'Sparkkeep Pro' : 'Unlock Sparkkeep Pro'}
              </h2>
              <span className="license-subtitle">
                {isPro ? 'Lifetime License Active' : 'One-time payment • Lifetime license • Self-hosted'}
              </span>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="setup-error-box" style={{ margin: '16px 24px 0 24px' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="license-modal-body">
          {/* Active Pro View */}
          {isPro ? (
            <div className="pro-active-view">
              <div className="pro-badge-banner">
                <ShieldCheck size={28} className="pro-shield-icon" />
                <div>
                  <div className="pro-banner-title">PRO LIFETIME ACTIVE</div>
                  <div className="pro-banner-meta">
                    Registered to: <strong>{licenseStatus?.email || 'Licensed User'}</strong>
                  </div>
                </div>
              </div>

              {/* Obsidian Vault Sync Section */}
              <div className="pro-feature-card">
                <div className="pro-card-header">
                  <FolderSync size={18} className="feature-icon" />
                  <div>
                    <h4>Obsidian Vault 2-Way Sync</h4>
                    <p>Export notes directly with YAML frontmatter and markdown tags.</p>
                  </div>
                </div>
                <div className="pro-card-form">
                  <input
                    type="text"
                    className="setup-input"
                    placeholder="Vault path (default: ./data/obsidian_vault)"
                    value={vaultPath}
                    onChange={(e) => setVaultPath(e.target.value)}
                  />
                  <button
                    type="button"
                    className="setup-btn-primary"
                    disabled={syncingObsidian}
                    onClick={handleSyncObsidian}
                  >
                    {syncingObsidian ? 'Syncing...' : 'Sync Vault Now'}
                  </button>
                </div>
              </div>

              {/* Outbound Webhook Section */}
              <div className="pro-feature-card">
                <div className="pro-card-header">
                  <Send size={18} className="feature-icon" />
                  <div>
                    <h4>Outbound Webhooks</h4>
                    <p>Trigger n8n, Zapier, Home Assistant, Slack, or Discord on card capture.</p>
                  </div>
                </div>
                <div className="pro-card-form">
                  <input
                    type="text"
                    className="setup-input"
                    placeholder="https://your-automation-endpoint.com/webhook"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                  />
                  <button
                    type="button"
                    className="setup-btn-secondary"
                    disabled={testingWebhook || !webhookUrl.trim()}
                    onClick={handleTestWebhook}
                  >
                    {testingWebhook ? 'Testing...' : 'Send Test Ping'}
                  </button>
                </div>
                {webhookResult && (
                  <div className="webhook-result-text">{webhookResult}</div>
                )}
              </div>
            </div>
          ) : (
            /* Community Upgrade View */
            <div className="community-upgrade-view">
              <div className="pro-perks-list">
                <div className="perk-item">
                  <CheckCircle2 size={18} className="perk-icon" />
                  <div>
                    <strong>Native Obsidian Vault Sync:</strong> Mirror all captures with full frontmatter directly into your private Obsidian knowledge base.
                  </div>
                </div>
                <div className="perk-item">
                  <CheckCircle2 size={18} className="perk-icon" />
                  <div>
                    <strong>Automated Outbound Webhooks:</strong> Connect your personal pipeline to n8n, Make, Discord, or Home Assistant on card creation.
                  </div>
                </div>
                <div className="perk-item">
                  <CheckCircle2 size={18} className="perk-icon" />
                  <div>
                    <strong>Deep Research V2:</strong> Unlock multi-query autonomous web synthesis passes without artificial caps.
                  </div>
                </div>
              </div>

              {/* License Activation Form */}
              <div className="activation-box">
                <label htmlFor="license-key-input">Enter License Key</label>
                <div className="activation-input-row">
                  <div className="setup-input-wrapper">
                    <input
                      id="license-key-input"
                      type="text"
                      className="setup-input"
                      placeholder="eyJhbGciOiJFZDI1NTE5..."
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="setup-btn-primary"
                    disabled={activating || !keyInput.trim()}
                    onClick={handleActivate}
                  >
                    <Key size={16} />
                    <span>{activating ? 'Verifying...' : 'Activate Pro'}</span>
                  </button>
                </div>
              </div>

              <div className="get-license-footer">
                <span>Don't have a license key yet?</span>
                <a
                  href="https://sparkkeep.dev/pricing"
                  target="_blank"
                  rel="noreferrer"
                  className="buy-license-link"
                >
                  Get Sparkkeep Pro ($49 one-time) <ExternalLink size={13} />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
