import React, { useState } from 'react';
import { MessageSquare, Terminal } from 'lucide-react';
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

  return (
    <div className="settings-panel" role="tabpanel">
      {/* 1. Telegram Bot */}
      <div className="settings-section">
        <div
          className="settings-section-header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <div>
            <span className="settings-section-title">Telegram Bot</span>
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
            <MessageSquare size={16} style={{ color: 'var(--accent-emerald)' }} />
            <div>
              <strong style={{ color: 'var(--accent-emerald)' }}>
                Bot is Active! Connect your account:
              </strong>
              <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-dim)' }}>
                Send this exact command to your Telegram bot to pair your device:
              </div>
              <code
                style={{
                  display: 'inline-block',
                  marginTop: '8px',
                  padding: '6px 10px',
                  background: '#090a0f',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  color: 'var(--accent)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '14px',
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

      {/* 2. OpenClaw Gateway Bridge */}
      <div className="settings-section" style={{ marginTop: '24px' }}>
        <div
          className="settings-section-header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="settings-section-title">OpenClaw Bridge</span>
              <span
                className={`settings-badge ${openclawEnabled || hasOpenclawToken ? 'success' : 'neutral'}`}
                style={{ fontSize: '11px', padding: '2px 8px' }}
              >
                {openclawEnabled || hasOpenclawToken ? 'Active' : 'Optional'}
              </span>
            </div>
            <span className="settings-section-desc">
              Connect to OpenClaw's Gateway daemon to capture and notify via WhatsApp, Signal, iMessage, and Matrix
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
              {channelTesting === 'openclaw' ? 'Testing...' : 'Test Bridge Notification'}
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
            Enable OpenClaw Bridge Channel
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div className="setup-form-group">
            <label htmlFor="settings-openclaw-url">OpenClaw Gateway URL</label>
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
          </div>

          <div className="setup-form-group">
            <label htmlFor="settings-openclaw-token">
              Gateway Hook Token {hasOpenclawToken ? '(Configured)' : ''}
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
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px' }}>
          <div className="setup-form-group">
            <label htmlFor="settings-openclaw-channel">Default Outbound Channel</label>
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
              <option value="imessage">iMessage</option>
              <option value="discord">Discord</option>
              <option value="slack">Slack</option>
              <option value="matrix">Matrix</option>
            </select>
          </div>

          <div className="setup-form-group">
            <label htmlFor="settings-openclaw-target">Default Recipient Target</label>
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
          </div>
        </div>

        <div className="setup-info-box" style={{ marginTop: '12px' }}>
          <Terminal size={14} />
          <span style={{ fontSize: '12px' }}>
            Inbound webhook for OpenClaw skill / forwarder:{' '}
            <code>{currentOrigin}/api/v1/channels/openclaw/webhook</code>
          </span>
        </div>
      </div>

      {/* 3. Discord Bot */}
      <div className="settings-section" style={{ marginTop: '24px' }}>
        <div
          className="settings-section-header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <div>
            <span className="settings-section-title">Discord Bot</span>
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
            <span className="settings-section-title">Slack Webhook</span>
            <span className="settings-section-desc">
              Post Block Kit interactive cards into your Slack workplace
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

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '12px' }}>
          <select
            value={selectedDigestChannel}
            onChange={(e) => setSelectedDigestChannel(e.target.value)}
            className="setup-input"
            style={{ maxWidth: '240px', background: 'var(--bg-input)', color: 'var(--text-main)' }}
            aria-label="Select digest channel"
          >
            <option value="all">All Configured Channels</option>
            <option value="telegram">Telegram</option>
            <option value="openclaw">OpenClaw Bridge</option>
            <option value="discord">Discord</option>
            <option value="slack">Slack</option>
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
