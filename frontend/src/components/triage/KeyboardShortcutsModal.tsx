import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Keyboard, Compass, Sparkles, Navigation } from 'lucide-react';
import { useLocale } from '../../i18n';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  label: string;
  description: string;
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps): React.ReactPortal | null {
  const { t } = useLocale();

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const decisionShortcuts: ShortcutItem[] = [
    { keys: ['1'], label: t('cards.shortcuts.nowLabel'), description: t('cards.shortcuts.nowDesc') },
    { keys: ['2'], label: t('cards.shortcuts.nextLabel'), description: t('cards.shortcuts.nextDesc') },
    { keys: ['3'], label: t('cards.shortcuts.laterLabel'), description: t('cards.shortcuts.laterDesc') },
    { keys: ['→', 'Enter'], label: t('cards.shortcuts.acceptAiLabel'), description: t('cards.shortcuts.acceptAiDesc') },
    { keys: ['←', 'Esc', 'x'], label: t('cards.shortcuts.dismissLabel'), description: t('cards.shortcuts.dismissDesc') },
  ];

  const investigationShortcuts: ShortcutItem[] = [
    { keys: ['↑', 'r'], label: t('cards.shortcuts.researchLabel'), description: t('cards.shortcuts.researchDesc') },
    { keys: ['↓', 's'], label: t('cards.shortcuts.skipLabel'), description: t('cards.shortcuts.skipDesc') },
    { keys: ['Space'], label: t('cards.shortcuts.toggleBriefLabel'), description: t('cards.shortcuts.toggleBriefDesc') },
    { keys: ['0', 'o'], label: t('cards.shortcuts.openDossierLabel'), description: t('cards.shortcuts.openDossierDesc') },
  ];

  const globalShortcuts: ShortcutItem[] = [
    { keys: ['z'], label: t('cards.shortcuts.undoLabel'), description: t('cards.shortcuts.undoDesc') },
    { keys: ['?'], label: t('cards.shortcuts.cheatsheetLabel'), description: t('cards.shortcuts.cheatsheetDesc') },
    { keys: ['⌘', 'K'], label: t('cards.shortcuts.searchLabel'), description: t('cards.shortcuts.searchDesc') },
  ];

  return createPortal(
    <div className="shortcuts-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
      <div className="shortcuts-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-modal-header">
          <div className="shortcuts-header-title">
            <Keyboard size={18} className="shortcuts-header-icon" />
            <h3 id="shortcuts-title">{t('cards.shortcuts.title')}</h3>
          </div>
          <button type="button" className="shortcuts-close-btn" onClick={onClose} aria-label={t('cards.shortcuts.closeAria')}>
            <X size={16} />
          </button>
        </div>

        <div className="shortcuts-modal-body">
          <div className="shortcuts-section">
            <div className="shortcuts-section-title">
              <Compass size={14} />
              <span>{t('cards.shortcuts.horizons')}</span>
            </div>
            <div className="shortcuts-grid">
              {decisionShortcuts.map((s, idx) => (
                <div key={idx} className="shortcut-row">
                  <div className="shortcut-keys">
                    {s.keys.map((k, kIdx) => (
                      <kbd key={kIdx} className="shortcut-kbd">{k}</kbd>
                    ))}
                  </div>
                  <div className="shortcut-info">
                    <span className="shortcut-label">{s.label}</span>
                    <span className="shortcut-desc">{s.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="shortcuts-section">
            <div className="shortcuts-section-title">
              <Sparkles size={14} />
              <span>{t('cards.shortcuts.investigation')}</span>
            </div>
            <div className="shortcuts-grid">
              {investigationShortcuts.map((s, idx) => (
                <div key={idx} className="shortcut-row">
                  <div className="shortcut-keys">
                    {s.keys.map((k, kIdx) => (
                      <kbd key={kIdx} className="shortcut-kbd">{k}</kbd>
                    ))}
                  </div>
                  <div className="shortcut-info">
                    <span className="shortcut-label">{s.label}</span>
                    <span className="shortcut-desc">{s.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="shortcuts-section">
            <div className="shortcuts-section-title">
              <Navigation size={14} />
              <span>{t('cards.shortcuts.global')}</span>
            </div>
            <div className="shortcuts-grid">
              {globalShortcuts.map((s, idx) => (
                <div key={idx} className="shortcut-row">
                  <div className="shortcut-keys">
                    {s.keys.map((k, kIdx) => (
                      <kbd key={kIdx} className="shortcut-kbd">{k}</kbd>
                    ))}
                  </div>
                  <div className="shortcut-info">
                    <span className="shortcut-label">{s.label}</span>
                    <span className="shortcut-desc">{s.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="shortcuts-modal-footer">
          <span>{t('cards.shortcuts.tip')}</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
