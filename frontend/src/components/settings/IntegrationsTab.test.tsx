import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntegrationsTab } from './IntegrationsTab';
import * as api from '../../api';

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  return {
    ...actual,
    syncObsidian: vi.fn().mockResolvedValue({ written: 12, vault_path: '/vault' }),
    testSinkConnection: vi.fn().mockResolvedValue({ ok: true, success: true, message: 'Vault directory is accessible and writable' }),
    testWebhook: vi.fn().mockResolvedValue({ ok: true, status_code: 200 }),
    getSettings: vi.fn().mockResolvedValue({ ok: true, settings: { obsidian_vault_path: '/vault' } }),
  };
});

describe('IntegrationsTab Ecosystem Tools', () => {
  it('renders Official Browser Extension, Browser Bookmarklet, iOS Shortcut, Raycast, and MCP sections', () => {
    render(<IntegrationsTab showToast={vi.fn()} />);

    expect(screen.getByText(/Official Browser Extension \(Chrome & Firefox\)/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /1-Click Pair Extension/i })).toBeDefined();
    expect(screen.getByText('Browser Bookmarklet')).toBeDefined();
    expect(screen.getByText(/⚡ Save to Sparkkeep/i)).toBeDefined();
    expect(screen.getByText(/Apple iOS Shortcut & Share Sheet/i)).toBeDefined();
    expect(screen.getByText(/Raycast Extension \/ Script Command/i)).toBeDefined();
    expect(screen.getByText(/Model Context Protocol \(MCP\)/i)).toBeDefined();
  });

  it('dispatches pairing handshake postMessage when clicking 1-Click Pair Extension', async () => {
    const postMessageSpy = vi.spyOn(window, 'postMessage');
    const showToast = vi.fn();
    render(<IntegrationsTab showToast={showToast} authToken="test-master-token" />);

    const pairBtn = screen.getByRole('button', { name: /1-Click Pair Extension/i });
    fireEvent.click(pairBtn);

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SPARKKEEP_PAIR_EXTENSION',
        token: 'test-master-token',
      }),
      '*'
    );
  });

  it('toggles extension setup guide on button click', () => {
    render(<IntegrationsTab showToast={vi.fn()} />);

    const guideBtn = screen.getByRole('button', { name: /Setup Guide/i });
    fireEvent.click(guideBtn);

    expect(screen.getByText(/How to load the extension in your browser:/i)).toBeDefined();
    expect(screen.getByText(/chrome:\/\/extensions/i)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Hide Guide/i }));
    expect(screen.queryByText(/How to load the extension in your browser:/i)).toBeNull();
  });

  it('triggers obsidian sync API when clicked', async () => {
    const showToast = vi.fn();
    render(<IntegrationsTab showToast={showToast} />);

    const syncBtn = screen.getByRole('button', { name: /Sync Vault Now/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(api.syncObsidian).toHaveBeenCalled();
    });
  });

  it('copies bookmarklet code to clipboard and displays toast', () => {
    const showToast = vi.fn();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(),
      },
    });

    render(<IntegrationsTab showToast={showToast} />);

    const copyBtn = screen.getByRole('button', { name: /Copy Bookmarklet Code/i });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('javascript:(function()')
    );
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Bookmarklet code copied'));
  });

  it('triggers obsidian connection test when Test Connection is clicked', async () => {
    const showToast = vi.fn();
    render(<IntegrationsTab showToast={showToast} />);

    const testBtn = screen.getByRole('button', { name: /Test Connection/i });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(api.testSinkConnection).toHaveBeenCalledWith('obsidian', expect.any(Object));
    });
  });
});
