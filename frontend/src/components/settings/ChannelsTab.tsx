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
import { useLocale } from '../../i18n';

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
  const { t } = useLocale();
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
  const [inboundTestFailed, setInboundTestFailed] = useState(false);
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false);
  const [activeSnippetTab, setActiveSnippetTab] = useState<'curl' | 'js' | 'python' | 'schema'>('curl');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080';
  const inboundWebhookUrl = `${currentOrigin}/api/v1/capture`;

  const handleTestInboundCapture = async () => {
    setTestingInbound(true);
    setInboundTestResult(null);
    setInboundTestFailed(false);
    try {
      const payloadText = testInboundText.trim() || 'Sparkkeep Inbound Webhook Test Spark #capture';
      const res = await api.captureSpark({
        url: currentOrigin,
        text: payloadText,
      });
      const cardId = res.card_ids?.[0] || res.cards?.[0] || 'created';
      setInboundTestResult(t('settings.channels.webhook.testResult', { id: cardId }));
      showToast(t('settings.channels.webhook.testCaptured'));
    } catch (err: unknown) {
      const errMsg = api.getErrorMessage(err);
      setInboundTestFailed(true);
      setInboundTestResult(t('settings.channels.webhook.errorResult', { message: errMsg }));
      showToast(errMsg);
    } finally {
      setTestingInbound(false);
    }
  };

  const handleCopyWebhookUrl = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(inboundWebhookUrl);
      setCopiedWebhookUrl(true);
      showToast(t('settings.channels.webhook.urlCopied'));
      setTimeout(() => setCopiedWebhookUrl(false), 2000);
    }
  };

  const handleTestChannel = async (channelId: string) => {
    setChannelTesting(channelId);
    try {
      const res = await api.testChannel(channelId);
      showToast(res.message || t('settings.channels.digest.testSent', { channel: channelId }));
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
      showToast(res.message || t('settings.channels.digest.pushed'));
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
      showToast(t('settings.channels.webhook.commandCopied'));
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
      showToast(t('settings.channels.webhook.snippetCopied'));
      setTimeout(() => setCopiedSnippet(false), 2000);
    }
  };

  const channelCards = [
    {
      id: 'telegram' as ChannelId,
      title: t('settings.channels.cards.telegram.title'),
      subtitle: t('settings.channels.cards.telegram.subtitle'),
      typeTag: t('settings.channels.cards.telegram.typeTag'),
      icon: Send,
      color: '#38bdf8',
      bgTint: 'rgba(56, 189, 248, 0.08)',
      iconBg: 'rgba(56, 189, 248, 0.15)',
      isConfigured: hasTgToken,
      statusLabel: hasTgToken
        ? t('settings.channels.status.connected')
        : t('settings.channels.status.notConfigured'),
    },
    {
      id: 'discord' as ChannelId,
      title: t('settings.channels.cards.discord.title'),
      subtitle: t('settings.channels.cards.discord.subtitle'),
      typeTag: t('settings.channels.cards.discord.typeTag'),
      icon: MessageCircle,
      color: '#818cf8',
      bgTint: 'rgba(129, 140, 248, 0.08)',
      iconBg: 'rgba(129, 140, 248, 0.15)',
      isConfigured: hasDiscordToken,
      statusLabel: hasDiscordToken
        ? t('settings.channels.status.connected')
        : t('settings.channels.status.notConfigured'),
    },
    {
      id: 'slack' as ChannelId,
      title: t('settings.channels.cards.slack.title'),
      subtitle: t('settings.channels.cards.slack.subtitle'),
      typeTag: t('settings.channels.cards.slack.typeTag'),
      icon: MessageSquare,
      color: '#fbbf24',
      bgTint: 'rgba(251, 191, 36, 0.08)',
      iconBg: 'rgba(251, 191, 36, 0.15)',
      isConfigured: hasSlackWebhook,
      statusLabel: hasSlackWebhook
        ? t('settings.channels.status.connected')
        : t('settings.channels.status.notConfigured'),
    },
    {
      id: 'webhook' as ChannelId,
      title: t('settings.channels.cards.webhook.title'),
      subtitle: t('settings.channels.cards.webhook.subtitle'),
      typeTag: t('settings.channels.cards.webhook.typeTag'),
      icon: Terminal,
      color: '#a855f7',
      bgTint: 'rgba(168, 85, 247, 0.08)',
      iconBg: 'rgba(168, 85, 247, 0.15)',
      isConfigured: true,
      statusLabel: t('settings.channels.status.activeReady'),
    },
  ];

  return (
    <div className="settings-panel" role="tabpanel">
      {/* 1. Omnichannel Selector Hub */}
      <div className="settings-section">
        <div className="settings-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Radio size={18} style={{ color: 'var(--accent)' }} />
            <span className="settings-section-title">{t('settings.channels.hub.title')}</span>
          </div>
          <span className="settings-section-desc">
            {t('settings.channels.hub.desc')}
          </span>
        </div>

        {/* Balanced 2x2 Channel Cards Deck */}
        <div className="channels-deck" role="tablist" aria-label={t('settings.channels.hub.deckAria')}>
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
                      <span>{t('settings.channels.configuring')}</span>
                      <ChevronRight size={13} />
                    </span>
                  ) : (
                    <span className="channel-card-inactive-label">{t('settings.channels.clickToConfigure')}</span>
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
                    <span className="channel-workspace-title">{t('settings.channels.telegram.title')}</span>
                    <span className={`settings-badge ${hasTgToken ? 'success' : 'neutral'}`}>
                      {hasTgToken ? t('common.active') : t('common.optional')}
                    </span>
                  </div>
                  <span className="channel-workspace-desc">
                    {t('settings.channels.telegram.desc')}
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
                  {channelTesting === 'telegram' ? t('common.testing') : t('settings.channels.telegram.test')}
                </button>
              )}
            </div>

            {/* Telegram Form Credentials */}
            <div className="setup-form-group">
              <label htmlFor="settings-tg-token">
                {t('settings.channels.telegram.tokenLabel')}{' '}
                {hasTgToken ? t('settings.channels.telegram.configured') : ''}
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
                      : t('settings.channels.telegram.tokenPlaceholder')
                  }
                />
                <button
                  type="button"
                  className="channel-eye-btn"
                  onClick={() => setShowTgToken(!showTgToken)}
                  title={showTgToken ? t('common.hideCredential') : t('common.showCredential')}
                  aria-label={showTgToken ? t('common.hideCredential') : t('common.showCredential')}
                >
                  {showTgToken ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <span className="setup-hint">
                {t('settings.channels.telegram.hint')}
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
                    {t('settings.channels.telegram.activeTitle')}
                  </strong>
                  <div style={{ marginTop: '4px', fontSize: '12.5px', color: 'var(--text-dim)' }}>
                    {t('settings.channels.telegram.activeDesc')}
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
                      <span>{copiedPassphrase ? t('common.copied') : t('settings.channels.telegram.copyCommand')}</span>
                    </button>
                  </div>
                  {tgChatId && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {t('settings.channels.telegram.paired')} <strong>{tgChatId}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step-by-Step Onboarding Guide */}
            <div className="channel-guide-box">
              <span className="channel-guide-title">
                <Sparkles size={15} style={{ color: '#38bdf8' }} />
                <span>{t('settings.channels.telegram.guideTitle')}</span>
              </span>
              <div className="channel-step-list">
                <div className="channel-step-item">
                  <span className="channel-step-num">1</span>
                  <span>
                    {t('settings.channels.telegram.step1Before')}{' '}
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#38bdf8', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                    >
                      @BotFather <ExternalLink size={11} />
                    </a>{' '}
                    {t('settings.channels.telegram.step1After')}
                  </span>
                </div>
                <div className="channel-step-item">
                  <span className="channel-step-num">2</span>
                  <span>
                    {t('settings.channels.telegram.step2Before')} <code>/newbot</code>{' '}
                    {t('settings.channels.telegram.step2After')}
                  </span>
                </div>
                <div className="channel-step-item">
                  <span className="channel-step-num">3</span>
                  <span>
                    {t('settings.channels.telegram.step3Before')}{' '}
                    <strong>HTTP API Token</strong>{' '}
                    {t('settings.channels.telegram.step3After')}
                  </span>
                </div>
                <div className="channel-step-item">
                  <span className="channel-step-num">4</span>
                  <span>
                    {t('settings.channels.telegram.step4Before')}{' '}
                    <code>/start YOUR_MASTER_PASSPHRASE</code>
                    {t('settings.channels.telegram.step4After')}
                  </span>
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
                    <span className="channel-workspace-title">{t('settings.channels.discord.title')}</span>
                    <span className={`settings-badge ${hasDiscordToken ? 'success' : 'neutral'}`}>
                      {hasDiscordToken ? t('common.active') : t('common.optional')}
                    </span>
                  </div>
                  <span className="channel-workspace-desc">
                    {t('settings.channels.discord.desc')}
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
                  {channelTesting === 'discord' ? t('common.testing') : t('settings.channels.discord.test')}
                </button>
              )}
            </div>

            {/* Discord Form Credentials */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              <div className="setup-form-group">
                <label htmlFor="settings-discord-token">
                  {t('settings.channels.discord.tokenLabel')}{' '}
                  {hasDiscordToken ? t('settings.channels.discord.configured') : ''}
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
                    placeholder={hasDiscordToken ? '••••••••••••••••' : t('settings.channels.discord.tokenPlaceholder')}
                  />
                  <button
                    type="button"
                    className="channel-eye-btn"
                    onClick={() => setShowDiscordToken(!showDiscordToken)}
                    title={showDiscordToken ? t('common.hideCredential') : t('common.showCredential')}
                    aria-label={showDiscordToken ? t('common.hideCredential') : t('common.showCredential')}
                  >
                    {showDiscordToken ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <span className="setup-hint">{t('settings.channels.discord.hint')}</span>
              </div>

              <div className="setup-form-group">
                <label htmlFor="settings-discord-channel">{t('settings.channels.discord.channelLabel')}</label>
                <input
                  id="settings-discord-channel"
                  type="text"
                  value={discordChannelId}
                  onChange={(e) => {
                    setDiscordChannelId(e.target.value);
                    onDirtyChange?.();
                  }}
                  className="setup-input"
                  placeholder={t('settings.channels.discord.channelPlaceholder')}
                />
                <span className="setup-hint">{t('settings.channels.discord.channelHint')}</span>
              </div>
            </div>

            {/* Step-by-Step Discord Onboarding Guide */}
            <div className="channel-guide-box">
              <span className="channel-guide-title">
                <Sparkles size={15} style={{ color: '#818cf8' }} />
                <span>{t('settings.channels.discord.guideTitle')}</span>
              </span>
              <div className="channel-step-list">
                <div className="channel-step-item">
                  <span className="channel-step-num">1</span>
                  <span>
                    {t('settings.channels.discord.step1Before')}{' '}
                    <a
                      href="https://discord.com/developers/applications"
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#818cf8', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                    >
                      Discord Developer Portal <ExternalLink size={11} />
                    </a>{' '}
                    {t('settings.channels.discord.step1After')}
                  </span>
                </div>
                <div className="channel-step-item">
                  <span className="channel-step-num">2</span>
                  <span>
                    {t('settings.channels.discord.step2Before')} <strong>Bot</strong>
                    {t('settings.channels.discord.step2AfterBot')} <strong>Reset Token</strong>
                    {t('settings.channels.discord.step2AfterReset')}{' '}
                    <strong>Message Content Intent</strong>
                    {t('settings.channels.discord.step2End')}
                  </span>
                </div>
                <div className="channel-step-item">
                  <span className="channel-step-num">3</span>
                  <span>
                    {t('settings.channels.discord.step3Before')}{' '}
                    <strong>OAuth2 → URL Generator</strong>
                    {t('settings.channels.discord.step3AfterScope')} <code>bot</code>{' '}
                    {t('settings.channels.discord.step3AfterBot')}{' '}
                    <code>Send Messages</code> {t('settings.channels.discord.step3AfterSend')}{' '}
                    <code>Embed Links</code>
                    {t('settings.channels.discord.step3End')}
                  </span>
                </div>
                <div className="channel-step-item">
                  <span className="channel-step-num">4</span>
                  <span>
                    {t('settings.channels.discord.step4Before')} <strong>Developer Mode</strong>
                    {t('settings.channels.discord.step4Mid')} <strong>Copy Channel ID</strong>
                    {t('settings.channels.discord.step4End')}
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
                    <span className="channel-workspace-title">{t('settings.channels.slack.title')}</span>
                    <span className={`settings-badge ${hasSlackWebhook ? 'success' : 'neutral'}`}>
                      {hasSlackWebhook ? t('common.active') : t('common.optional')}
                    </span>
                  </div>
                  <span className="channel-workspace-desc">
                    {t('settings.channels.slack.desc')}
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
                  {channelTesting === 'slack' ? t('common.testing') : t('settings.channels.slack.test')}
                </button>
              )}
            </div>

            {/* Slack Form Credentials */}
            <div className="setup-form-group">
              <label htmlFor="settings-slack-webhook">
                {t('settings.channels.slack.webhookLabel')}{' '}
                {hasSlackWebhook ? t('settings.channels.slack.configured') : ''}
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
                  placeholder={hasSlackWebhook ? '••••••••••••••••' : t('settings.channels.slack.webhookPlaceholder')}
                />
                <button
                  type="button"
                  className="channel-eye-btn"
                  onClick={() => setShowSlackWebhook(!showSlackWebhook)}
                  title={showSlackWebhook ? t('common.hideCredential') : t('common.showCredential')}
                  aria-label={showSlackWebhook ? t('common.hideCredential') : t('common.showCredential')}
                >
                  {showSlackWebhook ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <span className="setup-hint">
                {t('settings.channels.slack.hint')}
              </span>
            </div>

            {/* Step-by-Step Slack Onboarding Guide */}
            <div className="channel-guide-box">
              <span className="channel-guide-title">
                <Sparkles size={15} style={{ color: '#fbbf24' }} />
                <span>{t('settings.channels.slack.guideTitle')}</span>
              </span>
              <div className="channel-step-list">
                <div className="channel-step-item">
                  <span className="channel-step-num">1</span>
                  <span>
                    {t('settings.channels.slack.step1Before')}{' '}
                    <a
                      href="https://api.slack.com/apps"
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#fbbf24', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                    >
                      Slack API Apps <ExternalLink size={11} />
                    </a>{' '}
                    {t('settings.channels.slack.step1After')}
                  </span>
                </div>
                <div className="channel-step-item">
                  <span className="channel-step-num">2</span>
                  <span>
                    {t('settings.channels.slack.step2Before')} <strong>Incoming Webhooks</strong>{' '}
                    {t('settings.channels.slack.step2Mid')}{' '}
                    <strong>Activate Incoming Webhooks</strong>{' '}
                    {t('settings.channels.slack.step2To')} <strong>On</strong>
                    {t('settings.channels.slack.step2End')}
                  </span>
                </div>
                <div className="channel-step-item">
                  <span className="channel-step-num">3</span>
                  <span>
                    {t('settings.channels.slack.step3Before')}{' '}
                    <strong>Add New Webhook to Workspace</strong>
                    {t('settings.channels.slack.step3End')}
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
                    <span className="channel-workspace-title">{t('settings.channels.webhook.title')}</span>
                    <span className="settings-badge success">{t('common.active')}</span>
                  </div>
                  <span className="channel-workspace-desc">
                    {t('settings.channels.webhook.desc')}
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
                {testingInbound ? t('settings.channels.webhook.capturing') : t('settings.channels.webhook.test')}
              </button>
            </div>

            {/* Inbound Endpoint URL Box */}
            <div className="setup-form-group">
              <label htmlFor="settings-inbound-webhook-url">{t('settings.channels.webhook.endpointLabel')}</label>
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
                  title={t('settings.channels.webhook.copyUrl')}
                  aria-label={t('settings.channels.webhook.copyUrl')}
                >
                  {copiedWebhookUrl ? <Check size={15} style={{ color: 'var(--accent-emerald)' }} /> : <Copy size={15} />}
                </button>
              </div>
              <span className="setup-hint">
                {t('settings.channels.webhook.endpointHintBefore')} <code>POST</code>{' '}
                {t('settings.channels.webhook.endpointHintMid')}{' '}
                <code>Content-Type: application/json</code>{' '}
                {t('settings.channels.webhook.endpointHintMid2')}{' '}
                <code>Authorization: Bearer YOUR_MASTER_PASSPHRASE</code>
                {t('settings.channels.webhook.endpointHintEnd')}
              </span>
            </div>

            {/* Live Webhook Test Simulator */}
            <div className="channel-tester-box">
              <div className="channel-tester-header">
                <div className="channel-tester-title">
                  <Zap size={14} style={{ color: 'var(--accent)' }} />
                  <span>{t('settings.channels.webhook.simulatorTitle')}</span>
                </div>
                {inboundTestResult && (
                  <span className={`channel-tester-result ${inboundTestFailed ? 'error' : ''}`}>
                    {inboundTestResult}
                  </span>
                )}
              </div>
              <div className="channel-tester-row">
                <input
                  type="text"
                  value={testInboundText}
                  onChange={(e) => setTestInboundText(e.target.value)}
                  placeholder={t('settings.channels.webhook.simulatorPlaceholder')}
                  className="setup-input channel-tester-input"
                  style={{ fontSize: '12px' }}
                  aria-label={t('settings.channels.webhook.simulatorAria')}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={testingInbound}
                  onClick={handleTestInboundCapture}
                  style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}
                >
                  {testingInbound ? t('settings.channels.webhook.ingesting') : t('settings.channels.webhook.simulate')}
                </button>
              </div>
            </div>

            {/* Code Snippets & Payload Specification */}
            <div className="channel-guide-box">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <span className="channel-guide-title">
                  <Code2 size={15} style={{ color: '#a855f7' }} />
                  <span>{t('settings.channels.webhook.specTitle')}</span>
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
                  title={t('settings.channels.webhook.copySnippet')}
                >
                  {copiedSnippet ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedSnippet ? t('common.copied') : t('common.copy')}</span>
                </button>
              </div>
            </div>

            {/* Mobile & Automation Integration Recipes */}
            <div className="setup-info-box" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Globe size={16} style={{ color: 'var(--accent)' }} />
                <strong style={{ fontSize: '13px', color: 'var(--text-main)' }}>
                  {t('settings.channels.webhook.recipesTitle')}
                </strong>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.45 }}>
                {t('settings.channels.webhook.recipesDesc')}
              </span>

              <div className="channel-recipes-grid">
                {/* Recipe 1: Generic Automation */}
                <div className="channel-recipe-card">
                  <div className="channel-recipe-title">
                    <Zap size={14} style={{ color: '#f59e0b' }} />
                    <span>{t('settings.channels.webhook.recipe1Title')}</span>
                  </div>
                  <span className="channel-recipe-desc">
                    {t('settings.channels.webhook.recipe1DescBefore')} <code>url</code>{' '}
                    {t('settings.channels.webhook.recipe1DescMid')} <code>text</code>{' '}
                    {t('settings.channels.webhook.recipe1DescEnd')}
                  </span>
                </div>

                {/* Recipe 2: iOS Shortcuts & Android */}
                <div className="channel-recipe-card">
                  <div className="channel-recipe-title">
                    <Smartphone size={14} style={{ color: '#38bdf8' }} />
                    <span>{t('settings.channels.webhook.recipe2Title')}</span>
                  </div>
                  <span className="channel-recipe-desc">
                    {t('settings.channels.webhook.recipe2DescBefore')}{' '}
                    <code>url: ShortcutInput</code>
                    {t('settings.channels.webhook.recipe2DescEnd')}
                  </span>
                </div>

                {/* Recipe 3: WhatsApp Share Sheet */}
                <div className="channel-recipe-card" style={{ borderColor: 'rgba(37, 211, 102, 0.3)' }}>
                  <div className="channel-recipe-title">
                    <Share2 size={14} style={{ color: '#25d366' }} />
                    <span>{t('settings.channels.webhook.recipe3Title')}</span>
                  </div>
                  <span className="channel-recipe-desc">
                    {t('settings.channels.webhook.recipe3DescBefore')} <strong>Share</strong>{' '}
                    {t('settings.channels.webhook.recipe3DescEnd')}
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
            <span className="settings-section-title">{t('settings.channels.digest.title')}</span>
          </div>
          <span className="settings-section-desc">
            {t('settings.channels.digest.desc')}
          </span>
        </div>

        {/* Digest Dispatch Controls Row */}
        <div className="digest-controls-row">
          <div className="setup-form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
            <label htmlFor="settings-digest-channel" style={{ fontSize: '11.5px', marginBottom: '4px' }}>
              {t('settings.channels.digest.channel')}
            </label>
            <select
              id="settings-digest-channel"
              value={selectedDigestChannel}
              onChange={(e) => setSelectedDigestChannel(e.target.value)}
              className="setup-input"
              style={{ background: 'var(--bg-input)', color: 'var(--text-main)', height: '36px', fontSize: '12.5px' }}
              aria-label={t('settings.channels.digest.channelAria')}
            >
              <option value="all">{t('settings.channels.digest.allChannels')}</option>
              <option value="telegram">{t('settings.channels.cards.telegram.title')}</option>
              <option value="discord">{t('settings.channels.cards.discord.title')}</option>
              <option value="slack">{t('settings.channels.cards.slack.title')}</option>
            </select>
          </div>

          <div className="setup-form-group" style={{ flex: '1 1 160px', marginBottom: 0 }}>
            <label htmlFor="settings-digest-days" style={{ fontSize: '11.5px', marginBottom: '4px' }}>
              {t('settings.channels.digest.window')}
            </label>
            <select
              id="settings-digest-days"
              value={selectedDigestDays}
              onChange={(e) => setSelectedDigestDays(Number(e.target.value))}
              className="setup-input"
              style={{ background: 'var(--bg-input)', color: 'var(--text-main)', height: '36px', fontSize: '12.5px' }}
              aria-label={t('settings.channels.digest.windowAria')}
            >
              <option value={7}>{t('settings.channels.digest.days7')}</option>
              <option value={14}>{t('settings.channels.digest.days14')}</option>
              <option value={30}>{t('settings.channels.digest.days30')}</option>
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
              <span>{digestPushing ? t('settings.channels.digest.pushing') : t('settings.channels.digest.push')}</span>
            </button>
          </div>
        </div>

        {/* Automated Channel Triggers Overview */}
        <div className="alerts-triggers-overview">
          <div className="alerts-trigger-pill">
            <Zap size={13} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>{t('settings.channels.triggers.instantTitle')}</strong>
              <span>{t('settings.channels.triggers.instantDesc')}</span>
            </div>
          </div>
          <div className="alerts-trigger-pill">
            <Sparkles size={13} style={{ color: '#38bdf8', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>{t('settings.channels.triggers.aiTitle')}</strong>
              <span>{t('settings.channels.triggers.aiDesc')}</span>
            </div>
          </div>
          <div className="alerts-trigger-pill">
            <Clock size={13} style={{ color: '#a855f7', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>{t('settings.channels.triggers.scheduleTitle')}</strong>
              <span>{t('settings.channels.triggers.scheduleDesc')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
