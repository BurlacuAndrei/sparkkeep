import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SetupWizard } from './SetupWizard';
import { ThemeProvider } from '../context/ThemeContext';
import * as api from '../api';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    submitSetup: vi.fn().mockResolvedValue({ ok: true }),
  };
});

describe('SetupWizard', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  const renderWizard = (onComplete = vi.fn()) => {
    return render(
      <ThemeProvider defaultTheme="dark">
        <SetupWizard onComplete={onComplete} />
      </ThemeProvider>
    );
  };

  it('renders Step 1 with Master Access Token inputs and theme selector', () => {
    renderWizard();

    expect(screen.getByText('Welcome to Sparkkeep')).toBeDefined();
    expect(screen.getByText('Master Access Token')).toBeDefined();
    expect(screen.getByLabelText(/Master Passphrase \/ Token/i)).toBeDefined();
    expect(screen.getByLabelText(/Confirm Passphrase/i)).toBeDefined();
  });

  it('displays error if master token is submitted empty', () => {
    renderWizard();

    const continueBtn = screen.getByRole('button', { name: /Continue/i });
    fireEvent.click(continueBtn);

    expect(screen.getByText('Please provide an access passphrase or master token.')).toBeDefined();
  });

  it('displays error if passphrase is shorter than 6 characters', () => {
    renderWizard();

    const passInput = screen.getByLabelText(/Master Passphrase \/ Token/i);
    const confirmInput = screen.getByLabelText(/Confirm Passphrase/i);
    const continueBtn = screen.getByRole('button', { name: /Continue/i });

    fireEvent.change(passInput, { target: { value: '12345' } });
    fireEvent.change(confirmInput, { target: { value: '12345' } });
    fireEvent.click(continueBtn);

    expect(screen.getByText('Access token must be at least 6 characters long.')).toBeDefined();
  });

  it('displays error if passphrases do not match', () => {
    renderWizard();

    const passInput = screen.getByLabelText(/Master Passphrase \/ Token/i);
    const confirmInput = screen.getByLabelText(/Confirm Passphrase/i);
    const continueBtn = screen.getByRole('button', { name: /Continue/i });

    fireEvent.change(passInput, { target: { value: 'supersecret' } });
    fireEvent.change(confirmInput, { target: { value: 'mismatch' } });
    fireEvent.click(continueBtn);

    expect(screen.getByText('Passphrases do not match.')).toBeDefined();
  });

  it('completes the full 4-step onboarding wizard and submits configuration', async () => {
    const onComplete = vi.fn();
    renderWizard(onComplete);

    // Step 1: Security
    fireEvent.change(screen.getByLabelText(/Master Passphrase \/ Token/i), {
      target: { value: 'securepass123' },
    });
    fireEvent.change(screen.getByLabelText(/Confirm Passphrase/i), {
      target: { value: 'securepass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    // Step 2: AI Engine
    expect(screen.getByText('AI Model Integration (BYOK)')).toBeDefined();
    const modelInput = screen.getByLabelText(/Model Name/i);
    fireEvent.change(modelInput, { target: { value: 'llama3:8b' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    // Step 3: Integrations (Optional)
    expect(screen.getByText('Capture Channels & Messengers (Optional)')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Skip & Continue/i }));

    // Step 4: Launch
    expect(screen.getByText('Ready to Launch')).toBeDefined();
    const launchBtn = screen.getByRole('button', { name: /Complete Setup & Open Dashboard/i });
    fireEvent.click(launchBtn);

    await waitFor(() => {
      expect(api.submitSetup).toHaveBeenCalledWith({
        auth_token: 'securepass123',
        llm_base: 'https://api.openai.com/v1',
        llm_key: '',
        llm_model: 'llama3:8b',
        tg_token: '',
      });
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });
});
