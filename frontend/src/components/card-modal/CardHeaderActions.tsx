import React, { useState, useRef, useEffect } from 'react';
import { Card, ResearchItem } from '../../types';
import { getErrorMessage } from '../../api';
import {
  ExternalLink,
  FileText,
  Split,
  Download,
  Trash2,
  ClipboardCopy,
  CheckSquare,
  GitBranch,
  RefreshCw,
  ArrowRight,
  Check,
  RotateCcw,
  Sparkles,
  MoreHorizontal,
} from 'lucide-react';

export interface CardHeaderActionsProps {
  card: Card;
  research?: ResearchItem | null;
  status: string;
  isFailed?: boolean;
  onStatusTransition: (newStatus: string) => void;
  onRetry: (id: number) => void;
  onResearch: (id: number) => void;
  onScrollToResearch?: () => void;
  onOpenCapture: () => void;
  onOpenSplit: () => void;
  onCopyMarkdown?: () => Promise<void> | void;
  onDownloadMarkdown?: () => Promise<void> | void;
  onAddToTodoist?: () => Promise<void> | void;
  onSpinOff?: () => Promise<void> | void;
  onDelete?: (id: number) => void;
  onClose: () => void;
  showToast?: (msg: string) => void;
}

export const CardHeaderActions: React.FC<CardHeaderActionsProps> = ({
  card,
  research,
  status,
  isFailed = Boolean(card.analysis_failed || card.title === 'Analysis failed'),
  onStatusTransition,
  onRetry,
  onResearch,
  onScrollToResearch,
  onOpenCapture,
  onOpenSplit,
  onCopyMarkdown,
  onDownloadMarkdown,
  onAddToTodoist,
  onSpinOff,
  onDelete,
  onClose,
  showToast,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Outside click to close menu
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const fetchMarkdown = async () => {
    const res = await fetch(`/api/v1/cards/${card.id}/export.md`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };

  const handleCopyMarkdown = async () => {
    if (onCopyMarkdown) {
      await onCopyMarkdown();
      return;
    }
    try {
      const md = await fetchMarkdown();
      await navigator.clipboard.writeText(md);
      showToast?.('Markdown copied to clipboard');
    } catch (err: unknown) {
      showToast?.(getErrorMessage(err));
    }
  };

  const handleDownloadMarkdown = async () => {
    if (onDownloadMarkdown) {
      await onDownloadMarkdown();
      return;
    }
    try {
      const md = await fetchMarkdown();
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spark-${card.id}.md`;
      a.click();
      URL.revokeObjectURL(url);
      showToast?.('Markdown downloaded');
    } catch (err: unknown) {
      showToast?.(getErrorMessage(err));
    }
  };

  const handleAddToTodoist = async () => {
    if (onAddToTodoist) {
      await onAddToTodoist();
      return;
    }
    try {
      const md = await fetchMarkdown();
      const q = new URLSearchParams({ text: card.title, description: md });
      window.open(`https://todoist.com/showTask?${q.toString()}`, '_blank', 'noopener');
      showToast?.('Opening Todoist with this spark...');
    } catch (err: unknown) {
      showToast?.(getErrorMessage(err));
    }
  };

  const handleDelete = () => {
    if (!onDelete) return;
    if (window.confirm(`Delete card #${card.id} permanently?`)) {
      onDelete(card.id);
      onClose();
    }
  };

  return (
    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
      {/* 1. Source Link (if source url present) */}
      {card.source_url && (
        <a
          href={card.source_url}
          target="_blank"
          rel="noreferrer"
          className="icon-btn"
          title="Open original source"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <ExternalLink size={13} />
        </a>
      )}

      {/* 2. Capture Inspector Toggle */}
      <button
        type="button"
        className="icon-btn"
        onClick={onOpenCapture}
        title="View captured content inspector"
      >
        <FileText size={13} />
      </button>

      {/* 3. Split Card Toggle */}
      <button
        type="button"
        className="icon-btn"
        onClick={onOpenSplit}
        title="Split card into two"
      >
        <Split size={13} />
      </button>

      {/* 4. Markdown Download */}
      <button
        type="button"
        className="icon-btn"
        onClick={handleDownloadMarkdown}
        title="Download Markdown (.md)"
      >
        <Download size={13} />
      </button>

      {/* 5. Delete Button */}
      {onDelete && (
        <button
          type="button"
          className="icon-btn danger"
          onClick={handleDelete}
          title="Delete card"
        >
          <Trash2 size={13} />
        </button>
      )}

      {/* Primary Stage Action */}
      {isFailed ? (
        <button
          type="button"
          className="card-primary-action-btn retry"
          onClick={() => onRetry(card.id)}
        >
          <RefreshCw size={12} />
          <span>Retry Extraction</span>
        </button>
      ) : status === 'inbox' ? (
        <button
          type="button"
          className="card-primary-action-btn commit"
          onClick={() => onStatusTransition('to-do')}
        >
          <ArrowRight size={12} />
          <span>Commit → To Do</span>
        </button>
      ) : status === 'review' ? (
        <button
          type="button"
          className="card-primary-action-btn accept"
          onClick={() => onStatusTransition('to-do')}
        >
          <Check size={12} />
          <span>Accept → To Do</span>
        </button>
      ) : status === 'to-do' ? (
        <button
          type="button"
          className="card-primary-action-btn start"
          onClick={() => onStatusTransition('in-progress')}
        >
          <ArrowRight size={12} />
          <span>Start Working</span>
        </button>
      ) : status === 'in-progress' ? (
        <button
          type="button"
          className="card-primary-action-btn done"
          onClick={() => onStatusTransition('done')}
        >
          <Check size={12} />
          <span>Mark Completed</span>
        </button>
      ) : status === 'shelved' || status === 'dismissed' ? (
        <button
          type="button"
          className="card-primary-action-btn restore"
          onClick={() => onStatusTransition('inbox')}
        >
          <RotateCcw size={12} />
          <span>Restore</span>
        </button>
      ) : null}

      {/* Research CTA / Scroll Jump */}
      <button
        type="button"
        className="btn-secondary"
        onClick={() => {
          if (research && onScrollToResearch) {
            onScrollToResearch();
          } else {
            onResearch(card.id);
          }
        }}
        title={research ? 'Jump to Deep Research findings' : 'Run autonomous deep research'}
        style={{ padding: '4px 10px', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }}
      >
        <Sparkles size={13} color="#c084fc" />
        <span>{research ? 'Deep Research' : 'Research'}</span>
      </button>

      {/* Overflow Menu ⋯ */}
      <div style={{ position: 'relative' }} ref={menuRef}>
        <button
          type="button"
          className={`icon-btn ${menuOpen ? 'active' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          title="More actions"
        >
          <MoreHorizontal size={14} />
        </button>

        {menuOpen && (
          <div className="card-context-menu" style={{ right: 0, top: '100%', bottom: 'auto', marginTop: 4 }}>
            <button
              type="button"
              className="card-context-item"
              onClick={() => {
                setMenuOpen(false);
                handleCopyMarkdown();
              }}
            >
              <ClipboardCopy size={13} color="#34d399" />
              <span>Copy Markdown</span>
            </button>

            <button
              type="button"
              className="card-context-item"
              onClick={() => {
                setMenuOpen(false);
                handleDownloadMarkdown();
              }}
            >
              <Download size={13} color="#38bdf8" />
              <span>Download Markdown</span>
            </button>

            <button
              type="button"
              className="card-context-item"
              onClick={() => {
                setMenuOpen(false);
                handleAddToTodoist();
              }}
            >
              <CheckSquare size={13} color="#e879f9" />
              <span>Add to Todoist</span>
            </button>

            <div className="card-context-divider" />

            <button
              type="button"
              className="card-context-item"
              onClick={() => {
                setMenuOpen(false);
                onOpenSplit();
              }}
            >
              <Split size={13} color="#38bdf8" />
              <span>Split into Two Cards</span>
            </button>

            {onSpinOff && (
              <button
                type="button"
                className="card-context-item"
                onClick={() => {
                  setMenuOpen(false);
                  onSpinOff();
                }}
              >
                <GitBranch size={13} color="#a78bfa" />
                <span>Spin off Child Card</span>
              </button>
            )}

            {isFailed && (
              <button
                type="button"
                className="card-context-item"
                onClick={() => {
                  setMenuOpen(false);
                  onRetry(card.id);
                }}
              >
                <RefreshCw size={13} color="#fbbf24" />
                <span>Retry Extraction</span>
              </button>
            )}

            <div className="card-context-divider" />

            {onDelete && (
              <button
                type="button"
                className="card-context-item danger"
                onClick={() => {
                  setMenuOpen(false);
                  handleDelete();
                }}
              >
                <Trash2 size={13} color="#fb7185" />
                <span>Delete Card</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
