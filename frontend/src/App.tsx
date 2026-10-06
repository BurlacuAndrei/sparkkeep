import React, { useState, useEffect, useCallback } from 'react';
import { Card, Tag, DigestData, LicenseStatus } from './types';
import * as api from './api';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { KanbanBoard } from './components/KanbanBoard';
import { TriageView } from './components/TriageView';
import { DigestView } from './components/DigestView';
import { CardModal } from './components/CardModal';
import { NewCardModal } from './components/NewCardModal';
import { SetupWizard } from './components/SetupWizard';
import { LicenseModal } from './components/LicenseModal';
import { Bell, Lock } from 'lucide-react';
import { CardActionsProvider } from './context/CardActionsContext';

export function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [digest, setDigest] = useState<DigestData | null>(null);

  // Filters & Navigation
  const [viewMode, setViewMode] = useState<'kanban' | 'triage' | 'digest'>('kanban');
  const [horizon, setHorizon] = useState('');
  const [status, setStatus] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [query, setQuery] = useState('');

  // Modals & Feedback
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Auth (SPARKKEEP_AUTH_TOKEN): a 401 anywhere raises the unlock modal.
  const [isAuthRequired, setIsAuthRequired] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [isSetupNeeded, setIsSetupNeeded] = useState(false);

  // License & Pro Features
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [isLicenseModalOpen, setIsLicenseModalOpen] = useState(false);

  const showToast = useCallback((msg: string) => {
    if (msg === 'unauthorized' || msg === 'HTTP 401') {
      setIsAuthRequired(true);
      return;
    }
    setToastMessage(msg);
    const flashEl = document.getElementById('flash');
    if (flashEl) flashEl.textContent = msg;
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
      if (flashEl && flashEl.textContent === msg) flashEl.textContent = '';
    }, 3500);
  }, []);

  const loadCards = useCallback(async () => {
    try {
      const data = await api.fetchCards({
        horizon,
        status,
        tag: selectedTag,
        q: query,
      });
      setCards(data);
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  }, [horizon, status, selectedTag, query, showToast]);

  const loadTags = useCallback(async () => {
    try {
      const data = await api.fetchTags();
      setTags(data);
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  }, [showToast]);

  const loadDigest = useCallback(async () => {
    try {
      const data = await api.fetchDigest();
      setDigest(data);
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  }, [showToast]);

  const loadLicense = useCallback(async () => {
    try {
      const res = await api.fetchLicenseStatus();
      setLicenseStatus(res.status);
    } catch {
      // ignore
    }
  }, []);

  const reloadAll = useCallback(() => {
    loadCards();
    loadTags();
    loadLicense();
    if (viewMode === 'digest') loadDigest();
  }, [loadCards, loadTags, loadLicense, loadDigest, viewMode]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    loadTags();
    loadLicense();
  }, [loadTags, loadLicense]);

  useEffect(() => {
    api.getSetupStatus()
      .then((status) => {
        if (!status.is_configured) {
          setIsSetupNeeded(true);
        }
      })
      .catch(() => {});
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

  // Card status change
  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await api.updateCard(id, { status: newStatus as any });
      showToast(`Updated card #${id} → ${newStatus}`);
      reloadAll();
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  };

  // Trigger Research
  const handleResearch = async (id: number) => {
    try {
      await api.triggerResearch(id);
      showToast(`Research queued for card #${id}`);
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

  // Create Card
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

  // Unlock: exchange the typed token for the server's cookie, then reload.
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput }),
      });
      if (!res.ok) {
        showToast('Invalid token');
        return;
      }
      localStorage.setItem(api.TOKEN_KEY, tokenInput);
      setTokenInput('');
      setIsAuthRequired(false);
      reloadAll();
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  };

  return (
    <CardActionsProvider
      value={{
        onSelectCard: setSelectedCard,
        onStatusChange: handleStatusChange,
        onResearch: handleResearch,
        onRetry: handleRetry,
        onUpdateCard: handleUpdateCard,
        showToast,
      }}
    >
      <div className="app-container">
        <Header
        query={query}
        onQueryChange={setQuery}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onOpenNewCard={() => setIsNewModalOpen(true)}
        onTriggerResearch={handleResearch}
        flashMessage={toastMessage || ''}
        isPro={licenseStatus?.tier === 'pro'}
        onOpenLicenseModal={() => setIsLicenseModalOpen(true)}
      />

      <div className="main-layout">
        <Sidebar
          horizon={horizon}
          onHorizonChange={setHorizon}
          status={status}
          onStatusChange={setStatus}
          selectedTag={selectedTag}
          onTagSelect={setSelectedTag}
          tags={tags}
        />

        <main className="content-area">
          {viewMode === 'triage' && (
            <TriageView
              cards={cards}
              onStatusChange={handleStatusChange}
              onResearch={handleResearch}
              onRetry={handleRetry}
              onOpenCardDetail={setSelectedCard}
              onRefresh={reloadAll}
            />
          )}

          {viewMode === 'kanban' && (
            <KanbanBoard
              cards={cards}
              onSelectCard={setSelectedCard}
              onStatusChange={handleStatusChange}
              onResearch={handleResearch}
              onRetry={handleRetry}
            />
          )}

          {viewMode === 'digest' && (
            <DigestView
              digest={digest}
              onSelectCard={setSelectedCard}
              onStatusChange={handleStatusChange}
              onResearch={handleResearch}
              onRetry={handleRetry}
            />
          )}
        </main>
      </div>

      {/* Card Detail Modal */}
      {selectedCard && (
        <CardModal
          key={selectedCard.id}
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onUpdate={handleUpdateCard}
          onResearch={handleResearch}
          onRetry={handleRetry}
          showToast={showToast}
        />
      )}

      {/* New Card Modal */}
      {isNewModalOpen && (
        <NewCardModal
          onClose={() => setIsNewModalOpen(false)}
          onCreate={handleCreateCard}
        />
      )}

      {/* Auth Required — the server answers 401 until a valid token arrives. */}
      {isAuthRequired && (
        <div className="modal-overlay">
          <form
            className="modal-content"
            style={{ maxWidth: 420 }}
            onSubmit={handleUnlock}
          >
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Lock size={18} strokeWidth={1.5} color="#818cf8" />
                <span>Authentication Required</span>
              </h2>
            </div>

            <p style={{ color: 'var(--text-dim)', margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
              This Sparkkeep instance is locked. Enter the access token
              (<code>SPARKKEEP_AUTH_TOKEN</code>) to continue.
            </p>

            <div className="form-group">
              <label>Access Token</label>
              <input
                name="auth_token"
                className="form-input"
                type="password"
                autoFocus
                placeholder="••••••••"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="submit" className="btn-primary" disabled={!tokenInput.trim()}>
                <Lock size={14} strokeWidth={1.5} />
                <span>Unlock Sparkkeep</span>
              </button>
            </div>
          </form>
        </div>
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

      {/* Sparkkeep Pro License & Features Modal */}
      <LicenseModal
        isOpen={isLicenseModalOpen}
        onClose={() => setIsLicenseModalOpen(false)}
        licenseStatus={licenseStatus}
        onLicenseUpdated={(newStatus) => setLicenseStatus(newStatus)}
        onToast={showToast}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="toast">
          <Bell size={14} strokeWidth={1.5} color="#818cf8" />
          <span>{toastMessage}</span>
        </div>
      )}
      </div>
    </CardActionsProvider>
  );
}

export default App;