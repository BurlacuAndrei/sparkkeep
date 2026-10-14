import React, { useState } from 'react';
import {
  MessageSquare,
  Terminal,
  Smartphone,
  MessageCircle,
  Send,
  CheckCircle2,
  Copy,
  Check,
  Radio,
} from 'lucide-react';
import * as api from '../../api';

export interface ChannelsTabProps {
  tgToken: string;
  setTgToken: (val: string) => void;
  hasTgToken: boolean;
  tgChatId: string;
  openclawUrl: string;
  setOpenclawUrl: (val: string) => void;
  openclawToken: string;
  setOpenclawToken: (val: string) => void;
  hasOpenclawToken: boolean;
  openclawChannel: string;
  setOpenclawChannel: (val: string) => void;
  openclawTarget: string;
  setOpenclawTarget: (val: string) => void;
  openclawEnabled: boolean;
  setOpenclawEnabled: (val: boolean) => void;
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
}

export const ChannelsTab: React.FC<ChannelsTabProps> = ({
  tgToken,
  setTgToken,
  hasTgToken,
  tgChatId,
  openclawUrl,
  setOpenclawUrl,
  openclawToken,
  setOpenclawToken,
  hasOpenclawToken,
  openclawChannel,
  setOpenclawChannel,
  openclawTarget,
  setOpenclawTarget,
  openclawEnabled,
  setOpenclawEnabled,
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
  const [channelTesting, setChannelTesting] = useState<string | null>(null);
  const [digestPushing, setDigestPushing] = useState(false);
  const [selectedDigestChannel, setSelectedDigestChannel] = useState('all');
  const [copiedWebhook, setCopiedWebhook] = useState(false);

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

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const webhookUrl = `${currentOrigin}/api/v1/channels/openclaw/webhook`;

  const handleCopyWebhook = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(webhookUrl);
      setCopiedWebhook(true);
      showToast('Inbound webhook URL copied to clipboard.');
      setTimeout(() => setCopiedWebhook(false), 2000);
    }
  };

  const channelCards = [
    {
      id: 'telegram',
      title: 'Telegram Bot',
      status: hasTgToken ? 'Connected' : 'Standby',
      active: hasTgToken,
      icon: Send,
      desc: 'Interactive inline cards & instant voice notes',
      color: '#38bdf8',
    },
    {
      id: 'gateway',
      title: 'WhatsApp, Signal, iMessage',
      status: openclawEnabled || hasOpenclawToken ? 'Gateway Active' : 'Standby',
      active: openclawEnabled || hasOpenclawToken,
      icon: Smartphone,
      desc: 'Unified mobile alerts & two-way capturing',
      color: '#34d399',
    },
    {
      id: 'discord',
      title: 'Discord Bot',
      status: hasDiscordToken ? 'Connected' : 'Standby',
      active: hasDiscordToken,
      icon: MessageCircle,
      desc: 'Rich embed cards in your Discord server',
      color: '#818cf8',
    },
    {
      id: 'slack',
      title: 'Slack Webhook',
      status: hasSlackWebhook ? 'Connected' : 'Standby',
      active: hasSlackWebhook,
      icon: MessageSquare,
      desc: 'Block Kit notifications in workspace channels',
      color: '#fbbf24',
    },
  ];

  return (
    <div className="settings-panel" role="tabpanel">
      {/* Omnichannel Overview Header Grid */}
      <div className="settings-section" style={{ marginBottom: '20px' }}>
        <div className="settings-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Radio size={18} style={{ color: 'var(--accent)' }} />
            <span className="settings-section-title">Omnichannel Messenger Hub</span>
          </div>
          <span className="settings-section-desc">
            Capture links, audio, and documents anywhere. Sparkkeep delivers real-time briefings and triage alerts across all your everyday communication channels.
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            marginTop: '12px',
          }}
        >
          {channelCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.id}
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md, 8px)',
                  background: 'var(--bg-input, rgba(255,255,255,0.03))',
                  border: `1px solid ${card.active ? 'var(--border-focus, rgba(99,102,241,0.3))' : 'var(--border-subtle)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon size={16} style={{ color: card.color }} />
                    <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)' }}>
                      {card.title}
                    </span>
                  </div>
                  <span
                    className={`settings-badge ${card.active ? 'success' : 'neutral'}`}
                    style={{ fontSize: '10px', padding: '1px 6px' }}
                  >
                    {card.status}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.35 }}>
                  {card.desc}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 1. Telegram Bot */}
      <div className="settings-section">
        <div
          className="settings-section-header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="settings-section-title">Telegram Bot</span>
              <span className={`settings-badge ${hasTgToken ? 'success' : 'neutral'}`}>
                {hasTgToken ? 'Active' : 'Optional'}
              </span>
            </div>
            <span className="settings-section-desc">
              Forward messages, links, and audio notes directly into Sparkkeep with inline interactive buttons
            </span>
          </div>
          {hasTgToken && (
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '12px', padding: '4px 10px' }}
              disabled={channelTesting === 'telegram'}
              onClick={() => handleTestChannel('telegram')}
            >
              {channelTesting === 'telegram' ? 'Testing...' : 'Send Test Notification'}
            </button>
          )}
        </div>

        <div className="setup-form-group">
          <label htmlFor="settings-tg-token">
            Telegram Bot Token {hasTgToken ? '(Configured)' : ''}
          </label>
          <input
            id="settings-tg-token"
            type="password"
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
          <span className="setup-hint">
            Get this by creating a new bot with{' '}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent)' }}
            >
              @BotFather
            </a>{' '}
            on Telegram.
          </span>
        </div>

        {hasTgToken && (
          <div
            className="setup-info-box"
            style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <CheckCircle2 size={16} style={{ color: 'var(--accent-emerald)' }} />
            <div>
              <strong style={{ color: 'var(--accent-emerald)' }}>
                Bot is Active! Link your private chat:
              </strong>
              <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-dim)' }}>
                Send this command to your Telegram bot to pair your account:
              </div>
              <code
                style={{
                  display: 'inline-block',
                  marginTop: '8px',
                  padding: '6px 10px',
                  background: 'var(--surface-sunken, #090a0f)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  color: 'var(--accent)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13.5px',
                  userSelect: 'all',
                }}
              >
                /start YOUR_MASTER_PASSPHRASE
              </code>
              {tgChatId && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  ✓ Currently linked to chat ID: {tgChatId}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Unified Mobile Gateway (WhatsApp, Signal, iMessage) */}
      <div className="settings-section" style={{ marginTop: '24px' }}>
        <div
          className="settings-section-header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="settings-section-title">Unified Mobile Gateway (WhatsApp, Signal, iMessage)</span>
              <span
                className={`settings-badge ${openclawEnabled || hasOpenclawToken ? 'success' : 'neutral'}`}
                style={{ fontSize: '11px', padding: '2px 8px' }}
              >
                {openclawEnabled || hasOpenclawToken ? 'Active' : 'Optional'}
              </span>
            </div>
            <span className="settings-section-desc">
              Connect to your local or hosted messaging gateway to deliver briefs and capture voice memos via WhatsApp, Signal, and Apple iMessage.
            </span>
          </div>
          {(openclawEnabled || hasOpenclawToken) && (
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '12px', padding: '4px 10px' }}
              disabled={channelTesting === 'openclaw'}
              onClick={() => handleTestChannel('openclaw')}
            >
              {channelTesting === 'openclaw' ? 'Testing...' : 'Test Gateway Alert'}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <input
            type="checkbox"
            id="openclaw-enabled-toggle"
            checked={openclawEnabled}
            onChange={(e) => {
              setOpenclawEnabled(e.target.checked);
              onDirtyChange?.();
            }}
            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
          />
          <label
            htmlFor="openclaw-enabled-toggle"
            style={{ cursor: 'pointer', fontSize: '13px', color: 'var(--text-main)', fontWeight: 500 }}
          >
            Enable Unified Mobile Gateway (WhatsApp, Signal, iMessage)
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div className="setup-form-group">
            <label htmlFor="settings-openclaw-url">Gateway Service URL</label>
            <input
              id="settings-openclaw-url"
              type="text"
              value={openclawUrl}
              onChange={(e) => {
                setOpenclawUrl(e.target.value);
                onDirtyChange?.();
              }}
              className="setup-input"
              placeholder="http://localhost:18789"
            />
            <span className="setup-hint">
              Default address for local gateway daemon or private remote bridge.
            </span>
          </div>

          <div className="setup-form-group">
            <label htmlFor="settings-openclaw-token">
              Gateway Secret Hook Token {hasOpenclawToken ? '(Configured)' : ''}
            </label>
            <input
              id="settings-openclaw-token"
              type="password"
              value={openclawToken}
              onChange={(e) => {
                setOpenclawToken(e.target.value);
                onDirtyChange?.();
              }}
              className="setup-input"
              placeholder={hasOpenclawToken ? '••••••••••••••••' : 'Secret hook token'}
            />
            <span className="setup-hint">
              Used to sign outbound requests and verify inbound forwarder webhooks.
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px' }}>
          <div className="setup-form-group">
            <label htmlFor="settings-openclaw-channel">Preferred Outbound Messenger</label>
            <select
              id="settings-openclaw-channel"
              value={openclawChannel}
              onChange={(e) => {
                setOpenclawChannel(e.target.value);
                onDirtyChange?.();
              }}
              className="setup-input"
              style={{ background: 'var(--bg-input)', color: 'var(--text-main)' }}
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="signal">Signal</option>
              <option value="imessage">Apple iMessage</option>
              <option value="discord">Discord</option>
              <option value="slack">Slack</option>
              <option value="matrix">Matrix</option>
            </select>
            <span className="setup-hint">
              Default protocol used when routing digest summaries and card notifications.
            </span>
          </div>

          <div className="setup-form-group">
            <label htmlFor="settings-openclaw-target">Default Recipient Phone / Chat ID</label>
            <input
              id="settings-openclaw-target"
              type="text"
              value={openclawTarget}
              onChange={(e) => {
                setOpenclawTarget(e.target.value);
                onDirtyChange?.();
              }}
              className="setup-input"
              placeholder="+15550199 or Chat ID"
            />
            <span className="setup-hint">
              E.164 phone number with country code for WhatsApp/Signal, or iMessage handle.
            </span>
          </div>
        </div>

        {/* Inbound Webhook Guidance */}
        <div
          className="setup-info-box"
          style={{
            marginTop: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Terminal size={15} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '12.5px' }}>
              <strong>Inbound Forwarder Webhook:</strong> Point mobile shortcuts or bridge forwarders here:
            </span>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleCopyWebhook}
            style={{ fontSize: '11px', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            {copiedWebhook ? <Check size={12} /> : <Copy size={12} />}
            <span>{copiedWebhook ? 'Copied' : 'Copy Webhook'}</span>
          </button>
        </div>
        <div style={{ marginTop: '6px', fontSize: '11.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {webhookUrl}
        </div>
      </div>

      {/* 3. Discord Bot */}
      <div className="settings-section" style={{ marginTop: '24px' }}>
        <div
          className="settings-section-header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="settings-section-title">Discord Bot</span>
              <span className={`settings-badge ${hasDiscordToken ? 'success' : 'neutral'}`}>
                {hasDiscordToken ? 'Active' : 'Optional'}
              </span>
            </div>
            <span className="settings-section-desc">
              Deliver Rich Embeds with action buttons into your private Discord server
            </span>
          </div>
          {hasDiscordToken && (
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '12px', padding: '4px 10px' }}
              disabled={channelTesting === 'discord'}
              onClick={() => handleTestChannel('discord')}
            >
              {channelTesting === 'discord' ? 'Testing...' : 'Send Test Embed'}
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div className="setup-form-group">
            <label htmlFor="settings-discord-token">
              Discord Bot Token {hasDiscordToken ? '(Configured)' : ''}
            </label>
            <input
              id="settings-discord-token"
              type="password"
              value={discordToken}
              onChange={(e) => {
                setDiscordToken(e.target.value);
                onDirtyChange?.();
              }}
              className="setup-input"
              placeholder={hasDiscordToken ? '••••••••••••••••' : 'Discord Bot Token'}
            />
          </div>
          <div className="setup-form-group">
            <label htmlFor="settings-discord-channel">Discord Channel ID</label>
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
          </div>
        </div>
      </div>

      {/* 4. Slack */}
      <div className="settings-section" style={{ marginTop: '24px' }}>
        <div
          className="settings-section-header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="settings-section-title">Slack Webhook</span>
              <span className={`settings-badge ${hasSlackWebhook ? 'success' : 'neutral'}`}>
                {hasSlackWebhook ? 'Active' : 'Optional'}
              </span>
            </div>
            <span className="settings-section-desc">
              Post Block Kit interactive cards into your Slack workspace
            </span>
          </div>
          {hasSlackWebhook && (
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '12px', padding: '4px 10px' }}
              disabled={channelTesting === 'slack'}
              onClick={() => handleTestChannel('slack')}
            >
              {channelTesting === 'slack' ? 'Testing...' : 'Send Test Message'}
            </button>
          )}
        </div>

        <div className="setup-form-group">
          <label htmlFor="settings-slack-webhook">
            Slack Incoming Webhook URL {hasSlackWebhook ? '(Configured)' : ''}
          </label>
          <input
            id="settings-slack-webhook"
            type="password"
            value={slackWebhookUrl}
            onChange={(e) => {
              setSlackWebhookUrl(e.target.value);
              onDirtyChange?.();
            }}
            className="setup-input"
            placeholder={hasSlackWebhook ? '••••••••••••••••' : 'https://hooks.slack.com/services/...'}
          />
        </div>
      </div>

      {/* 5. Intelligence Digest Push */}
      <div className="settings-section" style={{ marginTop: '24px' }}>
        <div className="settings-section-header">
          <span className="settings-section-title">Manual Digest Dispatch</span>
          <span className="settings-section-desc">
            Push your weekly sparks summary to any active channel on demand
          </span>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap' }}>
          <select
            value={selectedDigestChannel}
            onChange={(e) => setSelectedDigestChannel(e.target.value)}
            className="setup-input"
            style={{ maxWidth: '280px', background: 'var(--bg-input)', color: 'var(--text-main)' }}
            aria-label="Select digest channel"
          >
            <option value="all">All Configured Channels</option>
            <option value="telegram">Telegram Bot</option>
            <option value="openclaw">WhatsApp / Signal / iMessage (Gateway)</option>
            <option value="discord">Discord Bot</option>
            <option value="slack">Slack Webhook</option>
          </select>
          <button
            type="button"
            className="btn-secondary"
            disabled={digestPushing}
            onClick={handlePushDigest}
          >
            {digestPushing ? 'Pushing Digest...' : 'Push Digest Now'}
          </button>
        </div>
      </div>
    </div>
  );
};
