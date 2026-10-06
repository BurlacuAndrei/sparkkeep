import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, AlertCircle, EyeOff, Eye } from 'lucide-react';
import * as api from '../api';

export function SettingsModal({ onClose, showToast }: { onClose: () => void, showToast: (msg: string) => void }) {
  const [llmBase, setLlmBase] = useState('');
  const [llmKey, setLlmKey] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [authToken, setAuthToken] = useState('');
  
  const [showLlmKey, setShowLlmKey] = useState(false);
  const [showAuthToken, setShowAuthToken] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSettings().then(res => {
      setLlmBase(res.settings.llm_base || '');
      setLlmModel(res.settings.llm_model || '');
      // keys/tokens aren't returned for security, we only get 'has_llm_key'
      setLoading(false);
    }).catch(err => {
      setError(api.getErrorMessage(err));
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const payload: any = {};
      if (llmBase !== undefined) payload.llm_base = llmBase;
      if (llmModel !== undefined) payload.llm_model = llmModel;
      if (llmKey) payload.llm_key = llmKey;
      if (authToken) payload.auth_token = authToken;

      await api.patchSettings(payload);
      showToast('Settings saved successfully.');
      onClose();
    } catch (err: unknown) {
      setError(api.getErrorMessage(err));
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        width: '100vw', height: '100vh', zIndex: 99999,
        background: 'rgba(5, 7, 12, 0.85)', backdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px', boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        className="license-modal-card"
        style={{ width: '100%', maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="license-modal-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
          <h2 className="license-title">Platform Settings</h2>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="setup-error-box" style={{ margin: '0 24px 16px' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dim)' }}>Loading...</div>
        ) : (
          <div className="license-modal-body" style={{ padding: '0 24px 24px' }}>
            <div className="setup-form-group">
              <label>API Base URL</label>
              <input
                type="text"
                value={llmBase}
                onChange={(e) => setLlmBase(e.target.value)}
                className="setup-input"
                placeholder="https://api.openai.com/v1"
              />
            </div>
            
            <div className="setup-form-group">
              <label>Model Name</label>
              <input
                type="text"
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                className="setup-input"
                placeholder="e.g. gpt-4o or llama3.2"
              />
            </div>

            <div className="setup-form-group">
              <label>API Key (Leave blank to keep current)</label>
              <div className="setup-input-wrapper">
                <input
                  type={showLlmKey ? 'text' : 'password'}
                  value={llmKey}
                  onChange={(e) => setLlmKey(e.target.value)}
                  className="setup-input"
                  placeholder="New API Key..."
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
            
            <div className="setup-form-group">
              <label>Master Passphrase / Token (Leave blank to keep current)</label>
              <div className="setup-input-wrapper">
                <input
                  type={showAuthToken ? 'text' : 'password'}
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  className="setup-input"
                  placeholder="New Passphrase..."
                />
                <button
                  type="button"
                  className="setup-eye-btn"
                  onClick={() => setShowAuthToken(!showAuthToken)}
                  tabIndex={-1}
                >
                  {showAuthToken ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button type="button" className="setup-btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="setup-btn-primary"
                onClick={handleSave}
                disabled={submitting}
              >
                <Save size={16} />
                <span>{submitting ? 'Saving...' : 'Save Settings'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
