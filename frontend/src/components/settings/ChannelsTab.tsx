import React, { useState } from 'react';
import {
  MessageSquare,
  MessageCircle,
  Send,
  CheckCircle2,
  Copy,
  Check,
  Radio,
  Eye,
  EyeOff,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Terminal,
  Smartphone,
  Zap,
  Bell,
  Code2,
  Globe,
  Clock,
  Share2,
} from 'lucide-react';
import * as api from '../../api';

export type ChannelId = 'telegram' | 'discord' | 'slack' | 'webhook';

export interface ChannelsTabProps {
  tgToken: string;
  setTgToken: (val: string) => void;
  hasTgToken: boolean;
  tgChatId: string;
  discordToken: string;
  setDiscordToken: (val: string) => void;
  hasDiscordToken: boolean;
  discordChannelId: string;
  setDiscordChannelId: (val: string) => void;
  slackWebhookUrl: string;
  setSlackWebhookUrl: (val: string) => void;
  hasSlackWebhook: boolean;
  showToast: (msg: string) => void;
  onDirtyChange?: () => void;
  // Optional backwards-compatibility props
  openclawUrl?: string;
  setOpenclawUrl?: (val: string) => void;
  openclawToken?: string;
  setOpenclawToken?: (val: string) => void;
  hasOpenclawToken?: boolean;
  openclawChannel?: string;
  setOpenclawChannel?: (val: string) => void;
  openclawTarget?: string;
  setOpenclawTarget?: (val: string) => void;
  openclawEnabled?: boolean;
  setOpenclawEnabled?: (val: boolean) => void;
}

