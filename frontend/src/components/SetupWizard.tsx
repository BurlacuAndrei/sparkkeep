import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Shield, Cpu, ArrowRight, CheckCircle2, Lock, AlertCircle, Eye, EyeOff, Palette } from 'lucide-react';
import * as api from '../api';
import { ThemeSelector } from './ThemeSelector';
import { useTheme } from '../context/ThemeContext';

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { theme, resolvedTheme } = useTheme();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [authToken, setAuthToken] = useState('');
  const [confirmToken, setConfirmToken] = useState('');
  const [showToken, setShowToken] = useState(false);

  const [tgToken, setTgToken] = useState('');

  const [llmBase, setLlmBase] = useState('https://api.openai.com/v1');
  const [llmKey, setLlmKey] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [showLlmKey, setShowLlmKey] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleStep1Next = () => {
    setError(null);
    if (!authToken.trim()) {
      setError('Please provide an access passphrase or master token.');
      return;
    }
    if (authToken.length < 6) {
      setError('Access token must be at least 6 characters long.');
      return;
    }
    if (authToken !== confirmToken) {
      setError('Passphrases do not match.');
      return;
    }
    setStep(2);
  };

  const handleStep2Next = () => {
    setError(null);
    if (!llmBase.trim()) {
      setError('LLM API Base URL is required.');
      return;
    }
    if (!llmModel.trim()) {
      setError('Model Name is required.');
      return;
    }
    setStep(3);
  };

  const handleStep3Next = () => {
    setError(null);
    setStep(4);
  };

  const handleFinish = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await api.submitSetup({
        auth_token: authToken.trim(),
        llm_base: llmBase.trim(),
        llm_key: llmKey.trim(),
        llm_model: llmModel.trim(),
        tg_token: tgToken.trim(),
      });
      onComplete();
    } catch (err: unknown) {
      setError(api.getErrorMessage(err));
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="setup-wizard-backdrop"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 99999,
        background: 'rgba(5, 7, 12, 0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="setup-wizard-card"
        style={{
          width: '100%',
          maxWidth: '580px',
          maxHeight: '90vh',
          overflowY: 'auto',
          margin: 'auto',
        }}
      >
        {/* Header */}
        <div className="setup-header">
          <div className="setup-logo-badge">
            <Sparkles className="setup-logo-icon" size={28} />
          </div>
          <h1 className="setup-title">Welcome to Sparkkeep</h1>
          <p className="setup-subtitle">
            Configure your private self-hosted instance in 3 quick steps.
          </p>
        </div>

        {/* Progress Stepper */}
        <div className="setup-stepper">
          <div className={`step-item ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`}>
            <div className="step-circle">{step > 1 ? <CheckCircle2 size={16} /> : '1'}</div>
            <span className="step-label">Look & Auth</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step >= 2 ? 'active' : ''} ${step > 2 ? 'done' : ''}`}>
            <div className="step-circle">{step > 2 ? <CheckCircle2 size={16} /> : '2'}</div>
            <span className="step-label">AI Engine</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step >= 3 ? 'active' : ''} ${step > 3 ? 'done' : ''}`}>
            <div className="step-circle">{step > 3 ? <CheckCircle2 size={16} /> : '3'}</div>
            <span className="step-label">Integrations</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step === 4 ? 'active' : ''}`}>
            <div className="step-circle">4</div>
            <span className="step-label">Launch</span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="setup-error-box">
            <AlertCircle size={18} className="setup-error-icon" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Security & Master Auth */}
        {step === 1 && (
          <div className="setup-body">
            {/* Visual Appearance & Theme Selection */}
            <div className="setup-section-intro">
              <Palette className="section-icon" size={20} />
              <div>
                <h3>Visual Appearance</h3>
                <p>Choose your workspace look. Your preference takes effect immediately.</p>
              </div>
            </div>

            <ThemeSelector />

            <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '4px 0 8px 0' }} />

            <div className="setup-section-intro">
              <Shield className="section-icon" size={20} />
              <div>
                <h3>Master Access Token</h3>
                <p>Create a password or token to protect your dashboard and API.</p>
              </div>
            </div>

            <div className="setup-form-group">
              <label htmlFor="auth-token-input">Master Passphrase / Token</label>
              <div className="setup-input-wrapper">
                <input
                  id="auth-token-input"
                  type={showToken ? 'text' : 'password'}
                  placeholder="Enter a secure passphrase..."
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  className="setup-input"
                  autoFocus
                />
                <button
                  type="button"
                  className="setup-eye-btn"
                  onClick={() => setShowToken(!showToken)}
                  tabIndex={-1}
                >
                  {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="setup-form-group">
              <label htmlFor="confirm-token-input">Confirm Passphrase</label>
              <input
                id="confirm-token-input"
                type={showToken ? 'text' : 'password'}
                placeholder="Re-type your passphrase..."
                value={confirmToken}
                onChange={(e) => setConfirmToken(e.target.value)}
                className="setup-input"
              />
            </div>

            <div className="setup-info-box">
              <Lock size={16} />
              <span>
                This token is stored only in your local SQLite database. All sessions will authenticate against it.
              </span>
            </div>

            <div className="setup-actions">
              <div />
              <button type="button" className="setup-btn-primary" onClick={handleStep1Next}>
                Continue <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: BYOK AI Configuration */}
        {step === 2 && (
          <div className="setup-body">
            <div className="setup-section-intro">
              <Cpu className="section-icon" size={20} />
              <div>
                <h3>AI Model Integration (BYOK)</h3>
                <p>Configure your AI API Base URL, Model Name, and API Key.</p>
              </div>
            </div>

            {/* API Base URL */}
            <div className="setup-form-group">
              <label htmlFor="llm-base-input">API Base URL</label>
              <input
                id="llm-base-input"
                type="text"
                value={llmBase}
                onChange={(e) => setLlmBase(e.target.value)}
                className="setup-input"
                placeholder="https://api.openai.com/v1"
              />
            </div>

            {/* Model Name */}
            <div className="setup-form-group">
              <label htmlFor="llm-model-input">Model Name</label>
              <input
                id="llm-model-input"
                type="text"
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                className="setup-input"
                placeholder="e.g. gpt-4o or llama-3.2"
              />
            </div>

            {/* API Key */}
            <div className="setup-form-group">
              <label htmlFor="llm-key-input">API Key (Optional for some local providers)</label>
              <div className="setup-input-wrapper">
                <input
                  id="llm-key-input"
                  type={showLlmKey ? 'text' : 'password'}
                  value={llmKey}
                  onChange={(e) => setLlmKey(e.target.value)}
                  className="setup-input"
                  placeholder="sk-..."
                />
                <button
                  type="button"
                  className="setup-eye-btn"
                  onClick={() => setShowLlmKey(!showLlmKey)}
                  tabIndex={-1}
                >
                  {showLlmKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="setup-actions">
              <button type="button" className="setup-btn-secondary" onClick={() => setStep(1)}>
                Back
              </button>
              <button type="button" className="setup-btn-primary" onClick={handleStep2Next}>
                Continue <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Integrations (Optional) */}
        {step === 3 && (
          <div className="setup-body">
            <div className="setup-section-intro">
              <Sparkles className="section-icon" size={20} />
              <div>
                <h3>Integrations (Optional)</h3>
                <p>Configure Telegram for frictionless capturing on the go.</p>
              </div>
            </div>

            <div className="setup-form-group">
              <label htmlFor="tg-token-input">Telegram Bot Token (Optional)</label>
              <input
                id="tg-token-input"
                type="password"
                value={tgToken}
                onChange={(e) => setTgToken(e.target.value)}
                className="setup-input"
                placeholder="Enter BotFather Token (e.g. 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11)"
              />
              <span className="setup-hint">
                Get this by creating a new bot with <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" style={{color: 'var(--accent)'}}>@BotFather</a> on Telegram. You can always configure this later in Settings.
              </span>
            </div>

            <div className="setup-actions">
              <button type="button" className="setup-btn-secondary" onClick={() => setStep(2)}>
                Back
              </button>
              <button type="button" className="setup-btn-primary" onClick={handleStep3Next}>
                Review & Launch <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Review & Finish */}
        {step === 4 && (
          <div className="setup-body">
            <div className="setup-section-intro">
              <CheckCircle2 className="section-icon success" size={20} />
              <div>
                <h3>Ready to Launch</h3>
                <p>Review your configuration before initializing your database.</p>
              </div>
            </div>

            <div className="setup-summary-card">
              <div className="summary-row">
                <span className="summary-key">Appearance Theme</span>
                <span className="summary-value" style={{ textTransform: 'capitalize' }}>
                  {theme === 'system' ? `System (${resolvedTheme})` : `${theme} Mode`}
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-key">Access Protection</span>
                <span className="summary-value badge-success">Enabled (Custom Passphrase)</span>
              </div>
              <div className="summary-row">
                <span className="summary-key">Base URL</span>
                <span className="summary-value code">{llmBase}</span>
              </div>
              <div className="summary-row">
                <span className="summary-key">Selected Model</span>
                <span className="summary-value code">{llmModel}</span>
              </div>
              <div className="summary-row">
                <span className="summary-key">API Key Provided</span>
                <span className="summary-value">{llmKey ? 'Yes' : 'No'}</span>
              </div>
              <div className="summary-row">
                <span className="summary-key">Telegram Bot</span>
                <span className="summary-value">{tgToken ? 'Configured' : 'Skipped'}</span>
              </div>
              <div className="summary-row">
                <span className="summary-key">Storage Location</span>
                <span className="summary-value">Local SQLite DB (Persistent)</span>
              </div>
            </div>

            <div className="setup-actions">
              <button
                type="button"
                className="setup-btn-secondary"
                disabled={submitting}
                onClick={() => setStep(3)}
              >
                Back
              </button>
              <button
                type="button"
                className="setup-btn-primary success"
                disabled={submitting}
                onClick={handleFinish}
              >
                {submitting ? 'Initializing Sparkkeep...' : 'Complete Setup & Open Dashboard'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
