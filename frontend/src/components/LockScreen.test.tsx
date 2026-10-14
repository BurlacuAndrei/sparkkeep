import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LockScreen } from './LockScreen';

describe('LockScreen', () => {
  it('renders lock screen heading and input field', () => {
    const onUnlock = vi.fn().mockResolvedValue(true);
    render(<LockScreen onUnlock={onUnlock} />);

    expect(screen.getByRole('main', { name: /Unlock Sparkkeep/i })).toBeDefined();
    expect(screen.getByText('Sparkkeep')).toBeDefined();
    expect(screen.getByText('Workspace Protected')).toBeDefined();
    expect(screen.getByLabelText(/Master Passphrase/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Unlock Workspace/i })).toBeDefined();
  });

  it('toggles password visibility with eye button', () => {
    const onUnlock = vi.fn().mockResolvedValue(true);
    render(<LockScreen onUnlock={onUnlock} />);

    const input = screen.getByLabelText(/Master Passphrase/i) as HTMLInputElement;
    expect(input.type).toBe('password');

    const toggleBtn = screen.getByRole('button', { name: /Show passphrase/i });
    fireEvent.click(toggleBtn);

    expect(input.type).toBe('text');

    const hideBtn = screen.getByRole('button', { name: /Hide passphrase/i });
    fireEvent.click(hideBtn);

    expect(input.type).toBe('password');
  });

  it('calls onUnlock and handles incorrect passphrase error', async () => {
    const onUnlock = vi.fn().mockResolvedValue(false);
    render(<LockScreen onUnlock={onUnlock} />);

    const input = screen.getByLabelText(/Master Passphrase/i);
    fireEvent.change(input, { target: { value: 'wrong_secret' } });

    const submitBtn = screen.getByRole('button', { name: /Unlock Workspace/i });
    fireEvent.click(submitBtn);

    expect(onUnlock).toHaveBeenCalledWith('wrong_secret');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(/Incorrect passphrase/i)).toBeDefined();
    });
  });

  it('calls onUnlock on successful passphrase submission', async () => {
    const onUnlock = vi.fn().mockResolvedValue(true);
    render(<LockScreen onUnlock={onUnlock} />);

    const input = screen.getByLabelText(/Master Passphrase/i);
    fireEvent.change(input, { target: { value: 'correct_master_token' } });

    const submitBtn = screen.getByRole('button', { name: /Unlock Workspace/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onUnlock).toHaveBeenCalledWith('correct_master_token');
    });
  });
});
