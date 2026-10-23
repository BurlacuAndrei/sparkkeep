import React, { useState, useRef, useEffect } from 'react';
import { Card } from '../types';
import {
  X,
  Sparkles,
  Link,
  Lightbulb,
  Paperclip,
  ChevronDown,
  ChevronUp,
  FileText,
  AlertCircle,
  CornerDownLeft,
} from 'lucide-react';
import { CustomSelect } from './CustomSelect';
import { cardHorizonOptions, cardStatusOptions } from './selectOptions';
import { CaptureParams } from '../api';
import { useLocale } from '../i18n';

interface NewCardModalProps {
  onClose: () => void;
  onCapture?: (params: CaptureParams) => Promise<number[] | null>;
  onCreate?: (card: Partial<Card>) => void | Promise<void>;
}

export const NewCardModal: React.FC<NewCardModalProps> = ({ onClose, onCapture, onCreate }) => {
  const { t } = useLocale();
  // Smart Capture state
  const [sourceInput, setSourceInput] = useState('');
  const [contextInput, setContextInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Manual fallback toggle
  const [isManualExpanded, setIsManualExpanded] = useState(false);

  // Manual fields
  const [manualTitle, setManualTitle] = useState('');
  const [manualSummary, setManualSummary] = useState('');
  const [manualHorizon, setManualHorizon] = useState<'short-term' | 'medium-term' | 'long-term'>('short-term');
  const [manualStatus, setManualStatus] = useState('inbox');
  const [manualSourceURL, setManualSourceURL] = useState('');
  const [manualTags, setManualTags] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    sourceInputRef.current?.focus();
  }, []);

  // Keyboard shortcut: Escape to close, Cmd+Enter to submit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isSubmitting]);

  const isUrl = /^https?:\/\//i.test(sourceInput.trim());
  const hasValidInput = sourceInput.trim().length > 0 || file !== null;

  // Handle Smart Capture (Telegram parity)
  const handleSmartCapture = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!hasValidInput || isSubmitting) return;

    if (!onCapture) {
      // Fallback if onCapture not provided
      handleManualSubmit(e);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const trimmed = sourceInput.trim();
      const params: CaptureParams = {
        file,
        caption: contextInput.trim() || undefined,
      };

      if (isUrl) {
        params.url = trimmed;
      } else if (trimmed) {
        params.text = trimmed;
      }

      await onCapture(params);
      onClose();
    } catch (err: unknown) {
      setIsSubmitting(false);
      setErrorMessage(err instanceof Error ? err.message : t('cards.newCard.captureFailed'));
    }
  };

  // Handle manual form submission
  const handleManualSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!onCreate) return;

    const titleToUse = manualTitle.trim() || (isUrl ? '' : sourceInput.trim());
    if (!titleToUse) {
      setErrorMessage(t('cards.newCard.titleRequired'));
      return;
    }

    try {
      await onCreate({
        title: titleToUse,
        summary: manualSummary.trim() || contextInput.trim(),
        executive_summary: manualSummary.trim() || contextInput.trim(),
        horizon: manualHorizon,
        status: manualStatus as any,
        source_url: manualSourceURL.trim() || (isUrl ? sourceInput.trim() : ''),
        tags: manualTags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : t('cards.newCard.saveFailed'));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  // Sync manual inputs when toggling accordion
  const handleToggleManual = () => {
    if (!isManualExpanded) {
      if (isUrl) {
        setManualSourceURL((prev) => prev || sourceInput.trim());
      } else {
        setManualTitle((prev) => prev || sourceInput.trim());
      }
      setManualSummary((prev) => prev || contextInput.trim());
    }
    setIsManualExpanded(!isManualExpanded);
  };

  return (
    <div className="modal-overlay" onClick={isSubmitting ? undefined : onClose}>
      <div className="capture-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="capture-header">
          <div className="capture-header-info">
            <div className="capture-title-row">
              <Sparkles size={18} strokeWidth={2} color="#818cf8" />
              <h2 className="capture-title">{t('cards.newCard.title')}</h2>
            </div>
            <p className="capture-subtitle">
              {t('cards.newCard.subtitle')}
            </p>
          </div>
          <button
            type="button"
            className="close-btn"
            onClick={onClose}
            disabled={isSubmitting}
            id="cancel-new"
            aria-label={t('common.close')}
          >
            <X size={17} strokeWidth={1.5} />
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 8,
              background: 'var(--color-error-bg, rgba(239, 68, 68, 0.12))',
              border: '1px solid var(--color-error-border, rgba(239, 68, 68, 0.3))',
              color: 'var(--color-error-text, #fca5a5)',
              fontSize: 13,
            }}
          >
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{errorMessage}</span>
          </div>
        )}

        {/* Active AI Synthesis State */}
        {isSubmitting ? (
          <div className="capture-synthesis-box">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'rgba(99, 102, 241, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(129, 140, 248, 0.4)',
              }}
            >
              <Sparkles size={22} color="var(--accent-indigo, #6366f1)" className="spin-slow" />
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text-main)' }}>
                {t('cards.newCard.synthesizing')}
              </h4>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-dim)', maxWidth: 380, lineHeight: 1.5 }}>
                {t('cards.newCard.synthesizingBody')}
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              style={{ fontSize: 12, padding: '5px 12px', marginTop: 4 }}
            >
              <span>{t('cards.newCard.runBackground')}</span>
            </button>
          </div>
        ) : (
          /* Smart Capture Hero Form */
          <form id="new-card-form" onSubmit={handleSmartCapture} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="capture-hero-box">
              <div className="capture-input-header">
                <span className="capture-label">{t('cards.newCard.sourceLabel')}</span>
                {sourceInput.trim() && (
                  <span className="capture-detected-badge">
                    {isUrl ? <Link size={11} /> : <Lightbulb size={11} />}
                    <span>{isUrl ? t('cards.newCard.webLink') : t('cards.newCard.fleeting')}</span>
                  </span>
                )}
              </div>

              <textarea
                ref={sourceInputRef}
                name="source_input"
                className="capture-textarea"
                placeholder={t('cards.newCard.sourcePlaceholder')}
                value={sourceInput}
                onChange={(e) => setSourceInput(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSmartCapture();
                  }
                }}
                rows={2}
                required={!file}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="capture-label" style={{ fontSize: 11 }}>{t('cards.newCard.contextLabel')}</span>
                <input
                  name="context_note"
                  className="capture-context-input"
                  placeholder={t('cards.newCard.contextPlaceholder')}
                  value={contextInput}
                  onChange={(e) => setContextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSmartCapture();
                    }
                  }}
                />
              </div>

              <div className="capture-footer-row">
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />

                {file ? (
                  <div className="capture-file-chip">
                    <Paperclip size={12} />
                    <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0 }}
                      aria-label={t('cards.newCard.removeAttachment')}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="capture-attachment-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip size={12} />
                    <span>{t('cards.newCard.attach')}</span>
                  </button>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 11.5 }}>
                  <CornerDownLeft size={12} strokeWidth={1.5} />
                  <span>{t('cards.newCard.captureHint')}</span>
                </div>
              </div>
            </div>

            {/* Manual Accordion Toggle */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
              <button
                type="button"
                className="capture-manual-toggle"
                onClick={handleToggleManual}
              >
                {isManualExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                <span>{isManualExpanded ? t('cards.newCard.hideManual') : t('cards.newCard.showManual')}</span>
              </button>

              {isManualExpanded && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12, padding: '14px', background: 'var(--surface-sunken)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                  <div className="form-group">
                    <label>{t('cards.newCard.cardTitle')}</label>
                    <input
                      className="form-input"
                      placeholder={t('cards.newCard.titlePlaceholder')}
                      value={manualTitle}
                      onChange={(e) => setManualTitle(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>{t('cards.newCard.summary')}</label>
                    <textarea
                      className="form-textarea"
                      rows={2}
                      placeholder={t('cards.newCard.summaryPlaceholder')}
                      value={manualSummary}
                      onChange={(e) => setManualSummary(e.target.value)}
                    />
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label htmlFor="manual-horizon">{t('cards.newCard.horizon')}</label>
                      <CustomSelect
                        id="manual-horizon"
                        name="horizon"
                        value={manualHorizon}
                        onChange={(val) => setManualHorizon(val)}
                        options={cardHorizonOptions(t)}
                        ariaLabel={t('cards.newCard.horizonAria')}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="manual-status">{t('cards.newCard.status')}</label>
                      <CustomSelect
                        id="manual-status"
                        name="status"
                        value={manualStatus}
                        onChange={(val) => setManualStatus(val)}
                        options={cardStatusOptions(t)}
                        ariaLabel={t('cards.newCard.statusAria')}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>{t('cards.newCard.sourceUrl')}</label>
                    <input
                      className="form-input"
                      placeholder="https://..."
                      value={manualSourceURL}
                      onChange={(e) => setManualSourceURL(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>{t('cards.newCard.tags')}</label>
                    <input
                      className="form-input"
                      placeholder={t('cards.newCard.tagsPlaceholder')}
                      value={manualTags}
                      onChange={(e) => setManualTags(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleManualSubmit}
                      disabled={!manualTitle.trim() && !(sourceInput.trim() && !isUrl)}
                    >
                      <FileText size={13} />
                      <span>{t('cards.newCard.createBlank')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <button type="button" className="btn-secondary" onClick={onClose}>
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={!hasValidInput || isSubmitting}
                style={{ padding: '7px 16px', background: '#6366f1' }}
              >
                <Sparkles size={14} />
                <span>{t('cards.newCard.captureSynthesize')}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};