export const ChannelsTab: React.FC<ChannelsTabProps> = ({
  tgToken,
  setTgToken,
  hasTgToken,
  tgChatId,
  discordToken,
  setDiscordToken,
  hasDiscordToken,
  discordChannelId,
  setDiscordChannelId,
  slackWebhookUrl,
  setSlackWebhookUrl,
  hasSlackWebhook,
  showToast,
  onDirtyChange,
}) => {
  const [selectedChannel, setSelectedChannel] = useState<ChannelId>('telegram');
  const [channelTesting, setChannelTesting] = useState<string | null>(null);
  const [digestPushing, setDigestPushing] = useState(false);
  const [selectedDigestChannel, setSelectedDigestChannel] = useState('all');
  const [selectedDigestDays, setSelectedDigestDays] = useState(7);
  const [copiedPassphrase, setCopiedPassphrase] = useState(false);
  const [showTgToken, setShowTgToken] = useState(false);
  const [showDiscordToken, setShowDiscordToken] = useState(false);
  const [showSlackWebhook, setShowSlackWebhook] = useState(false);

  // Generic Inbound Webhook State
  const [testingInbound, setTestingInbound] = useState(false);
  const [testInboundText, setTestInboundText] = useState('Sparkkeep Inbound Webhook Test Spark #capture');
  const [inboundTestResult, setInboundTestResult] = useState<string | null>(null);
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false);
  const [activeSnippetTab, setActiveSnippetTab] = useState<'curl' | 'js' | 'python' | 'schema'>('curl');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080';
  const inboundWebhookUrl = `${currentOrigin}/api/v1/capture`;

  const handleTestInboundCapture = async () => {
    setTestingInbound(true);
    setInboundTestResult(null);
    try {
      const payloadText = testInboundText.trim() || 'Sparkkeep Inbound Webhook Test Spark #capture';
      const res = await api.captureSpark({
        url: currentOrigin,
        text: payloadText,
      });
      const cardId = res.card_ids?.[0] || res.cards?.[0] || 'created';
      setInboundTestResult(`HTTP 200 OK — Ingested spark (Card ID: ${cardId})`);
      showToast('Test spark captured successfully! Check your inbox.');
    } catch (err: unknown) {
      const errMsg = api.getErrorMessage(err);
      setInboundTestResult(`Error: ${errMsg}`);
      showToast(errMsg);
    } finally {
      setTestingInbound(false);
    }
  };

  const handleCopyWebhookUrl = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(inboundWebhookUrl);
      setCopiedWebhookUrl(true);
      showToast('Inbound Webhook URL copied to clipboard.');
      setTimeout(() => setCopiedWebhookUrl(false), 2000);
    }
  };

  const handleTestChannel = async (channelId: string) => {
    setChannelTesting(channelId);
    try {
      const res = await api.testChannel(channelId);
      showToast(res.message || `Test notification sent to ${channelId}!`);
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    } finally {
      setChannelTesting(null);
    }
  };

  const handlePushDigest = async () => {
    setDigestPushing(true);
    try {
      const res = await api.pushDigestToChannel(selectedDigestChannel);
      showToast(res.message || 'Digest pushed successfully!');
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    } finally {
      setDigestPushing(false);
    }
  };

  const handleCopyCommand = (command: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(command);
      setCopiedPassphrase(true);
      showToast('Pairing command copied to clipboard.');
      setTimeout(() => setCopiedPassphrase(false), 2000);
    }
  };

  const snippetCurl = `curl -s -X POST "${inboundWebhookUrl}" \\
  -H "Authorization: Bearer YOUR_MASTER_PASSPHRASE" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com/article", "text": "Quick note or thought to capture"}'`;

  const snippetFetch = `// Generic capture from any web app, Node.js script, or browser automation
await fetch("${inboundWebhookUrl}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_MASTER_PASSPHRASE",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    url: "https://example.com/article",
    text: "Quick note or thought to capture",
    caption: "Optional context note"
  })
});`;

  const snippetPython = `# Generic capture using Python requests
import requests

response = requests.post(
    "${inboundWebhookUrl}",
    headers={
        "Authorization": "Bearer YOUR_MASTER_PASSPHRASE",
        "Content-Type": "application/json"
    },
    json={
        "url": "https://example.com/article",
        "text": "Quick note or thought to capture"
    }
)
print(response.json())`;

  const snippetSchema = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "SparkkeepInboundCapturePayload",
  "type": "object",
  "properties": {
    "url": {
      "type": "string",
      "description": "Web URL to scrape, ingest, and synthesize"
    },
    "text": {
      "type": "string",
      "description": "Raw markdown notes, quotes, or fleeting thoughts"
    },
    "caption": {
      "type": "string",
      "description": "Personal context note or triage instruction"
    }
  },
  "oneOf": [
    { "required": ["url"] },
    { "required": ["text"] }
  ]
}`;

  const currentSnippetCode =
    activeSnippetTab === 'curl'
      ? snippetCurl
      : activeSnippetTab === 'js'
      ? snippetFetch
      : activeSnippetTab === 'python'
      ? snippetPython
      : snippetSchema;

  const handleCopySnippet = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentSnippetCode);
      setCopiedSnippet(true);
      showToast('Code snippet copied to clipboard.');
      setTimeout(() => setCopiedSnippet(false), 2000);
    }
  };

  const channelCards = [
    {
      id: 'telegram' as ChannelId,
      title: 'Telegram Bot',
      subtitle: 'Two-way capture, inline triage buttons & bot alerts',
      typeTag: 'Two-Way Bot',
      icon: Send,
      color: '#38bdf8',
      bgTint: 'rgba(56, 189, 248, 0.08)',
      iconBg: 'rgba(56, 189, 248, 0.15)',
      isConfigured: hasTgToken,
      statusLabel: hasTgToken ? 'Connected' : 'Not Configured',
    },
    {
      id: 'discord' as ChannelId,
      title: 'Discord Bot',
      subtitle: 'Rich embeds, server text channels & triage links',
      typeTag: 'Server Embeds',
      icon: MessageCircle,
      color: '#818cf8',
      bgTint: 'rgba(129, 140, 248, 0.08)',
      iconBg: 'rgba(129, 140, 248, 0.15)',
      isConfigured: hasDiscordToken,
      statusLabel: hasDiscordToken ? 'Connected' : 'Not Configured',
    },
    {
      id: 'slack' as ChannelId,
      title: 'Slack Webhook',
      subtitle: 'Block Kit team notifications & weekly digest summaries',
      typeTag: 'Team Webhook',
      icon: MessageSquare,
      color: '#fbbf24',
      bgTint: 'rgba(251, 191, 36, 0.08)',
      iconBg: 'rgba(251, 191, 36, 0.15)',
      isConfigured: hasSlackWebhook,
      statusLabel: hasSlackWebhook ? 'Connected' : 'Not Configured',
    },
    {
      id: 'webhook' as ChannelId,
      title: 'Inbound Webhook',
      subtitle: 'Universal HTTP POST API, cURL, Mobile & Custom Tools',
      typeTag: 'Generic Endpoint',
      icon: Terminal,
      color: '#a855f7',
      bgTint: 'rgba(168, 85, 247, 0.08)',
      iconBg: 'rgba(168, 85, 247, 0.15)',
      isConfigured: true,
      statusLabel: 'Active & Ready',
    },
  ];

  return (
    <div className="settings-panel" role="tabpanel">
      {/* 1. Omnichannel Selector Hub */}
      <div className="settings-section">
        <div className="settings-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Radio size={18} style={{ color: 'var(--accent)' }} />
            <span className="settings-section-title">Omnichannel Messenger Hub</span>
          </div>
          <span className="settings-section-desc">
            Select a channel below to configure credentials, test live connectivity, and access integration guides.
          </span>
        </div>

        {/* Balanced 2x2 Channel Cards Deck */}
        <div className="channels-deck" role="tablist" aria-label="Messenger channels">
          {channelCards.map((card) => {
            const Icon = card.icon;
            const isSelected = selectedChannel === card.id;

            return (
              <button
                key={card.id}
                id={`channel-tab-${card.id}`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={`channel-panel-${card.id}`}
                className={`channel-card-btn ${isSelected ? 'active' : ''}`}
                style={
                  {
                    '--channel-brand': card.color,
                    '--channel-bg': card.bgTint,
                    '--channel-icon-bg': card.iconBg,
                  } as React.CSSProperties
                }
                onClick={() => setSelectedChannel(card.id)}
              >
                <div className="channel-card-top">
                  <div className="channel-card-brand">
                    <div className="channel-card-icon">
                      <Icon size={18} style={{ color: card.color }} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="channel-card-title">{card.title}</div>
                      <div className="channel-card-desc">{card.subtitle}</div>
                    </div>
                  </div>
                  <span
                    className={`channel-status-pill ${card.isConfigured ? 'connected' : 'unconfigured'}`}
                  >
                    <span className="channel-status-dot" />
                    <span>{card.statusLabel}</span>
                  </span>
                </div>

                <div className="channel-card-footer">
                  {isSelected ? (
                    <span className="channel-card-active-label">
                      <span>Configuring</span>
                      <ChevronRight size={13} />
                    </span>
                  ) : (
                    <span className="channel-card-inactive-label">Click to configure</span>
                  )}
                  <span className="channel-card-tag">{card.typeTag}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Active Channel Configuration Workspace */}
      <div
        id={`channel-panel-${selectedChannel}`}
        role="tabpanel"
        aria-labelledby={`channel-tab-${selectedChannel}`}
        className="channel-workspace"
      >
        {/* TELEGRAM BOT WORKSPACE */}
        {selectedChannel === 'telegram' && (
          <>
            <div className="channel-workspace-header">
              <div className="channel-workspace-brand">
                <div
                  className="channel-workspace-icon"
                  style={{ background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8' }}
                >
                  <Send size={22} />
                </div>
                <div className="channel-workspace-meta">
                  <div className="channel-workspace-title-row">
                    <span className="channel-workspace-title">Telegram Bot</span>
                    <span className={`settings-badge ${hasTgToken ? 'success' : 'neutral'}`}>
                      {hasTgToken ? 'Active' : 'Optional'}
                    </span>
                  </div>
                  <span className="channel-workspace-desc">
                    Forward messages, links, and audio notes directly into Sparkkeep with interactive inline triage buttons.
                  </span>
                </div>
              </div>

              {hasTgToken && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                  disabled={channelTesting === 'telegram'}
                  onClick={() => handleTestChannel('telegram')}
                >
                  {channelTesting === 'telegram' ? 'Testing...' : 'Send Test Notification'}
                </button>
              )}
            </div>

            {/* Telegram Form Credentials */}
            <div className="setup-form-group">
              <label htmlFor="settings-tg-token">
                Telegram Bot Token {hasTgToken ? '(Configured)' : ''}
              </label>
              <div className="channel-input-wrapper">
                <input
                  id="settings-tg-token"
                  type={showTgToken ? 'text' : 'password'}
                  value={tgToken}
                  onChange={(e) => {
                    setTgToken(e.target.value);
                    onDirtyChange?.();
                  }}
                  className="setup-input"
                  placeholder={
                    hasTgToken
                      ? '••••••••••••••••'
                      : 'Enter BotFather Token (e.g. 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11)'
                  }
                />
                <button
                  type="button"
                  className="channel-eye-btn"
                  onClick={() => setShowTgToken(!showTgToken)}
                  title={showTgToken ? 'Hide token' : 'Show token'}
                  aria-label={showTgToken ? 'Hide token' : 'Show token'}
                >
                  {showTgToken ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <span className="setup-hint">
                Created via @BotFather on Telegram. Controls message delivery and two-way inline triage buttons.
              </span>
            </div>

            {/* Telegram Pairing Status Box */}
            {hasTgToken && (
              <div
                className="setup-info-box"
                style={{
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                }}
              >
                <CheckCircle2 size={18} style={{ color: 'var(--accent-emerald)', marginTop: '2px', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <strong style={{ color: 'var(--accent-emerald)', fontSize: '13px' }}>
                    Bot is Active! Link your private chat:
                  </strong>
                  <div style={{ marginTop: '4px', fontSize: '12.5px', color: 'var(--text-dim)' }}>
                    Send this command to your Telegram bot to pair your personal account:
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <code
                      style={{
                        padding: '6px 12px',
                        background: 'var(--surface-sunken, #090a0f)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        color: 'var(--accent)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                        userSelect: 'all',
                      }}
                    >
                      /start YOUR_MASTER_PASSPHRASE
                    </code>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleCopyCommand('/start YOUR_MASTER_PASSPHRASE')}
                      style={{ fontSize: '11px', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      {copiedPassphrase ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedPassphrase ? 'Copied' : 'Copy Command'}</span>
                    </button>
                  </div>
                  {tgChatId && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      ✓ Currently paired to chat ID: <strong>{tgChatId}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step-by-Step Onboarding Guide */}
            <div className="channel-guide-box">
              <span className="channel-guide-title">
                <Sparkles size={15} style={{ color: '#38bdf8' }} />
                <span>How to set up Telegram Bot in 4 easy steps</span>
              </span>
              <div className="channel-step-list">
                <div className="channel-step-item">
                  <span className="channel-step-num">1</span>
                  <span>
                    Open{' '}
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#38bdf8', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                    >
                      @BotFather <ExternalLink size={11} />
                    </a>{' '}
                    in your Telegram application.
                  </span>
                </div>
                <div className="channel-step-item">
                  <span className="channel-step-num">2</span>
                  <span>Send <code>/newbot</code> and follow the prompts to choose a friendly name and username.</span>
                </div>
                <div className="channel-step-item">
                  <span className="channel-step-num">3</span>
                  <span>Copy the <strong>HTTP API Token</strong> provided by BotFather and paste it into the field above.</span>
                </div>
                <div className="channel-step-item">
                  <span className="channel-step-num">4</span>
                  <span>Save platform preferences, open your new bot on Telegram, and send <code>/start YOUR_MASTER_PASSPHRASE</code>.</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* DISCORD BOT WORKSPACE */}
        {selectedChannel === 'discord' && (
          <>
            <div className="channel-workspace-header">
              <div className="channel-workspace-brand">
                <div
                  className="channel-workspace-icon"
                  style={{ background: 'rgba(129, 140, 248, 0.12)', color: '#818cf8' }}
                >
                  <MessageCircle size={22} />
                </div>
                <div className="channel-workspace-meta">
                  <div className="channel-workspace-title-row">
                    <span className="channel-workspace-title">Discord Bot</span>
                    <span className={`settings-badge ${hasDiscordToken ? 'success' : 'neutral'}`}>
                      {hasDiscordToken ? 'Active' : 'Optional'}
                    </span>
                  </div>
                  <span className="channel-workspace-desc">
                    Deliver Rich Embeds with action buttons into your private Discord server and triage incoming links.
                  </span>
                </div>
              </div>

              {hasDiscordToken && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                  disabled={channelTesting === 'discord'}
                  onClick={() => handleTestChannel('discord')}
                >
                  {channelTesting === 'discord' ? 'Testing...' : 'Send Test Embed'}
                </button>
              )}
            </div>

            {/* Discord Form Credentials */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              <div className="setup-form-group">
                <label htmlFor="settings-discord-token">
                  Discord Bot Token {hasDiscordToken ? '(Configured)' : ''}
                </label>
                <div className="channel-input-wrapper">
                  <input
                    id="settings-discord-token"
                    type={showDiscordToken ? 'text' : 'password'}
                    value={discordToken}
                    onChange={(e) => {
                      setDiscordToken(e.target.value);
                      onDirtyChange?.();
                    }}
                    className="setup-input"
                    placeholder={hasDiscordToken ? '••••••••••••••••' : 'Discord Bot Token'}
                  />
                  <button
                    type="button"
                    className="channel-eye-btn"
                    onClick={() => setShowDiscordToken(!showDiscordToken)}
                    title={showDiscordToken ? 'Hide token' : 'Show token'}
                    aria-label={showDiscordToken ? 'Hide token' : 'Show token'}
                  >
                    {showDiscordToken ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <span className="setup-hint">Found under Bot &rarr; Token in the Discord Developer Portal.</span>
              </div>

              <div className="setup-form-group">
                <label htmlFor="settings-discord-channel">Discord Target Channel ID</label>
                <input
                  id="settings-discord-channel"
                  type="text"
                  value={discordChannelId}
                  onChange={(e) => {
                    setDiscordChannelId(e.target.value);
                    onDirtyChange?.();
                  }}
                  className="setup-input"
                  placeholder="e.g. 112233445566778899"
                />
                <span className="setup-hint">Right-click the channel in Discord with Developer Mode on &rarr; Copy Channel ID.</span>
              </div>
            </div>

            {/* Step-by-Step Discord Onboarding Guide */}
            <div className="channel-guide-box">
              <span className="channel-guide-title">
                <Sparkles size={15} style={{ color: '#818cf8' }} />
                <span>How to set up Discord Bot in 4 easy steps</span>
              </span>
              <div className="channel-step-list">
                <div className="channel-step-item">
                  <span className="channel-step-num">1</span>
                  <span>
                    Visit the{' '}
                    <a
                      href="https://discord.com/developers/applications"
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#818cf8', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                    >
                      Discord Developer Portal <ExternalLink size={11} />
                    </a>{' '}
                    and click <strong>New Application</strong>.
                  </span>
                </div>
                <div className="channel-step-item">
                  <span className="channel-step-num">2</span>
                  <span>
                    Navigate to <strong>Bot</strong>, click <strong>Reset Token</strong>, copy it, and paste it above. Under <em>Privileged Gateway Intents</em>, enable <strong>Message Content Intent</strong>.
                  </span>
                </div>
                <div className="channel-step-item">
                  <span className="channel-step-num">3</span>
                  <span>
                    Under <strong>OAuth2 &rarr; URL Generator</strong>, select the <code>bot</code> scope and check permissions <code>Send Messages</code> and <code>Embed Links</code>. Invite the bot to your server.
                  </span>
                </div>
                <div className="channel-step-item">
                  <span className="channel-step-num">4</span>
                  <span>
                    In Discord settings &rarr; Advanced, enable <strong>Developer Mode</strong>. Right-click your desired text channel, select <strong>Copy Channel ID</strong>, and paste it above.
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* SLACK WEBHOOK WORKSPACE */}
        {selectedChannel === 'slack' && (
          <>
            <div className="channel-workspace-header">
              <div className="channel-workspace-brand">
                <div
                  className="channel-workspace-icon"
                  style={{ background: 'rgba(251, 191, 36, 0.12)', color: '#fbbf24' }}
                >
                  <MessageSquare size={22} />
                </div>
                <div className="channel-workspace-meta">
                  <div className="channel-workspace-title-row">
                    <span className="channel-workspace-title">Slack Webhook</span>
                    <span className={`settings-badge ${hasSlackWebhook ? 'success' : 'neutral'}`}>
                      {hasSlackWebhook ? 'Active' : 'Optional'}
                    </span>
                  </div>
                  <span className="channel-workspace-desc">
                    Post Block Kit interactive cards and daily triage digests into your Slack workspace.
                  </span>
                </div>
              </div>

              {hasSlackWebhook && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                  disabled={channelTesting === 'slack'}
                  onClick={() => handleTestChannel('slack')}
                >
                  {channelTesting === 'slack' ? 'Testing...' : 'Send Test Message'}
                </button>
              )}
            </div>

            {/* Slack Form Credentials */}
            <div className="setup-form-group">
              <label htmlFor="settings-slack-webhook">
                Slack Incoming Webhook URL {hasSlackWebhook ? '(Configured)' : ''}
              </label>
              <div className="channel-input-wrapper">
                <input
                  id="settings-slack-webhook"
                  type={showSlackWebhook ? 'text' : 'password'}
                  value={slackWebhookUrl}
                  onChange={(e) => {
                    setSlackWebhookUrl(e.target.value);
                    onDirtyChange?.();
                  }}
                  className="setup-input"
                  placeholder={hasSlackWebhook ? '••••••••••••••••' : 'https://hooks.slack.com/services/T00/B00/XXXX'}
                />
                <button
                  type="button"
                  className="channel-eye-btn"
                  onClick={() => setShowSlackWebhook(!showSlackWebhook)}
                  title={showSlackWebhook ? 'Hide webhook' : 'Show webhook'}
                  aria-label={showSlackWebhook ? 'Hide webhook' : 'Show webhook'}
                >
                  {showSlackWebhook ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <span className="setup-hint">
                Incoming webhook generated by your custom Slack App or workflow integration.
              </span>
            </div>

            {/* Step-by-Step Slack Onboarding Guide */}
            <div className="channel-guide-box">
              <span className="channel-guide-title">
                <Sparkles size={15} style={{ color: '#fbbf24' }} />
                <span>How to set up Slack Webhook in 3 easy steps</span>
              </span>
              <div className="channel-step-list">
                <div className="channel-step-item">
                  <span className="channel-step-num">1</span>
                  <span>
                    Visit{' '}
                    <a
                      href="https://api.slack.com/apps"
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#fbbf24', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                    >
                      Slack API Apps <ExternalLink size={11} />
                    </a>{' '}
                    and click <strong>Create New App</strong> &rarr; <em>From scratch</em>.
                  </span>
                </div>
                <div className="channel-step-item">
                  <span className="channel-step-num">2</span>
                  <span>
                    Under Features, click <strong>Incoming Webhooks</strong> and toggle <em>Activate Incoming Webhooks</em> to <strong>On</strong>.
                  </span>
                </div>
                <div className="channel-step-item">
                  <span className="channel-step-num">3</span>
                  <span>
                    Click <strong>Add New Webhook to Workspace</strong>, choose the channel you want alerts delivered to, and copy the Webhook URL above.
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* UNIVERSAL INBOUND WEBHOOK & MOBILE CAPTURE WORKSPACE */}
        {selectedChannel === 'webhook' && (
          <>
            <div className="channel-workspace-header">
              <div className="channel-workspace-brand">
                <div
                  className="channel-workspace-icon"
                  style={{ background: 'rgba(168, 85, 247, 0.12)', color: '#a855f7' }}
                >
                  <Terminal size={22} />
                </div>
                <div className="channel-workspace-meta">
                  <div className="channel-workspace-title-row">
                    <span className="channel-workspace-title">Inbound Webhook &amp; Mobile Capture</span>
                    <span className="settings-badge success">Active</span>
                  </div>
                  <span className="channel-workspace-desc">
                    Universal HTTP REST endpoint. Ingest links, markdown notes, quotes, or media from generic webhooks, cURL, automation platforms (n8n, Make, Zapier), iOS Shortcuts, or WhatsApp share sheets.
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '12px', padding: '6px 12px' }}
                disabled={testingInbound}
                onClick={handleTestInboundCapture}
              >
                {testingInbound ? 'Capturing...' : 'Send Test Inbound Spark'}
              </button>
            </div>

            {/* Inbound Endpoint URL Box */}
            <div className="setup-form-group">
              <label htmlFor="settings-inbound-webhook-url">Inbound Capture Webhook Endpoint (Universal)</label>
              <div className="channel-input-wrapper">
                <input
                  id="settings-inbound-webhook-url"
                  type="text"
                  readOnly
                  value={inboundWebhookUrl}
                  className="setup-input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}
                />
                <button
                  type="button"
                  className="channel-eye-btn"
                  onClick={handleCopyWebhookUrl}
                  title="Copy Inbound URL"
                  aria-label="Copy Inbound URL"
                >
                  {copiedWebhookUrl ? <Check size={15} style={{ color: 'var(--accent-emerald)' }} /> : <Copy size={15} />}
                </button>
              </div>
              <span className="setup-hint">
                Accepts HTTP <code>POST</code> with <code>Content-Type: application/json</code> and optional <code>Authorization: Bearer YOUR_MASTER_PASSPHRASE</code>.
              </span>
            </div>

            {/* Live Webhook Test Simulator */}
            <div className="channel-tester-box">
              <div className="channel-tester-header">
                <div className="channel-tester-title">
                  <Zap size={14} style={{ color: 'var(--accent)' }} />
                  <span>Interactive Inbound Webhook Simulator</span>
                </div>
                {inboundTestResult && (
                  <span className={`channel-tester-result ${inboundTestResult.startsWith('Error') ? 'error' : ''}`}>
                    {inboundTestResult}
                  </span>
                )}
              </div>
              <div className="channel-tester-row">
                <input
                  type="text"
                  value={testInboundText}
                  onChange={(e) => setTestInboundText(e.target.value)}
                  placeholder="Enter a test URL (https://...) or personal note..."
                  className="setup-input channel-tester-input"
                  style={{ fontSize: '12px' }}
                  aria-label="Test inbound spark text"
                />
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={testingInbound}
                  onClick={handleTestInboundCapture}
                  style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}
                >
                  {testingInbound ? 'Ingesting...' : 'Simulate Inbound Capture'}
                </button>
              </div>
            </div>

            {/* Code Snippets & Payload Specification */}
            <div className="channel-guide-box">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <span className="channel-guide-title">
                  <Code2 size={15} style={{ color: '#a855f7' }} />
                  <span>Payload Specification &amp; Custom Automation</span>
                </span>
                <div className="channel-code-tabs">
                  <button
                    type="button"
                    className={`channel-code-tab-btn ${activeSnippetTab === 'curl' ? 'active' : ''}`}
                    onClick={() => setActiveSnippetTab('curl')}
                  >
                    cURL
                  </button>
                  <button
                    type="button"
                    className={`channel-code-tab-btn ${activeSnippetTab === 'js' ? 'active' : ''}`}
                    onClick={() => setActiveSnippetTab('js')}
                  >
                    Fetch / JS
                  </button>
                  <button
                    type="button"
                    className={`channel-code-tab-btn ${activeSnippetTab === 'python' ? 'active' : ''}`}
                    onClick={() => setActiveSnippetTab('python')}
                  >
                    Python
                  </button>
                  <button
                    type="button"
                    className={`channel-code-tab-btn ${activeSnippetTab === 'schema' ? 'active' : ''}`}
                    onClick={() => setActiveSnippetTab('schema')}
                  >
                    JSON Schema
                  </button>
                </div>
              </div>

              <div className="channel-code-box">
                <pre className="channel-code-pre">
                  <code>{currentSnippetCode}</code>
                </pre>
                <button
                  type="button"
                  className="channel-code-copy-btn"
                  onClick={handleCopySnippet}
                  title="Copy snippet"
                >
                  {copiedSnippet ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedSnippet ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Mobile & Automation Integration Recipes */}
            <div className="setup-info-box" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Globe size={16} style={{ color: 'var(--accent)' }} />
                <strong style={{ fontSize: '13px', color: 'var(--text-main)' }}>
                  Generic Webhook Versatility &amp; Mobile Recipes
                </strong>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.45 }}>
                Because this endpoint adheres to standard REST specifications, you can connect it to any custom tool, messaging client, or automated pipeline:
              </span>

              <div className="channel-recipes-grid">
                {/* Recipe 1: Generic Automation */}
                <div className="channel-recipe-card">
                  <div className="channel-recipe-title">
                    <Zap size={14} style={{ color: '#f59e0b' }} />
                    <span>n8n, Zapier &amp; Make</span>
                  </div>
                  <span className="channel-recipe-desc">
                    Point any generic HTTP Webhook action to this URL. Pass <code>url</code> or <code>text</code> in the JSON body to capture articles from RSS feeds or bookmarks automatically.
                  </span>
                </div>

                {/* Recipe 2: iOS Shortcuts & Android */}
                <div className="channel-recipe-card">
                  <div className="channel-recipe-title">
                    <Smartphone size={14} style={{ color: '#38bdf8' }} />
                    <span>iOS &amp; Android Share Sheet</span>
                  </div>
                  <span className="channel-recipe-desc">
                    Create a 1-action Shortcut on iPhone or Android that accepts input from the system Share Sheet and makes an HTTP POST with <code>url: ShortcutInput</code>.
                  </span>
                </div>

                {/* Recipe 3: WhatsApp Share Sheet */}
                <div className="channel-recipe-card" style={{ borderColor: 'rgba(37, 211, 102, 0.3)' }}>
                  <div className="channel-recipe-title">
                    <Share2 size={14} style={{ color: '#25d366' }} />
                    <span>WhatsApp Integration (Phase 1: Zero-Maintenance Share Sheet)</span>
                  </div>
                  <span className="channel-recipe-desc">
                    In WhatsApp (iOS/Android), tap and hold any message, voice memo, or link &rarr; tap <strong>Share</strong> &rarr; choose your Sparkkeep shortcut to ingest content without fragile browser bridges.
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 3. Alerts & Intelligence Digest Dispatch Hub */}
      <div className="alerts-hub-card">
        <div className="settings-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bell size={18} style={{ color: 'var(--accent)' }} />
            <span className="settings-section-title">Digest &amp; Alert Notifications</span>
          </div>
          <span className="settings-section-desc">
            Push intelligence summaries on-demand or configure event-driven notifications across your active channels.
          </span>
        </div>

        {/* Digest Dispatch Controls Row */}
        <div className="digest-controls-row">
          <div className="setup-form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
            <label htmlFor="settings-digest-channel" style={{ fontSize: '11.5px', marginBottom: '4px' }}>
              Target Channel
            </label>
            <select
              id="settings-digest-channel"
              value={selectedDigestChannel}
              onChange={(e) => setSelectedDigestChannel(e.target.value)}
              className="setup-input"
              style={{ background: 'var(--bg-input)', color: 'var(--text-main)', height: '36px', fontSize: '12.5px' }}
              aria-label="Select digest channel"
            >
              <option value="all">All Configured Channels</option>
              <option value="telegram">Telegram Bot</option>
              <option value="discord">Discord Bot</option>
              <option value="slack">Slack Webhook</option>
            </select>
          </div>

          <div className="setup-form-group" style={{ flex: '1 1 160px', marginBottom: 0 }}>
            <label htmlFor="settings-digest-days" style={{ fontSize: '11.5px', marginBottom: '4px' }}>
              Summary Window
            </label>
            <select
              id="settings-digest-days"
              value={selectedDigestDays}
              onChange={(e) => setSelectedDigestDays(Number(e.target.value))}
              className="setup-input"
              style={{ background: 'var(--bg-input)', color: 'var(--text-main)', height: '36px', fontSize: '12.5px' }}
              aria-label="Select digest window"
            >
              <option value={7}>Last 7 Days (Weekly)</option>
              <option value={14}>Last 14 Days (Bi-weekly)</option>
              <option value={30}>Last 30 Days (Monthly)</option>
            </select>
          </div>

          <div style={{ alignSelf: 'flex-end', paddingTop: '16px' }}>
            <button
              type="button"
              className="btn-primary"
              disabled={digestPushing}
              onClick={handlePushDigest}
              style={{ height: '36px', padding: '0 16px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px' }}
            >
              <Zap size={14} />
              <span>{digestPushing ? 'Pushing Digest...' : 'Push Digest Now'}</span>
            </button>
          </div>
        </div>

        {/* Automated Channel Triggers Overview */}
        <div className="alerts-triggers-overview">
          <div className="alerts-trigger-pill">
            <Zap size={13} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Instant Ingest Alerts</strong>
              <span>Immediate delivery confirmation with inline triage buttons sent to connected bots</span>
            </div>
          </div>
          <div className="alerts-trigger-pill">
            <Sparkles size={13} style={{ color: '#38bdf8', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>AI Synthesis Briefs</strong>
              <span>Key findings, executive summaries, and action steps dispatched upon completion</span>
            </div>
          </div>
          <div className="alerts-trigger-pill">
            <Clock size={13} style={{ color: '#a855f7', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Automated Digest Schedule</strong>
              <span>Scheduled summaries delivered according to your weekly active hours settings</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
