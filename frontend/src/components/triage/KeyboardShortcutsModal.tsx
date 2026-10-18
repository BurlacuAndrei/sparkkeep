import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Keyboard, Compass, Sparkles, Navigation } from 'lucide-react';

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
    { keys: ['1'], label: 'Now', description: 'Route to Short-term horizon' },
    { keys: ['2'], label: 'Next', description: 'Route to Medium-term horizon' },
    { keys: ['3'], label: 'Later', description: 'Route to Long-term horizon' },
    { keys: ['→', 'Enter'], label: 'Accept AI', description: 'Keep suggested horizon & commit' },
    { keys: ['←', 'Esc', 'x'], label: 'Dismiss', description: 'Engagement bait / not actionable' },
  ];

  const investigationShortcuts: ShortcutItem[] = [
    { keys: ['↑', 'r'], label: 'Research', description: 'Run Deep Research playbook' },
    { keys: ['↓', 's'], label: 'Skip', description: 'Send card to bottom of deck' },
    { keys: ['Space'], label: 'Toggle Brief', description: 'Expand or collapse AI brief' },
    { keys: ['0', 'o'], label: 'Open Dossier', description: 'Open full card modal details' },
  ];

  const globalShortcuts: ShortcutItem[] = [
    { keys: ['z'], label: 'Undo', description: '5-second instant undo last action' },
    { keys: ['?'], label: 'Cheatsheet', description: 'Toggle this shortcuts modal' },
    { keys: ['⌘', 'K'], label: 'Search', description: 'Open global Omnisearch palette' },
  ];

  return createPortal(
    <div className="shortcuts-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
      <div className="shortcuts-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-modal-header">
          <div className="shortcuts-header-title">
            <Keyboard size={18} className="shortcuts-header-icon" />
            <h3 id="shortcuts-title">Triage Deck Keyboard Shortcuts</h3>
          </div>
          <button type="button" className="shortcuts-close-btn" onClick={onClose} aria-label="Close shortcuts">
            <X size={16} />
          </button>
        </div>

        <div className="shortcuts-modal-body">
          <div className="shortcuts-section">
            <div className="shortcuts-section-title">
              <Compass size={14} />
              <span>Horizon Decisions</span>
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
              <span>Inspection & Investigation</span>
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
              <span>Global & Navigation</span>
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
          <span>Tip: You can use these shortcuts while navigating the Triage Deck without touching your mouse.</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
