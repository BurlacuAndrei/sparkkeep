import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntegrationsTab } from './IntegrationsTab';
import * as api from '../../api';

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  return {
    ...actual,
    syncObsidian: vi.fn().mockResolvedValue({ written: 12, vault_path: '/vault' }),
    testWebhook: vi.fn().mockResolvedValue({ ok: true, status_code: 200 }),
  };
});

describe('IntegrationsTab Ecosystem Tools', () => {
  it('renders Browser Bookmarklet, iOS Shortcut, Raycast, and MCP sections', () => {
    render(<IntegrationsTab showToast={vi.fn()} />);

    expect(screen.getByText('Browser Bookmarklet')).toBeDefined();
    expect(screen.getByText(/⚡ Save to Sparkkeep/i)).toBeDefined();
    expect(screen.getByText(/Apple iOS Shortcut & Share Sheet/i)).toBeDefined();
    expect(screen.getByText(/Raycast Extension \/ Script Command/i)).toBeDefined();
    expect(screen.getByText(/Model Context Protocol \(MCP\)/i)).toBeDefined();
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
});
