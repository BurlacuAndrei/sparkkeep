import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Card, ResearchItem, Reference, ReferenceKind, CardComment, Capture } from '../types';
import { fetchCard, fetchCardResearch, addCardComment, getErrorMessage, fetchCapture, createCard } from '../api';
import {
  X,
  Sparkles,
  ExternalLink,
  RefreshCw,
  FileText,
  Lightbulb,
  CheckCircle2,
  ClipboardCopy,
  CheckSquare,
  Trash2,
  Plus,
  FileSearch,
  Link2,
  HelpCircle,
  ArrowRight,
  Check,
  RotateCcw,
  Clock,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Layers,
  Split,
  GitBranch,
  MessageSquare,
  AlertTriangle,
  FileCode,
} from 'lucide-react';
import { CustomSelect } from './CustomSelect';
import { CARD_HORIZON_OPTIONS, CARD_TYPE_OPTIONS } from './selectOptions';
import { ResearchReportView } from './ResearchReportView';
import { getPlatformInfo, formatRelativeAge } from '../utils/cardUtils';

export interface CardModalProps {
  card: Card;
  allCards?: Card[];
  onSelectCard?: (card: Card) => void;
  onClose: () => void;
  onUpdate: (id: number, patch: Partial<Card>) => void;
  onDelete?: (id: number) => void;
  onResearch: (id: number) => void;
  onRetry: (id: number) => void;
  showToast?: (msg: string, onUndo?: () => Promise<void> | void) => void;
}

const LIFECYCLE_STEPS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'review', label: 'Review' },
  { id: 'to-do', label: 'To Do' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
];

