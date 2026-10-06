import React, { useState } from 'react';
import { Sparkles, Shield, Cpu, ArrowRight, CheckCircle2, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import * as api from '../api';

interface SetupWizardProps {
  onComplete: () => void;
}

type ProviderPreset = 'openai' | 'ollama' | 'deepseek' | 'custom';

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [authToken, setAuthToken] = useState('');
  const [confirmToken, setConfirmToken] = useState('');
  const [showToken, setShowToken] = useState(false);

  const [provider, setProvider] = useState<ProviderPreset>('openai');
  const [llmBase, setLlmBase] = useState('https://api.openai.com/v1');
  const [llmKey, setLlmKey] = useState('');
  const [llmModel, setLlmModel] = useState('gpt-4o-mini');
  const [showLlmKey, setShowLlmKey] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const applyPreset = (preset: ProviderPreset) => {
    setProvider(preset);
    setError(null);
    switch (preset) {
      case 'openai':
        setLlmBase('https://api.openai.com/v1');
        setLlmModel('gpt-4o-mini');
        break;
      case 'ollama':
        setLlmBase('http://localhost:11434/v1');
        setLlmModel('llama3.2');
        setLlmKey('');
        break;
      case 'deepseek':
        setLlmBase('https://api.deepseek.com/v1');
        setLlmModel('deepseek-chat');
        break;
      case 'custom':
        break;
    }
  };

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
    if (provider !== 'ollama' && !llmKey.trim()) {
      setError('An API Key is required for cloud AI providers.');
      return;
    }
    setStep(3);
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
      });
      onComplete();
    } catch (err: unknown) {
      setError(api.getErrorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="setup-wizard-backdrop">
      <div className="setup-wizard-card">
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
            <span className="step-label">Security</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step >= 2 ? 'active' : ''} ${step > 2 ? 'done' : ''}`}>
            <div className="step-circle">{step > 2 ? <CheckCircle2 size={16} /> : '2'}</div>
            <span className="step-label">AI Engine</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step === 3 ? 'active' : ''}`}>
            <div className="step-circle">3</div>
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
                <p>Plug in your own API key. You maintain 100% control over costs and models.</p>
              </div>
            </div>

            {/* Presets */}
            <div className="setup-presets-label">Choose Provider</div>
            <div className="setup-presets-grid">
              <button
                type="button"
                className={`preset-card ${provider === 'openai' ? 'active' : ''}`}
                onClick={() => applyPreset('openai')}
              >
                <div className="preset-title">OpenAI</div>
                <div className="preset-desc">GPT-4o mini, GPT-4o</div>
              </button>
              <button
                type="button"
                className={`preset-card ${provider === 'deepseek' ? 'active' : ''}`}
                onClick={() => applyPreset('deepseek')}
              >
                <div className="preset-title">DeepSeek</div>
                <div className="preset-desc">DeepSeek-V3 / Chat</div>
              </button>
              <button
                type="button"
                className={`preset-card ${provider === 'ollama' ? 'active' : ''}`}
                onClick={() => applyPreset('ollama')}
              >
                <div className="preset-title">Local Ollama</div>
                <div className="preset-desc">Offline & Private</div>
              </button>
              <button
                type="button"
                className={`preset-card ${provider === 'custom' ? 'active' : ''}`}
                onClick={() => applyPreset('custom')}
              >
                <div className="preset-title">Custom</div>
                <div className="preset-desc">Any OpenAI-compat API</div>
              </button>
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

            {/* API Key (Optional for Ollama) */}
            {provider !== 'ollama' && (
              <div className="setup-form-group">
                <label htmlFor="llm-key-input">API Key</label>
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
            )}

            {/* Model Name */}
            <div className="setup-form-group">
              <label htmlFor="llm-model-input">Model Name</label>
              <input
                id="llm-model-input"
                type="text"
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                className="setup-input"
                placeholder="e.g. gpt-4o-mini or llama3.2"
              />
            </div>

            <div className="setup-actions">
              <button type="button" className="setup-btn-secondary" onClick={() => setStep(1)}>
                Back
              </button>
              <button type="button" className="setup-btn-primary" onClick={handleStep2Next}>
                Review & Launch <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Finish */}
        {step === 3 && (
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
                <span className="summary-key">Access Protection</span>
                <span className="summary-value badge-success">Enabled (Custom Passphrase)</span>
              </div>
              <div className="summary-row">
                <span className="summary-key">AI Provider</span>
                <span className="summary-value">{provider.toUpperCase()}</span>
              </div>
              <div className="summary-row">
                <span className="summary-key">Base URL</span>
                <span className="summary-value code">{llmBase}</span>
              </div>
              <div className="summary-row">
                <span className="summary-key">Selected Model</span>
                <span className="summary-value code">{llmModel || 'Default'}</span>
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
                onClick={() => setStep(2)}
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
    </div>
  );
}
