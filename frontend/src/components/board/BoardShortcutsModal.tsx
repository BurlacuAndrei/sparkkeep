import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Keyboard } from 'lucide-react';
import { useLocale } from '../../i18n';

export interface BoardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutRow {
  keys: string[];
  description: string;
}

export const BoardShortcutsModal: React.FC<BoardShortcutsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useLocale();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortcuts: ShortcutRow[] = [
    { keys: ['j', 'k'], description: t('cards.board.shortcutsNav') },
    { keys: ['Space'], description: t('cards.board.shortcutsInspector') },
    { keys: ['o', 'Enter'], description: t('cards.board.shortcutsExpand') },
    { keys: ['[', ']'], description: t('cards.board.shortcutsMove') },
    { keys: ['1', '2', '3'], description: t('cards.board.shortcutsHorizon') },
    { keys: ['f'], description: t('cards.board.shortcutsFocus') },
    { keys: ['?'], description: t('cards.shortcuts.cheatsheetDesc') },
  ];

  return createPortal(
    <div
      className="shortcuts-modal-backdrop board-shortcuts-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="board-shortcuts-title"
    >
      <div
        className="shortcuts-modal-card board-shortcuts-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-modal-header">
          <div className="shortcuts-header-title">
            <Keyboard size={18} className="shortcuts-header-icon" />
            <h3 id="board-shortcuts-title">{t('cards.board.shortcutsTitle')}</h3>
          </div>
          <button
            type="button"
            className="shortcuts-close-btn"
            onClick={onClose}
            aria-label={t('cards.shortcuts.closeAria')}
          >
            <X size={16} />
          </button>
        </div>

        <div className="shortcuts-modal-body">
          <div className="shortcuts-grid">
            {shortcuts.map((s, idx) => (
              <div key={idx} className="shortcut-row">
                <div className="shortcut-keys">
                  {s.keys.map((k, kIdx) => (
                    <kbd key={kIdx} className="shortcut-kbd">
                      {k}
                    </kbd>
                  ))}
                </div>
                <div className="shortcut-info">
                  <span className="shortcut-desc">{s.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
