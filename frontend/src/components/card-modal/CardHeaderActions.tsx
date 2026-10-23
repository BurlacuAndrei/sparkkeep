import React, { useState, useRef, useEffect } from 'react';
import { Card, ResearchItem, Settings } from '../../types';
import { getErrorMessage, exportCardToSink } from '../../api';
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
  FolderSync,
  BookOpen,
  Bookmark,
  Target,
} from 'lucide-react';
import { useLocale } from '../../i18n';

export interface CardHeaderActionsProps {
  card: Card;
  research?: ResearchItem | null;
  settings?: Settings | null;
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
  onExportToObsidian?: (id: number) => Promise<void> | void;
  onSpinOff?: () => Promise<void> | void;
  onDelete?: (id: number) => void;
  onClose: () => void;
  showToast?: (msg: string) => void;
}

export const CardHeaderActions: React.FC<CardHeaderActionsProps> = ({
  card,
  research,
  settings,
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
  onExportToObsidian,
  onSpinOff,
  onDelete,
  onClose,
  showToast,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { t, tp } = useLocale();

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
      showToast?.(t('cards.header.markdownCopied'));
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
      showToast?.(t('cards.header.markdownDownloaded'));
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
      showToast?.(t('cards.header.todoistOpening'));
    } catch (err: unknown) {
      showToast?.(getErrorMessage(err));
    }
  };

  const handleExportToObsidian = async () => {
    if (onExportToObsidian) {
      await onExportToObsidian(card.id);
      return;
    }
    try {
      await exportCardToSink(card.id, 'obsidian');
      showToast?.(t('cards.header.obsidianSent'));
    } catch (err: unknown) {
      showToast?.(getErrorMessage(err));
    }
  };

  const handleOpenInObsidian = async () => {
    try {
      const md = await fetchMarkdown();
      const q = new URLSearchParams({ name: card.title, content: md });
      window.open(`obsidian://new?${q.toString()}`, '_blank', 'noopener');
      showToast?.(t('cards.header.obsidianOpening'));
    } catch (err: unknown) {
      showToast?.(getErrorMessage(err));
    }
  };

  const handleOpenInLogseq = async () => {
    try {
      const md = await fetchMarkdown();
      const q = new URLSearchParams({ title: card.title, content: md });
      window.open(`logseq://x-callback-url/quickCapture?${q.toString()}`, '_blank', 'noopener');
      showToast?.(t('cards.header.logseqOpening'));
    } catch (err: unknown) {
      showToast?.(getErrorMessage(err));
    }
  };

  const handleOpenInThings = async () => {
    try {
      const md = await fetchMarkdown();
      const q = new URLSearchParams({ title: card.title, notes: md });
      window.open(`things:///add?${q.toString()}`, '_blank', 'noopener');
      showToast?.(t('cards.header.thingsOpening'));
    } catch (err: unknown) {
      showToast?.(getErrorMessage(err));
    }
  };

  const handleOpenInTodoist = async () => {
    try {
      const md = await fetchMarkdown();
      const q = new URLSearchParams({ text: card.title, description: md });
      window.open(`https://todoist.com/showTask?${q.toString()}`, '_blank', 'noopener');
      showToast?.(t('cards.header.todoistOpeningIn'));
    } catch (err: unknown) {
      showToast?.(getErrorMessage(err));
    }
  };

  const handleOpenInGitHub = async () => {
    const repo = settings?.github_repo;
    if (!repo) {
      showToast?.(t('cards.header.githubMissing'));
      return;
    }
    try {
      const md = await fetchMarkdown();
      const q = new URLSearchParams({ title: card.title, body: md });
      window.open(`https://github.com/${repo}/issues/new?${q.toString()}`, '_blank', 'noopener');
      showToast?.(t('cards.header.githubOpening'));
    } catch (err: unknown) {
      showToast?.(getErrorMessage(err));
    }
  };

  const handleDelete = () => {
    if (!onDelete) return;
    if (window.confirm(t('cards.header.deleteConfirm', { id: card.id }))) {
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
          title={t('cards.header.openSourceTitle')}
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
        title={t('cards.header.captureTitle')}
      >
        <FileText size={13} />
      </button>

      {/* 3. Split Card Toggle */}
      <button
        type="button"
        className="icon-btn"
        onClick={onOpenSplit}
        title={t('cards.header.splitTitle')}
      >
        <Split size={13} />
      </button>

      {/* 4. Markdown Download */}
      <button
        type="button"
        className="icon-btn"
        onClick={handleDownloadMarkdown}
        title={t('cards.header.downloadTitle')}
      >
        <Download size={13} />
      </button>

      {/* 5. Delete Button */}
      {onDelete && (
        <button
          type="button"
          className="icon-btn danger"
          onClick={handleDelete}
          title={t('cards.header.deleteTitle')}
        >
          <Trash2 size={13} />
        </button>
      )}

      {/* Synthesize Brief (for unbriefed cards) */}
      {!isFailed && !card.tldr && (!card.claims || card.claims.length === 0) && (
        <button
          type="button"
          className="card-primary-action-btn synthesize"
          onClick={() => onRetry(card.id)}
          title={t('cards.header.synthesizeTitle')}
        >
          <Sparkles size={12} />
          <span>{t('cards.header.synthesize')}</span>
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
          <span>{t('cards.header.retryExtraction')}</span>
        </button>
      ) : status === 'inbox' ? (
        <button
          type="button"
          className="card-primary-action-btn commit"
          onClick={() => onStatusTransition('to-do')}
        >
          <ArrowRight size={12} />
          <span>{t('cards.header.commitTodo')}</span>
        </button>
      ) : status === 'review' ? (
        <button
          type="button"
          className="card-primary-action-btn accept"
          onClick={() => onStatusTransition('to-do')}
        >
          <Check size={12} />
          <span>{t('cards.header.acceptTodo')}</span>
        </button>
      ) : status === 'to-do' ? (
        <button
          type="button"
          className="card-primary-action-btn start"
          onClick={() => onStatusTransition('in-progress')}
        >
          <ArrowRight size={12} />
          <span>{t('cards.header.startWorking')}</span>
        </button>
      ) : status === 'in-progress' ? (
        <button
          type="button"
          className="card-primary-action-btn done"
          onClick={() => onStatusTransition('done')}
        >
          <Check size={12} />
          <span>{t('cards.header.markCompleted')}</span>
        </button>
      ) : status === 'shelved' || status === 'dismissed' ? (
        <button
          type="button"
          className="card-primary-action-btn restore"
          onClick={() => onStatusTransition('inbox')}
        >
          <RotateCcw size={12} />
          <span>{t('cards.header.restore')}</span>
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
        title={research ? t('cards.header.researchJump') : t('cards.header.researchRun')}
        style={{ padding: '4px 10px', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }}
      >
        <Sparkles size={13} color="#c084fc" />
        <span>{research ? t('cards.header.deepResearch') : t('cards.header.research')}</span>
      </button>

      {/* Overflow Menu ⋯ */}
      <div style={{ position: 'relative' }} ref={menuRef}>
        <button
          type="button"
          className={`icon-btn ${menuOpen ? 'active' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          title={t('cards.header.moreActions')}
          style={{ position: 'relative' }}
        >
          <MoreHorizontal size={14} />
          {(() => {
            if (!settings) return null;
            const sinkCount = [
              settings.obsidian_vault_path,
              (settings.notion_token && settings.notion_database_id),
              ((settings.joplin_token || settings.joplin_email) && settings.joplin_base_url),
            ].filter(Boolean).length;
            if (sinkCount === 0) return null;
            return (
              <span
                style={{
                  position: 'absolute',
                  top: '-2px',
                  right: '-2px',
                  minWidth: '16px',
                  height: '16px',
                  borderRadius: '8px',
                  background: 'var(--accent, #8b5cf6)',
                  color: 'white',
                  fontSize: '10px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 3px',
                  border: '2px solid var(--bg-primary, #0d0d14)',
                }}
                title={tp('cards.header.integrations', sinkCount)}
              >
                {sinkCount}
              </span>
            );
          })()}
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
              <span>{t('cards.header.copyMarkdown')}</span>
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
              <span>{t('cards.header.downloadMarkdown')}</span>
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
              <span>{t('cards.header.addTodoist')}</span>
            </button>

            {settings?.obsidian_vault_path && (
              <button
                type="button"
                className="card-context-item"
                onClick={() => {
                  setMenuOpen(false);
                  handleExportToObsidian();
                }}
              >
                <FolderSync size={13} color="#a855f7" />
                <span>{t('cards.header.sendObsidian')}</span>
              </button>
            )}

            {(() => {
              const enabledIntents = settings?.client_intents_enabled?.split(',').filter(Boolean) || [];
              const items: React.ReactNode[] = [];
              if (enabledIntents.includes('obsidian')) {
                items.push(
                  <button
                    key="obsidian"
                    type="button"
                    className="card-context-item"
                    onClick={() => {
                      setMenuOpen(false);
                      handleOpenInObsidian();
                    }}
                  >
                    <BookOpen size={13} color="#483699" />
                    <span>{t('cards.header.openObsidian')}</span>
                  </button>
                );
              }
              if (enabledIntents.includes('logseq')) {
                items.push(
                  <button
                    key="logseq"
                    type="button"
                    className="card-context-item"
                    onClick={() => {
                      setMenuOpen(false);
                      handleOpenInLogseq();
                    }}
                  >
                    <Bookmark size={13} color="#1890ff" />
                    <span>{t('cards.header.openLogseq')}</span>
                  </button>
                );
              }
              if (enabledIntents.includes('things')) {
                items.push(
                  <button
                    key="things"
                    type="button"
                    className="card-context-item"
                    onClick={() => {
                      setMenuOpen(false);
                      handleOpenInThings();
                    }}
                  >
                    <Target size={13} color="#e67e22" />
                    <span>{t('cards.header.openThings')}</span>
                  </button>
                );
              }
              if (enabledIntents.includes('todoist')) {
                items.push(
                  <button
                    key="todoist"
                    type="button"
                    className="card-context-item"
                    onClick={() => {
                      setMenuOpen(false);
                      handleOpenInTodoist();
                    }}
                  >
                    <CheckSquare size={13} color="#e44d2a" />
                    <span>{t('cards.header.openTodoist')}</span>
                  </button>
                );
              }
              if (enabledIntents.includes('github') && settings?.github_repo) {
                items.push(
                  <button
                    key="github"
                    type="button"
                    className="card-context-item"
                    onClick={() => {
                      setMenuOpen(false);
                      handleOpenInGitHub();
                    }}
                  >
                    <GitBranch size={13} color="#24292f" />
                    <span>{t('cards.header.openGithub')}</span>
                  </button>
                );
              }
              return items;
            })()}

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
              <span>{t('cards.header.splitTwo')}</span>
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
                <span>{t('cards.header.spinOff')}</span>
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
                <span>{t('cards.header.retryExtraction')}</span>
              </button>
            )}

            {!isFailed && !card.tldr && (!card.claims || card.claims.length === 0) && (
              <button
                type="button"
                className="card-context-item"
                onClick={() => {
                  setMenuOpen(false);
                  onRetry(card.id);
                }}
              >
                <Sparkles size={13} color="#c084fc" />
                <span>{t('cards.header.synthesize')}</span>
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
                <span>{t('cards.header.deleteCard')}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
