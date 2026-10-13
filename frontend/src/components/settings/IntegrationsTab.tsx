import React, { useState } from 'react';
import { FolderSync, Send, Terminal, AlertCircle, CheckCircle2 } from 'lucide-react';
import * as api from '../../api';

export interface IntegrationsTabProps {
  showToast: (msg: string) => void;
}

export const IntegrationsTab: React.FC<IntegrationsTabProps> = ({ showToast }) => {
  // Obsidian Vault state
  const [vaultPath, setVaultPath] = useState('');
  const [syncingObsidian, setSyncingObsidian] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);

  // Webhook Test Trigger state
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState<string | null>(null);

  const handleSyncObsidian = async () => {
    setSyncingObsidian(true);
    setLastSyncResult(null);
    try {
      const res = await api.syncObsidian(vaultPath.trim() || undefined);
      const msg = `Synced ${res.written} notes to ${res.vault_path}`;
      setLastSyncResult(`✅ ${msg}`);
      showToast(`📁 ${msg}`);
    } catch (err: unknown) {
      const errMsg = api.getErrorMessage(err);
      setLastSyncResult(`❌ Error syncing to vault: ${errMsg}`);
      showToast(`Error syncing to vault: ${errMsg}`);
    } finally {
      setSyncingObsidian(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl.trim()) {
      setWebhookResult('❌ Please enter a webhook target URL.');
      return;
    }
    setTestingWebhook(true);
    setWebhookResult(null);
    try {
      const res = await api.testWebhook(
        webhookUrl.trim(),
        webhookSecret.trim() ? webhookSecret.trim() : undefined
      );
      if (res.ok) {
        setWebhookResult(`✅ Success (HTTP ${res.status_code}) - Endpoint responded cleanly!`);
        showToast(`Webhook test succeeded with HTTP ${res.status_code}!`);
      } else {
        const errDetail = res.error ? `: ${res.error}` : '';
        setWebhookResult(`❌ Error (HTTP ${res.status_code})${errDetail}`);
        showToast(`Webhook test failed: HTTP ${res.status_code}`);
      }
    } catch (err: unknown) {
      const errMsg = api.getErrorMessage(err);
      setWebhookResult(`❌ Request failed: ${errMsg}`);
      showToast(`Webhook request failed: ${errMsg}`);
    } finally {
      setTestingWebhook(false);
    }
  };

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="settings-panel" role="tabpanel">
      {/* 1. Obsidian Vault Synchronization */}
      <div className="settings-section">
        <div className="settings-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderSync size={18} style={{ color: 'var(--accent)' }} />
            <span className="settings-section-title">Obsidian Vault 2-Way Sync</span>
          </div>
          <span className="settings-section-desc">
            Mirror and synchronize your Sparkkeep library into your local or networked Obsidian knowledge base with full Markdown and YAML frontmatter.
          </span>
        </div>

        <div className="setup-form-group">
          <label htmlFor="obsidian-vault-path">Obsidian Vault Directory Path</label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              id="obsidian-vault-path"
              type="text"
              value={vaultPath}
              onChange={(e) => setVaultPath(e.target.value)}
              className="setup-input"
              placeholder="/home/user/Documents/ObsidianVault or C:\Users\User\Documents\Vault"
              style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
            />
            <button
              type="button"
              className="setup-btn-primary"
              disabled={syncingObsidian}
              onClick={handleSyncObsidian}
              style={{ whiteSpace: 'nowrap' }}
            >
              <FolderSync size={14} />
              <span>{syncingObsidian ? 'Syncing...' : 'Sync Vault Now'}</span>
            </button>
          </div>
          <span className="setup-hint">
            Leave blank to use the default configured system vault path. Creates folder structures with tags, executive summaries, and research reports.
          </span>
        </div>

        {lastSyncResult && (
          <div
            className={`setup-info-box`}
            style={{
              marginTop: '12px',
              background: lastSyncResult.startsWith('✅')
                ? 'rgba(16, 185, 129, 0.1)'
                : 'rgba(239, 68, 68, 0.1)',
              borderColor: lastSyncResult.startsWith('✅')
                ? 'rgba(16, 185, 129, 0.3)'
                : 'rgba(239, 68, 68, 0.3)',
            }}
          >
            {lastSyncResult.startsWith('✅') ? (
              <CheckCircle2 size={16} style={{ color: 'var(--accent-emerald)' }} />
            ) : (
              <AlertCircle size={16} style={{ color: 'var(--color-error)' }} />
            )}
            <span style={{ fontSize: '13px' }}>{lastSyncResult}</span>
          </div>
        )}
      </div>

      {/* 2. Webhooks & Test Triggers */}
      <div className="settings-section" style={{ marginTop: '28px' }}>
        <div className="settings-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Send size={18} style={{ color: 'var(--accent)' }} />
            <span className="settings-section-title">Webhook Test Triggers</span>
          </div>
          <span className="settings-section-desc">
            Test outbound webhook payloads and dispatch triggers to external automation platforms like Zapier, n8n, Make, or custom API endpoints.
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px' }}>
          <div className="setup-form-group">
            <label htmlFor="test-webhook-url">Destination Webhook URL</label>
            <input
              id="test-webhook-url"
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="setup-input"
              placeholder="https://hooks.zapier.com/hooks/catch/..."
            />
          </div>

          <div className="setup-form-group">
            <label htmlFor="test-webhook-secret">Webhook Secret / Bearer (Optional)</label>
            <input
              id="test-webhook-secret"
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              className="setup-input"
              placeholder="Secret token"
            />
          </div>
        </div>

        <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={testingWebhook || !webhookUrl.trim()}
            onClick={handleTestWebhook}
          >
            {testingWebhook ? 'Triggering...' : 'Dispatch Test Payload'}
          </button>

          {webhookResult && (
            <span
              style={{
                fontSize: '13px',
                color: webhookResult.startsWith('✅')
                  ? 'var(--accent-emerald, #10b981)'
                  : 'var(--color-error, #ef4444)',
                fontWeight: 500,
              }}
            >
              {webhookResult}
            </span>
          )}
        </div>
      </div>

      {/* 3. Universal Inbound Webhook API (cURL) */}
      <div className="settings-section" style={{ marginTop: '28px' }}>
        <div className="settings-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Terminal size={18} style={{ color: 'var(--accent)' }} />
            <span className="settings-section-title">Universal Inbound Capture API</span>
          </div>
          <span className="settings-section-desc">
            Send raw URLs and ideas into Sparkkeep from Apple Shortcuts, Raycast, Python scripts, or browser bookmarks.
          </span>
        </div>

        <div className="setup-info-box">
          <Terminal size={16} />
          <span>
            Use your master passphrase as the Bearer token to authorize capture requests.
          </span>
        </div>

        <div className="setup-form-group">
          <label>Example cURL Request</label>
          <pre
            style={{
              background: '#090a0f',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-dim)',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
            }}
          >
{`curl -X POST ${currentOrigin}/api/v1/capture \\
  -H "Authorization: Bearer YOUR_MASTER_PASSPHRASE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com/article",
    "text": "Some optional caption or notes"
  }'`}
          </pre>
        </div>
      </div>
    </div>
  );
};
