import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { Card, Tag, DigestData } from './types';
import * as api from './api';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { KanbanBoard } from './components/KanbanBoard';
import { TriageView } from './components/TriageView';
import { DigestView } from './components/DigestView';
import { SetupWizard } from './components/SetupWizard';
import { LockScreen } from './components/LockScreen';
import { Bell } from 'lucide-react';
import { CardActionsProvider } from './context/CardActionsContext';
import { ThemeProvider } from './context/ThemeContext';

const SettingsModal = React.lazy(() => import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal })));
const CardModal = React.lazy(() => import('./components/CardModal').then((m) => ({ default: m.CardModal })));
const NewCardModal = React.lazy(() => import('./components/NewCardModal').then((m) => ({ default: m.NewCardModal })));

function AppContent() {
  const [cards, setCards] = useState<Card[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [digest, setDigest] = useState<DigestData | null>(null);

  // Filters & Navigation: sticky last-active view
  const [viewMode, setViewModeState] = useState<'triage' | 'boards' | 'digest'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sparkkeep_active_view') || localStorage.getItem('sparkkeep_default_view');
      if (saved === 'triage' || saved === 'boards' || saved === 'digest') {
        return saved;
      }
    }
    return 'boards';
  });

  const setViewMode = useCallback((mode: 'triage' | 'boards' | 'digest') => {
    setViewModeState(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('sparkkeep_active_view', mode);
    }
  }, []);
  const [horizon, setHorizon] = useState('short-term');
  const [selectedTag, setSelectedTag] = useState('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  // Modals & Feedback
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void } | null>(null);

  // Auth (SPARKKEEP_AUTH_TOKEN): a 401 anywhere raises the lock screen.
  const [isAuthRequired, setIsAuthRequired] = useState(false);
  const [isSetupNeeded, setIsSetupNeeded] = useState(false);

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  const showToast = useCallback((msg: string, onUndo?: () => Promise<void> | void) => {
    if (msg === 'unauthorized' || msg === 'HTTP 401') {
      setIsAuthRequired(true);
      return;
    }
    const undoWrapper = onUndo ? () => { void onUndo(); } : undefined;
    setToast({ message: msg, onUndo: undoWrapper });
    const flashEl = document.getElementById('flash');
    if (flashEl) flashEl.textContent = msg;
    setTimeout(() => {
      setToast((cur) => (cur?.message === msg ? null : cur));
      if (flashEl && flashEl.textContent === msg) flashEl.textContent = '';
    }, onUndo ? 5000 : 3500);
  }, []);

  const loadCards = useCallback(async () => {
    try {
      const data = await api.fetchCards({
        tag: selectedTag,
      });
      setCards(data);
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  }, [selectedTag, showToast]);

  const loadTags = useCallback(async () => {
    try {
      const data = await api.fetchTags();
      setTags(data);
      if (selectedTag && !data.some((t) => t.name === selectedTag)) {
        setSelectedTag('');
      }
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  }, [showToast, selectedTag]);

  const loadDigest = useCallback(async () => {
    try {
      const data = await api.fetchDigest();
      setDigest(data);
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  }, [showToast]);

  const reloadAll = useCallback(() => {
    loadCards();
    loadTags();
    if (viewMode === 'digest') loadDigest();
  }, [loadCards, loadTags, loadDigest, viewMode]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    loadTags();
  }, [loadTags]);

  useEffect(() => {
    api.getSetupStatus()
      .then((status) => {
        if (!status.is_configured) {
          setIsSetupNeeded(true);
        }
      })
      .catch(() => {});

    // Hydrate reduce-motion preference
    if (typeof window !== 'undefined') {
      const motion = localStorage.getItem('sparkkeep_reduce_motion');
      if (motion === 'reduced') {
        document.documentElement.setAttribute('data-reduce-motion', 'reduced');
      } else {
        document.documentElement.removeAttribute('data-reduce-motion');
      }
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'digest') {
      // oxlint-disable-next-line react/set-state-in-effect
      loadDigest();
    } else {
      // oxlint-disable-next-line react/set-state-in-effect
      loadCards();
    }
  }, [viewMode, loadCards, loadDigest]);

  // Periodic poll to keep UI in sync with Telegram actions and background research
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (viewMode === 'triage' || viewMode === 'boards') {
        loadCards();
      }
    }, 3500);
    return () => clearInterval(interval);
  }, [viewMode, loadCards]);

  // The share-sheet POST redirects back to here with ?captured=true: confirm
  // the capture and refresh so the new card is on screen. The query is scrubbed
  // so a reload does not toast (or refetch) a second time.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('captured') !== 'true') return;
    // oxlint-disable-next-line react/set-state-in-effect
    showToast('Captured new spark from Share Sheet!');
    window.history.replaceState({}, '', window.location.pathname);
    reloadAll();
  }, [showToast, reloadAll]);

  // Card status change with 5-second undo support
  const handleStatusChange = async (id: number, newStatus: string) => {
    const prevCard = cards.find((c) => c.id === id);
    const prevStatus = prevCard?.status;
    try {
      await api.updateCard(id, { status: newStatus as any });
      reloadAll();
      if (prevStatus && prevStatus !== newStatus) {
        showToast(`Moved card #${id} → ${newStatus}`, async () => {
          try {
            await api.updateCard(id, { status: prevStatus as any });
            reloadAll();
            showToast(`Reverted card #${id} back to ${prevStatus}`);
          } catch (err: unknown) {
            showToast(api.getErrorMessage(err));
          }
        });
      } else {
        showToast(`Updated card #${id} → ${newStatus}`);
      }
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  };

  // Trigger Research
  const handleResearch = async (id: number, playbookId?: number) => {
    try {
      const res = await api.triggerResearch(id, playbookId);
      const pbName = res.playbook?.name ? ` with "${res.playbook.name}"` : '';
      showToast(`Research queued for card #${id}${pbName}`);
      reloadAll();
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  };

  // Retry Card
  const handleRetry = async (id: number) => {
    try {
      await api.retryCard(id);
      showToast(`Retried extraction for card #${id}`);
      reloadAll();
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  };

  // Capture Spark (Telegram parity: URL or idea -> AI triage synthesis)
  const handleCaptureSpark = async (params: api.CaptureParams): Promise<number[] | null> => {
    try {
      const res = await api.captureSpark(params);
      const cardIds = res.card_ids || res.cards || [];
      reloadAll();
      if (cardIds.length > 0) {
        showToast(`✨ Spark captured & synthesized (${cardIds.length} card${cardIds.length > 1 ? 's' : ''})!`);
        try {
          const newCard = await api.fetchCard(cardIds[0]);
          setSelectedCard(newCard);
        } catch {
          // Ignore if immediate fetch fails
        }
      } else {
        showToast('Link recognized! (Already captured or merged into existing card)');
      }
      return cardIds;
    } catch (err: unknown) {
      const msg = api.getErrorMessage(err);
      showToast(msg);
      throw err;
    }
  };

  // Create Card (Manual fallback)
  const handleCreateCard = async (newCard: Partial<Card>) => {
    try {
      await api.createCard(newCard);
      showToast('Spark captured successfully!');
      reloadAll();
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  };

  // Update Card
  const handleUpdateCard = async (id: number, patch: Partial<Card>) => {
    try {
      await api.updateCard(id, patch);
      showToast(`Saved changes to card #${id}`);
      reloadAll();
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  };

  // Delete Card
  const handleDeleteCard = async (id: number) => {
    try {
      await api.deleteCard(id);
      showToast(`Deleted card #${id}`);
      setSelectedCard(null);
      reloadAll();
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  };

  // Unlock: exchange the typed token for the server's cookie, then reload.
  const handleUnlock = async (token: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/v1/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        return false;
      }
      localStorage.setItem(api.TOKEN_KEY, token);
      setIsAuthRequired(false);
      reloadAll();
      return true;
    } catch {
      return false;
    }
  };

  const triageCount = cards.filter(
    (c) => c.status === 'inbox' || c.status === 'researching' || c.status === 'review'
  ).length;

  if (isAuthRequired) {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  return (
    <CardActionsProvider
      value={{
        onSelectCard: setSelectedCard,
        onStatusChange: handleStatusChange,
        onResearch: handleResearch,
        onRetry: handleRetry,
        onUpdateCard: handleUpdateCard,
        onDeleteCard: handleDeleteCard,
        showToast,
      }}
    >
      <div className="app-container">
        <Header
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onOpenNewCard={() => setIsNewModalOpen(true)}
          flashMessage={toast?.message || ''}
          onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
          triageCount={triageCount}
          allCards={cards}
          tags={tags}
          onSelectCard={setSelectedCard}
          onSelectTag={(tag) => {
            setSelectedTag(tag);
            setViewMode('boards');
          }}
        />

      <div className={`main-layout ${viewMode === 'digest' ? 'no-sidebar' : ''} ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {viewMode !== 'digest' && (
          <Sidebar
            selectedTag={selectedTag}
            onTagSelect={setSelectedTag}
            tags={tags}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          />
        )}

        <main className="content-area">
          {viewMode === 'triage' && (
            <TriageView
              cards={cards}
              onUpdateCard={handleUpdateCard}
              onResearch={handleResearch}
              onRetry={handleRetry}
              onOpenCardDetail={setSelectedCard}
              onRefresh={reloadAll}
              showToast={showToast}
            />
          )}

          {viewMode === 'boards' && (
            <KanbanBoard
              cards={cards}
              horizon={horizon}
              onHorizonChange={setHorizon}
              onSelectCard={setSelectedCard}
              onUpdateCard={handleUpdateCard}
              onResearch={handleResearch}
              onRetry={handleRetry}
              showToast={showToast}
              onRefresh={reloadAll}
              onSwitchToTriage={() => setViewMode('triage')}
            />
          )}

          {viewMode === 'digest' && (
            <DigestView
              digest={digest}
              onSelectCard={setSelectedCard}
              onStatusChange={handleStatusChange}
              onResearch={handleResearch}
              onRetry={handleRetry}
              showToast={showToast}
              onRefresh={loadDigest}
            />
          )}
        </main>
      </div>

      {/* Card Detail Modal */}
      {selectedCard && (
        <Suspense fallback={null}>
          <CardModal
            key={selectedCard.id}
            card={selectedCard}
            allCards={cards}
            onSelectCard={setSelectedCard}
            onClose={() => setSelectedCard(null)}
            onUpdate={handleUpdateCard}
            onDelete={handleDeleteCard}
            onResearch={handleResearch}
            onRetry={handleRetry}
            showToast={showToast}
          />
        </Suspense>
      )}

      {/* New Card Modal */}
      {isNewModalOpen && (
        <Suspense fallback={null}>
          <NewCardModal
            onClose={() => setIsNewModalOpen(false)}
            onCapture={handleCaptureSpark}
            onCreate={handleCreateCard}
          />
        </Suspense>
      )}

      {/* First-Run Setup Wizard */}
      {isSetupNeeded && (
        <SetupWizard
          onComplete={() => {
            setIsSetupNeeded(false);
            reloadAll();
          }}
        />
      )}

      {isSettingsModalOpen && (
        <Suspense fallback={null}>
          <SettingsModal
            onClose={() => {
              setIsSettingsModalOpen(false);
              reloadAll();
            }}
            showToast={showToast}
          />
        </Suspense>
      )}

      {/* Floating Toast Notification with Undo */}
      {toast && (
        <div className="toast" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Bell size={14} strokeWidth={1.5} color="#818cf8" />
          <span style={{ flex: 1 }}>{toast.message}</span>
          {toast.onUndo && (
            <button
              type="button"
              className="toast-undo-btn"
              onClick={() => {
                const undoFn = toast.onUndo;
                setToast(null);
                undoFn?.();
              }}
              style={{
                background: 'rgba(99, 102, 241, 0.25)',
                border: '1px solid rgba(99, 102, 241, 0.5)',
                color: '#e0e7ff',
                borderRadius: 4,
                padding: '3px 8px',
                fontSize: 11.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
      </div>
    </CardActionsProvider>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;