export const CardModal: React.FC<CardModalProps> = ({
  card,
  allCards = [],
  onSelectCard,
  onClose,
  onUpdate,
  onDelete,
  onResearch,
  onRetry,
  showToast,
}) => {
  // Local Form States
  const [title, setTitle] = useState(card.title || '');
  const [tldr, setTldr] = useState(card.tldr || card.executive_summary || card.summary || '');
  const [whyCare, setWhyCare] = useState(card.why_care || card.value_proposition || '');
  const [claims, setClaims] = useState<string[]>(card.claims || []);
  const [newClaim, setNewClaim] = useState('');
  const [openQuestions, setOpenQuestions] = useState<string[]>(card.open_questions || []);
  const [newQuestion, setNewQuestion] = useState('');
  const [horizon, setHorizon] = useState(card.horizon || 'short-term');
  const [status, setStatus] = useState(card.status || 'inbox');
  const [cardType, setCardType] = useState<string>(card.type || 'idea');
  const [note, setNote] = useState(card.source_note || '');
  const [tagsInput, setTagsInput] = useState((card.tags || []).join(', '));
  const [references, setReferences] = useState<Reference[]>(card.references || []);
  const [actions, setActions] = useState<string[]>(card.proposed_actions || []);
  const [completedActions, setCompletedActions] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {};
    if (card.proposed_actions && card.completed_actions) {
      const set = new Set(card.completed_actions);
      card.proposed_actions.forEach((act, idx) => {
        if (set.has(act)) {
          init[idx] = true;
        }
      });
    }
    return init;
  });
  const [newAction, setNewAction] = useState('');
  const [research, setResearch] = useState<ResearchItem | null>(null);
  const [comments, setComments] = useState<CardComment[]>(card.comments || []);
  const [newComment, setNewComment] = useState('');

  // References Input
  const [newRefKind, setNewRefKind] = useState<ReferenceKind>('url');
  const [newRefLabel, setNewRefLabel] = useState('');
  const [newRefUrl, setNewRefUrl] = useState('');

  // Captured Content & Sibling states
  const [capture, setCapture] = useState<Capture | null>(null);
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [splitClaimIndices, setSplitClaimIndices] = useState<number[]>([]);
  const [splitSecondTitle, setSplitSecondTitle] = useState('');

  // UI state
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const menuRef = useRef<HTMLDivElement>(null);
  const autosaveTimerRef = useRef<any>(null);

  const cardId = card.id;

  // Load research, capture, and comments
  useEffect(() => {
    if (!cardId) return;
    let alive = true;
    fetchCardResearch(cardId)
      .then((r) => {
        if (alive) setResearch(r);
      })
      .catch((err: Error) => showToast?.(err.message));

    fetchCard(cardId)
      .then((c) => {
        if (alive && c.comments) setComments(c.comments);
      })
      .catch(() => {});

    if (card.capture_id) {
      fetchCapture(card.capture_id)
        .then((cap) => {
          if (alive) setCapture(cap);
        })
        .catch(() => {});
    }

    return () => {
      alive = false;
    };
  }, [cardId, card.capture_id, showToast]);

  // Outside click for menu
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

  // Debounced Autosave for Text & Field Changes
  const triggerAutosave = useCallback(
    (patch: Partial<Card>) => {
      setSaveStatus('saving');
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        onUpdate(card.id, patch);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2500);
      }, 650);
    },
    [card.id, onUpdate]
  );

  // Field change handlers with immediate trigger
  const handleTitleChange = (val: string) => {
    setTitle(val);
    triggerAutosave({ title: val });
  };

  const handleTldrChange = (val: string) => {
    setTldr(val);
    triggerAutosave({ tldr: val, summary: val, executive_summary: val });
  };

  const handleWhyCareChange = (val: string) => {
    setWhyCare(val);
    triggerAutosave({ why_care: val, value_proposition: val });
  };

  const handleNoteChange = (val: string) => {
    setNote(val);
    triggerAutosave({ source_note: val });
  };

  const handleTagsChange = (val: string) => {
    setTagsInput(val);
    const parsed = val.split(',').map((t) => t.trim()).filter(Boolean);
    triggerAutosave({ tags: parsed });
  };

  const handleHorizonChange = (h: 'short-term' | 'medium-term' | 'long-term') => {
    setHorizon(h);
    onUpdate(card.id, { horizon: h });
    showToast?.(`Horizon set to ${h}`);
  };

  const handleStatusTransition = (newStatus: string) => {
    setStatus(newStatus as any);
    onUpdate(card.id, { status: newStatus as any });
  };

  // Actions handling
  const toggleAction = (index: number) => {
    setCompletedActions((prev) => {
      const next = { ...prev, [index]: !prev[index] };
      const completedList = actions.filter((_, idx) => next[idx]);
      onUpdate(card.id, { completed_actions: completedList });
      return next;
    });
  };

  const editAction = (index: number, text: string) => {
    const updated = actions.map((a, i) => (i === index ? text : a));
    setActions(updated);
    triggerAutosave({ proposed_actions: updated });
  };

  const removeAction = (index: number) => {
    const updated = actions.filter((_, i) => i !== index);
    setActions(updated);
    const nextCompleted: Record<number, boolean> = {};
    Object.entries(completedActions).forEach(([k, v]) => {
      const i = Number(k);
      if (i < index) nextCompleted[i] = v;
      else if (i > index) nextCompleted[i - 1] = v;
    });
    setCompletedActions(nextCompleted);
    const completedList = updated.filter((_, idx) => nextCompleted[idx]);
    onUpdate(card.id, { proposed_actions: updated, completed_actions: completedList });
  };

  const addAction = () => {
    const text = newAction.trim();
    if (!text) return;
    const updated = [...actions, text];
    setActions(updated);
    setNewAction('');
    onUpdate(card.id, { proposed_actions: updated });
  };

  // Claims handling
  const addClaim = () => {
    const text = newClaim.trim();
    if (!text) return;
    const updated = [...claims, text];
    setClaims(updated);
    setNewClaim('');
    onUpdate(card.id, { claims: updated });
  };

  const editClaim = (index: number, text: string) => {
    const updated = claims.map((c, i) => (i === index ? text : c));
    setClaims(updated);
    triggerAutosave({ claims: updated });
  };

  const removeClaim = (index: number) => {
    const updated = claims.filter((_, i) => i !== index);
    setClaims(updated);
    onUpdate(card.id, { claims: updated });
  };

  // Open questions handling
  const addQuestion = () => {
    const text = newQuestion.trim();
    if (!text) return;
    const updated = [...openQuestions, text];
    setOpenQuestions(updated);
    setNewQuestion('');
    onUpdate(card.id, { open_questions: updated });
  };

  const editQuestion = (index: number, text: string) => {
    const updated = openQuestions.map((q, i) => (i === index ? text : q));
    setOpenQuestions(updated);
    triggerAutosave({ open_questions: updated });
  };

  const removeQuestion = (index: number) => {
    const updated = openQuestions.filter((_, i) => i !== index);
    setOpenQuestions(updated);
    onUpdate(card.id, { open_questions: updated });
  };

  // References handling
  const addReference = () => {
    const lbl = newRefLabel.trim();
    const u = newRefUrl.trim();
    if (!lbl && !u) return;
    const item: Reference = {
      kind: newRefKind,
      label: lbl || u,
      ...(u ? { url: u } : {}),
    };
    const updated = [...references, item];
    setReferences(updated);
    setNewRefLabel('');
    setNewRefUrl('');
    setNewRefKind('url');
    onUpdate(card.id, { references: updated });
  };

  const removeReference = (index: number) => {
    const updated = references.filter((_, i) => i !== index);
    setReferences(updated);
    onUpdate(card.id, { references: updated });
  };

  // Sibling cards from same capture
  const siblings = allCards.filter(
    (c) => c.capture_id && card.capture_id && c.capture_id === card.capture_id && c.id !== card.id
  );

  // Markdown and Todoist
  const fetchMarkdown = async () => {
    const res = await fetch(`/api/v1/cards/${card.id}/export.md`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(await fetchMarkdown());
      showToast?.('Markdown copied to clipboard');
    } catch (err: unknown) {
      showToast?.(getErrorMessage(err));
    }
  };

  const handleAddToTodoist = async () => {
    try {
      const md = await fetchMarkdown();
      const q = new URLSearchParams({ text: card.title, description: md });
      window.open(`https://todoist.com/showTask?${q.toString()}`, '_blank', 'noopener');
      showToast?.('Opening Todoist with this spark...');
    } catch (err: unknown) {
      showToast?.(getErrorMessage(err));
    }
  };

  // Spin Off Child Card
  const handleSpinOff = async () => {
    try {
      const newCreated = await createCard({
        title: `Spin-off: ${card.title}`,
        tldr: `Spun off from card #${card.id}.`,
        summary: `Spun off from card #${card.id}.`,
        status: 'inbox',
        horizon: card.horizon || 'short-term',
        source_url: card.source_url,
        capture_id: card.capture_id,
        references: [{ kind: 'other', label: `Parent Card #${card.id}` }],
      });
      showToast?.(`Spun off new card #${newCreated.id}!`);
      if (onSelectCard) onSelectCard(newCreated);
    } catch (err: unknown) {
      showToast?.(getErrorMessage(err));
    }
  };

  // Split Card Handler
  const handlePerformSplit = async () => {
    if (!splitSecondTitle.trim()) {
      showToast?.('Please give Card B a title');
      return;
    }
    try {
      const movedClaims = claims.filter((_, idx) => splitClaimIndices.includes(idx));
      const keptClaims = claims.filter((_, idx) => !splitClaimIndices.includes(idx));

      // 1. Update Card A
      onUpdate(card.id, { claims: keptClaims });

      // 2. Create Card B with moved items
      await createCard({
        title: splitSecondTitle.trim(),
        tldr: `Split from card #${card.id}`,
        summary: `Split from card #${card.id}`,
        claims: movedClaims,
        capture_id: card.capture_id,
        source_url: card.source_url,
        status: 'inbox',
        horizon: card.horizon || 'short-term',
      });

      setIsSplitModalOpen(false);
      showToast?.(`Split completed: Card #${card.id} and new card created!`);
    } catch (err: unknown) {
      showToast?.(getErrorMessage(err));
    }
  };

  // Merge with Sibling Handler
  const handleMergeWith = async (sibling: Card) => {
    if (!window.confirm(`Merge sibling card #${sibling.id} ("${sibling.title}") into this card? The sibling will be archived.`)) {
      return;
    }
    try {
      const combinedClaims = Array.from(new Set([...claims, ...(sibling.claims || [])]));
      const combinedActions = Array.from(new Set([...actions, ...(sibling.proposed_actions || [])]));
      const mergedNote = `${note ? note + '\n\n' : ''}[Merged from #${sibling.id}: "${sibling.title}"]: ${sibling.tldr || sibling.summary || ''}`;

      onUpdate(card.id, {
        claims: combinedClaims,
        proposed_actions: combinedActions,
        source_note: mergedNote,
      });

      // Dismiss the merged sibling
      onUpdate(sibling.id, { status: 'dismissed' as any });
      showToast?.(`Merged card #${sibling.id} into card #${card.id}`);
    } catch (err: unknown) {
      showToast?.(getErrorMessage(err));
    }
  };

  const isFailed = Boolean(card.analysis_failed || card.title === 'Analysis failed');
  const platform = getPlatformInfo(card.source_url);
  const verdict = (card.research_verdict || '').toLowerCase();
  const confidence = card.research_confidence || '';

  // Calculate Action Progress
  const completedCount = actions.filter((_, idx) => completedActions[idx]).length;
  const totalActions = actions.length;
  const progressPercent = totalActions > 0 ? Math.round((completedCount / totalActions) * 100) : 0;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
        {/* Sticky Header */}
        <div className="drawer-header">
          {/* Top Row: Stepper + Status Indicator + Autosave Badge + Close */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            {/* Stepper */}
            <div className="drawer-stepper">
              {LIFECYCLE_STEPS.map((step, idx) => {
                const isActive = status === step.id;
                return (
                  <React.Fragment key={step.id}>
                    <button
                      type="button"
                      className={`drawer-stepper-step ${isActive ? 'active' : ''}`}
                      onClick={() => handleStatusTransition(step.id)}
                      title={`Move card to ${step.label}`}
                    >
                      <span>{step.label}</span>
                    </button>
                    {idx < LIFECYCLE_STEPS.length - 1 && (
                      <span className="drawer-stepper-arrow">→</span>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Side Status Indicator if Shelved or Dismissed */}
              {(status === 'shelved' || status === 'dismissed') && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '2px 7px',
                    borderRadius: 4,
                    background: status === 'shelved' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(244, 63, 94, 0.2)',
                    color: status === 'shelved' ? '#fbbf24' : '#fb7185',
                    marginLeft: 6,
                  }}
                >
                  {status}
                </span>
              )}
            </div>

            {/* Autosave & Close */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {saveStatus === 'saving' && (
                <span className="autosave-indicator saving">
                  <RefreshCw size={11} className="spin" />
                  <span>Saving...</span>
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="autosave-indicator saved">
                  <Check size={11} strokeWidth={2.5} />
                  <span>Saved</span>
                </span>
              )}

              <button
                type="button"
                className="close-btn"
                onClick={onClose}
                title="Close drawer (Esc)"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* Title Row with Inline Editing */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="text"
              className="drawer-title-input"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Card headline..."
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--text-main)',
                background: 'transparent',
                border: '1px solid transparent',
                borderRadius: 4,
                padding: '3px 6px',
                width: '100%',
              }}
            />
          </div>

          {/* Chips Row: Platform, Type, Horizon, Worthiness, Signals */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Platform */}
            <span
              className="card-platform-glyph"
              style={{ color: platform.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {platform.icon}
              <span style={{ fontSize: 11, fontWeight: 500 }}>{platform.name}</span>
            </span>

            {/* Type Selector */}
            <div style={{ width: 130 }}>
              <CustomSelect
                id="drawer-type-select"
                value={cardType}
                onChange={(val) => {
                  setCardType(val);
                  onUpdate(card.id, { type: val });
                }}
                options={CARD_TYPE_OPTIONS}
                ariaLabel="Card Type"
              />
            </div>

            {/* Horizon Select */}
            <div style={{ width: 130 }}>
              <CustomSelect
                id="drawer-horizon-select"
                value={horizon}
                onChange={(val) => handleHorizonChange(val as any)}
                options={CARD_HORIZON_OPTIONS}
                ariaLabel="Card Horizon"
              />
            </div>

            {/* Worthiness */}
            {card.worthiness?.level && (
              <span
                className={`card-worthiness-chip ${card.worthiness.level.toLowerCase()}`}
                title={card.worthiness.reason || `Worthiness: ${card.worthiness.level}`}
              >
                WORTH: {card.worthiness.level.toUpperCase()}
              </span>
            )}

            {/* Signal warnings */}
            {card.signals?.extraction && card.signals.extraction !== 'full' && (
              <span className="card-signal-badge warning" title="Extraction signal warning">
                <AlertTriangle size={10} strokeWidth={2} />
                <span>Extraction: {card.signals.extraction}</span>
              </span>
            )}
            {card.signals?.promo && (
              <span className="card-signal-badge promo">
                Promo Content
              </span>
            )}

            {/* Header Action Buttons on the Right */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
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
                  onClick={() => handleStatusTransition('to-do')}
                >
                  <ArrowRight size={12} />
                  <span>Commit → To Do</span>
                </button>
              ) : status === 'review' ? (
                <button
                  type="button"
                  className="card-primary-action-btn accept"
                  onClick={() => handleStatusTransition('to-do')}
                >
                  <Check size={12} />
                  <span>Accept → To Do</span>
                </button>
              ) : status === 'to-do' ? (
                <button
                  type="button"
                  className="card-primary-action-btn start"
                  onClick={() => handleStatusTransition('in-progress')}
                >
                  <ArrowRight size={12} />
                  <span>Start Working</span>
                </button>
              ) : status === 'in-progress' ? (
                <button
                  type="button"
                  className="card-primary-action-btn done"
                  onClick={() => handleStatusTransition('done')}
                >
                  <Check size={12} />
                  <span>Mark Completed</span>
                </button>
              ) : status === 'shelved' || status === 'dismissed' ? (
                <button
                  type="button"
                  className="card-primary-action-btn restore"
                  onClick={() => handleStatusTransition('inbox')}
                >
                  <RotateCcw size={12} />
                  <span>Restore</span>
                </button>
              ) : null}

              {/* Research CTA */}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onResearch(card.id)}
                title="Run deep research"
                style={{ padding: '4px 10px', fontSize: 11.5 }}
              >
                <Sparkles size={13} color="#c084fc" />
                <span>Research</span>
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
                        setIsSplitModalOpen(true);
                      }}
                    >
                      <Split size={13} color="#38bdf8" />
                      <span>Split into Two Cards</span>
                    </button>

                    <button
                      type="button"
                      className="card-context-item"
                      onClick={() => {
                        setMenuOpen(false);
                        handleSpinOff();
                      }}
                    >
                      <GitBranch size={13} color="#a78bfa" />
                      <span>Spin off Child Card</span>
                    </button>

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
                          if (window.confirm(`Delete card #${card.id} permanently?`)) {
                            onDelete(card.id);
                            onClose();
                          }
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
          </div>
        </div>

        {/* Drawer Body: Two-Column Layout */}
        <div className="drawer-body-layout">
          {/* Main Column (Stage-Ordered Content) */}
          <div className="drawer-main-col">
            {/* Collection Callout Banner */}
            {cardType === 'collection' && (
              <div
                style={{
                  background: 'rgba(99, 102, 241, 0.08)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#e0e7ff', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Layers size={14} color="#818cf8" />
                    <span>Collection Card</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    This card represents a roundup of multiple items. You can promote individual items or split them into independent cards.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setIsSplitModalOpen(true)}
                  style={{ fontSize: 12, padding: '4px 10px', whiteSpace: 'nowrap' }}
                >
                  <Split size={12} />
                  <span>Split Items</span>
                </button>
              </div>
            )}

            {/* STAGE: INBOX */}
            {status === 'inbox' && (
              <>
                {/* 1. TL;DR */}
                <div className="briefing-section">
                  <div className="briefing-heading heading-summary">
                    <FileText size={13} strokeWidth={1.5} />
                    <span>TL;DR Takeaway</span>
                  </div>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    value={tldr}
                    onChange={(e) => handleTldrChange(e.target.value)}
                    placeholder="Core takeaway and summary..."
                  />
                </div>

                {/* 2. Why Care / Value Prop */}
                <div className="briefing-section">
                  <div className="briefing-heading heading-value">
                    <Lightbulb size={13} strokeWidth={1.5} />
                    <span>Why You Might Care</span>
                  </div>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    value={whyCare}
                    onChange={(e) => handleWhyCareChange(e.target.value)}
                    placeholder="Why this matters, practical implications..."
                  />
                </div>

                {/* 3. Key Claims */}
                <div className="briefing-section">
                  <div className="briefing-heading heading-claims">
                    <CheckCircle2 size={13} strokeWidth={1.5} />
                    <span>Key Claims</span>
                  </div>
                  <div className="actions-list">
                    {claims.map((claim, idx) => (
                      <div key={idx} className="action-item" style={{ alignItems: 'center' }}>
                        <span style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>•</span>
                        <input
                          type="text"
                          className="form-input"
                          value={claim}
                          onChange={(e) => editClaim(idx, e.target.value)}
                          style={{ flex: 1, padding: '4px 8px', background: 'transparent', border: '1px solid transparent' }}
                        />
                        <button type="button" className="close-btn" onClick={() => removeClaim(idx)} title="Remove claim">
                          <Trash2 size={13} strokeWidth={1.5} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <input
                      type="text"
                      className="form-input"
                      value={newClaim}
                      placeholder="Add a claim..."
                      onChange={(e) => setNewClaim(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addClaim();
                        }
                      }}
                    />
                    <button type="button" className="btn-secondary" onClick={addClaim}>
                      <Plus size={13} color="#34d399" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>

                {/* 4. Open Questions */}
                <div className="briefing-section">
                  <div className="briefing-heading heading-questions">
                    <HelpCircle size={13} strokeWidth={1.5} />
                    <span>Open Questions (Research will address)</span>
                  </div>
                  <div className="actions-list">
                    {openQuestions.map((q, idx) => (
                      <div key={idx} className="action-item" style={{ alignItems: 'center' }}>
                        <span style={{ color: 'var(--accent-amber)', fontWeight: 700 }}>?</span>
                        <input
                          type="text"
                          className="form-input"
                          value={q}
                          onChange={(e) => editQuestion(idx, e.target.value)}
                          style={{ flex: 1, padding: '4px 8px', background: 'transparent', border: '1px solid transparent' }}
                        />
                        <button type="button" className="close-btn" onClick={() => removeQuestion(idx)} title="Remove question">
                          <Trash2 size={13} strokeWidth={1.5} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <input
                      type="text"
                      className="form-input"
                      value={newQuestion}
                      placeholder="Add an open question..."
                      onChange={(e) => setNewQuestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addQuestion();
                        }
                      }}
                    />
                    <button type="button" className="btn-secondary" onClick={addQuestion}>
                      <Plus size={13} color="#fbbf24" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>

                {/* Research Call to Action */}
                <div
                  style={{
                    background: 'rgba(99, 102, 241, 0.08)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    borderRadius: 8,
                    padding: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e7ff' }}>
                      Ready to dig deeper?
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                      Trigger autonomous multi-step research to verify claims, survey alternatives, and formulate next actions.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => onResearch(card.id)}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    <Sparkles size={13} />
                    <span>Run Deep Research</span>
                  </button>
                </div>
              </>
            )}

            {/* STAGE: REVIEW */}
            {status === 'review' && (
              <>
                {/* 1. Verdict Callout */}
                <div className={`verdict-callout-card ${verdict}`}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`card-verdict-pill ${verdict || 'pursue'}`}>
                        <span className="verdict-dot" />
                        <strong>{(verdict || 'PURSUE').toUpperCase()}</strong>
                        {confidence && <span>· Confidence: {confidence}</span>}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                      Research Synthesis
                    </div>
                  </div>

                  {research?.result?.verdict && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#cbd5e1' }}>
                      {research.result.verdict.for_whom && (
                        <div>
                          <strong style={{ color: '#f1f5f9' }}>For Whom: </strong>
                          <span>{research.result.verdict.for_whom}</span>
                        </div>
                      )}
                      {research.result.verdict.risks && research.result.verdict.risks.length > 0 && (
                        <div>
                          <strong style={{ color: '#fb7185' }}>Risks & Watch-outs: </strong>
                          <span>{research.result.verdict.risks.join(' · ')}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Accept / Decision Actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => handleStatusTransition('to-do')}
                      style={{ fontSize: 12, padding: '5px 12px' }}
                    >
                      <Check size={13} />
                      <span>Accept Verdict → To Do</span>
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleStatusTransition('shelved')}
                      style={{ fontSize: 12, padding: '5px 12px' }}
                    >
                      <Clock size={13} />
                      <span>Watch (Shelve)</span>
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleStatusTransition('dismissed')}
                      style={{ fontSize: 12, padding: '5px 12px', color: '#fb7185' }}
                    >
                      <X size={13} />
                      <span>Skip (Dismiss)</span>
                    </button>
                  </div>
                </div>

                {/* 2. Key Claims with Verification Badges */}
                <div className="briefing-section">
                  <div className="briefing-heading heading-claims">
                    <CheckCircle2 size={13} strokeWidth={1.5} />
                    <span>Claims & Verification</span>
                  </div>
                  <div className="actions-list">
                    {claims.map((claim, idx) => {
                      const cv = research?.result?.claims?.find(
                        (c) => c.claim.toLowerCase().includes(claim.toLowerCase().slice(0, 20))
                      );
                      const st = cv?.status || 'unverified';
                      return (
                        <div key={idx} className="action-item" style={{ alignItems: 'center' }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              padding: '1px 6px',
                              borderRadius: 4,
                              background:
                                st === 'supported'
                                  ? 'rgba(16, 185, 129, 0.15)'
                                  : st === 'disputed'
                                  ? 'rgba(244, 63, 94, 0.15)'
                                  : 'rgba(255, 255, 255, 0.05)',
                              color:
                                st === 'supported' ? '#34d399' : st === 'disputed' ? '#fb7185' : '#94a3b8',
                            }}
                          >
                            {st}
                          </span>
                          <span style={{ flex: 1, fontSize: 13, color: '#e2e8f0' }}>{claim}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Next Actions Checklist */}
                <div className="briefing-section">
                  <div className="briefing-heading heading-actions">
                    <CheckCircle2 size={13} strokeWidth={1.5} />
                    <span>Next Actions Checklist</span>
                  </div>
                  <div className="actions-list">
                    {actions.map((act, idx) => (
                      <div key={idx} className="action-item" style={{ alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(completedActions[idx])}
                          onChange={() => toggleAction(idx)}
                        />
                        <span style={{ flex: 1, fontSize: 13, textDecoration: completedActions[idx] ? 'line-through' : 'none' }}>
                          {act}
                        </span>
                        <button type="button" className="close-btn" onClick={() => removeAction(idx)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <input
                      type="text"
                      className="form-input"
                      value={newAction}
                      placeholder="Add an action..."
                      onChange={(e) => setNewAction(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addAction();
                        }
                      }}
                    />
                    <button type="button" className="btn-secondary" onClick={addAction}>
                      <Plus size={13} color="#34d399" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>

                {/* 4. Full Report Accordion */}
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setIsReportOpen(!isReportOpen)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'var(--bg-surface-elevated)',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      color: 'var(--text-main)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FileSearch size={14} color="#38bdf8" />
                      <span>Full Deep Research Report</span>
                    </span>
                    {isReportOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                  {isReportOpen && (
                    <div style={{ padding: 14 }}>
                      <ResearchReportView
                        card={card}
                        initialResearch={research}
                        onUpdateCard={async (id, updates) => onUpdate(id, updates)}
                        onAddActions={(newActs) => {
                          const fresh = newActs.filter((a) => !actions.includes(a));
                          if (fresh.length > 0) {
                            const updated = [...actions, ...fresh];
                            setActions(updated);
                            onUpdate(card.id, { proposed_actions: updated });
                          }
                        }}
                        showToast={showToast}
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {/* STAGE: TO DO / IN PROGRESS */}
            {(status === 'to-do' || status === 'in-progress') && (
              <>
                {/* 1. Proposed Actions Checklist at Top */}
                <div className="briefing-section">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div className="briefing-heading heading-actions" style={{ margin: 0 }}>
                      <CheckCircle2 size={13} strokeWidth={1.5} />
                      <span>Next Actions Checklist</span>
                    </div>
                    <span style={{ fontSize: 11.5, color: '#34d399', fontWeight: 600 }}>
                      {totalActions > 0 ? `${completedCount}/${totalActions} completed (${progressPercent}%)` : 'No steps yet'}
                    </span>
                  </div>

                  {totalActions > 0 && (
                    <div className="card-progress-bar-track" style={{ height: 6, marginBottom: 12 }}>
                      <div className="card-progress-bar-fill" style={{ width: `${Math.max(5, progressPercent)}%` }} />
                    </div>
                  )}

                  <div className="actions-list">
                    {actions.map((act, idx) => (
                      <div
                        key={idx}
                        className="action-item"
                        style={{ alignItems: 'center', opacity: completedActions[idx] ? 0.6 : 1 }}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(completedActions[idx])}
                          onChange={() => toggleAction(idx)}
                          style={{ cursor: 'pointer' }}
                        />
                        <input
                          type="text"
                          className="form-input"
                          value={act}
                          onChange={(e) => editAction(idx, e.target.value)}
                          style={{
                            flex: 1,
                            padding: '4px 8px',
                            background: 'transparent',
                            border: '1px solid transparent',
                            textDecoration: completedActions[idx] ? 'line-through' : 'none',
                          }}
                        />
                        <button type="button" className="close-btn" onClick={() => removeAction(idx)}>
                          <Trash2 size={13} strokeWidth={1.5} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <input
                      type="text"
                      className="form-input"
                      value={newAction}
                      placeholder="Add an action step..."
                      onChange={(e) => setNewAction(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addAction();
                        }
                      }}
                    />
                    <button type="button" className="btn-secondary" onClick={addAction}>
                      <Plus size={13} color="#34d399" />
                      <span>Add Step</span>
                    </button>
                  </div>
                </div>

                {/* 2. TL;DR Takeaway */}
                <div className="briefing-section">
                  <div className="briefing-heading heading-summary">
                    <FileText size={13} strokeWidth={1.5} />
                    <span>TL;DR Takeaway</span>
                  </div>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    value={tldr}
                    onChange={(e) => handleTldrChange(e.target.value)}
                    placeholder="Core takeaway..."
                  />
                </div>

                {/* 3. Why Care */}
                <div className="briefing-section">
                  <div className="briefing-heading heading-value">
                    <Lightbulb size={13} strokeWidth={1.5} />
                    <span>Why You Might Care</span>
                  </div>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    value={whyCare}
                    onChange={(e) => handleWhyCareChange(e.target.value)}
                    placeholder="Why this matters..."
                  />
                </div>

                {/* 4. Research Accordion */}
                {research && (
                  <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => setIsReportOpen(!isReportOpen)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        background: 'var(--bg-surface-elevated)',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        color: 'var(--text-main)',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FileSearch size={14} color="#38bdf8" />
                        <span>Deep Research Findings</span>
                      </span>
                      {isReportOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                    {isReportOpen && (
                      <div style={{ padding: 14 }}>
                        <ResearchReportView
                          card={card}
                          initialResearch={research}
                          onUpdateCard={async (id, updates) => onUpdate(id, updates)}
                          showToast={showToast}
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* STAGE: DONE */}
            {status === 'done' && (
              <>
                <div
                  style={{
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    borderRadius: 8,
                    padding: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <CheckCircle2 size={24} color="#34d399" />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#e0e7ff' }}>
                      Card Completed!
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      All actions completed. You can log an outcome note below or export to Obsidian / Markdown.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => handleStatusTransition('to-do')}
                  >
                    <RotateCcw size={12} />
                    <span>Reopen</span>
                  </button>
                </div>

                {/* Outcome Note */}
                <div className="briefing-section">
                  <div className="briefing-heading heading-value">
                    <FileText size={13} strokeWidth={1.5} />
                    <span>Outcome Note / Key Learnings</span>
                  </div>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    value={note}
                    onChange={(e) => handleNoteChange(e.target.value)}
                    placeholder="What happened? What were the key outcomes or learnings?"
                  />
                </div>

                {/* Actions Completed (Read-only review) */}
                <div className="briefing-section">
                  <div className="briefing-heading heading-actions">
                    <CheckCircle2 size={13} strokeWidth={1.5} />
                    <span>Completed Actions</span>
                  </div>
                  <div className="actions-list">
                    {actions.map((act, idx) => (
                      <div key={idx} className="action-item" style={{ alignItems: 'center', opacity: 0.8 }}>
                        <Check size={13} color="#34d399" strokeWidth={2.5} />
                        <span style={{ fontSize: 13, textDecoration: 'line-through', color: '#94a3b8' }}>{act}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right Rail (Provenance, Siblings, References, Activity) */}
          <div className="drawer-right-rail">
            {/* 1. Source Provenance */}
            <div className="rail-section">
              <div className="rail-section-title">
                <FileCode size={13} color="#38bdf8" />
                <span>Source Provenance</span>
              </div>
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: platform.color }}>{platform.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>{platform.name}</span>
                  <span style={{ fontSize: 11, color: '#64748b', marginLeft: 'auto' }}>
                    {formatRelativeAge(card.created_at)}
                  </span>
                </div>

                {card.source_url && (
                  <a
                    href={card.source_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 11.5,
                      color: '#38bdf8',
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      wordBreak: 'break-all',
                    }}
                  >
                    <span>Open Original Source</span>
                    <ExternalLink size={11} />
                  </a>
                )}

                {/* View Captured Content Button */}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsCaptureModalOpen(true)}
                  style={{ width: '100%', fontSize: 11.5, padding: '4px 8px', justifyContent: 'center' }}
                >
                  <FileText size={12} />
                  <span>View Captured Content</span>
                </button>
              </div>
            </div>

            {/* 2. From Same Source (Siblings) */}
            <div className="rail-section">
              <div className="rail-section-title">
                <Layers size={13} color="#a78bfa" />
                <span>From Same Source ({siblings.length})</span>
              </div>

              {siblings.length === 0 ? (
                <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                  Single idea from this source.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {siblings.map((sib) => (
                    <div
                      key={sib.id}
                      onClick={() => onSelectCard?.(sib)}
                      style={{
                        padding: '6px 8px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 6,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }} className="line-clamp-1">
                          {sib.title}
                        </span>
                        <span
                          style={{
                            fontSize: 9.5,
                            textTransform: 'uppercase',
                            fontWeight: 700,
                            color: sib.status === 'done' ? '#34d399' : '#38bdf8',
                          }}
                        >
                          {sib.status}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, color: '#64748b' }}>#{sib.id}</span>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMergeWith(sib);
                          }}
                          style={{ fontSize: 9.5, padding: '1px 5px', height: 18 }}
                          title="Merge into current card"
                        >
                          Merge
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. References */}
            <div className="rail-section">
              <div className="rail-section-title">
                <Link2 size={13} color="#38bdf8" />
                <span>References ({references.length})</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {references.map((ref, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 6px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                      <span className={`ref-kind-chip ref-kind-${ref.kind}`}>{ref.kind}</span>
                      <span style={{ color: '#e2e8f0' }} className="line-clamp-1">
                        {ref.label || ref.url}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {ref.url && (
                        <a href={ref.url} target="_blank" rel="noreferrer" style={{ color: '#38bdf8' }}>
                          <ExternalLink size={11} />
                        </a>
                      )}
                      <button type="button" className="close-btn" onClick={() => removeReference(idx)}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Reference inline */}
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                <select
                  className="form-input"
                  value={newRefKind}
                  onChange={(e) => setNewRefKind(e.target.value as ReferenceKind)}
                  style={{ width: 68, padding: '3px 4px', fontSize: 11 }}
                >
                  <option value="url">url</option>
                  <option value="repo">repo</option>
                  <option value="tool">tool</option>
                  <option value="paper">paper</option>
                  <option value="other">other</option>
                </select>
                <input
                  type="text"
                  className="form-input"
                  placeholder="URL or label..."
                  value={newRefUrl || newRefLabel}
                  onChange={(e) => {
                    setNewRefUrl(e.target.value);
                    setNewRefLabel(e.target.value);
                  }}
                  style={{ flex: 1, padding: '3px 6px', fontSize: 11 }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addReference();
                    }
                  }}
                />
                <button type="button" className="btn-secondary" onClick={addReference} style={{ padding: '3px 8px' }}>
                  <Plus size={11} />
                </button>
              </div>
            </div>

            {/* 4. Tags Input */}
            <div className="rail-section">
              <div className="rail-section-title">
                <span>Tags</span>
              </div>
              <input
                type="text"
                className="form-input"
                value={tagsInput}
                onChange={(e) => handleTagsChange(e.target.value)}
                placeholder="tag1, tag2..."
                style={{ fontSize: 12, padding: '4px 8px' }}
              />
            </div>

            {/* 5. Activity & Comments */}
            <div className="rail-section">
              <div className="rail-section-title">
                <MessageSquare size={13} color="#f59e0b" />
                <span>Comments & History</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                {comments.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 4,
                      padding: 6,
                      fontSize: 11.5,
                    }}
                  >
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>
                      {new Date(c.created_at).toLocaleString()}
                    </div>
                    <div style={{ color: '#cbd5e1', whiteSpace: 'pre-wrap' }}>{c.content}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add note or comment..."
                  style={{ flex: 1, fontSize: 11.5 }}
                />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={async () => {
                    if (!newComment.trim()) return;
                    try {
                      const c = await addCardComment(card.id, newComment);
                      setComments((prev) => [...prev, c]);
                      setNewComment('');
                    } catch (err: unknown) {
                      showToast?.(getErrorMessage(err));
                    }
                  }}
                  style={{ padding: '4px 10px', fontSize: 11 }}
                >
                  Post
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Captured Content Modal */}
      {isCaptureModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCaptureModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={16} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Captured Content #{capture?.id || card.capture_id || 'Raw'}</h3>
              </div>
              <button type="button" className="close-btn" onClick={() => setIsCaptureModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {capture?.source_url && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>SOURCE URL</div>
                  <a href={capture.source_url} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', fontSize: 12.5 }}>
                    {capture.source_url}
                  </a>
                </div>
              )}

              {capture?.caption && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>CAPTION / SUMMARY</div>
                  <div style={{ fontSize: 13, color: '#e2e8f0', background: 'rgba(255, 255, 255, 0.02)', padding: 10, borderRadius: 6 }}>
                    {capture.caption}
                  </div>
                </div>
              )}

              {capture?.transcript && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>TRANSCRIPT EXCERPT</div>
                  <div style={{ fontSize: 12.5, color: '#cbd5e1', maxHeight: 200, overflowY: 'auto', background: 'rgba(255, 255, 255, 0.02)', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap' }}>
                    {capture.transcript}
                  </div>
                </div>
              )}

              {capture?.text && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>RAW EXTRACTED TEXT</div>
                  <div style={{ fontSize: 12.5, color: '#cbd5e1', maxHeight: 200, overflowY: 'auto', background: 'rgba(255, 255, 255, 0.02)', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap' }}>
                    {capture.text}
                  </div>
                </div>
              )}

              {note && !capture && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>SOURCE NOTE</div>
                  <div style={{ fontSize: 13, color: '#e2e8f0', background: 'rgba(255, 255, 255, 0.02)', padding: 10, borderRadius: 6 }}>
                    {note}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Split Card Modal */}
      {isSplitModalOpen && (
        <div className="modal-overlay" onClick={() => setIsSplitModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Split size={16} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Split Card #{card.id} into Two</h3>
              </div>
              <button type="button" className="close-btn" onClick={() => setIsSplitModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: 12.5, color: '#94a3b8', margin: '0 0 12px 0' }}>
              Select which claims or topics should move to the second card. Both cards will share the same source capture.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', display: 'block', marginBottom: 4 }}>
                  Card B Title
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Title for the new split card..."
                  value={splitSecondTitle}
                  onChange={(e) => setSplitSecondTitle(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', display: 'block', marginBottom: 4 }}>
                  Select Claims to Move to Card B
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                  {claims.map((claim, idx) => {
                    const isChecked = splitClaimIndices.includes(idx);
                    return (
                      <label
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 8px',
                          background: isChecked ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 12.5,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSplitClaimIndices((prev) => prev.filter((i) => i !== idx));
                            } else {
                              setSplitClaimIndices((prev) => [...prev, idx]);
                            }
                          }}
                        />
                        <span style={{ color: isChecked ? '#e0e7ff' : '#94a3b8' }}>{claim}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn-secondary" onClick={() => setIsSplitModalOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handlePerformSplit}
                  disabled={!splitSecondTitle.trim()}
                >
                  <Split size={13} />
                  <span>Execute Split</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};