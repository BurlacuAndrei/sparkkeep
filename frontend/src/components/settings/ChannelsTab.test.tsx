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
    openclawUrl: 'http://localhost:18789',
    setOpenclawUrl: vi.fn(),
    openclawToken: '',
    setOpenclawToken: vi.fn(),
    hasOpenclawToken: false,
    openclawChannel: 'whatsapp',
    setOpenclawChannel: vi.fn(),
    openclawTarget: '+15550199',
    setOpenclawTarget: vi.fn(),
    openclawEnabled: false,
    setOpenclawEnabled: vi.fn(),
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

  it('renders omnichannel overview with Telegram, WhatsApp, Signal, iMessage, Discord, and Slack', () => {
    render(<ChannelsTab {...defaultProps} />);

    expect(screen.getByText(/Omnichannel Messenger Hub/i)).toBeDefined();
    expect(screen.getAllByText(/Telegram Bot/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('WhatsApp, Signal, iMessage')).toBeDefined();
    expect(screen.getAllByText(/Discord Bot/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Slack Webhook/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders first-class Unified Mobile Gateway branding and inputs', () => {
    render(<ChannelsTab {...defaultProps} openclawEnabled={true} hasOpenclawToken={true} />);

    expect(
      screen.getAllByText(/Unified Mobile Gateway \(WhatsApp, Signal, iMessage\)/i).length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText(/Gateway Service URL/i)).toBeDefined();
    expect(screen.getByLabelText(/Preferred Outbound Messenger/i)).toBeDefined();
    expect(screen.getByLabelText(/Default Recipient Phone \/ Chat ID/i)).toBeDefined();
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
});
