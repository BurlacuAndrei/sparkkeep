import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChannelsTab } from './ChannelsTab';
import * as api from '../../api';

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  return {
    ...actual,
    testChannel: vi.fn().mockResolvedValue({ success: true, message: 'Test notification delivered!' }),
    pushDigestToChannel: vi.fn().mockResolvedValue({ success: true, message: 'Digest dispatched!' }),
  };
});

describe('ChannelsTab Omnichannel Messenger Hub', () => {
  const defaultProps = {
    tgToken: '',
    setTgToken: vi.fn(),
    hasTgToken: false,
    tgChatId: '',
    discordToken: '',
    setDiscordToken: vi.fn(),
    hasDiscordToken: false,
    discordChannelId: '',
    setDiscordChannelId: vi.fn(),
    slackWebhookUrl: '',
    setSlackWebhookUrl: vi.fn(),
    hasSlackWebhook: false,
    showToast: vi.fn(),
    onDirtyChange: vi.fn(),
  };

  it('renders interactive channel selector deck for Telegram, Discord, Slack, and Inbound Webhook', () => {
    render(<ChannelsTab {...defaultProps} />);

    expect(screen.getByText(/Omnichannel Messenger Hub/i)).toBeDefined();
    expect(screen.getByRole('tab', { name: /Telegram Bot/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Discord Bot/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Slack Webhook/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Inbound Webhook/i })).toBeDefined();

    // Verify OpenClaw and Unified Mobile Gateway are completely gone
    expect(screen.queryByText(/Unified Mobile Gateway/i)).toBeNull();
    expect(screen.queryByText(/OpenClaw/i)).toBeNull();
    expect(screen.queryByText(/WhatsApp, Signal, iMessage/i)).toBeNull();
  });

  it('switches to Inbound Webhook & WhatsApp Phase 1 workspace when clicked', async () => {
    const showToast = vi.fn();
    render(<ChannelsTab {...defaultProps} showToast={showToast} />);

    const webhookTab = screen.getByRole('tab', { name: /Inbound Webhook/i });
    fireEvent.click(webhookTab);

    expect(screen.getByText(/Inbound Webhook & Mobile Capture/i)).toBeDefined();
    expect(screen.getByText(/WhatsApp Integration \(Phase 1: Zero-Maintenance Share Sheet\)/i)).toBeDefined();
    expect(screen.getByText(/Payload Specification & Custom Automation/i)).toBeDefined();

    // Test sending inbound spark
    const captureBtn = screen.getByRole('button', { name: /Send Test Inbound Spark/i });
    fireEvent.click(captureBtn);

    await waitFor(() => {
      expect(showToast).toHaveBeenCalled();
    });
  });

  it('defaults to Telegram Bot configuration workspace', () => {
    render(<ChannelsTab {...defaultProps} />);

    expect(screen.getByLabelText(/Telegram Bot Token/i)).toBeDefined();
    expect(screen.getByText(/How to set up Telegram Bot in 4 easy steps/i)).toBeDefined();
  });

  it('switches to Discord Bot configuration when Discord card is clicked', () => {
    render(<ChannelsTab {...defaultProps} />);

    const discordTab = screen.getByRole('tab', { name: /Discord Bot/i });
    fireEvent.click(discordTab);

    expect(screen.getByLabelText(/Discord Bot Token/i)).toBeDefined();
    expect(screen.getByLabelText(/Discord Target Channel ID/i)).toBeDefined();
    expect(screen.getByText(/How to set up Discord Bot in 4 easy steps/i)).toBeDefined();
  });

  it('switches to Slack Webhook configuration when Slack card is clicked', () => {
    render(<ChannelsTab {...defaultProps} />);

    const slackTab = screen.getByRole('tab', { name: /Slack Webhook/i });
    fireEvent.click(slackTab);

    expect(screen.getByLabelText(/Slack Incoming Webhook URL/i)).toBeDefined();
    expect(screen.getByText(/How to set up Slack Webhook in 3 easy steps/i)).toBeDefined();
  });

  it('triggers test channel API and toast on test button click', async () => {
    const showToast = vi.fn();
    render(
      <ChannelsTab
        {...defaultProps}
        hasTgToken={true}
        showToast={showToast}
      />
    );

    const testBtn = screen.getByRole('button', { name: /Send Test Notification/i });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(api.testChannel).toHaveBeenCalledWith('telegram');
    });
  });

  it('allows copying the Telegram pairing command when bot is active', () => {
    const showToast = vi.fn();
    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    render(
      <ChannelsTab
        {...defaultProps}
        hasTgToken={true}
        tgChatId="12345678"
        showToast={showToast}
      />
    );

    expect(screen.getByText(/Currently paired to chat ID:/i)).toBeDefined();
    expect(screen.getByText('12345678')).toBeDefined();

    const copyBtn = screen.getByRole('button', { name: /Copy Command/i });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/start YOUR_MASTER_PASSPHRASE');
  });

  it('dispatches intelligence digest without OpenClaw in options', async () => {
    const showToast = vi.fn();
    render(<ChannelsTab {...defaultProps} showToast={showToast} />);

    const select = screen.getByLabelText(/Select digest channel/i) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((opt) => opt.value);

    expect(optionValues).toEqual(['all', 'telegram', 'discord', 'slack']);
    expect(optionValues).not.toContain('openclaw');

    const pushBtn = screen.getByRole('button', { name: /Push Digest Now/i });
    fireEvent.click(pushBtn);

    await waitFor(() => {
      expect(api.pushDigestToChannel).toHaveBeenCalledWith('all');
    });
  });

  it('supports generic webhook code snippet switching and simulator testing', async () => {
    const showToast = vi.fn();
    render(<ChannelsTab {...defaultProps} showToast={showToast} />);

    const webhookTab = screen.getByRole('tab', { name: /Inbound Webhook/i });
    fireEvent.click(webhookTab);

    // Verify Generic Webhook title & copy endpoint
    expect(screen.getByLabelText(/Inbound Capture Webhook Endpoint/i)).toBeDefined();

    // Verify snippet tabs exist
    const fetchTab = screen.getByRole('button', { name: /Fetch \/ JS/i });
    const pythonTab = screen.getByRole('button', { name: /Python/i });
    const schemaTab = screen.getByRole('button', { name: /JSON Schema/i });

    expect(fetchTab).toBeDefined();
    expect(pythonTab).toBeDefined();
    expect(schemaTab).toBeDefined();

    // Click Python snippet tab
    fireEvent.click(pythonTab);
    expect(screen.getByText(/import requests/i)).toBeDefined();

    // Click JSON Schema snippet tab
    fireEvent.click(schemaTab);
    expect(screen.getByText(/SparkkeepInboundCapturePayload/i)).toBeDefined();

    // Test the simulator input and simulate button
    const simInput = screen.getByLabelText(/Test inbound spark text/i) as HTMLInputElement;
    fireEvent.change(simInput, { target: { value: 'Custom Generic Webhook Test Idea #research' } });
    expect(simInput.value).toBe('Custom Generic Webhook Test Idea #research');

    const simBtn = screen.getByRole('button', { name: /Simulate Inbound Capture/i });
    fireEvent.click(simBtn);

    await waitFor(() => {
      expect(showToast).toHaveBeenCalled();
    });

    // Verify Alert triggers overview
    expect(screen.getByText(/Instant Ingest Alerts/i)).toBeDefined();
    expect(screen.getByText(/AI Synthesis Briefs/i)).toBeDefined();
    expect(screen.getByText(/Automated Digest Schedule/i)).toBeDefined();
  });
});

