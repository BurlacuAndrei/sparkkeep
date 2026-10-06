import React from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { useTheme, Theme } from '../context/ThemeContext';

export interface ThemeSelectorProps {
  className?: string;
}

export function ThemeSelector({ className = '' }: ThemeSelectorProps) {
  const { theme, setTheme } = useTheme();

  const options: { id: Theme; label: string; sub: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { id: 'dark', label: 'Dark Mode', sub: 'Deep obsidian slate', icon: Moon },
    { id: 'light', label: 'Light Mode', sub: 'Crisp high-contrast', icon: Sun },
    { id: 'system', label: 'System Default', sub: 'Auto-sync with OS', icon: Monitor },
  ];

  return (
    <div className={`theme-options-grid ${className}`} role="radiogroup" aria-label="Interface theme selector">
      {options.map((opt) => {
        const Icon = opt.icon;
        const isSelected = theme === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={0}
            className={`theme-option-card ${isSelected ? 'active' : ''}`}
            onClick={() => setTheme(opt.id)}
          >
            {isSelected && (
              <div className="theme-check-badge" aria-hidden="true">
                <Check size={12} strokeWidth={3} />
              </div>
            )}
            <div className={`theme-option-preview preview-${opt.id}`} aria-hidden="true">
              <div className="preview-topbar">
                <div className="preview-dot" />
                <div className="preview-dot" />
                <div className="preview-dot" />
              </div>
              <div className="preview-body">
                <div className="preview-sidebar" />
                <div className="preview-canvas">
                  <div className="preview-card" />
                  <div className="preview-card" />
                </div>
              </div>
            </div>
            <div className="theme-option-info">
              <div className="theme-option-title-row">
                <Icon size={14} className="theme-option-icon" />
                <span className="theme-option-label">{opt.label}</span>
              </div>
              <span className="theme-option-sub">{opt.sub}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
