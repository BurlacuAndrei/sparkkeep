import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SecurityTab } from './SecurityTab';

describe('SecurityTab Component', () => {
  it('renders open access state when hasAuthToken is false', () => {
    const setAuthToken = vi.fn();
    const setConfirmAuthToken = vi.fn();
    const showToast = vi.fn();

    render(
      <SecurityTab
        authToken=""
        setAuthToken={setAuthToken}
        confirmAuthToken=""
        setConfirmAuthToken={setConfirmAuthToken}
        hasAuthToken={false}
        showToast={showToast}
      />
    );

    expect(screen.getByText('Open Access')).toBeDefined();
    expect(screen.getByPlaceholderText('Create master passphrase...')).toBeDefined();
  });

  it('renders protected state and displays confirmation input when passphrase typed', () => {
    const setAuthToken = vi.fn();
    const setConfirmAuthToken = vi.fn();
    const showToast = vi.fn();

    const { rerender } = render(
      <SecurityTab
        authToken=""
        setAuthToken={setAuthToken}
        confirmAuthToken=""
        setConfirmAuthToken={setConfirmAuthToken}
        hasAuthToken={true}
        showToast={showToast}
      />
    );

    expect(screen.getByText('Passphrase Protected')).toBeDefined();

    // Type a passphrase
    rerender(
      <SecurityTab
        authToken="secret123"
        setAuthToken={setAuthToken}
        confirmAuthToken=""
        setConfirmAuthToken={setConfirmAuthToken}
        hasAuthToken={true}
        showToast={showToast}
      />
    );

    expect(screen.getByLabelText(/Confirm New Passphrase/i)).toBeDefined();
  });

  it('toggles password visibility between password and text', () => {
    const setAuthToken = vi.fn();
    const setConfirmAuthToken = vi.fn();
    const showToast = vi.fn();

    render(
      <SecurityTab
        authToken="secret123"
        setAuthToken={setAuthToken}
        confirmAuthToken=""
        setConfirmAuthToken={setConfirmAuthToken}
        hasAuthToken={true}
        showToast={showToast}
      />
    );

    const input = screen.getByLabelText(/New Master Passphrase/i) as HTMLInputElement;
    expect(input.type).toBe('password');

    const toggleBtn = screen.getByRole('button', { name: /Show passphrase/i });
    fireEvent.click(toggleBtn);
    expect(input.type).toBe('text');

    fireEvent.click(toggleBtn);
    expect(input.type).toBe('password');
  });
});
