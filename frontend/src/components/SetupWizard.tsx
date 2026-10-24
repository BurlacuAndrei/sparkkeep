import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Shield, Cpu, ArrowRight, CheckCircle2, Lock, AlertCircle, Eye, EyeOff, Palette } from 'lucide-react';
import * as api from '../api';
import { ThemeSelector } from './ThemeSelector';
import { LanguageSelector } from './settings/LanguageSelector';
import { useTheme } from '../context/ThemeContext';
import { useLocale } from '../i18n';

// Short names keep the review row compact ("Dark Mode", "System (Light)").
const THEME_SHORT_KEYS = {
  dark: 'shell.setup.review.themeDark',
  light: 'shell.setup.review.themeLight',
  oled: 'shell.setup.review.themeOled',
} as const;

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { theme, resolvedTheme } = useTheme();
  const { t } = useLocale();
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

  const handleLaunchDemo = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await api.submitDemoSetup(authToken.trim() || undefined);
      onComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('shell.setup.demoFailed'));
      setSubmitting(false);
    }
  };

  const handleStep1Next = () => {
    setError(null);
    if (!authToken.trim()) {
      setError(t('shell.setup.auth.required'));
      return;
    }
    if (authToken.length < 6) {
      setError(t('shell.setup.auth.tooShort'));
      return;
    }
    if (authToken !== confirmToken) {
      setError(t('shell.setup.auth.mismatch'));
      return;
    }
    setStep(2);
  };

  const handleStep2Next = () => {
    setError(null);
    if (!llmBase.trim()) {
      setError(t('shell.setup.ai.baseUrlRequired'));
      return;
    }
    if (!llmModel.trim()) {
      setError(t('shell.setup.ai.modelRequired'));
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
          <h1 className="setup-title">{t('shell.setup.title')}</h1>
          <p className="setup-subtitle">{t('shell.setup.subtitle')}</p>
        </div>

        {/* Progress Stepper */}
        <div className="setup-stepper">
          <div className={`step-item ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`}>
            <div className="step-circle">{step > 1 ? <CheckCircle2 size={16} /> : '1'}</div>
            <span className="step-label">{t('shell.setup.stepLookAuth')}</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step >= 2 ? 'active' : ''} ${step > 2 ? 'done' : ''}`}>
            <div className="step-circle">{step > 2 ? <CheckCircle2 size={16} /> : '2'}</div>
            <span className="step-label">{t('shell.setup.stepAiEngine')}</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step >= 3 ? 'active' : ''} ${step > 3 ? 'done' : ''}`}>
            <div className="step-circle">{step > 3 ? <CheckCircle2 size={16} /> : '3'}</div>
            <span className="step-label">{t('shell.setup.stepIntegrations')}</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step === 4 ? 'active' : ''}`}>
            <div className="step-circle">4</div>
            <span className="step-label">{t('shell.setup.stepLaunch')}</span>
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
            {/* Interface language, applied immediately */}
            <LanguageSelector />

            {/* Visual Appearance & Theme Selection */}
            <div className="setup-section-intro">
              <Palette className="section-icon" size={20} />
              <div>
                <h3>{t('shell.setup.visual.title')}</h3>
                <p>{t('shell.setup.visual.desc')}</p>
              </div>
            </div>

            <ThemeSelector />

            <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '4px 0 8px 0' }} />

            <div className="demo-mode-callout" style={{
              background: 'rgba(168, 85, 247, 0.08)',
              border: '1px solid rgba(168, 85, 247, 0.25)',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={14} /> {t('shell.setup.demo.title')}
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                  {t('shell.setup.demo.desc')}
                </div>
              </div>
              <button
                type="button"
                id="setup-launch-demo"
                onClick={handleLaunchDemo}
                disabled={submitting}
                style={{
                  background: 'linear-gradient(135deg, #9333ea, #7928ca)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '7px 12px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {submitting ? t('shell.setup.demo.launching') : t('shell.setup.demo.launch')}
              </button>
            </div>

            <div className="setup-section-intro">
              <Shield className="section-icon" size={20} />
              <div>
                <h3>{t('shell.setup.auth.title')}</h3>
                <p>{t('shell.setup.auth.desc')}</p>
              </div>
            </div>

            <div className="setup-form-group">
              <label htmlFor="auth-token-input">{t('shell.setup.auth.passphraseLabel')}</label>
              <div className="setup-input-wrapper">
                <input
                  id="auth-token-input"
                  type={showToken ? 'text' : 'password'}
                  placeholder={t('shell.setup.auth.passphrasePlaceholder')}
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
              <label htmlFor="confirm-token-input">{t('shell.setup.auth.confirmLabel')}</label>
              <input
                id="confirm-token-input"
                type={showToken ? 'text' : 'password'}
                placeholder={t('shell.setup.auth.confirmPlaceholder')}
                value={confirmToken}
                onChange={(e) => setConfirmToken(e.target.value)}
                className="setup-input"
              />
            </div>

            <div className="setup-info-box">
              <Lock size={16} />
              <span>{t('shell.setup.auth.info')}</span>
            </div>

            <div className="setup-actions">
              <div />
              <button type="button" className="setup-btn-primary" onClick={handleStep1Next}>
                {t('common.continue')} <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: BYOK AI Configuration */}
        {step === 2 && (
          <div className="setup-body">
            <div className="demo-mode-callout" style={{
              background: 'rgba(168, 85, 247, 0.08)',
              border: '1px solid rgba(168, 85, 247, 0.25)',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={14} /> {t('shell.setup.demo.skipTitle')}
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                  {t('shell.setup.demo.skipDesc')}
                </div>
              </div>
              <button
                type="button"
                id="setup-launch-demo-step2"
                onClick={handleLaunchDemo}
                disabled={submitting}
                style={{
                  background: 'linear-gradient(135deg, #9333ea, #7928ca)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '7px 12px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {submitting ? t('shell.setup.demo.launching') : t('shell.setup.demo.launch')}
              </button>
            </div>

            <div className="setup-section-intro">
              <Cpu className="section-icon" size={20} />
              <div>
                <h3>{t('shell.setup.ai.title')}</h3>
                <p>{t('shell.setup.ai.desc')}</p>
              </div>
            </div>

            {/* API Base URL */}
            <div className="setup-form-group">
              <label htmlFor="llm-base-input">{t('shell.setup.ai.baseUrlLabel')}</label>
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
              <label htmlFor="llm-model-input">{t('shell.setup.ai.modelLabel')}</label>
              <input
                id="llm-model-input"
                type="text"
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                className="setup-input"
                placeholder={t('shell.setup.ai.modelPlaceholder')}
              />
            </div>

            {/* API Key */}
            <div className="setup-form-group">
              <label htmlFor="llm-key-input">{t('shell.setup.ai.keyLabel')}</label>
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
                {t('common.back')}
              </button>
              <button type="button" className="setup-btn-primary" onClick={handleStep2Next}>
                {t('common.continue')} <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Omnichannel Messengers (Optional) */}
        {step === 3 && (
          <div className="setup-body">
            <div className="setup-section-intro">
              <Sparkles className="section-icon" size={20} />
              <div>
                <h3>{t('shell.setup.channels.title')}</h3>
                <p>{t('shell.setup.channels.desc')}</p>
              </div>
            </div>

            {/* Visual Multi-Channel Selector */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-input, rgba(255,255,255,0.03))',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                    {t('shell.setup.channels.telegram')}
                  </span>
                  <span className={`settings-badge ${tgToken.trim() ? 'success' : 'neutral'}`} style={{ fontSize: '10px', padding: '1px 6px' }}>
                    {tgToken.trim()
                      ? t('shell.setup.channels.telegramTokenEntered')
                      : t('shell.setup.channels.telegramDirect')}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                  {t('shell.setup.channels.telegramDesc')}
                </span>
              </div>

              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-input, rgba(255,255,255,0.03))',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                    {t('shell.setup.channels.webhook')}
                  </span>
                  <span className="settings-badge neutral" style={{ fontSize: '10px', padding: '1px 6px' }}>
                    {t('shell.setup.channels.webhookBadge')}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                  {t('shell.setup.channels.webhookDesc')}
                </span>
              </div>

              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-input, rgba(255,255,255,0.03))',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                    {t('shell.setup.channels.discord')}
                  </span>
                  <span className="settings-badge neutral" style={{ fontSize: '10px', padding: '1px 6px' }}>
                    {t('shell.setup.channels.discordBadge')}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                  {t('shell.setup.channels.discordDesc')}
                </span>
              </div>

              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-input, rgba(255,255,255,0.03))',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                    {t('shell.setup.channels.later')}
                  </span>
                  <span className="settings-badge success" style={{ fontSize: '10px', padding: '1px 6px' }}>
                    {t('shell.setup.channels.laterBadge')}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                  {t('shell.setup.channels.laterDesc')}
                </span>
              </div>
            </div>

            {/* Telegram Bot Input */}
            <div className="setup-form-group">
              <label htmlFor="tg-token-input">{t('shell.setup.channels.tokenLabel')}</label>
              <input
                id="tg-token-input"
                type="password"
                value={tgToken}
                onChange={(e) => setTgToken(e.target.value)}
                className="setup-input"
                placeholder={t('shell.setup.channels.tokenPlaceholder')}
              />
              <span className="setup-hint">
                {t('shell.setup.channels.tokenHintBefore')}{' '}
                <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" style={{color: 'var(--accent)'}}>@BotFather</a>
                {t('shell.setup.channels.tokenHintAfter')}
              </span>
            </div>

            <div className="setup-actions">
              <button type="button" className="setup-btn-secondary" onClick={() => setStep(2)}>
                {t('common.back')}
              </button>
              <button type="button" className="setup-btn-primary" onClick={handleStep3Next}>
                {tgToken.trim()
                  ? t('shell.setup.channels.continueWithTelegram')
                  : t('shell.setup.channels.skipContinue')}{' '}
                <ArrowRight size={16} />
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
                <h3>{t('shell.setup.review.title')}</h3>
                <p>{t('shell.setup.review.desc')}</p>
              </div>
            </div>

            <div className="setup-summary-card">
              <div className="summary-row">
                <span className="summary-key">{t('shell.setup.review.theme')}</span>
                <span className="summary-value">
                  {theme === 'system'
                    ? t('shell.setup.review.themeSystem', {
                        theme: t(THEME_SHORT_KEYS[resolvedTheme]),
                      })
                    : t('shell.setup.review.themeMode', {
                        theme: t(THEME_SHORT_KEYS[theme]),
                      })}
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-key">{t('shell.setup.review.protection')}</span>
                <span className="summary-value badge-success">{t('shell.setup.review.protectionValue')}</span>
              </div>
              <div className="summary-row">
                <span className="summary-key">{t('shell.setup.review.baseUrl')}</span>
                <span className="summary-value code">{llmBase}</span>
              </div>
              <div className="summary-row">
                <span className="summary-key">{t('shell.setup.review.model')}</span>
                <span className="summary-value code">{llmModel}</span>
              </div>
              <div className="summary-row">
                <span className="summary-key">{t('shell.setup.review.apiKey')}</span>
                <span className="summary-value">{llmKey ? t('common.yes') : t('common.no')}</span>
              </div>
              <div className="summary-row">
                <span className="summary-key">{t('shell.setup.review.telegram')}</span>
                <span className="summary-value">
                  {tgToken ? t('shell.setup.review.configured') : t('shell.setup.review.skipped')}
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-key">{t('shell.setup.review.storage')}</span>
                <span className="summary-value">{t('shell.setup.review.storageValue')}</span>
              </div>
            </div>

            <div className="setup-actions">
              <button
                type="button"
                className="setup-btn-secondary"
                disabled={submitting}
                onClick={() => setStep(3)}
              >
                {t('common.back')}
              </button>
              <button
                type="button"
                className="setup-btn-primary success"
                disabled={submitting}
                onClick={handleFinish}
              >
                {submitting
                  ? t('shell.setup.review.initializing')
                  : t('shell.setup.review.complete')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
