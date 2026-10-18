import React, { useState, useEffect } from 'react';
import {
  FolderSync,
  Send,
  Terminal,
  AlertCircle,
  CheckCircle2,
  Bookmark,
  Smartphone,
  Command,
  Cpu,
  Copy,
  Check,
  Globe,
  Sparkles,
  Download,
  FileArchive,
  FileCode,
} from 'lucide-react';
import * as api from '../../api';

export interface IntegrationsTabProps {
  showToast: (msg: string) => void;
  authToken?: string;
}

export const IntegrationsTab: React.FC<IntegrationsTabProps> = ({ showToast, authToken }) => {
  // Extension State & Pairing
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [showExtensionGuide, setShowExtensionGuide] = useState(false);
  const [pairSuccess, setPairSuccess] = useState(false);

  // Obsidian Vault state
  const [vaultPath, setVaultPath] = useState('');
  const [syncingObsidian, setSyncingObsidian] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);

  // Webhook Test Trigger state
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState<string | null>(null);

  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string, label: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      showToast(`${label} copied to clipboard!`);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.source !== window || !e.data) return;
      if (e.data.type === 'SPARKKEEP_EXTENSION_PONG' || e.data.type === 'SPARKKEEP_EXTENSION_READY') {
        setExtensionInstalled(true);
      }
      if (e.data.type === 'SPARKKEEP_PAIR_ACK') {
        if (e.data.ok) {
          setPairSuccess(true);
          showToast('⚡ Extension paired to this instance successfully!');
          setTimeout(() => setPairSuccess(false), 4000);
        } else {
          showToast(`Pairing failed: ${e.data.error || 'Unknown error'}`);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    window.postMessage({ type: 'SPARKKEEP_EXTENSION_PING' }, '*');
    return () => window.removeEventListener('message', handleMessage);
  }, [showToast]);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080';

  const handlePairExtension = () => {
    window.postMessage({
      type: 'SPARKKEEP_PAIR_EXTENSION',
      serverUrl: currentOrigin,
      token: authToken || '',
    }, '*');
    setTimeout(() => {
      if (!extensionInstalled) {
        showToast('Pairing handshake sent! If extension is loaded, it is now paired.');
      }
    }, 500);
  };

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

  const bookmarkletCode = `javascript:(function(){const u=encodeURIComponent(window.location.href);const t=encodeURIComponent(document.title);fetch('${currentOrigin}/api/v1/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:window.location.href,text:document.title})}).then(r=>{if(r.ok){alert('⚡ Saved to Sparkkeep: '+document.title);}else{alert('Sparkkeep capture failed (HTTP '+r.status+')');}}).catch(e=>alert('Capture error: '+e));})();`;

  const raycastScript = `#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Capture Spark
# @raycast.mode silent
# @raycast.packageName Sparkkeep

# Optional parameters:
# @raycast.icon ⚡
# @raycast.argument1 { "type": "text", "placeholder": "URL or note" }

URL="\${1}"
curl -s -X POST "${currentOrigin}/api/v1/capture" \\
  -H "Authorization: Bearer YOUR_MASTER_PASSPHRASE" \\
  -H "Content-Type: application/json" \\
  -d "{\\"url\\": \\"$URL\\"}"

echo "Saved to Sparkkeep"`;

  const mcpConfig = `{
  "mcpServers": {
    "sparkkeep": {
      "command": "npx",
      "args": [
        "-y",
        "@sparkkeep/mcp",
        "--endpoint", "${currentOrigin}",
        "--token", "YOUR_MASTER_PASSPHRASE"
      ]
    }
  }
}`;

  return (
    <div className="settings-panel" role="tabpanel">
      {/* 0. Official Browser Extension */}
      <div className="settings-section">
        <div className="settings-section-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Globe size={18} style={{ color: 'var(--accent)' }} />
              <span className="settings-section-title">Official Browser Extension (Chrome &amp; Firefox)</span>
            </div>
            <span
              className={`settings-badge ${extensionInstalled ? 'success' : 'neutral'}`}
              style={{ fontSize: '10.5px' }}
            >
              {extensionInstalled ? 'Extension Detected (Active)' : 'Available for Chrome & Firefox'}
            </span>
          </div>
          <span className="settings-section-desc">
            1-Click web clipping, highlighted quote extraction, and automatic triage directly into your private Sparkkeep instance.
          </span>
        </div>

        <div
          className="setup-info-box"
          style={{
            background: 'var(--bg-surface-elevated, #161822)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <strong style={{ fontSize: '13px', color: 'var(--text-main)' }}>
                {pairSuccess ? '✓ Paired with Instance!' : 'Magic Instance Pairing'}
              </strong>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>
                Preconfigures the extension with this server address (<code style={{ color: 'var(--accent)' }}>{currentOrigin}</code>) and your authentication credentials.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="setup-btn-primary"
                onClick={handlePairExtension}
                style={{ fontSize: '12px', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Sparkles size={14} />
                <span>1-Click Pair Extension</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowExtensionGuide(!showExtensionGuide)}
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                {showExtensionGuide ? 'Hide Guide' : 'Setup Guide'}
              </button>
            </div>
          </div>

          {showExtensionGuide && (
            <div
              style={{
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: '10px',
                fontSize: '12px',
                color: 'var(--text-dim)',
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                How to load the extension in your browser:
              </div>
              <ol style={{ paddingLeft: '18px', margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li>
                  Open <code>chrome://extensions</code> (Chrome/Brave/Edge) or <code>about:debugging</code> (Firefox).
                </li>
                <li>
                  Enable <strong>Developer Mode</strong>, click <strong>Load unpacked</strong>, and select the <code>extension/</code> directory inside this repo.
                </li>
                <li>
                  Return to this page and click <strong>1-Click Pair Extension</strong> above to automatically connect!
                </li>
                <li>
                  Use shortcut <code>Alt+Shift+S</code> on any page or right-click any highlighted text to clip.
                </li>
              </ol>
            </div>
          )}
        </div>
      </div>

      {/* 1. Quick Ecosystem Capture Tools */}
      <div className="settings-section" style={{ marginTop: '24px' }}>
        <div className="settings-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bookmark size={18} style={{ color: 'var(--accent)' }} />
            <span className="settings-section-title">Browser Bookmarklet</span>
          </div>
          <span className="settings-section-desc">
            Instantly capture any webpage or article directly into Sparkkeep from Chrome, Safari, Firefox, or Edge.
          </span>
        </div>

        <div className="setup-info-box" style={{ marginBottom: '14px' }}>
          <span>
            Drag the button below directly to your browser's bookmarks bar, or copy the code snippet into a manual bookmark URL.
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <a
            href={bookmarkletCode}
            onClick={(e) => {
              e.preventDefault();
              showToast('Drag this button directly to your browser Bookmarks Bar!');
            }}
            className="setup-btn-primary"
            style={{
              cursor: 'grab',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
            title="Drag to your Bookmarks Toolbar"
          >
            <Bookmark size={15} />
            <span>⚡ Save to Sparkkeep</span>
          </a>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => copyToClipboard(bookmarkletCode, 'bookmarklet', 'Bookmarklet code')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            {copiedId === 'bookmarklet' ? <Check size={14} /> : <Copy size={14} />}
            <span>{copiedId === 'bookmarklet' ? 'Copied' : 'Copy Bookmarklet Code'}</span>
          </button>
        </div>
      </div>

      {/* 2. Apple iOS Shortcut */}
      <div className="settings-section" style={{ marginTop: '28px' }}>
        <div className="settings-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Smartphone size={18} style={{ color: 'var(--accent)' }} />
            <span className="settings-section-title">Apple iOS Shortcut &amp; Share Sheet</span>
          </div>
          <span className="settings-section-desc">
            Share articles, tweets, and links from Safari or any iOS app directly into Sparkkeep using Apple Shortcuts.
          </span>
        </div>

        <div
          style={{
            background: 'var(--surface-sunken, #090a0f)',
            padding: '14px',
            borderRadius: 'var(--radius-md, 8px)',
            border: '1px solid var(--border-subtle)',
            fontSize: '12.5px',
            color: 'var(--text-dim)',
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
            Shortcut Steps in Apple Shortcuts app:
          </div>
          <ol style={{ paddingLeft: '18px', margin: 0 }}>
            <li>Create a new shortcut named <strong>"Send to Sparkkeep"</strong> and enable <em>Show in Share Sheet</em>.</li>
            <li>Add action: <strong>Get Contents of URL</strong> with address: <code style={{ color: 'var(--accent)' }}>{currentOrigin}/api/v1/capture</code></li>
            <li>Set Method to <strong>POST</strong> and Headers:
              <br />
              • <code style={{ color: 'var(--accent)' }}>Authorization</code>: <code style={{ color: 'var(--accent)' }}>Bearer YOUR_MASTER_PASSPHRASE</code>
              <br />
              • <code style={{ color: 'var(--accent)' }}>Content-Type</code>: <code style={{ color: 'var(--accent)' }}>application/json</code>
            </li>
            <li>Set Request Body (JSON): <code style={{ color: 'var(--accent)' }}>{`{"url": Shortcut Input, "text": "Captured via iOS"}`}</code></li>
          </ol>
        </div>
      </div>

      {/* 3. Raycast Script Command */}
      <div className="settings-section" style={{ marginTop: '28px' }}>
        <div
          className="settings-section-header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Command size={18} style={{ color: 'var(--accent)' }} />
              <span className="settings-section-title">Raycast Extension / Script Command</span>
            </div>
            <span className="settings-section-desc">
              Trigger instant captures straight from your Mac keystrokes using a Raycast Script Command.
            </span>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => copyToClipboard(raycastScript, 'raycast', 'Raycast script')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '4px 10px' }}
          >
            {copiedId === 'raycast' ? <Check size={13} /> : <Copy size={13} />}
            <span>{copiedId === 'raycast' ? 'Copied' : 'Copy Script'}</span>
          </button>
        </div>

        <pre
          style={{
            background: 'var(--surface-sunken, #090a0f)',
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
          {raycastScript}
        </pre>
      </div>

      {/* 4. Model Context Protocol (MCP) */}
      <div className="settings-section" style={{ marginTop: '28px' }}>
        <div
          className="settings-section-header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cpu size={18} style={{ color: 'var(--accent)' }} />
              <span className="settings-section-title">Model Context Protocol (MCP)</span>
            </div>
            <span className="settings-section-desc">
              Empower Claude Desktop, Cursor, and Zed AI agents to query your Sparkkeep library as an active knowledge context.
            </span>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => copyToClipboard(mcpConfig, 'mcp', 'MCP server config')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '4px 10px' }}
          >
            {copiedId === 'mcp' ? <Check size={13} /> : <Copy size={13} />}
            <span>{copiedId === 'mcp' ? 'Copied' : 'Copy MCP Config'}</span>
          </button>
        </div>

        <pre
          style={{
            background: 'var(--surface-sunken, #090a0f)',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-dim)',
            overflowX: 'auto',
          }}
        >
          {mcpConfig}
        </pre>
        <span className="setup-hint">
          Paste into your <code>claude_desktop_config.json</code> under <code>mcpServers</code> to expose Sparkkeep search directly to your AI conversations.
        </span>
      </div>

      {/* 5. Obsidian Vault Synchronization */}
      <div className="settings-section" style={{ marginTop: '28px' }}>
        <div className="settings-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderSync size={18} style={{ color: 'var(--accent)' }} />
            <span className="settings-section-title">Obsidian Vault Export</span>
          </div>
          <span className="settings-section-desc">
            Mirror and export your Sparkkeep library into your local or networked Obsidian knowledge base with full Markdown and YAML frontmatter.
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

      {/* 6. Data Sovereignty & Browser Downloads */}
      <div className="settings-section" style={{ marginTop: '28px' }}>
        <div className="settings-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Download size={18} style={{ color: 'var(--accent)' }} />
            <span className="settings-section-title">Data Sovereignty & Full Library Export</span>
          </div>
          <span className="settings-section-desc">
            Download your entire library directly in your browser. Zero vendor lock-in guaranteed.
          </span>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '14px' }}>
          <button
            type="button"
            className="setup-btn-secondary"
            onClick={() => api.downloadLibraryExport('json')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 14px', borderRadius: '10px', cursor: 'pointer' }}
          >
            <FileCode size={15} />
            <span>Download Full Library (.JSON)</span>
          </button>
          <button
            type="button"
            className="setup-btn-secondary"
            onClick={() => api.downloadLibraryExport('zip')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 14px', borderRadius: '10px', cursor: 'pointer' }}
          >
            <FileArchive size={15} />
            <span>Download Markdown Archive (.ZIP)</span>
          </button>
        </div>
      </div>

      {/* 7. Webhooks & Test Triggers */}
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

      {/* 7. Universal Inbound Webhook API (cURL) */}
      <div className="settings-section" style={{ marginTop: '28px' }}>
        <div className="settings-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Terminal size={18} style={{ color: 'var(--accent)' }} />
            <span className="settings-section-title">Universal Inbound Capture API</span>
          </div>
          <span className="settings-section-desc">
            Send raw URLs and ideas into Sparkkeep from custom scripts, cron jobs, or command lines.
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
              background: 'var(--surface-sunken, #090a0f)',
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
